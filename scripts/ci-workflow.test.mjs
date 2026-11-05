import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ciPath = join(repoRoot, ".github/workflows/ci.yml");
const qualityPath = join(repoRoot, ".github/workflows/quality.yml");
const setupActionPath = join(
	repoRoot,
	".github/actions/setup-workspace/action.yml",
);
const deployPath = join(repoRoot, ".github/workflows/deploy.yml");
const stagingPath = join(repoRoot, ".github/workflows/deploy-staging.yml");
const alchemyPath = join(repoRoot, "packages/infra/alchemy.run.ts");
function stripInlineCommentOutsideQuotes(line) {
	let quote = null;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (quote) {
			if (ch === "\\" && quote === '"') {
				i++;
			} else if (ch === quote) {
				quote = null;
			}
		} else if (ch === '"' || ch === "'") {
			quote = ch;
		} else if (ch === "#" && i > 0 && /\s/.test(line[i - 1])) {
			return line.slice(0, i).trimEnd();
		}
	}
	return line;
}

function stripComments(yaml) {
	return yaml
		.split("\n")
		.filter((line) => !/^\s*#/.test(line))
		.map(stripInlineCommentOutsideQuotes)
		.join("\n");
}

function extractJobBlock(yaml, jobName) {
	const lines = yaml.split("\n");
	let inJobs = false;
	let start = -1;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^jobs:\s*$/.test(line)) {
			inJobs = true;
			continue;
		}
		if (!inJobs) continue;
		if (/^\S/.test(line) && !/^\s*#/.test(line)) {
			return start === -1 ? null : lines.slice(start, i).join("\n");
		}
		if (line === `  ${jobName}:` || line.startsWith(`  ${jobName}: `)) {
			start = i;
			continue;
		}
		if (start !== -1 && /^ {2}[a-zA-Z0-9_-]+:/.test(line)) {
			return lines.slice(start, i).join("\n");
		}
	}
	return start === -1 ? null : lines.slice(start).join("\n");
}

function splitJobSteps(jobBlock) {
	const stepsIndex = jobBlock.search(/^ {4}steps:[ \t]*$/m);
	if (stepsIndex === -1) return [];
	const stepsBody = jobBlock
		.slice(stepsIndex)
		.replace(/^ {4}steps:[ \t]*\n?/, "");
	return stepsBody
		.split(/(?=^ {6}- )/m)
		.map((s) => s.trimEnd())
		.filter((s) => s.startsWith("      - "));
}

function assertReadOnlyWorkflowPermissions(code, workflowLabel) {
	assert.equal(
		(code.match(/\bpermissions:/g) ?? []).length,
		1,
		`${workflowLabel} must declare permissions exactly once at top-level (no job-level escalation)`,
	);
	assert.match(
		code,
		/^permissions:[ \t]*\n {2}contents:[ \t]*read[ \t]*(?:\n(?![ \t])|$)/m,
		`${workflowLabel} must grant only contents: read`,
	);
}

test("workflow YAML helpers preserve quoted # tokens and slice trailing top-level blocks", () => {
	const stripped = stripComments(
		`  - run: echo "step #1" && echo ${"$"}{{ secrets.LEAK }} # trailing comment`,
	);
	assert.match(
		stripped,
		/\bsecrets\.LEAK\b/,
		"quoted # must never hide trailing secrets references",
	);
	assert.doesNotMatch(stripped, /trailing comment/);

	const sample = [
		"jobs:",
		"  first:",
		"    runs-on: ubuntu-latest",
		"  last:",
		"    runs-on: ubuntu-latest",
		"extra_top_level:",
		"  foo: bar",
	].join("\n");
	assert.equal(
		extractJobBlock(sample, "last"),
		"  last:\n    runs-on: ubuntu-latest",
	);
});

test("setup-workspace composite action installs locked workspace without secrets", () => {
	assert.equal(
		existsSync(setupActionPath),
		true,
		"missing .github/actions/setup-workspace/action.yml",
	);
	const raw = readFileSync(setupActionPath, "utf8");
	const code = stripComments(raw);

	assert.match(
		code,
		/using:\s*["']?composite["']?/,
		"must be composite action",
	);
	assert.match(code, /pnpm\/action-setup@v6/, "must setup pnpm");
	assert.match(code, /version:\s*10\.33\.1/, "must pin pnpm 10.33.1");
	assert.match(code, /actions\/setup-node@v7/, "must setup node");
	assert.match(code, /node-version:\s*24/, "must pin node 24");
	assert.match(code, /cache:\s*pnpm/, "must enable pnpm store cache");
	assert.match(
		code,
		/pnpm install --frozen-lockfile/,
		"must run frozen-lockfile install",
	);
	assert.doesNotMatch(
		code,
		/\bsecrets\b/,
		"setup-workspace action must never reference secrets",
	);
	assert.doesNotMatch(
		code,
		/GITHUB_ENV/,
		"setup-workspace action must not mutate GITHUB_ENV",
	);
});

test("reusable quality workflow defines the 4-job parallel quality gate without secrets or concurrency", () => {
	assert.equal(
		existsSync(qualityPath),
		true,
		"missing .github/workflows/quality.yml",
	);
	const raw = readFileSync(qualityPath, "utf8");
	const code = stripComments(raw);

	assert.match(code, /^\s*workflow_call:/m, "must trigger on workflow_call");
	assert.match(
		code,
		/^([ \t]*)turbo-cache:[ \t]*\n(?:\1[ \t]+[^\n]*\n)*?\1[ \t]+type:[ \t]*boolean[ \t]*\n(?:\1[ \t]+[^\n]*\n)*?\1[ \t]+default:[ \t]*false\b/m,
		"must declare boolean input turbo-cache (type: boolean, default: false) within its own block",
	);
	assertReadOnlyWorkflowPermissions(code, "quality.yml");
	assert.doesNotMatch(
		code,
		/^concurrency:/m,
		"quality.yml must not define concurrency (caller governs cancellation so deploys never cancel)",
	);
	assert.doesNotMatch(
		code,
		/\bsecrets\b/,
		"quality.yml must never reference or accept secrets",
	);
	assert.doesNotMatch(
		code,
		/continue-on-error/,
		"quality.yml must never use continue-on-error",
	);
	assert.doesNotMatch(
		code,
		/\b(always|failure)\s*\(|!\s*cancelled\s*\(/,
		"quality.yml must not override failure propagation with always()/failure()/!cancelled()",
	);
	assert.match(code, /VITE_SERVER_URL/, "must set dummy VITE_SERVER_URL");
	assert.match(
		code,
		/pnpm exec biome check \./,
		"must run read-only biome check",
	);
	assert.doesNotMatch(
		code,
		/biome check --write/,
		"must not mutate the tree with biome --write",
	);
	assert.match(code, /pnpm check-types/, "must run pnpm check-types");
	assert.match(code, /pnpm build/, "must run pnpm build");

	const headerBeforeJobs = code.split(/^jobs:\s*$/m)[0] ?? "";
	assert.doesNotMatch(
		headerBeforeJobs,
		/VITEST_SKIP_SLOW/,
		"VITEST_SKIP_SLOW must never be set at top-level env (would skip ledger everywhere)",
	);

	for (const jobName of [
		"checks",
		"test-web",
		"test-server",
		"test-workspace",
	]) {
		const block = extractJobBlock(code, jobName);
		assert.ok(block, `quality.yml must declare job ${jobName}`);
		assert.doesNotMatch(
			block,
			/^ {4}if:/m,
			`job ${jobName} must never declare job-level if: (skipped jobs satisfy needs: [quality])`,
		);
		assert.match(
			block,
			/uses:\s*\.\/\.github\/actions\/setup-workspace/,
			`job ${jobName} must use setup-workspace composite action`,
		);

		const steps = splitJobSteps(block);
		const restoreStep = steps.find((s) =>
			/uses:\s*actions\/cache\/restore@v6\b/.test(s),
		);
		assert.ok(
			restoreStep,
			`job ${jobName} must have an actions/cache/restore@v6 step`,
		);
		assert.match(
			restoreStep,
			/^\s*if:\s*inputs\.turbo-cache\s*&&\s*github\.event_name\s*!=\s*'push'\s*$/m,
			`job ${jobName} restore step must be gated on inputs.turbo-cache && github.event_name != 'push'`,
		);
		assert.match(
			restoreStep,
			new RegExp(`^\\s*key:\\s*turbo-${jobName}-`, "m"),
			`job ${jobName} restore step must namespace key with turbo-${jobName}-`,
		);

		const saveStep = steps.find((s) => /uses:\s*actions\/cache@v6\b/.test(s));
		assert.ok(saveStep, `job ${jobName} must have an actions/cache@v6 step`);
		assert.match(
			saveStep,
			/^\s*if:\s*inputs\.turbo-cache\s*&&\s*github\.event_name\s*==\s*'push'\s*$/m,
			`job ${jobName} cache save step must be gated on inputs.turbo-cache && github.event_name == 'push'`,
		);
		assert.match(
			saveStep,
			new RegExp(`^\\s*key:\\s*turbo-${jobName}-`, "m"),
			`job ${jobName} save step must namespace key with turbo-${jobName}-`,
		);
	}

	const webSteps = splitJobSteps(extractJobBlock(code, "test-web"));
	const webRunStep = webSteps.find((s) => /turbo run test/.test(s));
	assert.ok(webRunStep, "test-web must run turbo run test");
	assert.deepEqual(
		[...webRunStep.matchAll(/--filter=(\S+)/g)].map((m) => m[1]),
		["web"],
		"test-web must filter exclusively to web",
	);

	const serverSteps = splitJobSteps(extractJobBlock(code, "test-server"));
	const serverRunStep = serverSteps.find((s) => /turbo run test/.test(s));
	assert.ok(serverRunStep, "test-server must run turbo run test");
	assert.deepEqual(
		[...serverRunStep.matchAll(/--filter=(\S+)/g)].map((m) => m[1]),
		["server"],
		"test-server must filter exclusively to server",
	);
	assert.match(
		serverRunStep,
		/^\s*VITEST_SKIP_SLOW:\s*["']1["']\s*$/m,
		"test-server must set VITEST_SKIP_SLOW=1 on the exact turbo run test step",
	);

	const workspaceBlock = extractJobBlock(code, "test-workspace");
	const workspaceSteps = splitJobSteps(workspaceBlock);
	const workspaceRunStep = workspaceSteps.find((s) =>
		/turbo run test\b/.test(s),
	);
	assert.ok(workspaceRunStep, "test-workspace must run turbo run test");
	assert.deepEqual(
		[...workspaceRunStep.matchAll(/--filter=(\S+)/g)].map((m) => m[1]).sort(),
		["!server", "!web"],
		"test-workspace turbo run test must exclude only web and server so every other workspace package runs",
	);
	const ledgerRunStep = workspaceSteps.find((s) =>
		/turbo run test:ledger\b/.test(s),
	);
	assert.ok(
		ledgerRunStep,
		"test-workspace must run server#test:ledger so tuition ledger invariants stay gated",
	);
	assert.deepEqual(
		[...ledgerRunStep.matchAll(/--filter=(\S+)/g)].map((m) => m[1]),
		["server"],
		"test:ledger step must target server",
	);
	assert.doesNotMatch(
		workspaceBlock,
		/VITEST_SKIP_SLOW/,
		"test-workspace must never set VITEST_SKIP_SLOW (would skip ledger-invariants)",
	);

	const rootPkg = JSON.parse(
		readFileSync(join(repoRoot, "package.json"), "utf8"),
	);
	const rootTestScript = String(rootPkg.scripts?.test ?? "");
	assert.match(
		rootTestScript,
		/turbo run test/,
		"root test must invoke turbo run test",
	);
	assert.match(
		rootTestScript,
		/test:ci-workflow/,
		"root test must invoke the CI contract",
	);
	const rootSubTests = [
		...rootTestScript.matchAll(/\bpnpm\s+(test:[a-zA-Z0-9:-]+)/g),
	].map((m) => m[1]);
	assert.ok(
		rootSubTests.length >= 4,
		"expected at least 4 root contract test scripts in package.json",
	);
	for (const sub of rootSubTests) {
		assert.match(
			workspaceBlock,
			new RegExp(`\\bpnpm\\s+(?:run\\s+)?${sub.replace(/[-:]/g, "\\$&")}\\b`),
			`test-workspace must run root contract script ${sub}`,
		);
	}

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
	assert.deepEqual(
		turbo.tasks?.transit?.dependsOn,
		["^transit"],
		"turbo.json must declare transit: { dependsOn: ['^transit'] } for parallel test hashing",
	);
	assert.deepEqual(
		turbo.tasks?.test?.dependsOn,
		["transit"],
		"turbo.json test must depend on transit (prevents e2e->server#test duplicate 97-file execution while keeping upstream hash invalidation)",
	);
	assert.deepEqual(
		turbo.tasks?.["test:ledger"]?.dependsOn,
		["transit"],
		"turbo.json test:ledger must depend on transit",
	);
	assert.ok(
		Array.isArray(turbo.tasks?.test?.env) &&
			turbo.tasks.test.env.includes("VITEST_SKIP_SLOW") &&
			turbo.tasks.test.env.includes("VERIFY_DEPTH"),
		"turbo.json tasks.test.env must declare VITEST_SKIP_SLOW and VERIFY_DEPTH (strict env mode)",
	);
	assert.ok(
		!turbo.tasks?.test?.passThroughEnv?.includes("VITEST_SKIP_SLOW"),
		"VITEST_SKIP_SLOW must never be in passThroughEnv (would poison full-run cache)",
	);
	assert.ok(
		Array.isArray(turbo.tasks?.["test:ledger"]?.env) &&
			turbo.tasks["test:ledger"].env.includes("VITEST_SKIP_SLOW") &&
			turbo.tasks["test:ledger"].env.includes("VERIFY_DEPTH"),
		"turbo.json tasks['test:ledger'].env must declare VITEST_SKIP_SLOW and VERIFY_DEPTH",
	);
	assert.ok(
		!turbo.tasks?.["test:ledger"]?.passThroughEnv?.includes("VITEST_SKIP_SLOW"),
		"VITEST_SKIP_SLOW must never be in test:ledger passThroughEnv",
	);

	const serverTurboPath = join(repoRoot, "apps/server/turbo.json");
	assert.equal(
		existsSync(serverTurboPath),
		true,
		"missing apps/server/turbo.json for cross-package test inputs",
	);
	const serverTurbo = JSON.parse(readFileSync(serverTurboPath, "utf8"));
	assert.deepEqual(
		serverTurbo.tasks?.test?.inputs,
		[
			"$TURBO_DEFAULT$",
			".env*",
			"../../apps/profile/public/**",
			"../../apps/web/public/placement-seed/**",
			"../../apps/e2e/fixtures/exam-import/**",
		],
		"apps/server/turbo.json must preserve $TURBO_DEFAULT$, .env*, and all 3 cross-package test input globs",
	);

	for (const app of ["web", "student", "admin"]) {
		const appPkg = JSON.parse(
			readFileSync(join(repoRoot, `apps/${app}/package.json`), "utf8"),
		);
		if (app === "web") {
			assert.equal(
				appPkg.scripts?.test,
				"vitest run",
				"web test script must be vitest run",
			);
		}
		assert.equal(
			appPkg.scripts?.["check-types"],
			"tsc --noEmit",
			`${app} check-types must run tsc --noEmit (vite build runs once via turbo dependsOn)`,
		);
		const appTurboPath = join(repoRoot, `apps/${app}/turbo.json`);
		assert.equal(
			existsSync(appTurboPath),
			true,
			`missing apps/${app}/turbo.json`,
		);
		const appTurbo = JSON.parse(readFileSync(appTurboPath, "utf8"));
		assert.deepEqual(
			appTurbo.tasks?.build?.outputs,
			["dist/**", "src/routeTree.gen.ts"],
			`apps/${app}/turbo.json build.outputs must cache both dist/** and src/routeTree.gen.ts`,
		);
		assert.deepEqual(
			appTurbo.tasks?.["check-types"]?.dependsOn,
			["$TURBO_EXTENDS$", "build"],
			`apps/${app}/turbo.json check-types.dependsOn must extend ^check-types via $TURBO_EXTENDS$ and depend on build`,
		);
	}
});

test("ci workflow triggers on main and develop and delegates to reusable quality.yml", () => {
	assert.equal(existsSync(ciPath), true, "missing .github/workflows/ci.yml");
	const raw = readFileSync(ciPath, "utf8");
	const code = stripComments(raw);

	assert.match(
		code,
		/pull_request:\s*\n\s*branches:\s*\[main,\s*develop\]\s*\n\s*paths-ignore:\s*\["plans\/\*\*\/\*\.md",\s*"plans\/reports\/\*\*\/\*\.html"\]/,
		"pull_request must target [main, develop] and ignore only plans markdown/html reports",
	);
	assert.match(
		code,
		/push:\s*\n\s*branches:\s*\[main,\s*develop\]\s*\n\s*paths-ignore:\s*\["plans\/\*\*\/\*\.md",\s*"plans\/reports\/\*\*\/\*\.html"\]/,
		"push must cover [main, develop] and ignore only plans markdown/html reports",
	);
	assert.doesNotMatch(
		code,
		/paths-ignore:[^\n]*(?:\bdocs\/|["'\s]\*\*\/\*\.md|["'\s]\*\.md)/,
		"ci.yml paths-ignore must never ignore docs/** or generic *.md (topology-drift tests read docs/production-release-runbook.md)",
	);
	assertReadOnlyWorkflowPermissions(code, "ci.yml");
	assert.doesNotMatch(
		code,
		/\bsecrets\b/,
		"ci.yml must never reference secrets",
	);

	const qualityCaller = extractJobBlock(code, "quality");
	assert.ok(qualityCaller, "ci.yml must declare quality caller job");
	assert.deepEqual(
		[...qualityCaller.matchAll(/^ {4}if:(.*)$/gm)].map((m) => m[1].trim()),
		["github.event_name != 'pull_request' || github.head_ref != 'develop'"],
		"ci.yml quality job may skip only pull_request runs from develop (push runs must always execute)",
	);
	assert.match(
		qualityCaller,
		/^\s*uses:\s*\.\/\.github\/workflows\/quality\.yml\s*$/m,
		"ci.yml quality job must call ./.github/workflows/quality.yml",
	);
	assert.match(
		qualityCaller,
		/turbo-cache:\s*true\b/,
		"ci.yml must enable turbo-cache on quality.yml",
	);
	assert.doesNotMatch(
		qualityCaller,
		/^\s*secrets:/m,
		"ci.yml quality job must not pass secrets",
	);
});

test("staging deploy workflow deploys only from staging and gates deploy on uncached quality", () => {
	assert.equal(
		existsSync(stagingPath),
		true,
		"missing .github/workflows/deploy-staging.yml (topology-drift tests read it)",
	);
	const raw = readFileSync(stagingPath, "utf8");
	const code = stripComments(raw);

	assert.match(
		code,
		/^\s*push:\s*\n\s*branches:\s*\[staging\]\s*$/m,
		"push trigger must cover exactly the dedicated staging branch (QA environment)",
	);
	assert.doesNotMatch(
		code,
		/branches:\s*\[[^\]]*\b(develop|main)\b/,
		"must not deploy staging on develop/main pushes (develop auto-deploy disabled 2026-09-22)",
	);
	assert.match(
		code,
		/workflow_dispatch/,
		"must stay runnable manually (staging migration rehearsal)",
	);
	assert.doesNotMatch(
		code,
		/\bpaths(?:-ignore)?:/,
		"deploy-staging.yml must never filter paths (every staging push runs full gates)",
	);
	assert.match(
		code,
		/pnpm alchemy deploy --stage staging \$\{\{ inputs\.dry_run && '--dry-run' \|\| '--yes' \}\}/,
		"a push has no dry_run input and must keep applying with --yes",
	);
	const postDeploySteps = code
		.slice(code.indexOf("- name: Deploy to Cloudflare"))
		.split(/^\s*- name: /m)
		.slice(2);
	assert.ok(postDeploySteps.length > 0, "expected steps after the deploy step");
	for (const step of postDeploySteps) {
		assert.match(
			step,
			/^.*\n\s*if: \$\{\{ !inputs\.dry_run \}\}/,
			`step after deploy must skip on dry-run: ${step.split("\n")[0]}`,
		);
	}
	assertReadOnlyWorkflowPermissions(code, "deploy-staging.yml");
	assert.match(
		code,
		/^concurrency:\s*\n\s*group:\s*deploy-staging\s*\n\s*cancel-in-progress:\s*false\s*$/m,
		"deploy-staging.yml must serialize deploys without cancelling in-progress D1 migrations",
	);

	const qualityCaller = extractJobBlock(code, "quality");
	assert.ok(qualityCaller, "deploy-staging.yml must declare quality job");
	assert.doesNotMatch(
		qualityCaller,
		/^ {4}if:/m,
		"deploy-staging.yml quality job must never declare job-level if: (skipped quality would let deploy proceed)",
	);
	assert.match(
		qualityCaller,
		/^\s*uses:\s*\.\/\.github\/workflows\/quality\.yml\s*$/m,
		"deploy-staging.yml quality job must reuse quality.yml",
	);
	assert.match(
		qualityCaller,
		/turbo-cache:\s*false\b/,
		"deploy-staging.yml must run quality with turbo-cache: false",
	);
	assert.doesNotMatch(
		qualityCaller,
		/^\s*secrets:/m,
		"deploy-staging.yml quality job must never receive staging secrets",
	);

	const deployJob = extractJobBlock(code, "deploy");
	assert.ok(deployJob, "deploy-staging.yml must declare deploy job");
	const needs = deployJob.match(/^\s*needs:\s*\[([^\]]*)\]/m);
	assert.ok(needs, "staging deploy job must declare needs");
	assert.deepEqual(
		needs[1].split(",").map((d) => d.trim()),
		["quality"],
		"staging deploy must need exactly quality",
	);
	assert.doesNotMatch(
		deployJob,
		/continue-on-error|\b(always|failure)\s*\(|!\s*cancelled\s*\(/,
		"staging deploy job must never bypass quality failure",
	);
	assert.match(
		deployJob,
		/uses:\s*\.\/\.github\/actions\/setup-workspace/,
		"staging deploy job must use setup-workspace composite action",
	);
	assert.doesNotMatch(
		code,
		/\bnpx\s+-y\b/,
		"deploy-staging.yml must never run unpinned npx -y with Cloudflare secrets",
	);

	const steps = splitJobSteps(deployJob);
	const deployIdx = steps.findIndex((s) =>
		/name:\s*Deploy to Cloudflare \(stage staging\)/.test(s),
	);
	const readyzIdx = steps.findIndex((s) =>
		/name:\s*Smoke check API readiness \(\/readyz\)/.test(s),
	);
	const seedIdx = steps.findIndex((s) =>
		/name:\s*Seed built-in vocab library \(staging only\)/.test(s),
	);
	const authIdx = steps.findIndex((s) =>
		/name:\s*Smoke check auth \(sign-up/.test(s),
	);
	assert.ok(
		deployIdx >= 0 &&
			readyzIdx > deployIdx &&
			seedIdx > readyzIdx &&
			authIdx > seedIdx,
		"staging vocab seed step must run after /readyz and before auth smoke",
	);
	const seedStep = steps[seedIdx];
	assert.match(
		seedStep,
		/timeout-minutes:\s*\d+/,
		"staging vocab seed step must declare timeout-minutes",
	);
	assert.match(
		seedStep,
		/pnpm --filter @teacher-os\/db exec tsx scripts\/seed-vocab-library\.ts --d1 --d1-stage staging --if-needed --verify/,
		"staging vocab seed step must run locked tsx seed-vocab-library with --d1-stage staging --if-needed --verify",
	);
	assert.doesNotMatch(
		seedStep,
		/D1_DATABASE_ID/,
		"staging vocab seed step must resolve staging DB fail-closed via --d1-stage staging without D1_DATABASE_ID",
	);
	const seedEnvKeys = [...seedStep.matchAll(/^ {10}([A-Z0-9_]+):/gm)].map(
		(m) => m[1],
	);
	assert.deepEqual(
		seedEnvKeys.sort(),
		["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
		"staging vocab seed step must follow least-privilege and receive only CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN",
	);
});

test("e2e does not run on GitHub Actions (it runs locally before ak-ship)", () => {
	assert.equal(
		existsSync(join(repoRoot, ".github/workflows/e2e.yml")),
		false,
		"e2e.yml must stay removed: the E2E suite runs locally, not in CI",
	);
});

test("prod deploy is gated on uncached quality only (e2e runs locally before shipping)", () => {
	const raw = readFileSync(deployPath, "utf8");
	const code = stripComments(raw);

	assert.doesNotMatch(
		code,
		/^ {2}e2e:/m,
		"deploy.yml must not declare an e2e job (e2e runs locally before ak-ship)",
	);
	assert.doesNotMatch(
		code,
		/workflows\/e2e\.yml/,
		"deploy.yml must not call the reusable e2e workflow",
	);
	assert.doesNotMatch(
		code,
		/\bpaths(?:-ignore)?:/,
		"deploy.yml must never filter paths (every prod push runs full gates)",
	);
	assertReadOnlyWorkflowPermissions(code, "deploy.yml");
	assert.match(
		code,
		/^concurrency:\s*\n\s*group:\s*deploy-production\s*\n\s*cancel-in-progress:\s*false\s*$/m,
		"deploy.yml must serialize deploys without cancelling in-progress D1 migrations",
	);

	const qualityCaller = extractJobBlock(code, "quality");
	assert.ok(qualityCaller, "deploy.yml must declare quality job");
	assert.doesNotMatch(
		qualityCaller,
		/^ {4}if:/m,
		"deploy.yml quality job must never declare job-level if: (skipped quality would let deploy proceed)",
	);
	assert.match(
		qualityCaller,
		/^\s*uses:\s*\.\/\.github\/workflows\/quality\.yml\s*$/m,
		"deploy.yml quality job must reuse quality.yml",
	);
	assert.match(
		qualityCaller,
		/turbo-cache:\s*false\b/,
		"deploy.yml must run quality with turbo-cache: false",
	);
	assert.doesNotMatch(
		qualityCaller,
		/^\s*secrets:/m,
		"deploy.yml quality job must never receive prod secrets",
	);

	const deployJob = extractJobBlock(code, "deploy");
	assert.ok(deployJob, "deploy.yml must declare deploy job");
	const needs = deployJob.match(/^\s*needs:\s*\[([^\]]*)\]/m);
	assert.ok(needs, "prod deploy job must declare needs");
	assert.deepEqual(
		needs[1].split(",").map((d) => d.trim()),
		["quality"],
		"prod deploy must need exactly quality",
	);
	assert.doesNotMatch(
		deployJob,
		/continue-on-error|\b(always|failure)\s*\(|!\s*cancelled\s*\(/,
		"prod deploy job must never bypass quality failure",
	);
	assert.match(
		deployJob,
		/uses:\s*\.\/\.github\/actions\/setup-workspace/,
		"prod deploy job must use setup-workspace composite action",
	);
	assert.doesNotMatch(
		code,
		/\bnpx\s+-y\b/,
		"deploy.yml must never run unpinned npx -y with production secrets",
	);
	assert.doesNotMatch(
		code,
		/seed-vocab-library|seedVocabLibrary|vocab_library/,
		"deploy.yml must never seed built-in vocab library while production license gate is closed (#573)",
	);
	assert.match(
		code,
		/pnpm alchemy deploy --stage prod \$\{\{ inputs\.dry_run && '--dry-run' \|\| '--yes' \}\}/,
		"a prod push has no dry_run input and must keep applying with --yes",
	);
	const postDeploySteps = code
		.slice(code.indexOf("- name: Deploy to Cloudflare"))
		.split(/^\s*- name: /m)
		.slice(2);
	assert.ok(
		postDeploySteps.length > 0,
		"expected steps after the deploy step in deploy.yml",
	);
	for (const step of postDeploySteps) {
		assert.match(
			step,
			/^.*\n\s*if: \$\{\{ !inputs\.dry_run \}\}/,
			`step after deploy must skip on dry-run in deploy.yml: ${step.split("\n")[0]}`,
		);
	}

	const alchemyRaw = readFileSync(alchemyPath, "utf8");
	const alchemyCode = alchemyRaw
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/^\s*\/\/.*$/gm, "");
	assert.doesNotMatch(
		alchemyCode,
		/\bimportFiles\b/,
		"packages/infra/alchemy.run.ts must not use D1 importFiles (would bypass production license gate)",
	);
});

test("state-migrate.yml triggers only on manual workflow_dispatch with read permissions and serialized concurrency", () => {
	const raw = readFileSync(
		join(repoRoot, ".github/workflows/state-migrate.yml"),
		"utf8",
	);
	const code = stripComments(raw);

	assert.doesNotMatch(
		code,
		/\bpush:/,
		"state-migrate.yml must never trigger automatically on push",
	);
	assert.doesNotMatch(
		code,
		/\bpull_request:/,
		"state-migrate.yml must never trigger on pull_request",
	);
	assert.match(
		code,
		/\bworkflow_dispatch:/,
		"state-migrate.yml must trigger only on workflow_dispatch",
	);
	assertReadOnlyWorkflowPermissions(code, "state-migrate.yml");
	assert.match(
		code,
		/group:\s*deploy-\$\{\{\s*inputs\.stage\s*==\s*'prod'\s*&&\s*'production'\s*\|\|\s*'staging'\s*\}\}/,
		"state-migrate.yml must share the exact deploy concurrency group for stage serialization",
	);
	assert.match(
		code,
		/cancel-in-progress:\s*false/,
		"state-migrate.yml must never cancel in-progress migrations",
	);
	assert.doesNotMatch(
		code,
		/actions\/upload-artifact/,
		"state-migrate.yml must never upload state as an artifact (contains plaintext secrets in memory)",
	);
});
