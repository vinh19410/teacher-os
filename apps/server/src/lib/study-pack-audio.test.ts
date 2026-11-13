import { LIBRARY_AUDIO_MAX_BYTES } from "@teacher-os/api/library-contracts";
import { describe, expect, test } from "vitest";
import { streamStudyPackAudio } from "./study-pack-audio";

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
});
