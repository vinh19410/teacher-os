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

test("dev CORS default in alchemy.run.ts matches web, student, and admin dev ports", () => {
	const webVite = read("../apps/web/vite.config.ts");
	const webPort = webVite.match(/port:\s*(\d+)/)?.[1];
	assert.ok(webPort, "dev port found in apps/web/vite.config.ts");

	const studentVite = read("../apps/student/vite.config.ts");
	const studentPort = studentVite.match(/port:\s*(\d+)/)?.[1];
	assert.ok(studentPort, "dev port found in apps/student/vite.config.ts");
	assert.equal(studentPort, "8003");

	// Plan #413 phase 1: cổng admin dev chạy ở 8004 (admin app ra mắt ở phase
	// sau nhưng origin phải có trong CORS default từ phase này).
	const ADMIN_DEV_PORT = "8004";

	const run = read("../packages/infra/alchemy.run.ts");
	const devDefault = run.match(
		/withDefault\(\s*"(http:\/\/localhost:\d+,http:\/\/localhost:\d+,http:\/\/localhost:\d+)"\s*,?\s*\)/,
	)?.[1];
	assert.ok(
		devDefault,
		"dev CORS default found in packages/infra/alchemy.run.ts",
	);
	assert.equal(
		devDefault,
		`http://localhost:${webPort},http://localhost:${studentPort},http://localhost:${ADMIN_DEV_PORT}`,
	);

	const adminDefault = run
		.split("const adminOriginsConfig")[1]
		?.match(/withDefault\("(http:\/\/localhost:(\d+))"\)/);
	assert.ok(adminDefault, "ADMIN_ORIGINS dev default found in alchemy.run.ts");
	assert.equal(adminDefault[2], ADMIN_DEV_PORT);
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

test("workflow APP_DOMAIN domains agree with the prod apex constant (cookie-zone rule)", () => {
	// Issue #125: the auth cookie namespace rule keys off the exact prod apex
	// (PROD_APP_DOMAIN in packages/infra/src/topology.ts). If a workflow's
	// APP_DOMAIN drifts from that constant, prod could silently fall into the
	// non-prod prefix branch (or vice versa).
	const topology = read("../packages/infra/src/topology.ts");
	const prodApex = topology.match(/PROD_APP_DOMAIN\s*=\s*"([^"]+)"/)?.[1];
	assert.ok(
		prodApex,
		"PROD_APP_DOMAIN found in packages/infra/src/topology.ts",
	);

	const prodAppDomain = read("../.github/workflows/deploy.yml").match(
		/^\s*APP_DOMAIN:\s*(\S+)\s*$/m,
	)?.[1];
	assert.equal(
		prodAppDomain,
		prodApex,
		"deploy.yml APP_DOMAIN must be the exact PROD_APP_DOMAIN (default cookie namespace)",
	);

	const stagingAppDomain = read(
		"../.github/workflows/deploy-staging.yml",
	).match(/^\s*APP_DOMAIN:\s*(\S+)\s*$/m)?.[1];
	assert.ok(
		stagingAppDomain &&
			stagingAppDomain !== prodApex &&
			stagingAppDomain.endsWith(`.${prodApex}`),
		"deploy-staging.yml APP_DOMAIN must be a non-apex member of the prod cookie zone (namespaced cookie prefix)",
	);
});

test("topology derives landing host and frees app aliases", async () => {
	const { resolveDomainTopology } = await import(
		"../packages/infra/src/topology.ts"
	);
	const t = resolveDomainTopology("teacheros.io.vn");
	assert.equal(t.landingHost, "teacheros.io.vn");
	assert.deepEqual(t.appAliases, []);
	assert.ok(t.landingAliases.includes("www.teacheros.io.vn"));
});

test("workflow LANDING_ORIGIN matches each stage apex", () => {
	const prod = read("../.github/workflows/deploy.yml").match(
		/^\s*LANDING_ORIGIN:\s*(\S+)\s*$/m,
	)?.[1];
	assert.equal(prod, "https://teacheros.io.vn");

	const staging = read("../.github/workflows/deploy-staging.yml").match(
		/^\s*LANDING_ORIGIN:\s*(\S+)\s*$/m,
	)?.[1];
	assert.equal(staging, "https://staging.teacheros.io.vn");
});

test("deploy workflows pass LEAD_ORG_ID and LEAD_ORIGINS to alchemy deploy and alchemy.run.ts wires resolveLeadOrigins (#524)", () => {
	for (const workflow of [
		"../.github/workflows/deploy.yml",
		"../.github/workflows/deploy-staging.yml",
	]) {
		const content = read(workflow);
		const deployStep = content
			.split("- name: Deploy to Cloudflare")[1]
			?.split("- name:")[0];
		assert.ok(deployStep, `Deploy to Cloudflare step found in ${workflow}`);
		assert.match(
			deployStep,
			/^\s*LEAD_ORG_ID:\s*\$\{\{\s*vars\.LEAD_ORG_ID\s*\}\}\s*$/m,
			`${workflow} Deploy step must pass LEAD_ORG_ID from vars.LEAD_ORG_ID`,
		);
		assert.match(
			deployStep,
			/^\s*LEAD_ORIGINS:\s*\$\{\{\s*vars\.LEAD_ORIGINS\s*\}\}\s*$/m,
			`${workflow} Deploy step must pass LEAD_ORIGINS from vars.LEAD_ORIGINS`,
		);
	}

	const run = read("../packages/infra/alchemy.run.ts");
	assert.match(
		run,
		/resolveLeadOrigins\(/,
		"packages/infra/alchemy.run.ts must normalize LEAD_ORIGINS via resolveLeadOrigins",
	);
});

test("workflow PROFILE_ORIGIN and profile smoke check match resolveDomainTopology (#536)", async () => {
	const { DEFAULT_DEV_LEAD_ORIGINS, resolveDomainTopology } = await import(
		"../packages/infra/src/topology.ts"
	);

	const prodYaml = read("../.github/workflows/deploy.yml");
	const prodAppDomain = prodYaml.match(/^\s*APP_DOMAIN:\s*(\S+)\s*$/m)?.[1];
	const prodProfileOrigin = prodYaml.match(
		/^\s*PROFILE_ORIGIN:\s*(\S+)\s*$/m,
	)?.[1];
	assert.ok(prodAppDomain, "APP_DOMAIN found in deploy.yml");
	const prodTopology = resolveDomainTopology(prodAppDomain);
	assert.equal(prodProfileOrigin, `https://${prodTopology.profileHost}`);
	assert.equal(prodProfileOrigin, prodTopology.profileOrigins[0]);
	assert.deepEqual(prodTopology.profileOrigins, [
		"https://msmy.io.vn",
		"https://www.msmy.io.vn",
	]);
	assert.match(prodYaml, /- name: Smoke check profile\b/);

	const stagingYaml = read("../.github/workflows/deploy-staging.yml");
	const stagingAppDomain = stagingYaml.match(
		/^\s*APP_DOMAIN:\s*(\S+)\s*$/m,
	)?.[1];
	const stagingProfileOrigin = stagingYaml.match(
		/^\s*PROFILE_ORIGIN:\s*(\S+)\s*$/m,
	)?.[1];
	assert.ok(stagingAppDomain, "APP_DOMAIN found in deploy-staging.yml");
	const stagingTopology = resolveDomainTopology(stagingAppDomain);
	assert.equal(stagingProfileOrigin, `https://${stagingTopology.profileHost}`);
	assert.deepEqual(stagingTopology.profileOrigins, [
		"https://profile.staging.teacheros.io.vn",
	]);
	assert.doesNotMatch(stagingTopology.profileOrigins.join(","), /msmy\.io\.vn/);
	assert.match(stagingYaml, /- name: Smoke check profile\b/);

	const profileServe = read("../apps/profile/serve.mjs");
	const profilePort = profileServe.match(
		/const port = Number\(process\.env\.PORT\) \|\| (\d+);/,
	)?.[1];
	assert.equal(profilePort, "8005");
	assert.equal(DEFAULT_DEV_LEAD_ORIGINS, `http://localhost:${profilePort}`);

	const run = read("../packages/infra/alchemy.run.ts");
	const profileBlock = run.split('StaticSite("profile"')[1];
	assert.ok(profileBlock, 'StaticSite("profile") found in alchemy.run.ts');
	assert.match(
		profileBlock,
		new RegExp(`url:\\s*"http://localhost:${profilePort}"`),
		"profileWorker dev.url in alchemy.run.ts must match apps/profile/serve.mjs port",
	);
});
