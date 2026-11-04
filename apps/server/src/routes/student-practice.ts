import {
	type AssignmentQuestion,
	PRACTICE_CATALOG_PAGE_SIZE,
	PRACTICE_SKILLS,
	type PracticeCatalogResponse,
	type PracticeSkill,
	quizAttemptActionSchema,
	type StartPracticeResponse,
	type StudentQuizDetail,
	startPracticeResponseSchema,
	studentQuizDetailSchema,
} from "@teacher-os/api/contracts";
import { formatBand, ieltsOverallBand } from "@teacher-os/api/lib/ielts-band";
import { inferQuestionTypes } from "@teacher-os/api/lib/infer-question-types";
import {
	assignmentPrompt,
	assignmentTest,
	assignmentTestPart,
	quizAttempt,
} from "@teacher-os/db/schema/index";
import { and, asc, count, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Db } from "../app";
import { toQuizAttemptMedia } from "../lib/media-response";
import {
	createQuizWriteGuard,
	createStudentGuard,
	parseQuizAnswers,
	parseQuizOptionBank,
	parseQuizQuestions,
	type StudentEnv,
	type StudentRouteDeps,
} from "./student";

type PracticeRouteDeps = StudentRouteDeps;

/** Đề luyện tập + các part đã ghép (prompt theo position) — nguồn của cả
 * catalog lẫn take screen. `status='ready'` + cùng org là điều kiện bắt
 * buộc: đề draft là bản nháp riêng tư của giáo viên, học viên không thấy
 * (404 như đề lạ, không lộ sự tồn tại). */
type PracticeTestWithParts = {
	test: typeof assignmentTest.$inferSelect;
	parts: {
		part: string;
		position: number;
		prompt: typeof assignmentPrompt.$inferSelect;
	}[];
};

function invalidParam(c: Context<StudentEnv>, message: string) {
	return c.json({ error: message }, 400);
}

async function loadPracticeTestWithParts(
	db: Db,
	orgId: string,
	testId: string,
): Promise<PracticeTestWithParts | null> {
	const [test] = await db
		.select()
		.from(assignmentTest)
		.where(
			and(
				eq(assignmentTest.id, testId),
				eq(assignmentTest.orgId, orgId),
				eq(assignmentTest.status, "ready"),
			),
		)
		.limit(1);
	if (!test) return null;

	const partRows = await db
		.select({
			part: assignmentTestPart.part,
			position: assignmentTestPart.position,
			prompt: assignmentPrompt,
		})
		.from(assignmentTestPart)
		.innerJoin(
			assignmentPrompt,
			and(
				eq(assignmentPrompt.id, assignmentTestPart.promptId),
				// Org-scoping của assignment_test_part đi qua testId (bảng không
				// có orgId) — predicate này chặn prompt org khác lọt qua part.
				eq(assignmentPrompt.orgId, orgId),
			),
		)
		.where(eq(assignmentTestPart.testId, testId))
		.orderBy(asc(assignmentTestPart.position));

	return { test, parts: partRows };
}

/** Gộp questions của mọi part thành MỘT snapshot theo thứ tự position —
 * cùng bộ làm sạch với luồng assignment (`parseQuizQuestions`, giữ nguyên
 * answer/alts: snapshot là bản chụp ĐẦY ĐỦ KEY, RT#3). Đánh số hiển thị
 * theo index toàn cục; `qStartOverride` của part chỉ là nhãn hiển thị và
 * KHÔNG ảnh hưởng chấm (grading theo index). */
function buildMergedQuestions(
	parts: PracticeTestWithParts["parts"],
	testId: string,
): AssignmentQuestion[] {
	return parts.flatMap((row) => {
		const parsed = parseQuizQuestions(
			row.prompt.questions,
			`${testId}:${row.part}`,
		);
		const effectiveTypes = inferQuestionTypes(parsed, row.prompt.type);
		return parsed.map((q, index) => ({
			...q,
			type: effectiveTypes[index] ?? row.prompt.type,
		}));
	});
}

/** Nhãn điểm lượt nộp gần nhất cho catalog: đã chấm → "Band x.x" (cùng
 * derive với API chấm), tự chấm → "đúng/tổng" từ snapshot, còn lại null
 * (Writing/Speaking chưa chấm → "Chờ chấm" ở client). */
function practiceScoreLabel(
	row: {
		questionsSnapshot: string;
		correctCount: number | null;
		gradeScores: Record<string, number> | null;
		gradedAt: Date | null;
	},
	rowId: string,
): string | null {
	if (row.gradeScores && row.gradedAt) {
		return `Band ${formatBand(ieltsOverallBand(Object.values(row.gradeScores)))}`;
	}
	if (row.correctCount === null) return null;
	const total = parseQuizQuestions(row.questionsSnapshot, rowId).length;
	return `${row.correctCount}/${total}`;
}

/** Query take/review dùng chung shape với đề luồng assignment. Chrome
 * (passage/prompt/cue/audio/optionBank) lấy từ prompt của part ĐẦU — đề
 * luyện tập nhiều part dùng chung một khung giấy như flow assignment
 * (StudentQuizDetail chỉ có một passage), câu hỏi vẫn gộp ĐỦ mọi part. */
function toPracticeQuizDetail(
	loaded: PracticeTestWithParts,
	questions: AssignmentQuestion[],
	attempt: typeof quizAttempt.$inferSelect | null,
): StudentQuizDetail {
	const header = loaded.parts[0]?.prompt;
	const effectiveDefaults = {
		type: header?.type ?? "",
		band: header?.band ?? "7.0",
	};
	return {
		// Tự luyện không có lượt giao — trường giữ shape contract, client điều
		// hướng qua testId.
		assignmentId: "",
		title: loaded.test.title,
		// Practice không có hạn nộp.
		due: "",
		dueAt: null,
		skill: loaded.test.skill,
		part: loaded.parts[0]?.part ?? "",
		...effectiveDefaults,
		intro: header?.intro ?? "",
		prompt: header?.prompt ?? "",
		passage: header?.passage ?? "",
		cueTopic: header?.cueTopic ?? "",
		cuePoints: header?.cuePoints ?? "",
		audioName: header?.audioName ?? "",
		imageUrl: header?.imageUrl ?? "",
		optionBank: parseQuizOptionBank(header?.optionBank ?? "[]"),
		// Speaking (#305) không có đáp án — note là hướng dẫn cho học viên;
		// skill khác giữ kín note tới sau khi nộp (RT#6).
		...(loaded.test.skill === "speaking" ? { note: header?.note ?? "" } : {}),
		questions: questions.map((question) => ({
			stem: question.stem,
			opts: question.opts,
			// Type hiệu dụng per-câu đã resolve lúc snapshot; giữ nguyên để
			// client phân cụm đúng đề trộn dạng.
			type: question.type ?? effectiveDefaults.type,
			pin: question.pin ?? null,
		})),
		attempt: attempt
			? {
					id: attempt.id,
					status: attempt.status as "in_progress" | "submitted",
					answers: parseQuizAnswers(attempt.answers),
					essay: attempt.essay,
					media: toQuizAttemptMedia(attempt),
				}
			: null,
	};
}

function assertValidDetail(raw: unknown): StudentQuizDetail | null {
	const parsed = studentQuizDetailSchema.safeParse(raw);
	return parsed.success ? parsed.data : null;
}

/**
 * Router tự luyện (phase 10, #378) — mount cạnh các router học viên khác
 * (`app.route("/api/student", …)`): bootstrapMiddleware bỏ qua /api/student
 * nên router PHẢI tự gắn `createStudentGuard`. Mọi đề lấy từ thư viện
 * `assignment_test` status ready của org đang chọn; attempt tạo ra
 * `mode='practice'`, `assignment_id` NULL (CHECK DB ép `test_id` NOT NULL).
 */
export function studentPracticeRoutes(deps: PracticeRouteDeps) {
	const router = new Hono<StudentEnv>();
	const requireStudent = createStudentGuard(deps);

	router.use("/practice", requireStudent);
	router.use("/practice/*", requireStudent);

	// POST start là route ghi duy nhất — cùng guard CSRF/JSON/bodyLimit với
	// quiz domain (factory dùng chung, RT#2).
	const allowedOrigins = Array.isArray(deps.corsOrigin)
		? deps.corsOrigin
		: typeof deps.corsOrigin === "string"
			? [deps.corsOrigin]
			: [];
	router.use(
		"/practice/:testId/attempts",
		createQuizWriteGuard(allowedOrigins),
	);

	/**
	 * GET /api/student/practice?skill=&collection=&q=&page= — catalog đề
	 * ready của org đang chọn, phân trang 12 (PRACTICE_CATALOG_PAGE_SIZE).
	 * `q` tìm theo tiêu đề (instr, không LIKE nên ký tự %/_ của học viên
	 * không thành wildcard); `collection` lọc đúng bằng giá trị select.
	 */
	router.get("/practice", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const db: Db = deps.getDb();

		const rawSkill = c.req.query("skill");
		if (
			typeof rawSkill !== "string" ||
			!(PRACTICE_SKILLS as readonly string[]).includes(rawSkill)
		) {
			return invalidParam(c, "invalid skill");
		}
		const skill = rawSkill as PracticeSkill;
		const collection = c.req.query("collection") || null;
		const q = (c.req.query("q") ?? "").trim().toLowerCase();
		const rawPage = Number.parseInt(c.req.query("page") ?? "1", 10);
		if (!Number.isInteger(rawPage) || rawPage < 1) {
			return invalidParam(c, "invalid page");
		}
		const page = rawPage;

		const filters: SQL[] = [
			eq(assignmentTest.orgId, orgId),
			eq(assignmentTest.status, "ready"),
			eq(assignmentTest.skill, skill),
			sql`exists (
				select 1 from ${assignmentTestPart}
				inner join ${assignmentPrompt}
					on ${assignmentPrompt.id} = ${assignmentTestPart.promptId}
					and ${assignmentPrompt.orgId} = ${orgId}
				where ${assignmentTestPart.testId} = ${assignmentTest.id}
			)`,
		];
		if (collection) filters.push(eq(assignmentTest.collection, collection));
		if (q) {
			// instr thay LIKE: ký tự %/_ trong từ khoá học viên không thành
			// wildcard; q đã lowercase nên so khớp không phân biệt hoa/thường.
			filters.push(sql`instr(lower(${assignmentTest.title}), ${q}) > 0`);
		}
		const where = and(...filters);

		const [totalRow] = await db
			.select({ total: count() })
			.from(assignmentTest)
			.where(where);
		const total = Number(totalRow?.total ?? 0);

		const rows = await db
			.select()
			.from(assignmentTest)
			.where(where)
			.orderBy(desc(assignmentTest.createdAt), desc(assignmentTest.id))
			.limit(PRACTICE_CATALOG_PAGE_SIZE)
			.offset((page - 1) * PRACTICE_CATALOG_PAGE_SIZE);

		// parts count + lượt nộp gần nhất chỉ cho các đề trên trang hiện tại.
		const testIds = rows.map((row) => row.id);
		const partCounts = new Map<string, number>();
		if (testIds.length > 0) {
			const grouped = await db
				.select({ testId: assignmentTestPart.testId, n: count() })
				.from(assignmentTestPart)
				.where(inArray(assignmentTestPart.testId, testIds))
				.groupBy(assignmentTestPart.testId);
			for (const row of grouped) {
				partCounts.set(row.testId, Number(row.n));
			}
		}
		const lastAttemptByTest = new Map<
			string,
			typeof quizAttempt.$inferSelect
		>();
		if (testIds.length > 0) {
			const attemptRows = await db
				.select()
				.from(quizAttempt)
				.where(
					and(
						eq(quizAttempt.orgId, orgId),
						eq(quizAttempt.studentId, s.id),
						eq(quizAttempt.mode, "practice"),
						eq(quizAttempt.status, "submitted"),
						inArray(quizAttempt.testId, testIds),
					),
				)
				.orderBy(desc(quizAttempt.submittedAt), desc(quizAttempt.id));
			for (const row of attemptRows) {
				// Đã sắp mới nhất trước — lần đầu gặp testId là lượt gần nhất.
				if (row.testId && !lastAttemptByTest.has(row.testId)) {
					lastAttemptByTest.set(row.testId, row);
				}
			}
		}

		const items = rows.map((row) => {
			const lastAttempt = lastAttemptByTest.get(row.id) ?? null;
			return {
				testId: row.id,
				title: row.title,
				skill: row.skill as PracticeSkill,
				parts: partCounts.get(row.id) ?? 0,
				collection: row.collection ?? null,
				testGroup: row.testGroup ?? null,
				durationMin:
					row.timeLimitSeconds === null
						? null
						: Math.round(row.timeLimitSeconds / 60),
				lastAttempt: lastAttempt
					? {
							submittedAt: lastAttempt.submittedAt
								? lastAttempt.submittedAt.toISOString()
								: "",
							// Cùng ngữ nghĩa "đã chấm" với toQuizAttemptGrade: cần cả
							// scores lẫn gradedAt.
							status:
								lastAttempt.gradeScores && lastAttempt.gradedAt
									? ("graded" as const)
									: ("submitted" as const),
							score: practiceScoreLabel(lastAttempt, lastAttempt.id),
						}
					: null,
			};
		});

		const response: PracticeCatalogResponse = {
			items,
			page,
			pages: Math.max(1, Math.ceil(total / PRACTICE_CATALOG_PAGE_SIZE)),
			total,
		};
		return c.json(response);
	});

	/**
	 * GET /api/student/practice/:testId/quiz — đề sạch cho take screen, cùng
	 * shape StudentQuizDetail với luồng assignment. `attempt` là lượt ĐANG
	 * LÀM gần nhất (resume); lượt đã nộp KHÔNG trả về ở đây — practice làm
	 * lại được nên client start lượt mới thay vì chặn 409.
	 */
	router.get("/practice/:testId/quiz", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const db: Db = deps.getDb();
		const testId = c.req.param("testId");

		const loaded = await loadPracticeTestWithParts(db, orgId, testId);
		if (!loaded || loaded.parts.length === 0) {
			return c.json({ error: "test not found" }, 404);
		}

		const [attempt] = await db
			.select()
			.from(quizAttempt)
			.where(
				and(
					eq(quizAttempt.orgId, orgId),
					eq(quizAttempt.studentId, s.id),
					eq(quizAttempt.testId, testId),
					eq(quizAttempt.mode, "practice"),
					eq(quizAttempt.status, "in_progress"),
				),
			)
			.orderBy(desc(quizAttempt.startedAt), desc(quizAttempt.id))
			.limit(1);

		const questions = attempt
			? parseQuizQuestions(attempt.questionsSnapshot, attempt.id)
			: buildMergedQuestions(loaded.parts, testId);
		const detail = toPracticeQuizDetail(loaded, questions, attempt ?? null);
		const verified = assertValidDetail(detail);
		if (!verified) {
			// Snapshot/đề hỏng không bao giờ xuống wire dưới shape sai — cùng
			// chính sách guard với luồng assignment (parse fallback []).
			return c.json({ error: "test not found" }, 404);
		}
		return c.json(verified);
	});

	/**
	 * POST /api/student/practice/:testId/attempts — tạo lượt tự luyện
	 * (mode=practice, snapshot đề đầy đủ key lúc start). Idempotent resume:
	 * lượt đang làm → trả lại cùng attemptId (200); KHÔNG có 409 submitted
	 * như luồng assignment vì practice làm lại được (unique index coi NULL
	 * khác nhau, mỗi lượt là 1 row mới).
	 */
	router.post("/practice/:testId/attempts", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const db: Db = deps.getDb();
		const testId = c.req.param("testId");

		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		if (!quizAttemptActionSchema.safeParse(raw).success) {
			return c.json({ error: "invalid body" }, 400);
		}

		const loaded = await loadPracticeTestWithParts(db, orgId, testId);
		if (!loaded || loaded.parts.length === 0) {
			return c.json({ error: "test not found" }, 404);
		}

		const practiceFilter = and(
			eq(quizAttempt.orgId, orgId),
			eq(quizAttempt.studentId, s.id),
			eq(quizAttempt.testId, testId),
			eq(quizAttempt.mode, "practice"),
			eq(quizAttempt.status, "in_progress"),
		);
		const [existing] = await db
			.select({ id: quizAttempt.id })
			.from(quizAttempt)
			.where(practiceFilter)
			.orderBy(desc(quizAttempt.startedAt), desc(quizAttempt.id))
			.limit(1);
		if (existing) {
			const resume: StartPracticeResponse = { attemptId: existing.id };
			return c.json(resume, 200);
		}

		const attemptId = crypto.randomUUID();
		await db.insert(quizAttempt).values({
			id: attemptId,
			orgId,
			assignmentId: null,
			studentId: s.id,
			testId,
			mode: "practice",
			questionsSnapshot: JSON.stringify(
				buildMergedQuestions(loaded.parts, testId),
			),
			answers: "{}",
			startedAt: new Date(),
		});
		const created: StartPracticeResponse = startPracticeResponseSchema.parse({
			attemptId,
		});
		return c.json(created, 201);
	});

	return router;
}
