import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	EXAM_IMPORT_ERROR_CODES,
	type ExtractedExamDraft,
} from "@teacher-os/api/contracts";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import {
	assignmentTest,
	assignmentTestPart,
} from "@teacher-os/db/schema/assignment-test";
import { examImportJob } from "@teacher-os/db/schema/exam-import-job";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Db } from "../../app";
import { loadSnapshot } from "../../routes/snapshot";
import { mergeReviewedDraft, publishExamImportToBank } from "./publish-to-bank";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../../packages/db/src/migrations", import.meta.url).href,
);

function sampleDraft(
	overrides: Partial<ExtractedExamDraft> = {},
): ExtractedExamDraft {
	return {
		title: "Cambridge IELTS 18 Reading Test 1",
		skill: "reading",
		timeLimitMinutes: 60,
		parts: [
			{
				passage: "<p>Đoạn đọc Passage 1 về nông nghiệp đô thị.</p>",
				questions: [
					{
						stem: "Urban farming reduces transport costs.",
						opts: ["TRUE", "FALSE", "NOT GIVEN"],
						answer: "TRUE",
						type: "tfng",
						explanation: "Đoạn 1 nêu rõ giảm chi phí vận chuyển.",
						confidence: 0.92,
						needsReview: false,
					},
					{
						stem: "Complete: vertical farms require less ______.",
						answer: "land",
						type: "shortans",
						explanation: "Đoạn 2 dòng 3.",
						confidence: 0.55,
						needsReview: true,
					},
				],
			},
			{
				passage: "<p>Đoạn đọc Passage 2 về lịch sử hàng hải.</p>",
				questions: [
					{
						stem: "Early navigators relied on star charts.",
						opts: ["TRUE", "FALSE", "NOT GIVEN"],
						answer: "TRUE",
						type: "tfng",
						confidence: 0.95,
						needsReview: false,
					},
				],
			},
		],
		...overrides,
	};
}

describe("publishExamImportToBank & mergeReviewedDraft (TOS-26 #472)", () => {
	let db: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		]);
		await db.insert(schema.user).values([
			{
				id: "u-teacher",
				name: "Cô Lan",
				email: "lan@test.local",
				role: "teacher",
			},
		]);
	});

	beforeEach(async () => {
		await db.delete(assignmentTestPart);
		await db.delete(assignmentTest);
		await db.delete(assignmentPrompt);
		await db.delete(examImportJob);
	});

	async function seedCompletedJob(
		draft: ExtractedExamDraft = sampleDraft(),
		id = "job-1",
	) {
		const [row] = await db
			.insert(examImportJob)
			.values({
				id,
				orgId: "org-1",
				createdBy: "u-teacher",
				fileKey: `exam-imports/org-1/${id}`,
				fileName: "cambridge-18-test-1.pdf",
				mimeType: "application/pdf",
				sizeBytes: 4096,
				pageCount: 2,
				contentFingerprint: "a".repeat(64),
				heldCredits: 5,
				importStatus: "completed",
				draftJson: JSON.stringify(draft),
				completedAt: new Date(),
			})
			.returning();
		if (!row) throw new Error("failed to seed job");
		return row;
	}

	test("mergeReviewedDraft bảo toàn needsReview=true và confidence gốc kể cả khi client gửi needsReview=false", () => {
		const original = sampleDraft();
		const tampered: ExtractedExamDraft = {
			...original,
			parts: original.parts.map((part) => ({
				...part,
				questions: part.questions.map((q) => ({
					...q,
					answer: "edited answer",
					confidence: 1,
					needsReview: false,
				})),
			})),
		};

		const merged = mergeReviewedDraft(original, tampered);
		expect(merged.parts[0]?.questions[0]?.needsReview).toBe(false);
		expect(merged.parts[0]?.questions[1]?.needsReview).toBe(true);
		expect(merged.parts[0]?.questions[1]?.confidence).toBe(0.55);
		expect(merged.parts[0]?.questions[1]?.answer).toBe("edited answer");
	});

	test("còn câu needsReview mà reviewConfirmed=false → 422 REVIEW_CONFIRMATION_REQUIRED (kể cả khi client giả mạo needsReview=false)", async () => {
		const job = await seedCompletedJob();
		const fakeCleanDraft: ExtractedExamDraft = {
			...sampleDraft(),
			parts: sampleDraft().parts.map((part) => ({
				...part,
				questions: part.questions.map((q) => ({ ...q, needsReview: false })),
			})),
		};

		const result = await publishExamImportToBank(db, {
			job,
			orgId: "org-1",
			draft: fakeCleanDraft,
			reviewConfirmed: false,
		});
		expect(result).toEqual({
			ok: false,
			status: 422,
			code: EXAM_IMPORT_ERROR_CODES.REVIEW_CONFIRMATION_REQUIRED,
			error: expect.any(String),
		});
	});

	test("reviewConfirmed=true → tạo assignment_test ready + assignment_prompt[] đúng slot preset p1, p2 và forward explanation qua snapshot", async () => {
		const job = await seedCompletedJob();
		const result = await publishExamImportToBank(db, {
			job,
			orgId: "org-1",
			draft: sampleDraft(),
			reviewConfirmed: true,
		});
		expect(result).toEqual({
			ok: true,
			testId: "test-import-job-1",
			status: "ready",
		});

		const tests = await db
			.select()
			.from(assignmentTest)
			.where(eq(assignmentTest.orgId, "org-1"));
		expect(tests).toHaveLength(1);
		expect(tests[0]).toMatchObject({
			id: "test-import-job-1",
			title: "Cambridge IELTS 18 Reading Test 1",
			skill: "reading",
			timeLimitSeconds: 3600,
			status: "ready",
		});

		const parts = await db
			.select()
			.from(assignmentTestPart)
			.where(eq(assignmentTestPart.testId, "test-import-job-1"));
		expect(parts.map((p) => p.part)).toEqual(["p1", "p2"]);

		const snapshot = await loadSnapshot(db, "org-1");
		expect(snapshot.assignmentPrompts).toHaveLength(2);
		const p1 = snapshot.assignmentPrompts.find((p) => p.part === "p1");
		expect(p1?.source).toBe("AI import: cambridge-18-test-1.pdf");
		expect(p1?.status).toBe("ready");
		expect(p1?.questions[0]?.explanation).toBe(
			"Đoạn 1 nêu rõ giảm chi phí vận chuyển.",
		);
	});

	test("publish idempotent: gọi lần 2 tuần tự hoặc 2 request song song chỉ sinh 1 bộ đề và trả cùng testId", async () => {
		const job = await seedCompletedJob();
		const [res1, res2] = await Promise.all([
			publishExamImportToBank(db, {
				job,
				orgId: "org-1",
				draft: sampleDraft(),
				reviewConfirmed: true,
			}),
			publishExamImportToBank(db, {
				job,
				orgId: "org-1",
				draft: sampleDraft(),
				reviewConfirmed: true,
			}),
		]);
		expect(res1.ok && res1.testId).toBe("test-import-job-1");
		expect(res2.ok && res2.testId).toBe("test-import-job-1");

		const [updatedJob] = await db
			.select()
			.from(examImportJob)
			.where(eq(examImportJob.id, job.id));
		expect(updatedJob?.publishedTestId).toBe("test-import-job-1");

		// Gọi lần 3 với row job đã có publishedTestId
		if (!updatedJob) throw new Error("expected updatedJob");
		const res3 = await publishExamImportToBank(db, {
			job: updatedJob,
			orgId: "org-1",
			draft: sampleDraft(),
			reviewConfirmed: true,
		});
		expect(res3).toEqual({
			ok: true,
			testId: "test-import-job-1",
			status: "ready",
		});

		const tests = await db.select().from(assignmentTest);
		const prompts = await db.select().from(assignmentPrompt);
		expect(tests).toHaveLength(1);
		expect(prompts).toHaveLength(2);

		// Mở lại bản nháp cũ (TOS-25) rồi sửa tiêu đề + xuất bản lại → cập nhật
		// chính bộ đề đó và lưu draft_json mới mà không tạo bộ đề thứ 2.
		const editedDraft = sampleDraft({ title: "Cambridge IELTS 18 — Bản sửa" });
		const res4 = await publishExamImportToBank(db, {
			job: updatedJob,
			orgId: "org-1",
			draft: editedDraft,
			reviewConfirmed: true,
		});
		expect(res4).toEqual({
			ok: true,
			testId: "test-import-job-1",
			status: "ready",
		});
		const testsAfterEdit = await db.select().from(assignmentTest);
		expect(testsAfterEdit).toHaveLength(1);
		expect(testsAfterEdit[0]?.title).toBe("Cambridge IELTS 18 — Bản sửa");
		const [reloadedJob] = await db
			.select()
			.from(examImportJob)
			.where(eq(examImportJob.id, job.id));
		expect(JSON.parse(reloadedJob?.draftJson ?? "{}").title).toBe(
			"Cambridge IELTS 18 — Bản sửa",
		);
	});

	test("số part vượt quá slot của preset (reading > 3 parts) → 422 TOO_MANY_PARTS", async () => {
		const baseParts = sampleDraft().parts;
		const p0 = baseParts[0];
		const p1 = baseParts[1];
		if (!p0 || !p1) throw new Error("expected sample parts");
		const fourPartDraft = sampleDraft({
			parts: [p0, p1, p1, p1],
		});
		const job = await seedCompletedJob(fourPartDraft);
		const res = await publishExamImportToBank(db, {
			job,
			orgId: "org-1",
			draft: fourPartDraft,
			reviewConfirmed: true,
		});
		expect(res).toEqual({
			ok: false,
			status: 422,
			code: EXAM_IMPORT_ERROR_CODES.TOO_MANY_PARTS,
			error: expect.any(String),
			maxParts: 3,
		});
	});

	test("skill = mixed → 422 SKILL_MIXED_NOT_ALLOWED", async () => {
		const mixedDraft = sampleDraft({ skill: "mixed" });
		const job = await seedCompletedJob(mixedDraft);
		const res = await publishExamImportToBank(db, {
			job,
			orgId: "org-1",
			draft: mixedDraft,
			reviewConfirmed: true,
		});
		expect(res).toEqual({
			ok: false,
			status: 422,
			code: EXAM_IMPORT_ERROR_CODES.SKILL_MIXED_NOT_ALLOWED,
			error: expect.any(String),
		});
	});

	test("đề Listening chưa có audio → tạo assignment_test và assignment_prompt ở trạng thái draft (D5)", async () => {
		const listeningDraft = sampleDraft({
			title: "IELTS Listening Test 1",
			skill: "listening",
			parts: [
				{
					passage: "Transcript section 1",
					questions: [
						{
							stem: "Customer surname:",
							answer: "Henderson",
							type: "form",
							confidence: 0.95,
							needsReview: false,
						},
					],
				},
			],
		});
		const job = await seedCompletedJob(listeningDraft, "job-listening");
		const res = await publishExamImportToBank(db, {
			job,
			orgId: "org-1",
			draft: listeningDraft,
			reviewConfirmed: false,
		});
		expect(res).toEqual({
			ok: true,
			testId: "test-import-job-listening",
			status: "draft",
		});
	});
});
