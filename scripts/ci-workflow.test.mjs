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
	// Contract locks flow-style branches lists; switching ci.yml to YAML block style requires updating this test.
	assert.match(
		yaml,
		/pull_request:\s*\n\s*branches:\s*\[main,\s*develop\]/,
		"pull_request must target main and develop (pre-merge gate)",
	);
	assert.match(
		yaml,
		/push:\s*\n\s*branches:\s*\[main,\s*develop\]/,
		"push must cover main and develop (post-merge convergence)",
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
	const checkScript = String(rootPkg.scripts?.check ?? "");
	assert.doesNotMatch(
		checkScript,
		/--write/,
		"root check must not mutate the tree",
	);
	assert.equal(
		checkScript,
		"biome check .",
		"root check must be a read-only biome check",
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

test("staging deploy workflow deploys only from the staging branch", () => {
	const stagingPath = join(repoRoot, ".github/workflows/deploy-staging.yml");
	assert.equal(
		existsSync(stagingPath),
		true,
		"missing .github/workflows/deploy-staging.yml (topology-drift tests read it)",
	);

	const yaml = readFileSync(stagingPath, "utf8");

	assert.match(
		yaml,
		/^\s*push:\s*\n\s*branches:\s*\[staging\]\s*$/m,
		"push trigger must cover exactly the dedicated staging branch (QA environment)",
	);
	assert.doesNotMatch(
		yaml,
		/branches:\s*\[[^\]]*\b(develop|main)\b/,
		"must not deploy staging on develop/main pushes (develop auto-deploy disabled 2026-09-22)",
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
	assert.match(
		yaml,
		/^\s*workflow_call:/m,
		"must be callable so deploy.yml can gate prod on it",
	);
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
		/^\s*- run: pnpm --filter e2e e2e --shard=\$\{\{ matrix\.shard \}\}\/(\d+)\s*$/m,
		"must run the e2e package as its own sharded step",
	);
	const shardList = yaml.match(/shard:\s*\[([^\]]*)\]/);
	assert.ok(shardList, "e2e job must declare a shard matrix");
	const shardTotal = yaml.match(/--shard=\$\{\{ matrix\.shard \}\}\/(\d+)/);
	assert.equal(
		shardList[1].split(",").length,
		Number(shardTotal?.[1]),
		"shard matrix size must equal the --shard total (a mismatch silently skips specs)",
	);
	assert.match(
		yaml,
		/fail-fast:\s*false/,
		"must run every shard to completion so one failure shows the full picture",
	);
	// Blocks secrets.X and secrets['X'] anywhere — including indirect forms
	// like ${{ fromJSON(secrets.X) }} that a ${{-anchored regex would miss.
	assert.doesNotMatch(
		yaml,
		/\bsecrets\s*[.[]/,
		"must not require GitHub secrets",
	);
});

test("prod deploy is gated on quality only (e2e runs locally before shipping)", () => {
	const deployPath = join(repoRoot, ".github/workflows/deploy.yml");
	const yaml = readFileSync(deployPath, "utf8");

	assert.doesNotMatch(
		yaml,
		/^ {2}e2e:/m,
		"deploy.yml must not declare an e2e job (e2e runs locally before ak-ship)",
	);
	assert.doesNotMatch(
		yaml,
		/workflows\/e2e\.yml/,
		"deploy.yml must not call the reusable e2e workflow",
	);

	const needs = yaml.match(/^ {2}deploy:\n {4}needs: \[([^\]]*)\]/m);
	assert.ok(needs, "deploy job must declare needs");
	const deps = needs[1].split(",").map((d) => d.trim());
	assert.deepEqual(deps, ["quality"], "deploy must need exactly quality");
});
