import type { CreatedResponse } from "@teacher-os/api/contracts";
import {
	ASSIGNMENT_ANSWER_CHOICES,
	ASSIGNMENT_PART_TYPES,
	ASSIGNMENT_PROMPT_ERROR_CODES,
	type AssignmentSkill,
	answerKindByType,
	assignmentGradeSchema,
	assignmentPromptCreateSchema,
	assignmentPromptUpdateSchema,
	assignmentQuestionSchema,
} from "@teacher-os/api/contracts";
import { isAutoGradableSkill } from "@teacher-os/api/lib/ielts-band";
import { assignment } from "@teacher-os/db/schema/assignment";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import {
	assignmentTest,
	assignmentTestPart,
} from "@teacher-os/db/schema/assignment-test";
import { classAssignment } from "@teacher-os/db/schema/class-assignment";
import { quizAttempt } from "@teacher-os/db/schema/quiz-attempt";
import { studyPack, studyPackItem } from "@teacher-os/db/schema/study-pack";
import { and, eq, or } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Db, KernelCtx } from "../../app";
import {
	emitNotifications,
	notificationDepsFrom,
} from "../../lib/notifications/emit";
import { gradeReturnedEvent } from "../../lib/notifications/templates";
import { loadSnapshot } from "../snapshot";
import { parseQuizOptionBank } from "../student";
import { testsRoutes } from "./tests";

type Env = { Variables: { kernelCtx: KernelCtx } };
type AssignmentContext = Context<Env>;

/** Chuẩn hoá questions cho so sánh khoá nội dung (#630) — schema bất biến,
 * không dựng lại mỗi request. */
const promptQuestionsSchema = z.array(assignmentQuestionSchema);

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
				writingPart: body.data.writing?.part ?? null,
				writingType: body.data.writing?.type ?? null,
				writingPrompt: body.data.writing?.prompt ?? "",
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
		// #630 phase-1: nạp đủ cột nội dung bị khoá để so sánh payload-vs-row
		// (đề có attempt chỉ được sửa metadata, nên phải biết "đổi hay chưa").
		const [row] = await db
			.select({
				skill: assignmentPrompt.skill,
				part: assignmentPrompt.part,
				type: assignmentPrompt.type,
				genre: assignmentPrompt.genre,
				status: assignmentPrompt.status,
				prompt: assignmentPrompt.prompt,
				intro: assignmentPrompt.intro,
				passage: assignmentPrompt.passage,
				transcript: assignmentPrompt.transcript,
				cueTopic: assignmentPrompt.cueTopic,
				cuePoints: assignmentPrompt.cuePoints,
				audioName: assignmentPrompt.audioName,
				imageUrl: assignmentPrompt.imageUrl,
				note: assignmentPrompt.note,
				questions: assignmentPrompt.questions,
				optionBank: assignmentPrompt.optionBank,
				writingPart: assignmentPrompt.writingPart,
				writingType: assignmentPrompt.writingType,
				writingPrompt: assignmentPrompt.writingPrompt,
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
		const effectiveStatus = body.data.status ?? row.status;
		const effectiveType =
			body.data.type !== undefined ? body.data.type : row.type;
		if (effectiveStatus === "ready") {
			if (!effectiveType || !partTypes.includes(effectiveType)) {
				return c.json({ error: "invalid type" }, 400);
			}
		} else if (row.skill === "writing") {
			if (effectiveType && !partTypes.includes(effectiveType)) {
				return c.json({ error: "invalid type" }, 400);
			}
		} else if (!effectiveType || !partTypes.includes(effectiveType)) {
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
			row.skill !== "listening" &&
			row.skill !== "grammar" &&
			row.skill !== "vocabulary"
		)
			return c.json(
				{ error: "questions only apply to reading or listening" },
				400,
			);

		// #630 phase-1: cờ hoisted lên đây — content-lock bên dưới cần biết
		// payload có thay đổi phần Writing không để khoá nội dung.
		let writingChanged = false;
		if (body.data.writing !== undefined) {
			if (body.data.writing !== null && !isAutoGradableSkill(row.skill)) {
				return c.json(
					{ error: "writing section only applies to auto-graded skills" },
					400,
				);
			}
			const nextW = body.data.writing;
			const curW = row.writingPart
				? {
						part: row.writingPart,
						type: row.writingType ?? "",
						prompt: row.writingPrompt ?? "",
					}
				: null;
			writingChanged =
				nextW === null || curW === null
					? nextW !== curW
					: nextW.part.trim() !== curW.part.trim() ||
						nextW.type.trim() !== curW.type.trim() ||
						nextW.prompt.trim() !== curW.prompt.trim();
			if (writingChanged) {
				const [assigned, inTest, inPack] = await Promise.all([
					db
						.select({ id: classAssignment.id })
						.from(classAssignment)
						.where(
							and(
								eq(classAssignment.promptId, promptId),
								eq(classAssignment.orgId, ctx.orgId),
							),
						)
						.limit(1),
					nextW !== null
						? db
								.select({ id: assignmentTestPart.id })
								.from(assignmentTestPart)
								.innerJoin(
									assignmentTest,
									and(
										eq(assignmentTest.id, assignmentTestPart.testId),
										eq(assignmentTest.orgId, ctx.orgId),
									),
								)
								.where(eq(assignmentTestPart.promptId, promptId))
								.limit(1)
						: Promise.resolve([]),
					nextW !== null
						? db
								.select({ id: studyPackItem.id })
								.from(studyPackItem)
								.innerJoin(
									studyPack,
									and(
										eq(studyPack.id, studyPackItem.packId),
										eq(studyPack.orgId, ctx.orgId),
									),
								)
								.where(
									and(
										eq(studyPackItem.sourceKind, "org_prompt"),
										eq(studyPackItem.sourceId, promptId),
									),
								)
								.limit(1)
						: Promise.resolve([]),
				]);
				if (assigned.length > 0 || inTest.length > 0 || inPack.length > 0) {
					return c.json(
						{
							error: "writing section locked",
							code: ASSIGNMENT_PROMPT_ERROR_CODES.WRITING_SECTION_LOCKED,
						},
						409,
					);
				}
			}
		}

		// #630 phase-1 — khoá nội dung đề đã có lượt làm bài. Đề có quiz_attempt
		// (trên lớp hoặc tự luyện) chỉ được sửa metadata (title/band/source/
		// status); mọi field content phải y nguyên value mới qua. So sánh sau
		// trim 2 phía để save-lại-kèm-whitespace không tính là đổi; khi không
		// đổi thì KHÔNG ghi field đó — đề trong DB không bị rewrite bản
		// normalized (questions/optionBank) chỉ vì giáo viên bấm lưu.
		let contentChanged = writingChanged;
		for (const [stored, incoming] of [
			[row.type, body.data.type],
			[row.prompt, body.data.prompt],
			[row.intro, body.data.intro],
			[row.passage, body.data.passage],
			[row.transcript, body.data.transcript],
			[row.cueTopic, body.data.cueTopic],
			[row.cuePoints, body.data.cuePoints],
			[row.audioName, body.data.audioName],
			[row.imageUrl, body.data.imageUrl],
			[row.note, body.data.note],
		] as const) {
			if (
				incoming !== undefined &&
				(incoming ?? "").trim() !== (stored ?? "").trim()
			) {
				contentChanged = true;
				break;
			}
		}
		if (!contentChanged && body.data.questions !== undefined) {
			// 2 phía chuẩn hoá qua cùng schema (corrupt/legacy stored → dùng raw)
			// rồi so JSON — đổi thứ tự key/giá trị mặc định không tính là đổi.
			const normalizeQuestions = (value: unknown) => {
				const parsed = promptQuestionsSchema.safeParse(value);
				return JSON.stringify(parsed.success ? parsed.data : value);
			};
			let storedQuestions: unknown;
			try {
				storedQuestions = row.questions ? JSON.parse(row.questions) : [];
			} catch {
				storedQuestions = [];
			}
			contentChanged =
				normalizeQuestions(storedQuestions) !==
				normalizeQuestions(body.data.questions);
		}
		if (!contentChanged && body.data.optionBank !== undefined) {
			// parseQuizOptionBank là guard đọc phía student (corrupt → []); trim
			// từng mục 2 phía để payload whitespace-only không tính là đổi.
			contentChanged =
				JSON.stringify(
					parseQuizOptionBank(row.optionBank).map((item) => item.trim()),
				) !== JSON.stringify(body.data.optionBank.map((item) => item.trim()));
		}
		if (contentChanged) {
			// Org-scoped: attempt của org khác trùng prompt id không khoá đề này.
			// Attempt gắn lượt giao (class_assignment.prompt_id) hoặc đề tự luyện
			// (quiz_attempt.test_id → assignment_test_part.prompt_id).
			const [attempt] = await db
				.select({ id: quizAttempt.id })
				.from(quizAttempt)
				.leftJoin(
					classAssignment,
					eq(quizAttempt.assignmentId, classAssignment.id),
				)
				.leftJoin(assignmentTest, eq(quizAttempt.testId, assignmentTest.id))
				.leftJoin(
					assignmentTestPart,
					eq(assignmentTestPart.testId, assignmentTest.id),
				)
				.where(
					and(
						eq(quizAttempt.orgId, ctx.orgId),
						or(
							eq(classAssignment.promptId, promptId),
							eq(assignmentTestPart.promptId, promptId),
						),
					),
				)
				.limit(1);
			if (attempt) {
				return c.json(
					{
						error: "prompt content locked",
						code: ASSIGNMENT_PROMPT_ERROR_CODES.CONTENT_LOCKED,
					},
					409,
				);
			}
		}

		// Explicit map — a missing entry here silently drops the field.
		const updates: Partial<typeof assignmentPrompt.$inferInsert> = {};
		// Metadata: không bao giờ khoá — đổi tên/điểm/nguồn/trạng thái luôn được.
		if (body.data.title !== undefined) updates.title = body.data.title;
		if (body.data.band !== undefined) updates.band = body.data.band;
		if (body.data.source !== undefined) updates.source = body.data.source;
		if (body.data.status !== undefined) updates.status = body.data.status;
		// Content: chỉ ghi khi thực sự đổi (đến được đây với contentChanged
		//=true nghĩa là KHÔNG có attempt — row có attempt đã 409 ở trên).
		// Prompt bị khoá với payload không đổi thì bỏ qua hẳn phần content.
		if (contentChanged) {
			if (body.data.type !== undefined) {
				updates.type = body.data.type;
				updates.genre = row.skill === "writing" ? body.data.type : "";
			}
			if (body.data.prompt !== undefined) updates.prompt = body.data.prompt;
			if (body.data.intro !== undefined) updates.intro = body.data.intro;
			if (body.data.passage !== undefined) updates.passage = body.data.passage;
			if (body.data.transcript !== undefined)
				updates.transcript = body.data.transcript;
			if (body.data.cueTopic !== undefined)
				updates.cueTopic = body.data.cueTopic;
			if (body.data.cuePoints !== undefined)
				updates.cuePoints = body.data.cuePoints;
			if (body.data.audioName !== undefined)
				updates.audioName = body.data.audioName;
			if (body.data.imageUrl !== undefined)
				updates.imageUrl = body.data.imageUrl;
			if (body.data.note !== undefined) updates.note = body.data.note;
			if (body.data.questions !== undefined)
				updates.questions = JSON.stringify(body.data.questions);
			if (body.data.optionBank !== undefined)
				updates.optionBank = JSON.stringify(body.data.optionBank);
			if (body.data.writing !== undefined) {
				if (body.data.writing === null) {
					updates.writingPart = null;
					updates.writingType = null;
					updates.writingPrompt = "";
				} else {
					updates.writingPart = body.data.writing.part;
					updates.writingType = body.data.writing.type;
					updates.writingPrompt = body.data.writing.prompt;
				}
			}
		}

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
