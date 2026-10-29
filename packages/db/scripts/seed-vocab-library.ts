/**
 * Idempotent CLI for seeding the built-in vocabulary library (issue #361).
 * Reads the 3 committed CSV files under `packages/db/seed-data/vocab-library/`
 * (20 courses / 968 lessons / 10,160 words) and upserts deterministic rows
 * (`libcourse-<id>`, `libdeck-<id>`, `libword-<id>`) into either a local SQLite/libsql
 * database file or a remote Cloudflare D1 database via the REST `/query` API:
 *
 *   # Local SQLite (alchemy dev / local.db):
 *   npx -y tsx packages/db/scripts/seed-vocab-library.ts --file <sqlite-path> --verify
 *
 *   # Cloudflare D1 (staging; PROD requires Open Question 1 license sign-off):
 *   CLOUDFLARE_ACCOUNT_ID=... D1_DATABASE_ID=... CLOUDFLARE_API_TOKEN=... \
 *     npx -y tsx packages/db/scripts/seed-vocab-library.ts --d1 --verify
 *
 * Flags:
 *   --file <path>   Run against a local SQLite file via @libsql/client
 *   --d1            Run against Cloudflare D1 REST API (1 statement per HTTP call)
 *   --prune         Delete existing libcourse-% / libdeck-% / libword-% rows before upsert
 *   --verify        Verify counts and exact id-sets against CSV (can run standalone or after seed)
 */
import { createClient } from "@libsql/client";
import {
	createLibsqlRunner,
	type LibraryTableName,
	type SqlRunner,
	seedVocabLibrary,
	verifyCounts,
} from "../src/seed/vocab-library";

interface CliArgs {
	filePath: string | null;
	d1: boolean;
	prune: boolean;
	verify: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
	let filePath: string | null = null;
	let d1 = false;
	let prune = false;
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
		} else if (arg === "--prune") {
			prune = true;
		} else if (arg === "--verify") {
			verify = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(
				"usage: tsx packages/db/scripts/seed-vocab-library.ts (--file <sqlite-path> | --d1) [--prune] [--verify]",
			);
			process.exit(0);
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

	return { filePath, d1, prune, verify };
}

interface D1QueryResponse {
	success?: boolean;
	errors?: Array<{ code?: number; message?: string }>;
	result?: Array<{
		success?: boolean;
		results?: Array<Record<string, unknown>>;
	}>;
}

function createD1RestRunner(): SqlRunner {
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
	const databaseId = process.env.D1_DATABASE_ID?.trim();
	const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

	if (!accountId || !databaseId || !apiToken) {
		throw new Error(
			"Missing required environment variables for --d1: CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID, CLOUDFLARE_API_TOKEN",
		);
	}

	const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;

	async function executeSingleStatement(
		sql: string,
	): Promise<Array<Record<string, unknown>>> {
		let lastError: Error | null = null;
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const res = await fetch(endpoint, {
					method: "POST",
					headers: {
						authorization: `Bearer ${apiToken}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ sql }),
				});

				if (res.status >= 500 && attempt === 0) {
					continue;
				}

				const payload = (await res.json()) as D1QueryResponse;
				if (!res.ok || payload.success !== true) {
					const errMsg =
						payload.errors?.map((e) => e.message ?? "error").join("; ") ??
						`HTTP ${res.status}`;
					throw new Error(`D1 query failed (${res.status}): ${errMsg}`);
				}
				const firstResult = payload.result?.[0];
				if (firstResult && firstResult.success === false) {
					throw new Error("D1 statement execution reported success=false");
				}
				return firstResult?.results ?? [];
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				if (
					attempt === 0 &&
					!lastError.message.startsWith("D1 query failed (4")
				) {
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

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	let runner: SqlRunner;
	let closeClient: (() => void) | undefined;

	if (args.filePath) {
		await assertLocalSchemaReady(args.filePath);
		const client = createClient({ url: `file:${args.filePath}` });
		runner = createLibsqlRunner(client);
		closeClient = () => client.close();
	} else {
		runner = createD1RestRunner();
	}

	try {
		const res = await seedVocabLibrary(runner, { prune: args.prune });
		console.log(
			`[vocab-library-seed] executed ${res.statementsExecuted} statements (courses=${res.counts.course}, decks=${res.counts.deck}, words=${res.counts.word})`,
		);

		if (args.verify) {
			const report = await verifyCounts(runner);
			console.log(
				[
					"Table                  | Expected | Actual | Missing | Extra | Status",
					"-----------------------+----------+--------+---------+-------+-------",
					`vocab_library_course   | ${String(report.tables.course.expected).padStart(8)} | ${String(report.tables.course.actual).padStart(6)} | ${String(report.tables.course.missing).padStart(7)} | ${String(report.tables.course.extra).padStart(5)} | ${report.tables.course.match ? "OK" : "MISMATCH"}`,
					`vocab_library_deck     | ${String(report.tables.deck.expected).padStart(8)} | ${String(report.tables.deck.actual).padStart(6)} | ${String(report.tables.deck.missing).padStart(7)} | ${String(report.tables.deck.extra).padStart(5)} | ${report.tables.deck.match ? "OK" : "MISMATCH"}`,
					`vocab_library_word     | ${String(report.tables.word.expected).padStart(8)} | ${String(report.tables.word.actual).padStart(6)} | ${String(report.tables.word.missing).padStart(7)} | ${String(report.tables.word.extra).padStart(5)} | ${report.tables.word.match ? "OK" : "MISMATCH"}`,
				].join("\n"),
			);
			console.log(
				`Summary: course ${report.tables.course.actual}/${report.tables.course.expected}, deck ${report.tables.deck.actual}/${report.tables.deck.expected}, word ${report.tables.word.actual}/${report.tables.word.expected}`,
			);
			if (!report.ok) {
				process.exit(1);
			}
		}
	} finally {
		closeClient?.();
	}
}

main().catch((err) => {
	console.error(
		`[vocab-library-seed] ERROR: ${err instanceof Error ? err.message : String(err)}`,
	);
	process.exit(1);
});
