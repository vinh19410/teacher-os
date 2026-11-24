import { LIBRARY_AUDIO_MAX_BYTES } from "@teacher-os/api/library-contracts";
import { describe, expect, test, vi } from "vitest";
import type { MediaByteRange, MediaStore } from "./media-store";
import { serveStudyPackAudio, streamStudyPackAudio } from "./study-pack-audio";

function createSpecCompliantMockFetch(routes: {
	urlsSeen: string[];
	redirectModes: Array<RequestInit["redirect"]>;
}): typeof fetch {
	const mockFetch = async (
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> => {
		const url = typeof input === "string" ? input : input.toString();
		routes.urlsSeen.push(url);
		routes.redirectModes.push(init?.redirect);

		if (url === "https://listenaminute.com/a/redirect-bad.mp3") {
			if (init?.redirect === "manual") {
				return new Response(null, {
					status: 302,
					headers: { location: "https://evil.example.com/payload.mp3" },
				});
			}
			// Simulate Fetch `redirect: "follow"` SSRF into internal/evil target
			return mockFetch("https://evil.example.com/payload.mp3", init);
		}

		if (url === "https://listenaminute.com/a/redirect-ok.mp3") {
			if (init?.redirect === "manual") {
				return new Response(null, {
					status: 302,
					headers: {
						location: "https://www.listenaminute.com/a/accidents.mp3",
					},
				});
			}
			return mockFetch("https://www.listenaminute.com/a/accidents.mp3", init);
		}

		if (url === "https://www.listenaminute.com/a/accidents.mp3") {
			return new Response(new Uint8Array([0x49, 0x44, 0x33, 0x03]), {
				status: 200,
				headers: {
					"content-type": "audio/mpeg",
					"content-length": "4",
				},
			});
		}

		if (url === "https://evil.example.com/payload.mp3") {
			return new Response(new Uint8Array([1, 2, 3]), {
				status: 200,
				headers: { "content-type": "audio/mpeg" },
			});
		}

		return new Response(null, { status: 404 });
	};
	return mockFetch as typeof fetch;
}

describe("streamStudyPackAudio (#702)", () => {
	test("uses redirect:manual so evil 302 targets are never fetched", async () => {
		const urlsSeen: string[] = [];
		const redirectModes: Array<RequestInit["redirect"]> = [];
		const mockFetch = createSpecCompliantMockFetch({ urlsSeen, redirectModes });

		const blocked = await streamStudyPackAudio(
			"https://listenaminute.com/a/redirect-bad.mp3",
			mockFetch,
		);
		expect(blocked.status).toBe(404);
		expect(redirectModes).toEqual(["manual"]);
		expect(urlsSeen).toEqual(["https://listenaminute.com/a/redirect-bad.mp3"]);
		expect(urlsSeen.some((u) => u.includes("evil.example.com"))).toBe(false);
	});

	test("follows allowlisted 302 hops in manual mode and streams audio", async () => {
		const urlsSeen: string[] = [];
		const redirectModes: Array<RequestInit["redirect"]> = [];
		const mockFetch = createSpecCompliantMockFetch({ urlsSeen, redirectModes });

		const ok = await streamStudyPackAudio(
			"https://listenaminute.com/a/redirect-ok.mp3",
			mockFetch,
		);
		expect(ok.status).toBe(200);
		expect(ok.headers.get("cache-control")).toBe("private, no-store");
		expect(redirectModes).toEqual(["manual", "manual"]);
		expect(urlsSeen).toEqual([
			"https://listenaminute.com/a/redirect-ok.mp3",
			"https://www.listenaminute.com/a/accidents.mp3",
		]);
		expect(new Uint8Array(await ok.arrayBuffer())).toEqual(
			new Uint8Array([0x49, 0x44, 0x33, 0x03]),
		);
	});

	test("rejects responses with empty 0-byte body or oversized Content-Length", async () => {
		const emptyStream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.close();
			},
		});
		const emptyRes = await streamStudyPackAudio(
			"https://listenaminute.com/a/empty.mp3",
			(async () =>
				new Response(emptyStream, {
					status: 200,
					headers: { "content-type": "audio/mpeg" },
				})) as typeof fetch,
		);
		expect(emptyRes.status).toBe(404);

		let largeBodyCancelled = false;
		const oversizedStream = new ReadableStream<Uint8Array>({
			cancel() {
				largeBodyCancelled = true;
			},
		});
		const oversizedHeaderRes = await streamStudyPackAudio(
			"https://listenaminute.com/a/huge.mp3",
			(async () =>
				new Response(oversizedStream, {
					status: 200,
					headers: {
						"content-type": "audio/mpeg",
						"content-length": String(LIBRARY_AUDIO_MAX_BYTES + 1),
					},
				})) as typeof fetch,
		);
		expect(oversizedHeaderRes.status).toBe(404);
		expect(largeBodyCancelled).toBe(true);
	});

	test("cancels upstream reader when chunked stream exceeds maxBytes mid-stream", async () => {
		let cancelled = false;
		let pullCount = 0;
		const chunkedStream = new ReadableStream<Uint8Array>({
			pull(controller) {
				pullCount++;
				if (pullCount <= 3) {
					controller.enqueue(new Uint8Array(512).fill(0x41));
					return;
				}
				controller.close();
			},
			cancel() {
				cancelled = true;
			},
		});

		const res = await streamStudyPackAudio(
			"https://listenaminute.com/a/chunked.mp3",
			(async () =>
				new Response(chunkedStream, {
					status: 200,
					headers: { "content-type": "audio/mpeg" },
				})) as typeof fetch,
			800,
		);
		expect(res.status).toBe(200);
		await expect(res.arrayBuffer()).rejects.toThrow(/byte limit/i);
		expect(cancelled).toBe(true);
	});

	test("passes through valid single-byte Range to upstream 206 and falls back to 200 when upstream ignores Range", async () => {
		const seenRanges: Array<string | null> = [];
		const mockFetch = (async (
			_input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			const hdrs = new Headers(init?.headers);
			const range = hdrs.get("range");
			seenRanges.push(range);
			if (range === "bytes=0-1") {
				return new Response(new Uint8Array([0x49, 0x44]), {
					status: 206,
					headers: {
						"content-type": "audio/mpeg",
						"content-length": "2",
						"content-range": "bytes 0-1/4",
						"accept-ranges": "bytes",
					},
				});
			}
			return new Response(new Uint8Array([0x49, 0x44, 0x33, 0x03]), {
				status: 200,
				headers: {
					"content-type": "audio/mpeg",
					"content-length": "4",
				},
			});
		}) as typeof fetch;

		const partial = await streamStudyPackAudio(
			"https://www.listenaminute.com/a/accidents.mp3",
			mockFetch,
			LIBRARY_AUDIO_MAX_BYTES,
			{
				rangeHeader: "bytes=0-1",
				cacheControl: "private, no-cache",
				vary: "Cookie, x-student-org-id",
			},
		);
		expect(partial.status).toBe(206);
		expect(partial.headers.get("content-range")).toBe("bytes 0-1/4");
		expect(partial.headers.get("content-length")).toBe("2");
		expect(partial.headers.get("accept-ranges")).toBe("bytes");
		expect(partial.headers.get("cache-control")).toBe("private, no-cache");
		expect(partial.headers.get("vary")).toBe("Cookie, x-student-org-id");
		expect(Array.from(new Uint8Array(await partial.arrayBuffer()))).toEqual([
			0x49, 0x44,
		]);

		// Malformed outbound Range is ignored (never forwarded to upstream)
		const badRange = await streamStudyPackAudio(
			"https://www.listenaminute.com/a/accidents.mp3",
			mockFetch,
			LIBRARY_AUDIO_MAX_BYTES,
			{ rangeHeader: "bytes=-" },
		);
		expect(badRange.status).toBe(200);
		expect(badRange.headers.get("cache-control")).toBe("private, no-store");
		expect(seenRanges).toEqual(["bytes=0-1", null]);

		// serveStudyPackAudio external audioUrl fallback preserves private, no-store by default
		const fallbackTeacher = await serveStudyPackAudio({
			audioUrl: "https://www.listenaminute.com/a/accidents.mp3",
			fetchExternalAudio: mockFetch,
		});
		expect(fallbackTeacher.status).toBe(200);
		expect(fallbackTeacher.headers.get("cache-control")).toBe(
			"private, no-store",
		);
	});

	test("rejects upstream 206 with invalid or mismatched Content-Range and returns hardened 416 on upstream 416", async () => {
		let bad206Cancelled = false;
		const bad206 = await streamStudyPackAudio(
			"https://www.listenaminute.com/a/accidents.mp3",
			(async () =>
				new Response(
					new ReadableStream<Uint8Array>({
						cancel() {
							bad206Cancelled = true;
						},
					}),
					{
						status: 206,
						headers: {
							"content-type": "audio/mpeg",
							"content-range": "bytes 50-10/100",
							"content-length": "4",
						},
					},
				)) as typeof fetch,
			LIBRARY_AUDIO_MAX_BYTES,
			{ rangeHeader: "bytes=0-3" },
		);
		expect(bad206.status).toBe(404);
		expect(bad206Cancelled).toBe(true);

		let r416Cancelled = false;
		const r416 = await streamStudyPackAudio(
			"https://www.listenaminute.com/a/accidents.mp3",
			(async () =>
				new Response(
					new ReadableStream<Uint8Array>({
						cancel() {
							r416Cancelled = true;
						},
					}),
					{
						status: 416,
						headers: { "content-range": "bytes */4" },
					},
				)) as typeof fetch,
			LIBRARY_AUDIO_MAX_BYTES,
			{ rangeHeader: "bytes=10-20" },
		);
		expect(r416.status).toBe(416);
		expect(r416Cancelled).toBe(true);
		expect(r416.headers.get("accept-ranges")).toBe("bytes");
		expect(r416.headers.get("content-range")).toBe("bytes */4");
		expect(r416.headers.get("x-content-type-options")).toBe("nosniff");
		expect(r416.headers.get("content-security-policy")).toBe(
			"default-src 'none'; sandbox",
		);
		expect(r416.headers.get("cross-origin-resource-policy")).toBe("same-site");
		expect(r416.headers.get("referrer-policy")).toBe("no-referrer");
		expect(r416.headers.get("cache-control")).toBe("private, no-store");
	});

	test("does not abort paused/backpressured stream during client idle pause between pull() calls", async () => {
		vi.useFakeTimers();
		try {
			let pullIdx = 0;
			const upstream = new ReadableStream<Uint8Array>({
				pull(controller) {
					pullIdx += 1;
					if (pullIdx === 1) {
						controller.enqueue(new Uint8Array([0x49, 0x44]));
						return;
					}
					if (pullIdx === 2) {
						controller.enqueue(new Uint8Array([0x33, 0x03]));
						return;
					}
					controller.close();
				},
			});

			const res = await streamStudyPackAudio(
				"https://www.listenaminute.com/a/accidents.mp3",
				(async () =>
					new Response(upstream, {
						status: 200,
						headers: { "content-type": "audio/mpeg", "content-length": "4" },
					})) as typeof fetch,
			);
			expect(res.status).toBe(200);
			const reader = res.body?.getReader();
			expect(reader).toBeDefined();
			const first = await reader?.read();
			expect(Array.from(first?.value ?? [])).toEqual([0x49, 0x44]);

			// Simulate student pausing playback for 20s (> 15s read timeout, < 120s lifetime cap)
			await vi.advanceTimersByTimeAsync(20_000);

			const second = await reader?.read();
			expect(Array.from(second?.value ?? [])).toEqual([0x33, 0x03]);
			const end = await reader?.read();
			expect(end?.done).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("serveStudyPackAudio R2 Range, ETag/304, and MIME fallback", () => {
	function makeMemoryStore(
		entries: Record<
			string,
			{ bytes: Uint8Array; contentType: string; etag?: string }
		>,
		options?: { supportHead?: boolean; supportRange?: boolean },
	): MediaStore & { headCalls: number; getCalls: number } {
		const supportHead = options?.supportHead ?? true;
		const supportRange = options?.supportRange ?? true;
		const store: MediaStore & { headCalls: number; getCalls: number } = {
			headCalls: 0,
			getCalls: 0,
			async put() {
				throw new Error("not implemented");
			},
			...(supportHead
				? {
						async head(key: string) {
							store.headCalls += 1;
							const entry = entries[key];
							if (!entry) return null;
							return {
								contentType: entry.contentType,
								size: entry.bytes.byteLength,
								...(entry.etag ? { etag: entry.etag } : {}),
							};
						},
					}
				: {}),
			async get(key: string, range?: MediaByteRange) {
				store.getCalls += 1;
				const entry = entries[key];
				if (!entry) return null;
				if (supportRange && range) {
					const clampedLength = Math.max(
						0,
						Math.min(range.length, entry.bytes.byteLength - range.offset),
					);
					const slice = entry.bytes.subarray(
						range.offset,
						range.offset + clampedLength,
					);
					return {
						body: new Response(slice).body as ReadableStream<Uint8Array>,
						contentType: entry.contentType,
						size: entry.bytes.byteLength,
						range: { offset: range.offset, length: clampedLength },
						...(entry.etag ? { etag: entry.etag } : {}),
					};
				}
				return {
					body: new Response(entry.bytes).body as ReadableStream<Uint8Array>,
					contentType: entry.contentType,
					size: entry.bytes.byteLength,
					...(entry.etag ? { etag: entry.etag } : {}),
				};
			},
			async delete() {},
		};
		return store;
	}

	test("keeps private, no-store by default and serves 206/416 + ETag/304 when opt-in cacheControl is passed", async () => {
		const payload = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const store = makeMemoryStore({
			"library-listening/sample.mp3": {
				bytes: payload,
				contentType: "audio/mpeg",
				etag: '"r2-etag-1"',
			},
		});

		// Default caller (teacher routes) keeps private, no-store
		const defaultRes = await serveStudyPackAudio({
			audioKey: "library-listening/sample.mp3",
			audioName: "sample.mp3",
			getLibraryAudioStore: () => store,
		});
		expect(defaultRes.status).toBe(200);
		expect(defaultRes.headers.get("cache-control")).toBe("private, no-store");
		expect(defaultRes.headers.get("accept-ranges")).toBe("bytes");
		expect(defaultRes.headers.get("etag")).toBe('"r2-etag-1"');

		// Student opt-in revalidation: 304 Not Modified via head() without reading full body
		const prevGetCalls = store.getCalls;
		const notModified = await serveStudyPackAudio({
			audioKey: "library-listening/sample.mp3",
			audioName: "sample.mp3",
			getLibraryAudioStore: () => store,
			cacheControl: "private, no-cache",
			vary: "Cookie, x-student-org-id",
			ifNoneMatch: '"r2-etag-1"',
		});
		expect(notModified.status).toBe(304);
		expect(notModified.headers.get("etag")).toBe('"r2-etag-1"');
		expect(notModified.headers.get("cache-control")).toBe("private, no-cache");
		expect(notModified.headers.get("vary")).toBe("Cookie, x-student-org-id");
		expect(store.getCalls).toBe(prevGetCalls);

		// Valid Range -> 206
		const partial = await serveStudyPackAudio({
			audioKey: "library-listening/sample.mp3",
			audioName: "sample.mp3",
			getLibraryAudioStore: () => store,
			rangeHeader: "bytes=2-5",
			cacheControl: "private, no-cache",
			vary: "Cookie, x-student-org-id",
		});
		expect(partial.status).toBe(206);
		expect(partial.headers.get("content-range")).toBe("bytes 2-5/10");
		expect(partial.headers.get("content-length")).toBe("4");
		expect(partial.headers.get("accept-ranges")).toBe("bytes");
		expect(partial.headers.get("cache-control")).toBe("private, no-cache");
		expect(Array.from(new Uint8Array(await partial.arrayBuffer()))).toEqual([
			2, 3, 4, 5,
		]);

		// Out-of-bounds Range -> 416 without calling store.get()
		const before416Gets = store.getCalls;
		const invalid = await serveStudyPackAudio({
			audioKey: "library-listening/sample.mp3",
			audioName: "sample.mp3",
			getLibraryAudioStore: () => store,
			rangeHeader: "bytes=100-200",
		});
		expect(invalid.status).toBe(416);
		expect(invalid.headers.get("content-range")).toBe("bytes */10");
		expect(invalid.headers.get("accept-ranges")).toBe("bytes");
		expect(store.getCalls).toBe(before416Gets);
	});

	test("falls back safely to 200 when store omits range and resolves MIME across all LIBRARY_AUDIO_MIME extensions", async () => {
		const storeNoRange = makeMemoryStore(
			{
				"library-listening/clip.m4a": {
					bytes: new Uint8Array([1, 2, 3, 4]),
					contentType: "application/octet-stream",
				},
			},
			{ supportHead: false, supportRange: false },
		);
		const res = await serveStudyPackAudio({
			audioKey: "library-listening/clip.m4a",
			audioName: "clip.m4a",
			getLibraryAudioStore: () => storeNoRange,
			rangeHeader: "bytes=0-1",
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("audio/mp4");
		expect(res.headers.get("content-disposition")).toMatch(/^inline;/);
		expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([
			1, 2, 3, 4,
		]);
	});
});
