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
		async get(key, range) {
			const object = await bucket.get(
				key,
				range
					? { range: { offset: range.offset, length: range.length } }
					: undefined,
			);
			if (!object) return null;
			return {
				body: object.body,
				contentType:
					object.httpMetadata?.contentType ?? "application/octet-stream",
				size: object.size,
				...(range ? { range } : {}),
			};
		},
		async delete(key) {
			await bucket.delete(key);
		},
	};
}
