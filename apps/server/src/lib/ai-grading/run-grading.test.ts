import { createClient } from "@libsql/client";
import {
	AI_GRADING_ERROR_CODES,
	QUICK_GRADE_MONTHLY_LIMIT,
	TRIAL_CREDITS,
} from "@teacher-os/api/contracts";
import { aiGradingDraft } from "@teacher-os/db/schema/ai-grading-draft";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import { classTable } from "@teacher-os/db/schema/class";
import { classAssignment } from "@teacher-os/db/schema/class-assignment";
import { creditUsageLog } from "@teacher-os/db/schema/credit-wallet";
import * as schema from "@teacher-os/db/schema/index";
import { quizAttempt } from "@teacher-os/db/schema/quiz-attempt";
import { student } from "@teacher-os/db/schema/student";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { Db } from "../../app";
import {
	claimQuickGradeSlot,
	ensureWallet,
	readWallet,
	reserveCredits,
	settleCredits,
} from "../credits/wallet";
import { createFakeAiGrader } from "./fake-grader";
import { releaseStaleGradings } from "./release-stale";
import { AI_GRADING_TIMEOUT_MS, runAiGrading } from "./run-grading";

// SQLite THẬT in-memory + migration thật (0054 ai_grading_draft) — chứng
// minh CAS UPDATE + ON CONFLICT DO NOTHING nguyên tử trên SQL thật
// (precedent wallet.test.ts).
const MIGRATIONS_DIR = new URL(
	"../../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

const ORG = "org-ag";
let db: Db;

/** Attempt Writing `mode='assignment'` đã nộp — mỗi attempt 1 lượt giao
 * riêng (UNIQUE (assignment_id, student_id) không cho 2 attempt chung ca). */
async function seedSubmittedWritingAttempt(
	attemptId: string,
	overrides: Partial<typeof quizAttempt.$inferInsert> = {},
) {
	await db.insert(classAssignment).values({
		id: `ca-${attemptId}`,
		orgId: ORG,
		classId: "class-ag",
		promptId: "prompt-ag",
		title: "Writing Task 2 AG",
		due: "2026-11-05",
	});
	await db.insert(quizAttempt).values({
		id: attemptId,
		orgId: ORG,
		assignmentId: `ca-${attemptId}`,
		studentId: "s-ag",
		mode: "assignment",
		status: "submitted",
		questionsSnapshot: "[]",
		answers: "{}",
		essay: "<p>Nhiều người cho rằng du lịch quốc tế...</p>",
		submittedAt: new Date(),
		...overrides,
	});
}

async function draft(attemptId: string) {
	const [row] = await db
		.select()
		.from(aiGradingDraft)
		.where(eq(aiGradingDraft.attemptId, attemptId));
	return row ?? null;
}

async function logs(attemptId: string) {
	return db
		.select()
		.from(creditUsageLog)
		.where(eq(creditUsageLog.refId, attemptId));
}

beforeAll(async () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	db = libsql as unknown as Db;

	await db.insert(schema.organization).values({ id: ORG, name: "Academy AG" });
	await db.insert(student).values({
		id: "s-ag",
		orgId: ORG,
		name: "Minh AG",
		email: "ag-student@test.local",
		phone: "0900000001",
	});
	await db.insert(classTable).values({
		id: "class-ag",
		orgId: ORG,
		name: "IELTS AG",
		level: "IELTS 6.0–7.0",
		mode: "Online",
		schedule: "T3 & T6 18:00–20:00",
		sessionsDone: 1,
		sessionsTotal: 10,
		status: "active",
	});
	await db.insert(assignmentPrompt).values({
		id: "prompt-ag",
		orgId: ORG,
		task: "task2",
		genre: "",
		skill: "writing",
		part: "task2",
		type: "essay",
		title: "Writing Task 2 AG",
		prompt:
			"Nhiều người cho rằng du lịch quốc tế gây hại cho văn hoá địa phương. Bạn đồng ý hay không?",
		questions: "[]",
		optionBank: "[]",
		note: "",
		status: "ready",
	});
});

beforeEach(async () => {
	await db.delete(aiGradingDraft);
	await db.delete(creditUsageLog);
	// Ví nguyên trạng mỗi test: xoá + tạo lười lại với TRIAL_CREDITS.
	await db.delete(schema.creditWallet);
	await ensureWallet(db, ORG);
});

describe("runAiGrading (TOS-30 pipeline reserve → grade → settle/release)", () => {
	test("happy path: grader 6.3 → làm tròn 6.5, draft ai_drafted, sổ cái reserved −1 rồi settled −1", async () => {
		await seedSubmittedWritingAttempt("a-happy");
		await runAiGrading(
			{
				getDb: () => db,
				getAiGrader: () => createFakeAiGrader({ scores: { task: 6.3 } }),
			},
			"a-happy",
		);

		const row = await draft("a-happy");
		expect(row?.status).toBe("ai_drafted");
		expect(row?.skill).toBe("writing");
		expect(row?.creditCost).toBe(1);
		expect(row?.aiScores).toEqual({
			task: 6.5,
			coherence: 7,
			lexical: 6,
			grammar: 6.5,
		});
		expect(row?.aiFeedback).toContain("ý tưởng");
		expect(row?.draftedAt).not.toBeNull();

		const ledger = await logs("a-happy");
		expect(ledger.map((l) => l.txStatus)).toEqual(["reserved", "settled"]);
		expect(ledger.every((l) => l.actionType === "ai_grading")).toBe(true);
		expect(
			ledger.every((l) => l.idempotencyKey.startsWith("ai_grading:a-happy:")),
		).toBe(true);
		expect(ledger.map((l) => l.creditDelta)).toEqual([-1, -1]);
	});

	test("grader lỗi → draft manual_pending + released, balance nguyên", async () => {
		await seedSubmittedWritingAttempt("a-grader-error");
		await runAiGrading(
			{
				getDb: () => db,
				getAiGrader: () => createFakeAiGrader({ error: new Error("boom") }),
			},
			"a-grader-error",
		);

		const row = await draft("a-grader-error");
		expect(row?.status).toBe("manual_pending");
		expect(row?.errorCode).toBe("AI_GRADING_FAILED");
		const ledger = await logs("a-grader-error");
		expect(ledger.map((l) => l.txStatus)).toEqual(["reserved", "released"]);
		expect(await readWallet(db, ORG)).toEqual({
			balance: TRIAL_CREDITS,
			held: 0,
		});
	});

	test("AI treo quá hạn → AiGradingTimeout → manual_pending + released", async () => {
		await seedSubmittedWritingAttempt("a-timeout");
		await runAiGrading(
			{
				getDb: () => db,
				aiGradingTimeoutMs: 20,
				getAiGrader: () => createFakeAiGrader({ delayMs: 200 }),
			},
			"a-timeout",
		);

		const row = await draft("a-timeout");
		expect(row?.status).toBe("manual_pending");
		expect(row?.errorCode).toBe("AI_GRADING_TIMEOUT");
		expect((await logs("a-timeout")).map((l) => l.txStatus)).toEqual([
			"reserved",
			"released",
		]);
	});

	test("thiếu Credit (ngoài gói tháng) → manual_pending + E-selfomy-alignment-001, không gọi AI, không dòng log", async () => {
		await seedSubmittedWritingAttempt("a-broke");
		await db
			.update(schema.creditWallet)
			.set({ balance: 0 })
			.where(eq(schema.creditWallet.orgId, ORG));

		const grader = vi.fn();
		await runAiGrading(
			{
				getDb: () => db,
				getAiGrader: () => ({ grade: grader as never }),
			},
			"a-broke",
		);

		const row = await draft("a-broke");
		expect(row?.status).toBe("manual_pending");
		expect(row?.errorCode).toBe(AI_GRADING_ERROR_CODES.INSUFFICIENT_CREDITS);
		expect(grader).not.toHaveBeenCalled();
		expect(await logs("a-broke")).toEqual([]);
	});

	test("gọi 2 lần cùng attempt → chỉ 1 cặp log, draft không dựng lại", async () => {
		await seedSubmittedWritingAttempt("a-twice");
		const deps = {
			getDb: () => db,
			getAiGrader: () => createFakeAiGrader(),
		};
		await runAiGrading(deps, "a-twice");
		await runAiGrading(deps, "a-twice");

		const row = await draft("a-twice");
		expect(row?.status).toBe("ai_drafted");
		expect((await logs("a-twice")).map((l) => l.txStatus)).toEqual([
			"reserved",
			"settled",
		]);
	});

	test("Speaking chưa có transcript → manual_pending không reserve (TOS-31 thay)", async () => {
		await db.insert(assignmentPrompt).values({
			id: "prompt-ag-spk",
			orgId: ORG,
			task: "part2",
			genre: "",
			skill: "speaking",
			part: "part2",
			type: "cue",
			title: "Speaking Part 2 AG",
			prompt: "Describe a person who has influenced you.",
			cueTopic: "A person who influenced you",
			questions: "[]",
			optionBank: "[]",
			note: "",
			status: "ready",
		});
		await db.insert(classAssignment).values({
			id: "ca-ag-spk",
			orgId: ORG,
			classId: "class-ag",
			promptId: "prompt-ag-spk",
			title: "Speaking Part 2 AG",
			due: "2026-11-05",
		});
		await db.insert(quizAttempt).values({
			id: "a-spk",
			orgId: ORG,
			assignmentId: "ca-ag-spk",
			studentId: "s-ag",
			mode: "assignment",
			status: "submitted",
			questionsSnapshot: "[]",
			answers: "{}",
			mediaKey: "speaking/a-spk.webm",
			submittedAt: new Date(),
		});

		await runAiGrading({ getDb: () => db }, "a-spk");

		const row = await draft("a-spk");
		expect(row?.status).toBe("manual_pending");
		expect(row?.errorCode).toBe("AI_GRADING_NO_TRANSCRIPT");
		expect(row?.creditCost).toBe(2);
		expect(await logs("a-spk")).toEqual([]);
	});

	test("teacher publish trước khi grader trả → CAS thua, released, draft giữ published", async () => {
		await seedSubmittedWritingAttempt("a-publish-race");
		const gradingPromise = runAiGrading(
			{
				getDb: () => db,
				getAiGrader: () => createFakeAiGrader({ delayMs: 80 }),
			},
			"a-publish-race",
		);
		// Chờ draft ai_processing + reserve xong rồi teacher chốt tay.
		await vi.waitFor(async () => {
			expect((await draft("a-publish-race"))?.status).toBe("ai_processing");
			expect(await logs("a-publish-race")).toHaveLength(1);
		});
		await db
			.update(aiGradingDraft)
			.set({ status: "published", publishedAt: new Date() })
			.where(eq(aiGradingDraft.attemptId, "a-publish-race"));

		await gradingPromise;

		const row = await draft("a-publish-race");
		expect(row?.status).toBe("published");
		expect(row?.aiScores).toBeNull();
		expect((await logs("a-publish-race")).map((l) => l.txStatus)).toEqual([
			"reserved",
			"released",
		]);
	});

	test("attempt chưa submitted / không tồn tại → không tạo draft", async () => {
		await seedSubmittedWritingAttempt("a-draft-attempt", {
			status: "in_progress",
			submittedAt: null,
		});
		await runAiGrading(
			{ getDb: () => db, getAiGrader: () => createFakeAiGrader() },
			"a-draft-attempt",
		);
		await runAiGrading(
			{ getDb: () => db, getAiGrader: () => createFakeAiGrader() },
			"a-missing",
		);

		expect(await draft("a-draft-attempt")).toBeNull();
		expect(await draft("a-missing")).toBeNull();
	});

	test("binding AI thiếu → manual_pending AI_GRADING_DISABLED + released", async () => {
		await seedSubmittedWritingAttempt("a-disabled");
		await runAiGrading({ getDb: () => db }, "a-disabled");

		const row = await draft("a-disabled");
		expect(row?.status).toBe("manual_pending");
		expect(row?.errorCode).toBe("AI_GRADING_DISABLED");
		expect((await logs("a-disabled")).map((l) => l.txStatus)).toEqual([
			"reserved",
			"released",
		]);
	});

	test("org chưa từng có ví → ensureWallet tạo lười, vẫn ai_drafted", async () => {
		await db
			.insert(schema.organization)
			.values({ id: "org-ag-moi", name: "Academy Moi" });
		await db.insert(student).values({
			id: "s-moi",
			orgId: "org-ag-moi",
			name: "Mo Moi",
			email: "moi@test.local",
			phone: "0900000002",
		});
		await db.insert(classTable).values({
			id: "class-moi",
			orgId: "org-ag-moi",
			name: "IELTS Moi",
			level: "IELTS 5.0–6.0",
			mode: "Online",
			schedule: "T4 18:00–20:00",
			sessionsDone: 0,
			sessionsTotal: 10,
			status: "active",
		});
		await db.insert(assignmentPrompt).values({
			id: "prompt-moi",
			orgId: "org-ag-moi",
			task: "task2",
			genre: "",
			skill: "writing",
			part: "task2",
			type: "essay",
			title: "Writing Moi",
			prompt: "Mua sắm online có lợi hay hại?",
			questions: "[]",
			optionBank: "[]",
			note: "",
			status: "ready",
		});
		await db.insert(classAssignment).values({
			id: "ca-moi",
			orgId: "org-ag-moi",
			classId: "class-moi",
			promptId: "prompt-moi",
			title: "Writing Moi",
			due: "2026-11-05",
		});
		await db.insert(quizAttempt).values({
			id: "a-new-org",
			orgId: "org-ag-moi",
			assignmentId: "ca-moi",
			studentId: "s-moi",
			mode: "assignment",
			status: "submitted",
			questionsSnapshot: "[]",
			answers: "{}",
			essay: "<p>Online shopping is convenient...</p>",
			submittedAt: new Date(),
		});
		// Không tạo credit_wallet cho org-ag-moi — mô phỏng org chưa từng tiêu.

		await runAiGrading(
			{ getDb: () => db, getAiGrader: () => createFakeAiGrader() },
			"a-new-org",
		);

		const row = await draft("a-new-org");
		expect(row?.status).toBe("ai_drafted");
		const ledger = await logs("a-new-org");
		expect(ledger.map((l) => l.txStatus)).toEqual(["reserved", "settled"]);
		expect(await readWallet(db, "org-ag-moi")).toMatchObject({
			balance: TRIAL_CREDITS - 1,
		});
	});

	test("hằng số timeout nằm trong ngân sách waitUntil (< 30s)", () => {
		expect(AI_GRADING_TIMEOUT_MS).toBeLessThan(30_000);
	});

	test("practice mode vẫn chấm AI (giả định plan: practice cũng tiêu Credit)", async () => {
		// Đề tự luyện: quiz_attempt.test_id trỏ assignment_test.
		await db.insert(schema.assignmentTest).values({
			id: "test-ag",
			orgId: ORG,
			title: "Writing Practice AG",
			skill: "writing",
			status: "ready",
		});
		await seedSubmittedWritingAttempt("a-practice", {
			assignmentId: null,
			testId: "test-ag",
			mode: "practice",
		});

		await runAiGrading(
			{ getDb: () => db, getAiGrader: () => createFakeAiGrader() },
			"a-practice",
		);

		const row = await draft("a-practice");
		expect(row?.status).toBe("ai_drafted");
		expect((await logs("a-practice")).map((l) => l.txStatus)).toEqual([
			"reserved",
			"settled",
		]);
	});

	test("TOS-32: gói tháng active/grace_period, ví 0, đã dùng 29 lượt → bài Writing thứ 30 chấm nhanh (quick, 0 Credit, ví vẫn 0)", async () => {
		await db
			.update(schema.creditWallet)
			.set({ balance: 0, planKind: "monthly", planStatus: "active" })
			.where(eq(schema.creditWallet.orgId, ORG));
		for (let i = 1; i <= QUICK_GRADE_MONTHLY_LIMIT - 1; i++) {
			await claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: `pre-q-${i}`,
			});
		}

		await seedSubmittedWritingAttempt("a-quick-30");
		let observedMode: string | undefined;
		const baseGrader = createFakeAiGrader({ scores: { task: 6.5 } });
		await runAiGrading(
			{
				getDb: () => db,
				getAiGrader: () => ({
					grade(input, signal) {
						observedMode = input.mode;
						return baseGrader.grade(input, signal);
					},
				}),
			},
			"a-quick-30",
		);

		expect(observedMode).toBe("quick");
		const row = await draft("a-quick-30");
		expect(row?.status).toBe("ai_drafted");
		expect(row?.gradingMode).toBe("quick");
		expect(row?.creditCost).toBe(0);
		expect(row?.errorCode).toBeNull();
		expect(await readWallet(db, ORG)).toEqual({ balance: 0, held: 0 });

		const ledger = await logs("a-quick-30");
		expect(ledger).toHaveLength(1);
		expect(ledger[0]).toMatchObject({
			actionType: "quick_grade_writing",
			creditDelta: 0,
			txStatus: "settled",
			idempotencyKey: "quick_grade_writing:a-quick-30:claim",
		});
	});

	test("TOS-32: gói tháng grace_period, ví 0 → vẫn được Chấm nhanh Writing", async () => {
		await db
			.update(schema.creditWallet)
			.set({ balance: 0, planKind: "monthly", planStatus: "grace_period" })
			.where(eq(schema.creditWallet.orgId, ORG));

		await seedSubmittedWritingAttempt("a-quick-grace");
		await runAiGrading(
			{
				getDb: () => db,
				getAiGrader: () => createFakeAiGrader(),
			},
			"a-quick-grace",
		);

		const row = await draft("a-quick-grace");
		expect(row?.status).toBe("ai_drafted");
		expect(row?.gradingMode).toBe("quick");
		expect(row?.creditCost).toBe(0);
	});

	test("TOS-32: gói tháng active, ví 0, đã dùng đủ 30/30 lượt → manual_pending + E-selfomy-alignment-002, grader không được gọi", async () => {
		await db
			.update(schema.creditWallet)
			.set({ balance: 0, planKind: "monthly", planStatus: "active" })
			.where(eq(schema.creditWallet.orgId, ORG));
		for (let i = 1; i <= QUICK_GRADE_MONTHLY_LIMIT; i++) {
			await claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: `full-q-${i}`,
			});
		}

		await seedSubmittedWritingAttempt("a-quick-31");
		const grader = vi.fn();
		await runAiGrading(
			{
				getDb: () => db,
				getAiGrader: () => ({ grade: grader as never }),
			},
			"a-quick-31",
		);

		const row = await draft("a-quick-31");
		expect(row?.status).toBe("manual_pending");
		expect(row?.errorCode).toBe(AI_GRADING_ERROR_CODES.QUOTA_EXHAUSTED);
		expect(grader).not.toHaveBeenCalled();
		expect(await logs("a-quick-31")).toEqual([]);
	});

	test("TOS-32: gói tháng expired hoặc Speaking thiếu Credit → manual_pending + E-selfomy-alignment-001", async () => {
		await db
			.update(schema.creditWallet)
			.set({ balance: 0, planKind: "monthly", planStatus: "expired" })
			.where(eq(schema.creditWallet.orgId, ORG));
		await seedSubmittedWritingAttempt("a-expired-plan");
		await runAiGrading(
			{ getDb: () => db, getAiGrader: () => createFakeAiGrader() },
			"a-expired-plan",
		);
		expect((await draft("a-expired-plan"))?.errorCode).toBe(
			AI_GRADING_ERROR_CODES.INSUFFICIENT_CREDITS,
		);

		// Speaking (có transcript) trên gói tháng active nhưng ví chỉ còn 1 Credit (< 2) → E-001
		await db
			.update(schema.creditWallet)
			.set({ balance: 1, planKind: "monthly", planStatus: "active" })
			.where(eq(schema.creditWallet.orgId, ORG));
		await db.insert(classAssignment).values({
			id: "ca-spk-broke",
			orgId: ORG,
			classId: "class-ag",
			promptId: "prompt-ag-spk",
			title: "Speaking Broke",
			due: "2026-11-05",
		});
		await db.insert(quizAttempt).values({
			id: "a-spk-broke",
			orgId: ORG,
			assignmentId: "ca-spk-broke",
			studentId: "s-ag",
			mode: "assignment",
			status: "submitted",
			questionsSnapshot: "[]",
			answers: "{}",
			mediaKey: "speaking/a-spk-broke.webm",
			submittedAt: new Date(),
		});
		await runAiGrading(
			{
				getDb: () => db,
				getAiGrader: () => createFakeAiGrader(),
				getTranscriber: () => ({
					async transcribe() {
						return "This is a valid transcript with enough words for speaking.";
					},
				}),
			},
			"a-spk-broke",
		);
		const spkRow = await draft("a-spk-broke");
		expect(spkRow?.status).toBe("manual_pending");
		expect(spkRow?.errorCode).toBe(AI_GRADING_ERROR_CODES.INSUFFICIENT_CREDITS);
	});

	test("TOS-32: quick mode nhưng AI lỗi khi org đang có held của job khác → hoàn lượt quick (reverted), KHÔNG đụng held của job khác", async () => {
		// Ví có 5 Credit, đang bị job exam_import giữ hết 5 (available = 0, held = 5)
		await db
			.update(schema.creditWallet)
			.set({ balance: 5, held: 0, planKind: "monthly", planStatus: "active" })
			.where(eq(schema.creditWallet.orgId, ORG));
		await reserveCredits(db, {
			orgId: ORG,
			actorUserId: "teacher-1",
			amount: 5,
			refId: "import-job-1",
			actionType: "exam_import",
		});

		await seedSubmittedWritingAttempt("a-quick-fail");
		await runAiGrading(
			{
				getDb: () => db,
				getAiGrader: () => createFakeAiGrader({ error: new Error("ai crash") }),
			},
			"a-quick-fail",
		);

		const row = await draft("a-quick-fail");
		expect(row?.status).toBe("manual_pending");
		expect(row?.gradingMode).toBe("quick");
		expect(row?.errorCode).toBe(AI_GRADING_ERROR_CODES.FAILED);
		// Held 5 của import-job-1 nguyên vẹn!
		expect(await readWallet(db, ORG)).toEqual({ balance: 5, held: 5 });
		// Sổ cái của a-quick-fail có đủ settled + reverted (triệt tiêu lượt)
		const ledger = await logs("a-quick-fail");
		expect(ledger.map((l) => l.txStatus)).toEqual(["settled", "reverted"]);
	});

	test("TOS-32: quick mode nhưng binding AI thiếu (getAiGrader undefined) → manual_pending DISABLED, hoàn lượt quick, KHÔNG đụng held của job khác", async () => {
		await db
			.update(schema.creditWallet)
			.set({ balance: 5, held: 0, planKind: "monthly", planStatus: "active" })
			.where(eq(schema.creditWallet.orgId, ORG));
		await reserveCredits(db, {
			orgId: ORG,
			actorUserId: "teacher-1",
			amount: 5,
			refId: "import-job-disabled",
			actionType: "exam_import",
		});

		await seedSubmittedWritingAttempt("a-quick-disabled");
		await runAiGrading({ getDb: () => db }, "a-quick-disabled");

		const row = await draft("a-quick-disabled");
		expect(row?.status).toBe("manual_pending");
		expect(row?.gradingMode).toBe("quick");
		expect(row?.errorCode).toBe(AI_GRADING_ERROR_CODES.DISABLED);
		expect(await readWallet(db, ORG)).toEqual({ balance: 5, held: 5 });
		expect((await logs("a-quick-disabled")).map((l) => l.txStatus)).toEqual([
			"settled",
			"reverted",
		]);
	});

	test("TOS-32: quick mode thua CAS ai_drafted (teacher publish trước khi AI xong) → hoàn lượt quick, KHÔNG đụng held của job khác", async () => {
		await db
			.update(schema.creditWallet)
			.set({ balance: 5, held: 0, planKind: "monthly", planStatus: "active" })
			.where(eq(schema.creditWallet.orgId, ORG));
		await reserveCredits(db, {
			orgId: ORG,
			actorUserId: "teacher-1",
			amount: 5,
			refId: "import-job-cas",
			actionType: "exam_import",
		});

		await seedSubmittedWritingAttempt("a-quick-cas-race");
		const gradingPromise = runAiGrading(
			{
				getDb: () => db,
				getAiGrader: () => createFakeAiGrader({ delayMs: 80 }),
			},
			"a-quick-cas-race",
		);
		await vi.waitFor(async () => {
			expect((await draft("a-quick-cas-race"))?.gradingMode).toBe("quick");
			expect(await logs("a-quick-cas-race")).toHaveLength(1);
		});
		await db
			.update(aiGradingDraft)
			.set({ status: "published", publishedAt: new Date() })
			.where(eq(aiGradingDraft.attemptId, "a-quick-cas-race"));

		await gradingPromise;

		const row = await draft("a-quick-cas-race");
		expect(row?.status).toBe("published");
		expect(await readWallet(db, ORG)).toEqual({ balance: 5, held: 5 });
		expect((await logs("a-quick-cas-race")).map((l) => l.txStatus)).toEqual([
			"settled",
			"reverted",
		]);
	});
});

describe("releaseStaleGradings (TOS-30 dọn lười draft kẹt ai_processing)", () => {
	test("draft quá 60s → manual_pending + released; draft mới không đụng", async () => {
		await seedSubmittedWritingAttempt("a-stale-old");
		await seedSubmittedWritingAttempt("a-stale-new");
		await db.insert(aiGradingDraft).values([
			{
				attemptId: "a-stale-old",
				orgId: ORG,
				skill: "writing",
				creditCost: 1,
				startedAt: new Date(Date.now() - 61_000),
			},
			{
				attemptId: "a-stale-new",
				orgId: ORG,
				skill: "writing",
				creditCost: 1,
			},
		]);
		// Reserve sẵn cho cả 2 để sweep phải hoàn đúng dòng cũ.
		for (const id of ["a-stale-old", "a-stale-new"]) {
			await reserveCredits(db, {
				orgId: ORG,
				actorUserId: "system",
				amount: 1,
				refId: id,
				actionType: "ai_grading",
			});
		}

		await releaseStaleGradings(db, ORG);

		const oldRow = await draft("a-stale-old");
		const newRow = await draft("a-stale-new");
		expect(oldRow?.status).toBe("manual_pending");
		expect(newRow?.status).toBe("ai_processing");
		const oldLogs = await logs("a-stale-old");
		expect(oldLogs.map((l) => l.txStatus)).toEqual(["reserved", "released"]);
		expect((await logs("a-stale-new")).map((l) => l.txStatus)).toEqual([
			"reserved",
		]);
	});

	test("chỉ dọn trong org của mình", async () => {
		await seedSubmittedWritingAttempt("a-stale-org2");
		await db.insert(aiGradingDraft).values({
			attemptId: "a-stale-org2",
			orgId: ORG,
			skill: "writing",
			creditCost: 1,
			startedAt: new Date(Date.now() - 61_000),
		});

		await releaseStaleGradings(db, "org-khac");

		expect((await draft("a-stale-org2"))?.status).toBe("ai_processing");
	});

	test("sau sweep, teacher vẫn thấy draft (không xoá dòng)", async () => {
		await seedSubmittedWritingAttempt("a-stale-keep");
		await db.insert(aiGradingDraft).values({
			attemptId: "a-stale-keep",
			orgId: ORG,
			skill: "writing",
			creditCost: 1,
			startedAt: new Date(Date.now() - 61_000),
		});

		await releaseStaleGradings(db, ORG);

		const rows = await db
			.select()
			.from(aiGradingDraft)
			.where(and(eq(aiGradingDraft.attemptId, "a-stale-keep")));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.status).toBe("manual_pending");
	});

	test("crash sau CAS ai_drafted mà chưa settle → sweep trả held, giữ draft", async () => {
		await seedSubmittedWritingAttempt("a-crash-drafted");
		await db.insert(aiGradingDraft).values({
			attemptId: "a-crash-drafted",
			orgId: ORG,
			skill: "writing",
			status: "ai_drafted",
			creditCost: 1,
			startedAt: new Date(Date.now() - 61_000),
		});
		await reserveCredits(db, {
			orgId: ORG,
			actorUserId: "system",
			amount: 1,
			refId: "a-crash-drafted",
			actionType: "ai_grading",
		});

		await releaseStaleGradings(db, ORG);

		// Draft giữ nguyên trạng thái (điểm AI vẫn dùng được)…
		const row = await draft("a-crash-drafted");
		expect(row?.status).toBe("ai_drafted");
		// …held được trả: sổ cái reserved + released.
		const ledger = await logs("a-crash-drafted");
		expect(ledger.map((l) => l.txStatus)).toEqual(["reserved", "released"]);
		const wallet = await readWallet(db, ORG);
		expect(wallet).toMatchObject({ balance: TRIAL_CREDITS, held: 0 });
	});

	test("draft đã settle không bị sweep hoàn lần 2", async () => {
		await seedSubmittedWritingAttempt("a-settled-ok");
		await db.insert(aiGradingDraft).values({
			attemptId: "a-settled-ok",
			orgId: ORG,
			skill: "writing",
			status: "ai_drafted",
			creditCost: 1,
			startedAt: new Date(Date.now() - 61_000),
		});
		const input = {
			orgId: ORG,
			actorUserId: "system",
			amount: 1,
			refId: "a-settled-ok",
			actionType: "ai_grading" as const,
		};
		await reserveCredits(db, input);
		await settleCredits(db, input);

		await releaseStaleGradings(db, ORG);

		expect((await logs("a-settled-ok")).map((l) => l.txStatus)).toEqual([
			"reserved",
			"settled",
		]);
	});

	test("TOS-32: draft quick kẹt ai_processing > 60s → sweep chuyển manual_pending và revert lượt quick", async () => {
		await seedSubmittedWritingAttempt("a-stale-quick");
		await claimQuickGradeSlot(db, {
			orgId: ORG,
			attemptId: "a-stale-quick",
		});
		await db.insert(aiGradingDraft).values({
			attemptId: "a-stale-quick",
			orgId: ORG,
			skill: "writing",
			gradingMode: "quick",
			creditCost: 0,
			startedAt: new Date(Date.now() - 61_000),
		});

		await releaseStaleGradings(db, ORG);

		const row = await draft("a-stale-quick");
		expect(row?.status).toBe("manual_pending");
		const ledger = await logs("a-stale-quick");
		expect(ledger.map((l) => l.txStatus)).toEqual(["settled", "reverted"]);
	});

	test("TOS-32: crash giữa claimQuickGradeSlot và UPDATE grading_mode (draft vẫn standard + ai_processing > 60s) và Nhóm 3 (manual_pending quá hạn chưa revert) → sweep vẫn revert lượt quick", async () => {
		// Case A: crash ngay sau claimQuickGradeSlot, trước khi UPDATE grading_mode='quick'
		await seedSubmittedWritingAttempt("a-stale-pre-update");
		await claimQuickGradeSlot(db, {
			orgId: ORG,
			attemptId: "a-stale-pre-update",
		});
		await db.insert(aiGradingDraft).values({
			attemptId: "a-stale-pre-update",
			orgId: ORG,
			skill: "writing",
			gradingMode: "standard",
			creditCost: 1,
			startedAt: new Date(Date.now() - 61_000),
		});

		// Case B (Nhóm 3): crash sau CAS manual_pending nhưng trước revertQuickGradeSlot
		await seedSubmittedWritingAttempt("a-stale-group3");
		await claimQuickGradeSlot(db, {
			orgId: ORG,
			attemptId: "a-stale-group3",
		});
		await db.insert(aiGradingDraft).values({
			attemptId: "a-stale-group3",
			orgId: ORG,
			skill: "writing",
			status: "manual_pending",
			gradingMode: "quick",
			creditCost: 0,
			startedAt: new Date(Date.now() - 61_000),
		});

		await releaseStaleGradings(db, ORG);

		expect((await draft("a-stale-pre-update"))?.status).toBe("manual_pending");
		expect((await logs("a-stale-pre-update")).map((l) => l.txStatus)).toEqual([
			"settled",
			"reverted",
		]);
		expect((await logs("a-stale-group3")).map((l) => l.txStatus)).toEqual([
			"settled",
			"reverted",
		]);
	});
});
