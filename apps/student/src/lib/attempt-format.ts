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
