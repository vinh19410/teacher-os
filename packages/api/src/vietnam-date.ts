/**
 * Today as yyyy-mm-dd in Vietnam (UTC+7) via Intl parts — never a UTC slice
 * or machine-local Date, which drift a day between 00:00–07:00 VN
 * (Workers run UTC; browsers run visitor-local). Single source for the
 * class-assignment due min-today check (#208) on both server and web.
 * Promoted from apps/e2e/specs/helpers.ts.
 */
export function vietnamDateKeyOf(date: Date): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Ho_Chi_Minh",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const get = (type: string) =>
		parts.find((p) => p.type === type)?.value ?? "00";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Today as yyyy-mm-dd in Vietnam (UTC+7) via Intl parts — never a UTC slice
 * or machine-local Date, which drift a day between 00:00–07:00 VN
 * (Workers run UTC; browsers run visitor-local). Single source for the
 * class-assignment due min-today check (#208) on both server and web.
 * Promoted from apps/e2e/specs/helpers.ts.
 */
export function vietnamTodayISO(now: Date = new Date()): string {
	return vietnamDateKeyOf(now);
}

/** yyyy-mm-dd + n days, UTC-anchored — ISO strings carry no DST, so plain
 * day-millisecond math is exact and machine-local timezones never leak. */
export function addDaysISO(iso: string, n: number): string {
	return new Date(
		new Date(`${iso}T00:00:00Z`).getTime() + n * 24 * 60 * 60 * 1000,
	)
		.toISOString()
		.slice(0, 10);
}

/** Thứ Hai của tuần chứa ngày ISO — tuần lịch sử bắt đầu Thứ 2 (design
 * MonthHeatmap). UTC-anchored nên getUTCDay() đáng tin, không lệch múi máy. */
export function mondayOfISO(iso: string): string {
	const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
	return addDaysISO(iso, -((dow + 6) % 7));
}

/** yyyy-mm + n tháng (âm = lùi), luôn ngày 01 — năm nhuận handled bằng
 * tổng tháng tuyệt đối, không đụng Date nên không bao giờ tràn ngày. */
export function addMonthsISO(ym: string, n: number): string {
	const parts = ym.split("-");
	const year = Number.parseInt(parts[0] ?? "", 10);
	const month = Number.parseInt(parts[1] ?? "", 10);
	if (!Number.isFinite(year) || !Number.isFinite(month)) return ym;
	const absolute = year * 12 + (month - 1) + n;
	const nextYear = Math.floor(absolute / 12);
	const nextMonth = (absolute % 12) + 1;
	return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

/** Thời điểm kết thúc buổi học (yyyy-mm-dd + HH:MM + thời lượng phút, giờ
 * VN UTC+7) dạng epoch ms; null khi date/time lệch format. Input PHẢI là
 * `yyyy-mm-dd` / `HH:MM` đã chuẩn hóa (TIME_REGEX — contracts.ts:32, ràng
 * buộc ở mọi write path); ngoài bất biến đó hành vi là fail-open im lặng
 * (null) — caller tự quyết fallback (server `loadNextSession` #395 và client
 * `isLessonEnded` #393 cùng nguồn). Red-team #395: row có `date` mà `time`
 * lệch format KHÔNG thể sinh qua write path nào (producer fail-closed + zod
 * regex), nhánh null chỉ là phòng thủ khi invariant vỡ. */
export function vietnamSessionEndMs(
	date: string,
	time: string,
	durationMinutes: number,
): number | null {
	const end = Date.parse(`${date}T${time}:00+07:00`);
	return Number.isNaN(end) ? null : end + durationMinutes * 60_000;
}

/**
 * Khoảng nửa mở `[startMs, endMs)` của tháng dương lịch chứa `now` theo múi
 * giờ Việt Nam (`Asia/Ho_Chi_Minh`, UTC+7). Dùng cho hạn mức tháng (ví dụ 30
 * lượt Chấm nhanh Writing của TOS-32 D2).
 */
export function monthWindowVietnamMs(now: Date = new Date()): {
	startMs: number;
	endMs: number;
} {
	const ym = vietnamDateKeyOf(now).slice(0, 7);
	const nextYm = addMonthsISO(ym, 1);
	return {
		startMs: Date.parse(`${ym}-01T00:00:00+07:00`),
		endMs: Date.parse(`${nextYm}-01T00:00:00+07:00`),
	};
}

/**
 * Chuyển ngày ISO `yyyy-mm-dd` và giờ `HH:MM` theo múi giờ Việt Nam (UTC+7)
 * sang epoch ms.
 */
export function vietnamDateTimeMs(dateISO: string, timeHHMM: string): number {
	return Date.parse(`${dateISO}T${timeHHMM}:00+07:00`);
}

/**
 * Độ lệch mili-giây của giờ `HH:MM` (giờ Việt Nam UTC+7, không có DST) so với
 * mốc `00:00:00Z` của cùng ngày `yyyy-mm-dd`. Dùng cho câu lệnh SQL `UPDATE`
 * tính lại `release_at` / `due_at`:
 * `cast(strftime('%s', date) as integer) * 1000 + vietnamWallClockOffsetMs(timeHHMM)`.
 */
export function vietnamWallClockOffsetMs(timeHHMM: string): number {
	const [hhRaw, mmRaw] = timeHHMM.split(":");
	const hh = Number.parseInt(hhRaw ?? "0", 10);
	const mm = Number.parseInt(mmRaw ?? "0", 10);
	return (hh * 60 + mm - 7 * 60) * 60 * 1000;
}

/**
 * Định dạng một thời điểm bất kỳ sang `HH:MM` theo múi giờ `Asia/Ho_Chi_Minh`.
 */
export function formatVietnamTimeHHMM(
	dateOrIso: Date | string | number,
): string {
	const d =
		dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso as string);
	if (Number.isNaN(d.getTime())) return "";
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: "Asia/Ho_Chi_Minh",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).formatToParts(d);
	const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
	const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
	return `${hh}:${mm}`;
}

/**
 * Số ngày tính cả 2 đầu mút từ `startISO` đến `endISO` (`yyyy-mm-dd`).
 * Trả `< 1` nếu `endISO < startISO` hoặc ngày không hợp lệ.
 */
export function daysBetweenInclusiveISO(
	startISO: string,
	endISO: string,
): number {
	const startMs = Date.parse(`${startISO}T00:00:00Z`);
	const endMs = Date.parse(`${endISO}T00:00:00Z`);
	if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
	return Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
}

const VI_SLASH_DATE_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const VI_DIGITS_DATE_REGEX = /^(\d{2})(\d{2})(\d{4})$/;
const ISO_CALENDAR_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_COLON_REGEX = /^(\d{1,2}):(\d{2})$/;
const TIME_DIGITS_REGEX = /^(\d{2})(\d{2})$/;
const VI_WEEKDAY_LABELS = [
	"Chủ Nhật",
	"Thứ Hai",
	"Thứ Ba",
	"Thứ Tư",
	"Thứ Năm",
	"Thứ Sáu",
	"Thứ Bảy",
] as const;

/**
 * Parse chuỗi ngày kiểu Việt Nam (`dd/mm/yyyy`, `d/m/yyyy`, hoặc `ddmmyyyy`)
 * sang ISO `yyyy-mm-dd`. Kiểm tra năm `2000..2100` và roundtrip UTC để chặn
 * ngày không tồn tại như `31/02/2026`.
 */
export function parseViDateInput(raw: string): string | null {
	const trimmed = raw.trim();
	const match =
		VI_SLASH_DATE_REGEX.exec(trimmed) ?? VI_DIGITS_DATE_REGEX.exec(trimmed);
	if (!match) return null;

	const day = Number.parseInt(match[1] ?? "", 10);
	const month = Number.parseInt(match[2] ?? "", 10);
	const year = Number.parseInt(match[3] ?? "", 10);
	if (
		!Number.isFinite(day) ||
		!Number.isFinite(month) ||
		!Number.isFinite(year) ||
		year < 2000 ||
		year > 2100 ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > 31
	) {
		return null;
	}

	const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	const check = new Date(`${iso}T00:00:00Z`);
	if (Number.isNaN(check.getTime())) return null;
	return check.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * Định dạng ISO `yyyy-mm-dd` sang `dd/mm/yyyy` (giữ nguyên chuỗi nếu rỗng hoặc
 * định dạng legacy khác).
 */
export function formatViDateDisplay(iso: string): string {
	const trimmed = iso.trim();
	const match = ISO_CALENDAR_DATE_REGEX.exec(trimmed);
	if (!match) return iso;
	return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Định dạng ISO `yyyy-mm-dd` sang `"Thứ ..., dd/mm/yyyy"` (tính theo lịch UTC
 * từ ngày ISO nên không phụ thuộc múi giờ máy khách).
 */
export function formatViWeekdayDate(iso: string): string {
	const trimmed = iso.trim();
	if (!ISO_CALENDAR_DATE_REGEX.test(trimmed)) return "";
	const date = new Date(`${trimmed}T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return "";
	const weekday = VI_WEEKDAY_LABELS[date.getUTCDay()] ?? "";
	return weekday ? `${weekday}, ${formatViDateDisplay(trimmed)}` : "";
}

/**
 * Parse giờ 24h (`HH:mm`, `H:mm`, hoặc 4 chữ số `HHmm`) sang `HH:mm` chuẩn.
 */
export function parseTimeHHMM(raw: string): string | null {
	const trimmed = raw.trim();
	const match =
		TIME_COLON_REGEX.exec(trimmed) ?? TIME_DIGITS_REGEX.exec(trimmed);
	if (!match) return null;
	const hh = Number.parseInt(match[1] ?? "", 10);
	const mm = Number.parseInt(match[2] ?? "", 10);
	if (
		!Number.isFinite(hh) ||
		!Number.isFinite(mm) ||
		hh < 0 ||
		hh > 23 ||
		mm < 0 ||
		mm > 59
	) {
		return null;
	}
	return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export interface EvaluatedAssignmentDeadline {
	hasDueAt: boolean;
	dueAtMs: number | null;
	dueDateISO: string;
	isOverdue: boolean;
	isLate: boolean;
}

/**
 * Nguồn chân lý duy nhất cho tính quá hạn & nộp trễ theo múi giờ Việt Nam (#572):
 * - Khi `dueAt` hợp lệ:
 *   - `dueDateISO` suy từ `dueAt` theo giờ VN (không ghép chéo với cột `due`).
 *   - Đã nộp: `isLate = submittedMs > dueAtMs` (nộp đúng mili-giây hạn vẫn đúng hạn).
 *   - Chưa nộp: `isOverdue = nowMs >= dueAtMs`.
 * - Khi `dueAt` rỗng/null (dữ liệu cũ trước #572):
 *   - Chưa nộp: `isOverdue = due < todayISO`.
 *   - Đã nộp: `isLate` chỉ bật khi `legacyDateLate === true` (`apps/web`) và
 *     ngày nộp theo giờ VN `> due`; `apps/student` giữ `false` để không đổi
 *     nhãn lịch sử của bài cũ.
 */
export function evaluateAssignmentDeadline(input: {
	due: string;
	dueAt?: string | null;
	submittedAt?: string | null;
	todayISO?: string;
	nowMs?: number;
	legacyDateLate?: boolean;
}): EvaluatedAssignmentDeadline {
	const rawDueAtMs = input.dueAt ? Date.parse(input.dueAt) : Number.NaN;
	const hasDueAt = Number.isFinite(rawDueAtMs);
	const dueDateISO = hasDueAt
		? vietnamDateKeyOf(new Date(rawDueAtMs))
		: input.due;
	const nowMs = input.nowMs ?? Date.now();
	const todayISO = input.todayISO ?? vietnamTodayISO(new Date(nowMs));

	if (input.submittedAt != null) {
		const submittedMs = Date.parse(input.submittedAt);
		let isLate = false;
		if (hasDueAt) {
			isLate = Number.isFinite(submittedMs) && submittedMs > rawDueAtMs;
		} else if (
			input.legacyDateLate === true &&
			ISO_CALENDAR_DATE_REGEX.test(input.due)
		) {
			const submitDateISO = Number.isFinite(submittedMs)
				? vietnamDateKeyOf(new Date(submittedMs))
				: input.submittedAt.slice(0, 10);
			isLate = submitDateISO > input.due;
		}
		return {
			hasDueAt,
			dueAtMs: hasDueAt ? rawDueAtMs : null,
			dueDateISO,
			isOverdue: false,
			isLate,
		};
	}

	const isOverdue = hasDueAt
		? nowMs >= rawDueAtMs
		: ISO_CALENDAR_DATE_REGEX.test(input.due) && input.due < todayISO;

	return {
		hasDueAt,
		dueAtMs: hasDueAt ? rawDueAtMs : null,
		dueDateISO,
		isOverdue,
		isLate: false,
	};
}
