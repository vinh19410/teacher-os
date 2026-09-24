import { defineConfig } from "@playwright/test";

// Port override cho chạy song song với dev server chiếm 8000/8001 — mặc định
// giữ nguyên như CI; boot:api cùng đọc env này (fail-loud semantics không đổi).
const apiPort = Number(process.env.E2E_API_PORT ?? 8000);
const webPort = Number(process.env.E2E_WEB_PORT ?? 8001);
const studentPort = Number(process.env.E2E_STUDENT_PORT ?? 8003);
export default defineConfig({
	testDir: "./specs",
	timeout: 120_000,
	expect: {
		// Flow-critical waits (URL changes, modal close after refetch) can
		// outrun the 5s default on a cold CI vite dev server.
		timeout: 15_000,
	},
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL: `http://localhost:${webPort}`,
		// Pin Vietnam time so "start tomorrow" in the UI and the VN-today date
		// gate of the attendance CTA (issue #91) can never drift apart when
		// the runner sits in another timezone.
		timezoneId: "Asia/Ho_Chi_Minh",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		// Guards against any future service worker (including the public/sw.js
		// self-unregister stub from issue #125) breaking reload-based
		// persistence assertions. The SW-specific spec opts into "allow".
		serviceWorkers: "block",
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
	webServer: [
		{
			command: "pnpm run boot:api",
			url: `http://localhost:${apiPort}/readyz`,
			// Fail loud on a busy port: silently reusing a dev server (alchemy
			// worker on :8000) would run specs against the wrong backend.
			reuseExistingServer: false,
			timeout: 120_000,
			env: {
				E2E_API_PORT: String(apiPort),
				E2E_WEB_PORT: String(webPort),
				E2E_STUDENT_PORT: String(studentPort),
			},
		},
		{
			command: `pnpm --filter web exec vite --port ${webPort} --strictPort`,
			url: `http://localhost:${webPort}/`,
			env: {
				VITE_SERVER_URL: `http://localhost:${apiPort}`,
				E2E_API_PORT: String(apiPort),
				E2E_WEB_PORT: String(webPort),
			},
			reuseExistingServer: false,
			timeout: 120_000,
		},
		{
			command: `pnpm --filter student exec vite --port ${studentPort} --strictPort`,
			url: `http://localhost:${studentPort}/login`,
			env: {
				VITE_SERVER_URL: `http://localhost:${apiPort}`,
				E2E_API_PORT: String(apiPort),
				E2E_STUDENT_PORT: String(studentPort),
			},
			reuseExistingServer: false,
			timeout: 120_000,
		},
	],
});
