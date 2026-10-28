import {
	type AiGradingDraftView,
	type AiGradingStatus,
	aiDraftPatchSchema,
	aiGradingDraftViewSchema,
	type EssayAnnotation,
	essayAnnotationCreateSchema,
	essayAnnotationPatchSchema,
	type GradingQueueItem,
	type GradingQueueResponse,
	isAiGradingMode,
	isAiGradingStatus,
	QUIZ_ANNOTATIONS_MAX,
	quizGradeInputSchema,
	type TeacherSubmission,
} from "@teacher-os/api/contracts";
import {
	isValidAnnotationSpan,
	overlapsAny,
} from "@teacher-os/api/lib/essay-annotations";
import { essayToPlain, plainToRaw } from "@teacher-os/api/lib/essay-plain";
import {
	type GradableSkill,
	isGradableSkill,
} from "@teacher-os/api/lib/ielts-band";
import {
	aiGradingDraft,
	assignmentPrompt,
	assignmentTest,
	assignmentTestPart,
	classAssignment,
	classTable,
	quizAttempt,
	quizAttemptAnnotation,
	student,
} from "@teacher-os/db/schema/index";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { ZodType } from "zod";
import type { Db, KernelCtx } from "../app";
import { releaseStaleGradings } from "../lib/ai-grading/release-stale";
import { mediaObjectResponse, toQuizAttemptMedia } from "../lib/media-response";
import type { MediaStore } from "../lib/media-store";
import {
	emitNotifications,
	notificationDepsFrom,
} from "../lib/notifications/emit";
import { gradeReturnedEvent } from "../lib/notifications/templates";
import {
	loadEssayAnnotations,
	toEssayAnnotation,
	toEssayView,
	toPlainAnnotation,
} from "../lib/quiz-annotation";
import { parseGradeScores, toQuizAttemptGrade } from "../lib/quiz-grade";

type Env = { Variables: { kernelCtx: KernelCtx } };
type GradingContext = Context<Env>;

/** Giới hạn an toàn mỗi nhánh hàng chờ chấm (#383). Bài chờ chấm luôn được
 * sắp trước bài đã chấm trong SQL nên giới hạn này không bao giờ cắt mất bài
 * đang chờ giáo viên chấm. */
const GRADING_QUEUE_BRANCH_LIMIT = 500;
/** Chia nhỏ inArray theo ngưỡng 50 để tránh trần bind parameter của Cloudflare D1 (#366 RT-F2). */
const D1_IN_ARRAY_CHUNK = 50;

/** `ai_grading_draft.status` (string|null) → union an toàn cho wire. */
function toAiStatus(value: string | null): AiGradingStatus | null {
	return value !== null && isAiGradingStatus(value) ? value : null;
}

/**
 * Tải hàng chờ chấm Writing/Speaking của tổ chức (#383) — hợp nhất cả bài
 * giao theo lớp (`mode='assignment'`) và tự luyện (`mode='practice'`).
 *
 * - Cùng nguồn `skill` với `loadGradableAttempt`: `assignmentPrompt.skill`
 *   cho `assignment`, `assignmentTest.skill` cho `practice`.
 * - Truy vấn `assignmentPrompt.part` qua `assignmentTestPart` tách riêng theo
 *   từng chunk 50 `testId` để đề nhiều part không nhân bản dòng attempt và đề
 *   không có part vẫn hiện với `part: ""`.
 * - Ưu tiên bài chưa chấm (`grade === null`) lên đầu trong cả SQL lẫn khi
 *   gộp 2 nhánh trong bộ nhớ; cùng nhóm sắp theo `submittedAt` giảm dần,
 *   tie-break `attemptId` giảm dần.
 */
export async function loadGradingQueue(
	db: Db,
	orgId: string,
	branchLimit: number = GRADING_QUEUE_BRANCH_LIMIT,
): Promise<GradingQueueItem[]> {
	// POST /grade luôn ghi đủ 4 tiêu chí kèm gradedAt; chuẩn "đã chấm" ở tầng
	// ứng dụng vẫn đi qua toQuizAttemptGrade bên dưới.
	const gradedOrderExpr = sql<number>`case when ${quizAttempt.gradeScores} is not null and ${quizAttempt.gradedAt} is not null then 1 else 0 end`;

	const [assignmentRows, practiceRows] = await Promise.all([
		db
			.select({
				id: quizAttempt.id,
				submittedAt: quizAttempt.submittedAt,
				gradeScores: quizAttempt.gradeScores,
				gradeFeedback: quizAttempt.gradeFeedback,
				gradedAt: quizAttempt.gradedAt,
				aiStatus: aiGradingDraft.status,
				aiGradingMode: aiGradingDraft.gradingMode,
				classId: classAssignment.classId,
				className: classTable.name,
				title: classAssignment.title,
				due: classAssignment.due,
				studentId: student.id,
				studentName: student.name,
				skill: assignmentPrompt.skill,
				part: assignmentPrompt.part,
			})
			.from(quizAttempt)
			.leftJoin(aiGradingDraft, eq(aiGradingDraft.attemptId, quizAttempt.id))
			.innerJoin(
				classAssignment,
				and(
					eq(classAssignment.id, quizAttempt.assignmentId),
					eq(classAssignment.orgId, orgId),
				),
			)
			.innerJoin(
				assignmentPrompt,
				and(
					eq(assignmentPrompt.id, classAssignment.promptId),
					eq(assignmentPrompt.orgId, orgId),
				),
			)
			.innerJoin(
				classTable,
				and(
					eq(classTable.id, classAssignment.classId),
					eq(classTable.orgId, orgId),
				),
			)
			.innerJoin(
				student,
				and(eq(student.id, quizAttempt.studentId), eq(student.orgId, orgId)),
			)
			.where(
				and(
					eq(quizAttempt.orgId, orgId),
					eq(quizAttempt.status, "submitted"),
					eq(quizAttempt.mode, "assignment"),
					inArray(assignmentPrompt.skill, ["writing", "speaking"]),
				),
			)
			.orderBy(
				asc(gradedOrderExpr),
				desc(quizAttempt.submittedAt),
				desc(quizAttempt.id),
			)
			.limit(branchLimit),
		db
			.select({
				id: quizAttempt.id,
				testId: quizAttempt.testId,
				submittedAt: quizAttempt.submittedAt,
				gradeScores: quizAttempt.gradeScores,
				gradeFeedback: quizAttempt.gradeFeedback,
				gradedAt: quizAttempt.gradedAt,
				aiStatus: aiGradingDraft.status,
				aiGradingMode: aiGradingDraft.gradingMode,
				title: assignmentTest.title,
				skill: assignmentTest.skill,
				studentId: student.id,
				studentName: student.name,
			})
			.from(quizAttempt)
			.leftJoin(aiGradingDraft, eq(aiGradingDraft.attemptId, quizAttempt.id))
			.innerJoin(
				assignmentTest,
				and(
					eq(assignmentTest.id, quizAttempt.testId),
					eq(assignmentTest.orgId, orgId),
				),
			)
			.innerJoin(
				student,
				and(eq(student.id, quizAttempt.studentId), eq(student.orgId, orgId)),
			)
			.where(
				and(
					eq(quizAttempt.orgId, orgId),
					eq(quizAttempt.status, "submitted"),
					eq(quizAttempt.mode, "practice"),
					inArray(assignmentTest.skill, ["writing", "speaking"]),
				),
			)
			.orderBy(
				asc(gradedOrderExpr),
				desc(quizAttempt.submittedAt),
				desc(quizAttempt.id),
			)
			.limit(branchLimit),
	]);

	const firstPartByTestId: Record<string, string> = {};
	const distinctTestIds = Array.from(
		new Set(
			practiceRows
				.map((r) => r.testId)
				.filter((id): id is string => typeof id === "string" && id.length > 0),
		),
	);
	for (let i = 0; i < distinctTestIds.length; i += D1_IN_ARRAY_CHUNK) {
		const chunk = distinctTestIds.slice(i, i + D1_IN_ARRAY_CHUNK);
		const partRows = await db
			.select({
				testId: assignmentTestPart.testId,
				part: assignmentPrompt.part,
			})
			.from(assignmentTestPart)
			.innerJoin(
				assignmentPrompt,
				and(
					eq(assignmentPrompt.id, assignmentTestPart.promptId),
					eq(assignmentPrompt.orgId, orgId),
				),
			)
			.where(inArray(assignmentTestPart.testId, chunk))
			.orderBy(asc(assignmentTestPart.position));
		for (const pr of partRows) {
			if (!Object.hasOwn(firstPartByTestId, pr.testId)) {
				firstPartByTestId[pr.testId] = pr.part ?? "";
			}
		}
	}

	const items: GradingQueueItem[] = [];
	for (const row of assignmentRows) {
		if (!isGradableSkill(row.skill)) continue;
		items.push({
			attemptId: row.id,
			mode: "assignment",
			classId: row.classId,
			className: row.className,
			title: row.title,
			due: row.due,
			student: { id: row.studentId, name: row.studentName },
			skill: row.skill,
			part: row.part ?? "",
			submittedAt: row.submittedAt ? row.submittedAt.toISOString() : "",
			grade: toQuizAttemptGrade(row),
			aiStatus: toAiStatus(row.aiStatus),
			aiGradingMode:
				row.aiGradingMode !== null && isAiGradingMode(row.aiGradingMode)
					? row.aiGradingMode
					: null,
		});
	}
	for (const row of practiceRows) {
		if (!isGradableSkill(row.skill)) continue;
		items.push({
			attemptId: row.id,
			mode: "practice",
			classId: "",
			className: "Luyện tập",
			title: row.title,
			due: "",
			student: { id: row.studentId, name: row.studentName },
			skill: row.skill,
			part: (row.testId ? firstPartByTestId[row.testId] : undefined) ?? "",
			submittedAt: row.submittedAt ? row.submittedAt.toISOString() : "",
			grade: toQuizAttemptGrade(row),
			aiStatus: toAiStatus(row.aiStatus),
			aiGradingMode:
				row.aiGradingMode !== null && isAiGradingMode(row.aiGradingMode)
					? row.aiGradingMode
					: null,
		});
	}

	items.sort((a, b) => {
		const aGraded = a.grade !== null ? 1 : 0;
		const bGraded = b.grade !== null ? 1 : 0;
		if (aGraded !== bGraded) return aGraded - bGraded;
		const subCmp = b.submittedAt.localeCompare(a.submittedAt);
		if (subCmp !== 0) return subCmp;
		return b.attemptId.localeCompare(a.attemptId);
	});
	return items;
}
type GradableAttemptRow = {
	id: string;
	status: string;
	essay: string;
	mediaKey: string | null;
	mediaName: string | null;
	mediaType: string | null;
	mediaSize: number | null;
	mediaUploadedAt: Date | null;
	startedAt: Date;
	submittedAt: Date | null;
	gradeScores: Record<string, number> | null;
	gradeFeedback: string;
	gradedAt: Date | null;
	/** Bài tự luyện (phase 10) không gắn lượt giao — id/classId/due rỗng,
	 * className là nhãn "Luyện tập" cho hàng chờ chấm. */
	practice: boolean;
	caId: string;
	classId: string;
	title: string;
	due: string;
	className: string;
	studentId: string;
	studentName: string;
	skill: string;
	part: string;
	prompt: string;
	imageUrl: string;
	cueTopic: string;
	cuePoints: string;
	note: string;
};

/**
 * Router chấm bài Writing/Speaking (#319). Mount TRONG kernelRoutes
 * (`kernel.route("/grading", …)`) để thừa hưởng Origin guard + guard JSON
 * POST + role gate teacher — không mount standalone.
 */
export function gradingRoutes(deps: {
	getDb(): Db;
	getMediaStore?(): MediaStore | undefined;
	/** #454 phase 3: phát grade_returned sau khi chấm thành công. */
	mailer?: Parameters<typeof emitNotifications>[0]["mailer"];
	runInBackground?: Parameters<typeof emitNotifications>[0]["runInBackground"];
	/** #454: origin cổng học viên cho link tuyệt đối trong thư (notificationDepsFrom). */
	studentOrigin?: Parameters<typeof emitNotifications>[0]["studentOrigin"];
	/** #463: khoảng chờ giữa các lượt retry email thông báo (test/E2E truyền [0, 0]). */
	notificationRetryDelaysMs?: number[];
}) {
	const routes = new Hono<Env>();

	function unauthorized(c: GradingContext) {
		return c.json({ error: "unauthorized" }, 401);
	}

	/** Parse JSON body theo schema — cùng pattern try/catch + safeParse với
	 * student.ts: 400 "invalid json" khi body không phải JSON, 400 "invalid
	 * body" khi fail schema. */
	async function parseJsonBody<T>(
		c: GradingContext,
		schema: ZodType<T>,
	): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return { ok: false, response: c.json({ error: "invalid json" }, 400) };
		}
		const body = schema.safeParse(raw);
		if (!body.success) {
			return { ok: false, response: c.json({ error: "invalid body" }, 400) };
		}
		return { ok: true, data: body.data };
	}

	/** Draft state cho phép "Lưu bản nháp": AI xong (hoặc hỏng) và chưa
	 * trả bài. `ai_processing` chặn (AI chưa có kết quả), `published` chặn
	 * (đã trả bài — sửa điểm dùng POST /grade). */
	const EDITABLE_DRAFT_STATUSES: readonly AiGradingStatus[] = [
		"ai_drafted",
		"teacher_reviewing",
		"manual_pending",
	];

	/** Row draft → view giáo viên; `null` khi status lạ (không bao giờ với
	 * dữ liệu mình ghi). */
	function toDraftView(
		row: typeof aiGradingDraft.$inferSelect,
	): AiGradingDraftView | null {
		if (!isAiGradingStatus(row.status)) return null;
		return aiGradingDraftViewSchema.parse({
			status: row.status,
			aiScores: row.aiScores ?? null,
			aiFeedback: row.aiFeedback,
			reviewedScores: row.reviewedScores ?? null,
			reviewedFeedback: row.reviewedFeedback,
			gradingMode: row.gradingMode,
			version: row.version,
			errorCode: row.errorCode,
			publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
		});
	}

	/** Draft chấm AI của một attempt; `null` khi bài không có draft (chấm
	 * tay cũ) — mọi query có predicate orgId (chuẩn IDOR). */
	async function loadAiDraft(
		db: Db,
		attemptId: string,
		orgId: string,
	): Promise<AiGradingDraftView | null> {
		const [row] = await db
			.select()
			.from(aiGradingDraft)
			.where(
				and(
					eq(aiGradingDraft.attemptId, attemptId),
					eq(aiGradingDraft.orgId, orgId),
				),
			)
			.limit(1);
		return row ? toDraftView(row) : null;
	}

	/** Attempt + đề + học viên theo org — mọi join có predicate orgId
	 * (cùng chuẩn IDOR với `loadAttemptForReview` ở student.ts). */
	async function loadGradableAttempt(
		db: Db,
		attemptId: string,
		orgId: string,
	): Promise<
		| { error: 404 | 409 | 400 }
		| { row: GradableAttemptRow; skill: GradableSkill }
	> {
		// Attempt gốc + học viên trước — nhánh header (lượt giao vs tự luyện
		// phase 10) chọn query phù hợp; cả hai đều có predicate orgId (chuẩn
		// IDOR như bản innerJoin cũ).
		const [base] = await db
			.select({
				id: quizAttempt.id,
				status: quizAttempt.status,
				mode: quizAttempt.mode,
				testId: quizAttempt.testId,
				assignmentId: quizAttempt.assignmentId,
				essay: quizAttempt.essay,
				mediaKey: quizAttempt.mediaKey,
				mediaName: quizAttempt.mediaName,
				mediaType: quizAttempt.mediaType,
				mediaSize: quizAttempt.mediaSize,
				mediaUploadedAt: quizAttempt.mediaUploadedAt,
				startedAt: quizAttempt.startedAt,
				submittedAt: quizAttempt.submittedAt,
				gradeScores: quizAttempt.gradeScores,
				gradeFeedback: quizAttempt.gradeFeedback,
				gradedAt: quizAttempt.gradedAt,
				studentId: student.id,
				studentName: student.name,
			})
			.from(quizAttempt)
			.innerJoin(
				student,
				and(eq(student.id, quizAttempt.studentId), eq(student.orgId, orgId)),
			)
			.where(and(eq(quizAttempt.id, attemptId), eq(quizAttempt.orgId, orgId)));
		if (!base) return { error: 404 };
		if (base.status !== "submitted") return { error: 409 };

		const practice = base.mode === "practice";
		/** Shape chung của header đề — fields chỉ có ở nhánh assignment là
		 * optional; nhánh practice để undefined. */
		type GradingHeader = {
			caId?: string;
			classId?: string;
			due?: string;
			className?: string;
			title: string | null;
			skill: string | null;
			part: string | null;
			prompt: string | null;
			imageUrl: string | null;
			cueTopic: string | null;
			cuePoints: string | null;
			note: string | null;
		};
		// Tự luyện: title/skill từ assignment_test, prompt fields từ prompt của
		// part ĐẦU (position thấp nhất). Đề đã xoá (test_id set null) →
		// FROM assignmentTest không khớp row nào → header undefined, skill=""
		// → trả 400 SKILL_NOT_GRADABLE (beta chấp nhận: đề đã xoá không còn
		// chấm được; attempt đã chấm trước đó vẫn giữ nguyên điểm).
		const header: GradingHeader | undefined = practice
			? (
					await db
						.select({
							title: assignmentTest.title,
							skill: assignmentTest.skill,
							part: assignmentPrompt.part,
							prompt: assignmentPrompt.prompt,
							imageUrl: assignmentPrompt.imageUrl,
							cueTopic: assignmentPrompt.cueTopic,
							cuePoints: assignmentPrompt.cuePoints,
							note: assignmentPrompt.note,
						})
						.from(assignmentTest)
						.leftJoin(
							assignmentTestPart,
							eq(assignmentTestPart.testId, assignmentTest.id),
						)
						.leftJoin(
							assignmentPrompt,
							and(
								eq(assignmentPrompt.id, assignmentTestPart.promptId),
								eq(assignmentPrompt.orgId, orgId),
							),
						)
						.where(
							and(
								// CHECK DB ép practice ⇒ test_id NOT NULL — `?? ""`
								// chỉ để thu hẹp kiểu, id "" không bao giờ khớp.
								eq(assignmentTest.id, base.testId ?? ""),
								eq(assignmentTest.orgId, orgId),
							),
						)
						.orderBy(asc(assignmentTestPart.position))
						.limit(1)
				)[0]
			: (
					await db
						.select({
							caId: classAssignment.id,
							classId: classAssignment.classId,
							title: classAssignment.title,
							due: classAssignment.due,
							className: classTable.name,
							skill: assignmentPrompt.skill,
							part: assignmentPrompt.part,
							prompt: assignmentPrompt.prompt,
							imageUrl: assignmentPrompt.imageUrl,
							cueTopic: assignmentPrompt.cueTopic,
							cuePoints: assignmentPrompt.cuePoints,
							note: assignmentPrompt.note,
						})
						.from(classAssignment)
						.innerJoin(
							assignmentPrompt,
							and(
								eq(assignmentPrompt.id, classAssignment.promptId),
								eq(assignmentPrompt.orgId, orgId),
							),
						)
						.innerJoin(
							classTable,
							and(
								eq(classTable.id, classAssignment.classId),
								eq(classTable.orgId, orgId),
							),
						)
						.where(
							and(
								// Attempt assignment luôn có lượt giao (CHECK DB) —
								// `?? ""` chỉ để thu hẹp kiểu.
								eq(classAssignment.id, base.assignmentId ?? ""),
								eq(classAssignment.orgId, orgId),
							),
						)
						.limit(1)
				)[0];

		const row: GradableAttemptRow = {
			id: base.id,
			status: base.status,
			essay: base.essay,
			mediaKey: base.mediaKey,
			mediaName: base.mediaName,
			mediaType: base.mediaType,
			mediaSize: base.mediaSize,
			mediaUploadedAt: base.mediaUploadedAt,
			startedAt: base.startedAt,
			submittedAt: base.submittedAt,
			gradeScores: base.gradeScores,
			gradeFeedback: base.gradeFeedback,
			gradedAt: base.gradedAt,
			practice,
			// Tự luyện: id lớp/lượt giao + hạn không tồn tại → rỗng; className là
			// nhãn "Luyện tập" cho hàng chờ chấm giáo viên (filter riêng).
			caId: practice ? "" : (header?.caId ?? ""),
			classId: practice ? "" : (header?.classId ?? ""),
			title: header?.title ?? "",
			due: practice ? "" : (header?.due ?? ""),
			className: practice ? "Luyện tập" : (header?.className ?? ""),
			studentId: base.studentId,
			studentName: base.studentName,
			skill: header?.skill ?? "",
			part: header?.part ?? "",
			// Cột prompt có thể rỗng ở dữ liệu cũ — bọc `?? ""` cho từng field.
			prompt: header?.prompt ?? "",
			imageUrl: header?.imageUrl ?? "",
			cueTopic: header?.cueTopic ?? "",
			cuePoints: header?.cuePoints ?? "",
			note: header?.note ?? "",
		};
		if (!isGradableSkill(row.skill)) return { error: 400 };
		return { row, skill: row.skill };
	}

	function errorResponse(c: GradingContext, code: 404 | 409 | 400) {
		if (code === 404) {
			return c.json({ error: "attempt not found" }, 404);
		}
		if (code === 409) {
			return c.json(
				{ error: "attempt not yet submitted", code: "NOT_SUBMITTED" },
				409,
			);
		}
		return c.json(
			{ error: "skill not gradable", code: "SKILL_NOT_GRADABLE" },
			400,
		);
	}

	/** Cột prompt đã được bọc `?? ""` ở loader — payload chỉ map phẳng. */
	function toSubmission(
		row: GradableAttemptRow,
		skill: GradableSkill,
		annotations: EssayAnnotation[],
	): TeacherSubmission {
		const essayView =
			skill === "writing" ? toEssayView(row.essay, annotations) : null;
		return {
			attemptId: row.id,
			classAssignmentId: row.caId,
			classId: row.classId,
			className: row.className,
			title: row.title,
			due: row.due,
			student: { id: row.studentId, name: row.studentName },
			skill,
			part: row.part,
			prompt: {
				prompt: row.prompt,
				imageUrl: row.imageUrl,
				cueTopic: row.cueTopic,
				cuePoints: row.cuePoints,
				note: row.note,
			},
			startedAt: row.startedAt.toISOString(),
			submittedAt: row.submittedAt ? row.submittedAt.toISOString() : "",
			essay: essayView ? essayView.essay : null,
			media: skill === "speaking" ? toQuizAttemptMedia(row) : null,
			grade: toQuizAttemptGrade(row),
			// Speaking không có highlight (#332) — luôn rỗng.
			annotations: essayView ? essayView.annotations : [],
			// Bài tự luyện (phase 10): CHỈ thêm key khi practice — bundle cũ
			// (strict) không vỡ với bài nộp lượt giao.
			...(row.practice ? { practice: true as const } : {}),
		};
	}

	routes.get("/", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const db = deps.getDb();
		// Dọn lười draft `ai_processing` treo (TOS-30) — mở hàng chờ là cơ
		// hội giải tỏa Credit giữ bởi runner chết.
		await releaseStaleGradings(db, ctx.orgId);
		const items = await loadGradingQueue(db, ctx.orgId);
		const response: GradingQueueResponse = { items };
		return c.json(response);
	});

	routes.get("/:attemptId", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const db = deps.getDb();
		// Sweep trước khi trả — badge draft không hiện trạng `ai_processing` ma.
		await releaseStaleGradings(db, ctx.orgId);
		const loaded = await loadGradableAttempt(
			db,
			c.req.param("attemptId"),
			ctx.orgId,
		);
		if ("error" in loaded) return errorResponse(c, loaded.error);
		const annotations =
			loaded.skill === "writing"
				? await loadEssayAnnotations(db, loaded.row.id, ctx.orgId)
				: [];
		// TOS-30: draft chấm AI đính kèm submission — chỉ cổng giáo viên.
		const aiDraft = await loadAiDraft(db, loaded.row.id, ctx.orgId);
		return c.json({
			...toSubmission(loaded.row, loaded.skill, annotations),
			aiDraft,
		});
	});

	/**
	 * GET /api/grading/:attemptId/media — phát lại file bài nói cho giáo viên
	 * chấm. Header dựng từ cùng helper với route học viên; CORP `same-site`
	 * được set ở app.ts (secureHeaders global ghi đè header của handler).
	 */
	routes.get("/:attemptId/media", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const store = deps.getMediaStore?.();
		if (!store) {
			return c.json({ error: "media storage unavailable" }, 503);
		}
		const loaded = await loadGradableAttempt(
			deps.getDb(),
			c.req.param("attemptId"),
			ctx.orgId,
		);
		if ("error" in loaded) return errorResponse(c, loaded.error);
		if (loaded.skill !== "speaking" || loaded.row.mediaKey === null) {
			return c.json({ error: "media not found" }, 404);
		}
		const object = await store.get(loaded.row.mediaKey);
		if (!object) {
			return c.json({ error: "media not found" }, 404);
		}
		return mediaObjectResponse(object, loaded.row);
	});

	routes.post("/:attemptId/grade", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await parseJsonBody(c, quizGradeInputSchema);
		if (!body.ok) return body.response;
		const loaded = await loadGradableAttempt(
			deps.getDb(),
			c.req.param("attemptId"),
			ctx.orgId,
		);
		if ("error" in loaded) return errorResponse(c, loaded.error);
		const scores = parseGradeScores(loaded.skill, body.data.scores);
		if (!scores) {
			return c.json({ error: "invalid scores" }, 400);
		}
		const now = new Date();
		// TOS-30: "Chốt trả bài" = ĐÚNG MỘT đường công bố — điểm cuối lên
		// `quiz_attempt` + draft sang `published` trong CÙNG batch (kongming
		// điều kiện 2: publish draft từ BẤT KỲ trạng thái nào, kể cả
		// `ai_processing` khi giáo viên không chờ AI). Bài không draft (chấm
		// tay cũ) update 0 dòng — giữ nguyên luồng cũ. Draft update có điều
		// kiện `(SELECT changes() = 1)`: statement trước khớp 0 dòng (route
		// sắp trả 409) thì draft KHÔNG được publish oan (precedent wallet.ts).
		const [updated] = await deps.getDb().batch([
			deps
				.getDb()
				.update(quizAttempt)
				.set({
					gradeScores: scores,
					gradeFeedback: body.data.feedback,
					gradedAt: now,
				})
				.where(
					and(
						eq(quizAttempt.id, loaded.row.id),
						eq(quizAttempt.orgId, ctx.orgId),
						eq(quizAttempt.status, "submitted"),
					),
				)
				.returning({ id: quizAttempt.id }),
			deps
				.getDb()
				.update(aiGradingDraft)
				.set({ status: "published", publishedAt: now })
				.where(
					and(
						eq(aiGradingDraft.attemptId, loaded.row.id),
						sql`(SELECT changes() = 1)`,
					),
				),
		]);
		if (updated.length === 0) {
			return errorResponse(c, 409);
		}
		const grade = toQuizAttemptGrade({
			gradeScores: scores,
			gradeFeedback: body.data.feedback,
			gradedAt: now,
		});
		if (!grade) {
			return c.json({ error: "grade persistence failed" }, 500);
		}
		// #454 phase 3: phát grade_returned theo attempt sau khi chấm thành
		// công (fail-open — lỗi thông báo không đổi response chấm bài).
		await emitNotifications(notificationDepsFrom(deps), ctx.orgId, [
			gradeReturnedEvent({
				attemptId: loaded.row.id,
				studentId: loaded.row.studentId,
				title: loaded.row.title,
				// Attempt gắn lượt giao → xem bài đã chấm tại
				// /learn/quizzes/attempt/$attemptId (CR I1 — portal không có
				// /assignments/$id); attempt tự luyện (phase 10) → /practice.
				linkPath:
					loaded.row.caId !== null
						? `/learn/quizzes/attempt/${loaded.row.id}`
						: "/practice",
			}),
		]);
		return c.json(grade);
	});

	/**
	 * PATCH /api/grading/:attemptId/draft — "Lưu bản nháp" (TOS-30 D5):
	 * điểm + nhận xét giáo viên đang rà, draft sang `teacher_reviewing`,
	 * `version + 1`. Optimistic concurrency theo `version` client gửi —
	 * lệch → 409 DRAFT_VERSION_CONFLICT (nền chống lưu đè E-011 TOS-33).
	 * Chỉ đụng draft đang EDITABLE (không `ai_processing`, không `published`);
	 * bài không draft → 404 DRAFT_NOT_FOUND.
	 */
	routes.patch("/:attemptId/draft", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await parseJsonBody(c, aiDraftPatchSchema);
		if (!body.ok) return body.response;
		const loaded = await loadGradableAttempt(
			deps.getDb(),
			c.req.param("attemptId"),
			ctx.orgId,
		);
		if ("error" in loaded) return errorResponse(c, loaded.error);
		const scores = parseGradeScores(loaded.skill, body.data.scores);
		if (!scores) {
			return c.json({ error: "invalid scores" }, 400);
		}
		const db = deps.getDb();
		const [draft] = await db
			.select()
			.from(aiGradingDraft)
			.where(
				and(
					eq(aiGradingDraft.attemptId, loaded.row.id),
					eq(aiGradingDraft.orgId, ctx.orgId),
				),
			)
			.limit(1);
		if (!draft) {
			return c.json({ error: "draft not found", code: "DRAFT_NOT_FOUND" }, 404);
		}
		const editable =
			isAiGradingStatus(draft.status) &&
			EDITABLE_DRAFT_STATUSES.includes(draft.status);
		if (!editable || draft.version !== body.data.version) {
			return c.json(
				{
					error: editable ? "draft version conflict" : "draft not editable",
					code: editable ? "DRAFT_VERSION_CONFLICT" : "DRAFT_NOT_EDITABLE",
				},
				409,
			);
		}
		const updated = await db
			.update(aiGradingDraft)
			.set({
				status: "teacher_reviewing",
				reviewedScores: scores,
				reviewedFeedback: body.data.feedback,
				version: draft.version + 1,
			})
			.where(
				and(
					eq(aiGradingDraft.attemptId, loaded.row.id),
					eq(aiGradingDraft.version, draft.version),
					// Guard trạng thái LẠI ở câu UPDATE: giữa lúc đọc và UPDATE,
					// "Chốt trả bài" có thể đã set `published` (không đụng
					// version) — không guard thì draft terminal quay về
					// `teacher_reviewing` (code review #478). Trượt → 0 dòng →
					// 409 DRAFT_VERSION_CONFLICT ở dưới.
					ne(aiGradingDraft.status, "published"),
				),
			)
			.returning();
		const updatedRow = updated[0];
		const view = updatedRow ? toDraftView(updatedRow) : null;
		if (!view) {
			return c.json(
				{ error: "draft version conflict", code: "DRAFT_VERSION_CONFLICT" },
				409,
			);
		}
		return c.json(view);
	});

	/**
	 * POST /api/grading/:attemptId/annotations — tạo highlight mới (#332).
	 * Mỗi highlight lưu ngay, không gắn nút "Lưu điểm". Thứ tự kiểm cùng
	 * pattern route /grade; server không bắt dính từ (client gửi đoạn đã
	 * snap), chỉ đảm bảo đoạn hợp lệ, không chồng, không vượt hạn mức.
	 */
	routes.post("/:attemptId/annotations", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await parseJsonBody(c, essayAnnotationCreateSchema);
		if (!body.ok) return body.response;
		const loaded = await loadGradableAttempt(
			deps.getDb(),
			c.req.param("attemptId"),
			ctx.orgId,
		);
		if ("error" in loaded) return errorResponse(c, loaded.error);
		if (loaded.skill !== "writing") {
			return c.json(
				{ error: "skill not annotatable", code: "SKILL_NOT_ANNOTATABLE" },
				400,
			);
		}
		const { start, end, note } = body.data;
		const view = essayToPlain(loaded.row.essay);
		if (!isValidAnnotationSpan(view.text, start, end)) {
			return c.json(
				{ error: "invalid annotation span", code: "INVALID_SPAN" },
				400,
			);
		}
		const rawSpan = plainToRaw(view, start, end);
		if (!rawSpan) {
			return c.json(
				{ error: "invalid annotation span", code: "INVALID_SPAN" },
				400,
			);
		}
		const db = deps.getDb();
		const existing = await loadEssayAnnotations(db, loaded.row.id, ctx.orgId);
		if (existing.length >= QUIZ_ANNOTATIONS_MAX) {
			return c.json(
				{ error: "too many annotations", code: "TOO_MANY_ANNOTATIONS" },
				400,
			);
		}
		if (overlapsAny(existing, rawSpan.start, rawSpan.end)) {
			return c.json(
				{ error: "annotation overlaps existing", code: "OVERLAP" },
				409,
			);
		}
		const [row] = await db
			.insert(quizAttemptAnnotation)
			.values({
				id: crypto.randomUUID(),
				orgId: ctx.orgId,
				attemptId: loaded.row.id,
				startOffset: rawSpan.start,
				endOffset: rawSpan.end,
				note,
			})
			.returning();
		if (!row) {
			return c.json({ error: "annotation persistence failed" }, 500);
		}
		const rawAnn = toEssayAnnotation(row);
		return c.json(
			toPlainAnnotation(view, rawAnn) ?? { ...rawAnn, start, end },
			201,
		);
	});

	/** PATCH /api/grading/:attemptId/annotations/:annotationId — đổi ghi chú.
	 * Không kiểm skill: annotation chỉ tồn tại trên attempt Writing (POST đã
	 * chặn) và predicate attemptId đủ chặn chéo. */
	routes.patch("/:attemptId/annotations/:annotationId", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await parseJsonBody(c, essayAnnotationPatchSchema);
		if (!body.ok) return body.response;
		const loaded = await loadGradableAttempt(
			deps.getDb(),
			c.req.param("attemptId"),
			ctx.orgId,
		);
		if ("error" in loaded) return errorResponse(c, loaded.error);
		const [row] = await deps
			.getDb()
			.update(quizAttemptAnnotation)
			.set({ note: body.data.note, updatedAt: new Date() })
			.where(
				and(
					eq(quizAttemptAnnotation.id, c.req.param("annotationId")),
					eq(quizAttemptAnnotation.attemptId, loaded.row.id),
					eq(quizAttemptAnnotation.orgId, ctx.orgId),
				),
			)
			.returning();
		if (!row) {
			return c.json({ error: "annotation not found" }, 404);
		}
		const view = essayToPlain(loaded.row.essay);
		const rawAnn = toEssayAnnotation(row);
		return c.json(toPlainAnnotation(view, rawAnn) ?? rawAnn);
	});

	/** DELETE /api/grading/:attemptId/annotations/:annotationId — gỡ highlight. */
	routes.delete("/:attemptId/annotations/:annotationId", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const loaded = await loadGradableAttempt(
			deps.getDb(),
			c.req.param("attemptId"),
			ctx.orgId,
		);
		if ("error" in loaded) return errorResponse(c, loaded.error);
		const deleted = await deps
			.getDb()
			.delete(quizAttemptAnnotation)
			.where(
				and(
					eq(quizAttemptAnnotation.id, c.req.param("annotationId")),
					eq(quizAttemptAnnotation.attemptId, loaded.row.id),
					eq(quizAttemptAnnotation.orgId, ctx.orgId),
				),
			)
			.returning({ id: quizAttemptAnnotation.id });
		if (!deleted[0]) {
			return c.json({ error: "annotation not found" }, 404);
		}
		return c.body(null, 204);
	});

	return routes;
}
