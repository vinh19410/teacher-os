import { createClient } from "@libsql/client";
import type {
	QuizAttemptDetail,
	QuizAttemptSummary,
	StudentQuizDetail,
} from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { SessionUser } from "../session";

const CORS_ORIGINS = ["http://localhost:8003"];
const STUDENT_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

/** Answer key lives ONLY here + in the DB — never in a take payload assert. */
const QUIZ_QUESTIONS = [
	{ stem: "Câu 1 — điền từ", opts: null, answer: "Paris", alts: "paris" },
	{ stem: "Câu 2 — chọn", opts: ["A", "B", "C", "D"], answer: "B", alts: "" },
	{ stem: "Câu 3 — đúng sai", opts: null, answer: "TRUE", alts: "" },
	{
		stem: "Câu 4 — điền từ",
		opts: null,
		answer: "northern",
		alts: "north / Northern",
	},
	{ stem: "Câu 5 — headings", opts: null, answer: "ii", alts: "" },
	{ stem: "Câu 6 — chọn", opts: ["A", "B", "C", "D"], answer: "C", alts: "" },
	{ stem: "Câu 7 — yes no", opts: null, answer: "YES", alts: "" },
	{ stem: "Câu 8 — letter", opts: null, answer: "E", alts: "" },
].map((question) => ({ ...question, pin: null }));

const OWNER = { "x-test-user": "google-verified" };
const writeHeaders = (origin: string = STUDENT_ORIGIN) => ({
	"x-test-user": "google-verified",
	Origin: origin,
	"Content-Type": "application/json",
});

describe("student quiz take & review (/api/student/* quiz attempt domain)", () => {
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

		// Owner student-1 (minh) + same-org NON-owner student-amb-1 (trung).
		await libsql.insert(schema.student).values([
			{
				id: "student-1",
				orgId: "org-1",
				name: "Minh Tran",
				email: "minh@gmail.com",
				phone: "0901234567",
			},
			{
				id: "student-amb-1",
				orgId: "org-1",
				name: "Trung A",
				email: "trung@test.local",
				phone: "0901111111",
			},
		]);

		await libsql.insert(schema.classTable).values({
			id: "class-1",
			orgId: "org-1",
			name: "IELTS Foundation",
			level: "IELTS 5.0–6.0",
			mode: "Online",
			schedule: "T2 & T5 18:30–20:00",
			sessionsDone: 10,
			sessionsTotal: 20,
			status: "active",
		});

		await libsql.insert(schema.assignmentPrompt).values({
			id: "prompt-quiz",
			orgId: "org-1",
			task: "task1",
			genre: "",
			skill: "reading",
			part: "p1",
			type: "info",
			title: "Reading Practice 1",
			prompt: "Read the passage and answer.",
			passage: "<p>Passage body</p>",
			questions: JSON.stringify(QUIZ_QUESTIONS),
			optionBank: JSON.stringify(["Alpha", "Beta", "Gamma", "Delta"]),
			note: "<p>Teacher-only explanation note</p>",
			status: "ready",
		});

		// Mỗi test một lượt giao riêng (1 attempt / assignment / student) —
		// state không chéo giữa các test.
		// Pin malformed (string coord / out-of-range) — parsePin phải sanitize
		// thành null, không tràn xuống wire (code-review: pin guard).
		await libsql.insert(schema.assignmentPrompt).values({
			id: "prompt-badpin",
			orgId: "org-1",
			task: "task1",
			genre: "",
			skill: "reading",
			part: "p1",
			type: "info",
			title: "Bad Pin Practice",
			prompt: "Label the diagram.",
			passage: "<p>Passage body</p>",
			questions: JSON.stringify([
				{
					stem: "Câu 1 — pin x là chuỗi",
					opts: null,
					answer: "Alpha",
					alts: "",
					pin: { x: "50", y: 50 },
				},
				{
					stem: "Câu 2 — pin ngoài 0–100",
					opts: null,
					answer: "Beta",
					alts: "",
					pin: { x: 150, y: -1 },
				},
				{
					stem: "Câu 3 — pin hợp lệ",
					opts: null,
					answer: "Gamma",
					alts: "",
					pin: { x: 25, y: 75 },
				},
			]),
			optionBank: JSON.stringify(["Alpha", "Beta", "Gamma", "Delta"]),
			note: "<p>note</p>",
			status: "ready",
		});

		for (const assignmentId of [
			"ca-q1",
			"ca-q2",
			"ca-q3",
			"ca-q4",
			"ca-q5",
			"ca-q6",
			"ca-q7",
			"ca-q8",
			"ca-q9",
		]) {
			await libsql.insert(schema.classAssignment).values({
				id: assignmentId,
				orgId: "org-1",
				classId: "class-1",
				promptId: assignmentId === "ca-q8" ? "prompt-badpin" : "prompt-quiz",
				title: `Quiz ${assignmentId}`,
				due: "2099-01-10",
			});
			await libsql.insert(schema.classAssignmentTarget).values({
				id: `cat-${assignmentId}`,
				orgId: "org-1",
				assignmentId,
				studentId: "student-1",
				submittedAt: null,
			});
		}

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				const userKey = headers.get("x-test-user");
				if (!userKey || userKey === "none") return null;
				if (userKey === "google-verified") {
					return {
						userId: "u-1",
						userName: "Minh Tran",
						email: "minh@gmail.com",
						emailVerified: true,
						role: "student",
					};
				}
				if (userKey === "ambiguous") {
					return {
						userId: "u-amb",
						userName: "Trung",
						email: "trung@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				return null;
			},
			authHandler: () => new Response("auth OK"),
		});
	});

	async function startAttempt(assignmentId: string): Promise<string> {
		const res = await app.request(
			`/api/student/assignments/${assignmentId}/quiz/start`,
			{
				method: "POST",
				headers: writeHeaders(),
				body: "{}",
			},
		);
		expect(res.status).toBe(201);
		const body = (await res.json()) as { attemptId: string };
		return body.attemptId;
	}

	async function patchAnswer(
		attemptId: string,
		q: number,
		value: string,
		origin?: string,
	): Promise<Response> {
		return app.request(`/api/student/attempts/${attemptId}/answer`, {
			method: "PATCH",
			headers: writeHeaders(origin),
			body: JSON.stringify({ q, value }),
		});
	}

	async function submit(attemptId: string): Promise<Response> {
		return app.request(`/api/student/attempts/${attemptId}/submit`, {
			method: "POST",
			headers: writeHeaders(),
			body: "{}",
		});
	}

	// (a) 401 khi không có session cookie — cả 6 endpoint mới
	test("(a) unauthenticated requests return 401 on all six endpoints", async () => {
		const noSessionWrite = {
			Origin: STUDENT_ORIGIN,
			"Content-Type": "application/json",
		};
		const cases: Array<[string, RequestInit]> = [
			["/api/student/assignments/ca-q1/quiz", { method: "GET" }],
			[
				"/api/student/assignments/ca-q1/quiz/start",
				{ method: "POST", headers: noSessionWrite, body: "{}" },
			],
			[
				"/api/student/attempts/any/answer",
				{
					method: "PATCH",
					headers: noSessionWrite,
					body: '{"q":0,"value":"A"}',
				},
			],
			[
				"/api/student/attempts/any/submit",
				{ method: "POST", headers: noSessionWrite, body: "{}" },
			],
			["/api/student/attempts/any", { method: "GET" }],
			["/api/student/attempts/any/detail", { method: "GET" }],
		];
		for (const [path, init] of cases) {
			const res = await app.request(path, init);
			expect(res.status, path).toBe(401);
		}
	});

	// (b) POST/PATCH sai Origin → 403; Content-Type không phải JSON → 415; body > 4096 → 413
	test("(b) CSRF guards: bad origin 403, non-json content-type 415, oversized body 413", async () => {
		const badOrigin = await app.request(
			"/api/student/assignments/ca-q4/quiz/start",
			{
				method: "POST",
				headers: writeHeaders("https://evil.example"),
				body: "{}",
			},
		);
		expect(badOrigin.status).toBe(403);
		expect(await badOrigin.json()).toEqual({ error: "origin not allowed" });

		const attemptId = await startAttempt("ca-q4");
		const badOriginPatch = await patchAnswer(
			attemptId,
			0,
			"A",
			"https://evil.example",
		);
		expect(badOriginPatch.status).toBe(403);

		const textPlain = await app.request(
			`/api/student/attempts/${attemptId}/answer`,
			{
				method: "PATCH",
				headers: {
					"x-test-user": "google-verified",
					Origin: STUDENT_ORIGIN,
					"Content-Type": "text/plain",
				},
				body: '{"q":0,"value":"A"}',
			},
		);
		expect(textPlain.status).toBe(415);
		expect(await textPlain.json()).toEqual({
			error: "content-type must be application/json",
		});

		const oversized = await app.request(
			`/api/student/attempts/${attemptId}/answer`,
			{
				method: "PATCH",
				headers: { ...writeHeaders(), "Content-Length": "5000" },
				body: JSON.stringify({ q: 0, value: "x".repeat(4500) }),
			},
		);
		expect(oversized.status).toBe(413);
		expect(await oversized.json()).toEqual({ error: "payload too large" });
	});

	// (i) GET quiz không chứa key; summary/detail in_progress → 409; caps q/value
	test("(i) take payload leaks no answer key; in_progress summary is 409", async () => {
		const before = await app.request("/api/student/assignments/ca-q1/quiz", {
			headers: OWNER,
		});
		expect(before.status).toBe(200);
		const beforeBody = (await before.json()) as StudentQuizDetail;
		expect(beforeBody.attempt).toBeNull();
		expect(beforeBody.questions).toHaveLength(8);
		expect(beforeBody.optionBank).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);

		const attemptId = await startAttempt("ca-q1");

		const takeRes = await app.request("/api/student/assignments/ca-q1/quiz", {
			headers: OWNER,
		});
		expect(takeRes.status).toBe(200);
		const takeText = await takeRes.text();
		const take = JSON.parse(takeText) as StudentQuizDetail;
		expect(take.attempt?.id).toBe(attemptId);
		expect(take.attempt?.status).toBe("in_progress");
		// RT#6: không key, không alts, không note của đề.
		for (const leaked of [
			'"answer"',
			'"alts"',
			"Paris",
			"northern",
			"TRUE",
			"YES",
			"Teacher-only explanation note",
		]) {
			expect(takeText.includes(leaked), leaked).toBe(false);
		}

		// Summary/detail đang in_progress → 409, body không chứa key.
		const summaryRes = await app.request(`/api/student/attempts/${attemptId}`, {
			headers: OWNER,
		});
		expect(summaryRes.status).toBe(409);
		expect(await summaryRes.text()).not.toContain("Paris");
		const detailRes = await app.request(
			`/api/student/attempts/${attemptId}/detail`,
			{ headers: OWNER },
		);
		expect(detailRes.status).toBe(409);

		// Caps: q ngoài snapshot → 400; q âm → 400; value > 500 → 400.
		expect((await patchAnswer(attemptId, 8, "A")).status).toBe(400);
		expect((await patchAnswer(attemptId, -1, "A")).status).toBe(400);
		expect((await patchAnswer(attemptId, 0, "x".repeat(501))).status).toBe(400);
	});

	// (c) student cùng org không phải chủ attempt → 404 trên /attempts/* + quiz
	test("(c) same-org non-owner student gets 404 on every /attempts/* endpoint", async () => {
		const attemptId = await startAttempt("ca-q2");
		const other = { "x-test-user": "ambiguous" };
		const otherWrite = {
			"x-test-user": "ambiguous",
			Origin: STUDENT_ORIGIN,
			"Content-Type": "application/json",
		};

		const quiz = await app.request("/api/student/assignments/ca-q2/quiz", {
			headers: other,
		});
		expect(quiz.status).toBe(404);

		const start = await app.request(
			"/api/student/assignments/ca-q2/quiz/start",
			{ method: "POST", headers: otherWrite, body: "{}" },
		);
		expect(start.status).toBe(404);

		const patch = await app.request(
			`/api/student/attempts/${attemptId}/answer`,
			{
				method: "PATCH",
				headers: otherWrite,
				body: '{"q":0,"value":"A"}',
			},
		);
		expect(patch.status).toBe(404);

		const submitRes = await app.request(
			`/api/student/attempts/${attemptId}/submit`,
			{ method: "POST", headers: otherWrite, body: "{}" },
		);
		expect(submitRes.status).toBe(404);

		const summary = await app.request(`/api/student/attempts/${attemptId}`, {
			headers: other,
		});
		expect(summary.status).toBe(404);

		const detail = await app.request(
			`/api/student/attempts/${attemptId}/detail`,
			{ headers: other },
		);
		expect(detail.status).toBe(404);
	});

	// (d)+(f)+(g) start idempotent, double submit identical + no re-stamp, PATCH sau submit 409
	test("(d/f/g) start idempotent; double submit identical without re-stamp; patch after submit 409", async () => {
		const first = await app.request(
			"/api/student/assignments/ca-q5/quiz/start",
			{
				method: "POST",
				headers: writeHeaders(),
				body: "{}",
			},
		);
		expect(first.status).toBe(201);
		const attemptId = ((await first.json()) as { attemptId: string }).attemptId;

		// Idempotent resume: start lần 2 trả về CÙNG attempt đang chạy.
		const second = await app.request(
			"/api/student/assignments/ca-q5/quiz/start",
			{
				method: "POST",
				headers: writeHeaders(),
				body: "{}",
			},
		);
		expect(second.status).toBe(200);
		expect(((await second.json()) as { attemptId: string }).attemptId).toBe(
			attemptId,
		);

		// Nộp bài trắng (chưa trả lời câu nào) — mọi câu skipped.
		const submitRes = await submit(attemptId);
		expect(submitRes.status).toBe(200);
		const firstBody = await submitRes.text();
		expect(JSON.parse(firstBody)).toEqual({
			correctCount: 0,
			totalCount: 8,
			wrongCount: 0,
			skippedCount: 8,
		});

		const [targetAfterFirst] = await libsql
			.select({ submittedAt: schema.classAssignmentTarget.submittedAt })
			.from(schema.classAssignmentTarget)
			.where(eq(schema.classAssignmentTarget.id, "cat-ca-q5"));
		expect(targetAfterFirst?.submittedAt).not.toBeNull();

		// Double submit: response giống hệt, KHÔNG re-stamp target.
		const secondSubmit = await submit(attemptId);
		expect(secondSubmit.status).toBe(200);
		expect(await secondSubmit.text()).toBe(firstBody);
		const [targetAfterSecond] = await libsql
			.select({ submittedAt: schema.classAssignmentTarget.submittedAt })
			.from(schema.classAssignmentTarget)
			.where(eq(schema.classAssignmentTarget.id, "cat-ca-q5"));
		expect(targetAfterSecond?.submittedAt).toBe(targetAfterFirst?.submittedAt);

		// (g) PATCH sau submit → 409.
		expect((await patchAnswer(attemptId, 0, "A")).status).toBe(409);

		// Start lại sau submit → 409 (không retake v1).
		const restart = await app.request(
			"/api/student/assignments/ca-q5/quiz/start",
			{ method: "POST", headers: writeHeaders(), body: "{}" },
		);
		expect(restart.status).toBe(409);

		// Summary/detail sau submit mở khóa, trả key/verdict + note.
		const summary = await app.request(`/api/student/attempts/${attemptId}`, {
			headers: OWNER,
		});
		expect(summary.status).toBe(200);
		const summaryBody = (await summary.json()) as QuizAttemptSummary;
		expect(summaryBody.totalCount).toBe(8);
		expect(summaryBody.skippedCount).toBe(8);
		expect(summaryBody.items).toHaveLength(8);
		expect(summaryBody.items[0]).toEqual({
			verdict: "skipped",
			key: "Paris",
			answer: null,
		});
		expect(summaryBody.submittedAt).not.toBe("");

		const detail = await app.request(
			`/api/student/attempts/${attemptId}/detail`,
			{
				headers: OWNER,
			},
		);
		expect(detail.status).toBe(200);
		const detailBody = (await detail.json()) as QuizAttemptDetail;
		expect(detailBody.note).toBe("<p>Teacher-only explanation note</p>");
		expect(detailBody.questions[0]?.key).toBe("Paris");
		expect(detailBody.questions[0]?.alts).toBe("paris");
		expect(detailBody.questions[0]?.verdict).toBe("skipped");
	});

	// (e) hai PATCH interleaved (q3, q7) — cả hai còn nguyên nhờ json_set atomic
	test("(e) interleaved patches on different questions both persist", async () => {
		const attemptId = await startAttempt("ca-q6");

		expect((await patchAnswer(attemptId, 3, "northern")).status).toBe(200);
		expect((await patchAnswer(attemptId, 7, "Z")).status).toBe(200);

		const take = await app.request("/api/student/assignments/ca-q6/quiz", {
			headers: OWNER,
		});
		const body = (await take.json()) as StudentQuizDetail;
		expect(body.attempt?.answers).toEqual({ "3": "northern", "7": "Z" });

		// Grade: q3 đúng (answer), q7 sai, còn lại skipped.
		const submitRes = await submit(attemptId);
		expect(await submitRes.json()).toEqual({
			correctCount: 1,
			totalCount: 8,
			wrongCount: 1,
			skippedCount: 6,
		});

		// Cùng câu patch lại — last-write-wins cho câu đó, câu khác giữ nguyên.
		const attempt2 = await startAttempt("ca-q7");
		await patchAnswer(attempt2, 0, "London");
		await patchAnswer(attempt2, 0, "Paris");
		const take2 = await app.request("/api/student/assignments/ca-q7/quiz", {
			headers: OWNER,
		});
		const body2 = (await take2.json()) as StudentQuizDetail;
		expect(body2.attempt?.answers).toEqual({ "0": "Paris" });
	});

	// (h) đề bị edit giữa chừng → resume + grading dùng snapshot, không đổi
	test("(h) prompt edited mid-attempt: resume and grading use the snapshot", async () => {
		const attemptId = await startAttempt("ca-q3");

		// Teacher PATCH prompt sau khi học viên đã start (thao tác DB trực tiếp
		// cùng hiệu ứng với PATCH /api/assignments/prompts/:id).
		await libsql
			.update(schema.assignmentPrompt)
			.set({
				questions: JSON.stringify([
					{
						stem: "EDITED stem",
						opts: null,
						answer: "London",
						alts: "",
						pin: null,
					},
				]),
			})
			.where(eq(schema.assignmentPrompt.id, "prompt-quiz"));

		// Resume: đề render từ snapshot — 8 câu cũ, không dính stem mới.
		const take = await app.request("/api/student/assignments/ca-q3/quiz", {
			headers: OWNER,
		});
		const body = (await take.json()) as StudentQuizDetail;
		expect(body.questions).toHaveLength(8);
		expect(JSON.stringify(body.questions)).not.toContain("EDITED stem");

		// Trả lời theo key cũ — grading vẫn chấm theo snapshot, không theo đề mới.
		expect((await patchAnswer(attemptId, 0, "Paris")).status).toBe(200);
		const submitRes = await submit(attemptId);
		expect(await submitRes.json()).toEqual({
			correctCount: 1,
			totalCount: 8,
			wrongCount: 0,
			skippedCount: 7,
		});

		const summary = await app.request(`/api/student/attempts/${attemptId}`, {
			headers: OWNER,
		});
		const summaryBody = (await summary.json()) as QuizAttemptSummary;
		expect(summaryBody.items[0]?.key).toBe("Paris");
		expect(summaryBody.items[0]?.verdict).toBe("correct");
	});

	// code-review: pin malformed không tràn xuống wire — parsePin sanitize null.
	test("malformed question pins are sanitized to null in take payloads", async () => {
		await startAttempt("ca-q8");
		const take = await app.request("/api/student/assignments/ca-q8/quiz", {
			headers: OWNER,
		});
		expect(take.status).toBe(200);
		const body = (await take.json()) as StudentQuizDetail;
		expect(body.questions.map((question) => question.pin)).toEqual([
			null,
			null,
			{ x: 25, y: 75 },
		]);
	});

	// code-review: body cap đo byte THẬT — stream không Content-Length vẫn 413.
	test("oversized streaming body without Content-Length is rejected 413", async () => {
		const attemptId = await startAttempt("ca-q9");
		// Stream thật (không Content-Length do fetch tự sinh với string body)
		// — cap phải đo BYTE THẬT, không tin header client khai.
		const streamed = new Request(
			`http://localhost/api/student/attempts/${attemptId}/answer`,
			{
				method: "PATCH",
				headers: {
					"x-test-user": "google-verified",
					Origin: STUDENT_ORIGIN,
					"Content-Type": "application/json",
				},
				body: new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(
							new TextEncoder().encode(
								JSON.stringify({ q: 0, value: "x".repeat(8192) }),
							),
						);
						controller.close();
					},
				}),
				duplex: "half",
				// workers-types không khai báo duplex (Node undici cần cho
				// stream body) — cast hẹp chỉ tại điểm xây Request test.
			} as RequestInit & { duplex: "half" },
		);
		expect(streamed.headers.get("Content-Length")).toBeNull();
		const res = await app.request(streamed);
		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: "payload too large" });
	});
});
