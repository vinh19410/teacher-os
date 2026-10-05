/**
 * Adapter lưu trữ thật cho runtime Node của e2e (#305) — file bài nói ghi
 * xuống đĩa, giống cách boot dùng libsql thay D1. Mỗi object là 1 file
 * nhị phân + 1 sidecar `.json` chứa contentType/size. Đếm byte thật như
 * adapter R2: lệch Content-Length → xoá file dở, ném MediaSizeMismatchError.
 */

import { createReadStream, createWriteStream } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { enforceDeclaredSize, type MediaStore } from "server/app";

export function createFsMediaStore(dir: string): MediaStore {
	const pathFor = (key: string) => join(dir, encodeURIComponent(key));
	const metaFor = (key: string) => `${pathFor(key)}.json`;

	return {
		async put(key, body, { contentType, size }) {
			const counted = enforceDeclaredSize(body, size);
			try {
				await pipeline(
					Readable.fromWeb(counted.stream as unknown as NodeWebReadableStream),
					createWriteStream(pathFor(key)),
				);
			} catch (error) {
				await rm(pathFor(key), { force: true });
				throw error;
			}
			await writeFile(metaFor(key), JSON.stringify({ contentType, size }));
		},
		async get(key) {
			let meta: { contentType: string; size: number };
			try {
				meta = JSON.parse(await readFile(metaFor(key), "utf8"));
			} catch {
				return null;
			}
			return {
				body: Readable.toWeb(
					createReadStream(pathFor(key)),
				) as unknown as ReadableStream<Uint8Array>,
				contentType: meta.contentType,
				size: meta.size,
			};
		},
		async delete(key) {
			await rm(metaFor(key), { force: true });
			await rm(pathFor(key), { force: true });
		},
	};
}
