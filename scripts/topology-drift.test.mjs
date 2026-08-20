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
