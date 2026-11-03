import { createClient } from "@libsql/client";
import type { HistoryListResponse } from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { SessionUser } from "../session";

const CORS_ORIGINS = ["http://localhost:8003"];
const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

const QUESTIONS = [
	{ stem: "Q1", opts: ["A", "B"], answer: "A", alts: "", pin: null },
	{ stem: "Q2", opts: ["A", "B"], answer: "B", alts: "", pin: null },
];

/**
 * Fixture phase 11 (#378): hai org, học viên Hoa (cùng email ở cả hai org —
 * test quyền qua header x-student-org-id), một học viên khác cùng org.
 * Thời gian nộp chọn để test gom ngày giờ VN:
 * - 2026-10-05T16:30:00Z = 23:30 VN ngày 05/10 (cùng ngày giờ VN).
 * - 2026-10-05T17:30:00Z = 00:30 VN ngày 06/10 (trượt sang hôm sau).
 * - 2026-10-01T10:00:00Z = 17:00 VN ngày 01/10 (Writing đã chấm).
 * 21 attempt practice tháng 2026-09 dùng riêng cho test phân trang.
 */
describe("student history (#378 phase 11)", () => {
	let app: ServerApp;
	let libsql: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		await libsql.insert(schema.organization).values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		]);
		await libsql.insert(schema.user).values({
			id: "t-1",
			name: "Cô Lan",
			email: "lan@test.local",
			role: "teacher",
		});
		await libsql.insert(schema.membership).values({
			id: "mem-1",
			orgId: "org-1",
			userId: "t-1",
			role: "teacher",
		});
		await libsql.insert(schema.student).values([
			{
				id: "student-hoa",
				orgId: "org-1",
				name: "Nguyễn Thị Hoa",
				email: "hoa@test.local",
			},
			{
				id: "student-hoa-o2",
				orgId: "org-2",
				name: "Nguyễn Thị Hoa",
				email: "hoa@test.local",
			},
			{
				id: "student-another",
				orgId: "org-1",
				name: "Trần Văn Bình",
				email: "binh@test.local",
			},
		]);
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
		await libsql.insert(schema.enrollment).values({
			id: "enr-1",
			orgId: "org-1",
			classId: "class-1",
			studentId: "student-hoa",
			status: "active",
		});

		// Đề luyện tập reading + writing của org-1; prompt giao bài đọc.
		await libsql.insert(schema.assignmentPrompt).values([
			{
				id: "prompt-read",
				orgId: "org-1",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p1",
				type: "choice",
				title: "Passage 1",
				prompt: "",
				questions: JSON.stringify(QUESTIONS),
				status: "ready",
			},
			{
				id: "prompt-writ",
				orgId: "org-1",
				task: "task2",
				genre: "essay",
				skill: "writing",
				part: "task2",
				type: "essay",
				title: "Task 2",
				prompt: "<p>Some people think…</p>",
				questions: "[]",
				status: "ready",
			},
			{
				id: "prompt-ca",
				orgId: "org-1",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p1",
				type: "choice",
				title: "Bài giao trên lớp",
				prompt: "",
				questions: JSON.stringify(QUESTIONS),
				status: "ready",
			},
			{
				id: "prompt-org2",
				orgId: "org-2",
				task: "task1",
				genre: "",
				skill: "listening",
				part: "p1",
				type: "choice",
				title: "Đề org 2",
				prompt: "",
				questions: JSON.stringify(QUESTIONS),
				status: "ready",
			},
		]);
		await libsql.insert(schema.assignmentTest).values([
			{
				id: "test-read",
				orgId: "org-1",
				title: "The Falkirk Wheel",
				skill: "reading",
				timeLimitSeconds: 1200,
				status: "ready",
			},
			{
				id: "test-writ",
				orgId: "org-1",
				title: "Writing Mock 1",
				skill: "writing",
				timeLimitSeconds: null,
				status: "ready",
			},
			{
				id: "test-org2",
				orgId: "org-2",
				title: "Listening org 2",
				skill: "listening",
				timeLimitSeconds: null,
				status: "ready",
			},
		]);
		await libsql.insert(schema.assignmentTestPart).values([
			{
				id: "atp-1",
				testId: "test-read",
				promptId: "prompt-read",
				part: "p1",
				position: 1,
			},
			{
				id: "atp-2",
				testId: "test-writ",
				promptId: "prompt-writ",
				part: "task2",
				position: 1,
			},
			{
				id: "atp-3",
				testId: "test-org2",
				promptId: "prompt-org2",
				part: "p1",
				position: 1,
			},
		]);

		// Bài giao trên lớp + attempt assignment 23:30→00:30 VN (biên ngày).
		await libsql.insert(schema.classAssignment).values({
			id: "ca-1",
			orgId: "org-1",
			classId: "class-1",
			promptId: "prompt-ca",
			title: "Quiz tuần 3",
			due: "2099-01-10",
		});

		await libsql.insert(schema.quizAttempt).values([
			{
				// 23:30 VN ngày 05/10 — gom đúng ngày 2026-10-05.
				id: "attempt-practice-read",
				orgId: "org-1",
				studentId: "student-hoa",
				testId: "test-read",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: JSON.stringify(QUESTIONS),
				answers: JSON.stringify({ 0: "A", 1: "B" }),
				correctCount: 2,
				startedAt: new Date("2026-10-05T16:00:00Z"),
				submittedAt: new Date("2026-10-05T16:30:00Z"),
			},
			{
				// 00:30 VN ngày 06/10 — biên trượt ngày qua UTC.
				id: "attempt-assignment-read",
				orgId: "org-1",
				assignmentId: "ca-1",
				studentId: "student-hoa",
				mode: "assignment",
				status: "submitted",
				questionsSnapshot: JSON.stringify(QUESTIONS),
				answers: JSON.stringify({ 0: "A", 1: "B" }),
				correctCount: 1,
				startedAt: new Date("2026-10-05T17:00:00Z"),
				submittedAt: new Date("2026-10-05T17:30:00Z"),
			},
			{
				// Writing đã chấm — "Band 6.5", kèm cột phút.
				id: "attempt-writing-graded",
				orgId: "org-1",
				studentId: "student-hoa",
				testId: "test-writ",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: "[]",
				answers: "{}",
				essay: "Governments should invest more in infrastructure.",
				correctCount: null,
				gradeScores: { task: 6.5, coherence: 6.5, lexical: 6.0, grammar: 6.5 },
				gradedAt: new Date("2026-10-02T02:00:00Z"),
				startedAt: new Date("2026-10-01T09:00:00Z"),
				submittedAt: new Date("2026-10-01T10:00:00Z"),
			},
			{
				// Chưa nộp — không bao giờ vào lịch sử.
				id: "attempt-in-progress",
				orgId: "org-1",
				studentId: "student-hoa",
				testId: "test-read",
				mode: "practice",
				status: "in_progress",
				questionsSnapshot: JSON.stringify(QUESTIONS),
				answers: "{}",
				startedAt: new Date("2026-10-05T10:00:00Z"),
			},
			{
				// Cùng org nhưng của học viên KHÁC — không bao giờ hiện cho Hoa.
				id: "attempt-other-student",
				orgId: "org-1",
				studentId: "student-another",
				testId: "test-read",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: JSON.stringify(QUESTIONS),
				answers: "{}",
				correctCount: 0,
				startedAt: new Date("2026-10-05T11:00:00Z"),
				submittedAt: new Date("2026-10-05T11:30:00Z"),
			},
			{
				// Practice của Hoa ở org-2 — chỉ thấy khi chọn org-2.
				id: "attempt-org2",
				orgId: "org-2",
				studentId: "student-hoa-o2",
				testId: "test-org2",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: JSON.stringify(QUESTIONS),
				answers: "{}",
				correctCount: 2,
				startedAt: new Date("2026-10-06T01:00:00Z"),
				submittedAt: new Date("2026-10-06T02:00:00Z"),
			},
		]);
		// 21 attempt tháng 2026-09 — riêng cho test phân trang list.
		await libsql.insert(schema.quizAttempt).values(
			Array.from({ length: 21 }, (_, i) => ({
				id: `attempt-sept-${i}`,
				orgId: "org-1",
				studentId: "student-hoa",
				testId: "test-read",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: JSON.stringify(QUESTIONS),
				answers: JSON.stringify({ 0: "A", 1: "B" }),
				correctCount: 2,
				startedAt: new Date(2026, 8, 10 + (i % 10), 1, 0, 0),
				submittedAt: new Date(2026, 8, 10 + (i % 10), 2, i, 0),
			})),
		);

		// Log ôn từ: 2 thẻ review 23:30 VN 05/10 (gom ngày 05), 1 thẻ learn
		// (KHÔNG đếm là "ôn"), 1 thẻ review của học viên khác org.
		await libsql.insert(schema.vocabReviewLog).values([
			{
				id: "log-review-1",
				studentId: "student-hoa",
				cardId: "card-1",
				deckId: "deck-1",
				sessionKind: "review",
				grade: "good",
				durationMs: 2 * 60000,
				reviewedAt: new Date("2026-10-05T16:20:00Z"),
				word: "infrastructure",
			},
			{
				id: "log-review-2",
				studentId: "student-hoa",
				cardId: "card-2",
				deckId: "deck-1",
				sessionKind: "review",
				grade: "again",
				durationMs: 4 * 60000,
				reviewedAt: new Date("2026-10-05T16:25:00Z"),
				word: "commute",
			},
			{
				id: "log-learn-1",
				studentId: "student-hoa",
				cardId: "card-3",
				deckId: "deck-1",
				sessionKind: "learn",
				grade: "good",
				durationMs: 3 * 60000,
				reviewedAt: new Date("2026-10-05T16:10:00Z"),
				word: "suburb",
			},
			{
				id: "log-review-o2",
				studentId: "student-hoa-o2",
				cardId: "card-9",
				deckId: "deck-9",
				sessionKind: "review",
				grade: "good",
				durationMs: 60000,
				reviewedAt: new Date("2026-10-06T01:30:00Z"),
				word: "harbor",
			},
		]);

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				const key = headers.get("x-test-user");
				if (key === "hoa")
					return {
						userId: "u-hoa",
						userName: "Nguyễn Thị Hoa",
						email: "hoa@test.local",
						emailVerified: true,
						role: "student",
					};
				return null;
			},
			authHandler: () => new Response("auth OK"),
		});
	});

	async function studentGet(path: string, orgId = "org-1"): Promise<Response> {
		return app.request(path, {
			method: "GET",
			headers: { "x-test-user": "hoa", "x-student-org-id": orgId },
		});
	}

	type MonthBody = {
		ym: string;
		days: Array<{ date: string; count: number; minutes: number }>;
	};
	type WeekBody = {
		monday: string;
		rows: Array<{ skill: string; days: number[] }>;
		minutes: number[];
	};

	test("month gom đúng ngày giờ VN: attempt 23:30 VN về đúng ngày, vocab gộp 1 ngày", async () => {
		const res = await studentGet("/api/student/history/month?ym=2026-10");
		expect(res.status).toBe(200);
		const body = (await res.json()) as MonthBody;
		expect(body.ym).toBe("2026-10");
		const byDate = new Map(body.days.map((d) => [d.date, d]));

		// 05/10: 1 attempt practice (30') + 2 thẻ ôn (6') — log learn không đếm.
		expect(byDate.get("2026-10-05")).toMatchObject({ count: 3, minutes: 36 });
		// 06/10: attempt nộp 00:30 VN (biên trượt ngày) — 30'.
		expect(byDate.get("2026-10-06")).toMatchObject({ count: 1, minutes: 30 });
		// 01/10: writing đã chấm 60'.
		expect(byDate.get("2026-10-01")).toMatchObject({ count: 1, minutes: 60 });
		// Ngày không hoạt động không xuất hiện trong mảng.
		expect(byDate.has("2026-10-04")).toBe(false);
		// Attempt học viên khác + attempt chưa nộp không lọt.
		expect(body.days).toHaveLength(3);
	});

	test("ym mặc định là tháng hiện tại giờ VN; ym sai → 400", async () => {
		const invalid = await studentGet("/api/student/history/month?ym=2026-13");
		expect(invalid.status).toBe(400);
		const garbage = await studentGet("/api/student/history/month?ym=abc");
		expect(garbage.status).toBe(400);
		// Không truyền ym → tháng hiện tại giờ VN. 17:30 UTC ngày 31/10 đã là
		// 00:30 VN ngày 01/11, nên phép tính theo UTC sẽ ra sai tháng.
		vi.useFakeTimers({
			toFake: ["Date"],
			now: Date.parse("2026-10-31T17:30:00Z"),
		});
		try {
			const current = await studentGet("/api/student/history/month");
			const body = (await current.json()) as MonthBody;
			expect(body.ym).toBe("2026-11");
		} finally {
			vi.useRealTimers();
		}
	});

	test("week theo monday: chuẩn hóa Thứ Hai, đếm đúng skill theo ngày", async () => {
		// Truyền ngày giữa tuần (Thứ 6 09/10) → chuẩn hóa về monday 05/10.
		const res = await studentGet("/api/student/history/week?monday=2026-10-09");
		expect(res.status).toBe(200);
		const body = (await res.json()) as WeekBody;
		expect(body.monday).toBe("2026-10-05");

		const rowBySkill = new Map(body.rows.map((r) => [r.skill, r.days]));
		// Reading: Thứ 2 (practice) 1 + Thứ 3 (assignment 00:30 VN) 1.
		expect(rowBySkill.get("reading")).toEqual([1, 1, 0, 0, 0, 0, 0]);
		// Vocabulary: Thứ 2 — 2 thẻ ôn (đếm theo thẻ, cùng quy ước heatmap).
		expect(rowBySkill.get("vocabulary")).toEqual([2, 0, 0, 0, 0, 0, 0]);
		// Writing: tuần trước (01/10) — tuần này 0.
		expect(rowBySkill.get("writing")).toEqual([0, 0, 0, 0, 0, 0, 0]);
		// Phút mỗi ngày: Thứ 2 = 30 + 6, Thứ 3 = 30.
		expect(body.minutes).toEqual([36, 30, 0, 0, 0, 0, 0]);
		// Luôn đủ 5 dòng kỹ năng (kể cả skill 0).
		expect(body.rows).toHaveLength(5);
	});

	test("week monday sai → 400", async () => {
		expect(
			(await studentGet("/api/student/history/week?monday=2026-10-32")).status,
		).toBe(400);
		expect(
			(await studentGet("/api/student/history/week?monday=khong-hop-le"))
				.status,
		).toBe(400);
	});

	test("list: mới nhất trước, kèm điểm/trạng thái, phân trang 20/trang", async () => {
		const res = await studentGet("/api/student/history");
		expect(res.status).toBe(200);
		const body = (await res.json()) as HistoryListResponse;
		// 3 attempt tháng 10 + 1 dòng vocab (2 thẻ gộp) + 21 attempt tháng 9.
		expect(body.total).toBe(25);
		expect(body.pages).toBe(2);
		expect(body.entries).toHaveLength(20);

		// Mới nhất trước: assignment nộp 17:30Z 05/10 (00:30 VN 06/10) mới nhất
		// trong org-1 — attempt-org2 là dữ liệu org-2, không lọt.
		expect(body.entries[0]?.id).toBe("attempt-assignment-read");

		// Entry writing đã chấm: Band derive từ gradeScores, status graded.
		const writing = body.entries.find((e) => e.id === "attempt-writing-graded");
		expect(writing).toMatchObject({
			kind: "practice",
			skill: "writing",
			title: "Writing Mock 1",
			score: "Band 6.5",
			status: "graded",
			minutes: 60,
			attemptId: "attempt-writing-graded",
		});

		// Entry vocab gộp theo ngày: 2 thẻ → 1 dòng.
		const vocab = body.entries.find((e) => e.kind === "vocab");
		expect(vocab).toMatchObject({
			id: "vocab-2026-10-05",
			skill: "vocabulary",
			title: "Ôn 2 thẻ từ vựng",
			date: "2026-10-05",
			minutes: 6,
			attemptId: null,
		});

		// Trang 2: 5 entry còn lại.
		const page2 = await studentGet("/api/student/history?page=2");
		const body2 = (await page2.json()) as HistoryListResponse;
		expect(body2.entries).toHaveLength(5);
		// Trang vượt range → rỗng nhưng shape chuẩn.
		const page3 = await studentGet("/api/student/history?page=3");
		const body3 = (await page3.json()) as HistoryListResponse;
		expect(body3.entries).toHaveLength(0);
		expect(body3.pages).toBe(2);
	});

	test("list lọc skill đúng bằng giá trị; skill/page sai → 400", async () => {
		const res = await studentGet("/api/student/history?skill=vocabulary");
		const body = (await res.json()) as HistoryListResponse;
		expect(body.total).toBe(1);
		expect(body.entries[0]?.kind).toBe("vocab");

		const reading = await studentGet("/api/student/history?skill=reading");
		const readingBody = (await reading.json()) as HistoryListResponse;
		// 23 attempt reading (2 tháng 10 gồm assignment + 21 tháng 9).
		expect(readingBody.total).toBe(23);
		expect(readingBody.entries.every((e) => e.skill === "reading")).toBe(true);

		expect(
			(await studentGet("/api/student/history?skill=dictation")).status,
		).toBe(400);
		expect((await studentGet("/api/student/history?page=0")).status).toBe(400);
	});

	test("quyền: chỉ dữ liệu của chính học viên, chỉ org đang chọn", async () => {
		// Org-1: không bao giờ thấy attempt của học viên khác (student-another).
		const org1 = (await (
			await studentGet("/api/student/history?skill=reading")
		).json()) as HistoryListResponse;
		expect(org1.entries.some((e) => e.id === "attempt-other-student")).toBe(
			false,
		);

		// Cùng email học viên, chọn org-2 → chỉ thấy dữ liệu org-2.
		const org2 = (await (
			await studentGet("/api/student/history", "org-2")
		).json()) as HistoryListResponse;
		expect(org2.total).toBe(2);
		expect(org2.entries.map((e) => e.id).sort()).toEqual([
			"attempt-org2",
			"vocab-2026-10-06",
		]);

		// Month org-2 chỉ có ngày 06/10: attempt 60' + 1 thẻ ôn 1'.
		const month2 = (await (
			await studentGet("/api/student/history/month?ym=2026-10", "org-2")
		).json()) as MonthBody;
		expect(month2.days).toEqual([
			{ date: "2026-10-06", count: 2, minutes: 61 },
		]);
	});

	test("chưa đăng nhập → 401 (session middleware của router student)", async () => {
		const res = await app.request("/api/student/history/month?ym=2026-10", {
			method: "GET",
		});
		expect(res.status).toBe(401);
	});
});
