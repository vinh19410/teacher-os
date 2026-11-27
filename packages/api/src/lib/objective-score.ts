import { isBandStep } from "./ielts-band";

/**
 * Chuẩn hóa & định dạng điểm trắc nghiệm tự chấm (#977) cùng kiểm chuẩn
 * band đã chấm — thuần TypeScript, biên dịch cho cả workerd lẫn browser.
 */
export interface ObjectiveScore {
	correctCount: number;
	totalQuestions: number;
}

/**
 * Chỉ chấp nhận cặp số nguyên an toàn (`Number.isSafeInteger`):
 * `totalQuestions > 0` và `0 <= correctCount <= totalQuestions`.
 * Loại bỏ `0/0` (bài Writing/Speaking không có câu hỏi), số âm, số thực,
 * `NaN`, `Infinity`, số vượt `MAX_SAFE_INTEGER` và dữ liệu thiếu một vế.
 */
export function normalizeObjectiveScore(
	correctCount: unknown,
	totalQuestions: unknown,
): ObjectiveScore | null {
	if (typeof correctCount !== "number" || typeof totalQuestions !== "number") {
		return null;
	}
	if (
		!Number.isSafeInteger(correctCount) ||
		!Number.isSafeInteger(totalQuestions)
	) {
		return null;
	}
	if (
		totalQuestions <= 0 ||
		correctCount < 0 ||
		correctCount > totalQuestions
	) {
		return null;
	}
	return { correctCount, totalQuestions };
}

export function formatObjectiveScore(score: ObjectiveScore): string {
	return `${score.correctCount}/${score.totalQuestions}`;
}

/**
 * Kiểm chuẩn điểm Band IELTS đã chấm: band hợp lệ (0–9, bước 0.5) đi kèm
 * mốc thời gian `gradedAt` không rỗng và parse được. Dùng chữ ký generic để
 * giữ nguyên các trường đã narrow (như `attemptId`) tại caller.
 */
export function hasValidGradedBand<
	T extends { band?: number | null; gradedAt?: string | null },
>(target: T): target is T & { band: number; gradedAt: string } {
	return (
		typeof target.band === "number" &&
		isBandStep(target.band) &&
		typeof target.gradedAt === "string" &&
		target.gradedAt.trim().length > 0 &&
		Number.isFinite(Date.parse(target.gradedAt))
	);
}
