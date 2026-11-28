import { hasControlChars } from "./email-html";
import {
	formatViDateDisplay,
	formatVietnamTimeHHMM,
	vietnamDateKeyOf,
	vietnamDateTimeMs,
	vietnamSessionEndMs,
} from "./vietnam-date";

/** Số phút học viên được phép vào link Zoom sớm trước giờ bắt đầu buổi học. */
export const ZOOM_EARLY_JOIN_MINUTES = 30;

/** Số mili-giây mở link Zoom sớm trước giờ bắt đầu buổi học. */
export const ZOOM_EARLY_JOIN_MS = ZOOM_EARLY_JOIN_MINUTES * 60_000;

export const ZOOM_JOIN_ERROR_CODES = {
	TOO_EARLY: "ZOOM_JOIN_TOO_EARLY",
	ENDED: "ZOOM_JOIN_ENDED",
	NOT_AVAILABLE: "ZOOM_JOIN_NOT_AVAILABLE",
	SESSION_INACTIVE: "ZOOM_JOIN_SESSION_INACTIVE",
	INVALID_SCHEDULE: "ZOOM_JOIN_INVALID_SCHEDULE",
} as const;

export type ZoomJoinErrorCode =
	(typeof ZOOM_JOIN_ERROR_CODES)[keyof typeof ZOOM_JOIN_ERROR_CODES];

export type ZoomJoinWindowStatus = "too_early" | "open" | "ended" | "invalid";

export type ZoomJoinWindowResult =
	| {
			status: "invalid";
			startMs: null;
			openMs: null;
			closeMs: null;
	  }
	| {
			status: "too_early" | "open" | "ended";
			startMs: number;
			openMs: number;
			closeMs: number;
	  };

export interface EvaluateZoomJoinWindowInput {
	date: string | null | undefined;
	time: string;
	dur: number;
	nowMs?: number;
}

export interface FormatZoomJoinWindowMessageInput {
	status: "too_early" | "ended" | "invalid";
	date?: string | null;
	time?: string;
	dur?: number;
	openAt?: string | null;
	closeAt?: string | null;
}

const STRICT_ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const STRICT_TIME_HHMM_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const INVALID_SCHEDULE_MESSAGE =
	"Không xác định được khung giờ buổi học để mở link Zoom.";

/**
 * Kiểm tra URL tham gia Zoom hợp lệ (`https://`, không phân biệt hoa/thường
 * scheme, không chứa khoảng trắng và có hostname). Dùng chung cho server và
 * client để tránh lệch quy tắc giữa tầng cấp link và tầng mở tab.
 */
export function isValidZoomJoinUrl(raw: string | null | undefined): boolean {
	const trimmed = raw?.trim() ?? "";
	if (!trimmed || hasControlChars(trimmed) || /\s/.test(trimmed)) return false;
	try {
		const parsed = new URL(trimmed);
		return parsed.protocol === "https:" && parsed.hostname.length > 0;
	} catch {
		return false;
	}
}

function isValidIsoCalendarDate(date: string): boolean {
	if (!STRICT_ISO_DATE_REGEX.test(date)) return false;
	const parsed = new Date(`${date}T00:00:00Z`);
	if (Number.isNaN(parsed.getTime())) return false;
	return parsed.toISOString().slice(0, 10) === date;
}

function parseIsoTimestampMs(raw: string | null | undefined): number | null {
	if (typeof raw !== "string" || raw.trim().length === 0) return null;
	const ms = Date.parse(raw);
	return Number.isFinite(ms) ? ms : null;
}

function resolveScheduleStartMs(
	date: string | null | undefined,
	time: string | undefined,
): number | null {
	if (
		typeof date !== "string" ||
		typeof time !== "string" ||
		!isValidIsoCalendarDate(date) ||
		!STRICT_TIME_HHMM_REGEX.test(time)
	) {
		return null;
	}
	const ms = vietnamDateTimeMs(date, time);
	return Number.isFinite(ms) ? ms : null;
}

/**
 * Đánh giá cửa sổ mở link Zoom cho học viên theo múi giờ Việt Nam (UTC+7):
 * khoảng nửa mở `[start - 30 phút, end)`. Trả `"invalid"` khi ngày, giờ,
 * thời lượng hoặc mốc `nowMs` không hợp lệ.
 */
export function evaluateZoomJoinWindow(
	input: EvaluateZoomJoinWindowInput,
): ZoomJoinWindowResult {
	const { date, time, dur } = input;
	const nowMs = input.nowMs ?? Date.now();

	if (
		typeof date !== "string" ||
		typeof time !== "string" ||
		!isValidIsoCalendarDate(date) ||
		!STRICT_TIME_HHMM_REGEX.test(time) ||
		typeof dur !== "number" ||
		!Number.isFinite(dur) ||
		dur <= 0 ||
		!Number.isFinite(nowMs)
	) {
		return { status: "invalid", startMs: null, openMs: null, closeMs: null };
	}

	const startMs = vietnamDateTimeMs(date, time);
	const endMs = vietnamSessionEndMs(date, time, dur);
	if (
		!Number.isFinite(startMs) ||
		endMs == null ||
		!Number.isFinite(endMs) ||
		endMs <= startMs
	) {
		return { status: "invalid", startMs: null, openMs: null, closeMs: null };
	}

	const openMs = startMs - ZOOM_EARLY_JOIN_MS;
	const closeMs = endMs;

	if (nowMs < openMs) {
		return { status: "too_early", startMs, openMs, closeMs };
	}
	if (nowMs >= closeMs) {
		return { status: "ended", startMs, openMs, closeMs };
	}
	return { status: "open", startMs, openMs, closeMs };
}

/**
 * Định dạng thông báo tiếng Việt giải thích trạng thái khung giờ link Zoom theo
 * múi giờ `Asia/Ho_Chi_Minh`. Khi khoảng thời gian vắt qua nửa đêm, hiển thị
 * rõ ngày bắt đầu và ngày kết thúc.
 */
export function formatZoomJoinWindowMessage(
	input: FormatZoomJoinWindowMessageInput,
): string {
	if (input.status === "invalid") {
		return INVALID_SCHEDULE_MESSAGE;
	}

	const parsedOpenMs = parseIsoTimestampMs(input.openAt);
	const parsedCloseMs = parseIsoTimestampMs(input.closeAt);
	const scheduleStartMs = resolveScheduleStartMs(input.date, input.time);

	const evaluated =
		input.date != null && input.time != null && input.dur != null
			? evaluateZoomJoinWindow({
					date: input.date,
					time: input.time,
					dur: input.dur,
				})
			: null;

	const openMs =
		parsedOpenMs ??
		(evaluated && evaluated.status !== "invalid" ? evaluated.openMs : null);
	const closeMs =
		parsedCloseMs ??
		(evaluated && evaluated.status !== "invalid" ? evaluated.closeMs : null);
	const startMs =
		scheduleStartMs ?? (openMs != null ? openMs + ZOOM_EARLY_JOIN_MS : null);

	if (input.status === "too_early") {
		if (openMs == null || closeMs == null || closeMs <= openMs) {
			return INVALID_SCHEDULE_MESSAGE;
		}
		const openDate = new Date(openMs);
		const closeDate = new Date(closeMs);
		const openDateISO = vietnamDateKeyOf(openDate);
		const closeDateISO = vietnamDateKeyOf(closeDate);
		const openHHMM = formatVietnamTimeHHMM(openDate);
		const closeHHMM = formatVietnamTimeHHMM(closeDate);
		if (!openHHMM || !closeHHMM) {
			return INVALID_SCHEDULE_MESSAGE;
		}
		if (openDateISO === closeDateISO) {
			return `Chưa đến giờ vào lớp. Link Zoom chỉ mở từ ${openHHMM} đến ${closeHHMM} ngày ${formatViDateDisplay(openDateISO)} (được vào sớm ${ZOOM_EARLY_JOIN_MINUTES} phút).`;
		}
		return `Chưa đến giờ vào lớp. Link Zoom chỉ mở từ ${openHHMM} ngày ${formatViDateDisplay(openDateISO)} đến ${closeHHMM} ngày ${formatViDateDisplay(closeDateISO)} (được vào sớm ${ZOOM_EARLY_JOIN_MINUTES} phút).`;
	}

	if (startMs == null || closeMs == null || closeMs <= startMs) {
		return INVALID_SCHEDULE_MESSAGE;
	}
	const startDate = new Date(startMs);
	const closeDate = new Date(closeMs);
	const startDateISO = vietnamDateKeyOf(startDate);
	const closeDateISO = vietnamDateKeyOf(closeDate);
	const startHHMM = formatVietnamTimeHHMM(startDate);
	const closeHHMM = formatVietnamTimeHHMM(closeDate);
	if (!startHHMM || !closeHHMM) {
		return INVALID_SCHEDULE_MESSAGE;
	}
	if (startDateISO === closeDateISO) {
		return `Buổi học đã kết thúc (${startHHMM} – ${closeHHMM} ngày ${formatViDateDisplay(startDateISO)}). Link Zoom không còn hiệu lực.`;
	}
	return `Buổi học đã kết thúc (${startHHMM} ngày ${formatViDateDisplay(startDateISO)} – ${closeHHMM} ngày ${formatViDateDisplay(closeDateISO)}). Link Zoom không còn hiệu lực.`;
}
