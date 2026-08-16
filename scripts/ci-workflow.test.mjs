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
	assert.match(yaml, /\bdevelop\b/, "must include develop");
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
});
