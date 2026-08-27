export const SIDEBAR_COLLAPSED_KEY = "teacher-os.sidebar.collapsed";

/** Read the collapsed preference; default expanded when missing or storage is blocked (private mode). */
export function readCollapsedPref(): boolean {
	try {
		return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
	} catch {
		return false;
	}
}

/** Persist the collapsed preference; degrade silently when storage is blocked. */
export function writeCollapsedPref(collapsed: boolean): void {
	try {
		window.localStorage.setItem(
			SIDEBAR_COLLAPSED_KEY,
			collapsed ? "true" : "false",
		);
	} catch {
		// memory-only: app keeps working without persistence
	}
}
