/**
 * Idempotent CLI for importing IELTS Listening tests from `docs/listening_ielts/`
 * into the system library (`library_test` + `library_test_part`) and re-hosting
 * all audio MP3s & map/diagram images onto Cloudflare R2 (`teacher-os-library-audio-staging-*`).
 *
 * Safety gates:
 * - Restricted to local SQLite (`--file`) or Cloudflare staging (`--d1 --d1-stage staging`);
 *   production is blocked fail-closed.
 * - Default mode is `audit` (read-only dry-run).
 * - Mode `apply` on D1 requires explicit `--confirm-stage staging`.
 *
 * Usage:
 *   # Local SQLite (dry-run or apply):
 *   pnpm --filter @teacher-os/db exec tsx scripts/import-listening-library.ts \
 *     --file <sqlite-path> --mode apply --skip-media --verify
 *
 *   # Cloudflare D1 + R2 staging (audit read-only):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/import-listening-library.ts \
 *     --d1 --d1-stage staging --mode audit
 *
 *   # Cloudflare D1 + R2 staging (apply + upload media + verify):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/import-listening-library.ts \
 *     --d1 --d1-stage staging --mode apply --confirm-stage staging --verify
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import {
	DEFAULT_LISTENING_DATA_DIR,
	DEFAULT_STAGING_IMAGE_BASE_URL,
	loadListeningLibraryDataset,
	syncListeningMediaToR2,
	upsertListeningLibraryToDb,
	verifyListeningLibraryInDb,
} from "../src/seed/listening-library";
import { resolveR2BucketName } from "../src/seed/r2-audio";
import {
	assertNonProdD1Database,
	createLibsqlRunner,
	resolveStagingD1DatabaseId,
	type SqlRunner,
} from "../src/seed/vocab-library";
import { createD1RestRunner, redactSensitive } from "./seed-vocab-library";

export interface ImportListeningCliArgs {
	filePath: string | null;
	d1: boolean;
	d1Stage: string | null;
	mode: "audit" | "apply";
	confirmStage: string | null;
	dataDir: string;
	imageBaseUrl: string;
	concurrency: number;
	limit: number | null;
	skipMedia: boolean;
	verify: boolean;
	publicLogs: boolean;
	help: boolean;
}

const USAGE_TEXT = `usage: tsx packages/db/scripts/import-listening-library.ts (--file <sqlite-path> | --d1 --d1-stage staging) [options]

Options:
  --file <sqlite-path>       Target local SQLite/libsql file
  --d1                       Target Cloudflare D1 + R2
  --d1-stage <stage>         Target stage (restricted to "staging")
  --mode <audit|apply>       audit (read-only, default) or apply (upload media + upsert DB)
  --confirm-stage <stage>    Required when --mode apply on --d1 (must equal "staging")
  --data-dir <path>          Directory containing listening JSON files (default: docs/listening_ielts)
  --image-base-url <url>     Public HTTPS base URL for re-hosted images
  --concurrency <n>          Parallel R2 download/upload workers (1..16, default: 8)
  --limit <n>                Import only the first N JSON files (for smoke testing)
  --skip-media               Skip R2 media upload (useful for local SQLite tests)
  --verify                   Verify persisted DB counts and Step IELTS cleanliness after apply
  --public-logs              Mask resource names/IDs for public CI logs
  --help, -h                 Show this help message
`;

export function parseImportListeningArgs(
	argv: readonly string[],
): ImportListeningCliArgs {
	let filePath: string | null = null;
	let d1 = false;
	let d1Stage: string | null = null;
	let mode: "audit" | "apply" = "audit";
	let confirmStage: string | null = null;
	let dataDir = DEFAULT_LISTENING_DATA_DIR;
	let imageBaseUrl = DEFAULT_STAGING_IMAGE_BASE_URL;
	let concurrency = 8;
	let limit: number | null = null;
	let skipMedia = false;
	let verify = false;
	let publicLogs = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const requireValue = (flag: string): string => {
			const next = argv[i + 1];
			if (!next || next.startsWith("--")) {
				throw new Error(`Missing argument for ${flag}`);
			}
			i += 1;
			return next;
		};

		if (arg === "--file") {
			filePath = requireValue("--file");
		} else if (arg === "--d1") {
			d1 = true;
		} else if (arg === "--d1-stage") {
			d1Stage = requireValue("--d1-stage");
		} else if (arg === "--mode") {
			const val = requireValue("--mode");
			if (val !== "audit" && val !== "apply") {
				throw new Error(
					`Invalid --mode "${val}": expected "audit" or "apply".`,
				);
			}
			mode = val;
		} else if (arg === "--confirm-stage") {
			confirmStage = requireValue("--confirm-stage");
		} else if (arg === "--data-dir") {
			dataDir = resolve(requireValue("--data-dir"));
		} else if (arg === "--image-base-url") {
			const val = requireValue("--image-base-url");
			if (!/^https:\/\/\S+$/.test(val)) {
				throw new Error(
					`Invalid --image-base-url "${val}": must be an https:// URL.`,
				);
			}
			imageBaseUrl = val;
		} else if (arg === "--concurrency") {
			const parsed = Number.parseInt(requireValue("--concurrency"), 10);
			if (!Number.isInteger(parsed) || parsed < 1 || parsed > 16) {
				throw new Error("--concurrency must be an integer between 1 and 16.");
			}
			concurrency = parsed;
		} else if (arg === "--limit") {
			const parsed = Number.parseInt(requireValue("--limit"), 10);
			if (!Number.isInteger(parsed) || parsed < 1) {
				throw new Error("--limit must be a positive integer.");
			}
			limit = parsed;
		} else if (arg === "--skip-media") {
			skipMedia = true;
		} else if (arg === "--verify") {
			verify = true;
		} else if (arg === "--public-logs") {
			publicLogs = true;
		} else if (arg === "--help" || arg === "-h") {
			return {
				filePath: null,
				d1: false,
				d1Stage: null,
				mode: "audit",
				confirmStage: null,
				dataDir,
				imageBaseUrl,
				concurrency,
				limit: null,
				skipMedia: false,
				verify: false,
				publicLogs: false,
				help: true,
			};
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	if (!filePath && !d1) {
		throw new Error(
			"Specify a target: either --file <sqlite-path> or --d1 --d1-stage staging.",
		);
	}
	if (filePath && d1) {
		throw new Error("Specify only one target: either --file or --d1.");
	}
	if (d1Stage && !d1) {
		throw new Error("Flag --d1-stage requires --d1.");
	}
	if (d1 && d1Stage !== "staging") {
		throw new Error(
			`Unsupported --d1-stage "${d1Stage ?? ""}": listening import is restricted to "staging" (production is blocked by safety gate).`,
		);
	}
	if (mode === "apply" && d1 && confirmStage !== "staging") {
		throw new Error('Mode "apply" on D1 requires --confirm-stage staging.');
	}

	return {
		filePath,
		d1,
		d1Stage,
		mode,
		confirmStage,
		dataDir,
		imageBaseUrl,
		concurrency,
		limit,
		skipMedia,
		verify,
		publicLogs,
		help: false,
	};
}

export async function runImportListeningCli(
	argv: readonly string[],
	deps?: {
		env?: Record<string, string | undefined>;
		fetchImpl?: typeof fetch;
		writeStdout?: (chunk: string) => void;
	},
): Promise<number> {
	const writeStdout =
		deps?.writeStdout ?? ((chunk: string) => process.stdout.write(chunk));
	const log = (line: string) => writeStdout(`${line}\n`);
	const secretsToRedact: string[] = [];

	try {
		const args = parseImportListeningArgs(argv);
		if (args.help) {
			writeStdout(USAGE_TEXT);
			return 0;
		}

		const env = deps?.env ?? process.env;
		const fetchImpl = deps?.fetchImpl ?? fetch;

		const dataset = loadListeningLibraryDataset({
			dataDir: args.dataDir,
			imageBaseUrl: args.imageBaseUrl,
			limit: args.limit ?? undefined,
		});

		log(
			`[listening-import] Loaded ${dataset.items.length} tests (ready=${dataset.readyCount}, draft=${dataset.draftCount}, groups=${dataset.totalGroups}, questions=${dataset.totalQuestions}, audio=${dataset.totalAudioFiles}, images=${dataset.totalImageFiles})`,
		);
		const sortedTypes = Object.entries(dataset.typeDistribution)
			.sort((a, b) => b[1] - a[1])
			.map(([t, n]) => `${t}:${n}`)
			.join(", ");
		log(`[listening-import] Group types: ${sortedTypes}`);

		for (const item of dataset.items) {
			if (item.status === "draft") {
				log(
					`[listening-import] DRAFT (${item.fileName}): ${item.draftReasons.join("; ")}`,
				);
			}
		}

		let runner: SqlRunner;
		let closeClient: (() => void) | undefined;
		let r2Target:
			| { accountId: string; apiToken: string; bucketName: string }
			| undefined;

		if (args.filePath) {
			const client = createClient({
				url: pathToFileURL(resolve(args.filePath)).toString(),
			});
			runner = createLibsqlRunner(client);
			closeClient = () => client.close();
			log(
				`[listening-import] Target: local SQLite (${args.filePath}) | Mode: ${args.mode}`,
			);
		} else {
			const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
			const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
			if (!accountId || !apiToken) {
				throw new Error(
					"--d1 requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.",
				);
			}
			secretsToRedact.push(accountId, apiToken);

			const databaseId = await resolveStagingD1DatabaseId({
				stage: "staging",
				accountId,
				apiToken,
				fetchImpl,
			});
			secretsToRedact.push(databaseId);

			await assertNonProdD1Database({
				accountId,
				databaseId,
				apiToken,
				fetchImpl,
			});

			const bucketName = await resolveR2BucketName({
				stage: "staging",
				accountId,
				apiToken,
				fetchImpl,
			});
			secretsToRedact.push(bucketName);

			if (env.GITHUB_ACTIONS === "true") {
				for (const secret of [databaseId, bucketName]) {
					const clean = secret.replace(/[\r\n]/g, "");
					if (clean) writeStdout(`::add-mask::${clean}\n`);
				}
			}

			runner = createD1RestRunner({
				accountId,
				databaseId,
				apiToken,
				fetchImpl,
			});
			r2Target = { accountId, apiToken, bucketName };
			log(
				args.publicLogs
					? `[listening-import] Target: Cloudflare staging D1 + R2 | Mode: ${args.mode}`
					: `[listening-import] Target: Cloudflare staging D1 (${databaseId.slice(0, 8)}...) + R2 (${bucketName}) | Mode: ${args.mode}`,
			);
		}

		try {
			// Pre-flight check existing rows in DB (read-only).
			if (runner.queryRows) {
				const existing = await runner.queryRows(
					"SELECT status, COUNT(*) AS n FROM library_test WHERE id LIKE 'lib-listen-%' GROUP BY status;",
				);
				const summary = existing
					.map((r) => `${String(r.status)}=${String(r.n)}`)
					.join(", ");
				log(
					`[listening-import] Pre-existing lib-listen-* rows in DB: ${summary || "none"}`,
				);
			}

			if (args.mode === "audit") {
				if (r2Target && !args.skipMedia) {
					const mediaAudit = await syncListeningMediaToR2({
						items: dataset.items,
						accountId: r2Target.accountId,
						apiToken: r2Target.apiToken,
						bucketName: r2Target.bucketName,
						dryRun: true,
						concurrency: args.concurrency,
						fetchImpl,
						writeLog: log,
					});
					log(
						`[listening-import] Audit R2 media: audio existing=${mediaAudit.audioExisting}/${mediaAudit.audioTotal}, images existing=${mediaAudit.imageExisting}/${mediaAudit.imageTotal}, errors=${mediaAudit.failed.length}`,
					);
					if (mediaAudit.failed.length > 0) {
						throw new Error(
							`R2 audit encountered ${mediaAudit.failed.length} error(s): ${mediaAudit.failed
								.slice(0, 5)
								.map((f) => `${f.objectKey}: ${f.error}`)
								.join("; ")}`,
						);
					}
				}
				log(
					"[listening-import] Audit complete (read-only, no writes performed).",
				);
				return 0;
			}

			// Apply mode: 1) Upload media to R2 first so DB never points to missing R2 keys.
			if (r2Target && !args.skipMedia) {
				log(
					`[listening-import] Syncing ${dataset.totalAudioFiles} MP3s + ${dataset.totalImageFiles} images to R2 (concurrency=${args.concurrency})...`,
				);
				const mediaResult = await syncListeningMediaToR2({
					items: dataset.items,
					accountId: r2Target.accountId,
					apiToken: r2Target.apiToken,
					bucketName: r2Target.bucketName,
					dryRun: false,
					concurrency: args.concurrency,
					fetchImpl,
					writeLog: log,
				});
				log(
					`[listening-import] Media sync finished: audio existing=${mediaResult.audioExisting}, uploaded=${mediaResult.audioUploaded}/${mediaResult.audioTotal}; images existing=${mediaResult.imageExisting}, uploaded=${mediaResult.imageUploaded}/${mediaResult.imageTotal}; failed=${mediaResult.failed.length}`,
				);
				if (mediaResult.failed.length > 0) {
					throw new Error(
						`Media upload failed for ${mediaResult.failed.length} object(s): ${mediaResult.failed
							.slice(0, 10)
							.map((f) => `${f.objectKey}: ${f.error}`)
							.join("; ")}`,
					);
				}
			}

			// Apply mode: 2) Upsert library_test + library_test_part rows into DB.
			log(
				`[listening-import] Upserting ${dataset.items.length} library_test & library_test_part rows...`,
			);
			const upsertResult = await upsertListeningLibraryToDb(
				runner,
				dataset.items,
				{
					onProgress: (done, total) => {
						if (done % 100 === 0 || done === total) {
							log(
								`[listening-import] DB upsert progress: ${done}/${total} statements`,
							);
						}
					},
				},
			);
			log(
				`[listening-import] Executed ${upsertResult.statementsExecuted} SQL statements.`,
			);

			// Apply mode: 3) Verify DB state.
			if (args.verify) {
				const report = await verifyListeningLibraryInDb(runner, dataset);
				log(
					`[listening-import] Verify: tests=${report.actualTests}/${report.expectedTests} (ready=${report.actualReady}/${report.expectedReady}, draft=${report.actualDraft}/${report.expectedDraft}), parts=${report.actualParts}/${report.expectedParts}, withAudio=${report.partsWithAudio}/${report.expectedParts}, stepIeltsMatches=${report.stepIeltsMatches}`,
				);
				if (!report.ok) {
					throw new Error(
						"Verification failed: DB rows do not match expected dataset counts.",
					);
				}
				log("[listening-import] Verification PASSED.");
			}

			return 0;
		} finally {
			closeClient?.();
		}
	} catch (err) {
		const raw = err instanceof Error ? err.message : String(err);
		console.error(
			`[listening-import] ERROR: ${redactSensitive(raw, secretsToRedact)}`,
		);
		return 1;
	}
}

const entryArg = process.argv[1];
const isDirectExecution =
	entryArg !== undefined &&
	import.meta.url === pathToFileURL(resolve(entryArg)).href;

if (isDirectExecution) {
	runImportListeningCli(process.argv.slice(2)).then((code) => {
		if (code !== 0) process.exit(code);
	});
}
