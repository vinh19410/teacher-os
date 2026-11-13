/**
 * Đọc sớm tối đa `maxBytes` đầu của một `ReadableStream<Uint8Array>` để kiểm
 * tra chữ ký nhị phân (magic-byte) mà không đệm toàn bộ body vào RAM, sau đó
 * phát lại nguyên vẹn từng chunk theo backpressure pull-based (#676).
 *
 * Thuần Web Streams, KHÔNG tham chiếu global riêng của Cloudflare để cả Worker
 * (R2 `FixedLengthStream`) lẫn Node (`createFsMediaStore`) dùng chung.
 */

export interface PeekedStream {
	head: Uint8Array;
	/** Tổng số byte đã đọc từ nguồn trong vòng peek đầu. */
	readBytes: number;
	/** `true` nếu nguồn đã đóng (`done: true`) ngay trong vòng peek đầu. */
	ended: boolean;
	stream: ReadableStream<Uint8Array>;
	/**
	 * Huỷ reader gốc bất kể `stream` đã bị khoá bởi `pipeThrough` ở store
	 * (khi đó `stream.cancel()` ném `TypeError` bị nuốt); idempotent, không
	 * ném (#681).
	 */
	abort(reason?: unknown): Promise<void>;
}

export async function peekStream(
	body: ReadableStream<Uint8Array>,
	maxBytes: number,
	maxEmptyChunks = 16,
): Promise<PeekedStream> {
	if (!Number.isInteger(maxBytes) || maxBytes < 0) {
		throw new RangeError("maxBytes must be a non-negative integer");
	}
	const reader = body.getReader();
	const chunks: (Uint8Array | undefined)[] = [];
	let chunkIndex = 0;
	let readBytes = 0;
	let sourceDone = false;
	let cancelled = false;
	let released = false;

	const releaseReader = (clearBuffered: boolean) => {
		if (clearBuffered) chunks.length = 0;
		if (!released) {
			released = true;
			try {
				reader.releaseLock();
			} catch {
				// Khoá đã được giải phóng trước đó hoặc stream ở trạng thái lỗi.
			}
		}
	};

	let emptyStreak = 0;
	try {
		while (readBytes < maxBytes) {
			const step = await reader.read();
			if (step.done) {
				sourceDone = true;
				releaseReader(false);
				break;
			}
			if (step.value.byteLength === 0) {
				emptyStreak += 1;
				if (emptyStreak > maxEmptyChunks) {
					throw new Error("stream stalled with empty chunks");
				}
				continue;
			}
			emptyStreak = 0;
			chunks.push(step.value);
			readBytes += step.value.byteLength;
		}
	} catch (error) {
		await reader.cancel().catch(() => undefined);
		releaseReader(true);
		throw error;
	}

	const headLength = Math.min(maxBytes, readBytes);
	const head = new Uint8Array(headLength);
	let copied = 0;
	for (const chunk of chunks) {
		if (!chunk || copied >= headLength) break;
		const take = Math.min(chunk.byteLength, headLength - copied);
		head.set(chunk.subarray(0, take), copied);
		copied += take;
	}

	const stream = new ReadableStream<Uint8Array>(
		{
			async pull(controller) {
				if (cancelled) return;
				if (chunkIndex < chunks.length) {
					const buffered = chunks[chunkIndex];
					chunks[chunkIndex] = undefined;
					chunkIndex += 1;
					if (buffered) controller.enqueue(buffered);
					if (chunkIndex >= chunks.length && sourceDone) {
						releaseReader(true);
						if (!cancelled) controller.close();
					}
					return;
				}
				if (sourceDone) {
					releaseReader(true);
					if (!cancelled) controller.close();
					return;
				}
				let passEmptyStreak = 0;
				while (true) {
					let next: ReadableStreamReadResult<Uint8Array>;
					try {
						next = await reader.read();
					} catch (error) {
						releaseReader(true);
						throw error;
					}
					if (cancelled) return;
					if (next.done) {
						sourceDone = true;
						releaseReader(true);
						controller.close();
						return;
					}
					if (next.value.byteLength === 0) {
						passEmptyStreak += 1;
						if (passEmptyStreak > maxEmptyChunks) {
							await reader.cancel().catch(() => undefined);
							releaseReader(true);
							throw new Error("stream stalled with empty chunks");
						}
						continue;
					}
					controller.enqueue(next.value);
					return;
				}
			},
			async cancel(reason) {
				await abort(reason);
			},
		},
		{ highWaterMark: 0 },
	);

	/**
	 * Huỷ reader gốc bất kể `stream` đã bị khoá bởi `pipeThrough` ở store
	 * (khi đó `stream.cancel()` ném `TypeError` bị nuốt) — an toàn để gọi
	 * lặp lại (#681).
	 */
	const abort = async (reason?: unknown): Promise<void> => {
		cancelled = true;
		chunks.length = 0;
		try {
			if (!sourceDone) {
				sourceDone = true;
				await reader.cancel(reason).catch(() => undefined);
			}
		} finally {
			releaseReader(true);
		}
	};

	return { head, readBytes, ended: sourceDone, stream, abort };
}
