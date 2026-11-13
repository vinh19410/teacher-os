import { isAllowedStudyPackAudioUrl } from "@teacher-os/api/contracts";

export { isAllowedStudyPackAudioUrl };

import {
	LIBRARY_AUDIO_MAX_BYTES,
	LIBRARY_AUDIO_MIME,
} from "@teacher-os/api/library-contracts";

const STUDY_PACK_AUDIO_TIMEOUT_MS = 15_000;
const MAX_AUDIO_REDIRECT_HOPS = 3;

function audioNotFoundResponse(): Response {
	return Response.json({ error: "audio not found" }, { status: 404 });
}

async function cancelResponseBody(
	res: Response | null | undefined,
): Promise<void> {
	try {
		await res?.body?.cancel();
	} catch {
		// ignore cleanup failure on discarded upstream body
	}
}

async function cancelReader(
	reader: ReadableStreamDefaultReader<Uint8Array> | null,
): Promise<void> {
	try {
		await reader?.cancel();
	} catch {
		// ignore cleanup failure on discarded reader
	}
}

/**
 * Proxies curated external study-pack listening MP3s (`listenaminute.com`,
 * `lingua.com`) through our API origin so:
 * 1. Client CSP (`media-src 'self' blob:`) stays strict without allowlisting 3rd-party hosts.
 * 2. Redirects run in `manual` mode so every hop and final URL is validated against
 *    `STUDY_PACK_AUDIO_HOSTS` before any outbound follow-up request is sent.
 * 3. Size (`LIBRARY_AUDIO_MAX_BYTES`) and MIME (`LIBRARY_AUDIO_MIME`) are enforced while streaming.
 */
export async function streamStudyPackAudio(
	audioUrl: string,
	fetchImpl: typeof fetch = fetch,
	maxBytes: number = LIBRARY_AUDIO_MAX_BYTES,
): Promise<Response> {
	const trimmedUrl = audioUrl.trim();
	if (!trimmedUrl || !isAllowedStudyPackAudioUrl(trimmedUrl)) {
		return audioNotFoundResponse();
	}

	const abortController = new AbortController();
	const timeoutId = setTimeout(
		() => abortController.abort(),
		STUDY_PACK_AUDIO_TIMEOUT_MS,
	);
	(timeoutId as { unref?: () => void }).unref?.();
	const clearTimer = () => clearTimeout(timeoutId);

	let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

	try {
		let currentUrl = trimmedUrl;
		let response: Response | null = null;

		for (let hop = 0; hop <= MAX_AUDIO_REDIRECT_HOPS; hop++) {
			const res = await fetchImpl(currentUrl, {
				method: "GET",
				redirect: "manual",
				signal: abortController.signal,
			});
			if (res.status >= 300 && res.status < 400) {
				const location = res.headers.get("location");
				await cancelResponseBody(res);
				if (!location || hop === MAX_AUDIO_REDIRECT_HOPS) {
					clearTimer();
					return audioNotFoundResponse();
				}
				const nextUrl = new URL(location, currentUrl).toString();
				if (!isAllowedStudyPackAudioUrl(nextUrl)) {
					clearTimer();
					return audioNotFoundResponse();
				}
				currentUrl = nextUrl;
				continue;
			}
			response = res;
			break;
		}

		if (!response?.ok) {
			await cancelResponseBody(response);
			clearTimer();
			return audioNotFoundResponse();
		}
		if (
			response.redirected ||
			(response.url && !isAllowedStudyPackAudioUrl(response.url))
		) {
			await cancelResponseBody(response);
			clearTimer();
			return audioNotFoundResponse();
		}

		const rawContentType = (
			response.headers.get("content-type") ?? ""
		).toLowerCase();
		const mimeType = rawContentType.split(";")[0]?.trim() ?? "";
		if (!Object.hasOwn(LIBRARY_AUDIO_MIME, mimeType)) {
			await cancelResponseBody(response);
			clearTimer();
			return audioNotFoundResponse();
		}

		const contentLengthHeader = response.headers.get("content-length")?.trim();
		let validDeclaredLength: number | null = null;
		if (contentLengthHeader) {
			if (!/^\d+$/.test(contentLengthHeader)) {
				await cancelResponseBody(response);
				clearTimer();
				return audioNotFoundResponse();
			}
			const declaredBytes = Number.parseInt(contentLengthHeader, 10);
			if (
				!Number.isFinite(declaredBytes) ||
				declaredBytes <= 0 ||
				declaredBytes > maxBytes
			) {
				await cancelResponseBody(response);
				clearTimer();
				return audioNotFoundResponse();
			}
			validDeclaredLength = declaredBytes;
		}

		if (!response.body) {
			clearTimer();
			return audioNotFoundResponse();
		}

		const reader = response.body.getReader();
		activeReader = reader;
		let totalBytes = 0;
		let firstChunk: Uint8Array | null = null;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value || value.byteLength === 0) continue;
			totalBytes += value.byteLength;
			if (totalBytes > maxBytes) {
				await cancelReader(reader);
				clearTimer();
				return audioNotFoundResponse();
			}
			firstChunk = value;
			break;
		}

		if (!firstChunk) {
			await cancelReader(reader);
			clearTimer();
			return audioNotFoundResponse();
		}

		const headers: Record<string, string> = {
			"Content-Type": mimeType,
			"Cache-Control": "private, max-age=3600",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "default-src 'none'; sandbox",
			"Cross-Origin-Resource-Policy": "same-site",
			"Referrer-Policy": "no-referrer",
		};
		if (validDeclaredLength !== null && validDeclaredLength >= totalBytes) {
			headers["Content-Length"] = String(validDeclaredLength);
		}

		const initialChunk = firstChunk;
		const stream = new ReadableStream<Uint8Array>({
			start(streamController) {
				streamController.enqueue(initialChunk);
			},
			async pull(streamController) {
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) {
							clearTimer();
							streamController.close();
							return;
						}
						if (!value || value.byteLength === 0) continue;
						totalBytes += value.byteLength;
						if (totalBytes > maxBytes) {
							clearTimer();
							await cancelReader(reader);
							streamController.error(
								new Error("Audio response exceeded byte limit"),
							);
							return;
						}
						streamController.enqueue(value);
						return;
					}
				} catch (err) {
					clearTimer();
					await cancelReader(reader);
					streamController.error(err);
				}
			},
			async cancel() {
				clearTimer();
				abortController.abort();
				await cancelReader(reader);
			},
		});

		return new Response(stream, { status: 200, headers });
	} catch {
		clearTimer();
		await cancelReader(activeReader);
		return audioNotFoundResponse();
	}
}
