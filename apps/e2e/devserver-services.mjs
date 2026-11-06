// Nguồn sự thật chung cho hạ tầng dev server e2e (plan 261021-2125-402,
// issue #402): định nghĩa service, command restart, spawn options và
// redaction — dùng chung bởi `playwright.config.ts` (entry gốc) và
// `devserver-watchdog.mjs` (restart) để command/env không drift. Module pure,
// không I/O — unit test tại `scripts/devserver-watchdog.test.mjs`.

/** Parse + validate 4 port từ env. Sai/thiếu → throw (watchdog exit 2). */
export function parsePorts(env) {
	const read = (key) => {
		const raw = env[key];
		const port = typeof raw === "string" ? Number(raw.trim()) : Number(raw);
		if (!Number.isInteger(port) || port < 1 || port > 65_535)
			throw new Error(
				`[devserver-watchdog] ${key} port env không hợp lệ: ${JSON.stringify(raw ?? null)}`,
			);
		return port;
	};
	return {
		api: read("E2E_API_PORT"),
		web: read("E2E_WEB_PORT"),
		student: read("E2E_STUDENT_PORT"),
		admin: read("E2E_ADMIN_PORT"),
	};
}

/**
 * @typedef {Object} DevServerService
 * @property {string} name
 * @property {"api" | "vite"} kind
 * @property {string} pollUrl
 * @property {number} deadStatus
 * @property {string[]} [restartArgs] — chỉ có trên service vite (api không restart)
 */

/**
 * Chế độ phục vụ web/student/admin trong e2e. `preview` (mặc định) chạy bản
 * build production bằng `vite preview`: bỏ chi phí transform theo yêu cầu của
 * vite dev (phần lớn thời gian mỗi lần tải trang trên máy chậm). Đặt
 * `E2E_VITE_MODE=dev` để quay về dev server khi cần HMR hoặc debug source.
 * @param {Record<string, string | undefined>} env
 * @returns {"dev" | "preview"}
 */
export function resolveViteMode(env) {
	return env.E2E_VITE_MODE === "dev" ? "dev" : "preview";
}

/** Argv `pnpm` chạy một app vite ở port cố định (không shell, xem SecM4). */
function viteArgs(app, port, mode) {
	return [
		"--filter",
		app,
		"exec",
		"vite",
		...(mode === "preview" ? ["preview"] : []),
		"--port",
		String(port),
		"--strictPort",
	];
}

/**
 * Định nghĩa 4 service được giám sát. pollUrl khớp CHÍNH XÁC url readiness
 * của entry webServer trong playwright.config.ts; deadStatus khớp semantics
 * playwright (available chỉ khi status < 404, `coreBundle.js:8514-8524`) —
 * api dùng 500 vì readyz trả 503 khi DB probe hỏng (`routes/readiness.ts:73`).
 * Admin (plan #413 phase 5): buildServices KHÔNG hỗ trợ lazy startup theo
 * spec, nên admin luôn chạy đủ 4 vite — theo dõi memory (rolldown abort,
 * AGENTS.md).
 * @returns {DevServerService[]}
 */
export function buildServices(ports, { mode = "dev" } = {}) {
	return [
		{
			name: "api",
			kind: "api",
			pollUrl: `http://localhost:${ports.api}/readyz`,
			deadStatus: 500,
		},
		{
			name: "web",
			kind: "vite",
			pollUrl: `http://localhost:${ports.web}/`,
			deadStatus: 404,
			restartArgs: viteArgs("web", ports.web, mode),
		},
		{
			name: "student",
			kind: "vite",
			pollUrl: `http://localhost:${ports.student}/login`,
			deadStatus: 404,
			restartArgs: viteArgs("student", ports.student, mode),
		},
		{
			name: "admin",
			kind: "vite",
			pollUrl: `http://localhost:${ports.admin}/login`,
			deadStatus: 404,
			restartArgs: viteArgs("admin", ports.admin, mode),
		},
	];
}

/** Command restart KHÔNG qua shell (SecM4): spawn trực tiếp pnpm với argv. */
export function buildRestartCommand(service) {
	return ["pnpm", ...service.restartArgs];
}

/** Spawn options: KHÔNG shell, KHÔNG detached — restart child cùng process
 * group với watchdog để teardown playwright (group-SIGKILL, coreBundle.js:8995)
 * dọn sạch cả cây. */
export function buildSpawnOptions(root, extraEnv = {}) {
	return {
		cwd: root,
		env: { ...process.env, ...extraEnv },
		stdio: ["ignore", "pipe", "pipe"],
	};
}

// Redact token verify-email/reset trong log server (nguồn rò rỉ chính, xem
// comment #397 trong scripts/design-compare/capture.mjs). Copy cơ chế
// rawTail carry-over + double-pass sau slice: token có thể cắt ngang biên
// chunk lẫn biên tail 4000 — redact đơn-pass sẽ lọt giá trị.
const TOKEN_RE = /([?&]token=)[^\s&"']+/gi;
export const REDACTED_TAIL_BYTES = 4_000;

/** Trả processor chunk → buffer tail (≤4000 byte) đã redact, giữ rawTail ~100
 * ký tự để nối với chunk kế trước khi redact (giống capture.mjs:130-141). */
export function createRedactor() {
	let rawTail = "";
	return (chunk) => {
		const raw = rawTail + chunk;
		rawTail = raw.slice(-100);
		return raw
			.replace(TOKEN_RE, "$1[redacted]")
			.replace(TOKEN_RE, "$1[redacted]")
			.slice(-REDACTED_TAIL_BYTES);
	};
}
