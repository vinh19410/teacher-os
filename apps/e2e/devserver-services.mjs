// Nguồn sự thật chung cho hạ tầng dev server e2e (plan 261021-2125-402,
// issue #402): định nghĩa service, command restart, spawn options và
// redaction — dùng chung bởi `playwright.config.ts` (entry gốc) và
// `devserver-watchdog.mjs` (restart) để command/env không drift. Module pure,
// không I/O — unit test tại `scripts/devserver-watchdog.test.mjs`.

/** Parse + validate 2 core ports (api + unified lms) từ env. Sai/thiếu → throw (watchdog exit 2). */
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
	const webKey =
		env.E2E_LMS_PORT !== undefined ? "E2E_LMS_PORT" : "E2E_WEB_PORT";
	return {
		api: read("E2E_API_PORT"),
		web: read(webKey),
	};
}

/**
 * @typedef {Object} DevServerService
 * @property {string} name
 * @property {"api" | "vite"} kind
 * @property {string} pollUrl
 * @property {number} deadStatus
 * @property {string[]} [restartArgs] — chỉ có trên service lms/vite (api không restart)
 */

/**
 * Chế độ phục vụ cổng LMS hợp nhất trong e2e. `preview` (mặc định) chạy bản
 * build production bằng `apps/lms/scripts/serve-lms.mjs` (đóng gói đồng thời
 * root + `/teacher`, `/student`, `/admin`). Đặt `E2E_VITE_MODE=dev` để chạy
 * `vite` dev server khi cần HMR hoặc debug source.
 * @param {Record<string, string | undefined>} env
 * @returns {"dev" | "preview"}
 */
export function resolveViteMode(env) {
	return env.E2E_VITE_MODE === "dev" ? "dev" : "preview";
}

/** Argv `pnpm` chạy cổng LMS hợp nhất (không shell, xem SecM4). */
function lmsArgs(port, mode) {
	if (mode === "preview") {
		return ["--filter", "lms", "run", "serve"];
	}
	return [
		"--filter",
		"lms",
		"exec",
		"vite",
		"--port",
		String(port),
		"--strictPort",
	];
}

/**
 * Định nghĩa 2 service cốt lõi được giám sát (`api` + `lms`). pollUrl khớp
 * CHÍNH XÁC url readiness của entry webServer trong playwright.config.ts;
 * deadStatus khớp semantics playwright (available chỉ khi status < 404) —
 * api dùng 500 vì readyz trả 503 khi DB probe hỏng (`routes/readiness.ts:73`).
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
			name: "lms",
			kind: "vite",
			pollUrl: `http://localhost:${ports.web}/login`,
			deadStatus: 404,
			restartArgs: lmsArgs(ports.web, mode),
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
