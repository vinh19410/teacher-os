import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./specs",
	timeout: 120_000,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL: "http://localhost:8001",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		// VitePWA runs its service worker in dev (vite.config.ts devOptions);
		// a SW would break reload-based persistence assertions.
		serviceWorkers: "block",
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
	webServer: [
		{
			command: "pnpm run boot:api",
			url: "http://localhost:8000/readyz",
			// Fail loud on a busy port: silently reusing a dev server (alchemy
			// worker on :8000) would run specs against the wrong backend.
			reuseExistingServer: false,
			timeout: 120_000,
		},
		{
			command: "pnpm --filter web exec vite",
			url: "http://localhost:8001/",
			env: { VITE_SERVER_URL: "http://localhost:8000" },
			reuseExistingServer: false,
			timeout: 120_000,
		},
	],
});
