export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "theme";

/**
 * Read the persisted theme. Light is the default (design v2): missing,
 * unknown, or unreadable storage all resolve to light so SSR/prerender and
 * first paint agree with the `/theme-init.js` anti-flash script.
 */
export function readTheme(): Theme {
	try {
		return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark"
			? "dark"
			: "light";
	} catch {
		return "light";
	}
}

/**
 * Reflect the theme onto <html> as a class. Light is the absence of `dark`
 * (the `:root` block is light); only the `dark` class is maintained.
 */
export function applyTheme(theme: Theme): void {
	document.documentElement.classList.toggle("dark", theme === "dark");
}
