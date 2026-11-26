/**
 * Adapter lưu trữ video recording trên đĩa cho runtime Node của E2E (#994) —
 * thay thế bucket R2 `recordings` khi boot local/CI không cần credential Cloudflare.
 */

import { createReadStream, createWriteStream } from "node:fs";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import type { RecordingStore } from "server/app";

export function createFsRecordingStore(dir: string): RecordingStore {
	const pathFor = (key: string) => join(dir, encodeURIComponent(key));
	const metaFor = (key: string) => `${pathFor(key)}.json`;

	return {
		async putStream(key, body, { contentType }) {
			const filePath = pathFor(key);
			try {
				await pipeline(
					Readable.fromWeb(body as unknown as NodeWebReadableStream),
					createWriteStream(filePath),
				);
			} catch (error) {
				await rm(filePath, { force: true });
				throw error;
			}
			const fileStat = await stat(filePath);
			if (fileStat.size <= 0) {
				await rm(filePath, { force: true });
				throw new Error("File recording rỗng (0 byte).");
			}
			await writeFile(
				metaFor(key),
				JSON.stringify({ contentType, size: fileStat.size }),
			);
			return { sizeBytes: fileStat.size };
		},

		async head(key) {
			let meta: { contentType: string; size: number };
			try {
				meta = JSON.parse(await readFile(metaFor(key), "utf8"));
			} catch {
				return null;
			}
			return {
				contentType: meta.contentType,
				size: meta.size,
				etag: `"${meta.size}-${encodeURIComponent(key)}"`,
			};
		},

		async get(key, range) {
			let meta: { contentType: string; size: number };
			try {
				meta = JSON.parse(await readFile(metaFor(key), "utf8"));
			} catch {
				return null;
			}
			const clampedRange =
				range &&
				Number.isInteger(range.offset) &&
				Number.isInteger(range.length) &&
				range.offset >= 0 &&
				range.offset < meta.size &&
				range.length > 0
					? {
							offset: range.offset,
							length: Math.min(range.length, meta.size - range.offset),
						}
					: undefined;
			const streamOpts = clampedRange
				? {
						start: clampedRange.offset,
						end: clampedRange.offset + clampedRange.length - 1,
					}
				: undefined;
			return {
				body: Readable.toWeb(
					createReadStream(pathFor(key), streamOpts),
				) as unknown as ReadableStream<Uint8Array>,
				contentType: meta.contentType,
				size: meta.size,
				etag: `"${meta.size}-${encodeURIComponent(key)}"`,
				...(clampedRange ? { range: clampedRange } : {}),
			};
		},

		async delete(key) {
			await rm(metaFor(key), { force: true });
			await rm(pathFor(key), { force: true });
		},
	};
}
