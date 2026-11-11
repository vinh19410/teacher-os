import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { examImportJob } from "@teacher-os/db/schema/exam-import-job";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Db } from "../../app";
import { findCompletedImportByFingerprint } from "./dedupe";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../../packages/db/src/migrations", import.meta.url).href,
);

const FINGERPRINT = "a".repeat(64);
const OTHER_FINGERPRINT = "b".repeat(64);

/** Draft JSON hợp lệ theo `extractedExamDraftSchema` (title truyền vào). */
const draftJson = (title: string): string =>
	JSON.stringify({
		title,
		skill: "reading",
		timeLimitMinutes: 60,
		parts: [
			{
				questions: [
					{ stem: "Câu 1", answer: "A", confidence: 0.9, needsReview: false },
				],
			},
		],
	});

describe("findCompletedImportByFingerprint (TOS-25)", () => {
	let db: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;
	});

	beforeEach(async () => {
		await db.delete(examImportJob);
	});

	async function insertJob(overrides: {
		id: string;
		orgId?: string;
		fingerprint?: string;
		importStatus?: "processing" | "completed" | "failed_refunded";
		draftJson?: string | null;
		completedAt?: Date | null;
		startedAt?: Date;
	}) {
		await db.insert(examImportJob).values({
			id: overrides.id,
			orgId: overrides.orgId ?? "org-1",
			createdBy: "u-teacher",
			fileKey: `exam-imports/org-1/${overrides.id}`,
			fileName: "cambridge-sample.pdf",
			mimeType: "application/pdf",
			sizeBytes: 2048,
			contentFingerprint: overrides.fingerprint ?? FINGERPRINT,
			importStatus: overrides.importStatus ?? "completed",
			draftJson:
				overrides.draftJson === undefined
					? draftJson(`Đề ${overrides.id}`)
					: overrides.draftJson,
			startedAt: overrides.startedAt ?? new Date("2026-10-27T00:00:00Z"),
			completedAt:
				overrides.completedAt === undefined
					? new Date("2026-10-27T01:00:00Z")
					: overrides.completedAt,
		});
	}

	test("không có job nào → null", async () => {
		expect(
			await findCompletedImportByFingerprint(db, "org-1", FINGERPRINT),
		).toBeNull();
	});

	test("job `processing` / `failed_refunded` không tính là trùng", async () => {
		await insertJob({ id: "j-processing", importStatus: "processing" });
		await insertJob({ id: "j-failed", importStatus: "failed_refunded" });
		expect(
			await findCompletedImportByFingerprint(db, "org-1", FINGERPRINT),
		).toBeNull();
	});

	test("job `completed` nhưng draftJson NULL → không tính (không khoá vĩnh viễn tệp)", async () => {
		await insertJob({ id: "j-no-draft", draftJson: null });
		expect(
			await findCompletedImportByFingerprint(db, "org-1", FINGERPRINT),
		).toBeNull();
	});

	test("org khác → không trùng (org-scoped)", async () => {
		await insertJob({ id: "j-org2", orgId: "org-2" });
		expect(
			await findCompletedImportByFingerprint(db, "org-1", FINGERPRINT),
		).toBeNull();
		expect(
			(await findCompletedImportByFingerprint(db, "org-2", FINGERPRINT))?.jobId,
		).toBe("j-org2");
	});

	test("fingerprint khác → null", async () => {
		await insertJob({ id: "j-other", fingerprint: OTHER_FINGERPRINT });
		expect(
			await findCompletedImportByFingerprint(db, "org-1", FINGERPRINT),
		).toBeNull();
	});

	test("chọn job completed_at mới nhất; title parse từ draft_json", async () => {
		await insertJob({
			id: "j-old",
			completedAt: new Date("2026-10-26T01:00:00Z"),
		});
		await insertJob({
			id: "j-new",
			completedAt: new Date("2026-10-27T02:00:00Z"),
		});
		const dup = await findCompletedImportByFingerprint(
			db,
			"org-1",
			FINGERPRINT,
		);
		expect(dup).toEqual({
			jobId: "j-new",
			title: "Đề j-new",
			completedAt: "2026-10-27T02:00:00.000Z",
		});
	});

	test("completed_at bằng nhau → started_at mới nhất phá hoà (tiebreaker)", async () => {
		await insertJob({
			id: "j-a",
			completedAt: new Date("2026-10-27T02:00:00Z"),
			startedAt: new Date("2026-10-27T01:00:00Z"),
		});
		await insertJob({
			id: "j-b",
			completedAt: new Date("2026-10-27T02:00:00Z"),
			startedAt: new Date("2026-10-27T01:30:00Z"),
		});
		const dup = await findCompletedImportByFingerprint(
			db,
			"org-1",
			FINGERPRINT,
		);
		expect(dup?.jobId).toBe("j-b");
	});

	test("draft JSON hỏng → title fallback fileName, không ném", async () => {
		await insertJob({ id: "j-broken", draftJson: "{không phải json" });
		const dup = await findCompletedImportByFingerprint(
			db,
			"org-1",
			FINGERPRINT,
		);
		expect(dup?.title).toBe("cambridge-sample.pdf");
	});

	test("completedAt null (row lạ) → fallback startedAt, không ném", async () => {
		await insertJob({
			id: "j-null-completed",
			completedAt: null,
			startedAt: new Date("2026-10-26T00:00:00Z"),
		});
		const dup = await findCompletedImportByFingerprint(
			db,
			"org-1",
			FINGERPRINT,
		);
		expect(dup?.completedAt).toBe("2026-10-26T00:00:00.000Z");
	});

	test("completed_at và started_at bằng nhau → id nhỏ hơn thắng (tiebreaker bậc 3 asc id)", async () => {
		const sameCompletedAt = new Date("2026-10-27T02:00:00Z");
		const sameStartedAt = new Date("2026-10-27T01:00:00Z");
		// Chèn j-2 trước j-1 để không phụ thuộc thứ tự rowid chèn.
		await insertJob({
			id: "j-2",
			completedAt: sameCompletedAt,
			startedAt: sameStartedAt,
		});
		await insertJob({
			id: "j-1",
			completedAt: sameCompletedAt,
			startedAt: sameStartedAt,
		});
		const dup = await findCompletedImportByFingerprint(
			db,
			"org-1",
			FINGERPRINT,
		);
		expect(dup?.jobId).toBe("j-1");
	});
});
