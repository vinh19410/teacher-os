/**
 * Định dạng hiển thị cho trang kết quả attempt (#283 phase 4). Tách khỏi
 * route module để test thuần không kéo router/auth graph.
 */

/**
 * Thời lượng hoàn thành "X phút Y giây" từ submittedAt − startedAt (ISO).
 * Bỏ số 0: 0 phút → "Y giây", 0 giây → "X phút". ISO sai/mất → rỗng.
 */
export function formatAttemptDuration(
	startedAt: string,
	submittedAt: string,
): string {
	const start = Date.parse(startedAt);
	const end = Date.parse(submittedAt);
	if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
		return "";
	}
	const totalSeconds = Math.floor((end - start) / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes === 0) return `${seconds} giây`;
	if (seconds === 0) return `${minutes} phút`;
	return `${minutes} phút ${seconds} giây`;
}

/**
 * "dd/MM/yyyy HH:mm" theo giờ Việt Nam (Asia/Ho_Chi_Minh, không DST) —
 * formatToParts để output không phụ thuộc ICU/TZ máy học viên.
 */
export function formatVietnamSubmittedAt(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Ho_Chi_Minh",
		calendar: "gregory",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(date);
	const get = (type: Intl.DateTimeFormatPartTypes): string =>
		parts.find((part) => part.type === type)?.value ?? "";
	return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

export type QuizTimerPhase = "running" | "warn" | "expired";

export interface QuizTimerState {
	remainingSeconds: number;
	formatted: string;
	phase: QuizTimerPhase;
}

/**
 * Định dạng giây còn lại theo `MM:SS` (không wrap tại 60 phút để đề 60–240 phút
 * hiển thị `60:00` / `240:00` giống phòng thi). Giá trị âm hoặc NaN → `00:00`.
 */
export function formatQuizClock(totalSeconds: number): string {
	if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
		return "00:00";
	}
	const clamped = Math.floor(totalSeconds);
	const minutes = Math.floor(clamped / 60);
	const seconds = clamped % 60;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

let serverClockSkewMs = 0;

/**
 * Ghi nhận độ lệch giờ máy học viên (`receivedAtMs - serverNowMs`) từ header
 * `X-Server-Now` ngay lúc nhận response HTTP — tách khỏi React Query
 * `dataUpdatedAt` nên mutation cập nhật cache (như `setQuizDetailMedia`) không
 * làm trôi đồng hồ.
 */
export function syncServerClock(
	serverNowIso: string | null | undefined,
	receivedAtMs = Date.now(),
): void {
	if (!serverNowIso || !Number.isFinite(receivedAtMs)) return;
	const serverMs = Date.parse(serverNowIso);
	if (!Number.isFinite(serverMs)) return;
	serverClockSkewMs = receivedAtMs - serverMs;
}

export function getServerClockSkewMs(): number {
	return serverClockSkewMs;
}

export function resetServerClockForTests(): void {
	serverClockSkewMs = 0;
}

/**
 * Tính trạng thái đồng hồ đếm ngược từ `startedAt` server + `timeLimitSeconds`
 * + bù lệch đồng hồ `clockSkewMs`. Ngưỡng cảnh báo: `min(300s, floor(20%))`.
 */
export function computeQuizTimerState({
	timeLimitSeconds,
	startedAt,
	nowMs,
	clockSkewMs,
}: {
	timeLimitSeconds: number | null | undefined;
	startedAt: string | null | undefined;
	nowMs: number;
	clockSkewMs: number;
}): QuizTimerState | null {
	if (
		typeof timeLimitSeconds !== "number" ||
		!Number.isFinite(timeLimitSeconds) ||
		timeLimitSeconds <= 0 ||
		!startedAt ||
		!Number.isFinite(nowMs)
	) {
		return null;
	}
	const startedAtMs = Date.parse(startedAt);
	if (!Number.isFinite(startedAtMs)) return null;

	const safeSkew = Number.isFinite(clockSkewMs) ? clockSkewMs : 0;
	const elapsedSeconds = Math.max(
		0,
		Math.floor((nowMs - safeSkew - startedAtMs) / 1000),
	);
	const remainingSeconds = Math.max(0, timeLimitSeconds - elapsedSeconds);
	const warnThresholdSeconds = Math.min(
		300,
		Math.floor(timeLimitSeconds * 0.2),
	);
	const phase: QuizTimerPhase =
		remainingSeconds === 0
			? "expired"
			: remainingSeconds <= warnThresholdSeconds
				? "warn"
				: "running";

	return {
		remainingSeconds,
		formatted: formatQuizClock(remainingSeconds),
		phase,
	};
}
