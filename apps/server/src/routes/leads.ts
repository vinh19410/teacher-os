import {
	LEAD_PAGE_SIZE,
	LEAD_STATUSES,
	type LeadListResponse,
	type LeadRow,
	leadPatchSchema,
	leadQuerySchema,
} from "@teacher-os/api/lead-contracts";
import { placementTeacherGradeSchema } from "@teacher-os/api/placement-test-contracts";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import { canAccessFinance } from "@teacher-os/auth/role";
import { lead } from "@teacher-os/db/schema/lead";
import { placementTestSubmission } from "@teacher-os/db/schema/placement-test";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Db, KernelCtx } from "../app";
import type { MediaStore } from "../lib/media-store";
import type { PlacementAiGrader } from "../lib/placement-ai/grader";
import {
	findLatestSubmissionForLead,
	getPlacementSubmissionDetailResponse,
	getPlacementSubmissionMediaResponse,
	gradePlacementSubmissionResponse,
	retryPlacementSubmissionAiResponse,
} from "../lib/placement-submission-service";

type Env = { Variables: { kernelCtx: KernelCtx } };
type LeadContext = Context<Env>;

export interface LeadRouteDeps {
	getDb(): Db;
	getMediaStore?(): MediaStore | undefined;
	/** #730: grader nháp AI placement (vắng → retry trả 503). */
	getPlacementAiGrader?(): PlacementAiGrader | undefined;
	runInBackground?(promise: Promise<unknown>): void;
	/** #730: gửi link kết quả cho học viên khi chốt (vắng → `skipped`). */
	mailer?: Mailer;
	/** #730: origin profile đầu tiên dựng link kết quả tuyệt đối. */
	leadOrigins?: string[];
	/** Origin portal học viên cho link chi tiết trong email kết quả. */
	studentOrigin?: string;
}

/**
 * API giáo viên cho lead (#506 phase 3, #524, #721) — mount TRONG kernelRoutes
 * (`kernel.route("/leads", …)`) để thừa hưởng Origin guard + session
 * bootstrap, và tự gắn role gate `canAccessFinance(ctx.role)`. Lead org khác ⇒ 404.
 * Response KHÔNG trả `ipHash` hay `uploadTokenHash`.
 */
export function leadRoutes(deps: LeadRouteDeps) {
	const routes = new Hono<Env>();

	routes.use("*", async (c, next) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		if (!canAccessFinance(ctx.role)) {
			return c.json({ error: "leads-forbidden", code: "leads-forbidden" }, 403);
		}
		return next();
	});

	/** Map row DB → LeadRow wire (timestamps ISO, bỏ ipHash). */
	function toLeadRow(
		row: typeof lead.$inferSelect,
		subMeta?: { status: "pending_grading" | "graded" },
	): LeadRow {
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
			hasPlacementSubmission: subMeta !== undefined,
			placementSubmissionStatus: subMeta ? subMeta.status : null,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
			statusChangedAt: row.statusChangedAt
				? row.statusChangedAt.toISOString()
				: null,
		};
	}

	async function loadOwnedLeadAndLatestSubmission(
		db: Db,
		orgId: string,
		leadId: string,
	) {
		const [leadRow] = await db
			.select()
			.from(lead)
			.where(and(eq(lead.id, leadId), eq(lead.orgId, orgId)))
			.limit(1);
		if (!leadRow) return null;

		const sub = await findLatestSubmissionForLead(db, orgId, leadRow.id);
		return { leadRow, sub };
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

		const trimmedQ = q?.trim() ?? "";
		const pattern = `%${trimmedQ.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
		const qWhere =
			trimmedQ.length > 0
				? sql`(
					lower(${lead.name}) LIKE ${pattern} ESCAPE '\\'
					OR ${lead.phone} LIKE ${pattern} ESCAPE '\\'
				)`
				: undefined;

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

		const subMetaByLeadId = new Map<
			string,
			{ status: "pending_grading" | "graded" }
		>();
		if (rows.length > 0) {
			const subRows = await db
				.select({
					leadId: placementTestSubmission.leadId,
					status: placementTestSubmission.status,
				})
				.from(placementTestSubmission)
				.where(
					and(
						eq(placementTestSubmission.orgId, ctx.orgId),
						inArray(
							placementTestSubmission.leadId,
							rows.map((r) => r.id),
						),
					),
				)
				.orderBy(
					desc(placementTestSubmission.submittedAt),
					desc(placementTestSubmission.id),
				);
			for (const sr of subRows) {
				if (sr.leadId && !subMetaByLeadId.has(sr.leadId)) {
					subMetaByLeadId.set(sr.leadId, { status: sr.status });
				}
			}
		}

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
			rows: rows.map((row) => toLeadRow(row, subMetaByLeadId.get(row.id))),
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

		let rawBody: unknown;
		try {
			rawBody = await c.req.raw.json();
		} catch {
			return c.json({ error: "invalid body" }, 400);
		}
		const parsedBody = leadPatchSchema.safeParse(rawBody);
		if (!parsedBody.success) return c.json({ error: "invalid body" }, 400);

		const db = deps.getDb();
		const leadId = c.req.param("id") ?? "";
		const [existing] = await db
			.select()
			.from(lead)
			.where(and(eq(lead.id, leadId), eq(lead.orgId, ctx.orgId)))
			.limit(1);
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

	routes.get("/:id/placement-submission", async (c: LeadContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);

		const leadId = c.req.param("id") ?? "";
		const db = deps.getDb();
		const loaded = await loadOwnedLeadAndLatestSubmission(
			db,
			ctx.orgId,
			leadId,
		);
		if (!loaded) {
			return c.json({ error: "LEAD_NOT_FOUND", code: "LEAD_NOT_FOUND" }, 404);
		}
		if (!loaded.sub) {
			return c.json(
				{
					error: "PLACEMENT_SUBMISSION_NOT_FOUND",
					code: "PLACEMENT_SUBMISSION_NOT_FOUND",
				},
				404,
			);
		}

		return getPlacementSubmissionDetailResponse(
			c,
			deps,
			{ kind: "lead", row: loaded.leadRow },
			loaded.sub,
		);
	});

	/**
	 * #730: chấm (lại) nháp AI — khi `none|failed|drafted` và bài có việc để
	 * chấm; CAS về `processing` rồi chạy nền. Đang chạy / không có gì để chấm
	 * / kết quả đã chốt (không đổi thứ học viên đã nhận) → 409.
	 */
	routes.post("/:id/placement-submission/ai-retry", async (c: LeadContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);

		const db = deps.getDb();
		const loaded = await loadOwnedLeadAndLatestSubmission(
			db,
			ctx.orgId,
			c.req.param("id") ?? "",
		);
		if (!loaded) {
			return c.json({ error: "LEAD_NOT_FOUND", code: "LEAD_NOT_FOUND" }, 404);
		}
		if (!loaded.sub) {
			return c.json(
				{
					error: "PLACEMENT_SUBMISSION_NOT_FOUND",
					code: "PLACEMENT_SUBMISSION_NOT_FOUND",
				},
				404,
			);
		}

		return retryPlacementSubmissionAiResponse(
			c,
			deps,
			{ kind: "lead", row: loaded.leadRow },
			loaded.sub,
		);
	});

	routes.get("/:id/placement-submission/media", async (c: LeadContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);

		const leadId = c.req.param("id") ?? "";
		const loaded = await loadOwnedLeadAndLatestSubmission(
			deps.getDb(),
			ctx.orgId,
			leadId,
		);
		if (!loaded) {
			return c.json({ error: "LEAD_NOT_FOUND", code: "LEAD_NOT_FOUND" }, 404);
		}
		if (!loaded.sub) {
			return c.json({ error: "not found" }, 404);
		}

		return getPlacementSubmissionMediaResponse(c, deps, loaded.sub);
	});

	routes.patch("/:id/placement-submission", async (c: LeadContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);

		let rawBody: unknown;
		try {
			rawBody = await c.req.raw.json();
		} catch {
			return c.json({ error: "invalid body" }, 400);
		}
		const parsedBody = placementTeacherGradeSchema.safeParse(rawBody);
		if (!parsedBody.success) {
			return c.json({ error: "invalid body" }, 400);
		}

		const db = deps.getDb();
		const leadId = c.req.param("id") ?? "";
		const loaded = await loadOwnedLeadAndLatestSubmission(
			db,
			ctx.orgId,
			leadId,
		);
		if (!loaded) {
			return c.json({ error: "LEAD_NOT_FOUND", code: "LEAD_NOT_FOUND" }, 404);
		}
		if (!loaded.sub) {
			return c.json(
				{
					error: "PLACEMENT_SUBMISSION_NOT_FOUND",
					code: "PLACEMENT_SUBMISSION_NOT_FOUND",
				},
				404,
			);
		}

		return gradePlacementSubmissionResponse(
			c,
			deps,
			ctx,
			{ kind: "lead", row: loaded.leadRow },
			loaded.sub,
			parsedBody.data,
		);
	});

	return routes;
}
