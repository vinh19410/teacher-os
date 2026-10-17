/**
 * Interval labels per docs/srs-spec.md §6.
 * Input is a duration in whole minutes.
 */
export function formatInterval(mins: number): string {
	if (mins < 60) return `${mins}m`;
	const d = mins / 1440;
	if (d < 1) return `${Math.round(mins / 60)}h`;
	if (d < 7) return `${Math.round(d)}d`;
	if (d < 30) return `${Math.round(d / 7)}w`;
	if (d < 365) return `${Math.round(d / 30)}mo`;
	return `${(d / 365).toFixed(1)}y`;
}

function pad2(n: number): string {
	return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Countdown label per docs/srs-spec.md §5.
 * - s = ceil(ms / 1000) (0 when ms <= 0)
 * - s < 3600 -> m:ss (seconds 2-digit padded)
 * - s < 86400 -> h:mm:ss (minutes and seconds 2-digit padded)
 * - else -> {d}d {h}h
 */
export function formatCountdown(ms: number): string {
	const s = ms <= 0 ? 0 : Math.ceil(ms / 1000);
	if (s < 3600) {
		const m = Math.floor(s / 60);
		const sec = s % 60;
		return `${m}:${pad2(sec)}`;
	}
	if (s < 86400) {
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = s % 60;
		return `${h}:${pad2(m)}:${pad2(sec)}`;
	}
	const d = Math.floor(s / 86400);
	const h = Math.floor((s % 86400) / 3600);
	return `${d}d ${h}h`;
}
