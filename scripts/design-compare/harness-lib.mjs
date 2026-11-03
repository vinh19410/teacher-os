// Thuần/hệ thống helpers cho harness design:compare (#546) — không phụ thuộc
// capture.mjs, mọi hàm đều kiểm thử độc lập qua scripts/design-compare.test.mjs.
// Không thêm dependency mới: PNG nạp từ chuỗi phụ thuộc sẵn có của harness
// (@playwright/test → playwright-core/lib/utilsBundle), fallback qua root `e2e`.
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";

// SHA ghim trong fetch-design.sh — khi nâng SHA phải kiểm tra lại chữ ký
// `/` (`<div id="root"></div>`) và `/src/lib/art.tsx` (`TeacherDesk`).
export const DESIGN_V2_PINNED_SHA = "7a53fc0fcbf415367d245539cedc3855606266a7";

// ── CLI args ─────────────────────────────────────────────────────────────
const VALUE_FLAGS = new Set(["--screens", "--side", "--label"]);
const BOOL_FLAGS = new Set(["--keep-design", "--force"]);

/** Parse + validate argv của capture.mjs. Sai cờ/thiếu giá trị → throw. */
export function parseCliArgs(argv) {
	const res = {
		screens: "all",
		side: "both",
		label: "new",
		keepDesign: false,
		force: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const tok = argv[i];
		if (VALUE_FLAGS.has(tok)) {
			const val = argv[i + 1];
			if (val === undefined || val.startsWith("--"))
				throw new Error(`cờ ${tok} thiếu giá trị`);
			i += 1;
			if (tok === "--screens") {
				res.screens = val;
			} else if (tok === "--side") {
				if (!["design", "app", "both"].includes(val))
					throw new Error(`--side không hợp lệ: ${val}`);
				res.side = val;
			} else {
				if (!/^[a-z0-9_-]{1,32}$/.test(val))
					throw new Error(`--label không hợp lệ: ${val}`);
				res.label = val;
			}
		} else if (BOOL_FLAGS.has(tok)) {
			if (tok === "--keep-design") res.keepDesign = true;
			else res.force = true;
		} else {
			throw new Error(`cờ không hợp lệ: ${tok}`);
		}
	}
	return res;
}

// ── child env (signup flag #539) ─────────────────────────────────────────
/** Env cho child server của harness: luôn bật form đăng ký giáo viên. */
export function buildChildEnv(
	baseEnv,
	{ apiPort, webPort, studentPort, extraEnv } = {},
) {
	return {
		...baseEnv,
		E2E_API_PORT: String(apiPort),
		E2E_WEB_PORT: String(webPort),
		E2E_STUDENT_PORT: String(studentPort),
		VITE_SERVER_URL: `http://localhost:${apiPort}`,
		VITE_TEACHER_SIGNUP_ENABLED: "true",
		...extraEnv,
	};
}

// ── log redact ───────────────────────────────────────────────────────────
const TOKEN_RE = /([?&]token=)[^\s&"']+/gi;
const RESET_TOKEN_RE = /(\/api\/auth\/reset-password\/)[^?\s"'&]+/gi;
const PAY_TOKEN_RE = /(\/pay\/)[A-Za-z0-9_-]{6,}/gi;
const GH_BEARER_RE = /((?:x-access-token:|Bearer\s+))[^\s@"']+/gi;
const GH_PAT_RE =
	/\b(gh[pousr]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]{10,})\b/g;

/** Redact capability token (verify/reset/pay/GitHub) khỏi log (#546). */
export function redactLog(s) {
	return s
		.replace(TOKEN_RE, "$1[redacted]")
		.replace(RESET_TOKEN_RE, "$1[redacted]")
		.replace(PAY_TOKEN_RE, "$1[redacted]")
		.replace(GH_BEARER_RE, "$1[redacted]")
		.replace(GH_PAT_RE, "$1[redacted]");
}

/** Processor chunk → buffer tail (≤maxBytes) đã redact; rawTail ~100 ký tự
 * để nối với chunk kế trước khi redact (tiền lệ #397 — token cắt ngang biên
 * chunk lẫn biên tail nên redact 2 lượt). Gọi không đối số để lấy tail. */
export function createLogCollector(maxBytes = 4_000) {
	let rawTail = "";
	let buf = "";
	const processor = (chunk) => {
		if (chunk === undefined) return buf;
		const raw = rawTail + chunk;
		rawTail = raw.slice(-100);
		buf = redactLog(redactLog(raw)).slice(-maxBytes);
		return buf;
	};
	return processor;
}

// ── port probing (dual-stack loopback) ───────────────────────────────────
const listenOnce = (srv, port, host) =>
	new Promise((resolve) => {
		const onError = (err) => {
			srv.removeListener("error", onError);
			resolve({ ok: false, code: err?.code });
		};
		srv.on("error", onError);
		srv.listen(port, host, () => {
			srv.removeListener("error", onError);
			resolve({ ok: true, code: null });
		});
	});

/** true khi cổng có thể bind trên CẢ 127.0.0.1 lẫn ::1 (::1 lỗi
 * EADDRNOTAVAIL/EAFNOSUPPORT coi như máy tắt IPv6 → không chặn). */
export async function isPortFreeOnLoopback(port) {
	const v4 = net.createServer();
	const r4 = await listenOnce(v4, port, "127.0.0.1");
	if (!r4.ok) return false;
	const v6 = net.createServer();
	const r6 = await listenOnce(v6, port, "::1");
	v4.close();
	if (r6.ok) v6.close();
	if (r6.ok) return true;
	return r6.code === "EADDRNOTAVAIL" || r6.code === "EAFNOSUPPORT";
}

/** Cấp một cổng trống dual-stack, tránh các cổng trong excludePorts.
 * TOCTOU còn lại (cổng bị chiếm sau khi trả) do caller xử lý qua retry
 * (`--strictPort` fail → thử lại). */
export async function probeFreePort({ excludePorts } = {}) {
	const taken =
		excludePorts instanceof Set ? excludePorts : new Set(excludePorts ?? []);
	for (let attempt = 0; attempt < 10; attempt++) {
		const v4 = net.createServer();
		const r4 = await listenOnce(v4, 0, "127.0.0.1");
		if (!r4.ok) continue;
		const port = v4.address().port;
		if (taken.has(port)) {
			v4.close();
			continue;
		}
		const v6 = net.createServer();
		const r6 = await listenOnce(v6, port, "::1");
		if (r6.ok) {
			v4.close();
			v6.close();
			return port;
		}
		v4.close();
		if (r6.code === "EADDRNOTAVAIL" || r6.code === "EAFNOSUPPORT") return port;
		// ::1 đã có người nghe (dual-stack chiếm cổng) → thử cổng khác
	}
	throw new Error(
		"probeFreePort: 10 lần thử không tìm được cổng trống dual-stack",
	);
}

// ── design-v2 fingerprint ────────────────────────────────────────────────
export function isDesignV2Fingerprint({ rootHtml, artModuleSource }) {
	return (
		typeof rootHtml === "string" &&
		rootHtml.includes('<div id="root"></div>') &&
		typeof artModuleSource === "string" &&
		artModuleSource.includes("TeacherDesk")
	);
}

async function readBodyCapped(res, maxBytes) {
	const declared = Number(res.headers.get("content-length") ?? 0);
	if (declared > maxBytes)
		throw new Error(`body quá lớn (${declared} > ${maxBytes})`);
	const reader = res.body.getReader();
	const chunks = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel().catch(() => {});
			throw new Error(`body quá lớn (> ${maxBytes})`);
		}
		chunks.push(Buffer.from(value));
	}
	return Buffer.concat(chunks).toString("utf8");
}

/** Probe chữ ký design-v2: chặn redirect (SSRF) + trần 256KiB (OOM). */
export async function verifyDesignV2Server(
	baseUrl,
	{ timeoutMs = 3_000, maxBytes = 256 * 1024 } = {},
) {
	const init = { redirect: "error", signal: AbortSignal.timeout(timeoutMs) };
	try {
		const [rootRes, artRes] = await Promise.all([
			fetch(`${baseUrl}/`, init),
			fetch(`${baseUrl}/src/lib/art.tsx`, init),
		]);
		if (!rootRes.ok || !artRes.ok)
			return { ok: false, reason: `HTTP ${rootRes.status}/${artRes.status}` };
		const rootHtml = await readBodyCapped(rootRes, maxBytes);
		const artModuleSource = await readBodyCapped(artRes, maxBytes);
		if (!isDesignV2Fingerprint({ rootHtml, artModuleSource }))
			return { ok: false, reason: "nội dung không khớp chữ ký design-v2" };
		return { ok: true };
	} catch (err) {
		return { ok: false, reason: String(err?.message ?? err) };
	}
}

// ── pngjs nạp không đụng lockfile ────────────────────────────────────────
/** Ưu tiên chuỗi phụ thuộc harness đã sở hữu (apps/e2e → @playwright/test →
 * playwright-core/lib/utilsBundle), fallback root `e2e` → pngjs. */
export function loadPngJs(rootDir) {
	try {
		const e2eRequire = createRequire(
			path.join(rootDir, "apps/e2e/package.json"),
		);
		const pwEntry = e2eRequire.resolve("@playwright/test");
		const utils = createRequire(pwEntry)("playwright-core/lib/utilsBundle");
		if (typeof utils?.PNG?.sync?.read === "function")
			return { PNG: utils.PNG, source: "playwright-core" };
	} catch {
		/* fallback */
	}
	try {
		const rootRequire = createRequire(path.join(rootDir, "package.json"));
		const e2eEntry = rootRequire.resolve("e2e");
		const { PNG } = createRequire(e2eEntry)("pngjs");
		return { PNG, source: "pngjs" };
	} catch (err) {
		throw new Error(
			`Không nạp được pngjs (thử playwright-core/lib/utilsBundle rồi root e2e): ${err.message}`,
		);
	}
}

// ── pixel sanity check ───────────────────────────────────────────────────
/** Giải mã PNG buffer và đánh giá trắng/rỗng:
 * - nonWhiteRatio: tỷ lệ pixel khác trắng sau khi alpha-composite lên nền trắng
 *   (ảnh trong suốt 100% → trắng 100% → bị chặn).
 * - nonDominantRatio: 1 − tỷ lệ bucket màu chủ đạo (quantize 5 bit/kênh RGBA)
 *   → chặn ảnh đồng màu (trắng lẫn tối) lẫn ảnh trắng 99.x% chỉ có viền/badge
 *   góc nhỏ (< 1% pixel khác màu chủ đạo; min thực đo trên ảnh thật là 4.36%). */
export function inspectPngBuffer(
	buf,
	PNG,
	{ minNonWhiteRatio = 0.001, minNonDominantRatio = 0.01 } = {},
) {
	let png;
	try {
		png = PNG.sync.read(buf);
	} catch (err) {
		return { ok: false, reason: `PNG hỏng: ${err.message}` };
	}
	const { width, height, data } = png;
	const total = width * height;
	if (total === 0) return { ok: false, reason: "PNG rỗng", width, height };
	let nonWhite = 0;
	const buckets = new Map();
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const a = data[i + 3];
		const alpha = a / 255;
		const er = Math.round(r * alpha + 255 * (1 - alpha));
		const eg = Math.round(g * alpha + 255 * (1 - alpha));
		const eb = Math.round(b * alpha + 255 * (1 - alpha));
		if (er < 250 || eg < 250 || eb < 250) nonWhite += 1;
		const key = ((r >> 3) << 11) | ((g >> 3) << 6) | ((b >> 3) << 1) | (a >> 7);
		buckets.set(key, (buckets.get(key) ?? 0) + 1);
	}
	let maxBucket = 0;
	for (const count of buckets.values())
		if (count > maxBucket) maxBucket = count;
	const nonWhiteRatio = nonWhite / total;
	const nonDominantRatio = (total - maxBucket) / total;
	const ok =
		nonWhiteRatio >= minNonWhiteRatio &&
		nonDominantRatio >= minNonDominantRatio;
	return { ok, nonWhiteRatio, nonDominantRatio, width, height };
}

/** Kiểm tra ảnh chụp; trắng/rỗng → xoá file khỏi .state/raw rồi throw (fail
 * loud, không để ảnh hỏng poison cache raw cho lần chạy sau). */
export async function assertNonBlankPngFile(filePath, PNG, opts) {
	let buf;
	try {
		buf = await readFile(filePath);
	} catch (err) {
		await rm(filePath, { force: true }).catch(() => {});
		throw new Error(`Không đọc được PNG ${filePath}: ${err.message}`);
	}
	const res = inspectPngBuffer(buf, PNG, opts);
	if (!res.ok) {
		await rm(filePath, { force: true });
		const detail =
			res.nonWhiteRatio === undefined
				? res.reason
				: `nonWhite=${(res.nonWhiteRatio * 100).toFixed(3)}% nonDominant=${(res.nonDominantRatio * 100).toFixed(3)}%`;
		throw new Error(`Ảnh chụp trắng/rỗng (${filePath}): ${detail}`);
	}
	return res;
}

// ── compose staleness ────────────────────────────────────────────────────
/** true khi cần (ghi đè) compose: force, outFile chưa có, hoặc có input
 * mới hơn outFile (so sánh mtimeMs nghiêm `>`). Không input tồn tại → false
 * (caller tự xử lý lỗi thiếu raw bắt buộc). */
export function shouldCompose(outFile, inputFiles, { force = false } = {}) {
	const stats = [];
	for (const f of inputFiles) {
		try {
			stats.push(statSync(f));
		} catch {
			/* input chưa có */
		}
	}
	if (stats.length === 0) return false;
	if (force) return true;
	let outStat;
	try {
		outStat = statSync(outFile);
	} catch {
		return true;
	}
	return Math.max(...stats.map((s) => s.mtimeMs)) > outStat.mtimeMs;
}

// ── private state dir ────────────────────────────────────────────────────
/** Tạo (hoặc ép lại) mode 0o700 cho thư mục chứa state nhạy cảm — mkdir với
 * mode là no-op khi thư mục đã tồn tại từ lần chạy cũ. */
export function ensurePrivateDir(dir) {
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	chmodSync(dir, 0o700);
	return dir;
}

// ── process group helpers ────────────────────────────────────────────────
const groupAlive = (pgid) => {
	try {
		process.kill(-pgid, 0);
		return true;
	} catch {
		return false;
	}
};

/** Backstop đồng bộ cho handler 'exit': SIGKILL thẳng vào -pgid. Caller phải
 * chỉ truyền pgid của child CÒN SỐNG (đã thoát/reap → PGID có thể tái chế). */
export function killProcessGroupSync(pgid) {
	if (!Number.isInteger(pgid) || pgid <= 1) return;
	try {
		process.kill(-pgid, "SIGKILL");
	} catch {
		/* group đã tan */
	}
}

/** SIGTERM → poll tới graceMs → SIGKILL cho cả process group (POSIX). */
export async function killProcessGroup(
	pgid,
	{ graceMs = 3_000, pollMs = 100 } = {},
) {
	if (!Number.isInteger(pgid) || pgid <= 1) return;
	if (!groupAlive(pgid)) return;
	try {
		process.kill(-pgid, "SIGTERM");
	} catch {
		return;
	}
	const deadline = Date.now() + graceMs;
	while (Date.now() < deadline) {
		if (!groupAlive(pgid)) return;
		await new Promise((resolve) => setTimeout(resolve, pollMs));
	}
	if (!groupAlive(pgid)) return;
	try {
		process.kill(-pgid, "SIGKILL");
	} catch {
		return;
	}
	const hardDeadline = Date.now() + 2_000;
	while (groupAlive(pgid) && Date.now() < hardDeadline)
		await new Promise((resolve) => setTimeout(resolve, 50));
}

/** Spawn bất đồng bộ KHÔNG shell, nhóm tiến trình riêng (detached), thu log
 * redact, timeout tự leo thang kill cả group. */
export function spawnAsync(
	cmd,
	args,
	{ cwd, env, timeoutMs = 0, onChild, onCleanup } = {},
) {
	return new Promise((resolve, reject) => {
		let child;
		try {
			child = spawn(cmd, args, {
				cwd,
				env,
				detached: process.platform !== "win32",
				stdio: ["ignore", "pipe", "pipe"],
			});
		} catch (err) {
			reject(err);
			return;
		}
		onChild?.(child);
		const collect = createLogCollector();
		child.stdout.on("data", (d) => collect(String(d)));
		child.stderr.on("data", (d) => collect(String(d)));
		let timer = null;
		let settled = false;
		let timedOut = false;
		const finish = (fn, value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			onCleanup?.();
			fn(value);
		};
		if (timeoutMs > 0) {
			timer = setTimeout(() => {
				timedOut = true;
				void killProcessGroup(child.pid, { graceMs: 1_000 }).then(() => {
					finish(
						reject,
						new Error(
							`timeout ${timeoutMs}ms chạy ${cmd}\n--- log ---\n${collect()}`,
						),
					);
				});
			}, timeoutMs);
		}
		child.on("error", (err) => finish(reject, err));
		child.on("exit", (code, signal) => {
			if (timedOut) {
				finish(
					reject,
					new Error(
						`timeout ${timeoutMs}ms chạy ${cmd}\n--- log ---\n${collect()}`,
					),
				);
				return;
			}
			finish(resolve, { code, signal, log: collect() });
		});
	});
}

export { readFileSync };
