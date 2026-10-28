import { AI_GRADING_ERROR_CODES } from "@teacher-os/api/contracts";
import { aiGradingDraft } from "@teacher-os/db/schema/ai-grading-draft";
import { creditUsageLog } from "@teacher-os/db/schema/credit-wallet";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "../../app";
import { releaseCredits } from "../credits/wallet";

/**
 * Ngưỡng draft coi như treo: timeout AI 20s + biên DB/sweep (kongming
 * red-team #478 điều kiện 1 — PHẢI lớn hơn toàn bộ ngân sách nền của
 * pipeline để không đuổi kịp runner còn sống; TOS-33 budget vòng retry
 * 30s vẫn nhỏ hơn ngưỡng này, test assert bất biến).
 */
export const STALE_GRADING_AFTER_MS = 60_000;

/** Giới hạn số draft dọn mỗi nhóm mỗi lần gọi — bảo vệ độ trễ request. */
const STALE_SWEEP_BATCH = 20;

/**
 * Dọn lười held Credit treo do isolate chết giữa `waitUntil` (TOS-30;
 * TOS-33 mở rộng đối chiếu THEO TỪNG LƯỢT chấm). Hai cửa sổ crash:
 * 1. Draft kẹt `ai_processing` (chết giữa pipeline) — CAS `manual_pending`
 *    TRƯỚC rồi release (kongming điều kiện 2: draft trước, ví sau; thua CAS
 *    nghĩa là runner sống đã chuyển `ai_drafted` và sẽ tự settle — sweep
 *    tuyệt đối không release, nếu không `held` bị trừ 2 lần).
 * 2. Draft đã rời `ai_processing` (`ai_drafted`/`manual_pending`) nhưng
 *    runner chết giữa CAS thắng và `settle`/`release` — held kẹt vĩnh viễn
 *    vì publish/PATCH không đụng ví (code review #478 Minor).
 *
 * TOS-33 D3: một attempt có thể có NHIỀU lượt reserve (lượt gốc + các lượt
 * "Thử chấm lại AI", khóa `r<n>`), mỗi lượt một bộ reserve/settle/release.
 * Đối chiếu per-occasion (`releaseUnsettledOccasions`): lượt nào có
 * `reserved` mà chưa có `settled`/`released` thì release đúng key lượt đó
 * (key dựng từ `retry_count` của draft — lượt 0 giữ key cũ TOS-30; KHÔNG
 * parse/LIKE chuỗi). Đối chiếu gộp toàn bộ `ref_id` như bản cũ sẽ bỏ sót
 * lượt r1 treo khi r0 đã released (kongming advisory #481 mục 2.5).
 *
 * Gọi ở đầu `GET /api/grading`, `GET /api/grading/:attemptId` và
 * `GET /api/credits/wallet` — mọi lần chạm ví/hàng chờ đều có cơ hội dọn rác.
 */
export async function releaseStaleGradings(
	db: Db,
	orgId: string,
): Promise<void> {
	const cutoff = new Date(Date.now() - STALE_GRADING_AFTER_MS);

	// Nhóm 1 — `ai_processing` treo: CAS về `manual_pending` trước.
	const processing = await db
		.select({
			attemptId: aiGradingDraft.attemptId,
			creditCost: aiGradingDraft.creditCost,
			retryCount: aiGradingDraft.retryCount,
		})
		.from(aiGradingDraft)
		.where(
			and(
				eq(aiGradingDraft.orgId, orgId),
				eq(aiGradingDraft.status, "ai_processing"),
				lt(aiGradingDraft.startedAt, cutoff),
			),
		)
		.limit(STALE_SWEEP_BATCH);
	for (const draft of processing) {
		const won = await db
			.update(aiGradingDraft)
			.set({
				status: "manual_pending",
				errorCode: AI_GRADING_ERROR_CODES.TIMEOUT,
			})
			.where(
				and(
					eq(aiGradingDraft.attemptId, draft.attemptId),
					eq(aiGradingDraft.status, "ai_processing"),
				),
			)
			.returning({ attemptId: aiGradingDraft.attemptId });
		if (won.length === 0) continue;
		// Sweep thắng CAS → runner lượt này đã chết → release đúng lượt
		// hiện tại (key theo `retry_count`). Vẫn qua per-occasion check:
		// draft không reserve (test seed, NO_TRANSCRIPT) không có held —
		// release mù sẽ ăn nhầm held của job khác / ném thiếu Credit.
		await releaseUnsettledOccasions(
			db,
			orgId,
			draft.attemptId,
			draft.retryCount,
			draft.creditCost,
		);
	}

	// Nhóm 2 — đã rời `ai_processing` nhưng còn lượt chưa giải tỏa: crash
	// sau CAS, trước ví. Giữ nguyên trạng thái draft — điểm AI vẫn dùng
	// được, chỉ trả held. Điều kiện SQL so sánh số dòng `reserved` > số dòng
	// `settled`/`released` của attempt: draft đã giải tỏa hết mọi lượt bị
	// loại ngay trong SQL để org có > 20 draft cũ không làm nghẽn batch 20.
	const terminalStale = await db
		.select({
			attemptId: aiGradingDraft.attemptId,
			creditCost: aiGradingDraft.creditCost,
			retryCount: aiGradingDraft.retryCount,
		})
		.from(aiGradingDraft)
		.where(
			and(
				eq(aiGradingDraft.orgId, orgId),
				inArray(aiGradingDraft.status, ["ai_drafted", "manual_pending"]),
				lt(aiGradingDraft.startedAt, cutoff),
				sql`(SELECT count(*) FROM credit_usage_log cul
					WHERE cul.ref_id = ${aiGradingDraft.attemptId}
						AND cul.action_type = 'ai_grading'
						AND cul.tx_status = 'reserved')
					>
					(SELECT count(*) FROM credit_usage_log cul
					WHERE cul.ref_id = ${aiGradingDraft.attemptId}
						AND cul.action_type = 'ai_grading'
						AND cul.tx_status IN ('settled', 'released'))`,
			),
		)
		.limit(STALE_SWEEP_BATCH);
	for (const draft of terminalStale) {
		await releaseUnsettledOccasions(
			db,
			orgId,
			draft.attemptId,
			draft.retryCount,
			draft.creditCost,
		);
	}
}

/**
 * Release MỌI lượt (0..retryCount) còn `reserved` chưa được giải tỏa: mỗi
 * lượt một bộ key (`lượt 0` = key cũ TOS-30, `r<n>` = TOS-33); lượt đã
 * `settled`/`released` bỏ qua — lặp lại là no-op an toàn theo key idempotent.
 */
export async function releaseUnsettledOccasions(
	db: Db,
	orgId: string,
	attemptId: string,
	retryCount: number,
	creditCost: number,
): Promise<void> {
	const logs = await db
		.select({
			idempotencyKey: creditUsageLog.idempotencyKey,
			txStatus: creditUsageLog.txStatus,
		})
		.from(creditUsageLog)
		.where(
			and(
				eq(creditUsageLog.refId, attemptId),
				eq(creditUsageLog.actionType, "ai_grading"),
			),
		);
	const reserveKeys = new Set(
		logs
			.filter((log) => log.txStatus === "reserved")
			.map((log) => log.idempotencyKey),
	);
	const resolvedKeys = new Set(
		logs
			.filter(
				(log) => log.txStatus === "settled" || log.txStatus === "released",
			)
			.map((log) => log.idempotencyKey),
	);
	for (let occasion = 0; occasion <= retryCount; occasion++) {
		const opPrefix =
			occasion < 1
				? `ai_grading:${attemptId}`
				: `ai_grading:${attemptId}:r${occasion}`;
		// Lượt không có reserve → không held nào để trả; đã settled/released
		// → biến đổi hoàn tất, không đụng.
		if (!reserveKeys.has(`${opPrefix}:reserve`)) continue;
		if (resolvedKeys.has(`${opPrefix}:settle`)) continue;
		if (resolvedKeys.has(`${opPrefix}:release`)) continue;
		await releaseCredits(db, {
			orgId,
			actorUserId: "system",
			amount: creditCost,
			refId: attemptId,
			actionType: "ai_grading",
			...(occasion >= 1 ? { retryCount: occasion } : {}),
		});
	}
}
