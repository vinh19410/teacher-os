import {
	type AssignmentQuestion,
	PRACTICE_CATALOG_PAGE_SIZE,
	PRACTICE_FILTER_MAX_LENGTH,
	PRACTICE_SKILLS,
	type PracticeCatalogFacets,
	type PracticeCatalogResponse,
	type PracticeSkill,
	parsePracticePageParam,
	quizAttemptActionSchema,
	type StartPracticeResponse,
	type StudentQuizDetail,
	type StudentQuizGroup,
	startPracticeResponseSchema,
	studentQuizDetailSchema,
	studentQuizGroupSchema,
} from "@teacher-os/api/contracts";
import { formatBand, ieltsOverallBand } from "@teacher-os/api/lib/ielts-band";
import { inferQuestionTypes } from "@teacher-os/api/lib/infer-question-types";
import {
	expandPracticeTypeFilter,
	sortPracticeBands,
	sortPracticeParts,
	sortPracticeTypes,
} from "@teacher-os/api/lib/practice-type-catalog";
import {
	assignmentPrompt,
	assignmentTest,
	assignmentTestPart,
	quizAttempt,
} from "@teacher-os/db/schema/index";
import { and, asc, count, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { type Context, Hono } from "hono";
import type { Db } from "../app";
import { syncLibraryTestsToOrg } from "../lib/library-test-sync";
import { toQuizAttemptMedia } from "../lib/media-response";
import { serveStudyPackAudio } from "../lib/study-pack-audio";
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

/** Chuẩn hoá thời lượng đề tự luyện: chỉ chấp nhận số nguyên dương (giây),
 * còn null hoặc dữ liệu cũ <= 0 được coi như không giới hạn thời gian. */
function normalizeTimeLimitSeconds(
	raw: number | null | undefined,
): number | null {
	return typeof raw === "number" && Number.isInteger(raw) && raw > 0
		? raw
		: null;
}

/** Fast-path + nested CASE JSON1: luôn trả mảng JSON hợp lệ (hoặc '[]'),
 * tránh lỗi `malformed JSON` khi cột text rỗng/hỏng trên SQLite/D1. */
function safeJsonArraySql(col: SQLiteColumn): SQL {
	return sql`CASE
		WHEN ${col} IN ('', '[]') THEN '[]'
		WHEN json_valid(${col}) = 1 THEN
			CASE WHEN json_type(${col}) = 'array' THEN ${col} ELSE '[]' END
		ELSE '[]'
	END`;
}

function safeJsonArrayLengthSql(col: SQLiteColumn): SQL {
	return sql`CASE
		WHEN ${col} IN ('', '[]') THEN 0
		WHEN json_valid(${col}) = 1 THEN
			CASE WHEN json_type(${col}) = 'array' THEN json_array_length(${col}) ELSE 0 END
		ELSE 0
	END`;
}

/** Trích `$.type` dạng string đã trim từ phần tử `json_each` — nested CASE
 * chặn tuyệt đối `malformed JSON` khi phần tử mảng là scalar/text trần và
 * loại bỏ giá trị `$.type` không phải text (number/array/object). */
function safeElementTypeSql(alias: "g" | "q"): SQL {
	const ref = sql.raw(alias);
	return sql`CASE
		WHEN ${ref}.type = 'object' THEN
			CASE
				WHEN json_type(${ref}.value, '$.type') = 'text'
				THEN trim(json_extract(${ref}.value, '$.type'))
			END
	END`;
}

function partMatchesTypeSql(expandedTypes: readonly string[]): SQL {
	const typeList = sql.join(
		expandedTypes.map((value) => sql`${value}`),
		sql`, `,
	);
	const safeGroups = safeJsonArraySql(assignmentPrompt.groups);
	const safeGroupsLen = safeJsonArrayLengthSql(assignmentPrompt.groups);
	const safeQuestions = safeJsonArraySql(assignmentPrompt.questions);
	const groupTypeExpr = safeElementTypeSql("g");
	const questionTypeExpr = safeElementTypeSql("q");
	return sql`(
		trim(${assignmentPrompt.type}) IN (${typeList})
		OR exists (
			select 1 from json_each(${safeGroups}) as g
			where ${groupTypeExpr} IN (${typeList})
		)
		OR (
			${safeGroupsLen} = 0
			and exists (
				select 1 from json_each(${safeQuestions}) as q
				where ${questionTypeExpr} IN (${typeList})
			)
		)
	)`;
}

function parseJsonStringList(raw: string | null | undefined): string[] {
	if (!raw || raw === "[]") return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((item): item is string => typeof item === "string");
	} catch {
		return [];
	}
}

function buildPracticeFacets(
	skill: PracticeSkill,
	collectionRows: ReadonlyArray<{ collection: string | null }>,
	partRows: ReadonlyArray<{
		part: string;
		band: string;
		promptType: string;
		groupTypesJson: string | null;
		questionTypesJson: string | null;
	}>,
): PracticeCatalogFacets {
	const collectionSet = new Set<string>();
	for (const row of collectionRows) {
		const trimmed = row.collection?.trim() ?? "";
		if (trimmed) collectionSet.add(trimmed);
	}
	const collections = [...collectionSet].sort((a, b) =>
		a.localeCompare(b, "en", { sensitivity: "base" }),
	);

	const parts: string[] = [];
	const bands: string[] = [];
	const rawTypes: string[] = [];
	for (const row of partRows) {
		if (row.part) parts.push(row.part);
		if (row.band) bands.push(row.band);
		if (row.promptType) rawTypes.push(row.promptType);
		rawTypes.push(...parseJsonStringList(row.groupTypesJson));
		rawTypes.push(...parseJsonStringList(row.questionTypesJson));
	}

	return {
		collections,
		types: sortPracticeTypes(skill, rawTypes),
		parts: sortPracticeParts(skill, parts),
		bands: sortPracticeBands(bands),
	};
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

function parseStudentQuizGroups(raw: string | undefined): StudentQuizGroup[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		const checked = studentQuizGroupSchema.array().safeParse(parsed);
		return checked.success ? checked.data : [];
	} catch {
		return [];
	}
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
	const groups =
		loaded.parts.length === 1 ? parseStudentQuizGroups(header?.groups) : [];
	const timeLimitSeconds = normalizeTimeLimitSeconds(
		loaded.test.timeLimitSeconds,
	);
	return {
		// Tự luyện không có lượt giao — trường giữ shape contract, client điều
		// hướng qua testId.
		assignmentId: "",
		title: loaded.test.title,
		// Practice không có hạn nộp.
		due: "",
		dueAt: null,
		timeLimitSeconds,
		partsCount: loaded.parts.length,
		collection: loaded.test.collection ?? null,
		testGroup: loaded.test.testGroup ?? null,
		description: loaded.test.description ?? null,
		skill: loaded.test.skill,
		part: loaded.parts[0]?.part ?? "",
		...effectiveDefaults,
		intro: header?.intro ?? "",
		prompt: header?.prompt ?? "",
		passage: header?.passage ?? "",
		cueTopic: header?.cueTopic ?? "",
		cuePoints: header?.cuePoints ?? "",
		audioName: header?.audioName ?? "",
		...(header?.audioUrl || header?.audioKey ? { hasAudio: true } : {}),
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
			...(question.answerSet ? { answerSet: question.answerSet } : {}),
		})),
		...(groups.length > 0 ? { groups } : {}),
		attempt: attempt
			? {
					id: attempt.id,
					status: attempt.status as "in_progress" | "submitted",
					answers: parseQuizAnswers(attempt.answers),
					essay: attempt.essay,
					media: toQuizAttemptMedia(attempt),
					startedAt: attempt.startedAt.toISOString(),
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
	const getNow = () => (deps.now ? deps.now() : new Date());

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
	 * GET /api/student/practice?skill=&collection=&part=&type=&band=&q=&page=&facets=1
	 * — catalog đề ready của org đang chọn, phân trang 12 (PRACTICE_CATALOG_PAGE_SIZE).
	 * `q` tìm theo tiêu đề (instr, không LIKE nên ký tự %/_ của học viên
	 * không thành wildcard); `collection` lọc khớp sau trim; `part`/`type`/`band`
	 * giao trên cùng 1 part qua 1 EXISTS duy nhất; `facets=1` trả bộ lọc toàn
	 * catalog `(orgId, skill)` độc lập trang/filter đang chọn.
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

		const rawCollection = c.req.query("collection");
		const rawPart = c.req.query("part");
		const rawType = c.req.query("type");
		const rawBand = c.req.query("band");
		const rawQ = c.req.query("q");
		for (const [label, value] of [
			["collection", rawCollection],
			["part", rawPart],
			["type", rawType],
			["band", rawBand],
			["query", rawQ],
		] as const) {
			if (value !== undefined && value.length > PRACTICE_FILTER_MAX_LENGTH) {
				return invalidParam(c, `invalid ${label}`);
			}
		}

		const collection = (rawCollection ?? "").trim();
		const part = (rawPart ?? "").trim();
		const type = (rawType ?? "").trim();
		const band = (rawBand ?? "").trim();
		const q = (rawQ ?? "").trim().toLowerCase();

		const rawPageParam = c.req.query("page");
		const page =
			rawPageParam === undefined ? 1 : parsePracticePageParam(rawPageParam);
		if (page === null) {
			return invalidParam(c, "invalid page");
		}

		const rawFacets = c.req.query("facets");
		const includeFacets = rawFacets === "1" || rawFacets === "true";

		// Đề thư viện (admin xuất bản) chỉ vào catalog sau khi có bản sao org.
		await syncLibraryTestsToOrg(db, orgId, skill);

		const testHeaderFilters: SQL[] = [
			eq(assignmentTest.orgId, orgId),
			eq(assignmentTest.status, "ready"),
			eq(assignmentTest.skill, skill),
		];
		const validPartExists = sql`exists (
			select 1 from ${assignmentTestPart}
			inner join ${assignmentPrompt}
				on ${assignmentPrompt.id} = ${assignmentTestPart.promptId}
				and ${assignmentPrompt.orgId} = ${orgId}
			where ${assignmentTestPart.testId} = ${assignmentTest.id}
		)`;

		const catalogFilters: SQL[] = [...testHeaderFilters];
		if (collection) {
			catalogFilters.push(
				sql`trim(coalesce(${assignmentTest.collection}, '')) = ${collection}`,
			);
		}
		if (q) {
			// instr thay LIKE: ký tự %/_ trong từ khoá học viên không thành
			// wildcard; q đã lowercase nên so khớp không phân biệt hoa/thường.
			catalogFilters.push(sql`instr(lower(${assignmentTest.title}), ${q}) > 0`);
		}

		if (part || band || type) {
			const partConditions: SQL[] = [
				eq(assignmentTestPart.testId, assignmentTest.id),
			];
			if (part) {
				partConditions.push(sql`trim(${assignmentTestPart.part}) = ${part}`);
			}
			if (band) {
				partConditions.push(sql`trim(${assignmentPrompt.band}) = ${band}`);
			}
			if (type) {
				const expandedTypes = expandPracticeTypeFilter(skill, type);
				if (expandedTypes.length > 0) {
					partConditions.push(partMatchesTypeSql(expandedTypes));
				}
			}
			catalogFilters.push(sql`exists (
				select 1 from ${assignmentTestPart}
				inner join ${assignmentPrompt}
					on ${assignmentPrompt.id} = ${assignmentTestPart.promptId}
					and ${assignmentPrompt.orgId} = ${orgId}
				where ${and(...partConditions)}
			)`);
		} else {
			catalogFilters.push(validPartExists);
		}

		const where = and(...catalogFilters);
		const totalQuery = db
			.select({ total: count() })
			.from(assignmentTest)
			.where(where);
		const rowsQuery = db
			.select()
			.from(assignmentTest)
			.where(where)
			.orderBy(desc(assignmentTest.createdAt), desc(assignmentTest.id))
			.limit(PRACTICE_CATALOG_PAGE_SIZE)
			.offset((page - 1) * PRACTICE_CATALOG_PAGE_SIZE);

		let totalRows: Array<{ total: number }>;
		let rows: Array<typeof assignmentTest.$inferSelect>;
		let facets: PracticeCatalogFacets | undefined;

		if (includeFacets) {
			const safeGroups = safeJsonArraySql(assignmentPrompt.groups);
			const safeGroupsLen = safeJsonArrayLengthSql(assignmentPrompt.groups);
			const safeQuestions = safeJsonArraySql(assignmentPrompt.questions);
			const groupTypeExpr = safeElementTypeSql("g");
			const questionTypeExpr = safeElementTypeSql("q");

			const collectionFacetQuery = db
				.selectDistinct({
					collection: sql<string>`trim(${assignmentTest.collection})`,
				})
				.from(assignmentTest)
				.where(
					and(
						...testHeaderFilters,
						validPartExists,
						sql`${assignmentTest.collection} IS NOT NULL AND trim(${assignmentTest.collection}) <> ''`,
					),
				);

			const partFacetQuery = db
				.selectDistinct({
					part: sql<string>`trim(${assignmentTestPart.part})`,
					band: sql<string>`trim(${assignmentPrompt.band})`,
					promptType: sql<string>`trim(${assignmentPrompt.type})`,
					groupTypesJson: sql<string>`(
						select json_group_array(distinct ${groupTypeExpr})
						from json_each(${safeGroups}) as g
						where ${groupTypeExpr} is not null and ${groupTypeExpr} <> ''
					)`,
					questionTypesJson: sql<string>`CASE
						WHEN ${safeGroupsLen} = 0 THEN (
							select json_group_array(distinct ${questionTypeExpr})
							from json_each(${safeQuestions}) as q
							where ${questionTypeExpr} is not null and ${questionTypeExpr} <> ''
						)
						ELSE '[]'
					END`,
				})
				.from(assignmentTest)
				.innerJoin(
					assignmentTestPart,
					eq(assignmentTestPart.testId, assignmentTest.id),
				)
				.innerJoin(
					assignmentPrompt,
					and(
						eq(assignmentPrompt.id, assignmentTestPart.promptId),
						eq(assignmentPrompt.orgId, orgId),
					),
				)
				.where(and(...testHeaderFilters));

			const [tRows, pageRows, colRows, partRows] = await db.batch([
				totalQuery,
				rowsQuery,
				collectionFacetQuery,
				partFacetQuery,
			]);
			totalRows = tRows;
			rows = pageRows;
			facets = buildPracticeFacets(skill, colRows, partRows);
		} else {
			const [tRows, pageRows] = await db.batch([totalQuery, rowsQuery]);
			totalRows = tRows;
			rows = pageRows;
		}

		const total = Number(totalRows[0]?.total ?? 0);

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
			const normalizedLimit = normalizeTimeLimitSeconds(row.timeLimitSeconds);
			return {
				testId: row.id,
				title: row.title,
				skill: row.skill as PracticeSkill,
				parts: partCounts.get(row.id) ?? 0,
				collection: row.collection ?? null,
				testGroup: row.testGroup ?? null,
				durationMin:
					normalizedLimit === null
						? null
						: Math.max(1, Math.round(normalizedLimit / 60)),
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
			...(facets ? { facets } : {}),
		};
		c.header("Cache-Control", "no-store");
		c.header("Vary", "Cookie, x-student-org-id");
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
			.orderBy(asc(quizAttempt.startedAt), asc(quizAttempt.id))
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
		c.header("X-Server-Now", getNow().toISOString());
		return c.json(verified);
	});

	/**
	 * GET /api/student/practice/:testId/audio — stream audio Listening của đề
	 * tự luyện (part đầu, ưu tiên R2 `audioKey` rồi `audioUrl`, dùng chung
	 * `serveStudyPackAudio` với luồng assignment).
	 */
	router.get("/practice/:testId/audio", async (c) => {
		const { orgId } = c.get("studentCtx");
		const db: Db = deps.getDb();
		const testId = c.req.param("testId");

		const loaded = await loadPracticeTestWithParts(db, orgId, testId);
		const header = loaded?.parts[0]?.prompt;
		if (!header || (!header.audioUrl && !header.audioKey)) {
			return c.json({ error: "audio not found" }, 404);
		}
		return serveStudyPackAudio({
			audioKey: header.audioKey,
			audioUrl: header.audioUrl,
			audioName: header.audioName,
			rangeHeader: c.req.header("Range"),
			ifNoneMatch: c.req.header("If-None-Match"),
			cacheControl: "private, no-cache",
			vary: "Cookie, x-student-org-id",
			getLibraryAudioStore: deps.getLibraryAudioStore,
			fetchExternalAudio: deps.fetchExternalAudio,
		});
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
			.orderBy(asc(quizAttempt.startedAt), asc(quizAttempt.id))
			.limit(1);
		if (existing) {
			const resume: StartPracticeResponse = { attemptId: existing.id };
			return c.json(resume, 200);
		}

		const attemptId = crypto.randomUUID();
		try {
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
				startedAt: getNow(),
			});
			const created: StartPracticeResponse = startPracticeResponseSchema.parse({
				attemptId,
			});
			return c.json(created, 201);
		} catch (err) {
			// Partial unique index (org_id, student_id, test_id) WHERE
			// mode='practice' AND status='in_progress' bắt request đồng thời:
			// đọc lại bản ghi duy nhất đang mở thay vì trả 500.
			const [raced] = await db
				.select({ id: quizAttempt.id })
				.from(quizAttempt)
				.where(practiceFilter)
				.orderBy(asc(quizAttempt.startedAt), asc(quizAttempt.id))
				.limit(1);
			if (raced) {
				const resumed: StartPracticeResponse =
					startPracticeResponseSchema.parse({ attemptId: raced.id });
				return c.json(resumed, 200);
			}
			throw err;
		}
	});

	return router;
}
