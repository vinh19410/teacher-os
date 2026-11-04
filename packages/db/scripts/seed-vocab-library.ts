/**
 * Idempotent CLI for seeding the built-in vocabulary library (issue #361, #573).
 * Reads the 3 committed CSV files under `packages/db/seed-data/vocab-library/`
 * (20 courses / 968 lessons / 10,160 words) and upserts deterministic rows
 * (`libcourse-<id>`, `libdeck-<id>`, `libword-<id>`) into either a local SQLite/libsql
 * database file or a remote Cloudflare D1 database via the REST `/query` API:
 *
 *   # Local SQLite (alchemy dev / local.db):
 *   pnpm --filter @teacher-os/db exec tsx scripts/seed-vocab-library.ts --file <sqlite-path> --verify
 *
 *   # Cloudflare D1 staging (auto-resolves staging DB fail-closed; PROD blocked by license gate):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/seed-vocab-library.ts --d1 --d1-stage staging --if-needed --verify
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import {
	assertNonProdD1Database,
	createLibsqlRunner,
	ensureVocabLibrarySeeded,
	type LibraryTableName,
	type ParsedVocabLibraryData,
	resolveStagingD1DatabaseId,
	type SqlRunner,
	type VerifyCountsResult,
} from "../src/seed/vocab-library";

export interface CliArgs {
	filePath: string | null;
	d1: boolean;
	d1Stage: string | null;
	prune: boolean;
	ifNeeded: boolean;
	verify: boolean;
	help: boolean;
}

const USAGE_TEXT =
	"usage: tsx packages/db/scripts/seed-vocab-library.ts (--file <sqlite-path> | --d1 [--d1-stage staging]) [--prune] [--if-needed] [--verify]\n";

export function parseArgs(argv: readonly string[]): CliArgs {
	let filePath: string | null = null;
	let d1 = false;
	let d1Stage: string | null = null;
	let prune = false;
	let ifNeeded = false;
	let verify = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--file") {
			const next = argv[i + 1];
			if (!next || next.startsWith("--")) {
				throw new Error("Missing path argument for --file <sqlite-path>");
			}
			filePath = next;
			i++;
		} else if (arg === "--d1") {
			d1 = true;
		} else if (arg === "--d1-stage") {
			const next = argv[i + 1];
			if (!next || next.startsWith("--")) {
				throw new Error("Missing stage argument for --d1-stage <stage>");
			}
			if (next !== "staging") {
				throw new Error(
					`Unsupported --d1-stage "${next}": automatic D1 lookup is restricted to "staging" (production is blocked by license gate).`,
				);
			}
			d1Stage = next;
			i++;
		} else if (arg === "--prune") {
			prune = true;
		} else if (arg === "--if-needed") {
			ifNeeded = true;
		} else if (arg === "--verify") {
			verify = true;
		} else if (arg === "--help" || arg === "-h") {
			return {
				filePath: null,
				d1: false,
				d1Stage: null,
				prune: false,
				ifNeeded: false,
				verify: false,
				help: true,
			};
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	if (!filePath && !d1) {
		throw new Error(
			"Must specify either --file <sqlite-path> or --d1. Run with --help for usage.",
		);
	}
	if (filePath && d1) {
		throw new Error("Specify only one transport: either --file or --d1.");
	}
	if (d1Stage && !d1) {
		throw new Error("Flag --d1-stage requires --d1.");
	}
	if (ifNeeded && prune) {
		throw new Error("Cannot combine --if-needed with --prune.");
	}

	return { filePath, d1, d1Stage, prune, ifNeeded, verify, help: false };
}

interface D1QueryResponse {
	success?: boolean;
	errors?: Array<{ code?: number; message?: string }>;
	result?: Array<{
		success?: boolean;
		results?: Array<Record<string, unknown>>;
	}>;
}

export function redactSensitive(
	message: string,
	secrets: readonly string[],
): string {
	let output = message;
	for (const secret of secrets) {
		const trimmed = secret.trim();
		if (trimmed.length >= 4) {
			output = output.split(trimmed).join("[REDACTED]");
		}
	}
	return output;
}

function sleep(ms: number): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	const { promise, resolve: resolveTimer } = Promise.withResolvers<void>();
	setTimeout(resolveTimer, ms);
	return promise;
}

function isNonRetryableClientError(err: Error): boolean {
	if (!err.message.startsWith("D1 query failed (4")) {
		return false;
	}
	return !err.message.startsWith("D1 query failed (429)");
}

export function createD1RestRunner(options: {
	accountId: string;
	databaseId: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
	retryDelayMs?: number;
}): SqlRunner {
	const fetchFn = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 20_000;
	const retryDelayMs = options.retryDelayMs ?? 1_000;
	const secrets = [options.databaseId, options.apiToken];
	const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/d1/database/${encodeURIComponent(options.databaseId)}/query`;

	async function executeSingleStatement(
		sql: string,
	): Promise<Array<Record<string, unknown>>> {
		let lastError: Error | null = null;
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const res = await fetchFn(endpoint, {
					method: "POST",
					headers: {
						authorization: `Bearer ${options.apiToken}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ sql }),
					signal: AbortSignal.timeout(timeoutMs),
				});

				if ((res.status >= 500 || res.status === 429) && attempt === 0) {
					await sleep(retryDelayMs);
					continue;
				}

				const rawText = await res.text();
				let payload: D1QueryResponse = {};
				try {
					payload = JSON.parse(rawText) as D1QueryResponse;
				} catch {
					throw new Error(
						redactSensitive(
							`D1 query failed (${res.status}): ${rawText.slice(0, 300)}`,
							secrets,
						),
					);
				}

				if (!res.ok || payload.success !== true) {
					const errMsg =
						payload.errors?.map((e) => e.message ?? "error").join("; ") ??
						`HTTP ${res.status}`;
					throw new Error(
						redactSensitive(
							`D1 query failed (${res.status}): ${errMsg}`,
							secrets,
						),
					);
				}
				const firstResult = payload.result?.[0];
				if (firstResult && firstResult.success === false) {
					throw new Error("D1 statement execution reported success=false");
				}
				return firstResult?.results ?? [];
			} catch (err) {
				const rawErr = err instanceof Error ? err : new Error(String(err));
				lastError = new Error(redactSensitive(rawErr.message, secrets));
				if (attempt === 0 && !isNonRetryableClientError(lastError)) {
					await sleep(retryDelayMs);
					continue;
				}
				throw lastError;
			}
		}
		throw lastError ?? new Error("D1 query failed");
	}

	return {
		async run(statements: string[]) {
			for (const stmt of statements) {
				await executeSingleStatement(stmt);
			}
		},
		async queryIds(table: LibraryTableName): Promise<string[]> {
			const rows = await executeSingleStatement(`SELECT id FROM ${table};`);
			return rows.map((r) => String(r.id));
		},
		async queryRows(sql: string): Promise<Array<Record<string, unknown>>> {
			return executeSingleStatement(sql);
		},
	};
}

async function assertLocalSchemaReady(filePath: string): Promise<void> {
	const client = createClient({ url: `file:${filePath}` });
	try {
		const orgTable = await client.execute(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='organization'",
		);
		if (orgTable.rows.length === 0) {
			throw new Error(
				`Target SQLite file "${filePath}" does not contain table "organization". Did you pick metadata.sqlite or an unmigrated DB?`,
			);
		}
		const libTable = await client.execute(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='vocab_library_course'",
		);
		if (libTable.rows.length === 0) {
			throw new Error(
				`Target SQLite file "${filePath}" is missing "vocab_library_course" (migration 0037 not applied).`,
			);
		}
	} finally {
		client.close();
	}
}

function formatVerifyReport(report: VerifyCountsResult): string {
	return [
		"Table                  | Expected | Actual | Missing | Extra | Status",
		"-----------------------+----------+--------+---------+-------+-------",
		`vocab_library_course   | ${String(report.tables.course.expected).padStart(8)} | ${String(report.tables.course.actual).padStart(6)} | ${String(report.tables.course.missing).padStart(7)} | ${String(report.tables.course.extra).padStart(5)} | ${report.tables.course.match ? "OK" : "MISMATCH"}`,
		`vocab_library_deck     | ${String(report.tables.deck.expected).padStart(8)} | ${String(report.tables.deck.actual).padStart(6)} | ${String(report.tables.deck.missing).padStart(7)} | ${String(report.tables.deck.extra).padStart(5)} | ${report.tables.deck.match ? "OK" : "MISMATCH"}`,
		`vocab_library_word     | ${String(report.tables.word.expected).padStart(8)} | ${String(report.tables.word.actual).padStart(6)} | ${String(report.tables.word.missing).padStart(7)} | ${String(report.tables.word.extra).padStart(5)} | ${report.tables.word.match ? "OK" : "MISMATCH"}`,
		`Summary: course ${report.tables.course.actual}/${report.tables.course.expected}, deck ${report.tables.deck.actual}/${report.tables.deck.expected}, word ${report.tables.word.actual}/${report.tables.word.expected}`,
	].join("\n");
}

async function resolveD1Target(
	args: CliArgs,
	env: Record<string, string | undefined>,
	fetchImpl: typeof fetch,
	timeoutMs: number,
): Promise<{ accountId: string; databaseId: string; apiToken: string }> {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
	const explicitDbId = env.D1_DATABASE_ID?.trim();
	const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();

	if (explicitDbId && args.d1Stage) {
		throw new Error(
			"Cannot combine D1_DATABASE_ID with --d1-stage; unset D1_DATABASE_ID when targeting staging via --d1-stage staging.",
		);
	}
	if (!accountId || !apiToken) {
		throw new Error(
			"Missing required environment variables for --d1: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN",
		);
	}
	if (!args.d1Stage && !explicitDbId) {
		throw new Error(
			"Missing target database for --d1: pass --d1-stage staging or set D1_DATABASE_ID.",
		);
	}

	const secrets = [explicitDbId ?? "", apiToken];
	try {
		if (args.d1Stage) {
			const databaseId = await resolveStagingD1DatabaseId({
				stage: args.d1Stage,
				accountId,
				apiToken,
				fetchImpl,
				timeoutMs,
			});
			return { accountId, databaseId, apiToken };
		}
		const databaseId = explicitDbId ?? "";
		await assertNonProdD1Database({
			accountId,
			databaseId,
			apiToken,
			fetchImpl,
			timeoutMs,
		});
		return { accountId, databaseId, apiToken };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(redactSensitive(msg, secrets));
	}
}

export async function runSeedCli(
	argv: readonly string[],
	deps?: {
		env?: Record<string, string | undefined>;
		fetchImpl?: typeof fetch;
		writeStdout?: (chunk: string) => void;
		timeoutMs?: number;
		retryDelayMs?: number;
		data?: ParsedVocabLibraryData;
	},
): Promise<void> {
	const writeStdout =
		deps?.writeStdout ?? ((chunk: string) => process.stdout.write(chunk));
	const args = parseArgs(argv);
	if (args.help) {
		writeStdout(USAGE_TEXT);
		return;
	}

	const env = deps?.env ?? process.env;
	const fetchImpl = deps?.fetchImpl ?? fetch;
	const timeoutMs = deps?.timeoutMs ?? 20_000;
	const retryDelayMs = deps?.retryDelayMs ?? 1_000;

	let runner: SqlRunner;
	let closeClient: (() => void) | undefined;
	const secretsToRedact: string[] = [];

	if (args.filePath) {
		await assertLocalSchemaReady(args.filePath);
		const client = createClient({ url: `file:${args.filePath}` });
		runner = createLibsqlRunner(client);
		closeClient = () => client.close();
	} else {
		const target = await resolveD1Target(args, env, fetchImpl, timeoutMs);
		secretsToRedact.push(target.databaseId, target.apiToken);
		if (env.GITHUB_ACTIONS === "true") {
			const safeMaskId = target.databaseId.replace(/[\r\n]/g, "");
			if (safeMaskId.length > 0) {
				writeStdout(`::add-mask::${safeMaskId}\n`);
			}
		}
		writeStdout(
			`[vocab-library-seed] verified target D1 database (${args.d1Stage ?? "explicit-non-prod"})\n`,
		);
		runner = createD1RestRunner({
			accountId: target.accountId,
			databaseId: target.databaseId,
			apiToken: target.apiToken,
			fetchImpl,
			timeoutMs,
			retryDelayMs,
		});
	}

	try {
		const result = await ensureVocabLibrarySeeded(runner, {
			data: deps?.data,
			prune: args.prune,
			ifNeeded: args.ifNeeded,
			verify: args.verify,
		});
		if (!result.seeded) {
			writeStdout(
				`[vocab-library-seed] already seeded and content-verified (courses=${result.counts.course}, decks=${result.counts.deck}, words=${result.counts.word}); skipping upsert\n`,
			);
		} else {
			writeStdout(
				`[vocab-library-seed] executed ${result.statementsExecuted} statements (courses=${result.counts.course}, decks=${result.counts.deck}, words=${result.counts.word})\n`,
			);
		}

		if (result.verification) {
			writeStdout(`${formatVerifyReport(result.verification)}\n`);
			if (!result.verification.ok) {
				throw new Error("Verification failed: database rows do not match CSV.");
			}
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(redactSensitive(msg, secretsToRedact));
	} finally {
		closeClient?.();
	}
}

const entryArg = process.argv[1];
const isDirectExecution =
	entryArg !== undefined &&
	import.meta.url === pathToFileURL(resolve(entryArg)).href;

if (isDirectExecution) {
	runSeedCli(process.argv.slice(2)).catch((err) => {
		console.error(
			`[vocab-library-seed] ERROR: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	});
}
