import type { CreatedResponse } from "@teacher-os/api/contracts";
import {
	assignmentGradeSchema,
	assignmentPromptCreateSchema,
} from "@teacher-os/api/contracts";
import { assignment } from "@teacher-os/db/schema/assignment";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
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
 * The one create endpoint is POST /prompts — the assignment-prompt bank
 * (#202); the `assignment` table itself remains grading-only, server-fed.
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

	// Assignment-prompt bank (#202): a prompt is org-scoped and bound to no
	// student/class, so org scope is the whole tenancy check — no relation
	// verification needed (unlike the report POST's student join).
	routes.post("/prompts", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, assignmentPromptCreateSchema);
		if (!body.ok) return body.response;
		const [created] = await deps
			.getDb()
			.insert(assignmentPrompt)
			.values({
				id: crypto.randomUUID(),
				orgId: ctx.orgId,
				task: body.data.skill === "writing" ? body.data.part : "task2",
				genre: body.data.skill === "writing" ? body.data.type : "",
				skill: body.data.skill,
				part: body.data.part,
				type: body.data.type,
				title: body.data.title,
				band: body.data.band,
				source: body.data.source,
				prompt: body.data.prompt,
				intro: body.data.intro,
				passage: body.data.passage,
				transcript: body.data.transcript,
				cueTopic: body.data.cueTopic,
				cuePoints: body.data.cuePoints,
				audioName: body.data.audioName,
				imageUrl: body.data.imageUrl,
				questions: JSON.stringify(body.data.questions),
				// Phase-02 FR7: explicit map — a missing entry here silently drops
				// the field (data saves but never round-trips).
				optionBank: JSON.stringify(body.data.optionBank),
				note: body.data.note,
				status: body.data.status,
			})
			.returning({ id: assignmentPrompt.id });
		if (!created) return c.json({ error: "prompt write conflict" }, 500);
		return c.json<CreatedResponse>(created, 201);
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
