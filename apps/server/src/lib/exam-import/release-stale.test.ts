import { createClient } from "@libsql/client";
import { EXAM_IMPORT_ERROR_CODES } from "@teacher-os/api/contracts";
import {
	creditUsageLog,
	creditWallet,
} from "@teacher-os/db/schema/credit-wallet";
import { examImportJob } from "@teacher-os/db/schema/exam-import-job";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Db } from "../../app";
import { ensureWallet, reserveCredits } from "../credits/wallet";
import { releaseStaleImports } from "./release-stale";

const MIGRATIONS_DIR = new URL(
	"../../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

async function seedProcessingJob(
	db: Db,
	jobId: string,
	startedAt: Date,
): Promise<void> {
	await db.insert(examImportJob).values({
		id: jobId,
		orgId: "org-1",
		createdBy: "u-1",
		fileKey: `exam-imports/org-1/${jobId}`,
		fileName: "x.pdf",
		mimeType: "application/pdf",
		sizeBytes: 1,
		contentFingerprint: jobId.replaceAll("-", "0").padEnd(64, "0").slice(0, 64),
		heldCredits: 5,
		importStatus: "processing",
		startedAt,
	});
}

async function releasedLogCount(db: Db): Promise<number> {
	const logs = await db
		.select()
		.from(creditUsageLog)
		.where(eq(creditUsageLog.txStatus, "released"));
	return logs.length;
}

describe("releaseStaleImports (TOS-27 D3)", () => {
	let db: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;
		await db.insert(schema.organization).values({ id: "org-1", name: "A" });
	});

	beforeEach(async () => {
		await db.delete(creditUsageLog);
		await db.delete(creditWallet);
		await db.delete(examImportJob);
		await ensureWallet(db, "org-1");
	});

	test("job mới (dưới ngưỡng 150s) không bị dọn", async () => {
		await seedProcessingJob(db, "job-fresh", new Date());
		await reserveCredits(db, {
			orgId: "org-1",
			actorUserId: "u-1",
			amount: 5,
			refId: "job-fresh",
		});
		await releaseStaleImports(db, "org-1");
		const [job] = await db
			.select()
			.from(examImportJob)
			.where(eq(examImportJob.id, "job-fresh"));
		expect(job?.importStatus).toBe("processing");
		expect(await releasedLogCount(db)).toBe(0);
	});

	test("job treo 151s → release 1 lần dù gọi 2 lần; org khác không đụng", async () => {
		await seedProcessingJob(db, "job-stale", new Date(Date.now() - 151_000));
		await reserveCredits(db, {
			orgId: "org-1",
			actorUserId: "u-1",
			amount: 5,
			refId: "job-stale",
		});
		await releaseStaleImports(db, "org-2"); // org khác — không đụng job này.
		expect(await releasedLogCount(db)).toBe(0);
		await releaseStaleImports(db, "org-1");
		await releaseStaleImports(db, "org-1");
		expect(await releasedLogCount(db)).toBe(1);
		const [job] = await db
			.select()
			.from(examImportJob)
			.where(eq(examImportJob.id, "job-stale"));
		expect(job?.importStatus).toBe("failed_refunded");
		expect(job?.errorCode).toBe(EXAM_IMPORT_ERROR_CODES.EXAM_FAILED);
		expect(job?.errorReason).toBe("timeout");
	});
});
