import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { ASSIGNMENT_PART_TYPES } from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../../app";
import { createFakeAiGrader } from "../../lib/ai-grading/fake-grader";
import type { SessionUser } from "../../session";

// #630 phase-1: PATCH /api/assignments/prompts/:id phải từ chối mọi thay đổi
// nội dung trên đề đã có quiz_attempt (409 PROMPT_CONTENT_LOCKED), vẫn cho
// sửa metadata (title/band/source/status) và cho qua save-lại-y-nguyên.
const CORS_ORIGINS = ["http://localhost:8001", "http://localhost:8003"];
const TEACHER_ORIGIN = "http://localhost:8001";
const STUDENT_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../../packages/db/src/migrations", import.meta.url).href,
);

const TEACHER_1 = { "x-test-user": "teacher-1" };
const STUDENT_1 = { "x-test-user": "student-1" };

const sessionFor = async (headers: Headers): Promise<SessionUser | null> => {
	const key = headers.get("x-test-user");
	if (key === "teacher-1") {
		return { userId: "t-1", userName: "Cô Mỹ", role: "teacher" };
	}
	if (key === "student-1") {
		return {
			userId: "u-s1",
			userName: "Minh",
			email: "minh@test.local",
			emailVerified: true,
			role: "student",
		};
	}
	return null;
};

// Cột nội dung bị khoá theo attempt (metadata title/band/source/status không
// nằm trong danh sách này).
const CONTENT_COLUMNS = [
	"type",
	"genre",
	"prompt",
	"intro",
	"passage",
	"transcript",
	"cueTopic",
	"cuePoints",
	"audioName",
	"imageUrl",
	"note",
	"questions",
	"optionBank",
	"writingPart",
	"writingType",
	"writingPrompt",
] as const;

const vocabPart = ASSIGNMENT_PART_TYPES.vocabulary.parts[0] ?? "topic";
const vocabType =
	ASSIGNMENT_PART_TYPES.vocabulary.types[vocabPart]?.[0] ?? "mcq";

describe("PATCH /api/assignments/prompts/:id — prompt content lock theo quiz_attempt (#630)", () => {
	let app: ServerApp;
	let db: Db;
	let backgroundJobs: Promise<unknown>[];

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const rawDb = drizzle(client, { schema });
		await migrate(rawDb, { migrationsFolder: MIGRATIONS_DIR });
		db = rawDb as unknown as Db;
		backgroundJobs = [];

		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Ms My IELTS" },
			{ id: "org-2", name: "Other Org" },
		]);
		await db.insert(schema.user).values([
			{ id: "t-1", name: "Cô Mỹ", email: "my@test.local", role: "teacher" },
			{ id: "u-s1", name: "Minh", email: "minh@test.local", role: "student" },
			{ id: "u-o2", name: "Lan", email: "lan-o2@test.local", role: "student" },
		]);
		await db.insert(schema.membership).values({
			id: "mem-1",
			orgId: "org-1",
			userId: "t-1",
			role: "teacher",
		});
		await db.insert(schema.student).values([
			{
				id: "st-1",
				orgId: "org-1",
				name: "Minh",
				email: "minh@test.local",
				phone: "0901111111",
			},
			{
				id: "st-o2",
				orgId: "org-2",
				name: "Lan org-2",
				email: "lan-o2@test.local",
				phone: "0903333333",
			},
		]);
		await db.insert(schema.classTable).values([
			{
				id: "cls-1",
				orgId: "org-1",
				name: "IELTS 6.5",
				level: "IELTS 6.0–6.5",
				mode: "Online",
				schedule: "T3 & T6 19:00–20:30",
				sessionsDone: 0,
				sessionsTotal: 20,
				status: "active",
			},
			{
				id: "cls-o2",
				orgId: "org-2",
				name: "Org 2 Class",
				level: "IELTS 5.0–6.0",
				mode: "Online",
				schedule: "T2 & T4 19:00–20:30",
				sessionsDone: 0,
				sessionsTotal: 20,
				status: "active",
			},
		]);
		await db.insert(schema.enrollment).values({
			id: "enr-1",
			orgId: "org-1",
			classId: "cls-1",
			studentId: "st-1",
			status: "active",
		});

		app = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: sessionFor,
			authHandler: () => new Response("ok"),
			getAiGrader: () => createFakeAiGrader(),
			runInBackground: (promise) => {
				backgroundJobs.push(promise);
			},
		});
	});

	async function drainBackground() {
		while (backgroundJobs.length > 0) {
			const batch = backgroundJobs.splice(0, backgroundJobs.length);
			await Promise.allSettled(batch);
		}
	}

	async function teacherCall(
		path: string,
		method = "GET",
		body?: unknown,
		contentType = "application/json",
	) {
		const headers: Record<string, string> = {
			...TEACHER_1,
			origin: TEACHER_ORIGIN,
		};
		let payload: string | undefined;
		if (body !== undefined) {
			headers["content-type"] = contentType;
			payload = typeof body === "string" ? body : JSON.stringify(body);
		}
		return app.request(path, { method, headers, body: payload });
	}

	async function studentCall(path: string, method = "GET", body?: unknown) {
		const headers: Record<string, string> = {
			...STUDENT_1,
			origin: STUDENT_ORIGIN,
		};
		if (body !== undefined) {
			headers["content-type"] = "application/json";
		}
		return app.request(path, {
			method,
			headers,
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
	}

	async function createVocabPrompt(
		overrides: Record<string, unknown> = {},
	): Promise<string> {
		const res = await teacherCall("/api/assignments/prompts", "POST", {
			skill: "vocabulary",
			part: vocabPart,
			type: vocabType,
			title: "Vocab quiz tuần 3",
			band: "6.5",
			source: "Unit 3",
			prompt: "",
			passage: "<p>Context passage gốc.</p>",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			questions: [
				{
					stem: "Q1: chọn đồng nghĩa ubiquitous",
					opts: ["rare", "omnipresent", "tiny", "loud"],
					answer: "B",
					alts: "",
				},
				{
					stem: "Q2: chọn trái nghĩa flexible",
					opts: ["stiff", "bendy", "soft", "loose"],
					answer: "A",
					alts: "",
				},
			],
			optionBank: [],
			note: "<p>Ghi chú gốc.</p>",
			status: "ready",
			...overrides,
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		return id;
	}

	/** Giao đề cho lớp cls-1 (org-1) cho st-1 rồi start attempt bằng API. */
	async function assignAndStartAttempt(promptId: string): Promise<string> {
		const assignRes = await teacherCall(
			"/api/classes/cls-1/assignments",
			"POST",
			{
				promptId,
				due: "2099-12-15",
				note: "",
				studentIds: ["st-1"],
			},
		);
		expect(assignRes.status).toBe(201);
		const { id: caId } = (await assignRes.json()) as { id: string };
		const startRes = await studentCall(
			`/api/student/assignments/${caId}/quiz/start`,
			"POST",
			{},
		);
		expect(startRes.status).toBe(201);
		const { attemptId } = (await startRes.json()) as { attemptId: string };
		expect(attemptId).toBeTruthy();
		await drainBackground();
		return caId;
	}

	async function loadPromptRow(promptId: string) {
		const [row] = await db
			.select()
			.from(schema.assignmentPrompt)
			.where(eq(schema.assignmentPrompt.id, promptId));
		expect(row).toBeTruthy();
		return row as typeof schema.assignmentPrompt.$inferSelect;
	}

	test("attempt qua lượt giao lớp: PATCH passage → 409 PROMPT_CONTENT_LOCKED, DB không đổi", async () => {
		const promptId = await createVocabPrompt();
		await assignAndStartAttempt(promptId);
		const before = await loadPromptRow(promptId);

		const res = await teacherCall(
			`/api/assignments/prompts/${promptId}`,
			"PATCH",
			{
				passage: "<p>Passage đã bị sửa.</p>",
			},
		);
		expect(res.status).toBe(409);
		await expect(res.json()).resolves.toMatchObject({
			error: "prompt content locked",
			code: "PROMPT_CONTENT_LOCKED",
		});

		const after = await loadPromptRow(promptId);
		expect(after.passage).toBe(before.passage);
		expect(after.title).toBe(before.title);
	});

	test("attempt: PATCH questions → 409; PATCH optionBank → 409", async () => {
		const promptId = await createVocabPrompt();
		await assignAndStartAttempt(promptId);

		const patchQuestions = await teacherCall(
			`/api/assignments/prompts/${promptId}`,
			"PATCH",
			{
				questions: [
					{
						stem: "Q1: câu đã bị thay",
						opts: ["one", "two", "three", "four"],
						answer: "C",
						alts: "",
					},
				],
			},
		);
		expect(patchQuestions.status).toBe(409);
		await expect(patchQuestions.json()).resolves.toMatchObject({
			code: "PROMPT_CONTENT_LOCKED",
		});

		const patchBank = await teacherCall(
			`/api/assignments/prompts/${promptId}`,
			"PATCH",
			{ optionBank: ["label một", "label hai"] },
		);
		expect(patchBank.status).toBe(409);
		await expect(patchBank.json()).resolves.toMatchObject({
			code: "PROMPT_CONTENT_LOCKED",
		});
	});

	test("prompt gắn đề thư viện + attempt practice: PATCH prompt → 409", async () => {
		const promptId = await teacherCall("/api/assignments/prompts", "POST", {
			skill: "reading",
			part: "p1",
			type: "tfng",
			title: "Reading P1 thư viện",
			band: "6.5",
			source: "",
			prompt: "",
			passage: "<p>Passage thư viện.</p>",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			questions: [{ stem: "S1", opts: null, answer: "TRUE", alts: "" }],
			optionBank: [],
			note: "",
			status: "ready",
		}).then(async (res) => {
			expect(res.status).toBe(201);
			const { id } = (await res.json()) as { id: string };
			return id;
		});

		const testCreate = await teacherCall("/api/assignments/tests", "POST", {
			skill: "reading",
			title: "Reading Mock tự luyện",
			description: "",
			timeLimitSeconds: 3600,
			collection: "",
			testGroup: "",
		});
		expect(testCreate.status).toBe(201);
		const { id: testId } = (await testCreate.json()) as { id: string };
		const attach = await teacherCall(
			`/api/assignments/tests/${testId}/parts`,
			"PUT",
			[{ part: "p1", promptId }],
		);
		expect(attach.status).toBe(200);
		// Practice chỉ thấy đề ready — phát hành qua PATCH meta của builder.
		const publish = await teacherCall(
			`/api/assignments/tests/${testId}`,
			"PATCH",
			{
				status: "ready",
			},
		);
		expect(publish.status).toBe(200);

		const start = await studentCall(
			`/api/student/practice/${testId}/attempts`,
			"POST",
			{},
		);
		expect(start.status).toBe(201);

		const res = await teacherCall(
			`/api/assignments/prompts/${promptId}`,
			"PATCH",
			{
				prompt: "<p>Câu hỏi đề đã bị sửa.</p>",
			},
		);
		expect(res.status).toBe(409);
		await expect(res.json()).resolves.toMatchObject({
			code: "PROMPT_CONTENT_LOCKED",
		});
	});

	test("attempt tồn tại nhưng chỉ sửa metadata title/band/source/status → 200 và DB cập nhật", async () => {
		const promptId = await createVocabPrompt();
		await assignAndStartAttempt(promptId);

		const res = await teacherCall(
			`/api/assignments/prompts/${promptId}`,
			"PATCH",
			{
				title: "Đổi tên không chạm nội dung",
				band: "7.0",
				source: "Unit 5 (đổi nguồn)",
				status: "draft",
			},
		);
		expect(res.status).toBe(200);

		const row = await loadPromptRow(promptId);
		expect(row.title).toBe("Đổi tên không chạm nội dung");
		expect(row.band).toBe("7.0");
		expect(row.source).toBe("Unit 5 (đổi nguồn)");
		expect(row.status).toBe("draft");
		expect(row.passage).toBe("<p>Context passage gốc.</p>");
	});

	test("attempt: resend toàn bộ content field y hệt DB + whitespace text field → 200, DB byte-identical", async () => {
		const promptId = await createVocabPrompt();
		await assignAndStartAttempt(promptId);
		const before = await loadPromptRow(promptId);

		const storedQuestions: unknown = JSON.parse(before.questions);
		const res = await teacherCall(
			`/api/assignments/prompts/${promptId}`,
			"PATCH",
			{
				// text fields kèm leading/trailing whitespace — zod tự trim phần lớn,
				// cuePoints không trim ở schema: handler phải tự chuẩn hoá 2 phía.
				type: before.type,
				prompt: `  ${before.prompt}  `,
				intro: `  ${before.intro}  `,
				passage: `  ${before.passage}  `,
				transcript: `  ${before.transcript}  `,
				cueTopic: `  ${before.cueTopic}  `,
				cuePoints: `  ${before.cuePoints}  `,
				audioName: `  ${before.audioName}  `,
				imageUrl: `  ${before.imageUrl}  `,
				note: `  ${before.note}  `,
				questions: storedQuestions,
				optionBank: JSON.parse(before.optionBank) as unknown,
				// metadata đổi thật để updates không rỗng — chứng tỏ gating theo field.
				title: "Rename trong lúc resend nguyên content",
			},
		);
		expect(res.status).toBe(200);

		const after = await loadPromptRow(promptId);
		expect(after.title).toBe("Rename trong lúc resend nguyên content");
		for (const column of CONTENT_COLUMNS) {
			expect(after[column], `column ${column} must be byte-identical`).toBe(
				before[column],
			);
		}
	});

	test("attempt + đề legacy (questions JSON lỗi schema): rename-only vẫn 200, không khoá nhầm", async () => {
		const promptId = await createVocabPrompt();
		await assignAndStartAttempt(promptId);

		// Giả lập đề cũ: questions JSON thiếu answer/alts — safeParse fail,
		// handler phải rơi về raw so sánh; payload rename-only KHÔNG gửi
		// questions nên không được tính là đổi nội dung (kongming ship-gate).
		const legacyQuestions = JSON.stringify([
			{ stem: "Q1 legacy thiếu đáp án", opts: ["A", "B"] },
		]);
		await db
			.update(schema.assignmentPrompt)
			.set({ questions: legacyQuestions })
			.where(eq(schema.assignmentPrompt.id, promptId));

		const res = await teacherCall(
			`/api/assignments/prompts/${promptId}`,
			"PATCH",
			{
				title: "Rename đề legacy",
			},
		);
		expect(res.status).toBe(200);

		const row = await loadPromptRow(promptId);
		expect(row.title).toBe("Rename đề legacy");
		expect(row.questions).toBe(legacyQuestions);
	});

	test("đề đã giao nhưng CHƯA có attempt: PATCH passage → 200 và DB cập nhật", async () => {
		const promptId = await createVocabPrompt();
		const assignRes = await teacherCall(
			"/api/classes/cls-1/assignments",
			"POST",
			{
				promptId,
				due: "2099-12-15",
				note: "",
				studentIds: ["st-1"],
			},
		);
		expect(assignRes.status).toBe(201);

		const res = await teacherCall(
			`/api/assignments/prompts/${promptId}`,
			"PATCH",
			{
				passage: "<p>Sửa trước khi học viên bắt đầu.</p>",
			},
		);
		expect(res.status).toBe(200);
		const row = await loadPromptRow(promptId);
		expect(row.passage).toBe("<p>Sửa trước khi học viên bắt đầu.</p>");
	});

	test("attempt của org KHÁC trùng prompt id: PATCH passage → 200 (lock query theo orgId)", async () => {
		const promptId = await createVocabPrompt();

		// Dựng attempt org-2 trỏ cùng prompt id (id prompt là PK toàn cục nên
		// chỉ có thể dựng bằng insert trực tiếp; API không tạo được trạng thái
		// cross-org này). Lock query phải lọc quizAttempt.orgId theo ctx.orgId.
		await db.insert(schema.classAssignment).values({
			id: "ca-o2",
			orgId: "org-2",
			classId: "cls-o2",
			promptId,
			title: "Bài của org 2",
			due: "2099-12-15",
		});
		await db.insert(schema.quizAttempt).values({
			id: "attempt-o2",
			orgId: "org-2",
			assignmentId: "ca-o2",
			studentId: "st-o2",
			mode: "assignment",
			questionsSnapshot: "[]",
			answers: "{}",
		});

		const res = await teacherCall(
			`/api/assignments/prompts/${promptId}`,
			"PATCH",
			{
				passage: "<p>Giáo viên org-1 sửa thoải mái.</p>",
			},
		);
		expect(res.status).toBe(200);
		const row = await loadPromptRow(promptId);
		expect(row.passage).toBe("<p>Giáo viên org-1 sửa thoải mái.</p>");
	});

	test("đề hybrid có writing + attempt: PATCH writing đổi → 409 WRITING_SECTION_LOCKED (ưu tiên trước content lock)", async () => {
		const promptId = await createVocabPrompt({
			writing: {
				part: "task2",
				type: "discuss",
				prompt: "<p>Writing task gốc.</p>",
			},
		});
		await assignAndStartAttempt(promptId);

		const res = await teacherCall(
			`/api/assignments/prompts/${promptId}`,
			"PATCH",
			{
				writing: {
					part: "task2",
					type: "opinion",
					prompt: "<p>Writing task đã đổi.</p>",
				},
			},
		);
		expect(res.status).toBe(409);
		await expect(res.json()).resolves.toMatchObject({
			code: "WRITING_SECTION_LOCKED",
		});
	});
});
