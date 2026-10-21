#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
// Watchdog giám sát dev server cho playwright e2e (plan 261021-2125-402,
// issue #402). Root cause #402: vite 8 (engine rolldown) chết giữa run bằng
// native abort() SIGABRT — playwright không detect webServer chết giữa run
// (onExit chỉ hiệu lực lúc startup, runner/index.js:922-927) → cascade
// ERR_CONNECTION_REFUSED im lặng.
//
// Hành vi (kongming GO + red-team harden):
// - vite web/student chết thật (refused/status≥404, 3 poll liên tiếp) →
//   restart TỐI ĐA 1 lần/vite, warming grace 90s sau restart; chết lần 2 →
//   marker + ngừng restart (global-teardown sẽ fail run với message rõ).
// - api chết (refused/status≥500 — boot:api wipe local.db mỗi boot) → KHÔNG
//   restart, marker fail-loud.
// - Watchdog tự crash → crash marker; heartbeat mỗi poll để global-teardown
//   phát hiện watchdog chết mà không kịp ghi marker.
//
// Entry playwright: { name: "dev-watchdog", command: "node devserver-watchdog.mjs" }
// — không url: playwright spawn xong không chờ readiness. Marker/log ghi vào
// `<apps/e2e>/test-results` (resolve tuyệt đối từ import.meta.url — CẤM cwd).
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	buildRestartCommand,
	buildServices,
	buildSpawnOptions,
	createRedactor,
	parsePorts,
} from "./devserver-services.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const TEST_RESULTS = path.join(HERE, "test-results");

const POLL_MS = 3_000;
const FETCH_TIMEOUT_MS = 5_000;
const CONSECUTIVE_DEATHS = 3;
const WARMING_GRACE_MS = 90_000;
const MAX_RESTARTS_PER_VITE = 1;

/**
 * State machine thuần (unit test tại scripts/devserver-watchdog.test.mjs).
 * - Chết = 3 poll fail "death-class" liên tiếp (refused | http ≥ deadStatus).
 * - Stall (timeout) KHÔNG đếm, KHÔNG reset — event-loop chậm ≠ server chết.
 * - warming sau restart: disarm tới poll OK đầu hoặc hết grace.
 */
export function createWatchdogState({ kind, name, restart, now = Date.now }) {
	const state = {
		kind,
		name,
		restarts: 0,
		unstable: false,
		warming: true,
		warmingUntil: now() + WARMING_GRACE_MS,
		deathStreak: 0,
		lastReason: "chưa có dữ liệu poll",
	};
	state.record = (poll) => {
		if (state.unstable) return;
		if (poll.ok) {
			state.deathStreak = 0;
			state.warming = false;
			return;
		}
		if (poll.reason === "stall") return;
		if (state.warming) {
			if (now() < state.warmingUntil) return;
			state.warming = false;
		}
		state.deathStreak += 1;
		state.lastReason =
			poll.reason === "http"
				? `HTTP ${poll.status} ≥ ngưỡng chết ${poll.deadStatus ?? ""}`.trim()
				: "không kết nối được (ECONNREFUSED)";
		if (state.deathStreak < CONSECUTIVE_DEATHS) return;
		if (kind === "vite" && state.restarts < MAX_RESTARTS_PER_VITE) {
			state.restarts += 1;
			state.deathStreak = 0;
			state.warming = true;
			state.warmingUntil = now() + WARMING_GRACE_MS;
			restart();
			return;
		}
		state.unstable = true;
	};
	// Restart child thoát ngay trong warming (EADDRINUSE/kill) → đừng mù 99s:
	// coi như đã cạn ngân sách restart.
	state.noteChildDiedDuringWarming = () => {
		if (state.warming && kind === "vite" && state.restarts > 0) {
			state.unstable = true;
			state.lastReason = "restart child thoát ngay trong warming";
		}
	};
	return state;
}

const stripControlChars = (s) =>
	Array.from(s)
		.filter((ch) => {
			const c = ch.codePointAt(0);
			return c > 31 && c !== 127;
		})
		.join("");

async function main() {
	const ports = parsePorts(process.env);
	await mkdir(TEST_RESULTS, { recursive: true });
	const services = buildServices(ports);
	const runStartedAt = new Date().toISOString();
	const originalLogNote =
		"log process gốc (lần chết đầu) xem stderr trong output reporter playwright (stderr webServer được forward mặc định); log dưới đây thuộc restart-child do watchdog spawn.";

	/** name → { machine, tail, child } */
	const tracked = new Map();
	const markerWritten = new Set();

	const writeFailMarker = async (svc, reason) => {
		if (markerWritten.has(svc.name)) return;
		markerWritten.add(svc.name);
		const payload = {
			service: svc.name,
			kind: svc.kind,
			reason: stripControlChars(String(reason)).slice(0, 2_000),
			log: (tracked.get(svc.name)?.tail ?? "").slice(-4_000),
			pid: process.pid,
			startedAt: runStartedAt,
			originalLogNote,
		};
		await writeFile(
			path.join(TEST_RESULTS, `devserver-${svc.name}.fail.json`),
			`${JSON.stringify(payload, null, "\t")}\n`,
		);
		console.error(`${svc.name}: ${payload.reason}`);
	};

	const restartService = (svc) => {
		const machine = tracked.get(svc.name).machine;
		console.log(
			`${svc.name} đã restart (lần ${machine.restarts})`,
		);
		const cmd = buildRestartCommand(svc);
		const child = spawn(
			cmd[0],
			cmd.slice(1),
			buildSpawnOptions(ROOT, {
				VITE_SERVER_URL: `http://localhost:${ports.api}`,
			}),
		);
		tracked.get(svc.name).child = child;
		const redact = createRedactor();
		const collect = (d) => {
			const t = tracked.get(svc.name);
			t.tail = redact(String(d));
		};
		child.stdout.on("data", collect);
		child.stderr.on("data", collect);
		child.on("exit", (code, signal) => {
			const t = tracked.get(svc.name);
			if (!t.machine.warming) return;
			console.error(
				`${svc.name} restart child thoát trong warming (code=${code} signal=${signal})\n--- tail ---\n${t.tail || "(trống)"}`,
			);
			t.machine.noteChildDiedDuringWarming();
			if (t.machine.unstable)
				writeFailMarker(svc, t.machine.lastReason).catch(() => {});
		});
	};

	for (const svc of services) {
		tracked.set(svc.name, {
			machine: createWatchdogState({
				kind: svc.kind,
				name: svc.name,
				restart: () => restartService(svc),
			}),
			tail: "",
			child: null,
		});
	}

	const probe = async (svc) => {
		try {
			const res = await fetch(svc.pollUrl, {
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
			if (res.ok) return { ok: true };
			if (res.status >= svc.deadStatus)
				return { ok: false, reason: "http", status: res.status };
			return { ok: true }; // status < deadStatus coi như sống (khớp playwright)
		} catch (err) {
			// AbortError = event-loop/proxy chậm (stall); network error khác = chết.
			const aborted =
				err?.name === "AbortError" ||
				err?.code === "ABORT_ERR" ||
				err?.cause?.name === "AbortError" ||
				err?.cause?.code === "ABORT_ERR";
			return aborted
				? { ok: false, reason: "stall" }
				: { ok: false, reason: "refused" };
		}
	};

	const heartbeatFile = path.join(TEST_RESULTS, "devserver-watchdog.heartbeat");
	let ticking = false;
	const timer = setInterval(() => {
		if (ticking) return;
		ticking = true;
		void (async () => {
			try {
				await writeFile(
					heartbeatFile,
					`${new Date().toISOString()} pid=${process.pid}\n`,
				);
				for (const svc of services) {
					const t = tracked.get(svc.name);
					t.machine.record(await probe(svc));
					if (t.machine.unstable && !markerWritten.has(svc.name)) {
						const reason = t.machine.lastReason;
						await writeFailMarker(svc, reason);
						if (svc.kind === "vite")
							console.error(
								`web bất ổn (${reason}) — ngừng restart, global-teardown sẽ fail run.`,
							);
					}
				}
			} catch (err) {
				console.error("poll loop lỗi:", err);
			} finally {
				ticking = false;
			}
		})();
	}, POLL_MS);

	const shutdown = (code) => {
		clearInterval(timer);
		for (const t of tracked.values())
			try {
				t.child?.kill("SIGTERM");
			} catch {
				/* gone */
			}
		process.exit(code);
	};
	process.on("SIGTERM", () => shutdown(143));
	process.on("SIGINT", () => shutdown(130));
	process.on("SIGHUP", () => shutdown(129));
	const crash = async (label, err) => {
		try {
			await mkdir(TEST_RESULTS, { recursive: true });
			await writeFile(
				path.join(TEST_RESULTS, "devserver-watchdog.fail.json"),
				`${JSON.stringify(
					{
						service: "watchdog",
						kind: "watchdog",
						reason: stripControlChars(
							`${label}: ${String(err?.stack ?? err)}`,
						).slice(0, 2_000),
						pid: process.pid,
						startedAt: runStartedAt,
					},
					null,
					"\t",
				)}\n`,
			);
		} catch {
			/* hết đường — chấp nhận */
		}
		process.exit(1);
	};
	// Chống chết im (SecH3/FailH3/AssumpF4): mọi uncaught → crash marker.
	process.on(
		"uncaughtException",
		(err) => void crash("uncaughtException", err),
	);
	process.on(
		"unhandledRejection",
		(err) => void crash("unhandledRejection", err),
	);
}

const isMain =
	process.argv[1] != null &&
	import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain)
	main().catch((err) => {
		console.error("fatal:", err);
		process.exit(2);
	});
