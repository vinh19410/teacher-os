/**
 * Manual CLI to promote system study packs & R2 Listening audio from staging
 * to production once staging verification is signed off (#814).
 *
 *   # Dry-run preview (read-only: checks prod R2 & D1 without writing):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/promote-study-packs-prod.ts --dry-run
 *
 *   # Promote staging -> production:
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/promote-study-packs-prod.ts --allow-prod --verify
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	resolveR2BucketName,
	syncStudyPackAudioToR2,
} from "../src/seed/r2-audio";
import {
	ensureStudyPacksSeeded,
	inspectD1DatabaseName,
	loadStudyPackSeedData,
	resolveProdD1DatabaseId,
	verifyStudyPackContentParity,
	verifyStudyPackCounts,
} from "../src/seed/study-packs";
import { createD1RestRunner, redactSensitive } from "./seed-vocab-library";

const DEFAULT_MANIFEST_PATH = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../seed-data/study-packs/first-step-gt2.audio-manifest.json",
);

const USAGE_TEXT =
	"usage: tsx packages/db/scripts/promote-study-packs-prod.ts (--dry-run | --allow-prod) [--verify] [--prune] [--audio-dir <dir>] [--staging-r2-bucket <name>] [--prod-r2-bucket <name>]\n";

export interface PromoteStudyPacksArgs {
	dryRun: boolean;
	allowProd: boolean;
	verify: boolean;
	prune: boolean;
	audioDir: string | null;
	stagingR2Bucket: string | null;
	prodR2Bucket: string | null;
	help: boolean;
}

export function parsePromoteArgs(
	argv: readonly string[],
): PromoteStudyPacksArgs {
	let dryRun = false;
	let allowProd = false;
	let verify = false;
	let prune = false;
	let audioDir: string | null = null;
	let stagingR2Bucket: string | null = null;
	let prodR2Bucket: string | null = null;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--dry-run") {
			dryRun = true;
		} else if (arg === "--allow-prod") {
			allowProd = true;
		} else if (arg === "--verify") {
			verify = true;
		} else if (arg === "--prune") {
			prune = true;
		} else if (arg === "--audio-dir") {
			const next = argv[++i];
			if (!next || next.startsWith("--")) {
				throw new Error("Missing path for --audio-dir");
			}
			audioDir = next;
		} else if (arg === "--staging-r2-bucket") {
			const next = argv[++i];
			if (!next || next.startsWith("--")) {
				throw new Error("Missing name for --staging-r2-bucket");
			}
			stagingR2Bucket = next;
		} else if (arg === "--prod-r2-bucket") {
			const next = argv[++i];
			if (!next || next.startsWith("--")) {
				throw new Error("Missing name for --prod-r2-bucket");
			}
			prodR2Bucket = next;
		} else if (arg === "--help" || arg === "-h") {
			return {
				dryRun: false,
				allowProd: false,
				verify: false,
				prune: false,
				audioDir: null,
				stagingR2Bucket: null,
				prodR2Bucket: null,
				help: true,
			};
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	if (!dryRun && !allowProd) {
		throw new Error(
			"Production promote requires --allow-prod (or pass --dry-run to preview safely without modifying production).",
		);
	}

	return {
		dryRun,
		allowProd,
		verify,
		prune,
		audioDir,
		stagingR2Bucket,
		prodR2Bucket,
		help: false,
	};
}

export async function runPromoteStudyPacksProdCli(
	argv: readonly string[],
	deps?: {
		env?: Record<string, string | undefined>;
		fetchImpl?: typeof fetch;
		writeStdout?: (chunk: string) => void;
	},
): Promise<void> {
	const write = deps?.writeStdout ?? ((s: string) => process.stdout.write(s));
	const args = parsePromoteArgs(argv);
	if (args.help) {
		write(USAGE_TEXT);
		return;
	}

	const env = deps?.env ?? process.env;
	const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
	const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
	const explicitDbId = env.D1_DATABASE_ID?.trim();
	if (!accountId || !apiToken) {
		throw new Error(
			"Missing required environment variables: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN",
		);
	}
	const secrets = [apiToken, explicitDbId ?? ""];

	try {
		const data = loadStudyPackSeedData();
		const prodBucket = await resolveR2BucketName({
			stage: "prod",
			accountId,
			apiToken,
			explicitBucket: args.prodR2Bucket ?? env.PROD_R2_LIBRARY_AUDIO_BUCKET,
			fetchImpl: deps?.fetchImpl,
		});
		const stagingBucket = args.dryRun
			? undefined
			: await resolveR2BucketName({
					stage: "staging",
					accountId,
					apiToken,
					explicitBucket:
						args.stagingR2Bucket ?? env.STAGING_R2_LIBRARY_AUDIO_BUCKET,
					fetchImpl: deps?.fetchImpl,
				});

		const prodD1 = explicitDbId
			? {
					uuid: explicitDbId,
					name: await inspectD1DatabaseName({
						accountId,
						databaseId: explicitDbId,
						apiToken,
						fetchImpl: deps?.fetchImpl,
					}),
				}
			: await resolveProdD1DatabaseId({
					accountId,
					apiToken,
					fetchImpl: deps?.fetchImpl,
				});
		if (/-staging-/i.test(prodD1.name)) {
			throw new Error(
				`Refusing staging-like D1 database "${prodD1.name}" for production promote.`,
			);
		}
		secrets.push(prodD1.uuid);

		write(
			`[promote-prod] target D1=${prodD1.name}, target R2=${prodBucket}${stagingBucket ? `, source R2=${stagingBucket}` : ""}\n`,
		);

		const r2Res = await syncStudyPackAudioToR2({
			accountId,
			apiToken,
			targetBucket: prodBucket,
			sourceBucket: stagingBucket,
			audioDir: args.audioDir ?? undefined,
			manifestPath: DEFAULT_MANIFEST_PATH,
			data,
			dryRun: args.dryRun,
			verify: args.verify || !args.dryRun,
			fetchImpl: deps?.fetchImpl,
			writeStdout: write,
		});
		write(
			`[promote-prod] R2 summary: total=${r2Res.total}, existing=${r2Res.existing}, uploaded=${r2Res.uploaded}, missing=${r2Res.missing}\n`,
		);

		const runner = createD1RestRunner({
			accountId,
			databaseId: prodD1.uuid,
			apiToken,
			fetchImpl: deps?.fetchImpl,
		});

		if (args.dryRun) {
			const counts = await verifyStudyPackCounts(runner, { data });
			const parity = counts.ok
				? await verifyStudyPackContentParity(runner, { data })
				: false;
			write(
				`[promote-prod] DRY-RUN D1 status: countsOk=${counts.ok}, parity=${parity} (packs ${counts.tables.pack.actual}/${counts.tables.pack.expected}, exercises ${counts.tables.exercise.actual}/${counts.tables.exercise.expected}, items ${counts.tables.item.actual}/${counts.tables.item.expected})\n`,
			);
			return;
		}

		const seedRes = await ensureStudyPacksSeeded(runner, {
			data,
			prune: args.prune,
			ifNeeded: !args.prune,
			verify: args.verify,
		});
		write(
			`[promote-prod] D1 summary: seeded=${seedRes.seeded}, statements=${seedRes.statementsExecuted}, packs=${seedRes.counts.pack}, exercises=${seedRes.counts.exercise}, items=${seedRes.counts.item}\n`,
		);
		if (seedRes.verification && !seedRes.verification.ok) {
			throw new Error("Production D1 verification failed after promote.");
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(redactSensitive(msg, secrets));
	}
}

const entryArg = process.argv[1];
if (entryArg && import.meta.url === pathToFileURL(resolve(entryArg)).href) {
	runPromoteStudyPacksProdCli(process.argv.slice(2)).catch((err) => {
		console.error(
			`[promote-prod] ERROR: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	});
}
