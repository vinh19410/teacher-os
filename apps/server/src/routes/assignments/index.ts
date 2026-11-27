import type { CreatedResponse } from "@teacher-os/api/contracts";
import {
	assignmentGradeSchema,
	assignmentPromptCreateSchema,
	assignmentPromptUpdateSchema,
} from "@teacher-os/api/contracts";
import { canPublishGrade } from "@teacher-os/auth/role";
import { assignment } from "@teacher-os/db/schema/assignment";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { z } from "zod";
import type { Db, KernelCtx } from "../../app";
import {
	createAssignmentPrompt,
	deleteAssignmentPrompt,
	updateAssignmentPrompt,
} from "../../lib/assignments/assignment-service";
import type { MediaStore } from "../../lib/media-store";
import {
	emitNotifications,
	notificationDepsFrom,
} from "../../lib/notifications/emit";
import { gradeReturnedEvent } from "../../lib/notifications/templates";
import { serveStudyPackAudio } from "../../lib/study-pack-audio";
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
	/** #463: khoảng chờ giữa các lượt retry email thông báo (test/E2E truyền [0, 0]). */
	notificationRetryDelaysMs?: number[];
	/** #702: injectable fetch cho audio proxy của listening study-pack prompts. */
	fetchExternalAudio?: typeof fetch;
	getLibraryAudioStore?(): MediaStore | undefined;
}) {
	const routes = new Hono<Env>();
	routes.use("*", async (c, next) => {
		if (c.req.method === "POST" || c.req.method === "PATCH") {
			return bodyLimit({ maxSize: 256 * 1024 })(c, next);
		}
		return next();
	});

	function unauthorized(c: AssignmentContext) {
		return c.json({ error: "unauthorized" }, 401);
	}

	async function readBody<S extends z.ZodType>(
		c: AssignmentContext,
		schema: S,
	): Promise<
		{ ok: true; data: z.infer<S> } | { ok: false; response: Response }
	> {
		const contentType = c.req.header("Content-Type") ?? "";
		if (!contentType.toLowerCase().startsWith("application/json")) {
			return {
				ok: false,
				response: c.json(
					{ error: "content-type must be application/json" },
					415,
				),
			};
		}
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
		const result = await createAssignmentPrompt(
			deps.getDb(),
			ctx.orgId,
			body.data,
		);
		if (!result.ok) {
			return c.json({ error: result.error }, result.status);
		}
		return c.json<CreatedResponse>(result.data, 201);
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
		const result = await updateAssignmentPrompt(
			deps.getDb(),
			ctx.orgId,
			promptId,
			body.data,
		);
		if (!result.ok) {
			return c.json(
				{
					error: result.error,
					...(result.code ? { code: result.code } : {}),
					...(result.question !== undefined
						? { question: result.question }
						: {}),
				},
				result.status,
			);
		}
		return c.json(result.data satisfies CreatedResponse);
	});

	routes.delete("/prompts/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		if (ctx.role !== undefined && !canPublishGrade(ctx.role)) {
			return c.json({ error: "forbidden", code: "FORBIDDEN" }, 403);
		}
		const promptId = c.req.param("id");
		const result = await deleteAssignmentPrompt(
			deps.getDb(),
			ctx.orgId,
			promptId,
		);
		if (!result.ok) {
			return c.json(
				{
					error: result.error,
					...(result.code ? { code: result.code } : {}),
				},
				result.status,
			);
		}
		return c.json(result.data satisfies CreatedResponse);
	});

	routes.get("/prompts/:id/audio", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const promptId = c.req.param("id");
		const [row] = await deps
			.getDb()
			.select({
				audioUrl: assignmentPrompt.audioUrl,
				audioKey: assignmentPrompt.audioKey,
				audioName: assignmentPrompt.audioName,
			})
			.from(assignmentPrompt)
			.where(
				and(
					eq(assignmentPrompt.id, promptId),
					eq(assignmentPrompt.orgId, ctx.orgId),
				),
			)
			.limit(1);
		if (!row || (!row.audioUrl && !row.audioKey)) {
			return c.json({ error: "audio not found" }, 404);
		}
		return serveStudyPackAudio({
			audioKey: row.audioKey,
			audioUrl: row.audioUrl,
			audioName: row.audioName,
			getLibraryAudioStore: deps.getLibraryAudioStore,
			fetchExternalAudio: deps.fetchExternalAudio,
		});
	});

	// Full-test builder CRUD — mount con để tự nằm trong kernel mount
	// (kernel.ts "/assignments"), không thêm gì vào kernel.ts.
	routes.route("/tests", testsRoutes(deps));

	return routes;
}
