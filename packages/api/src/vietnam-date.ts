/**
 * Today as yyyy-mm-dd in Vietnam (UTC+7) via Intl parts — never a UTC slice
 * or machine-local Date, which drift a day between 00:00–07:00 VN
 * (Workers run UTC; browsers run visitor-local). Single source for the
 * class-assignment due min-today check (#208) on both server and web.
 * Promoted from apps/e2e/specs/helpers.ts.
 */
export function vietnamTodayISO(now: Date = new Date()): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Ho_Chi_Minh",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(now);
	const get = (type: string) =>
		parts.find((p) => p.type === type)?.value ?? "00";
	return `${get("year")}-${get("month")}-${get("day")}`;
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
