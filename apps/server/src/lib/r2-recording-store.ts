import type { RecordingStore } from "./recording-store";

/** Giới hạn single-PUT của R2 là 5 GiB (~5.36 GB); giữ ngưỡng an toàn dưới 5 GiB. */
const MAX_SINGLE_PUT_BYTES = 4_900_000_000;
/** Kích thước mỗi part cho R2 Multipart Upload (tối thiểu 5 MiB, chọn 8 MiB để êm dưới trần 128 MB RAM). */
const MULTIPART_PART_BYTES = 8 * 1024 * 1024;

function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
	const out = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

async function uploadViaMultipart(
	bucket: R2Bucket,
	key: string,
	body: ReadableStream<Uint8Array>,
	contentType: string,
	partSizeBytes = MULTIPART_PART_BYTES,
): Promise<{ sizeBytes: number }> {
	let upload: R2MultipartUpload;
	try {
		upload = await bucket.createMultipartUpload(key, {
			httpMetadata: { contentType },
		});
	} catch (err) {
		if (!body.locked) {
			await body.cancel().catch(() => {});
		}
		throw err;
	}
	const reader = body.getReader();
	const parts: R2UploadedPart[] = [];
	let pending: Uint8Array[] = [];
	let pendingBytes = 0;
	let totalBytes = 0;
	let partNumber = 1;

	const flushPart = async (bytesToFlush: Uint8Array) => {
		const uploaded = await upload.uploadPart(partNumber, bytesToFlush);
		parts.push(uploaded);
		partNumber += 1;
	};

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value || value.byteLength === 0) continue;

			let cursor = 0;
			while (cursor < value.byteLength) {
				const need = partSizeBytes - pendingBytes;
				const take = Math.min(need, value.byteLength - cursor);
				const slice =
					cursor === 0 && take === value.byteLength
						? value
						: value.subarray(cursor, cursor + take);
				pending.push(slice);
				pendingBytes += take;
				totalBytes += take;
				cursor += take;

				if (pendingBytes >= partSizeBytes) {
					const partBuf =
						pending.length === 1 && pending[0]
							? pending[0]
							: concatChunks(pending, pendingBytes);
					pending = [];
					pendingBytes = 0;
					await flushPart(partBuf);
				}
			}
		}

		if (totalBytes === 0) {
			throw new Error("File recording rỗng (0 byte).");
		}

		if (pendingBytes > 0) {
			const tailBuf =
				pending.length === 1 && pending[0]
					? pending[0]
					: concatChunks(pending, pendingBytes);
			pending = [];
			pendingBytes = 0;
			await flushPart(tailBuf);
		}

		await upload.complete(parts);
		return { sizeBytes: totalBytes };
	} catch (err) {
		await reader.cancel().catch(() => {});
		await upload.abort().catch(() => {});
		throw err;
	}
}

export interface CreateR2RecordingStoreOptions {
	/** Cho phép test hạ kích thước part nhỏ mà không cấp phát 8 MiB. */
	partSizeBytes?: number;
}

/**
 * Adapter R2 cho `RecordingStore`.
 *
 * Không bọc `TransformStream` JS cho đường single-PUT để tận dụng zero-copy
 * stream pipe ở tầng runtime workerd (tiết kiệm CPU và tránh vượt trần 128 MB RAM).
 * Khi nguồn không khai báo `Content-Length` hoặc vượt ngưỡng single-PUT, tự chuyển
 * sang R2 Multipart Upload theo từng part 8 MiB và hủy upload dở nếu xảy ra lỗi.
 */
export function createR2RecordingStore(
	bucket: R2Bucket,
	opts?: CreateR2RecordingStoreOptions,
): RecordingStore {
	const partSizeBytes = opts?.partSizeBytes ?? MULTIPART_PART_BYTES;

	return {
		async putStream(key, body, { contentType, declaredSize }) {
			const canSinglePut =
				typeof declaredSize === "number" &&
				Number.isSafeInteger(declaredSize) &&
				declaredSize > 0 &&
				declaredSize <= MAX_SINGLE_PUT_BYTES;

			if (canSinglePut) {
				try {
					const stored = await bucket.put(key, body, {
						httpMetadata: { contentType },
					});
					const actualSize = stored?.size ?? declaredSize;
					if (actualSize <= 0) {
						await bucket.delete(key).catch(() => {});
						throw new Error("File recording rỗng (0 byte).");
					}
					return { sizeBytes: actualSize };
				} catch (err) {
					if (
						!body.locked &&
						err instanceof TypeError &&
						/known length/i.test(err.message)
					) {
						return uploadViaMultipart(
							bucket,
							key,
							body,
							contentType,
							partSizeBytes,
						);
					}
					if (!body.locked) {
						await body.cancel().catch(() => {});
					}
					throw err;
				}
			}

			return uploadViaMultipart(bucket, key, body, contentType, partSizeBytes);
		},

		async head(key) {
			const object = await bucket.head(key);
			if (!object) return null;
			return {
				contentType: object.httpMetadata?.contentType ?? "video/mp4",
				size: object.size,
				...(object.httpEtag ? { etag: object.httpEtag } : {}),
			};
		},

		async get(key, range) {
			const validRange =
				range &&
				Number.isInteger(range.offset) &&
				Number.isInteger(range.length) &&
				range.offset >= 0 &&
				range.length > 0
					? range
					: undefined;
			const object = await bucket.get(
				key,
				validRange
					? { range: { offset: validRange.offset, length: validRange.length } }
					: undefined,
			);
			if (!object) return null;
			const clampedRange =
				validRange && validRange.offset < object.size
					? {
							offset: validRange.offset,
							length: Math.min(
								validRange.length,
								object.size - validRange.offset,
							),
						}
					: undefined;
			return {
				body: object.body,
				contentType: object.httpMetadata?.contentType ?? "video/mp4",
				size: object.size,
				...(clampedRange ? { range: clampedRange } : {}),
				...(object.httpEtag ? { etag: object.httpEtag } : {}),
			};
		},

		async delete(key) {
			await bucket.delete(key);
		},
	};
}
