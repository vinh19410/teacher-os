import {
	LEAD_PAGE_SIZE,
	LEAD_STATUSES,
	type LeadListResponse,
	type LeadRow,
	leadPatchSchema,
	leadQuerySchema,
} from "@teacher-os/api/lead-contracts";
import { lead } from "@teacher-os/db/schema/lead";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Db, KernelCtx } from "../app";

type Env = { Variables: { kernelCtx: KernelCtx } };
type LeadContext = Context<Env>;

/**
 * API giáo viên cho lead (#506 phase 3) — mount TRONG kernelRoutes
 * (`kernel.route("/leads", …)` cạnh /notification-logs) để thừa hưởng
 * Origin guard + role gate teacher; lead org khác ⇒ 404 (không lộ tồn tại).
 *
 * Response KHÔNG trả `ipHash` (vết chống spam là nội bộ).
 */
export function leadRoutes(deps: { getDb(): Db }) {
	const routes = new Hono<Env>();

	/** Map row DB → LeadRow wire (timestamps ISO, bỏ ipHash). */
	function toLeadRow(row: typeof lead.$inferSelect): LeadRow {
		return {
			id: row.id,
			name: row.name,
			phone: row.phone,
			email: row.email,
			birthDate: row.birthDate,
			course: row.course,
			studyMode: row.studyMode,
			studyDays: row.studyDays,
			timeSlot: row.timeSlot,
			note: row.note,
			placement: row.placement,
			teacherNote: row.teacherNote,
			source: row.source,
			status: row.status,
			submitCount: row.submitCount,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
			statusChangedAt: row.statusChangedAt
				? row.statusChangedAt.toISOString()
				: null,
		};
	}

	routes.get("/", async (c: LeadContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);

		const parsed = leadQuerySchema.safeParse({
			q: c.req.query("q") || undefined,
			status: c.req.query("status") || undefined,
			page: c.req.query("page") || undefined,
		});
		if (!parsed.success) return c.json({ error: "invalid query" }, 400);
		const { q, status } = parsed.data;
		const page = parsed.data.page ?? 1;

		const db = deps.getDb();
		const orgWhere = eq(lead.orgId, ctx.orgId);

		// `q`: lower(name) LIKE hoặc phone LIKE — escape % _ \ (mẫu
		// buildNotificationQFilter #454). Phone giữ nguyên case (số).
		const trimmedQ = q?.trim() ?? "";
		const pattern = `%${trimmedQ.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
		const qWhere =
			trimmedQ.length > 0
				? sql`(
					lower(${lead.name}) LIKE ${pattern} ESCAPE '\\'
					OR ${lead.phone} LIKE ${pattern} ESCAPE '\\'
				)`
				: undefined;

		// counts (chip trạng thái): tính trên q, KHÔNG áp status — 1 query
		// GROUP BY (tránh N+1), kèm tổng "all".
		const countWhere = and(orgWhere, qWhere);
		const rowWhere = and(
			countWhere,
			status ? eq(lead.status, status) : undefined,
		);

		const [rows, totalRows, statusGroups] = await Promise.all([
			db
				.select()
				.from(lead)
				.where(rowWhere)
				.orderBy(desc(lead.createdAt), desc(lead.id))
				.limit(LEAD_PAGE_SIZE)
				.offset((page - 1) * LEAD_PAGE_SIZE),
			db.select({ total: count() }).from(lead).where(rowWhere),
			db
				.select({ status: lead.status, n: count() })
				.from(lead)
				.where(countWhere)
				.groupBy(lead.status),
		]);

		const total = totalRows[0]?.total ?? 0;
		const counts: Record<(typeof LEAD_STATUSES)[number] | "all", number> = {
			new: 0,
			contacted: 0,
			enrolled: 0,
			dropped: 0,
			all: 0,
		};
		let all = 0;
		for (const group of statusGroups) {
			if ((LEAD_STATUSES as readonly string[]).includes(group.status)) {
				counts[group.status] = group.n;
				all += group.n;
			}
		}
		counts.all = all;

		const response: LeadListResponse = {
			rows: rows.map(toLeadRow),
			total,
			page,
			pageSize: LEAD_PAGE_SIZE,
			counts,
		};
		c.header("Cache-Control", "no-store");
		return c.json(response);
	});

	routes.patch("/:id", async (c: LeadContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);

		const parsedBody = leadPatchSchema.safeParse(await c.req.raw.json());
		if (!parsedBody.success) return c.json({ error: "invalid body" }, 400);

		const db = deps.getDb();
		// param() trả string | undefined trên Context generic — rỗng ⇒ không
		// match ⇒ 404 (cùng semantics).
		const leadId = c.req.param("id") ?? "";
		const [existing] = await db
			.select()
			.from(lead)
			.where(and(eq(lead.id, leadId), eq(lead.orgId, ctx.orgId)))
			.limit(1);
		// Org khác / không tồn tại — cùng 404, không lộ tồn tại (IDOR).
		if (!existing) {
			return c.json({ error: "LEAD_NOT_FOUND", code: "LEAD_NOT_FOUND" }, 404);
		}

		const statusChanged = parsedBody.data.status !== existing.status;
		const [updated] = await db
			.update(lead)
			.set({
				status: parsedBody.data.status,
				teacherNote: parsedBody.data.teacherNote ?? existing.teacherNote,
				statusChangedAt: statusChanged ? new Date() : existing.statusChangedAt,
				updatedAt: new Date(),
			})
			.where(and(eq(lead.id, existing.id), eq(lead.orgId, ctx.orgId)))
			.returning();

		if (!updated) {
			return c.json({ error: "LEAD_NOT_FOUND", code: "LEAD_NOT_FOUND" }, 404);
		}
		return c.json(toLeadRow(updated));
	});

	return routes;
}
