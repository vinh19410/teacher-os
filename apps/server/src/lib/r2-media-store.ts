import {
	enforceDeclaredSize,
	MediaSizeMismatchError,
	type MediaStore,
} from "./media-store";

/**
 * Adapter R2 cho `MediaStore`. Body đếm byte thật (`enforceDeclaredSize`)
 * rồi qua `FixedLengthStream(size)` (native Workers): R2 chỉ nhận stream có
 * độ dài biết trước, và cap 50MB đo trên byte thật chứ không tin header.
 * R2 không lưu object dở khi stream lỗi.
 */
export function createR2MediaStore(bucket: R2Bucket): MediaStore {
	return {
		async put(key, body, { contentType, size }) {
			const counted = enforceDeclaredSize(body, size);
			try {
				await bucket.put(
					key,
					counted.stream.pipeThrough(new FixedLengthStream(size)),
					{ httpMetadata: { contentType } },
				);
			} catch (error) {
				if (counted.mismatched()) throw new MediaSizeMismatchError(size);
				throw error;
			}
		},
		async head(key) {
			const object = await bucket.head(key);
			if (!object) return null;
			return {
				contentType:
					object.httpMetadata?.contentType ?? "application/octet-stream",
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
				contentType:
					object.httpMetadata?.contentType ?? "application/octet-stream",
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
