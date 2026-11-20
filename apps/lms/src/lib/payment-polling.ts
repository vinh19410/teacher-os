export const POLL_INTERVAL_MS = 5000;
/** Widely-shared links must not poll D1 forever. */
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
