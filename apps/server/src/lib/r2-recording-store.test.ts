import { describe, expect, it, vi } from "vitest";
import { createR2RecordingStore } from "./r2-recording-store";

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(chunk);
			}
			controller.close();
		},
	});
}

describe("createR2RecordingStore", () => {
	it("uses zero-copy bucket.put when declaredSize is known and positive", async () => {
		const put = vi.fn(async () => ({ size: 1024 }));
		const createMultipartUpload = vi.fn();
		const bucket = {
			put,
			createMultipartUpload,
			head: vi.fn(),
			get: vi.fn(),
			delete: vi.fn(),
		} as unknown as R2Bucket;

		const store = createR2RecordingStore(bucket);
		const body = streamFromChunks([new Uint8Array(1024)]);
		const res = await store.putStream("org/cls/2026-11-26/rec.mp4", body, {
			contentType: "video/mp4",
			declaredSize: 1024,
		});

		expect(res).toEqual({ sizeBytes: 1024 });
		expect(put).toHaveBeenCalledTimes(1);
		expect(put).toHaveBeenCalledWith("org/cls/2026-11-26/rec.mp4", body, {
			httpMetadata: { contentType: "video/mp4" },
		});
		expect(createMultipartUpload).not.toHaveBeenCalled();
	});

	it("rejects and deletes empty objects on single put", async () => {
		const put = vi.fn(async () => ({ size: 0 }));
		const del = vi.fn(async () => {});
		const bucket = {
			put,
			delete: del,
			createMultipartUpload: vi.fn(),
			head: vi.fn(),
			get: vi.fn(),
		} as unknown as R2Bucket;

		const store = createR2RecordingStore(bucket);
		await expect(
			store.putStream("k", streamFromChunks([]), {
				contentType: "video/mp4",
				declaredSize: 100,
			}),
		).rejects.toThrow("0 byte");
		expect(del).toHaveBeenCalledWith("k");
	});

	it("streams via R2 multipart upload when declaredSize is unknown", async () => {
		const uploadedParts: Array<{ partNumber: number; bytes: Uint8Array }> = [];
		const complete = vi.fn(async () => ({}));
		const abort = vi.fn(async () => {});
		const uploadPart = vi.fn(
			async (partNumber: number, value: ArrayBufferView) => {
				const copy = new Uint8Array(
					value.buffer,
					value.byteOffset,
					value.byteLength,
				).slice();
				uploadedParts.push({ partNumber, bytes: copy });
				return { partNumber, etag: `etag-${partNumber}` };
			},
		);
		const createMultipartUpload = vi.fn(async () => ({
			uploadPart,
			complete,
			abort,
		}));
		const put = vi.fn();
		const bucket = {
			put,
			createMultipartUpload,
			head: vi.fn(),
			get: vi.fn(),
			delete: vi.fn(),
		} as unknown as R2Bucket;

		const store = createR2RecordingStore(bucket, { partSizeBytes: 5 });
		const body = streamFromChunks([
			new Uint8Array([1, 2, 3]),
			new Uint8Array([4, 5, 6, 7, 8, 9, 10, 11]),
			new Uint8Array([12]),
		]);

		const res = await store.putStream("org/cls/2026-11-26/rec.mp4", body, {
			contentType: "video/mp4",
		});

		expect(res).toEqual({ sizeBytes: 12 });
		expect(put).not.toHaveBeenCalled();
		expect(createMultipartUpload).toHaveBeenCalledTimes(1);
		expect(uploadedParts).toHaveLength(3);
		expect(Array.from(uploadedParts[0]?.bytes ?? [])).toEqual([1, 2, 3, 4, 5]);
		expect(Array.from(uploadedParts[1]?.bytes ?? [])).toEqual([6, 7, 8, 9, 10]);
		expect(Array.from(uploadedParts[2]?.bytes ?? [])).toEqual([11, 12]);
		expect(complete).toHaveBeenCalledWith([
			{ partNumber: 1, etag: "etag-1" },
			{ partNumber: 2, etag: "etag-2" },
			{ partNumber: 3, etag: "etag-3" },
		]);
		expect(abort).not.toHaveBeenCalled();
	});

	it("aborts multipart upload if a part upload fails", async () => {
		const abort = vi.fn(async () => {});
		const uploadPart = vi
			.fn()
			.mockResolvedValueOnce({ partNumber: 1, etag: "e1" })
			.mockRejectedValueOnce(new Error("r2 unavailable"));
		const bucket = {
			put: vi.fn(),
			createMultipartUpload: vi.fn(async () => ({
				uploadPart,
				complete: vi.fn(),
				abort,
			})),
			head: vi.fn(),
			get: vi.fn(),
			delete: vi.fn(),
		} as unknown as R2Bucket;

		const store = createR2RecordingStore(bucket, { partSizeBytes: 4 });
		const body = streamFromChunks([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])]);

		await expect(
			store.putStream("k", body, { contentType: "video/mp4" }),
		).rejects.toThrow("r2 unavailable");
		expect(abort).toHaveBeenCalledTimes(1);
	});

	it("cancels upstream stream when single put or createMultipartUpload fails", async () => {
		let cancelledSingle = false;
		const singleStream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array([1, 2, 3]));
			},
			cancel() {
				cancelledSingle = true;
			},
		});
		const singleBucket = {
			put: vi.fn().mockRejectedValue(new Error("r2 put failed")),
			createMultipartUpload: vi.fn(),
			head: vi.fn(),
			get: vi.fn(),
			delete: vi.fn(),
		} as unknown as R2Bucket;

		await expect(
			createR2RecordingStore(singleBucket).putStream("k", singleStream, {
				contentType: "video/mp4",
				declaredSize: 3,
			}),
		).rejects.toThrow("r2 put failed");
		expect(cancelledSingle).toBe(true);

		let cancelledMultipart = false;
		const multipartStream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array([1, 2, 3]));
			},
			cancel() {
				cancelledMultipart = true;
			},
		});
		const multipartBucket = {
			put: vi.fn(),
			createMultipartUpload: vi
				.fn()
				.mockRejectedValue(new Error("multipart init failed")),
			head: vi.fn(),
			get: vi.fn(),
			delete: vi.fn(),
		} as unknown as R2Bucket;

		await expect(
			createR2RecordingStore(multipartBucket).putStream("k", multipartStream, {
				contentType: "video/mp4",
			}),
		).rejects.toThrow("multipart init failed");
		expect(cancelledMultipart).toBe(true);
	});

	it("falls back to multipart upload when bucket.put rejects unknown-length stream", async () => {
		const complete = vi.fn(async () => ({}));
		const uploadPart = vi.fn(async (partNumber: number) => ({
			partNumber,
			etag: `e-${partNumber}`,
		}));
		const bucket = {
			put: vi
				.fn()
				.mockRejectedValue(
					new TypeError(
						"Provided readable stream must have a known length (request/response body)",
					),
				),
			createMultipartUpload: vi.fn(async () => ({
				uploadPart,
				complete,
				abort: vi.fn(),
			})),
			head: vi.fn(),
			get: vi.fn(),
			delete: vi.fn(),
		} as unknown as R2Bucket;

		const res = await createR2RecordingStore(bucket, {
			partSizeBytes: 4,
		}).putStream("k", streamFromChunks([new Uint8Array([1, 2, 3, 4, 5])]), {
			contentType: "video/mp4",
			declaredSize: 5,
		});
		expect(res).toEqual({ sizeBytes: 5 });
		expect(uploadPart).toHaveBeenCalledTimes(2);
		expect(complete).toHaveBeenCalledTimes(1);
	});

	it("clamps byte ranges on get", async () => {
		const payload = new Uint8Array([10, 20, 30, 40]);
		const bucket = {
			put: vi.fn(),
			createMultipartUpload: vi.fn(),
			head: vi.fn(),
			get: vi.fn(async () => ({
				body: streamFromChunks([payload.subarray(2, 4)]),
				size: 4,
				httpMetadata: { contentType: "video/mp4" },
				httpEtag: '"etag-1"',
			})),
			delete: vi.fn(),
		} as unknown as R2Bucket;

		const store = createR2RecordingStore(bucket);
		const obj = await store.get("k", { offset: 2, length: 10 });
		expect(obj?.size).toBe(4);
		expect(obj?.range).toEqual({ offset: 2, length: 2 });
		expect(obj?.etag).toBe('"etag-1"');
	});
});
