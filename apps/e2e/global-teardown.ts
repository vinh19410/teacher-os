// Global teardown fail-loud cho hạ tầng dev server (plan 261021-2125-402,
// issue #402). Playwright chạy hook này TRƯỚC webServer plugin teardowns
// (runner/index.js:5835 unshift đảo ngược) nên các server còn sống tại thời
// điểm đọc — dùng làm probe cuối. Throw ở đây = run FAILED kể cả khi mọi test
// pass. Resolve mọi path từ import.meta.url — CẤM process.cwd() (global hook
// không chdir, runner/index.js:2687-2689).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildServices, parsePorts } from "./devserver-services.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_RESULTS = path.join(HERE, "test-results");
const HEARTBEAT_STALE_MS = 30_000;
const PROBE_TIMEOUT_MS = 3_000;

const stripControlChars = (s: string): string =>
	Array.from(s)
		.filter((ch) => {
			const c = ch.codePointAt(0);
			return c !== undefined && c > 31 && c !== 127;
		})
		.join("");

// Node fetch (undici) mặc định KHÔNG honor HTTP(S)_PROXY (chỉ khi
// NODE_USE_ENV_PROXY=1) → probe localhost không lệch proxy. Nếu repo tương
// lai bật env-proxy, phải thêm dispatcher bypass cho localhost ở đây.
const isDead = async (
	pollUrl: string,
	deadStatus: number,
): Promise<boolean> => {
	try {
		const res = await fetch(pollUrl, {
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
		return res.status >= deadStatus;
	} catch {
		return true; // network error = chết
	}
};

export default async function globalTeardown(): Promise<void> {
	const problems: string[] = [];

	// 1. Marker do watchdog ghi giữa run (api chết, vite bất ổn, watchdog crash)
	let entries: string[] = [];
	try {
		entries = readdirSync(TEST_RESULTS);
	} catch {
		return; // run sạch không tạo test-results — không có gì để báo
	}
	for (const file of entries.filter((f) =>
		/^devserver-.+\.fail\.json$/.test(f),
	)) {
		try {
			const marker = JSON.parse(
				readFileSync(path.join(TEST_RESULTS, file), "utf8"),
			) as { service?: string; reason?: string; originalLogNote?: string };
			const reason = stripControlChars(String(marker.reason ?? "")).slice(
				0,
				2_048,
			);
			const note = stripControlChars(
				String(marker.originalLogNote ?? ""),
			).slice(0, 2_048);
			problems.push(`${marker.service ?? file}: ${reason}. ${note}`);
		} catch (err) {
			problems.push(
				`${file}: marker hỏng (${stripControlChars(String(err)).slice(0, 2_048)})`,
			);
		}
	}

	// 2. Heartbeat stale = watchdog đã chết giữa run mà không kịp ghi marker
	const heartbeat = path.join(TEST_RESULTS, "devserver-watchdog.heartbeat");
	if (existsSync(heartbeat)) {
		const ageMs = Date.now() - statSync(heartbeat).mtimeMs;
		if (ageMs > HEARTBEAT_STALE_MS)
			problems.push(
				`watchdog đã chết giữa run (heartbeat trễ ${Math.round(ageMs / 1000)}s)`,
			);
	}

	// 3. Probe cuối 3 service — bắt death-window ở giây cuối mà marker bỏ lỡ
	if (problems.length === 0) {
		const ports = parsePorts({
			E2E_API_PORT: process.env.E2E_API_PORT ?? "8000",
			E2E_WEB_PORT: process.env.E2E_WEB_PORT ?? "8001",
			E2E_STUDENT_PORT: process.env.E2E_STUDENT_PORT ?? "8003",
			E2E_ADMIN_PORT: process.env.E2E_ADMIN_PORT ?? "8104",
		});
		for (const svc of buildServices(ports)) {
			if (await isDead(svc.pollUrl, svc.deadStatus))
				problems.push(`${svc.name} không trả lời probe cuối (${svc.pollUrl})`);
		}
	}

	if (problems.length > 0)
		throw new Error(
			`[dev-watchdog] hạ tầng dev server bất ổn trong run: ${problems.join(" | ")}`,
		);
}
