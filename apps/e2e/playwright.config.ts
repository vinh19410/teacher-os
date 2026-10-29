import { defineConfig } from "@playwright/test";
// Nguồn sự thật chung url/command dev server (plan 402) — entry gốc và
// devserver-watchdog.mjs (restart) phải dùng CÙNG định nghĩa để không drift.
import { buildServices } from "./devserver-services.mjs";

// Port override cho chạy song song với dev server chiếm 8000/8001 — mặc định
// giữ nguyên như CI; boot:api cùng đọc env này (fail-loud semantics không đổi).
const apiPort = Number(process.env.E2E_API_PORT ?? 8000);
const webPort = Number(process.env.E2E_WEB_PORT ?? 8001);
const studentPort = Number(process.env.E2E_STUDENT_PORT ?? 8003);
const adminPort = Number(process.env.E2E_ADMIN_PORT ?? 8104);
const requireService = (name: string) => {
	const svc = buildServices({
		api: apiPort,
		web: webPort,
		student: studentPort,
		admin: adminPort,
	}).find((s) => s.name === name);
	if (!svc) throw new Error(`devserver-services thiếu service ${name}`);
	return svc;
};
const webSvc = requireService("web");
const studentSvc = requireService("student");
const adminSvc = requireService("admin");
export default defineConfig({
	testDir: "./specs",
	// #402: fail-loud khi hạ tầng dev server bất ổn giữa run (marker/heartbeat
	// của devserver-watchdog hoặc probe cuối 3 service).
	globalTeardown: "./global-teardown.ts",
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
				E2E_ADMIN_PORT: String(adminPort),
			},
		},
		{
			command: ["pnpm", ...(webSvc.restartArgs ?? [])].join(" "),
			url: webSvc.pollUrl,
			env: {
				VITE_SERVER_URL: `http://localhost:${apiPort}`,
				VITE_AI_ENABLED: "true",
				E2E_API_PORT: String(apiPort),
				E2E_WEB_PORT: String(webPort),
			},
			reuseExistingServer: false,
			timeout: 120_000,
			// Tường minh: stderr vite (panic/crash rolldown, #402) forward ra output.
			stderr: "pipe",
		},
		{
			command: ["pnpm", ...(studentSvc.restartArgs ?? [])].join(" "),
			url: studentSvc.pollUrl,
			env: {
				VITE_SERVER_URL: `http://localhost:${apiPort}`,
				E2E_API_PORT: String(apiPort),
				E2E_STUDENT_PORT: String(studentPort),
			},
			reuseExistingServer: false,
			timeout: 120_000,
			stderr: "pipe",
		},
		{
			// Plan #413 phase 5: cổng quản trị (4th vite — xem memory note
			// rolldown abort trong AGENTS.md).
			command: ["pnpm", ...(adminSvc.restartArgs ?? [])].join(" "),
			url: adminSvc.pollUrl,
			env: {
				VITE_SERVER_URL: `http://localhost:${apiPort}`,
				E2E_API_PORT: String(apiPort),
				E2E_ADMIN_PORT: String(adminPort),
			},
			reuseExistingServer: false,
			timeout: 120_000,
			stderr: "pipe",
		},
		{
			// #402: giám sát 4 service trên — vite web/student/admin chết giữa run
			// được restart (tối đa 1 lần/vite), api chết → marker fail-loud.
			// KHÔNG có `url` (playwright spawn xong không chờ) và đặt CUỐI mảng:
			// plugin setup chạy tuần tự nên watchdog chỉ poll khi 4 service đã
			// available.
			name: "dev-watchdog",
			command: "node devserver-watchdog.mjs",
			stdout: "pipe",
			reuseExistingServer: false,
			env: {
				E2E_API_PORT: String(apiPort),
				E2E_WEB_PORT: String(webPort),
				E2E_STUDENT_PORT: String(studentPort),
				E2E_ADMIN_PORT: String(adminPort),
			},
		},
	],
});
