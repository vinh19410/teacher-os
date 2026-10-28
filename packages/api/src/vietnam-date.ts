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
