import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = join(repoRoot, ".github/workflows/ci.yml");

test("ci workflow exists and matches the quality-gate contract", () => {
	assert.equal(
		existsSync(workflowPath),
		true,
		"missing .github/workflows/ci.yml",
	);

	const yaml = readFileSync(workflowPath, "utf8");

	assert.match(yaml, /pull_request:/, "must trigger on pull_request");
	assert.match(yaml, /push:/, "must trigger on push");
	assert.match(yaml, /\bmain\b/, "must include main");
	assert.doesNotMatch(
		yaml,
		/\bdevelop\b/,
		"must not trigger on develop (runs on main only)",
	);
	assert.match(yaml, /pnpm exec biome check \./, "must run read-only biome");
	assert.match(yaml, /pnpm check-types/, "must run check-types");
	assert.match(yaml, /pnpm build/, "must run build");
	assert.doesNotMatch(
		yaml,
		/biome check --write/,
		"must not mutate the tree with biome --write",
	);
	assert.doesNotMatch(
		yaml,
		/\$\{\{\s*secrets\./,
		"must not require GitHub secrets",
	);
	assert.match(yaml, /VITE_SERVER_URL/, "must set dummy VITE_SERVER_URL");
	assert.match(
		yaml,
		/^\s+- run: pnpm test\s*$/m,
		"must run pnpm test as its own step",
	);

	const rootPkg = JSON.parse(
		readFileSync(join(repoRoot, "package.json"), "utf8"),
	);
	assert.match(
		String(rootPkg.scripts?.test ?? ""),
		/turbo run test/,
		"root test must invoke turbo run test",
	);
	assert.match(
		String(rootPkg.scripts?.test ?? ""),
		/test:ci-workflow/,
		"root test must invoke the CI contract",
	);

	const turbo = JSON.parse(readFileSync(join(repoRoot, "turbo.json"), "utf8"));
	assert.equal(
		typeof turbo.tasks?.test,
		"object",
		"turbo.json must declare a test task",
	);

	const webPkg = JSON.parse(
		readFileSync(join(repoRoot, "apps/web/package.json"), "utf8"),
	);
	assert.equal(
		webPkg.scripts?.test,
		"vitest run",
		"web test script must be vitest run",
	);
});

test("staging deploy workflow is manual-only (no develop push trigger)", () => {
	const stagingPath = join(repoRoot, ".github/workflows/deploy-staging.yml");
	assert.equal(
		existsSync(stagingPath),
		true,
		"missing .github/workflows/deploy-staging.yml (topology-drift tests read it)",
	);

	const yaml = readFileSync(stagingPath, "utf8");

	assert.doesNotMatch(
		yaml,
		/^\s*push:/m,
		"must not trigger on push (staging auto-deploy disabled 2026-09-22)",
	);
	assert.match(
		yaml,
		/workflow_dispatch/,
		"must stay runnable manually (staging migration rehearsal)",
	);
});

test("e2e workflow exists and matches the e2e contract", () => {
	const e2ePath = join(repoRoot, ".github/workflows/e2e.yml");
	assert.equal(existsSync(e2ePath), true, "missing .github/workflows/e2e.yml");

	const yaml = readFileSync(e2ePath, "utf8");

	assert.match(yaml, /pull_request:/, "must trigger on pull_request");
	assert.doesNotMatch(
		yaml,
		/pull_request_target/,
		"must never use pull_request_target (fork PR escalation)",
	);
	assert.match(yaml, /push:/, "must trigger on push");
	assert.match(yaml, /\bmain\b/, "must include main");
	assert.doesNotMatch(
		yaml,
		/\bdevelop\b/,
		"must not trigger on develop (runs on main only)",
	);
	assert.match(yaml, /contents:\s*read/, "must keep read-only permissions");
	assert.match(yaml, /playwright install/, "must install playwright browsers");
	assert.match(
		yaml,
		/^\s*- run: pnpm --filter e2e e2e\s*$/m,
		"must run the e2e package as its own step",
	);
	// Blocks secrets.X and secrets['X'] anywhere — including indirect forms
	// like ${{ fromJSON(secrets.X) }} that a ${{-anchored regex would miss.
	assert.doesNotMatch(
		yaml,
		/\bsecrets\s*[.[]/,
		"must not require GitHub secrets",
	);
});
