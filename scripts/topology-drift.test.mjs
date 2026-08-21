import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The infra and auth packages each own an AUTH_MOUNT_PATH constant (a
// cross-package import would create a workspace dependency cycle), so drift
// between them — and against the runbook — is caught here at the text level.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const mountPath = (source) =>
	source.match(/AUTH_MOUNT_PATH\s*=\s*"([^"]+)"/)?.[1];

test("auth mount path stays identical across infra and auth packages", () => {
	const infra = mountPath(read("../packages/infra/src/topology.ts"));
	const auth = mountPath(read("../packages/auth/src/topology.ts"));
	assert.ok(infra, "AUTH_MOUNT_PATH found in packages/infra/src/topology.ts");
	assert.ok(auth, "AUTH_MOUNT_PATH found in packages/auth/src/topology.ts");
	assert.equal(infra, auth);
});

test("runbook google redirect URI matches the mount path", () => {
	const mount = mountPath(read("../packages/infra/src/topology.ts"));
	const runbook = read("../docs/production-release-runbook.md");
	assert.ok(
		runbook.includes(`https://api.<domain>${mount}/callback/google`),
		"runbook documents the exact google redirect URI",
	);
});

test("dev CORS default in alchemy.run.ts matches the web dev port", () => {
	const vite = read("../apps/web/vite.config.ts");
	const webPort = vite.match(/port:\s*(\d+)/)?.[1];
	assert.ok(webPort, "dev port found in apps/web/vite.config.ts");
	const run = read("../packages/infra/alchemy.run.ts");
	const devDefault = run.match(
		/withDefault\("(http:\/\/localhost:\d+)"\)/,
	)?.[1];
	assert.ok(
		devDefault,
		"dev CORS default found in packages/infra/alchemy.run.ts",
	);
	assert.equal(devDefault, `http://localhost:${webPort}`);
});

test("runbook never persists CORS_ORIGIN or APP_DOMAIN into .env", () => {
	const runbook = read("../docs/production-release-runbook.md");
	assert.ok(
		!runbook.includes("CORS_ORIGIN in .env"),
		"runbook must direct staging CORS_ORIGIN inline, not into .env (leftover values caused the 2026-08-20 NO-GO)",
	);
	assert.ok(
		!runbook.includes(".env: APP_DOMAIN"),
		"runbook deploy must use inline APP_DOMAIN, not a persisted .env value",
	);
});

test(".env.example keeps CORS_ORIGIN commented out", () => {
	const example = read("../packages/infra/.env.example");
	assert.ok(
		!/^CORS_ORIGIN=/m.test(example),
		"CORS_ORIGIN must stay commented in .env.example — dev defaults in code, staging passes it inline",
	);
});
