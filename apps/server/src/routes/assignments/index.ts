import type { CreatedResponse } from "@teacher-os/api/contracts";
import {
	ASSIGNMENT_ANSWER_CHOICES,
	ASSIGNMENT_PART_TYPES,
	type AssignmentSkill,
	answerKindByType,
	assignmentGradeSchema,
	assignmentPromptCreateSchema,
	assignmentPromptUpdateSchema,
} from "@teacher-os/api/contracts";
import { assignment } from "@teacher-os/db/schema/assignment";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../../app";
import {
	emitNotifications,
	notificationDepsFrom,
} from "../../lib/notifications/emit";
import { gradeReturnedEvent } from "../../lib/notifications/templates";
import { loadSnapshot } from "../snapshot";
import { testsRoutes } from "./tests";

type Env = { Variables: { kernelCtx: KernelCtx } };
type AssignmentContext = Context<Env>;

/**
 * Wave 6 assignments router. Mounted INSIDE kernelRoutes via
 * kernel.route() so the kernel router's Origin + JSON content-type
 * CSRF guard covers these routes too — never mount this standalone.
 * Writes: assignment-prompt bank (#202, POST /prompts + PATCH /prompts/:id
 * cho nút Apply phase-5) và full-test builder CRUD ở ./tests (route con
 * "/tests"). Bảng `assignment` remains grading-only, server-fed.
 */
export function assignmentRoutes(deps: {
	getDb(): Db;
	/** #454 phase 3: phát grade_returned sau khi chấm thành công. */
	mailer?: Parameters<typeof emitNotifications>[0]["mailer"];
	runInBackground?: Parameters<typeof emitNotifications>[0]["runInBackground"];
	/** #454: origin cổng học viên cho link tuyệt đối trong thư (notificationDepsFrom). */
	studentOrigin?: Parameters<typeof emitNotifications>[0]["studentOrigin"];
}) {
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
			.returning({
				id: assignment.id,
				studentId: assignment.studentId,
				title: assignment.title,
			});

		if (!updated[0]) {
			return c.json({ error: "assignment not found" }, 404);
		}
		// #454 phase 3: row `assignment` là điểm per-học viên (không có
		// attempt) — khóa canonical là chính row id, 1 thông báo mỗi lần chấm
		// thành công, fail-open như các route khác.
		await emitNotifications(notificationDepsFrom(deps), ctx.orgId, [
			gradeReturnedEvent({
				attemptId: updated[0].id,
				studentId: updated[0].studentId,
				title: updated[0].title,
				linkPath: "/assignments",
			}),
		]);
		return c.json({ id: assignmentId } satisfies CreatedResponse);
	});

	// Full-test builder phase-2: PATCH prompt (nguyên liệu nút Apply phase-5)
	// — partial update; skill/part immutable nên legacy `task` KHÔNG ghi lại,
	// `genre` re-derive theo rule create khi `type` đổi (writing) để
	// round-trip không lệch field.
	routes.patch("/prompts/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, assignmentPromptUpdateSchema);
		if (!body.ok) return body.response;
		const promptId = c.req.param("id");
		const db = deps.getDb();
		const [row] = await db
			.select({
				skill: assignmentPrompt.skill,
				part: assignmentPrompt.part,
				type: assignmentPrompt.type,
			})
			.from(assignmentPrompt)
			.where(
				and(
					eq(assignmentPrompt.id, promptId),
					eq(assignmentPrompt.orgId, ctx.orgId),
				),
			);
		if (!row) return c.json({ error: "prompt not found" }, 404);

		// Rule phụ thuộc skill/part của ROW (contract không có context):
		// type membership + questions chỉ hợp cho reading/listening.
		const partTypes =
			ASSIGNMENT_PART_TYPES[row.skill as AssignmentSkill]?.types[row.part] ??
			[];
		if (body.data.type !== undefined && !partTypes.includes(body.data.type)) {
			return c.json({ error: "invalid type" }, 400);
		}
		// Per-question type (#286) — mirror rule của create: type câu phải thuộc
		// catalog part; answer-choice theo type HIỆU DỤNG (type câu ?? type
		// payload ?? type row) thay vì chỉ type prompt.
		if (body.data.questions !== undefined) {
			const effectivePromptType = body.data.type ?? row.type;
			for (const [index, question] of body.data.questions.entries()) {
				if (question.type && !partTypes.includes(question.type))
					return c.json(
						{ error: "invalid question type", question: index },
						400,
					);
				const kind =
					answerKindByType[question.type ?? effectivePromptType] ?? null;
				if (kind) {
					const choices = ASSIGNMENT_ANSWER_CHOICES[kind];
					if (question.answer && !choices.includes(question.answer as never)) {
						return c.json(
							{ error: "invalid answer choice", question: index },
							400,
						);
					}
				}
			}
		}
		if (
			body.data.questions?.length &&
			row.skill !== "reading" &&
			row.skill !== "listening"
		)
			return c.json(
				{ error: "questions only apply to reading or listening" },
				400,
			);

		// Explicit map — a missing entry here silently drops the field.
		const updates: Partial<typeof assignmentPrompt.$inferInsert> = {};
		if (body.data.type !== undefined) updates.type = body.data.type;
		if (body.data.title !== undefined) updates.title = body.data.title;
		if (body.data.band !== undefined) updates.band = body.data.band;
		if (body.data.source !== undefined) updates.source = body.data.source;
		if (body.data.prompt !== undefined) updates.prompt = body.data.prompt;
		if (body.data.intro !== undefined) updates.intro = body.data.intro;
		if (body.data.passage !== undefined) updates.passage = body.data.passage;
		if (body.data.transcript !== undefined)
			updates.transcript = body.data.transcript;
		if (body.data.cueTopic !== undefined) updates.cueTopic = body.data.cueTopic;
		if (body.data.cuePoints !== undefined)
			updates.cuePoints = body.data.cuePoints;
		if (body.data.audioName !== undefined)
			updates.audioName = body.data.audioName;
		if (body.data.imageUrl !== undefined) updates.imageUrl = body.data.imageUrl;
		if (body.data.note !== undefined) updates.note = body.data.note;
		if (body.data.status !== undefined) updates.status = body.data.status;
		if (body.data.questions !== undefined)
			updates.questions = JSON.stringify(body.data.questions);
		if (body.data.optionBank !== undefined)
			updates.optionBank = JSON.stringify(body.data.optionBank);
		if (body.data.type !== undefined)
			updates.genre = row.skill === "writing" ? body.data.type : "";

		if (Object.keys(updates).length === 0)
			return c.json({ id: promptId } satisfies CreatedResponse);
		const updated = await db
			.update(assignmentPrompt)
			.set(updates)
			.where(
				and(
					eq(assignmentPrompt.id, promptId),
					eq(assignmentPrompt.orgId, ctx.orgId),
				),
			)
			.returning({ id: assignmentPrompt.id });
		if (!updated[0]) return c.json({ error: "prompt not found" }, 404);
		return c.json({ id: promptId } satisfies CreatedResponse);
	});

	// Full-test builder CRUD — mount con để tự nằm trong kernel mount
	// (kernel.ts "/assignments"), không thêm gì vào kernel.ts.
	routes.route("/tests", testsRoutes(deps));

	return routes;
}
