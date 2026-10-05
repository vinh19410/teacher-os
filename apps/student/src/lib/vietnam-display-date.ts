/** Index theo `Date.getUTCDay()`: 0 = Chủ Nhật … 6 = Thứ Bảy. */
export const VI_DAY_NAMES = [
	"Chủ Nhật",
	"Thứ Hai",
	"Thứ Ba",
	"Thứ Tư",
	"Thứ Năm",
	"Thứ Sáu",
	"Thứ Bảy",
];

export function formatVietnamToday(now: Date = new Date()): string {
	const vnString = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Ho_Chi_Minh",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
	const [y, m, d] = vnString.split("-").map(Number);
	if (!y || !m || !d) return "";
	const dateInVN = new Date(Date.UTC(y, m - 1, d));
	const dayOfWeek = dateInVN.getUTCDay();
	const dayName = VI_DAY_NAMES[dayOfWeek] ?? "";
	const dd = String(d).padStart(2, "0");
	const mm = String(m).padStart(2, "0");
	return `${dayName}, ${dd}/${mm}`;
}

export function formatVietnamDateFromISO(iso: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
	const [y, m, d] = iso.split("-").map(Number);
	if (!y || !m || !d) return iso;
	const dateInVN = new Date(Date.UTC(y, m - 1, d));
	const dayOfWeek = dateInVN.getUTCDay();
	const dayName = VI_DAY_NAMES[dayOfWeek] ?? "";
	const dd = String(d).padStart(2, "0");
	const mm = String(m).padStart(2, "0");
	return `${dayName}, ${dd}/${mm}`;
}

/** "Thứ Hai, 05/01/2026" — kèm năm cho mốc có thể khác năm hiện tại. */
export function formatVietnamFullDate(iso: string): string {
	const short = formatVietnamDateFromISO(iso);
	return short === iso ? iso : `${short}/${iso.slice(0, 4)}`;
}
