/** Poll cadence for the tuition detail panel (#320) — mirrors the web app's
 * rule: 5 s while visible, hard 15-minute cap. */
export const POLL_INTERVAL_MS = 5000;
export const POLL_CAP_MS = 15 * 60 * 1000;

export function shouldPollPayment(input: {
	panelOpen: boolean;
	payable: boolean;
	openedAt: number;
	now: number;
}): boolean {
	if (!input.panelOpen || !input.payable) return false;
	if (typeof document !== "undefined" && document.hidden) return false;
	return input.now - input.openedAt < POLL_CAP_MS;
}
