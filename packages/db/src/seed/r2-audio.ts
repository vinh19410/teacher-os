import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
	loadStudyPackSeedData,
	type ParsedStudyPackSeedData,
} from "./study-packs";

export const STAGING_R2_BUCKET_REGEX =
	/^teacher-os-library-audio-staging-[a-z2-7]{16}$/;
export const PROD_R2_BUCKET_REGEX =
	/^teacher-os-library-audio-prod-[a-z2-7]{16}$/;
export const MAX_R2_AUDIO_BYTES = 50 * 1024 * 1024;

const audioManifestEntrySchema = z.object({
	dayIndex: z.number().int().min(1),
	exerciseId: z.string().regex(/^sysex-[a-z0-9-]+$/),
	audioKey: z.string().regex(/^study-packs\/[a-z0-9-]+\/[a-z0-9-]+\.mp3$/),
	youtubeId: z.string().regex(/^[A-Za-z0-9_-]{6,20}$/),
	sourceUrl: z.string().url(),
});

export type StudyPackAudioManifestEntry = z.infer<
	typeof audioManifestEntrySchema
>;

export function loadStudyPackAudioManifest(
	manifestPath: string,
): StudyPackAudioManifestEntry[] {
	const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
	return z.array(audioManifestEntrySchema).parse(raw);
}

export function collectRequiredAudioKeys(
	data: ParsedStudyPackSeedData,
): Array<{ exerciseId: string; audioKey: string }> {
	return data.exercises
		.filter((ex) => ex.audioKey.trim().length > 0)
		.map((ex) => ({
			exerciseId: ex.id,
			audioKey: ex.audioKey.trim(),
		}));
}

function encodeR2ObjectPath(objectKey: string): string {
	return objectKey
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

export async function resolveR2BucketName(options: {
	stage: "staging" | "prod";
	accountId: string;
	apiToken: string;
	explicitBucket?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<string> {
	const explicit = options.explicitBucket?.trim();
	if (explicit) {
		if (options.stage === "staging" && /-prod-/i.test(explicit)) {
			throw new Error(
				`Refusing production-like bucket "${explicit}" for stage "staging".`,
			);
		}
		if (options.stage === "prod" && /-staging-/i.test(explicit)) {
			throw new Error(
				`Refusing staging-like bucket "${explicit}" for stage "prod".`,
			);
		}
		return explicit;
	}

	const fetchFn = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 20_000;
	const prefix =
		options.stage === "staging"
			? "teacher-os-library-audio-staging-"
			: "teacher-os-library-audio-prod-";
	const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/r2/buckets?name_contains=${encodeURIComponent(prefix)}`;
	const res = await fetchFn(url, {
		method: "GET",
		headers: { authorization: `Bearer ${options.apiToken}` },
		signal: AbortSignal.timeout(timeoutMs),
	});
	const raw = await res.text();
	let payload: {
		success?: boolean;
		errors?: Array<{ message?: string }>;
		result?: { buckets?: Array<{ name?: string }> };
	};
	try {
		payload = JSON.parse(raw) as typeof payload;
	} catch {
		throw new Error(`R2 list buckets failed (${res.status}): invalid JSON`);
	}
	if (!res.ok || payload.success !== true) {
		const errMsg =
			payload.errors?.map((e) => e.message ?? "error").join("; ") ??
			`HTTP ${res.status}`;
		throw new Error(`R2 list buckets failed (${res.status}): ${errMsg}`);
	}

	const regex =
		options.stage === "staging"
			? STAGING_R2_BUCKET_REGEX
			: PROD_R2_BUCKET_REGEX;
	const buckets = (payload.result?.buckets ?? [])
		.map((b) => b.name)
		.filter(
			(name): name is string => typeof name === "string" && regex.test(name),
		);
	const [match] = buckets;
	if (buckets.length !== 1 || !match) {
		throw new Error(
			`Expected exactly 1 ${options.stage} R2 bucket matching ${regex}, found ${buckets.length}.`,
		);
	}
	return match;
}

export async function headR2Object(options: {
	accountId: string;
	bucketName: string;
	objectKey: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<{ exists: boolean; size: number | null }> {
	const fetchFn = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 20_000;
	// Cloudflare R2 REST API v4 returns 405 for HEAD /objects/{key} and ignores
	// Range headers on GET /objects/{key}. Listing with prefix=objectKey&limit=1
	// checks existence and size via metadata without downloading object bytes.
	const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/r2/buckets/${encodeURIComponent(options.bucketName)}/objects?prefix=${encodeURIComponent(options.objectKey)}&limit=1`;
	const res = await fetchFn(url, {
		method: "GET",
		headers: { authorization: `Bearer ${options.apiToken}` },
		signal: AbortSignal.timeout(timeoutMs),
	});
	const raw = await res.text();
	let payload: {
		success?: boolean;
		errors?: Array<{ message?: string }>;
		result?: Array<{ key?: string; size?: number }>;
	};
	try {
		payload = JSON.parse(raw) as typeof payload;
	} catch {
		throw new Error(
			`R2 HEAD "${options.objectKey}" failed (${res.status}): invalid JSON`,
		);
	}
	if (!res.ok || payload.success !== true) {
		const errMsg =
			payload.errors?.map((e) => e.message ?? "error").join("; ") ??
			`HTTP ${res.status}`;
		throw new Error(
			`R2 HEAD "${options.objectKey}" failed (${res.status}): ${errMsg}`,
		);
	}
	const match = (payload.result ?? []).find(
		(entry) => entry.key === options.objectKey,
	);
	if (!match) {
		return { exists: false, size: null };
	}
	return {
		exists: true,
		size: typeof match.size === "number" ? match.size : null,
	};
}

export async function getR2ObjectBytes(options: {
	accountId: string;
	bucketName: string;
	objectKey: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<Uint8Array> {
	const fetchFn = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 60_000;
	const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/r2/buckets/${encodeURIComponent(options.bucketName)}/objects/${encodeR2ObjectPath(options.objectKey)}`;
	const res = await fetchFn(url, {
		method: "GET",
		headers: { authorization: `Bearer ${options.apiToken}` },
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!res.ok) {
		throw new Error(`R2 GET "${options.objectKey}" failed (${res.status})`);
	}
	return new Uint8Array(await res.arrayBuffer());
}

export async function putR2ObjectBytes(options: {
	accountId: string;
	bucketName: string;
	objectKey: string;
	apiToken: string;
	bytes: Uint8Array;
	contentType?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<void> {
	if (
		options.bytes.byteLength === 0 ||
		options.bytes.byteLength > MAX_R2_AUDIO_BYTES
	) {
		throw new Error(
			`Invalid MP3 byte length (${options.bytes.byteLength}) for "${options.objectKey}"`,
		);
	}
	const fetchFn = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 60_000;
	const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/r2/buckets/${encodeURIComponent(options.bucketName)}/objects/${encodeR2ObjectPath(options.objectKey)}`;
	const res = await fetchFn(url, {
		method: "PUT",
		headers: {
			authorization: `Bearer ${options.apiToken}`,
			"content-type": options.contentType ?? "audio/mpeg",
		},
		body: Buffer.from(options.bytes),
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!res.ok) {
		throw new Error(`R2 PUT "${options.objectKey}" failed (${res.status})`);
	}
}

export function downloadYoutubeAudioMp3(options: {
	youtubeId: string;
	outPath: string;
	ytDlpBin?: string;
}): Uint8Array {
	const bin = options.ytDlpBin ?? "yt-dlp";
	const template = options.outPath.replace(/\.mp3$/i, ".%(ext)s");
	const res = spawnSync(
		bin,
		[
			"--js-runtimes",
			"node",
			"-f",
			"140/bestaudio",
			"-x",
			"--audio-format",
			"mp3",
			"--audio-quality",
			"5",
			"-o",
			template,
			`https://www.youtube.com/watch?v=${options.youtubeId}`,
		],
		{ encoding: "utf8", timeout: 120_000 },
	);
	if (res.status !== 0 || !existsSync(options.outPath)) {
		throw new Error(
			`yt-dlp failed for ${options.youtubeId}: ${res.stderr?.slice(-300) || res.error?.message || `exit ${res.status}`}`,
		);
	}
	return new Uint8Array(readFileSync(options.outPath));
}

export interface SyncR2AudioResult {
	total: number;
	existing: number;
	uploaded: number;
	missing: number;
	verified: number;
}

export async function syncStudyPackAudioToR2(options: {
	accountId: string;
	apiToken: string;
	targetBucket: string;
	sourceBucket?: string;
	audioDir?: string;
	manifestPath?: string;
	data?: ParsedStudyPackSeedData;
	dryRun?: boolean;
	force?: boolean;
	verify?: boolean;
	fetchImpl?: typeof fetch;
	ytDlpBin?: string;
	writeStdout?: (chunk: string) => void;
}): Promise<SyncR2AudioResult> {
	const write = options.writeStdout ?? ((s: string) => process.stdout.write(s));
	const data = options.data ?? loadStudyPackSeedData();
	const required = collectRequiredAudioKeys(data);
	const manifestByExId = new Map<string, StudyPackAudioManifestEntry>();
	if (options.manifestPath && existsSync(options.manifestPath)) {
		for (const entry of loadStudyPackAudioManifest(options.manifestPath)) {
			manifestByExId.set(entry.exerciseId, entry);
		}
	}

	let existing = 0;
	let uploaded = 0;
	let missing = 0;
	let verified = 0;
	let tmpDir: string | null = null;

	try {
		for (const item of required) {
			const head = await headR2Object({
				accountId: options.accountId,
				bucketName: options.targetBucket,
				objectKey: item.audioKey,
				apiToken: options.apiToken,
				fetchImpl: options.fetchImpl,
			});
			const alreadyValid = head.exists && (head.size === null || head.size > 0);
			if (alreadyValid && !options.force) {
				existing++;
				if (options.verify) verified++;
				continue;
			}

			if (options.dryRun) {
				missing++;
				write(`[r2-audio] WOULD UPLOAD ${item.audioKey}\n`);
				continue;
			}

			let bytes: Uint8Array | null = null;
			if (options.audioDir) {
				const localPath = resolve(options.audioDir, `${item.exerciseId}.mp3`);
				if (existsSync(localPath)) {
					bytes = new Uint8Array(readFileSync(localPath));
				}
			}
			if (!bytes && options.sourceBucket) {
				bytes = await getR2ObjectBytes({
					accountId: options.accountId,
					bucketName: options.sourceBucket,
					objectKey: item.audioKey,
					apiToken: options.apiToken,
					fetchImpl: options.fetchImpl,
				});
			}
			if (!bytes) {
				const manifestEntry = manifestByExId.get(item.exerciseId);
				if (!manifestEntry) {
					throw new Error(
						`Missing audio source for "${item.audioKey}": not found in --audio-dir, source R2 bucket, or manifest.`,
					);
				}
				tmpDir ??= mkdtempSync(join(tmpdir(), "study-pack-yt-"));
				const mp3Path = join(tmpDir, `${item.exerciseId}.mp3`);
				bytes = downloadYoutubeAudioMp3({
					youtubeId: manifestEntry.youtubeId,
					outPath: mp3Path,
					ytDlpBin: options.ytDlpBin,
				});
			}

			await putR2ObjectBytes({
				accountId: options.accountId,
				bucketName: options.targetBucket,
				objectKey: item.audioKey,
				apiToken: options.apiToken,
				bytes,
				fetchImpl: options.fetchImpl,
			});
			uploaded++;
			write(
				`[r2-audio] UPLOADED ${item.audioKey} (${bytes.byteLength} bytes)\n`,
			);

			if (options.verify) {
				const after = await headR2Object({
					accountId: options.accountId,
					bucketName: options.targetBucket,
					objectKey: item.audioKey,
					apiToken: options.apiToken,
					fetchImpl: options.fetchImpl,
				});
				if (!after.exists || (after.size !== null && after.size <= 0)) {
					throw new Error(
						`R2 verification failed after upload for "${item.audioKey}".`,
					);
				}
				verified++;
			}
		}
	} finally {
		if (tmpDir) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	}

	return {
		total: required.length,
		existing,
		uploaded,
		missing,
		verified,
	};
}
