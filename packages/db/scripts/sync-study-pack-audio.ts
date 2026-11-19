/**
 * Upload & verify study-pack Listening MP3s into Cloudflare R2 `library-audio`.
 * Reads required `audioKey` entries from `packages/db/seed-data/study-packs/*.json`
 * and resolves audio bytes from `--audio-dir` (e.g. `<id>.mp3`) or YouTube via
 * `first-step-gt2.audio-manifest.json` + `yt-dlp`.
 *
 *   # Staging upload:
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/sync-study-pack-audio.ts --stage staging --verify
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	resolveR2BucketName,
	syncStudyPackAudioToR2,
} from "../src/seed/r2-audio";
import { redactSensitive } from "./seed-vocab-library";

const DEFAULT_MANIFEST_PATH = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../seed-data/study-packs/first-step-gt2.audio-manifest.json",
);

const USAGE_TEXT =
	"usage: tsx packages/db/scripts/sync-study-pack-audio.ts --stage <staging|prod> [--allow-prod] [--audio-dir <dir>] [--r2-bucket <name>] [--dry-run] [--force] [--verify]\n";

export interface SyncAudioArgs {
	stage: "staging" | "prod";
	allowProd: boolean;
	audioDir: string | null;
	r2Bucket: string | null;
	dryRun: boolean;
	force: boolean;
	verify: boolean;
	help: boolean;
}

export function parseSyncAudioArgs(argv: readonly string[]): SyncAudioArgs {
	let stage: "staging" | "prod" | null = null;
	let allowProd = false;
	let audioDir: string | null = null;
	let r2Bucket: string | null = null;
	let dryRun = false;
	let force = false;
	let verify = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--stage") {
			const next = argv[++i];
			if (next !== "staging" && next !== "prod") {
				throw new Error(
					`Invalid --stage "${next ?? ""}": expected staging or prod`,
				);
			}
			stage = next;
		} else if (arg === "--allow-prod") {
			allowProd = true;
		} else if (arg === "--audio-dir") {
			const next = argv[++i];
			if (!next || next.startsWith("--"))
				throw new Error("Missing path for --audio-dir");
			audioDir = next;
		} else if (arg === "--r2-bucket") {
			const next = argv[++i];
			if (!next || next.startsWith("--"))
				throw new Error("Missing name for --r2-bucket");
			r2Bucket = next;
		} else if (arg === "--dry-run") {
			dryRun = true;
		} else if (arg === "--force") {
			force = true;
		} else if (arg === "--verify") {
			verify = true;
		} else if (arg === "--help" || arg === "-h") {
			return {
				stage: "staging",
				allowProd: false,
				audioDir: null,
				r2Bucket: null,
				dryRun: false,
				force: false,
				verify: false,
				help: true,
			};
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	if (!stage) {
		throw new Error("Missing required flag --stage <staging|prod>");
	}
	if (stage === "prod" && !allowProd && !dryRun) {
		throw new Error(
			"Targeting production R2 requires --allow-prod (or use --dry-run to preview).",
		);
	}

	return {
		stage,
		allowProd,
		audioDir,
		r2Bucket,
		dryRun,
		force,
		verify,
		help: false,
	};
}

export async function runSyncStudyPackAudioCli(
	argv: readonly string[],
	deps?: {
		env?: Record<string, string | undefined>;
		fetchImpl?: typeof fetch;
		writeStdout?: (chunk: string) => void;
	},
): Promise<void> {
	const write = deps?.writeStdout ?? ((s: string) => process.stdout.write(s));
	const args = parseSyncAudioArgs(argv);
	if (args.help) {
		write(USAGE_TEXT);
		return;
	}

	const env = deps?.env ?? process.env;
	const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
	const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
	if (!accountId || !apiToken) {
		throw new Error(
			"Missing required environment variables: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN",
		);
	}
	const secrets = [apiToken];

	try {
		const targetBucket = await resolveR2BucketName({
			stage: args.stage,
			accountId,
			apiToken,
			explicitBucket: args.r2Bucket ?? env.R2_LIBRARY_AUDIO_BUCKET,
			fetchImpl: deps?.fetchImpl,
		});
		write(`[r2-audio] target bucket: ${targetBucket} (stage=${args.stage})\n`);
		const res = await syncStudyPackAudioToR2({
			accountId,
			apiToken,
			targetBucket,
			audioDir: args.audioDir ?? undefined,
			manifestPath: DEFAULT_MANIFEST_PATH,
			dryRun: args.dryRun,
			force: args.force,
			verify: args.verify,
			fetchImpl: deps?.fetchImpl,
			writeStdout: write,
		});
		write(
			`[r2-audio] summary: total=${res.total}, existing=${res.existing}, uploaded=${res.uploaded}, missing=${res.missing}, verified=${res.verified}\n`,
		);
		if (args.verify && !args.dryRun && res.verified !== res.total) {
			throw new Error(`R2 audio verify mismatch: ${res.verified}/${res.total}`);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(redactSensitive(msg, secrets));
	}
}

const entryArg = process.argv[1];
if (entryArg && import.meta.url === pathToFileURL(resolve(entryArg)).href) {
	runSyncStudyPackAudioCli(process.argv.slice(2)).catch((err) => {
		console.error(
			`[r2-audio] ERROR: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	});
}
