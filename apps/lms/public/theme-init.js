// Anti-flash theme bootstrap. Runs synchronously before the app renders;
// served as a static same-origin file (CSP: script-src 'self').
// Light là mặc định (design v2): chỉ thêm class khi storage ghi "dark".
(() => {
	try {
		if (localStorage.getItem("theme") === "dark") {
			document.documentElement.classList.add("dark");
		}
	} catch {
		// storage hỏng → light mặc định (không cần class).
	}
})();
