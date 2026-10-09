export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "theme";

/**
 * Read the persisted theme. Dark is the default: missing, unknown, or
 * unreadable storage all resolve to dark so SSR/prerender and first paint
 * agree with the `/theme-init.js` anti-flash script.
 */
export function readTheme(): Theme {
	try {
		return window.localStorage.getItem(THEME_STORAGE_KEY) === "light"
			? "light"
			: "dark";
	} catch {
		return "dark";
	}
}

/**
 * Reflect the theme onto <html> as a class. Both classes are maintained
 * (`dark` for the default, `light` for the override) so the CSS custom
 * properties in globals.css resolve consistently.
 */
export function applyTheme(theme: Theme): void {
	const root = document.documentElement;
	root.classList.toggle("dark", theme === "dark");
	root.classList.toggle("light", theme === "light");
}
