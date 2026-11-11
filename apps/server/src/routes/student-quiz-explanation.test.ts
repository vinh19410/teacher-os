import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import type {
	AssignmentQuestion,
	KernelSnapshot,
	QuizAttemptDetail,
} from "@teacher-os/api/contracts";
import { quizAttemptDetailSchema } from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { SessionUser } from "../session";
import { fillExplanationsFromCurrent, parseQuizQuestions } from "./student";

const CORS_ORIGINS = ["http://localhost:8003"];
const STUDENT_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

const OWNER = { "x-test-user": "student" };
const writeHeaders = {
	"x-test-user": "student",
	Origin: STUDENT_ORIGIN,
	"Content-Type": "application/json",
};

const EXPLANATION_Q1 = "<p>Đoạn 2 nói thủ đô là <strong>Paris</strong>.</p>";
const EXPLANATION_P2 = "<p>Giải thích part 2 — đáp án B.</p>";

/** Đề có giải thích ở câu 1, câu 2 không có, câu 3 chỉ có khoảng trắng. */
const QUESTIONS_WITH_EXPLANATION = [
	{
		stem: "Câu 1 — thủ đô",
		opts: null,
		answer: "Paris",
		alts: "",
		pin: null,
		explanation: EXPLANATION_Q1,
	},
	{ stem: "Câu 2 — chọn", opts: ["A", "B"], answer: "B", alts: "", pin: null },
	{
		stem: "Câu 3 — đúng sai",
		opts: null,
		answer: "TRUE",
		alts: "",
		pin: null,
		explanation: "   ",
	},
];

/** Snapshot cũ: cùng đề nhưng parser thời đó đã strip explanation. */
const LEGACY_SNAPSHOT = QUESTIONS_WITH_EXPLANATION.map(
	({ explanation: _drop, ...rest }) => ({ ...rest, type: null }),
);

const q = (
	overrides: Partial<AssignmentQuestion> = {},
): AssignmentQuestion => ({
	stem: "S",
	opts: null,
	answer: "A",
	alts: "",
	...overrides,
});

describe("parseQuizQuestions — forward explanation (#358)", () => {
	test("giữ explanation có nội dung, bỏ explanation rỗng/không phải string", () => {
		const parsed = parseQuizQuestions(
			JSON.stringify([
				{ stem: "a", answer: "x", explanation: "<p>vì</p>" },
				{ stem: "b", answer: "y", explanation: "  " },
				{ stem: "c", answer: "z", explanation: 42 },
				{ stem: "d", answer: "w" },
			]),
			"row",
		);
		expect(parsed.map((question) => question.explanation)).toEqual([
			"<p>vì</p>",
			undefined,
			undefined,
			undefined,
		]);
		// Câu không có giải thích giữ đúng shape cũ (không sinh key).
		expect("explanation" in (parsed[3] ?? {})).toBe(false);
	});
});

describe("fillExplanationsFromCurrent — fallback snapshot cũ (#358)", () => {
	test("đề chưa đổi → lấy giải thích từ đề hiện hành", () => {
		const out = fillExplanationsFromCurrent(
			[q({ stem: "1", answer: "A" }), q({ stem: "2", answer: "B" })],
			[
				q({ stem: "1", answer: "A", explanation: "e1" }),
				q({ stem: "2", answer: "B" }),
			],
		);
		expect(out.map((question) => question.explanation)).toEqual([
			"e1",
			undefined,
		]);
	});

	test("khác số câu → bỏ fallback", () => {
		const snapshot = [q({ stem: "1" })];
		expect(
			fillExplanationsFromCurrent(snapshot, [
				q({ stem: "1", explanation: "e1" }),
				q({ stem: "2", explanation: "e2" }),
			]),
		).toBe(snapshot);
	});

	test("một câu đổi stem hoặc answer → bỏ fallback cho CẢ đề", () => {
		const snapshot = [q({ stem: "1", answer: "A" }), q({ stem: "2" })];
		expect(
			fillExplanationsFromCurrent(snapshot, [
				q({ stem: "1", answer: "A", explanation: "e1" }),
				q({ stem: "2 (đã sửa)", explanation: "e2" }),
			]),
		).toBe(snapshot);
		expect(
			fillExplanationsFromCurrent(snapshot, [
				q({ stem: "1", answer: "C", explanation: "e1" }),
				q({ stem: "2", explanation: "e2" }),
			]),
		).toBe(snapshot);
	});

	test("câu snapshot đã có giải thích giữ nguyên", () => {
		const out = fillExplanationsFromCurrent(
			[q({ stem: "1", explanation: "snapshot" })],
			[q({ stem: "1", explanation: "current" })],
		);
		expect(out[0]?.explanation).toBe("snapshot");
	});
});

describe("student review detail — giải thích đáp án (#358)", () => {
	let app: ServerApp;
	let libsql: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		await libsql
			.insert(schema.organization)
			.values({ id: "org-1", name: "Academy 1" });
		await libsql.insert(schema.student).values({
			id: "student-1",
			orgId: "org-1",
			name: "Minh Tran",
			email: "minh@gmail.com",
			phone: "0901234567",
		});
		await libsql.insert(schema.classTable).values({
			id: "class-1",
			orgId: "org-1",
			name: "IELTS Foundation",
			level: "IELTS 5.0–6.0",
			mode: "Online",
			schedule: "T2 & T5 18:30–20:00",
			sessionsDone: 0,
			sessionsTotal: 20,
			status: "active",
		});

		const promptBase = {
			orgId: "org-1",
			task: "task1",
			genre: "",
			skill: "reading",
			part: "p1",
			type: "info",
			prompt: "Read the passage and answer.",
			passage: "<p>Passage body</p>",
			optionBank: "[]",
			note: "<p>Ghi chú chung của đề</p>",
			status: "ready",
		} as const;
		await libsql.insert(schema.assignmentPrompt).values([
			{
				...promptBase,
				id: "prompt-expl",
				title: "Explained",
				questions: JSON.stringify(QUESTIONS_WITH_EXPLANATION),
			},
			{
				...promptBase,
				id: "prompt-expl-p2",
				part: "p2",
				title: "Explained part 2",
				questions: JSON.stringify([
					{
						stem: "P2 — chọn",
						opts: ["A", "B"],
						answer: "B",
						alts: "",
						pin: null,
						explanation: EXPLANATION_P2,
					},
				]),
			},
			{
				...promptBase,
				id: "prompt-plain",
				title: "No explanations",
				questions: JSON.stringify(LEGACY_SNAPSHOT),
			},
		]);

		for (const [id, promptId] of [
			["ca-live", "prompt-expl"],
			["ca-legacy", "prompt-expl"],
			["ca-drift", "prompt-expl"],
			["ca-plain", "prompt-plain"],
		] as const) {
			await libsql.insert(schema.classAssignment).values({
				id,
				orgId: "org-1",
				classId: "class-1",
				promptId,
				title: `Quiz ${id}`,
				due: "2099-01-10",
			});
			await libsql.insert(schema.classAssignmentTarget).values({
				id: `cat-${id}`,
				orgId: "org-1",
				assignmentId: id,
				studentId: "student-1",
				submittedAt: null,
			});
		}

		await libsql.insert(schema.assignmentTest).values({
			id: "test-expl",
			orgId: "org-1",
			title: "Practice explained",
			skill: "reading",
			status: "ready",
		});
		await libsql.insert(schema.assignmentTestPart).values([
			{
				id: "atp-expl-1",
				testId: "test-expl",
				promptId: "prompt-expl",
				part: "p1",
				position: 1,
			},
			{
				id: "atp-expl-2",
				testId: "test-expl",
				promptId: "prompt-expl-p2",
				part: "p2",
				position: 2,
			},
		]);

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> =>
				headers.get("x-test-user") === "student"
					? {
							userId: "u-1",
							userName: "Minh Tran",
							email: "minh@gmail.com",
							emailVerified: true,
							role: "student",
						}
					: null,
			authHandler: () => new Response("auth OK"),
		});
	});

	const getDetail = (attemptId: string) =>
		app.request(`/api/student/attempts/${attemptId}/detail`, {
			headers: OWNER,
		});
	const submit = (attemptId: string) =>
		app.request(`/api/student/attempts/${attemptId}/submit`, {
			method: "POST",
			headers: writeHeaders,
			body: "{}",
		});

	async function seedSubmittedAttempt(
		id: string,
		values: Partial<typeof schema.quizAttempt.$inferInsert>,
	) {
		await libsql.insert(schema.quizAttempt).values({
			id,
			orgId: "org-1",
			studentId: "student-1",
			questionsSnapshot: JSON.stringify(LEGACY_SNAPSHOT),
			answers: "{}",
			status: "submitted",
			correctCount: 0,
			startedAt: new Date("2026-10-01T00:00:00Z"),
			submittedAt: new Date("2026-10-01T00:10:00Z"),
			...values,
		});
	}

	test("luồng thật: take không lộ giải thích, detail 409 khi đang làm, sau nộp có giải thích từng câu", async () => {
		const start = await app.request(
			"/api/student/assignments/ca-live/quiz/start",
			{ method: "POST", headers: writeHeaders, body: "{}" },
		);
		expect(start.status).toBe(201);
		const { attemptId } = (await start.json()) as { attemptId: string };

		// Snapshot lúc start giữ explanation (parser không còn strip).
		const [row] = await libsql
			.select({ snapshot: schema.quizAttempt.questionsSnapshot })
			.from(schema.quizAttempt)
			.where(eq(schema.quizAttempt.id, attemptId));
		expect(row?.snapshot).toContain("Đoạn 2 nói thủ đô");

		// Take payload (đã có attempt → đọc snapshot) không có giải thích.
		const take = await app.request("/api/student/assignments/ca-live/quiz", {
			headers: OWNER,
		});
		expect(take.status).toBe(200);
		const takeText = await take.text();
		expect(takeText).not.toContain('"explanation"');
		expect(takeText).not.toContain("Đoạn 2 nói thủ đô");

		// Chưa nộp → detail 409, không lộ giải thích.
		const early = await getDetail(attemptId);
		expect(early.status).toBe(409);
		expect(await early.text()).not.toContain("Đoạn 2 nói thủ đô");

		expect((await submit(attemptId)).status).toBe(200);
		const res = await getDetail(attemptId);
		expect(res.status).toBe(200);
		const body = (await res.json()) as QuizAttemptDetail;
		// Payload khớp contract strict của client student.
		expect(quizAttemptDetailSchema.safeParse(body).success).toBe(true);
		expect(body.questions[0]?.explanation).toBe(EXPLANATION_Q1);
		// Câu không có / chỉ khoảng trắng → không sinh key.
		expect("explanation" in (body.questions[1] ?? {})).toBe(false);
		expect("explanation" in (body.questions[2] ?? {})).toBe(false);
		expect(body.note).toBe("<p>Ghi chú chung của đề</p>");
	});

	test("attempt cũ (snapshot đã strip) → fallback giải thích từ đề hiện hành", async () => {
		await seedSubmittedAttempt("attempt-legacy", { assignmentId: "ca-legacy" });
		const res = await getDetail("attempt-legacy");
		expect(res.status).toBe(200);
		const body = (await res.json()) as QuizAttemptDetail;
		expect(body.questions[0]?.explanation).toBe(EXPLANATION_Q1);
		expect("explanation" in (body.questions[1] ?? {})).toBe(false);
	});

	test("attempt cũ nhưng đề đã đổi → không gắn giải thích lệch câu", async () => {
		await seedSubmittedAttempt("attempt-drift", {
			assignmentId: "ca-drift",
			questionsSnapshot: JSON.stringify(
				LEGACY_SNAPSHOT.map((question, index) =>
					index === 0 ? { ...question, stem: "Câu 1 — bản cũ" } : question,
				),
			),
		});
		const res = await getDetail("attempt-drift");
		expect(res.status).toBe(200);
		const body = (await res.json()) as QuizAttemptDetail;
		for (const question of body.questions) {
			expect("explanation" in question).toBe(false);
		}
	});

	test("attempt cũ chưa nộp → vẫn 409 (fallback không mở gate)", async () => {
		await libsql.insert(schema.quizAttempt).values({
			id: "attempt-legacy-open",
			orgId: "org-1",
			studentId: "student-1",
			assignmentId: "ca-plain",
			questionsSnapshot: JSON.stringify(LEGACY_SNAPSHOT),
			answers: "{}",
			startedAt: new Date("2026-10-01T00:00:00Z"),
		});
		const res = await getDetail("attempt-legacy-open");
		expect(res.status).toBe(409);
	});

	test("tự luyện: snapshot gộp part giữ giải thích; take không lộ; detail sau nộp có", async () => {
		const start = await app.request(
			"/api/student/practice/test-expl/attempts",
			{ method: "POST", headers: writeHeaders, body: "{}" },
		);
		expect(start.status).toBe(201);
		const { attemptId } = (await start.json()) as { attemptId: string };

		const take = await app.request("/api/student/practice/test-expl/quiz", {
			headers: OWNER,
		});
		expect(take.status).toBe(200);
		const takeText = await take.text();
		expect(takeText).not.toContain('"explanation"');
		expect(takeText).not.toContain("Giải thích part 2");

		expect((await submit(attemptId)).status).toBe(200);
		const res = await getDetail(attemptId);
		expect(res.status).toBe(200);
		const body = (await res.json()) as QuizAttemptDetail;
		expect(body.questions.map((question) => question.explanation)).toEqual([
			EXPLANATION_Q1,
			undefined,
			undefined,
			EXPLANATION_P2,
		]);
	});

	test("tự luyện cũ (snapshot đã strip) → fallback gộp part theo position", async () => {
		await seedSubmittedAttempt("attempt-practice-legacy", {
			mode: "practice",
			testId: "test-expl",
			questionsSnapshot: JSON.stringify([
				...LEGACY_SNAPSHOT,
				{
					stem: "P2 — chọn",
					opts: ["A", "B"],
					answer: "B",
					alts: "",
					pin: null,
					type: "info",
				},
			]),
		});
		const res = await getDetail("attempt-practice-legacy");
		expect(res.status).toBe(200);
		const body = (await res.json()) as QuizAttemptDetail;
		expect(body.questions[0]?.explanation).toBe(EXPLANATION_Q1);
		expect(body.questions[3]?.explanation).toBe(EXPLANATION_P2);
	});
});

describe("teacher prompt create/PATCH -> student quiz take & detail round-trip (#571)", () => {
	const WEB_ORIGIN = "http://localhost:8001";
	const teacherHeaders = {
		"x-test-user": "teacher",
		Origin: WEB_ORIGIN,
		"Content-Type": "application/json",
	};
	const studentHeaders = {
		"x-test-user": "student-571",
		Origin: STUDENT_ORIGIN,
		"Content-Type": "application/json",
	};

	test("POST /prompts lưu explanation, PATCH /prompts/:id cập nhật + hiện ở /kernel, ẩn ở /quiz đang làm và trả về ở /attempts/:id/detail sau nộp", async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		const libsql = db as unknown as Db;
		const now = new Date();
		await libsql.insert(schema.user).values({
			id: "teacher-571",
			name: "Cô Mỹ",
			email: "comy@academy.vn",
			emailVerified: true,
			role: "teacher",
			createdAt: now,
			updatedAt: now,
		});

		const app = buildApp({
			getDb: () => libsql,
			corsOrigin: [WEB_ORIGIN, STUDENT_ORIGIN],
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				const who = headers.get("x-test-user");
				if (who === "teacher") {
					return {
						userId: "teacher-571",
						userName: "Cô Mỹ",
						email: "comy@academy.vn",
						emailVerified: true,
						role: "teacher",
					};
				}
				if (who === "student-571") {
					return {
						userId: "u-student-571",
						userName: "Minh 571",
						email: "minh-571@gmail.com",
						emailVerified: true,
						role: "student",
					};
				}
				return null;
			},
			authHandler: () => new Response("auth OK"),
		});

		// 1. Giáo viên tạo đề Reading có explanation qua endpoint thật của composer.
		const createRes = await app.request("/api/assignments/prompts", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				skill: "reading",
				part: "p1",
				type: "tfng",
				title: "Reading TFNG #571",
				band: "7.0",
				source: "Cambridge 18",
				prompt: "",
				passage: "<p>Stepwells are underground reservoirs.</p>",
				intro: "<p>TRUE / FALSE / NOT GIVEN</p>",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				imageUrl: "",
				optionBank: [],
				note: "",
				status: "ready",
				questions: [
					{
						stem: "Stepwells were built above ground.",
						opts: null,
						answer: "FALSE",
						alts: "",
						pin: null,
						explanation: "<p>Đoạn 1 dòng 4 chứng minh FALSE.</p>",
					},
				],
			}),
		});
		expect(createRes.status).toBe(201);
		const { id: promptId } = (await createRes.json()) as { id: string };

		// 2. Giáo viên bấm Cập nhật đề (PATCH không có skill/part) sửa explanation.
		const patchRes = await app.request(`/api/assignments/prompts/${promptId}`, {
			method: "PATCH",
			headers: teacherHeaders,
			body: JSON.stringify({
				questions: [
					{
						stem: "Stepwells were built above ground.",
						opts: null,
						answer: "FALSE",
						alts: "",
						pin: null,
						explanation: "<p>Đoạn 1 dòng 5 chứng minh FALSE (đã cập nhật).</p>",
					},
				],
			}),
		});
		expect(patchRes.status).toBe(200);

		const kernelRes = await app.request("/api/kernel", {
			headers: { "x-test-user": "teacher" },
		});
		expect(kernelRes.status).toBe(200);
		const snapshot = (await kernelRes.json()) as KernelSnapshot;
		const savedPrompt = snapshot.assignmentPrompts.find(
			(p) => p.id === promptId,
		);
		expect(savedPrompt?.questions[0]?.explanation).toBe(
			"<p>Đoạn 1 dòng 5 chứng minh FALSE (đã cập nhật).</p>",
		);

		// 3. Tạo lớp + học viên active trong cùng org rồi giao đề.
		const classRes = await app.request("/api/classes", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				name: "IELTS Reading #571",
				type: "ielts",
				skills: ["Reading"],
				schedule: { days: [1, 3], start: "18:30", end: "20:00" },
				sessionsTotal: 8,
				tuitionFee: 3000000,
				startDate: "2029-01-08",
			}),
		});
		expect(classRes.status).toBe(201);
		const { id: classId } = (await classRes.json()) as { id: string };

		const stRes = await app.request("/api/students", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				name: "Minh 571",
				email: "minh-571@gmail.com",
				classId,
				activateNow: true,
			}),
		});
		expect(stRes.status).toBe(201);
		const { id: studentId } = (await stRes.json()) as { id: string };

		const assignRes = await app.request(`/api/classes/${classId}/assignments`, {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				promptId,
				due: "2099-12-31",
				note: "Làm bài đọc",
				studentIds: [studentId],
			}),
		});
		expect(assignRes.status).toBe(201);
		const { id: assignmentId } = (await assignRes.json()) as { id: string };

		// 4. Học viên bắt đầu làm bài: GET /quiz KHÔNG lộ explanation.
		const startRes = await app.request(
			`/api/student/assignments/${assignmentId}/quiz/start`,
			{ method: "POST", headers: studentHeaders, body: "{}" },
		);
		expect(startRes.status).toBe(201);
		const { attemptId } = (await startRes.json()) as { attemptId: string };

		const takeRes = await app.request(
			`/api/student/assignments/${assignmentId}/quiz`,
			{ headers: { "x-test-user": "student-571" } },
		);
		expect(takeRes.status).toBe(200);
		const takeText = await takeRes.text();
		expect(takeText).not.toContain("explanation");
		expect(takeText).not.toContain("chứng minh FALSE");

		// 5. Học viên nộp bài: GET /attempts/:attemptId/detail trả đúng explanation.
		const submitRes = await app.request(
			`/api/student/attempts/${attemptId}/submit`,
			{ method: "POST", headers: studentHeaders, body: "{}" },
		);
		expect(submitRes.status).toBe(200);

		const detailRes = await app.request(
			`/api/student/attempts/${attemptId}/detail`,
			{ headers: { "x-test-user": "student-571" } },
		);
		expect(detailRes.status).toBe(200);
		const detail = (await detailRes.json()) as QuizAttemptDetail;
		expect(quizAttemptDetailSchema.safeParse(detail).success).toBe(true);
		expect(detail.questions[0]?.explanation).toBe(
			"<p>Đoạn 1 dòng 5 chứng minh FALSE (đã cập nhật).</p>",
		);
	});
});
