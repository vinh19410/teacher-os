import { useCallback, useEffect, useState } from "react";
import {
	applyTheme,
	readTheme,
	THEME_STORAGE_KEY,
	type Theme,
} from "../lib/theme";

/**
 * Theme state for the app. Applies the theme to <html> on change and
 * persists the choice; cross-tab sync happens through the `storage` event.
 * Persistence is written only on explicit set/toggle, never on mount, so a
 * first visit leaves localStorage untouched (dark stays the implicit default).
 */
export function useTheme(): {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	toggle: () => void;
} {
	const [theme, setThemeState] = useState<Theme>(readTheme);

	useEffect(() => {
		applyTheme(theme);
	}, [theme]);

	useEffect(() => {
		const onStorage = (event: StorageEvent) => {
			if (event.key === THEME_STORAGE_KEY) {
				setThemeState(event.newValue === "light" ? "light" : "dark");
			}
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);

	const setTheme = useCallback((next: Theme) => {
		setThemeState(next);
		try {
			window.localStorage.setItem(THEME_STORAGE_KEY, next);
		} catch {
			// Private mode (Safari): theme still applies for this session.
		}
	}, []);

	const toggle = useCallback(() => {
		setTheme(theme === "dark" ? "light" : "dark");
	}, [setTheme, theme]);

	return { theme, setTheme, toggle };
}
