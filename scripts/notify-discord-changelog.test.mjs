import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	buildDiscordReleasePayload,
	DISCORD_EMBED_DESCRIPTION_LIMIT,
	extractMergedPrNumber,
	filterChangelogCommits,
	formatChangelogDescription,
	PROD_COLOR,
	postDiscordWebhook,
	RELEASE_AUTHOR_NAME,
	redactSecrets,
	resolveGitReleaseContext,
	runNotifyDiscordChangelog,
	STAGING_COLOR,
	validateDiscordWebhookUrl,
} from "./notify-discord-changelog.mjs";

const SAMPLE_WEBHOOK =
	"https://discord.com/api/webhooks/123456789012345678/super-secret-webhook-token-xyz";

test("buildDiscordReleasePayload formats staging Beta Release embed matching reference layout", () => {
	const payload = buildDiscordReleasePayload({
		stage: "staging",
		version: "0.0.21",
		runNumber: "142",
		repository: "vinh19410/teacher-os",
		serverUrl: "https://github.com",
		beforeSha: "1111111111111111111111111111111111111111",
		headSha: "2222222222222222222222222222222222222222",
		headSubject: "Merge pull request #686 from vinh19410/feat/686-discord",
		commits: [
			{
				sha: "aaaaaaa",
				subject:
					"feat(ci): notify Discord channel with release changelog (#686)",
			},
			{
				sha: "bbbbbbb",
				subject: "fix(materials): validate uploaded file headers (#676)",
			},
		],
		timestamp: "2026-11-13T06:20:00.000Z",
	});

	assert.equal(payload.username, RELEASE_AUTHOR_NAME);
	assert.deepEqual(payload.allowed_mentions, { parse: [] });
	assert.equal(payload.embeds.length, 1);

	const [embed] = payload.embeds;
	assert.equal(embed.title, "Beta Release v0.0.21-beta.142");
	assert.equal(embed.url, "https://github.com/vinh19410/teacher-os/pull/686");
	assert.equal(embed.color, STAGING_COLOR);
	assert.equal(embed.footer.text, RELEASE_AUTHOR_NAME);
	assert.equal(embed.timestamp, "2026-11-13T06:20:00.000Z");
	assert.equal(
		embed.description,
		[
			"## Changelog",
			"",
			"• feat(ci): notify Discord channel with release changelog (#686)",
			"• fix(materials): validate uploaded file headers (#676)",
		].join("\n"),
	);
});

test("buildDiscordReleasePayload formats staging Compare URL when no PR number is in headSubject", () => {
	const payload = buildDiscordReleasePayload({
		stage: "staging",
		version: "0.0.21",
		runNumber: "99",
		repository: "vinh19410/teacher-os",
		serverUrl: "https://github.com",
		beforeSha: "abcdef1234567890abcdef1234567890abcdef12",
		headSha: "fedcba0987654321fedcba0987654321fedcba09",
		headSubject: "fix(server): direct push hotfix",
		commits: [{ sha: "fedcba09", subject: "fix(server): direct push hotfix" }],
		timestamp: "2026-11-13T06:20:00.000Z",
	});

	assert.equal(
		payload.embeds[0].url,
		"https://github.com/vinh19410/teacher-os/compare/abcdef123456...fedcba098765",
	);
});

test("buildDiscordReleasePayload formats prod Official Release embed with and without PR number", () => {
	const withPr = buildDiscordReleasePayload({
		stage: "prod",
		version: "0.0.21",
		runNumber: "210",
		repository: "vinh19410/teacher-os",
		serverUrl: "https://github.com",
		beforeSha: "1111111111111111111111111111111111111111",
		headSha: "2222222222222222222222222222222222222222",
		headSubject: "Merge pull request #672 from vinh19410/develop",
		commits: [{ sha: "abc1234", subject: "feat(web): release feature (#670)" }],
		timestamp: "2026-11-13T06:20:00.000Z",
	});

	assert.equal(withPr.embeds[0].title, "Official Release v0.0.21 (#672)");
	assert.equal(
		withPr.embeds[0].url,
		"https://github.com/vinh19410/teacher-os/pull/672",
	);
	assert.equal(withPr.embeds[0].color, PROD_COLOR);

	const withoutPr = buildDiscordReleasePayload({
		stage: "prod",
		version: "0.0.21",
		runNumber: "211",
		repository: "vinh19410/teacher-os",
		serverUrl: "https://github.com",
		beforeSha: "",
		headSha: "2222222222222222222222222222222222222222",
		headSubject: "chore(release): promote develop",
		commits: [{ sha: "abc1234", subject: "feat(web): release feature" }],
		timestamp: "2026-11-13T06:20:00.000Z",
	});

	assert.equal(withoutPr.embeds[0].title, "Official Release v0.0.21");
	assert.equal(
		withoutPr.embeds[0].url,
		"https://github.com/vinh19410/teacher-os/commit/2222222222222222222222222222222222222222",
	);
});

test("extractMergedPrNumber extracts PR numbers from merge commits and squash suffixes", () => {
	assert.equal(
		extractMergedPrNumber("Merge pull request #684 from vinh19410/chore/681"),
		684,
	);
	assert.equal(
		extractMergedPrNumber("feat(ci): add discord notification (#686)"),
		686,
	);
	assert.equal(extractMergedPrNumber("fix(api): plain commit"), null);
});

test("filterChangelogCommits strips merge commits and noise commits while keeping non-empty fallback", () => {
	const mixed = filterChangelogCommits([
		{ sha: "1", subject: "Merge pull request #684 from vinh19410/feat" },
		{ sha: "2", subject: "Merge branch 'develop' into feat/foo" },
		{ sha: "3", subject: "Merge remote-tracking branch 'origin/main'" },
		{ sha: "4", subject: "docs(plan): add TDD handover plan (#681)" },
		{ sha: "5", subject: "chore(release): bump version to 0.0.21" },
		{ sha: "6", subject: "feat(security): enforce magic-byte checks (#681)" },
	]);
	assert.deepEqual(
		mixed.map((c) => c.subject),
		["feat(security): enforce magic-byte checks (#681)"],
	);

	const onlyNoise = filterChangelogCommits([
		{ sha: "1", subject: "Merge pull request #685 from vinh19410/plan" },
		{ sha: "2", subject: "docs(plan): add release plan (#685)" },
		{ sha: "3", subject: "chore(release): bump version to 0.0.21" },
	]);
	assert.deepEqual(
		onlyNoise.map((c) => c.subject),
		[
			"docs(plan): add release plan (#685)",
			"chore(release): bump version to 0.0.21",
		],
	);

	const onlyMerge = filterChangelogCommits(
		[{ sha: "1", subject: "Merge pull request #690 from vinh19410/hotfix" }],
		"Merge pull request #690 from vinh19410/hotfix",
	);
	assert.deepEqual(
		onlyMerge.map((c) => c.subject),
		["Merge pull request #690 from vinh19410/hotfix"],
	);
});

test("formatChangelogDescription truncates on bullet boundaries within Discord 4096-char limit", () => {
	const longCommits = Array.from({ length: 120 }, (_, idx) => {
		const num = String(idx + 1).padStart(3, "0");
		return `feat(module-${num}): implement very detailed release changelog item number ${num} with enough words to overflow embed description (#${600 + idx})`;
	});

	const description = formatChangelogDescription(longCommits);
	assert.ok(
		description.length <= DISCORD_EMBED_DESCRIPTION_LIMIT,
		`expected length <= ${DISCORD_EMBED_DESCRIPTION_LIMIT}, got ${description.length}`,
	);
	assert.match(description, /^## Changelog\n\n• feat\(module-001\):/);
	assert.match(description, /\n• … \(\+\d+ more commits\)$/);

	const lines = description.split("\n");
	const lastBullet = lines[lines.length - 1];
	const omittedCount = Number(
		lastBullet.match(/\(\+(\d+) more commits\)/)?.[1],
	);
	const visibleBullets = lines.filter(
		(line) => line.startsWith("• ") && !line.startsWith("• … "),
	);
	assert.equal(visibleBullets.length + omittedCount, longCommits.length);
});

test("validateDiscordWebhookUrl and redactSecrets enforce strict Discord host allowlist and never leak token", () => {
	assert.equal(validateDiscordWebhookUrl(SAMPLE_WEBHOOK), SAMPLE_WEBHOOK);
	assert.equal(
		validateDiscordWebhookUrl(
			"https://ptb.discord.com/api/v10/webhooks/123456/tok_en-1.2?wait=true",
		),
		"https://ptb.discord.com/api/v10/webhooks/123456/tok_en-1.2",
	);

	for (const bad of [
		"",
		"not-a-url",
		"http://discord.com/api/webhooks/123/secret",
		"https://evil.com/api/webhooks/123/secret",
		"https://discord.com.attacker.tld/api/webhooks/123/secret",
		"https://user:pass@discord.com/api/webhooks/123/secret",
		"https://discord.com/api/channels/123/messages",
		"https://discord.com/api/webhooks/123/secret?foo=bar",
		"https://discord.com/api/webhooks/123/secret#frag",
		"https://discord.com:8443/api/webhooks/123/secret",
	]) {
		assert.throws(
			() => validateDiscordWebhookUrl(bad),
			(err) => !err.message.includes("secret"),
			`expected rejection without secret leak for: ${bad}`,
		);
	}

	const leaked = `Failed posting to ${SAMPLE_WEBHOOK} with token super-secret-webhook-token-xyz`;
	const redacted = redactSecrets(leaked, [SAMPLE_WEBHOOK]);
	assert.doesNotMatch(redacted, /super-secret-webhook-token-xyz/);
	assert.match(redacted, /\[REDACTED\]/);
});

test("postDiscordWebhook handles 204, 429 retry, 5xx retry, and immediate 4xx failure", async () => {
	const sleeps = [];
	const sleepImpl = async (ms) => {
		sleeps.push(ms);
	};

	// 204 success
	let calls = 0;
	const okRes = await postDiscordWebhook(
		SAMPLE_WEBHOOK,
		{ embeds: [] },
		{
			sleepImpl,
			fetchImpl: async () => {
				calls++;
				return new Response(null, { status: 204 });
			},
		},
	);
	assert.equal(okRes.ok, true);
	assert.equal(calls, 1);

	// 429 -> 204 retry respecting retry_after
	calls = 0;
	sleeps.length = 0;
	const retryRes = await postDiscordWebhook(
		SAMPLE_WEBHOOK,
		{ embeds: [] },
		{
			sleepImpl,
			fetchImpl: async () => {
				calls++;
				if (calls === 1) {
					return new Response(JSON.stringify({ retry_after: 1.25 }), {
						status: 429,
						headers: { "Content-Type": "application/json" },
					});
				}
				return new Response(null, { status: 204 });
			},
		},
	);
	assert.equal(retryRes.attempts, 2);
	assert.deepEqual(sleeps, [1250]);

	// 5xx -> 204 recovery
	calls = 0;
	sleeps.length = 0;
	const fiveXxRecover = await postDiscordWebhook(
		SAMPLE_WEBHOOK,
		{ embeds: [] },
		{
			sleepImpl,
			fetchImpl: async () => {
				calls++;
				if (calls <= 2) {
					return new Response("Bad Gateway", { status: 502 });
				}
				return new Response(null, { status: 204 });
			},
		},
	);
	assert.equal(fiveXxRecover.ok, true);
	assert.equal(fiveXxRecover.attempts, 3);
	assert.deepEqual(sleeps, [1000, 2000]);

	// 5xx exhausts maxAttempts
	calls = 0;
	sleeps.length = 0;
	await assert.rejects(
		() =>
			postDiscordWebhook(
				SAMPLE_WEBHOOK,
				{ embeds: [] },
				{
					sleepImpl,
					fetchImpl: async () => {
						calls++;
						return new Response("Service Unavailable", { status: 503 });
					},
				},
			),
		/HTTP 503/,
	);
	assert.equal(calls, 3);
	assert.deepEqual(sleeps, [1000, 2000]);

	// 404 fails immediately without retrying
	calls = 0;
	await assert.rejects(
		() =>
			postDiscordWebhook(
				SAMPLE_WEBHOOK,
				{ embeds: [] },
				{
					sleepImpl,
					fetchImpl: async () => {
						calls++;
						return new Response("Unknown Webhook", { status: 404 });
					},
				},
			),
		/HTTP 404/,
	);
	assert.equal(calls, 1);
});

test("runNotifyDiscordChangelog handles --dry-run, missing secret, and CI fail-open vs --strict", async () => {
	const tempDir = mkdtempSync(join(tmpdir(), "discord-notify-cli-"));
	try {
		writeFileSync(
			join(tempDir, "package.json"),
			JSON.stringify({ name: "teacher-os", version: "0.0.21" }),
		);
		const fakeExecGit = (args) => {
			if (args[0] === "rev-parse" && args[1] === "HEAD") {
				return "2222222222222222222222222222222222222222\n";
			}
			if (args[0] === "rev-parse" && args[1] === "--is-shallow-repository") {
				return "false\n";
			}
			if (args[0] === "log" && args[1] === "-1") {
				return "feat(ci): test commit (#686)\n";
			}
			if (args[0] === "rev-list") {
				return "2222222222222222222222222222222222222222 1111111111111111111111111111111111111111\n";
			}
			if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
				return "";
			}
			if (args[0] === "log" && args[1] === "--no-merges") {
				return "2222222222222222222222222222222222222222\tfeat(ci): test commit (#686)\n";
			}
			return "";
		};

		const makeCapture = () => {
			let text = "";
			return {
				stream: {
					write(chunk) {
						text += chunk;
					},
				},
				read: () => text,
			};
		};

		// --dry-run without webhook
		const dryOut = makeCapture();
		const dryResult = await runNotifyDiscordChangelog(
			["--stage", "staging", "--dry-run"],
			{
				cwd: tempDir,
				env: {
					GITHUB_RUN_NUMBER: "77",
					GITHUB_SHA: "2222222222222222222222222222222222222222",
					BEFORE_SHA: "1111111111111111111111111111111111111111",
				},
				execGitImpl: fakeExecGit,
				stdout: dryOut.stream,
				stderr: makeCapture().stream,
			},
		);
		assert.equal(dryResult.exitCode, 0);
		assert.equal(dryResult.dryRun, true);
		const parsed = JSON.parse(dryOut.read());
		assert.equal(parsed.embeds[0].title, "Beta Release v0.0.21-beta.77");

		// Missing webhook in default CI mode -> exit 0 + ::notice::
		const skipOut = makeCapture();
		const skipRes = await runNotifyDiscordChangelog(["--stage", "prod"], {
			cwd: tempDir,
			env: {
				GITHUB_SHA: "2222222222222222222222222222222222222222",
			},
			execGitImpl: fakeExecGit,
			stdout: skipOut.stream,
			stderr: makeCapture().stream,
		});
		assert.equal(skipRes.exitCode, 0);
		assert.equal(skipRes.skipped, true);
		assert.match(skipOut.read(), /^::notice::/);

		// Missing webhook in --strict mode -> exit 1 + ::error::
		const strictErr = makeCapture();
		const strictSkip = await runNotifyDiscordChangelog(
			["--stage", "prod", "--strict"],
			{
				cwd: tempDir,
				env: {
					GITHUB_SHA: "2222222222222222222222222222222222222222",
				},
				execGitImpl: fakeExecGit,
				stdout: makeCapture().stream,
				stderr: strictErr.stream,
			},
		);
		assert.equal(strictSkip.exitCode, 1);
		assert.match(strictErr.read(), /^::error::/);

		// 502 error across 3 attempts -> exit 0 + ::warning:: without secret leak
		const warnOut = makeCapture();
		const warnRes = await runNotifyDiscordChangelog(["--stage", "staging"], {
			cwd: tempDir,
			env: {
				DISCORD_WEBHOOK_URL: SAMPLE_WEBHOOK,
				GITHUB_SHA: "2222222222222222222222222222222222222222",
			},
			execGitImpl: fakeExecGit,
			sleepImpl: async () => {},
			fetchImpl: async () => {
				throw new Error(`network down for ${SAMPLE_WEBHOOK}`);
			},
			stdout: warnOut.stream,
			stderr: makeCapture().stream,
		});
		assert.equal(warnRes.exitCode, 0);
		assert.equal(warnRes.ok, false);
		assert.match(warnOut.read(), /^::warning::/);
		assert.doesNotMatch(warnOut.read(), /super-secret-webhook-token-xyz/);

		// Same failure in --strict mode -> exit 1
		const strictFailErr = makeCapture();
		const strictFail = await runNotifyDiscordChangelog(
			["--stage", "staging", "--strict"],
			{
				cwd: tempDir,
				env: {
					DISCORD_WEBHOOK_URL: SAMPLE_WEBHOOK,
					GITHUB_SHA: "2222222222222222222222222222222222222222",
				},
				execGitImpl: fakeExecGit,
				sleepImpl: async () => {},
				fetchImpl: async () => new Response("Bad Gateway", { status: 502 }),
				stdout: makeCapture().stream,
				stderr: strictFailErr.stream,
			},
		);
		assert.equal(strictFail.exitCode, 1);
		assert.match(strictFailErr.read(), /^::error::/);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("resolveGitReleaseContext resolves commits across shallow clone with beforeSha and workflow_dispatch merge fallback", () => {
	const root = mkdtempSync(join(tmpdir(), "discord-git-shallow-"));
	try {
		const upstream = join(root, "upstream");
		const shallowBefore = join(root, "shallow-before");
		const shallowDispatch = join(root, "shallow-dispatch");
		const git = (cwd, args) =>
			execFileSync("git", args, {
				cwd,
				encoding: "utf8",
				env: {
					...process.env,
					GIT_AUTHOR_NAME: "Test Bot",
					GIT_AUTHOR_EMAIL: "bot@example.com",
					GIT_COMMITTER_NAME: "Test Bot",
					GIT_COMMITTER_EMAIL: "bot@example.com",
				},
			}).trim();

		git(root, ["init", "-b", "develop", upstream]);
		writeFileSync(join(upstream, "a.txt"), "1\n");
		git(upstream, ["add", "."]);
		git(upstream, ["commit", "-m", "chore: initial commit"]);
		const beforeSha = git(upstream, ["rev-parse", "HEAD"]);

		git(upstream, ["checkout", "-b", "feat/686"]);
		writeFileSync(join(upstream, "b.txt"), "2\n");
		git(upstream, ["add", "."]);
		git(upstream, [
			"commit",
			"-m",
			"feat(ci): add discord changelog script (#686)",
		]);
		writeFileSync(join(upstream, "c.txt"), "3\n");
		git(upstream, ["add", "."]);
		git(upstream, ["commit", "-m", "test(ci): add shallow clone test (#686)"]);

		git(upstream, ["checkout", "develop"]);
		git(upstream, [
			"merge",
			"--no-ff",
			"feat/686",
			"-m",
			"Merge pull request #686 from vinh19410/feat/686",
		]);
		const headSha = git(upstream, ["rev-parse", "HEAD"]);

		// Shallow clone depth=1 mimicking actions/checkout@v7
		git(root, ["clone", "--depth=1", `file://${upstream}`, shallowBefore]);
		const eventFile = join(root, "push-event.json");
		writeFileSync(eventFile, JSON.stringify({ before: beforeSha }));

		const pushCtx = resolveGitReleaseContext({
			cwd: shallowBefore,
			env: {
				GITHUB_SHA: headSha,
				GITHUB_EVENT_PATH: eventFile,
			},
		});
		assert.equal(pushCtx.beforeSha, beforeSha);
		assert.equal(pushCtx.headSha, headSha);
		assert.deepEqual(
			pushCtx.commits.map((c) => c.subject),
			[
				"test(ci): add shallow clone test (#686)",
				"feat(ci): add discord changelog script (#686)",
			],
		);

		// Separate shallow clone depth=1 simulating workflow_dispatch (no beforeSha)
		git(root, ["clone", "--depth=1", `file://${upstream}`, shallowDispatch]);
		const dispatchCtx = resolveGitReleaseContext({
			cwd: shallowDispatch,
			env: {
				GITHUB_SHA: headSha,
			},
		});
		assert.equal(dispatchCtx.beforeSha, "");
		assert.deepEqual(
			dispatchCtx.commits.map((c) => c.subject),
			[
				"test(ci): add shallow clone test (#686)",
				"feat(ci): add discord changelog script (#686)",
			],
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
