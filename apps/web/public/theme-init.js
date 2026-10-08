// Anti-flash theme bootstrap. Runs synchronously before the app renders;
// served as a static same-origin file (CSP: script-src 'self').
(() => {
	try {
		const theme = localStorage.getItem("theme") === "light" ? "light" : "dark";
		document.documentElement.classList.add(theme);
	} catch (e) {
		document.documentElement.classList.add("dark");
	}
})();
