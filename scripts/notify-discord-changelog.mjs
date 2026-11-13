import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DISCORD_EMBED_DESCRIPTION_LIMIT = 4096;
export const DISCORD_EMBED_TITLE_LIMIT = 256;
export const SINGLE_COMMIT_SUBJECT_MAX = 300;
export const STAGING_COLOR = 0xf59e0b;
export const PROD_COLOR = 0x22c55e;
export const RELEASE_AUTHOR_NAME = "Teacher OS Releases";

const ALLOWED_DISCORD_HOSTS = new Set([
	"discord.com",
	"ptb.discord.com",
	"canary.discord.com",
	"discordapp.com",
	"ptb.discordapp.com",
	"canary.discordapp.com",
]);

const WEBHOOK_PATH_RE = /^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9._-]+$/;
const HEX40_RE = /^[0-9a-f]{40}$/i;
const ZERO_SHA = "0".repeat(40);
const MERGE_COMMIT_RE =
	/^Merge (?:pull request|branch|remote-tracking branch)\b/i;
const NOISE_COMMIT_RE =
	/^(?:docs\(plan\):|chore\(release\):\s*bump version\b)/i;

export function redactSecrets(text, extraSecrets = []) {
	let output = String(text ?? "").replace(
		/https?:\/\/[^\s"'<>]+\/api(?:\/v\d+)?\/webhooks\/[^\s"'<>]+/gi,
		"https://discord.com/api/webhooks/[REDACTED]",
	);
	const tokens = [];
	for (const secret of extraSecrets) {
		if (!secret || typeof secret !== "string") continue;
		const trimmed = secret.trim();
		if (!trimmed) continue;
		tokens.push(trimmed);
		const webhookTokenMatch = trimmed.match(
			/\/api(?:\/v\d+)?\/webhooks\/\d+\/([A-Za-z0-9._-]+)/,
		);
		if (webhookTokenMatch?.[1] && webhookTokenMatch[1].length >= 8) {
			tokens.push(webhookTokenMatch[1]);
		}
	}
	for (const token of tokens) {
		output = output.split(token).join("[REDACTED]");
		try {
			const encoded = encodeURIComponent(token);
			if (encoded && encoded !== token) {
				output = output.split(encoded).join("[REDACTED]");
			}
		} catch {
			// Ignore malformed URI encoding edge cases.
		}
	}
	return output;
}

export function validateDiscordWebhookUrl(rawUrl) {
	if (typeof rawUrl !== "string" || !rawUrl.trim()) {
		throw new Error("Discord webhook URL is empty");
	}
	let parsed;
	try {
		parsed = new URL(rawUrl.trim());
	} catch {
		throw new Error("Discord webhook URL is not a valid URL");
	}
	if (parsed.protocol !== "https:") {
		throw new Error("Discord webhook URL must use HTTPS");
	}
	if (parsed.username || parsed.password) {
		throw new Error("Discord webhook URL must not contain userinfo");
	}
	if (!ALLOWED_DISCORD_HOSTS.has(parsed.hostname.toLowerCase())) {
		throw new Error(
			"Discord webhook URL host is not an allowed Discord domain",
		);
	}
	if (parsed.port) {
		throw new Error("Discord webhook URL must not specify a non-default port");
	}
	if (!WEBHOOK_PATH_RE.test(parsed.pathname)) {
		throw new Error(
			"Discord webhook URL path does not match /api/webhooks/<id>/<token>",
		);
	}
	if (parsed.hash) {
		throw new Error("Discord webhook URL must not contain a fragment");
	}
	if (parsed.search && parsed.search !== "?wait=true") {
		throw new Error(
			"Discord webhook URL must not contain unexpected query parameters",
		);
	}
	return `${parsed.origin}${parsed.pathname}`;
}

export function extractMergedPrNumber(subject) {
	const text = String(subject ?? "").trim();
	if (!text) return null;
	const mergeMatch = text.match(/^Merge pull request #(\d+)\b/i);
	if (mergeMatch) {
		const num = Number.parseInt(mergeMatch[1], 10);
		return Number.isSafeInteger(num) && num > 0 ? num : null;
	}
	const suffixMatch = text.match(/\(#(\d+)\)\s*$/);
	if (suffixMatch) {
		const num = Number.parseInt(suffixMatch[1], 10);
		return Number.isSafeInteger(num) && num > 0 ? num : null;
	}
	return null;
}

export function filterChangelogCommits(commits, fallbackSubject = "") {
	const normalized = (Array.isArray(commits) ? commits : [])
		.map((entry) => ({
			sha: String(entry?.sha ?? "").trim(),
			subject: String(entry?.subject ?? "")
				.replace(/\s+/g, " ")
				.trim(),
		}))
		.filter((entry) => entry.subject.length > 0);

	const nonMerge = normalized.filter(
		(entry) => !MERGE_COMMIT_RE.test(entry.subject),
	);

	if (nonMerge.length > 0) {
		const meaningful = nonMerge.filter(
			(entry) => !NOISE_COMMIT_RE.test(entry.subject),
		);
		return meaningful.length > 0 ? meaningful : nonMerge;
	}

	const fallback = String(fallbackSubject ?? "")
		.replace(/\s+/g, " ")
		.trim();
	if (fallback) {
		return [{ sha: "", subject: fallback }];
	}
	return normalized;
}

function truncateCodePoints(text, maxChars) {
	const chars = Array.from(text);
	if (chars.length <= maxChars) return text;
	return `${chars.slice(0, Math.max(0, maxChars - 1)).join("")}…`;
}

export function formatChangelogDescription(
	subjects,
	maxLen = DISCORD_EMBED_DESCRIPTION_LIMIT,
) {
	const header = "## Changelog\n\n";
	const cleanSubjects = (Array.isArray(subjects) ? subjects : [])
		.map((s) =>
			String(s ?? "")
				.replace(/\s+/g, " ")
				.trim(),
		)
		.filter(Boolean)
		.map((s) =>
			s.length > SINGLE_COMMIT_SUBJECT_MAX
				? truncateCodePoints(s, SINGLE_COMMIT_SUBJECT_MAX)
				: s,
		);

	if (cleanSubjects.length === 0) {
		return `${header}• No commit details available`.slice(0, maxLen);
	}

	const bullets = cleanSubjects.map((s) => `• ${s}`);
	const fullText = `${header}${bullets.join("\n")}`;
	if (fullText.length <= maxLen) {
		return fullText;
	}

	const formatOmitted = (count) =>
		`\n• … (+${count} more ${count === 1 ? "commit" : "commits"})`;

	for (let keep = bullets.length - 1; keep >= 1; keep--) {
		const omitted = bullets.length - keep;
		const suffix = formatOmitted(omitted);
		const candidate = `${header}${bullets.slice(0, keep).join("\n")}${suffix}`;
		if (candidate.length <= maxLen) {
			return candidate;
		}
	}

	return `${header}• … (+${bullets.length} more ${bullets.length === 1 ? "commit" : "commits"})`.slice(
		0,
		maxLen,
	);
}

export function buildDiscordReleasePayload({
	stage,
	version,
	runNumber,
	repository,
	serverUrl,
	beforeSha,
	headSha,
	headSubject,
	commits,
	timestamp = new Date().toISOString(),
}) {
	if (stage !== "staging" && stage !== "prod") {
		throw new Error(`Unsupported stage: ${stage}`);
	}
	const cleanRepo = String(repository || "vinh19410/teacher-os").replace(
		/^\/+|\/+$/g,
		"",
	);
	const cleanServerUrl = String(serverUrl || "https://github.com").replace(
		/\/+$/,
		"",
	);
	const cleanVersion = String(version || "0.0.0").trim();
	const cleanRunNumber = String(runNumber || "local").trim();
	const prNumber = extractMergedPrNumber(headSubject || "");
	const filteredCommits = filterChangelogCommits(commits, headSubject);

	let url = `${cleanServerUrl}/${cleanRepo}/commit/${headSha}`;
	if (prNumber) {
		url = `${cleanServerUrl}/${cleanRepo}/pull/${prNumber}`;
	} else if (
		beforeSha &&
		HEX40_RE.test(beforeSha) &&
		beforeSha !== ZERO_SHA &&
		beforeSha !== headSha
	) {
		url = `${cleanServerUrl}/${cleanRepo}/compare/${beforeSha.slice(0, 12)}...${headSha.slice(0, 12)}`;
	}

	const rawTitle =
		stage === "staging"
			? `Beta Release v${cleanVersion}-beta.${cleanRunNumber}`
			: prNumber
				? `Official Release v${cleanVersion} (#${prNumber})`
				: `Official Release v${cleanVersion}`;
	const title =
		rawTitle.length > DISCORD_EMBED_TITLE_LIMIT
			? `${rawTitle.slice(0, DISCORD_EMBED_TITLE_LIMIT - 1)}…`
			: rawTitle;

	const description = formatChangelogDescription(
		filteredCommits.map((entry) => entry.subject),
	);

	return {
		username: RELEASE_AUTHOR_NAME,
		allowed_mentions: { parse: [] },
		embeds: [
			{
				title,
				url,
				description,
				color: stage === "staging" ? STAGING_COLOR : PROD_COLOR,
				footer: { text: RELEASE_AUTHOR_NAME },
				timestamp,
			},
		],
	};
}

function parseGitLogLines(output) {
	if (!output) return [];
	return output
		.split(/\r?\n/)
		.filter((line) => line.trim().length > 0)
		.map((line) => {
			const tabIndex = line.indexOf("\t");
			if (tabIndex === -1) {
				return { sha: "", subject: line.trim() };
			}
			return {
				sha: line.slice(0, tabIndex).trim(),
				subject: line.slice(tabIndex + 1).trim(),
			};
		});
}

function readBeforeShaFromEnv(env) {
	const direct = String(env.BEFORE_SHA ?? "").trim();
	if (HEX40_RE.test(direct) && direct !== ZERO_SHA) {
		return direct;
	}
	const eventPath = String(env.GITHUB_EVENT_PATH ?? "").trim();
	if (!eventPath) return "";
	try {
		const raw = readFileSync(eventPath, "utf8");
		const parsed = JSON.parse(raw);
		const candidate = String(parsed?.before ?? "").trim();
		if (HEX40_RE.test(candidate) && candidate !== ZERO_SHA) {
			return candidate;
		}
	} catch {
		// Ignore missing or unreadable GitHub event payload.
	}
	return "";
}

export function resolveGitReleaseContext({
	cwd = process.cwd(),
	env = process.env,
	execGitImpl,
} = {}) {
	const execGit =
		execGitImpl ??
		((args) =>
			execFileSync("git", args, {
				cwd,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			}));

	const tryExecGit = (args) => {
		try {
			return execGit(args);
		} catch {
			return null;
		}
	};

	const envSha = String(env.GITHUB_SHA ?? "").trim();
	const headSha = HEX40_RE.test(envSha)
		? envSha
		: String(execGit(["rev-parse", "HEAD"])).trim();
	const beforeSha = readBeforeShaFromEnv(env);
	const isShallow =
		String(
			tryExecGit(["rev-parse", "--is-shallow-repository"]) ?? "",
		).trim() === "true";

	if (beforeSha && beforeSha !== headSha) {
		const alreadyAncestor =
			tryExecGit(["merge-base", "--is-ancestor", beforeSha, headSha]) !== null;
		if (!alreadyAncestor && isShallow) {
			tryExecGit(["fetch", "--no-tags", "--depth=100", "origin", headSha]);
			tryExecGit(["fetch", "--no-tags", "--depth=100", "origin", beforeSha]);
			if (
				tryExecGit(["merge-base", "--is-ancestor", beforeSha, headSha]) === null
			) {
				tryExecGit(["fetch", "--no-tags", "--deepen=100", "origin"]);
			}
		}
	} else if (isShallow) {
		tryExecGit(["fetch", "--no-tags", "--deepen=50", "origin"]);
	}

	const headSubject = String(
		tryExecGit(["log", "-1", "--format=%s", headSha]) ?? "",
	).trim();
	const revListLine = String(
		tryExecGit(["rev-list", "--parents", "-n", "1", headSha]) ?? "",
	).trim();
	const revTokens = revListLine ? revListLine.split(/\s+/) : [];
	const parentShas = revTokens.slice(1);

	let commits = [];
	if (
		beforeSha &&
		beforeSha !== headSha &&
		tryExecGit(["merge-base", "--is-ancestor", beforeSha, headSha]) !== null
	) {
		const nonMergeOutput = tryExecGit([
			"log",
			"--no-merges",
			"--format=%H%x09%s",
			`${beforeSha}..${headSha}`,
		]);
		commits = parseGitLogLines(nonMergeOutput);
		if (commits.length === 0) {
			const allOutput = tryExecGit([
				"log",
				"--format=%H%x09%s",
				`${beforeSha}..${headSha}`,
			]);
			commits = parseGitLogLines(allOutput);
		}
	} else if (parentShas.length >= 2) {
		const mergeRangeOutput = tryExecGit([
			"log",
			"--no-merges",
			"--format=%H%x09%s",
			`${parentShas[0]}..${headSha}`,
		]);
		commits = parseGitLogLines(mergeRangeOutput);
	}

	if (commits.length === 0) {
		const singleOutput = tryExecGit([
			"log",
			"-1",
			"--format=%H%x09%s",
			headSha,
		]);
		commits = parseGitLogLines(singleOutput);
	}

	return {
		beforeSha,
		headSha,
		headSubject,
		commits,
	};
}

function defaultSleep(ms) {
	return new Promise((resolvePromise) => {
		setTimeout(resolvePromise, ms);
	});
}

async function parseRetryAfterMs(response) {
	const headerVal = response.headers?.get("retry-after");
	if (headerVal) {
		const seconds = Number(headerVal);
		if (Number.isFinite(seconds) && seconds >= 0) {
			return Math.min(Math.max(Math.round(seconds * 1000), 500), 10_000);
		}
	}
	try {
		const body = await response.json();
		const seconds = Number(body?.retry_after);
		if (Number.isFinite(seconds) && seconds >= 0) {
			return Math.min(Math.max(Math.round(seconds * 1000), 500), 10_000);
		}
	} catch {
		// Ignore non-JSON 429 body.
	}
	return 1000;
}

export async function postDiscordWebhook(
	webhookUrl,
	payload,
	{
		fetchImpl = globalThis.fetch,
		sleepImpl = defaultSleep,
		maxAttempts = 3,
	} = {},
) {
	const canonicalUrl = validateDiscordWebhookUrl(webhookUrl);
	let lastError = null;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const response = await fetchImpl(canonicalUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(15_000),
			});

			if (response.status >= 200 && response.status < 300) {
				return { ok: true, status: response.status, attempts: attempt };
			}

			if (response.status === 429) {
				lastError = new Error(
					"Discord webhook rate limited request (HTTP 429)",
				);
				if (attempt < maxAttempts) {
					const waitMs = await parseRetryAfterMs(response);
					await sleepImpl(waitMs);
					continue;
				}
				break;
			}

			if (response.status >= 500) {
				lastError = new Error(
					`Discord webhook returned server error HTTP ${response.status}`,
				);
				if (attempt < maxAttempts) {
					await sleepImpl(attempt * 1000);
					continue;
				}
				break;
			}

			const nonRetryableError = new Error(
				`Discord webhook rejected request with HTTP ${response.status}`,
			);
			nonRetryableError.nonRetryable = true;
			throw nonRetryableError;
		} catch (error) {
			const message = redactSecrets(
				error instanceof Error ? error.message : String(error),
				[webhookUrl, canonicalUrl],
			);
			const wrapped = new Error(message);
			if (error?.nonRetryable === true) {
				throw wrapped;
			}
			lastError = wrapped;
			if (attempt < maxAttempts) {
				await sleepImpl(attempt * 1000);
			}
		}
	}

	throw lastError ?? new Error("Discord webhook request failed");
}

function parseCliArgs(argv) {
	let stage = "";
	let dryRun = false;
	let strict = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--dry-run") {
			dryRun = true;
		} else if (arg === "--strict") {
			strict = true;
		} else if (arg === "--stage") {
			const next = argv[i + 1];
			if (!next || next.startsWith("--")) {
				const err = new Error(
					"Missing value for --stage (expected staging|prod)",
				);
				err.exitCode = 2;
				throw err;
			}
			stage = next;
			i++;
		} else if (arg.startsWith("--stage=")) {
			stage = arg.slice("--stage=".length);
		} else {
			const err = new Error(`Unknown argument: ${arg}`);
			err.exitCode = 2;
			throw err;
		}
	}

	if (stage !== "staging" && stage !== "prod") {
		const err = new Error("Missing or invalid --stage <staging|prod> argument");
		err.exitCode = 2;
		throw err;
	}

	return { stage, dryRun, strict };
}

export async function runNotifyDiscordChangelog(
	argv,
	{
		env = process.env,
		cwd = process.cwd(),
		fetchImpl,
		execGitImpl,
		sleepImpl,
		stdout = process.stdout,
		stderr = process.stderr,
	} = {},
) {
	const { stage, dryRun, strict } = parseCliArgs(argv);
	const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
	const gitCtx = resolveGitReleaseContext({ cwd, env, execGitImpl });

	const payload = buildDiscordReleasePayload({
		stage,
		version: pkg.version,
		runNumber: env.GITHUB_RUN_NUMBER || "local",
		repository: env.GITHUB_REPOSITORY || "vinh19410/teacher-os",
		serverUrl: env.GITHUB_SERVER_URL || "https://github.com",
		beforeSha: gitCtx.beforeSha,
		headSha: gitCtx.headSha,
		headSubject: gitCtx.headSubject,
		commits: gitCtx.commits,
	});

	if (dryRun) {
		stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
		return { exitCode: 0, dryRun: true, payload };
	}

	const rawWebhook = String(env.DISCORD_WEBHOOK_URL ?? "").trim();
	if (!rawWebhook) {
		if (strict) {
			stderr.write(
				"::error::DISCORD_WEBHOOK_URL is required in --strict mode\n",
			);
			return { exitCode: 1, skipped: true };
		}
		stdout.write(
			"::notice::DISCORD_WEBHOOK_URL is not configured; skipping Discord changelog notification.\n",
		);
		return { exitCode: 0, skipped: true };
	}

	try {
		await postDiscordWebhook(rawWebhook, payload, {
			fetchImpl,
			sleepImpl,
		});
		stdout.write(
			`Sent Discord ${stage} release changelog (${payload.embeds[0].title})\n`,
		);
		return { exitCode: 0, ok: true, payload };
	} catch (error) {
		const safeMsg = redactSecrets(
			error instanceof Error ? error.message : String(error),
			[rawWebhook],
		);
		if (strict) {
			stderr.write(
				`::error::Discord changelog notification failed: ${safeMsg}\n`,
			);
			return { exitCode: 1, ok: false };
		}
		stdout.write(
			`::warning::Discord changelog notification failed (non-blocking): ${safeMsg}\n`,
		);
		return { exitCode: 0, ok: false };
	}
}

const isEntrypoint =
	process.argv[1] &&
	fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isEntrypoint) {
	try {
		const result = await runNotifyDiscordChangelog(process.argv.slice(2));
		process.exitCode = result.exitCode;
	} catch (error) {
		const safeMessage = redactSecrets(
			error instanceof Error ? error.message : String(error),
			// biome-ignore lint/suspicious/noUndeclaredEnvVars: standalone CI script, not a Turbo task
			[process.env.DISCORD_WEBHOOK_URL],
		);
		process.stderr.write(`${safeMessage}\n`);
		process.exitCode = typeof error?.exitCode === "number" ? error.exitCode : 1;
	}
}
