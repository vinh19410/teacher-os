/**
 * Kho file bài nói Speaking (#305). Interface thuần, KHÔNG tham chiếu type
 * Cloudflare: e2e (tsconfig `types: ["node"]`) type-check `server/app` kéo
 * theo file này, nên adapter R2 nằm riêng ở `r2-media-store.ts` và chỉ
 * `index.ts` import. Production dùng R2, e2e dùng đĩa, unit test dùng Map.
 */

export interface MediaByteRange {
	offset: number;
	length: number;
}

export interface StoredMedia {
	body: ReadableStream<Uint8Array>;
	contentType: string;
	size: number;
	range?: MediaByteRange;
}

export interface MediaStore {
	/**
	 * Ghi `body` (stream request chưa đọc) vào `key`. `size` là
	 * Content-Length đã kiểm; số byte thật lệch `size` thì ném
	 * `MediaSizeMismatchError` và không để lại object.
	 */
	put(
		key: string,
		body: ReadableStream<Uint8Array>,
		meta: { contentType: string; size: number },
	): Promise<void>;
	get(key: string, range?: MediaByteRange): Promise<StoredMedia | null>;
	delete(key: string): Promise<void>;
}

/** Body thật dài/ngắn hơn Content-Length đã khai — route trả 400. */
export class MediaSizeMismatchError extends Error {
	constructor(expected: number) {
		super(`media body does not match declared size ${expected}`);
		this.name = "MediaSizeMismatchError";
	}
}

/**
 * Bọc stream để đếm byte thật: vượt `size` hoặc kết thúc sớm thì stream lỗi
 * với `MediaSizeMismatchError`. `mismatched()` cho adapter biết lỗi đến từ
 * kiểm độ dài — runtime (R2) có thể bọc lại lỗi gốc của stream.
 */
export function enforceDeclaredSize(
	body: ReadableStream<Uint8Array>,
	size: number,
): { stream: ReadableStream<Uint8Array>; mismatched: () => boolean } {
	let received = 0;
	let mismatch = false;
	const stream = body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				received += chunk.byteLength;
				if (received > size) {
					mismatch = true;
					controller.error(new MediaSizeMismatchError(size));
					return;
				}
				controller.enqueue(chunk);
			},
			flush(controller) {
				if (received !== size) {
					mismatch = true;
					controller.error(new MediaSizeMismatchError(size));
				}
			},
		}),
	);
	return { stream, mismatched: () => mismatch };
}
