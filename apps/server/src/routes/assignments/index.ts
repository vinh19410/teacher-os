import type { CreatedResponse } from "@teacher-os/api/contracts";
import { assignmentGradeSchema } from "@teacher-os/api/contracts";
import { assignment } from "@teacher-os/db/schema/assignment";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../../app";
import { loadSnapshot } from "../snapshot";

type Env = { Variables: { kernelCtx: KernelCtx } };
type AssignmentContext = Context<Env>;

/**
 * Wave 6 assignments router. Mounted INSIDE kernelRoutes via
 * kernel.route() so the kernel router's Origin + JSON content-type
 * CSRF guard covers these routes too — never mount this standalone.
 * No create endpoint by design; rows arrive via server-side flows only.
 */
export function assignmentRoutes(deps: { getDb(): Db }) {
	const routes = new Hono<Env>();

	function unauthorized(c: AssignmentContext) {
		return c.json({ error: "unauthorized" }, 401);
	}

	async function readBody<S extends z.ZodType>(
		c: AssignmentContext,
		schema: S,
	): Promise<
		{ ok: true; data: z.infer<S> } | { ok: false; response: Response }
	> {
		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return { ok: false, response: c.json({ error: "invalid json" }, 400) };
		}
		const parsed = schema.safeParse(raw);
		if (!parsed.success) {
			return { ok: false, response: c.json({ error: "invalid body" }, 400) };
		}
		return { ok: true, data: parsed.data };
	}

	routes.get("/", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const snapshot = await loadSnapshot(deps.getDb(), ctx.orgId);
		return c.json(snapshot.assignments);
	});

	// One org-scoped UPDATE sets scores AND status together — the reload
	// contract ("giữ scores + status graded") lives or dies on this pair.
	// Responds { id } so the command bus's undefined-id failure signal works.
	routes.post("/:id/grade", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, assignmentGradeSchema);
		if (!body.ok) return body.response;
		const assignmentId = c.req.param("id");

		const updated = await deps
			.getDb()
			.update(assignment)
			.set({ scores: body.data.scores, status: "graded" })
			.where(
				and(eq(assignment.id, assignmentId), eq(assignment.orgId, ctx.orgId)),
			)
			.returning({ id: assignment.id });

		if (!updated[0]) {
			return c.json({ error: "assignment not found" }, 404);
		}
		return c.json({ id: assignmentId } satisfies CreatedResponse);
	});

	return routes;
}
