import { describe, expect, it } from "vitest";
import { INLINE_MEDIA_CSP, STRICT_CSP } from "./material-file-response";
import type { RecordingByteRange, RecordingStore } from "./recording-store";
import { recordingVideoResponse } from "./recording-video-response";

function createMemoryRecordingStore(
	initial: Record<string, { bytes: Uint8Array; contentType: string }> = {},
): RecordingStore {
	const map = new Map(Object.entries(initial));
	return {
		async putStream(key, body, { contentType }) {
			const chunks: Uint8Array[] = [];
			const reader = body.getReader();
			let total = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
				total += value.byteLength;
			}
			const buf = new Uint8Array(total);
			let offset = 0;
			for (const c of chunks) {
				buf.set(c, offset);
				offset += c.byteLength;
			}
			map.set(key, { bytes: buf, contentType });
			return { sizeBytes: total };
		},
		async head(key) {
			const entry = map.get(key);
			if (!entry) return null;
			return { contentType: entry.contentType, size: entry.bytes.byteLength };
		},
		async get(key, range?: RecordingByteRange) {
			const entry = map.get(key);
			if (!entry) return null;
			const size = entry.bytes.byteLength;
			const clamped =
				range && range.offset >= 0 && range.offset < size && range.length > 0
					? {
							offset: range.offset,
							length: Math.min(range.length, size - range.offset),
						}
					: undefined;
			const slice = clamped
				? entry.bytes.subarray(clamped.offset, clamped.offset + clamped.length)
				: entry.bytes;
			return {
				body: new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(slice);
						controller.close();
					},
				}),
				contentType: entry.contentType,
				size,
				...(clamped ? { range: clamped } : {}),
			};
		},
		async delete(key) {
			map.delete(key);
		},
	};
}

describe("recordingVideoResponse", () => {
	const sampleBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

	it("returns 200 inline video with locked headers when no Range header is sent", async () => {
		const store = createMemoryRecordingStore({
			"org/cls/2026-11-26/rec.mp4": {
				bytes: sampleBytes,
				contentType: "video/mp4",
			},
		});

		const res = await recordingVideoResponse(
			store,
			{
				storageKey: "org/cls/2026-11-26/rec.mp4",
				mimeType: "video/mp4",
				sizeBytes: sampleBytes.byteLength,
				fileName: "recording-2026-11-26.mp4",
			},
			{ rangeHeader: undefined },
		);

		expect(res).not.toBeNull();
		if (!res) return;
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("video/mp4");
		expect(res.headers.get("Content-Disposition")).toBe(
			"inline; filename*=UTF-8''recording-2026-11-26.mp4",
		);
		expect(res.headers.get("Accept-Ranges")).toBe("bytes");
		expect(res.headers.get("Content-Length")).toBe("10");
		expect(res.headers.get("Content-Security-Policy")).toBe(INLINE_MEDIA_CSP);
		expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
		expect(res.headers.get("Cache-Control")).toBe("private, no-store");
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(sampleBytes);
	});

	it("returns 206 Partial Content for valid single byte range", async () => {
		const store = createMemoryRecordingStore({
			"org/cls/2026-11-26/rec.mp4": {
				bytes: sampleBytes,
				contentType: "video/mp4",
			},
		});

		const res = await recordingVideoResponse(
			store,
			{
				storageKey: "org/cls/2026-11-26/rec.mp4",
				mimeType: "video/mp4",
				sizeBytes: sampleBytes.byteLength,
				fileName: "recording.mp4",
			},
			{ rangeHeader: "bytes=2-5" },
		);

		expect(res).not.toBeNull();
		if (!res) return;
		expect(res.status).toBe(206);
		expect(res.headers.get("Content-Range")).toBe("bytes 2-5/10");
		expect(res.headers.get("Content-Length")).toBe("4");
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(
			new Uint8Array([2, 3, 4, 5]),
		);
	});

	it("returns 416 Range Not Satisfiable for out-of-bounds range", async () => {
		const store = createMemoryRecordingStore({
			"org/cls/2026-11-26/rec.mp4": {
				bytes: sampleBytes,
				contentType: "video/mp4",
			},
		});

		const res = await recordingVideoResponse(
			store,
			{
				storageKey: "org/cls/2026-11-26/rec.mp4",
				mimeType: "video/mp4",
				sizeBytes: sampleBytes.byteLength,
				fileName: "recording.mp4",
			},
			{ rangeHeader: "bytes=50-60" },
		);

		expect(res?.status).toBe(416);
		expect(res?.headers.get("Content-Range")).toBe("bytes */10");
		expect(res?.headers.get("Content-Security-Policy")).toBe(STRICT_CSP);
	});

	it("returns null when storage object is missing", async () => {
		const store = createMemoryRecordingStore();
		const res = await recordingVideoResponse(
			store,
			{
				storageKey: "missing.mp4",
				mimeType: "video/mp4",
				sizeBytes: 100,
				fileName: "missing.mp4",
			},
			{ rangeHeader: undefined },
		);
		expect(res).toBeNull();
	});

	it("falls back non-video MIME to video/mp4 safely", async () => {
		const store = createMemoryRecordingStore({
			k: { bytes: sampleBytes, contentType: "text/html" },
		});
		const res = await recordingVideoResponse(
			store,
			{
				storageKey: "k",
				mimeType: "text/html",
				sizeBytes: 10,
				fileName: "rec.mp4",
			},
			{ rangeHeader: undefined },
		);
		expect(res?.headers.get("Content-Type")).toBe("video/mp4");
	});
});
