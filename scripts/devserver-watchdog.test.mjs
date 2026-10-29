import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const e2e = join(here, "..", "apps", "e2e");

const services = await import(
	new URL(`file://${join(e2e, "devserver-services.mjs")}`).href
);
const watchdog = await import(
	new URL(`file://${join(e2e, "devserver-watchdog.mjs")}`).href
);

const PORTS = { api: 8100, web: 8101, student: 8103, admin: 8104 };
const ok = () => ({ ok: true });
const refused = () => ({ ok: false, reason: "refused" });
const stall = () => ({ ok: false, reason: "stall" });
const httpDead = (status) => ({ ok: false, reason: "http", status });

/** Bơm chuỗi poll vào state machine theo đồng hồ chung (mỗi poll cách gapMs). */
function pump(state, clock, results, gapMs = 3_100) {
	for (const r of results) {
		clock.t += gapMs;
		state.record(r);
	}
}

const makeState = (kind, name, calls = []) =>
	watchdog.createWatchdogState({
		kind,
		name,
		now: () => clock.t,
		restart: () => calls.push(1),
	});
const clock = { t: 0 };

test("buildServices: đủ 4 service với url poll đúng, student/admin CÓ url", () => {
	const list = services.buildServices(PORTS);
	assert.deepEqual(
		list.map((s) => s.name),
		["api", "web", "student", "admin"],
	);
	const byName = Object.fromEntries(list.map((s) => [s.name, s]));
	assert.equal(byName.api.pollUrl, "http://localhost:8100/readyz");
	assert.equal(byName.web.pollUrl, "http://localhost:8101/");
	assert.equal(
		byName.student.pollUrl,
		"http://localhost:8103/login",
		"student phải có url poll (red-team FailH1)",
	);
	assert.equal(
		byName.admin.pollUrl,
		"http://localhost:8104/login",
		"admin phải có url poll (plan #413 phase 5)",
	);
	assert.equal(byName.api.deadStatus, 500);
	assert.equal(byName.web.deadStatus, 404);
	assert.equal(byName.student.deadStatus, 404);
	assert.equal(byName.admin.deadStatus, 404);
});

test("buildRestartCommand/buildSpawnOptions: pnpm trực tiếp, không shell, không detached", () => {
	const byName = Object.fromEntries(
		services.buildServices(PORTS).map((s) => [s.name, s]),
	);
	const cmd = services.buildRestartCommand(byName.web);
	assert.deepEqual(cmd, [
		"pnpm",
		"--filter",
		"web",
		"exec",
		"vite",
		"--port",
		"8101",
		"--strictPort",
	]);
	assert.equal(
		cmd.some((a) => a === "bash" || a === "-lc" || a === "-c"),
		false,
		"không được có shell trong command (SecM4)",
	);
	const opts = services.buildSpawnOptions("/tmp/root", {
		VITE_SERVER_URL: "http://localhost:8100",
	});
	assert.equal(opts.cwd, "/tmp/root");
	assert.equal("detached" in opts, false, "restart child KHÔNG detached");
	assert.equal("shell" in opts, false, "KHÔNG shell trong spawn options");
	assert.equal(opts.stdio?.[0], "ignore");
	assert.equal(opts.env?.VITE_SERVER_URL, "http://localhost:8100");
});

test("parsePorts: hợp lệ → số; sai/thiếu → throw message rõ", () => {
	assert.deepEqual(
		services.parsePorts({
			E2E_API_PORT: "8100",
			E2E_WEB_PORT: "8101",
			E2E_STUDENT_PORT: "8103",
			E2E_ADMIN_PORT: "8104",
		}),
		PORTS,
	);
	for (const bad of [
		{},
		{
			E2E_API_PORT: "8100",
			E2E_WEB_PORT: "",
			E2E_STUDENT_PORT: "8103",
			E2E_ADMIN_PORT: "8104",
		},
		{
			E2E_API_PORT: "8100",
			E2E_WEB_PORT: "abc",
			E2E_STUDENT_PORT: "8103",
			E2E_ADMIN_PORT: "8104",
		},
		{
			E2E_API_PORT: "8100",
			E2E_WEB_PORT: "99999",
			E2E_STUDENT_PORT: "8103",
			E2E_ADMIN_PORT: "8104",
		},
		{
			E2E_API_PORT: "8100",
			E2E_WEB_PORT: "8101 --host 0.0.0.0",
			E2E_STUDENT_PORT: "8103",
			E2E_ADMIN_PORT: "8104",
		},
	]) {
		assert.throws(
			() => services.parsePorts(bad),
			/port env không hợp lệ/,
			`parsePorts phải throw với ${JSON.stringify(bad)}`,
		);
	}
});

test("state machine Case A: vite refused 3 lần liên tiếp → restart 1 lần", () => {
	const calls = [];
	clock.t = 0;
	const st = makeState("vite", "web", calls);
	clock.t = 99_999; // qua warming ban đầu (90s) → armed
	pump(st, clock, [refused(), refused(), refused()]);
	assert.equal(st.restarts, 1);
	assert.equal(calls.length, 1);
	assert.equal(st.unstable, false);
});

test("state machine Case B: chết lần 2 sau warming grace → KHÔNG restart thêm, unstable", () => {
	const calls = [];
	clock.t = 0;
	const st = makeState("vite", "web", calls);
	clock.t = 99_999;
	pump(st, clock, [refused(), refused(), refused()]);
	assert.equal(st.restarts, 1);
	assert.equal(st.warming, true);
	clock.t = st.warmingUntil + 1; // grace hết mà chưa OK → resume counting
	pump(st, clock, [refused(), refused(), refused()]);
	assert.equal(st.unstable, true, "vượt warming grace mà vẫn chết → unstable");
	assert.equal(st.restarts, 1, "tối đa 1 restart/vite");
	assert.equal(calls.length, 1);
});

test("state machine Case B2: restart thành công (poll OK) rồi chết lại → vẫn tối đa 1 lần", () => {
	const calls = [];
	clock.t = 0;
	const st = makeState("vite", "web", calls);
	clock.t = 99_999;
	pump(st, clock, [refused(), refused(), refused()]);
	pump(st, clock, [ok()]);
	pump(st, clock, [refused(), refused(), refused()]);
	assert.equal(st.restarts, 1);
	assert.equal(st.unstable, true);
});

test("state machine Case C: api chết → KHÔNG restart, unstable", () => {
	const calls = [];
	clock.t = 0;
	const st = makeState("api", "api", calls);
	clock.t = 99_999;
	pump(st, clock, [refused(), refused(), refused()]);
	assert.equal(st.unstable, true);
	assert.equal(st.restarts, 0);
	assert.equal(calls.length, 0);
});

test("state machine Case D: stall debounce — 2 stall rồi OK → không restart", () => {
	const calls = [];
	clock.t = 0;
	const st = makeState("vite", "web", calls);
	pump(st, clock, [ok(), stall(), stall(), ok(), ok()]);
	assert.equal(st.restarts, 0);
	assert.equal(st.unstable, false);
});

test("state machine Case E: warming — fail trong window boot KHÔNG đốt ngân sách; có OK mới armed", () => {
	const calls = [];
	clock.t = 0;
	const st = makeState("vite", "web", calls);
	clock.t = 99_999;
	pump(st, clock, [refused(), refused(), refused()]);
	assert.equal(st.restarts, 1);
	assert.equal(st.warming, true);
	pump(st, clock, [refused(), refused(), refused()]); // trong grace 90s
	assert.equal(st.restarts, 1, "warming không được restart thêm");
	assert.equal(st.unstable, false, "warming không được bắn marker");
	pump(st, clock, [ok()]);
	assert.equal(st.warming, false);
	assert.equal(st.unstable, false);
});

test("state machine Case E2: restart-child chết trong warming → unstable ngay (không mù 99s)", () => {
	const calls = [];
	clock.t = 0;
	const st = makeState("vite", "web", calls);
	clock.t = 99_999;
	pump(st, clock, [refused(), refused(), refused()]);
	assert.equal(st.restarts, 1);
	assert.equal(st.warming, true);
	st.noteChildDiedDuringWarming();
	assert.equal(
		st.unstable,
		true,
		"restart-child chết yểu trong warming → unstable ngay",
	);
});

test("state machine Case F: stall sau armed KHÔNG đốt ngân sách restart", () => {
	const calls = [];
	clock.t = 0;
	const st = makeState("vite", "web", calls);
	pump(st, clock, [ok()]);
	pump(st, clock, [stall(), stall(), stall(), stall()]);
	assert.equal(st.restarts, 0, "stall (timeout) không được coi là chết");
	assert.equal(st.unstable, false);
});

test("state machine: http status ≥ deadStatus tính là chết (readyz 503 = api hỏng)", () => {
	clock.t = 0;
	const st = makeState("api", "api");
	clock.t = 99_999;
	pump(st, clock, [httpDead(503), httpDead(503), httpDead(503)]);
	assert.equal(st.unstable, true);
	const st2 = makeState("vite", "web");
	// 200..403 vẫn coi là sống (khớp semantics playwright <404)
	pump(st2, clock, [ok(), ok(), ok()]);
	assert.equal(st2.unstable, false);
	assert.equal(st2.restarts, 0);
});

test("redact: token cắt ngang biên chunk vẫn bị che (rawTail carry-over)", () => {
	const redact = services.createRedactor();
	const secret = "s3cr3tTOKENvalue9";
	// Case 1: prefix "token=" cắt ngang biên chunk ("?tok" | "en=SECRET…")
	const out1 = redact("GET /verify-email?tok");
	const out2 = redact(`en=${secret} HTTP/1.1`);
	assert.doesNotMatch(
		out1 + out2,
		new RegExp(secret),
		"giá trị token không được lọt qua biên chunk",
	);
	assert.match(
		out2,
		/token=\[redacted\]/,
		"sau nối rawTail, token= phải được redact",
	);
	// Case 2: giá trị token cắt giữa chừng
	const r2 = services.createRedactor();
	const o1 = r2(`GET /pay?a=1&token=${secret.slice(0, 8)}`);
	const o2 = r2(secret.slice(8));
	assert.doesNotMatch(o1 + o2, new RegExp(secret));
	// Case 3: tail >4000 bị cắt — token nằm trong phần bị slice vẫn phải redact (double-pass)
	const r3 = services.createRedactor();
	const long = `${"x".repeat(4_050)}&token=${secret}`;
	assert.doesNotMatch(r3(long), new RegExp(secret));
});
