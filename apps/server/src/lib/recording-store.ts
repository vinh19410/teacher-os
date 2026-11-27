/**
 * Kho lưu trữ video recording buổi học Zoom (bucket `recordings` ở production,
 * thư mục tạm trên đĩa ở E2E, Map trong unit test).
 *
 * Interface thuần KHÔNG tham chiếu type Cloudflare: `apps/e2e` (tsconfig Node)
 * import `server/app` nên adapter R2 nằm tách riêng ở `r2-recording-store.ts`
 * và chỉ `index.ts` nạp.
 */

export interface RecordingByteRange {
	offset: number;
	length: number;
}

export interface StoredRecordingMeta {
	contentType: string;
	size: number;
	etag?: string;
}

export interface StoredRecording {
	body: ReadableStream<Uint8Array>;
	contentType: string;
	size: number;
	range?: RecordingByteRange;
	etag?: string;
}

export interface RecordingPutResult {
	sizeBytes: number;
}

export interface RecordingStore {
	/**
	 * Ghi stream video trực tiếp xuống kho mà không nạp toàn bộ file vào RAM.
	 * Khi biết trước `declaredSize` (từ `Content-Length` hợp lệ và trong ngưỡng
	 * single-PUT), adapter R2 dùng đường truyền zero-copy; khi không rõ độ dài
	 * hoặc file rất lớn, tự động dùng R2 Multipart Upload theo từng part ≥ 5 MiB.
	 */
	putStream(
		key: string,
		body: ReadableStream<Uint8Array>,
		meta: { contentType: string; declaredSize?: number },
	): Promise<RecordingPutResult>;
	head?(key: string): Promise<StoredRecordingMeta | null>;
	get(key: string, range?: RecordingByteRange): Promise<StoredRecording | null>;
	delete(key: string): Promise<void>;
}
