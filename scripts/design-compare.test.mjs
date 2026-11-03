import assert from "node:assert/strict";
import { execSync, spawn, spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const lib = await import(
	pathToFileURL(join(here, "design-compare/harness-lib.mjs")).href
);
const FETCH_DESIGN = join(here, "design-compare/fetch-design.sh");
const {
	parseCliArgs,
	buildChildEnv,
	redactLog,
	isPortFreeOnLoopback,
	probeFreePort,
	isDesignV2Fingerprint,
	verifyDesignV2Server,
	loadPngJs,
	inspectPngBuffer,
	assertNonBlankPngFile,
	shouldCompose,
	ensurePrivateDir,
	killProcessGroup,
	killProcessGroupSync,
	spawnAsync,
} = lib;

const { PNG } = loadPngJs(root);

// ── helpers ──────────────────────────────────────────────────────────────
function fillPng(png, fn) {
	for (let y = 0; y < png.height; y++)
		for (let x = 0; x < png.width; x++)
			fn(png.data, (png.width * y + x) << 2, x, y);
	return PNG.sync.write(png);
}

const blankWhite = () =>
	fillPng(new PNG({ width: 40, height: 40 }), (d, i) => {
		d[i] = 255;
		d[i + 1] = 255;
		d[i + 2] = 255;
		d[i + 3] = 255;
	});
const blankTransparent = () =>
	fillPng(new PNG({ width: 40, height: 40 }), (d, i) => {
		d[i] = 0;
		d[i + 1] = 0;
		d[i + 2] = 0;
		d[i + 3] = 0;
	});
const blankDark = () =>
	fillPng(new PNG({ width: 40, height: 40 }), (d, i) => {
		d[i] = 12;
		d[i + 1] = 12;
		d[i + 2] = 14;
		d[i + 3] = 255;
	});
const realContent = () =>
	fillPng(new PNG({ width: 100, height: 100 }), (d, i, x, y) => {
		const inBlock = x >= 30 && x < 70 && y >= 30 && y < 70;
		d[i] = inBlock ? 60 : 255;
		d[i + 1] = inBlock ? 80 : 255;
		d[i + 2] = inBlock ? 120 : 255;
		d[i + 3] = 255;
	});
// Viền tối 2px quanh nền trắng 1440×900 (~0.72% pixel) — phải bị chặn.
const borderOnly = () =>
	fillPng(new PNG({ width: 1440, height: 900 }), (d, i, x, y) => {
		const onBorder = x < 2 || y < 2 || x >= 1438 || y >= 898;
		d[i] = onBorder ? 20 : 255;
		d[i + 1] = onBorder ? 20 : 255;
		d[i + 2] = onBorder ? 20 : 255;
		d[i + 3] = 255;
	});
// Badge màu 44×44 ở góc dưới-phải của trang trắng 1440×900 (~0.15%) — phải bị chặn.
const cornerBadgeOnly = () =>
	fillPng(new PNG({ width: 1440, height: 900 }), (d, i, x, y) => {
		const inBadge =
			x >= 1440 - 60 &&
			x < 1440 - 60 + 44 &&
			y >= 900 - 60 &&
			y < 900 - 60 + 44;
		d[i] = inBadge ? 200 : 255;
		d[i + 1] = inBadge ? 60 : 255;
		d[i + 2] = inBadge ? 20 : 255;
		d[i + 3] = 255;
	});

/** HTTP serverloopback trả payload theo path (cho test fetch-design.sh). */
function startHttpServer({ rootHtml, artSource, rootStatus = 200 }) {
	return new Promise((resolve) => {
		const srv = net.createServer((socket) => {
			socket.on("error", () => {});
			socket.on("data", (chunk) => {
				const reqLine = String(chunk).split("\r\n")[0] ?? "";
				let body = "";
				let status = 200;
				if (reqLine.includes(" / ")) {
					status = rootStatus;
					body = rootHtml;
				} else if (reqLine.startsWith("GET /src/lib/art.tsx")) {
					body = artSource;
				} else {
					socket.write(
						"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
					);
					return;
				}
				socket.write(
					`HTTP/1.1 ${status} X\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
				);
			});
		});
		srv.listen(0, "127.0.0.1", () =>
			resolve({ srv, port: srv.address().port }),
		);
	});
}

const DESIGN_ROOT = '<html><body><div id="root"></div></body></html>';
const DESIGN_ART = `export function TeacherDesk() {}\n${"// padding for sigpipe trap\n".repeat(4_000)}`;

async function withTempDir(fn) {
	const dir = await mkdtemp(join(tmpdir(), "design-compare-test-"));
	try {
		return await fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function runFetchDesign(env) {
	// spawn BẤT ĐỒNG BỘ (không spawnSync): fake HTTP server chạy TRONG cùng
	// process test — spawnSync sẽ block event loop, server không trả lời được
	// curl → timeout giả. Đúng luôn lớp lỗi mà #546 sửa trong capture.mjs.
	// cwd = thư mục tạm: script cũ resolve DIR theo pwd — cách ly để test
	// không bao giờ gh repo clone / ghi vào worktree thật; script mới neo
	// ROOT_DIR theo vị trí script nên không phụ thuộc cwd.
	const cwd = mkdtempSync(join(tmpdir(), "design-compare-cwd-"));
	return new Promise((resolve) => {
		const child = spawn("bash", [FETCH_DESIGN, env.FETCH_CMD ?? "run"], {
			cwd,
			env: { ...process.env, ...env },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => {
			stdout += String(d);
		});
		child.stderr.on("data", (d) => {
			stderr += String(d);
		});
		const t0 = Date.now();
		child.on("close", (status) => {
			rmSync(cwd, { recursive: true, force: true });
			resolve({ status, stdout, stderr, elapsed: Date.now() - t0 });
		});
	});
}

// ── parseCliArgs ─────────────────────────────────────────────────────────
test("parseCliArgs: mặc định và parse các cờ hợp lệ", () => {
	assert.deepEqual(parseCliArgs([]), {
		screens: "all",
		side: "both",
		label: "new",
		keepDesign: false,
		force: false,
	});
	assert.deepEqual(
		parseCliArgs([
			"--force",
			"--keep-design",
			"--screens",
			"a,b",
			"--side",
			"app",
			"--label",
			"old",
		]),
		{
			screens: "a,b",
			side: "app",
			label: "old",
			keepDesign: true,
			force: true,
		},
	);
});

test("parseCliArgs: --side sai, cờ lạ, thiếu giá trị, --label traversal đều throw", () => {
	assert.throws(
		() => parseCliArgs(["--side", "diagonal"]),
		/--side không hợp lệ/,
	);
	assert.throws(() => parseCliArgs(["--unknown"]), /cờ không hợp lệ/);
	assert.throws(
		() => parseCliArgs(["--screens", "--force"]),
		/cờ --screens thiếu giá trị/,
	);
	assert.throws(
		() => parseCliArgs(["--screens"]),
		/cờ --screens thiếu giá trị/,
	);
	assert.throws(
		() => parseCliArgs(["--label", "../../.."]),
		/--label không hợp lệ/,
	);
	assert.throws(() => parseCliArgs(["--label", "New"]), /--label không hợp lệ/);
	assert.throws(
		() => parseCliArgs(["--label", "a".repeat(33)]),
		/--label không hợp lệ/,
	);
});

// ── buildChildEnv ────────────────────────────────────────────────────────
test("buildChildEnv: luôn bật VITE_TEACHER_SIGNUP_ENABLED, giữ localhost origin, extraEnv ghi đè", () => {
	const env = buildChildEnv(
		{ PATH: "/usr/bin" },
		{ apiPort: 8000, webPort: 8001, studentPort: 8003 },
	);
	assert.equal(env.VITE_TEACHER_SIGNUP_ENABLED, "true");
	assert.equal(env.VITE_SERVER_URL, "http://localhost:8000");
	assert.equal(env.E2E_API_PORT, "8000");
	assert.equal(env.E2E_WEB_PORT, "8001");
	assert.equal(env.E2E_STUDENT_PORT, "8003");
	assert.equal(env.PATH, "/usr/bin");
	const overridden = buildChildEnv(
		{},
		{
			apiPort: 8000,
			webPort: 8001,
			studentPort: 8003,
			extraEnv: { VITE_TEACHER_SIGNUP_ENABLED: "false" },
		},
	);
	assert.equal(overridden.VITE_TEACHER_SIGNUP_ENABLED, "false");
});

// ── redactLog ────────────────────────────────────────────────────────────
test("redactLog: che verify/reset/pay/GitHub token", () => {
	const redacted = redactLog(
		[
			"GET https://app/verify-email?token=abc123 ok",
			"GET https://app/api/auth/reset-password/zzz-secret-123 ok",
			"GET https://app/pay/p7Hq2xSecret ok",
			"git -c http.extraheader=x-access-token:ghp_ABCDEF1234567890 clone",
			"Authorization: Bearer github_pat_ABCDEF1234567890",
		].join("\n"),
	);
	assert.doesNotMatch(redacted, /abc123/);
	assert.doesNotMatch(redacted, /zzz-secret-123/);
	assert.doesNotMatch(redacted, /p7Hq2xSecret/);
	assert.doesNotMatch(redacted, /ghp_ABCDEF1234567890/);
	assert.doesNotMatch(redacted, /github_pat_ABCDEF1234567890/);
	assert.match(redacted, /\/verify-email\?token=\[redacted\]/);
	assert.match(redacted, /\/api\/auth\/reset-password\/\[redacted\]/);
	assert.match(redacted, /\/pay\/\[redacted\]/);
});

// ── probeFreePort / isPortFreeOnLoopback ─────────────────────────────────
test("isPortFreeOnLoopback: false khi cổng bị chiếm trên ::1 hoặc 127.0.0.1; true khi trống", async () => {
	const srv = net.createServer();
	await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
	const v4Port = srv.address().port;
	assert.equal(await isPortFreeOnLoopback(v4Port), false);
	const v6 = net.createServer();
	const v6Ok = await new Promise((resolve) => {
		v6.once("error", (err) => resolve(err.code));
		v6.listen(v4Port, "::1", () => resolve(true));
	});
	if (v6Ok === true) {
		assert.equal(await isPortFreeOnLoopback(v6Ok && v4Port), false);
		v6.close();
	}
	srv.close();
	const fresh = await probeFreePort();
	assert.equal(typeof fresh, "number");
	assert.ok(fresh >= 1 && fresh <= 65535);
	assert.equal(await isPortFreeOnLoopback(fresh), true);
});

test("probeFreePort: excludePorts bảo đảm các cổng cấp ra khác nhau", async () => {
	const p1 = await probeFreePort();
	const p2 = await probeFreePort({ excludePorts: new Set([p1]) });
	const p3 = await probeFreePort({ excludePorts: new Set([p1, p2]) });
	assert.notEqual(p1, p2);
	assert.notEqual(p2, p3);
	assert.notEqual(p1, p3);
});

// ── design-v2 fingerprint ────────────────────────────────────────────────
test("isDesignV2Fingerprint: khớp chữ ký, từ chối nội dung lạ", () => {
	assert.equal(
		isDesignV2Fingerprint({
			rootHtml: DESIGN_ROOT,
			artModuleSource: DESIGN_ART,
		}),
		true,
	);
	assert.equal(
		isDesignV2Fingerprint({
			rootHtml: "hello from stranger",
			artModuleSource: DESIGN_ART,
		}),
		false,
	);
	assert.equal(
		isDesignV2Fingerprint({
			rootHtml: DESIGN_ROOT,
			artModuleSource: "export const x = 1",
		}),
		false,
	);
});

test("verifyDesignV2Server: chấp nhận đúng chữ ký, từ chối HTML lạ", async () => {
	const good = await startHttpServer({
		rootHtml: DESIGN_ROOT,
		artSource: DESIGN_ART,
	});
	const bad = await startHttpServer({
		rootHtml: "hello from stranger",
		artSource: "// nothing",
	});
	try {
		assert.deepEqual(
			await verifyDesignV2Server(`http://127.0.0.1:${good.port}`),
			{ ok: true },
		);
		const res = await verifyDesignV2Server(`http://127.0.0.1:${bad.port}`);
		assert.equal(res.ok, false);
	} finally {
		good.srv.close();
		bad.srv.close();
	}
});

test("verifyDesignV2Server: từ chối redirect (SSRF) và body > 256KiB (OOM)", async () => {
	const redirectSrv = await new Promise((resolve) => {
		const srv = net.createServer((socket) => {
			socket.on("data", () => {
				socket.write(
					"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
				);
			});
		});
		srv.listen(0, "127.0.0.1", () =>
			resolve({ srv, port: srv.address().port }),
		);
	});
	const bigSrv = await startHttpServer({
		rootHtml: DESIGN_ROOT,
		artSource: `x\n${"y".repeat(300 * 1024)}`,
	});
	try {
		const redirect = await verifyDesignV2Server(
			`http://127.0.0.1:${redirectSrv.port}`,
		);
		assert.equal(redirect.ok, false);
		const big = await verifyDesignV2Server(`http://127.0.0.1:${bigSrv.port}`);
		assert.equal(big.ok, false);
		assert.match(big.reason, /quá lớn/);
	} finally {
		redirectSrv.srv.close();
		bigSrv.srv.close();
	}
});

// ── loadPngJs + inspectPngBuffer + assertNonBlankPngFile ─────────────────
test("loadPngJs: nạp PNG qua chuỗi phụ thuộc sẵn có, không đụng lockfile", () => {
	const loaded = loadPngJs(root);
	assert.equal(typeof loaded.PNG.sync.read, "function");
	assert.ok(["playwright-core", "pngjs"].includes(loaded.source));
});

test("inspectPngBuffer: trắng / trong suốt / tối đồng nhất đều bị chặn; ảnh có nội dung pass", () => {
	assert.equal(inspectPngBuffer(blankWhite(), PNG).ok, false);
	assert.equal(inspectPngBuffer(blankTransparent(), PNG).ok, false);
	assert.equal(inspectPngBuffer(blankDark(), PNG).ok, false);
	assert.equal(inspectPngBuffer(realContent(), PNG).ok, true);
});

test("inspectPngBuffer: viền 2px và badge góc nhỏ (<1% pixel khác màu chủ đạo) bị chặn", () => {
	assert.equal(inspectPngBuffer(borderOnly(), PNG).ok, false);
	assert.equal(inspectPngBuffer(cornerBadgeOnly(), PNG).ok, false);
});

test("assertNonBlankPngFile: ảnh trắng bị xoá khỏi đĩa rồi throw; ảnh thật giữ nguyên", async () => {
	await withTempDir(async (dir) => {
		const blankPath = join(dir, "blank.png");
		await writeFile(blankPath, blankWhite());
		await assert.rejects(
			() => assertNonBlankPngFile(blankPath, PNG),
			/trắng\/rỗng/,
		);
		assert.equal(existsSync(blankPath), false, "file ảnh trắng phải bị xoá");

		const okPath = join(dir, "ok.png");
		await writeFile(okPath, realContent());
		const res = await assertNonBlankPngFile(okPath, PNG);
		assert.equal(res.ok, true);
		assert.equal(existsSync(okPath), true);
	});
});

// ── shouldCompose ────────────────────────────────────────────────────────
test("shouldCompose: bảng chân trị missing/newer/older/force/no-input", async () => {
	await withTempDir(async (dir) => {
		const outOld = join(dir, "out-old.png");
		const outNew = join(dir, "out-new.png");
		const inA = join(dir, "in-a.png");
		const inB = join(dir, "in-b.png");
		await writeFile(inA, realContent());
		await writeFile(inB, realContent());
		await writeFile(outOld, blankWhite());
		await writeFile(outNew, blankWhite());
		const { utimesSync } = await import("node:fs");
		// outOld đặt mtime trong quá khứ (ghi tuần tự có thể cùng ms với input)
		const past = new Date(Date.now() - 10_000);
		utimesSync(outOld, past, past);
		// ép outFile mới hơn mọi input (utimesSync nhận Date, không phải ms)
		const later = new Date(Date.now() + 10_000);
		utimesSync(outNew, later, later);

		assert.equal(
			shouldCompose(join(dir, "missing-out.png"), [inA, inB]),
			true,
			"outFile thiếu → true",
		);
		assert.equal(
			shouldCompose(outNew, [inA, inB]),
			false,
			"outFile mới hơn mọi input → false",
		);
		assert.equal(
			shouldCompose(outOld, [inA, inB]),
			true,
			"input mới hơn outFile → true",
		);
		assert.equal(
			shouldCompose(outNew, [inA, inB], { force: true }),
			true,
			"force → true",
		);
		assert.equal(
			shouldCompose(outNew, [join(dir, "ghost.png")]),
			false,
			"không input tồn tại → false",
		);
		assert.equal(shouldCompose(outNew, []), false, "input rỗng → false");
	});
});

// ── ensurePrivateDir ─────────────────────────────────────────────────────
test("ensurePrivateDir: chmod 0o700 cả khi thư mục đã tồn tại", async () => {
	await withTempDir(async (dir) => {
		const sub = join(dir, "state");
		mkdirSync(sub, { recursive: true, mode: 0o755 });
		ensurePrivateDir(sub);
		const { statSync } = await import("node:fs");
		assert.equal(statSync(sub).mode & 0o777, 0o700);
	});
});

// ── killProcessGroup / spawnAsync ────────────────────────────────────────
const IGNORE_TERM_CHILD = `
process.on("SIGTERM", () => {});
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const grandchild = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 10000);"], {
	stdio: "ignore",
});
// node -e: đối số đầu tiên nằm ở argv[1] (không có script name)
fs.writeFileSync(process.argv[1], String(grandchild.pid));
setInterval(() => {}, 10000);
`;

async function spawnIgnoreTermGroup(gcFile) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ["-e", IGNORE_TERM_CHILD, gcFile], {
			detached: true,
			stdio: "ignore",
		});
		child.on("error", reject);
		// chờ grandchild pid được ghi
		const t0 = Date.now();
		const poll = () => {
			if (existsSync(gcFile) && readFileSyncSafe(gcFile)) return resolve(child);
			if (Date.now() - t0 > 5000)
				return reject(new Error("grandchild không kịp ghi"));
			setTimeout(poll, 50);
		};
		poll();
	});
}

function readFileSyncSafe(file) {
	try {
		return readFileSync(file, "utf8").trim();
	} catch {
		return "";
	}
}

const groupGone = (pgid) => {
	try {
		process.kill(-pgid, 0);
		return false;
	} catch {
		return true;
	}
};

/** Chờ group chết (SIGKILL đã bắn): member có thể thành zombie vài trăm ms
 * trước khi init reaped — assert ngay sẽ false-negative. */
async function waitForGroupGone(pgid, deadlineMs = 3_000) {
	const t0 = Date.now();
	while (!groupGone(pgid) && Date.now() - t0 < deadlineMs)
		await new Promise((r) => setTimeout(r, 100));
	return groupGone(pgid);
}

test("killProcessGroup: pgid của child đã thoát/reap → no-op không ném lỗi, không bắn tín hiệu", async () => {
	const done = spawn(process.execPath, ["-e", "process.exit(0)"], {
		detached: true,
		stdio: "ignore",
	});
	await new Promise((resolve) => done.on("exit", resolve));
	assert.equal(done.exitCode, 0);
	await assert.doesNotReject(() => killProcessGroup(done.pid, { graceMs: 50 }));
	assert.doesNotThrow(() => killProcessGroupSync(done.pid));
});

test("killProcessGroup: SIGTERM bị phớt lờ → leo thang SIGKILL, cả group chết sạch", async () => {
	await withTempDir(async (dir) => {
		const gcFile = join(dir, "gc.pid");
		const child = await spawnIgnoreTermGroup(gcFile);
		try {
			assert.equal(groupGone(child.pid), false);
			await killProcessGroup(child.pid, { graceMs: 300 });
			assert.equal(
				await waitForGroupGone(child.pid),
				true,
				"group phải chết sau SIGKILL leo thang",
			);
			const gc = Number(readFileSyncSafe(gcFile));
			if (Number.isInteger(gc) && gc > 0) {
				assert.throws(
					() => process.kill(gc, 0),
					/ESRCH/,
					"grandchild phải chết",
				);
			}
		} finally {
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {
				/* gone */
			}
		}
	});
});

test("spawnAsync: timeout giết sạch process group và reject lỗi timeout", async () => {
	await withTempDir(async (dir) => {
		const gcFile = join(dir, "gc.pid");
		let spawned;
		try {
			await assert.rejects(
				spawnAsync(process.execPath, ["-e", IGNORE_TERM_CHILD, gcFile], {
					timeoutMs: 150,
					onChild: (c) => {
						spawned = c;
					},
				}),
				/timeout 150ms/,
			);
			assert.ok(spawned?.pid > 1, "spawnAsync phải expose child");
			assert.equal(
				await waitForGroupGone(spawned.pid),
				true,
				"group của spawnAsync phải bị kill khi timeout",
			);
		} finally {
			if (spawned?.pid)
				try {
					process.kill(-spawned.pid, "SIGKILL");
				} catch {
					/* gone */
				}
		}
	});
});

test("spawnAsync: không shell:true, command thoát bình thường trả code", async () => {
	const r = await spawnAsync("node", ["-e", "console.log('ok-from-spawn')"]);
	assert.equal(r.code, 0);
	assert.match(r.log, /ok-from-spawn/);
});

// ── fetch-design.sh integration ──────────────────────────────────────────
test("fetch-design.sh: DESIGN_PORT không hợp lệ → exit 2", async () => {
	for (const bad of ["abc", "70000", ""]) {
		const r = await runFetchDesign({
			DESIGN_PORT: bad,
			DESIGN_CACHE_DIR: join(tmpdir(), "design-compare-unused"),
		});
		assert.notEqual(
			r.status,
			0,
			`DESIGN_PORT=${JSON.stringify(bad)} phải fail`,
		);
		assert.match(r.stderr, /DESIGN_PORT không hợp lệ|ngoài 1\.\.65535/);
	}
});

test("fetch-design.sh: listener lạ + đúng chữ ký design-v2 đều bị từ chối khi DESIGN_NO_REUSE=1 (exit 3, <5s, không đụng git)", async () => {
	await withTempDir(async (tmp) => {
		const foreign = await startHttpServer({
			rootHtml: "hello from stranger",
			artSource: "// nothing",
		});
		const designLike = await startHttpServer({
			rootHtml: DESIGN_ROOT,
			artSource: DESIGN_ART,
		});
		try {
			for (const [name, srv, msg] of [
				["foreign", foreign, "occupied by another service"],
				["design-like", designLike, "occupied by another design-v2"],
			]) {
				const r = await runFetchDesign({
					DESIGN_PORT: String(srv.port),
					DESIGN_CACHE_DIR: join(tmp, name),
					DESIGN_NO_REUSE: "1",
				});
				assert.equal(
					r.status,
					3,
					`${name}: kỳ vọng exit 3, got ${r.status}\nstdout=${r.stdout}\nstderr=${r.stderr}`,
				);
				assert.ok(
					r.elapsed < 5_000,
					`${name}: phải fail <5s (took ${r.elapsed}ms)`,
				);
				assert.match(r.stderr, new RegExp(msg));
				assert.doesNotMatch(r.stdout, /already on/);
				assert.equal(
					existsSync(join(tmp, name)),
					false,
					`${name}: không được tạo cache dir trước khi check port`,
				);
			}
			// không DESIGN_NO_REUSE: design-v2 thật (chữ ký khớp) cho phép reuse thủ công
			const reuse = await runFetchDesign({
				DESIGN_PORT: String(designLike.port),
				DESIGN_CACHE_DIR: join(tmp, "reuse"),
			});
			assert.equal(
				reuse.status,
				0,
				`stdout=${reuse.stdout}\nstderr=${reuse.stderr}`,
			);
			assert.match(reuse.stdout, /already on 127\.0\.0\.1/);
		} finally {
			foreign.srv.close();
			designLike.srv.close();
		}
	});
});

test("fetch-design.sh stop: pid đúng danh tính (vite + --port) → kill cả group; pid sai danh tính → chỉ xoá file", async () => {
	await withTempDir(async (tmp) => {
		const cache = join(tmp, ".cache/design-v2");
		mkdirSync(cache, { recursive: true });
		const port = 43210;
		// 1) leader cmdline chứa "vite" + "--port 43210"
		const leaderScript = `
process.on("SIGTERM", () => {});
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const gc = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 10000);"], { stdio: "ignore" });
fs.writeFileSync(${JSON.stringify(join(cache, "gc-1.pid"))}, String(gc.pid));
setInterval(() => {}, 10000);
`;
		const leaderPath = join(tmp, "fake-vite-server.js");
		writeFileSync(leaderPath, leaderScript);
		const leader = spawn(
			process.execPath,
			[leaderPath, "--port", String(port)],
			{
				detached: true,
				stdio: "ignore",
			},
		);
		const t0 = Date.now();
		while (!readFileSyncSafe(join(cache, "gc-1.pid")) && Date.now() - t0 < 5000)
			await new Promise((r) => setTimeout(r, 50));
		writeFileSync(join(cache, `.pid-${port}`), `${leader.pid}\n`);
		const stop = spawnSync("bash", [FETCH_DESIGN, "stop"], {
			cwd: tmp,
			env: {
				...process.env,
				DESIGN_PORT: String(port),
				DESIGN_CACHE_DIR: cache,
			},
			encoding: "utf8",
			timeout: 15_000,
		});
		assert.equal(stop.status, 0, stop.stderr);
		assert.match(stop.stdout, /design v2 stopped/);
		assert.equal(
			existsSync(join(cache, `.pid-${port}`)),
			false,
			"pid file phải bị xoá",
		);
		const gc1 = Number(readFileSyncSafe(join(cache, "gc-1.pid")));
		assert.equal(await waitForGroupGone(leader.pid), true, "leader phải chết");
		if (Number.isInteger(gc1) && gc1 > 0)
			assert.throws(
				() => process.kill(gc1, 0),
				/ESRCH/,
				"grandchild phải chết",
			);

		// 2) stale pid: sleep 30 (không phải vite) → không bị kill, file xoá
		const sleeper = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
		try {
			const port2 = 43211;
			writeFileSync(join(cache, `.pid-${port2}`), `${sleeper.pid}\n`);
			const stop2 = spawnSync("bash", [FETCH_DESIGN, "stop"], {
				cwd: tmp,
				env: {
					...process.env,
					DESIGN_PORT: String(port2),
					DESIGN_CACHE_DIR: cache,
				},
				encoding: "utf8",
				timeout: 15_000,
			});
			assert.equal(stop2.status, 0, stop2.stderr);
			assert.doesNotThrow(
				() => process.kill(sleeper.pid, 0),
				"tiến trình lạ KHÔNG được kill",
			);
			assert.equal(
				existsSync(join(cache, `.pid-${port2}`)),
				false,
				"stale pid file phải bị xoá",
			);
		} finally {
			try {
				process.kill(-sleeper.pid, "SIGKILL");
			} catch {
				/* gone */
			}
		}
	});
});

test("fetch-design.sh run: spawn qua fake pnpm → .pid-$PORT + log + stop giết cả group", async () => {
	await withTempDir(async (tmp) => {
		const cache = join(tmp, ".cache/design-v2");
		mkdirSync(join(cache, "node_modules"), { recursive: true });
		// repo git thật với HEAD == DESIGN_V2_SHA → skip clone/fetch/checkout
		execSync(
			"git init -q && git -c user.email=t@t.local -c user.name=t commit --allow-empty -q -m x",
			{ cwd: cache },
		);
		const sha = execSync("git rev-parse HEAD", {
			cwd: cache,
			encoding: "utf8",
		}).trim();
		// fake pnpm: `exec vite --host H --port P --strictPort` → server giả lập
		// chữ ký design-v2 + gc phớt lờ SIGTERM; wrapper giữ nhóm tiến trình.
		const bin = join(tmp, "bin");
		mkdirSync(bin, { recursive: true });
		const serverJs = join(tmp, "fake-vite-server.js");
		writeFileSync(
			serverJs,
			`const http = require("node:http");
const ROOT = ${JSON.stringify(DESIGN_ROOT)};
const ART = ${JSON.stringify(DESIGN_ART)};
http.createServer((req, res) => {
  const body = req.url === "/src/lib/art.tsx" ? ART : ROOT;
  res.writeHead(200, { "Content-Type": "text/plain", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}).listen(Number(process.argv[2]), "127.0.0.1");
process.on("SIGTERM", () => {});
setInterval(() => {}, 10000);
`,
		);
		const fakePnpm = join(bin, "pnpm");
		writeFileSync(
			fakePnpm,
			`#!/usr/bin/env node
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] !== "exec" || args[1] !== "vite") process.exit(2);
const port = args[args.indexOf("--port") + 1];
const server = spawn(process.execPath, [${JSON.stringify(serverJs)}, port], { stdio: "ignore" });
const gc = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 10000);"], { stdio: "ignore" });
fs.writeFileSync(${JSON.stringify(join(tmp, "pids.json"))}, JSON.stringify([server.pid, gc.pid]));
process.on("SIGTERM", () => {});
setInterval(() => {}, 10000);
`,
		);
		chmodSync(fakePnpm, 0o755);
		const port = 43212;
		try {
			const r = await runFetchDesign({
				DESIGN_PORT: String(port),
				DESIGN_CACHE_DIR: cache,
				DESIGN_V2_SHA: sha,
				PATH: `${bin}:${process.env.PATH}`,
			});
			assert.equal(r.status, 0, `stdout=${r.stdout}\nstderr=${r.stderr}`);
			assert.match(
				r.stdout,
				new RegExp(`design v2 on 127\\.0\\.0\\.1:${port} \\(pgid \\d+\\)`),
			);
			assert.ok(
				existsSync(join(cache, `.pid-${port}`)),
				"pid file phải được ghi",
			);
			assert.ok(
				existsSync(join(cache, `.dev-${port}.log`)),
				"log theo port phải được ghi",
			);
			const pgid = Number(
				readFileSync(join(cache, `.pid-${port}`), "utf8").trim(),
			);
			const pids = JSON.parse(readFileSyncSafe(join(tmp, "pids.json")) || "[]");
			const stop = spawnSync("bash", [FETCH_DESIGN, "stop"], {
				cwd: tmp,
				env: {
					...process.env,
					DESIGN_PORT: String(port),
					DESIGN_CACHE_DIR: cache,
				},
				encoding: "utf8",
				timeout: 20_000,
			});
			assert.equal(stop.status, 0, stop.stderr);
			assert.equal(
				await waitForGroupGone(pgid),
				true,
				"server + gc (phớt lờ SIGTERM) phải chết sau SIGKILL leo thang",
			);
			for (const p of pids) {
				if (Number.isInteger(p) && p > 0)
					assert.throws(
						() => process.kill(p, 0),
						/ESRCH/,
						`pid ${p} phải chết`,
					);
			}
		} finally {
			// test fail giữa chừng → không để lại server giả chiếm port
			spawnSync("bash", [FETCH_DESIGN, "stop"], {
				cwd: tmp,
				env: {
					...process.env,
					DESIGN_PORT: String(port),
					DESIGN_CACHE_DIR: cache,
				},
				encoding: "utf8",
				timeout: 20_000,
			});
		}
	});
});
