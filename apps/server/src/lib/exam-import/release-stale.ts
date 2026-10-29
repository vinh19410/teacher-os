import {
	EXAM_IMPORT_ERROR_CODES,
	type ExamImportFailReason,
} from "@teacher-os/api/contracts";
import { creditUsageLog } from "@teacher-os/db/schema/credit-wallet";
import { examImportJob } from "@teacher-os/db/schema/exam-import-job";
import { and, eq, lt } from "drizzle-orm";
import type { Db } from "../../app";
import { releaseCredits } from "../credits/wallet";

/** Ngưỡng job `processing` coi như treo (plan TOS-27 D3): 120s timeout + biên. */
export const STALE_IMPORT_AFTER_MS = 150_000;

/** Giới hạn số job dọn mỗi lần gọi — bảo vệ độ trễ của request gọi sweep. */
const STALE_SWEEP_BATCH = 20;

/**
 * Dọn lười job `processing` treo quá ngưỡng (plan TOS-27 D3 — không có
 * cron/Queue): hoàn Credit đang giữ + mark `failed_refunded` E-004 reason
 * `timeout`. Idempotency key `exam_import:<jobId>:release` (UNIQUE ở sổ
 * cái) bảo đảm hoàn đúng 1 lần dù nhiều request gọi song song.
 *
 * Trường hợp crash-sau-settle trước kịp mark (`settle` log có, `release`
 * không): credit ĐÃ trừ — hoàn thất bại là đúng, job phải sang `completed`
 * chứ không `failed_refunded`.
 *
 * Gọi ở đầu `POST /exam-imports`, `GET /exam-imports/:id` và
 * `GET /credits/wallet` — mọi lần chạm ví/job đều có cơ hội dọn rác.
 */
export async function releaseStaleImports(
	db: Db,
	orgId: string,
): Promise<void> {
	const cutoff = new Date(Date.now() - STALE_IMPORT_AFTER_MS);
	const staleJobs = await db
		.select()
		.from(examImportJob)
		.where(
			and(
				eq(examImportJob.orgId, orgId),
				eq(examImportJob.importStatus, "processing"),
				lt(examImportJob.startedAt, cutoff),
			),
		)
		.limit(STALE_SWEEP_BATCH);
	for (const job of staleJobs) {
		const settleKey = `exam_import:${job.id}:settle`;
		const [settleLog] = await db
			.select({ id: creditUsageLog.id })
			.from(creditUsageLog)
			.where(eq(creditUsageLog.idempotencyKey, settleKey))
			.limit(1);
		if (settleLog) {
			// Crash window #470: settle xong trước khi mark — chốt completed.
			await markJob(db, job.id, "completed", null);
			continue;
		}
		try {
			await releaseCredits(db, {
				orgId,
				actorUserId: job.createdBy,
				amount: job.heldCredits,
				refId: job.id,
			});
		} catch {
			// `InsufficientCreditsError`: held đã nhả do luồng khác — job đó
			// đang được xử lý sống động, bỏ qua để luồng đó tự chốt.
			continue;
		}
		// Release thành công → mark failed_refunded CHỈ khi còn `processing`
		// (request gốc có thể vừa hoàn tất giữa hai bước).
		await markJob(db, job.id, "failed_refunded", "timeout");
	}
}

async function markJob(
	db: Db,
	jobId: string,
	status: "completed" | "failed_refunded",
	reason: ExamImportFailReason | null,
): Promise<void> {
	await db
		.update(examImportJob)
		.set({
			importStatus: status,
			errorCode:
				status === "failed_refunded"
					? EXAM_IMPORT_ERROR_CODES.EXAM_FAILED
					: null,
			errorReason: reason,
			completedAt: new Date(),
		})
		.where(
			and(
				eq(examImportJob.id, jobId),
				eq(examImportJob.importStatus, "processing"),
			),
		);
}
