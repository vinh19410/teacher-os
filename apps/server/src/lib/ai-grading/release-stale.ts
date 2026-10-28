import { AI_GRADING_ERROR_CODES } from "@teacher-os/api/contracts";
import { aiGradingDraft } from "@teacher-os/db/schema/ai-grading-draft";
import { creditUsageLog } from "@teacher-os/db/schema/credit-wallet";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "../../app";
import { releaseCredits, revertQuickGradeSlot } from "../credits/wallet";

/**
 * Ngưỡng draft coi như treo: timeout AI 20s + biên DB/sweep (kongming
 * red-team #478 điều kiện 1 — PHẢI lớn hơn toàn bộ ngân sách nền của
 * pipeline để không đuổi kịp runner còn sống).
 */
export const STALE_GRADING_AFTER_MS = 60_000;

/** Giới hạn số draft dọn mỗi nhóm mỗi lần gọi — bảo vệ độ trễ request. */
const STALE_SWEEP_BATCH = 20;

/**
 * Dọn lười held Credit treo do isolate chết giữa `waitUntil` (TOS-30).
 * Hai cửa sổ crash:
 * 1. Draft kẹt `ai_processing` (chết giữa pipeline) — CAS `manual_pending`
 *    TRƯỚC rồi release (kongming điều kiện 2: draft trước, ví sau; thua CAS
 *    nghĩa là runner sống đã chuyển `ai_drafted` và sẽ tự settle — sweep
 *    tuyệt đối không release, nếu không `held` bị trừ 2 lần).
 * 2. Draft đã rời `ai_processing` (`ai_drafted`/`manual_pending`) nhưng
 *    runner chết giữa CAS thắng và `settle`/`release` — held kẹt vĩnh viễn
 *    vì publish/PATCH không đụng ví (code review #478 Minor). Chỉ hoàn khi
 *    sổ cái CÓ reserve mà CHƯA có settle/release.
 * Cả hai đường chỉ hoàn qua helper `releaseIfReserved`: draft chưa kịp
 * reserve không có gì để hoàn — release mù sẽ ăn nhầm `held` của job khác
 * (guard `held >= amount` tính trên toàn org) hoặc ném
 * `InsufficientCreditsError` làm 500 route GET. Key
 * `ai_grading:<attemptId>:release` (UNIQUE) bảo đảm hoàn đúng 1 lần.
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
		await releaseIfReserved(db, orgId, draft.attemptId, draft.creditCost);
		// Nếu draft đã kịp claim lượt Chấm nhanh (TOS-32) trước khi treo,
		// hoàn lại lượt đó (idempotent; không phụ thuộc cột grading_mode vì
		// crash có thể xảy ra trước UPDATE grading_mode).
		await revertQuickGradeSlot(db, {
			orgId,
			attemptId: draft.attemptId,
		});
	}

	// Nhóm 2 — đã rời `ai_processing` nhưng held chưa được giải tỏa: draft
	// `ai_drafted`/`manual_pending` quá hạn (crash sau CAS, trước ví). Giữ
	// nguyên trạng thái draft — điểm AI vẫn dùng được, chỉ trả held. Lọc
	// EXISTS/NOT EXISTS ngay trong SQL để không quét lại mãi cùng các draft
	// đã xử lý (code review #478).
	const terminalStale = await db
		.select({
			attemptId: aiGradingDraft.attemptId,
			creditCost: aiGradingDraft.creditCost,
		})
		.from(aiGradingDraft)
		.where(
			and(
				eq(aiGradingDraft.orgId, orgId),
				inArray(aiGradingDraft.status, ["ai_drafted", "manual_pending"]),
				lt(aiGradingDraft.startedAt, cutoff),
				sql`EXISTS (SELECT 1 FROM credit_usage_log cul
					WHERE cul.ref_id = ${aiGradingDraft.attemptId}
						AND cul.action_type = 'ai_grading'
						AND cul.tx_status = 'reserved')`,
				sql`NOT EXISTS (SELECT 1 FROM credit_usage_log cul
					WHERE cul.ref_id = ${aiGradingDraft.attemptId}
						AND cul.action_type = 'ai_grading'
						AND cul.tx_status IN ('settled', 'released'))`,
			),
		)
		.limit(STALE_SWEEP_BATCH);
	for (const draft of terminalStale) {
		await releaseIfReserved(db, orgId, draft.attemptId, draft.creditCost);
	}

	// Nhóm 3 — draft `manual_pending` quá hạn có dòng claim Chấm nhanh
	// (`quick_grade_writing` `settled`) nhưng chưa có `reverted` (crash giữa
	// CAS `manual_pending` và `revertQuickGradeSlot`).
	const quickStale = await db
		.select({
			attemptId: aiGradingDraft.attemptId,
		})
		.from(aiGradingDraft)
		.where(
			and(
				eq(aiGradingDraft.orgId, orgId),
				or(
					eq(aiGradingDraft.status, "manual_pending"),
					and(
						eq(aiGradingDraft.status, "published"),
						isNull(aiGradingDraft.aiScores),
					),
				),
				lt(aiGradingDraft.startedAt, cutoff),
				sql`EXISTS (SELECT 1 FROM credit_usage_log cul
					WHERE cul.ref_id = ${aiGradingDraft.attemptId}
						AND cul.action_type = 'quick_grade_writing'
						AND cul.tx_status = 'settled')`,
				sql`NOT EXISTS (SELECT 1 FROM credit_usage_log cul
					WHERE cul.ref_id = ${aiGradingDraft.attemptId}
						AND cul.action_type = 'quick_grade_writing'
						AND cul.tx_status = 'reverted')`,
			),
		)
		.limit(STALE_SWEEP_BATCH);
	for (const draft of quickStale) {
		await revertQuickGradeSlot(db, {
			orgId,
			attemptId: draft.attemptId,
		});
	}
}

/**
 * Hoàn held treo của một attempt: CHỈ khi sổ cái có dòng `reserved` mà
 * CHƯA có `settled`/`released` (mọi log cùng `refId` + `ai_grading`).
 * `releaseCredits` idempotent theo key — lần gọi lặp là no-op an toàn.
 */
async function releaseIfReserved(
	db: Db,
	orgId: string,
	attemptId: string,
	creditCost: number,
): Promise<void> {
	const logs = await db
		.select({ txStatus: creditUsageLog.txStatus })
		.from(creditUsageLog)
		.where(
			and(
				eq(creditUsageLog.refId, attemptId),
				eq(creditUsageLog.actionType, "ai_grading"),
			),
		);
	const statuses = new Set(logs.map((log) => log.txStatus));
	if (!statuses.has("reserved") || statuses.has("settled")) return;
	// Có `released` → đã hoàn rồi; không có gì để làm.
	if (statuses.has("released")) return;
	await releaseCredits(db, {
		orgId,
		actorUserId: "system",
		amount: creditCost,
		refId: attemptId,
		actionType: "ai_grading",
	});
}
