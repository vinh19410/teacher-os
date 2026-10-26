import {
	type KernelEventRow,
	orgEventDraftSchema,
} from "@teacher-os/api/contracts";
import { orgEvent } from "@teacher-os/db/schema/org-event";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Db, KernelCtx } from "../app";

type Env = { Variables: { kernelCtx: KernelCtx } };
type EventContext = Context<Env>;

function toEventRow(row: typeof orgEvent.$inferSelect): KernelEventRow {
	return {
		id: row.id,
		title: row.title,
		date: row.date,
		startTime: row.startTime,
		endTime: row.endTime,
		note: row.note,
		createdByUserId: row.createdByUserId,
		createdAt: row.createdAt.toISOString(),
	};
}

/**
 * Sự kiện vận hành của org (TOS-14 / #447) — mounted dưới kernel tree nên
 * POST/DELETE đi qua Origin/JSON CSRF guard; kernelCtx chốt org scoping.
 * Sự kiện không đụng lesson/attendance/reminders (D4).
 */
export function eventRoutes(deps: { getDb(): Db }) {
	const routes = new Hono<Env>();

	routes.post("/", async (c: EventContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);

		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		const parsed = orgEventDraftSchema.safeParse(raw);
		if (!parsed.success) return c.json({ error: "invalid body" }, 400);

		const [created] = await deps
			.getDb()
			.insert(orgEvent)
			.values({
				id: crypto.randomUUID(),
				orgId: ctx.orgId,
				title: parsed.data.title,
				date: parsed.data.date,
				startTime: parsed.data.startTime,
				endTime: parsed.data.endTime,
				note: parsed.data.note,
				createdByUserId: ctx.userId,
			})
			.returning();
		if (!created) return c.json({ error: "insert failed" }, 500);
		return c.json(toEventRow(created), 201);
	});

	routes.delete("/:id", async (c: EventContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);

		const id = c.req.param("id");
		if (!id) return c.json({ error: "not found" }, 404);
		const deleted = await deps
			.getDb()
			.delete(orgEvent)
			.where(and(eq(orgEvent.id, id), eq(orgEvent.orgId, ctx.orgId)))
			.returning({ id: orgEvent.id });
		if (deleted.length === 0) return c.json({ error: "not found" }, 404);
		return c.json({ ok: true });
	});

	return routes;
}
