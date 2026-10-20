import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
	applyTheme,
	readTheme,
	THEME_STORAGE_KEY,
	type Theme,
} from "../lib/theme";

/**
 * Single shared theme store: every consumer (ThemeToggle, Toaster, …) reads
 * the same snapshot — the class on <html> — so sibling instances can never
 * desync within a tab (cross-tab sync rides the `storage` event, and the
 * pre-render /theme-init.js script seeds the class before React mounts).
 * Light là mặc định: snapshot = có class `dark` hay không.
 */
const snapshot = (): Theme =>
	document.documentElement.classList.contains("dark") ? "dark" : "light";

const serverSnapshot = (): Theme => "light";

const listeners = new Set<() => void>();
const emit = () => {
	for (const listener of listeners) listener();
};

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
	window.addEventListener("storage", (event) => {
		if (event.key === THEME_STORAGE_KEY) {
			applyTheme(readTheme());
			emit();
		}
	});
}

/**
 * Theme state for the app. Applies the theme to <html> on change and
 * persists the choice. Persistence is written only on explicit set/toggle,
 * never on mount, so a first visit leaves localStorage untouched (dark
 * stays the implicit default).
 */
export function useTheme(): {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	toggle: () => void;
} {
	const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

	// Keep the <html> class in lockstep even on the first hydration (the
	// /theme-init.js script normally did this before React mounted).
	useEffect(() => {
		applyTheme(theme);
	}, [theme]);

	const setTheme = useCallback((next: Theme) => {
		applyTheme(next);
		try {
			window.localStorage.setItem(THEME_STORAGE_KEY, next);
		} catch {
			// Private mode (Safari): theme still applies for this session.
		}
		emit();
	}, []);

	const toggle = useCallback(() => {
		setTheme(snapshot() === "dark" ? "light" : "dark");
	}, [setTheme]);

	return { theme, setTheme, toggle };
}
