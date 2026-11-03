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
