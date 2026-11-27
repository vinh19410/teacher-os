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

test("dev CORS, STUDENT_ORIGINS, and ADMIN_ORIGINS defaults in alchemy.run.ts match unified lms dev port", () => {
	const lmsVite = read("../apps/lms/vite.config.ts");
	const lmsPort = lmsVite.match(/port:\s*(\d+)/)?.[1];
	assert.ok(lmsPort, "dev port found in apps/lms/vite.config.ts");
	assert.equal(lmsPort, "8001");

	const expectedOrigin = `http://localhost:${lmsPort}`;
	const run = read("../packages/infra/alchemy.run.ts");

	const corsBlock = run
		.split("const corsOriginConfig")[1]
		?.split("const studentOriginsEnv")[0];
	assert.ok(
		corsBlock,
		"corsOriginConfig found in packages/infra/alchemy.run.ts",
	);
	assert.equal(
		corsBlock.match(
			/withDefault\(\s*"(http:\/\/localhost:\d+)"\s*,?\s*\)/,
		)?.[1],
		expectedOrigin,
		"CORS_ORIGIN dev default must match apps/lms/vite.config.ts port",
	);

	const studentBlock = run
		.split("const studentOriginsConfig")[1]
		?.split("const adminOriginsEnv")[0];
	assert.ok(
		studentBlock,
		"studentOriginsConfig found in packages/infra/alchemy.run.ts",
	);
	assert.equal(
		studentBlock.match(
			/withDefault\(\s*"(http:\/\/localhost:\d+)"\s*,?\s*\)/,
		)?.[1],
		expectedOrigin,
		"STUDENT_ORIGINS dev default must match apps/lms/vite.config.ts port",
	);

	const adminBlock = run
		.split("const adminOriginsConfig")[1]
		?.split("const adminEmailsConfig")[0];
	assert.ok(
		adminBlock,
		"adminOriginsConfig found in packages/infra/alchemy.run.ts",
	);
	assert.equal(
		adminBlock.match(
			/withDefault\(\s*"(http:\/\/localhost:\d+)"\s*,?\s*\)/,
		)?.[1],
		expectedOrigin,
		"ADMIN_ORIGINS dev default must match apps/lms/vite.config.ts port",
	);

	assert.match(
		run,
		/Cloudflare\.Website\.Vite\("lms"/,
		'alchemy.run.ts must deploy unified Cloudflare.Website.Vite("lms") worker',
	);
	const lmsBlock = run
		.split('Cloudflare.Website.Vite("lms"')[1]
		?.split('Cloudflare.Website.StaticSite("landing"')[0];
	assert.ok(lmsBlock, 'Website.Vite("lms") block found in alchemy.run.ts');
	assert.match(
		lmsBlock,
		/runWorkerFirst:\s*true/,
		'Website.Vite("lms") must enable runWorkerFirst: true on deploy so legacy root 301s, SW headers, and CSP run through worker.ts',
	);
	for (const ws of ["../web", "../student", "../admin"]) {
		assert.match(
			lmsBlock,
			new RegExp(`cwd:\\s*"${ws.replace(/\./g, "\\.")}"`),
			`Website.Vite("lms") memo.workspaces must include ${ws} so portal changes invalidate Alchemy builds`,
		);
	}
	for (const legacy of ["web", "student", "admin"]) {
		assert.doesNotMatch(
			run,
			new RegExp(`Cloudflare\\.Website\\.Vite\\("${legacy}"`),
			`alchemy.run.ts must not deploy separate legacy Vite worker "${legacy}"`,
		);
	}
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

	const legacyApex = topology.match(
		/LEGACY_PROD_APP_DOMAIN\s*=\s*"([^"]+)"/,
	)?.[1];
	assert.ok(
		legacyApex,
		"LEGACY_PROD_APP_DOMAIN found in packages/infra/src/topology.ts",
	);

	const stagingAppDomain = read(
		"../.github/workflows/deploy-staging.yml",
	).match(/^\s*APP_DOMAIN:\s*(\S+)\s*$/m)?.[1];
	assert.ok(
		stagingAppDomain &&
			stagingAppDomain !== prodApex &&
			[prodApex, legacyApex].some((zone) =>
				stagingAppDomain.endsWith(`.${zone}`),
			),
		"deploy-staging.yml APP_DOMAIN must be a non-apex member of the prod or former-prod cookie zone (namespaced cookie prefix)",
	);
});

test("topology resolves unified lms domain, legacy aliases, and leaves landing unattached on prod", async () => {
	const { PROD_APP_DOMAIN, resolveDomainTopology } = await import(
		"../packages/infra/src/topology.ts"
	);
	const t = resolveDomainTopology(PROD_APP_DOMAIN);
	assert.equal(t.lmsHost, "lms.msmy.io.vn");
	assert.equal(t.lmsOrigin, "https://lms.msmy.io.vn");
	assert.deepEqual(t.lmsAliases, [
		"app.msmy.io.vn",
		"student.msmy.io.vn",
		"admin.msmy.io.vn",
	]);
	assert.equal(t.teacherUrl, "https://lms.msmy.io.vn/teacher");
	assert.equal(t.studentPortalUrl, "https://lms.msmy.io.vn/student");
	assert.equal(t.adminUrl, "https://lms.msmy.io.vn/admin");
	assert.equal(t.landingHost, undefined);
	assert.deepEqual(t.landingAliases, []);
	assert.deepEqual(t.appAliases, []);
});

test("workflow LANDING_ORIGIN matches the staging apex and is absent on prod", () => {
	const prod = read("../.github/workflows/deploy.yml").match(
		/^\s*LANDING_ORIGIN:\s*(\S+)\s*$/m,
	)?.[1];
	assert.equal(prod, undefined);

	const staging = read("../.github/workflows/deploy-staging.yml").match(
		/^\s*LANDING_ORIGIN:\s*(\S+)\s*$/m,
	)?.[1];
	assert.equal(staging, "https://staging.teacheros.io.vn");
});

test("deploy workflows wire unified LMS origin, legacy 301 redirect smoke, and unified auth smoke", async () => {
	const { resolveDomainTopology } = await import(
		"../packages/infra/src/topology.ts"
	);
	for (const workflow of [
		"../.github/workflows/deploy.yml",
		"../.github/workflows/deploy-staging.yml",
	]) {
		const yaml = read(workflow);
		const appDomain = yaml.match(/^\s*APP_DOMAIN:\s*(\S+)\s*$/m)?.[1];
		assert.ok(appDomain, `APP_DOMAIN found in ${workflow}`);
		const t = resolveDomainTopology(appDomain);
		assert.equal(
			yaml.match(/^\s*LMS_ORIGIN:\s*(\S+)\s*$/m)?.[1],
			t.lmsOrigin,
			`${workflow} LMS_ORIGIN must match resolveDomainTopology(${appDomain}).lmsOrigin`,
		);
		assert.equal(
			yaml.match(/^\s*LEGACY_APP_ORIGIN:\s*(\S+)\s*$/m)?.[1],
			t.appOrigin,
			`${workflow} LEGACY_APP_ORIGIN must match appOrigin`,
		);
		assert.equal(
			yaml.match(/^\s*LEGACY_STUDENT_ORIGIN:\s*(\S+)\s*$/m)?.[1],
			t.studentOrigin,
			`${workflow} LEGACY_STUDENT_ORIGIN must match studentOrigin`,
		);
		assert.equal(
			yaml.match(/^\s*LEGACY_ADMIN_ORIGIN:\s*(\S+)\s*$/m)?.[1],
			t.adminOrigin,
			`${workflow} LEGACY_ADMIN_ORIGIN must match adminOrigin`,
		);
		assert.match(
			yaml,
			/- name: Smoke check LMS & legacy 301 redirects\b/,
			`${workflow} must smoke check LMS & legacy 301 redirects`,
		);
		const detachStep = yaml
			.split("- name: Detach legacy Worker custom domains")[1]
			?.split("- name: Deploy to Cloudflare")[0];
		assert.ok(
			detachStep,
			`${workflow} must detach legacy Worker custom domains before Deploy to Cloudflare`,
		);
		assert.match(
			detachStep,
			/if:\s*\$\{\{\s*!inputs\.dry_run\s*\}\}/,
			`${workflow} legacy domain detach step must skip on dry_run`,
		);
		assert.match(
			detachStep,
			/detach-legacy-worker-domains\.ts --stage (?:staging|prod)/,
			`${workflow} must invoke detach-legacy-worker-domains.ts`,
		);
		const lmsSmokeStep = yaml
			.split("- name: Smoke check LMS & legacy 301 redirects")[1]
			?.split("- name:")[0];
		assert.ok(lmsSmokeStep, `LMS smoke step found in ${workflow}`);
		assert.match(lmsSmokeStep, /"\$LEGACY_APP_ORIGIN\/"/);
		assert.match(lmsSmokeStep, /"\$LEGACY_STUDENT_ORIGIN\/"/);
		assert.match(lmsSmokeStep, /"\$LEGACY_ADMIN_ORIGIN\/"/);
		assert.match(lmsSmokeStep, /"\$LMS_ORIGIN\/"/);
		assert.match(lmsSmokeStep, /"\$LMS_ORIGIN\/login" "true"/);
		assert.match(lmsSmokeStep, /"\$LMS_ORIGIN\/teacher\/" "true"/);
		assert.match(lmsSmokeStep, /"\$LMS_ORIGIN\/student\/" "true"/);
		assert.match(lmsSmokeStep, /"\$LMS_ORIGIN\/admin\/" "true"/);
		assert.match(lmsSmokeStep, /JS bundle missing VITE_SERVER_URL/);
		assert.match(lmsSmokeStep, /\/\(\[\^"\]\*\/\)\?assets\//);
		assert.match(lmsSmokeStep, /strict-transport-security:/i);
		assert.match(lmsSmokeStep, /content-security-policy:.*media-src/i);
		const stubsStep = yaml
			.split("- name: Smoke check auth stubs")[1]
			?.split("- name:")[0];
		assert.ok(stubsStep, `auth stubs smoke step found in ${workflow}`);
		assert.match(stubsStep, /"\$LMS_ORIGIN"/);
		assert.match(stubsStep, /"\$LEGACY_APP_ORIGIN"/);
	}

	const stagingYaml = read("../.github/workflows/deploy-staging.yml");
	const smoke = stagingYaml
		.split("- name: Smoke check auth (sign-up")[1]
		?.split("- name:")[0];
	assert.ok(smoke, "auth smoke step found in deploy-staging.yml");
	assert.match(smoke, /-H "Origin: \$LMS_ORIGIN"/);
	assert.doesNotMatch(smoke, /-H "Origin: \$APP_ORIGIN"/);
	assert.doesNotMatch(smoke, /-H "Origin: \$STUDENT_ORIGIN"/);

	const prodDeployStep = read("../.github/workflows/deploy.yml")
		.split("- name: Deploy to Cloudflare")[1]
		?.split("- name:")[0];
	assert.ok(prodDeployStep, "Deploy to Cloudflare step found in deploy.yml");
	assert.match(
		prodDeployStep,
		/^\s*ADMIN_EMAILS:\s*\$\{\{\s*vars\.ADMIN_EMAILS\s*\}\}\s*$/m,
		"deploy.yml must pass ADMIN_EMAILS from vars.ADMIN_EMAILS",
	);
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
	assert.doesNotMatch(
		prodYaml,
		/^\s*PROFILE_MAINTENANCE:\s*"?(false|0)"?\s*$/m,
		"deploy.yml must not force PROFILE_MAINTENANCE=false on production",
	);
	assert.match(
		prodYaml,
		/isProfileMaintenanceEnabled\(\)/,
		"deploy.yml Smoke check profile must resolve mode via isProfileMaintenanceEnabled()",
	);

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
	assert.match(
		stagingYaml,
		/^\s*PROFILE_MAINTENANCE:\s*"false"\s*$/m,
		'deploy-staging.yml must set PROFILE_MAINTENANCE: "false" so staging profile stays enabled while production uses maintenance.json',
	);
	assert.match(
		stagingYaml,
		/isProfileMaintenanceEnabled\(\)/,
		"deploy-staging.yml Smoke check profile must resolve mode via isProfileMaintenanceEnabled()",
	);

	const profileServe = read("../apps/profile/serve.mjs");
	const profilePort = profileServe.match(
		/const port = Number\(process\.env\.PORT\) \|\| (\d+);/,
	)?.[1];
	assert.equal(profilePort, "8005");
	assert.equal(DEFAULT_DEV_LEAD_ORIGINS, `http://localhost:${profilePort}`);

	const run = read("../packages/infra/alchemy.run.ts");
	assert.match(
		run,
		/apps\/profile\/maintenance\.json/,
		"packages/infra/alchemy.run.ts must derive profile maintenance mode from apps/profile/maintenance.json",
	);
	const profileBlock = run.split('StaticSite("profile"')[1];
	assert.ok(profileBlock, 'StaticSite("profile") found in alchemy.run.ts');
	assert.match(
		profileBlock,
		/notFoundHandling:\s*profileDisabled\s*\?\s*"single-page-application"\s*:\s*"none"/,
		'StaticSite("profile") must switch notFoundHandling from profileDisabled',
	);
	assert.match(
		profileBlock,
		new RegExp(`url:\\s*"http://localhost:${profilePort}"`),
		"profileWorker dev.url in alchemy.run.ts must match apps/profile/serve.mjs port",
	);
	assert.match(
		profileBlock,
		/STUDENT_PORTAL_URL:\s*topology\s*\?\s*topology\.studentPortalUrl\s*:\s*lmsWorker\.url\.as<string>\(\)/,
		'StaticSite("profile") in alchemy.run.ts must wire STUDENT_PORTAL_URL from topology.studentPortalUrl / lmsWorker.url',
	);

	const lmsVite = read("../apps/lms/vite.config.ts");
	const lmsPort = lmsVite.match(/port:\s*(\d+)/)?.[1];
	assert.equal(lmsPort, "8001");
	const defaultStudentPortalUrl = profileServe.match(
		/process\.env\.STUDENT_PORTAL_URL\s*\?\?\s*"(http:\/\/localhost:\d+\/student)"/,
	)?.[1];
	assert.equal(
		defaultStudentPortalUrl,
		`http://localhost:${lmsPort}/student`,
		"apps/profile/serve.mjs default STUDENT_PORTAL_URL must match apps/lms/vite.config.ts port + /student",
	);

	const playwrightCfg = read("../apps/e2e/playwright.config.ts");
	assert.match(
		playwrightCfg,
		/STUDENT_PORTAL_URL:\s*`http:\/\/localhost:\$\{lmsPort\}\/student`/,
		"apps/e2e/playwright.config.ts must pass STUDENT_PORTAL_URL using lmsPort + /student",
	);
});

test("student practice nav flag is enabled on staging deploy step, wired via alchemy lms env, and blocked on production", () => {
	const stagingYaml = read("../.github/workflows/deploy-staging.yml");
	const stagingDeployStep = stagingYaml
		.split("- name: Deploy to Cloudflare (stage staging)")[1]
		?.split("- name:")[0];
	assert.ok(
		stagingDeployStep,
		"Deploy to Cloudflare (stage staging) step found in deploy-staging.yml",
	);
	assert.match(
		stagingDeployStep,
		/^\s*STUDENT_PRACTICE_ENABLED:\s*"true"\s*$/m,
		'deploy-staging.yml Deploy step must set STUDENT_PRACTICE_ENABLED: "true" so staging student nav enables Luyện tập & Lịch sử',
	);
	const stagingEnvKeyLines = stagingYaml
		.split("\n")
		.filter((line) => !/^\s*#/.test(line))
		.join("\n");
	const stagingTopLevel = stagingEnvKeyLines.split(/^jobs:\s*$/m)[0] ?? "";
	assert.doesNotMatch(
		stagingTopLevel,
		/^\s*STUDENT_PRACTICE_ENABLED:/m,
		"deploy-staging.yml must scope STUDENT_PRACTICE_ENABLED to the Deploy step (not top-level env)",
	);
	assert.doesNotMatch(
		stagingEnvKeyLines,
		/^\s*VITE_STUDENT_PRACTICE_ENABLED:/m,
		"deploy-staging.yml must use STUDENT_PRACTICE_ENABLED (not VITE_STUDENT_PRACTICE_ENABLED) so process.env cannot bypass Alchemy config.define",
	);

	const prodYaml = read("../.github/workflows/deploy.yml");
	const prodNoComments = prodYaml
		.split("\n")
		.filter((line) => !/^\s*#/.test(line))
		.join("\n");
	assert.doesNotMatch(
		prodNoComments,
		/^\s*VITE_STUDENT_PRACTICE_ENABLED:/m,
		"deploy.yml must never set VITE_STUDENT_PRACTICE_ENABLED directly",
	);
	assert.doesNotMatch(
		prodNoComments,
		/^\s*STUDENT_PRACTICE_ENABLED:(?!\s*["']?false["']?\s*$)/m,
		"deploy.yml must not enable STUDENT_PRACTICE_ENABLED or wire vars.* on production",
	);
	assert.doesNotMatch(
		prodNoComments,
		/\b(?:VITE_)?STUDENT_PRACTICE_ENABLED\s*=\s*["']?true\b/,
		"deploy.yml must not enable STUDENT_PRACTICE_ENABLED inline in run commands",
	);

	const run = read("../packages/infra/alchemy.run.ts");
	assert.match(
		run,
		/resolveStudentPracticeEnabled\(/,
		"packages/infra/alchemy.run.ts must resolve STUDENT_PRACTICE_ENABLED via resolveStudentPracticeEnabled",
	);
	const lmsBlock = run
		.split('Cloudflare.Website.Vite("lms"')[1]
		?.split('Cloudflare.Website.StaticSite("landing"')[0];
	assert.ok(lmsBlock, 'Website.Vite("lms") block found in alchemy.run.ts');
	assert.match(
		lmsBlock,
		/VITE_STUDENT_PRACTICE_ENABLED:\s*studentPracticeEnabled/,
		'Website.Vite("lms") env must wire VITE_STUDENT_PRACTICE_ENABLED so Alchemy tracks it in state/memo and injects config.define',
	);

	const stagingSmokeStep = stagingYaml
		.split("- name: Smoke check LMS & legacy 301 redirects")[1]
		?.split("- name:")[0];
	assert.ok(stagingSmokeStep, "staging LMS smoke step found");
	assert.match(
		stagingSmokeStep,
		/practice_flag_regex=.*VITE_STUDENT_PRACTICE_ENABLED/,
		"deploy-staging.yml LMS smoke must define practice_flag_regex for VITE_STUDENT_PRACTICE_ENABLED",
	);
	assert.match(
		stagingSmokeStep,
		/check_shell_headers "\$LMS_ORIGIN\/student\/" "true" "\$practice_flag_regex"/,
		"deploy-staging.yml LMS smoke must verify /student/ bundle embeds enabled VITE_STUDENT_PRACTICE_ENABLED",
	);
	assert.match(
		stagingSmokeStep,
		/found_required/,
		"deploy-staging.yml LMS smoke must track found_required independently across chunks",
	);

	const prodSmokeStep = prodYaml
		.split("- name: Smoke check LMS & legacy 301 redirects")[1]
		?.split("- name:")[0];
	assert.ok(prodSmokeStep, "prod LMS smoke step found");
	assert.match(
		prodSmokeStep,
		/forbidden_practice_regex=.*VITE_STUDENT_PRACTICE_ENABLED/,
		"deploy.yml LMS smoke must define forbidden_practice_regex for VITE_STUDENT_PRACTICE_ENABLED",
	);
	assert.match(
		prodSmokeStep,
		/check_shell_headers "\$LMS_ORIGIN\/student\/" "true" "\$forbidden_practice_regex"/,
		"deploy.yml LMS smoke must reject any /student/ bundle leaking enabled VITE_STUDENT_PRACTICE_ENABLED on production",
	);
	assert.match(
		prodSmokeStep,
		/curl -fsS[\s\S]*leaked forbidden production flag pattern[\s\S]*failed to fetch (?:lazy )?JS chunk/,
		"deploy.yml LMS smoke negative scan must fail closed on curl/HTTP errors and forbidden flag matches",
	);
});

test("server Worker declares a single */10 cron trigger and multiplexes daily deadline reminders at 23:00 UTC", () => {
	const run = read("../packages/infra/alchemy.run.ts");
	const serverBlock = run
		.split('Cloudflare.Worker("server"')[1]
		?.split("export type ServerEnv")[0];
	assert.ok(
		serverBlock,
		'Cloudflare.Worker("server") block found in alchemy.run.ts',
	);

	const cronsMatch = serverBlock.match(/crons:\s*\[([^\]]*)\]/);
	assert.ok(
		cronsMatch,
		'Cloudflare.Worker("server") must declare a crons array in alchemy.run.ts',
	);
	const cronsBody = cronsMatch[1].replace(/\/\/[^\n]*/g, "");
	const crons = [...cronsBody.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
	assert.deepEqual(
		crons,
		["*/10 * * * *"],
		'server Worker must keep a single "*/10 * * * *" cron trigger to stay within Cloudflare Workers Free 5-cron account limit',
	);

	const serverEntry = read("../apps/server/src/index.ts");
	assert.match(
		serverEntry,
		/dispatchScheduledCron\(/,
		"apps/server/src/index.ts scheduled() must route crons via dispatchScheduledCron",
	);

	const scheduledMod = read("../apps/server/src/lib/scheduled.ts");
	assert.match(
		scheduledMod,
		/isDailyDeadlineReminderWindow\(/,
		"apps/server/src/lib/scheduled.ts must multiplex daily deadline reminders during the 23:00 UTC window of */10 * * * *",
	);
});

test("deploy workflows pass ZOOM_HOST_USER and alchemy.run.ts validates via resolveZoomHostUser", () => {
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
			/^\s*ZOOM_HOST_USER:\s*\$\{\{\s*vars\.ZOOM_HOST_USER\s*\}\}\s*$/m,
			`${workflow} Deploy step must pass ZOOM_HOST_USER from vars.ZOOM_HOST_USER`,
		);
	}

	const run = read("../packages/infra/alchemy.run.ts");
	assert.match(
		run,
		/resolveZoomHostUser\(/,
		"packages/infra/alchemy.run.ts must validate ZOOM_HOST_USER via resolveZoomHostUser",
	);
	assert.doesNotMatch(
		run,
		/Config\.String\(\s*["']ZOOM_HOST_USER["']\s*\)/,
		"packages/infra/alchemy.run.ts must not bypass resolveZoomHostUser with raw Config.String('ZOOM_HOST_USER')",
	);
});
