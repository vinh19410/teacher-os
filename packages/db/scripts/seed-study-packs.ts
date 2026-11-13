/**
 * Idempotent CLI for seeding built-in system study packs & library exercises (#702).
 * Reads JSON bundle files under `packages/db/seed-data/study-packs/` and upserts
 * deterministic rows (`syspack-foun-gt1-*`, `sysex-foun-gt1-*`, `syspackitem-foun-gt1-*`)
 * into a local SQLite/libsql file or a remote non-production Cloudflare D1 database:
 *
 *   # Local SQLite:
 *   pnpm --filter @teacher-os/db exec tsx scripts/seed-study-packs.ts --file <sqlite-path> --verify
 *
 *   # Cloudflare D1 staging (auto-resolves staging DB fail-closed; PROD blocked by license gate):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/seed-study-packs.ts --d1 --d1-stage staging --if-needed --verify
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import {
	assertNonProdD1Database,
	createLibsqlRunner,
	ensureStudyPacksSeeded,
	type ParsedStudyPackSeedData,
	resolveStagingD1DatabaseId,
	type StudyPackSqlRunner,
	type VerifyStudyPackCountsResult,
} from "../src/seed/study-packs";
import {
	type CliArgs,
	createD1RestRunner,
	parseArgs,
	redactSensitive,
} from "./seed-vocab-library";

const USAGE_TEXT =
	"usage: tsx packages/db/scripts/seed-study-packs.ts (--file <sqlite-path> | --d1 [--d1-stage staging]) [--prune] [--if-needed] [--verify]\n";

async function assertLocalSchemaReady(filePath: string): Promise<void> {
	const client = createClient({ url: `file:${filePath}` });
	try {
		const studyPackTable = await client.execute(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='study_pack'",
		);
		if (studyPackTable.rows.length === 0) {
			throw new Error(
				`Target SQLite file "${filePath}" is missing "study_pack" (run DB migrations first).`,
			);
		}
		const colsRes = await client.execute("PRAGMA table_info('study_pack');");
		const hasLevel = colsRes.rows.some((r) => String(r.name) === "level");
		if (!hasLevel) {
			throw new Error(
				`Target SQLite file "${filePath}" is missing "study_pack.level" (migration 0069 not applied).`,
			);
		}
	} finally {
		client.close();
	}
}

function formatVerifyReport(report: VerifyStudyPackCountsResult): string {
	return [
		"Table               | Expected | Actual | Missing | Extra | Status",
		"--------------------+----------+--------+---------+-------+-------",
		`study_pack          | ${String(report.tables.pack.expected).padStart(8)} | ${String(report.tables.pack.actual).padStart(6)} | ${String(report.tables.pack.missing).padStart(7)} | ${String(report.tables.pack.extra).padStart(5)} | ${report.tables.pack.match ? "OK" : "MISMATCH"}`,
		`study_pack_exercise | ${String(report.tables.exercise.expected).padStart(8)} | ${String(report.tables.exercise.actual).padStart(6)} | ${String(report.tables.exercise.missing).padStart(7)} | ${String(report.tables.exercise.extra).padStart(5)} | ${report.tables.exercise.match ? "OK" : "MISMATCH"}`,
		`study_pack_item     | ${String(report.tables.item.expected).padStart(8)} | ${String(report.tables.item.actual).padStart(6)} | ${String(report.tables.item.missing).padStart(7)} | ${String(report.tables.item.extra).padStart(5)} | ${report.tables.item.match ? "OK" : "MISMATCH"}`,
		`Summary: pack ${report.tables.pack.actual}/${report.tables.pack.expected}, exercise ${report.tables.exercise.actual}/${report.tables.exercise.expected}, item ${report.tables.item.actual}/${report.tables.item.expected}`,
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

export async function runSeedStudyPacksCli(
	argv: readonly string[],
	deps?: {
		env?: Record<string, string | undefined>;
		fetchImpl?: typeof fetch;
		writeStdout?: (chunk: string) => void;
		timeoutMs?: number;
		retryDelayMs?: number;
		data?: ParsedStudyPackSeedData;
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

	let runner: StudyPackSqlRunner;
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
			`[study-packs-seed] verified target D1 database (${args.d1Stage ?? "explicit-non-prod"})\n`,
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
		const result = await ensureStudyPacksSeeded(runner, {
			data: deps?.data,
			prune: args.prune,
			ifNeeded: args.ifNeeded,
			verify: args.verify,
		});
		if (!result.seeded) {
			writeStdout(
				`[study-packs-seed] already seeded and content-verified (packs=${result.counts.pack}, exercises=${result.counts.exercise}, items=${result.counts.item}); skipping upsert\n`,
			);
		} else {
			writeStdout(
				`[study-packs-seed] executed ${result.statementsExecuted} statements (packs=${result.counts.pack}, exercises=${result.counts.exercise}, items=${result.counts.item})\n`,
			);
		}

		if (result.verification) {
			writeStdout(`${formatVerifyReport(result.verification)}\n`);
			if (!result.verification.ok) {
				throw new Error(
					"Verification failed: database rows do not match study-packs JSON seed data.",
				);
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
	runSeedStudyPacksCli(process.argv.slice(2)).catch((err) => {
		console.error(
			`[study-packs-seed] ERROR: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	});
}
