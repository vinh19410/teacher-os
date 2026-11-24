import { isAllowedStudyPackAudioUrl } from "@teacher-os/api/contracts";

export { isAllowedStudyPackAudioUrl };

import {
	normalizeMediaType,
	resolveLibraryAudioMimeType,
} from "@teacher-os/api/lib/quiz-media";
import {
	LIBRARY_AUDIO_MAX_BYTES,
	LIBRARY_AUDIO_MIME,
} from "@teacher-os/api/library-contracts";
import { parseByteRange } from "./byte-range";
import { mediaObjectResponse } from "./media-response";
import type { MediaStore } from "./media-store";

const STUDY_PACK_AUDIO_READ_TIMEOUT_MS = 15_000;
const STUDY_PACK_AUDIO_MAX_LIFETIME_MS = 120_000;
const MAX_AUDIO_REDIRECT_HOPS = 3;

function audioNotFoundResponse(): Response {
	return Response.json({ error: "audio not found" }, { status: 404 });
}

function rangeNotSatisfiableResponse(options: {
	contentRange?: string | null;
	vary?: string;
}): Response {
	const headers: Record<string, string> = {
		"Content-Type": "text/plain; charset=utf-8",
		"Accept-Ranges": "bytes",
		"X-Content-Type-Options": "nosniff",
		"Content-Security-Policy": "default-src 'none'; sandbox",
		"Cross-Origin-Resource-Policy": "same-site",
		"Referrer-Policy": "no-referrer",
		"Cache-Control": "private, no-store",
	};
	if (options.contentRange) {
		headers["Content-Range"] = options.contentRange;
	}
	if (options.vary) {
		headers.Vary = options.vary;
	}
	return new Response("Range Not Satisfiable", { status: 416, headers });
}

function notModifiedResponse(options: {
	etag: string;
	cacheControl: string;
	vary?: string;
}): Response {
	const headers: Record<string, string> = {
		ETag: options.etag,
		"Cache-Control": options.cacheControl,
		"Accept-Ranges": "bytes",
		"X-Content-Type-Options": "nosniff",
		"Content-Security-Policy": "default-src 'none'; sandbox",
	};
	if (options.vary) {
		headers.Vary = options.vary;
	}
	return new Response(null, { status: 304, headers });
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

function resolveAudioMediaType(
	objectContentType: string | null | undefined,
	audioName: string | null | undefined,
	key: string,
): string {
	const normalized = normalizeMediaType(objectContentType ?? "");
	if (normalized && normalized !== "application/octet-stream") {
		return normalized;
	}
	const fallbackName = audioName?.trim() || key.split("/").pop() || "";
	return resolveLibraryAudioMimeType(fallbackName, "") ?? "audio/mpeg";
}

function buildAudioEtag(
	key: string,
	size: number,
	storeEtag?: string | null,
): string {
	const trimmed = storeEtag?.trim() ?? "";
	if (/^(?:W\/)?"[^"\r\n]+"$/.test(trimmed)) {
		return trimmed;
	}
	return `W/"${size}-${encodeURIComponent(key)}"`;
}

function normalizeWeakEtag(raw: string): string {
	const trimmed = raw.trim();
	return trimmed.startsWith("W/") ? trimmed.slice(2) : trimmed;
}

function etagMatches(ifNoneMatch: string, etag: string): boolean {
	const target = normalizeWeakEtag(etag);
	for (const candidate of ifNoneMatch.split(",")) {
		const trimmed = candidate.trim();
		if (trimmed === "*") return true;
		if (trimmed && normalizeWeakEtag(trimmed) === target) return true;
	}
	return false;
}

function sanitizeOutboundRange(raw: string | null | undefined): string | null {
	if (typeof raw !== "string") return null;
	const trimmed = raw.trim();
	const match = /^bytes=(?:(\d+)-(\d*)|-([1-9]\d*))$/.exec(trimmed);
	if (!match) return null;
	const [, startStr, endStr, suffixStr] = match;
	if (suffixStr !== undefined) {
		const suffix = Number(suffixStr);
		if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
		return `bytes=-${suffix}`;
	}
	const start = Number(startStr);
	if (!Number.isSafeInteger(start) || start < 0) return null;
	if (endStr === "" || endStr === undefined) {
		return `bytes=${start}-`;
	}
	const end = Number(endStr);
	if (!Number.isSafeInteger(end) || end < start) return null;
	return `bytes=${start}-${end}`;
}

function parseValidatedContentRange(
	raw: string | null | undefined,
	maxBytes: number,
	declaredLength: number | null,
): { header: string; sliceLen: number } | null {
	if (typeof raw !== "string") return null;
	const trimmed = raw.trim();
	const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(trimmed);
	if (!match) return null;
	const [, startStr, endStr, totalStr] = match;
	const start = Number(startStr);
	const end = Number(endStr);
	if (
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(end) ||
		start < 0 ||
		end < start
	) {
		return null;
	}
	if (totalStr !== "*") {
		const total = Number(totalStr);
		if (!Number.isSafeInteger(total) || total <= 0 || end >= total) {
			return null;
		}
	}
	const sliceLen = end - start + 1;
	if (!Number.isSafeInteger(sliceLen) || sliceLen <= 0 || sliceLen > maxBytes) {
		return null;
	}
	if (declaredLength !== null && declaredLength !== sliceLen) {
		return null;
	}
	return { header: trimmed, sliceLen };
}

function sanitize416ContentRange(
	raw: string | null | undefined,
): string | null {
	if (typeof raw !== "string") return null;
	const trimmed = raw.trim();
	return /^bytes \*\/\d+$/.test(trimmed) ? trimmed : null;
}

export interface StreamStudyPackAudioOptions {
	rangeHeader?: string | null;
	cacheControl?: string;
	vary?: string;
}

/**
 * Proxies curated external study-pack listening MP3s (`listenaminute.com`,
 * `lingua.com`) through our API origin so:
 * 1. Redirects run in `manual` mode so every hop and final URL is validated against
 *    `STUDY_PACK_AUDIO_HOSTS` before any outbound follow-up request is sent.
 * 2. Size (`LIBRARY_AUDIO_MAX_BYTES`) and MIME (`LIBRARY_AUDIO_MIME`) are enforced while streaming.
 * 3. Single-byte `Range` headers are strictly validated and passed through so browsers can stream
 *    and seek via HTTP `206 Partial Content` without stalling paused streams.
 */
export async function streamStudyPackAudio(
	audioUrl: string,
	fetchImpl: typeof fetch = fetch,
	maxBytes: number = LIBRARY_AUDIO_MAX_BYTES,
	options?: StreamStudyPackAudioOptions,
): Promise<Response> {
	const trimmedUrl = audioUrl.trim();
	if (!trimmedUrl || !isAllowedStudyPackAudioUrl(trimmedUrl)) {
		return audioNotFoundResponse();
	}

	const outboundRange = sanitizeOutboundRange(options?.rangeHeader);
	const abortController = new AbortController();
	let readTimerId: ReturnType<typeof setTimeout> | null = null;
	let lifetimeTimerId: ReturnType<typeof setTimeout> | null = null;
	let timedOutReason: string | null = null;
	let activeStreamController: ReadableStreamDefaultController<Uint8Array> | null =
		null;
	let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

	const clearReadTimer = () => {
		if (readTimerId !== null) {
			clearTimeout(readTimerId);
			readTimerId = null;
		}
	};

	const clearAllTimers = () => {
		clearReadTimer();
		if (lifetimeTimerId !== null) {
			clearTimeout(lifetimeTimerId);
			lifetimeTimerId = null;
		}
	};

	const triggerAbort = (reason: string) => {
		if (timedOutReason === null) {
			timedOutReason = reason;
		}
		clearAllTimers();
		abortController.abort();
		void cancelReader(activeReader);
		if (activeStreamController) {
			const ctrl = activeStreamController;
			activeStreamController = null;
			try {
				ctrl.error(new Error(reason));
			} catch {
				// stream may already be closed or errored
			}
		}
	};

	const armReadTimeout = () => {
		clearReadTimer();
		readTimerId = setTimeout(
			() => triggerAbort("Upstream audio read timed out"),
			STUDY_PACK_AUDIO_READ_TIMEOUT_MS,
		);
		(readTimerId as { unref?: () => void }).unref?.();
	};

	const armLifetimeTimeout = () => {
		lifetimeTimerId = setTimeout(
			() => triggerAbort("Upstream audio stream exceeded lifetime limit"),
			STUDY_PACK_AUDIO_MAX_LIFETIME_MS,
		);
		(lifetimeTimerId as { unref?: () => void }).unref?.();
	};

	armReadTimeout();

	try {
		let currentUrl = trimmedUrl;
		let response: Response | null = null;

		for (let hop = 0; hop <= MAX_AUDIO_REDIRECT_HOPS; hop++) {
			const res = await fetchImpl(currentUrl, {
				method: "GET",
				redirect: "manual",
				...(outboundRange ? { headers: { Range: outboundRange } } : {}),
				signal: abortController.signal,
			});
			if (res.status >= 300 && res.status < 400) {
				const location = res.headers.get("location");
				await cancelResponseBody(res);
				if (!location || hop === MAX_AUDIO_REDIRECT_HOPS) {
					clearAllTimers();
					return audioNotFoundResponse();
				}
				const nextUrl = new URL(location, currentUrl).toString();
				if (!isAllowedStudyPackAudioUrl(nextUrl)) {
					clearAllTimers();
					return audioNotFoundResponse();
				}
				currentUrl = nextUrl;
				continue;
			}
			response = res;
			break;
		}

		if (!response) {
			clearAllTimers();
			return audioNotFoundResponse();
		}

		// Verify redirect/SSRF target BEFORE inspecting 416 or non-OK status codes.
		if (
			response.redirected ||
			(response.url && !isAllowedStudyPackAudioUrl(response.url))
		) {
			await cancelResponseBody(response);
			clearAllTimers();
			return audioNotFoundResponse();
		}

		if (outboundRange && response.status === 416) {
			const range416 = sanitize416ContentRange(
				response.headers.get("content-range"),
			);
			await cancelResponseBody(response);
			clearAllTimers();
			return rangeNotSatisfiableResponse({
				contentRange: range416,
				vary: options?.vary,
			});
		}

		const isPartial = Boolean(outboundRange) && response.status === 206;
		if (response.status !== 200 && !isPartial) {
			await cancelResponseBody(response);
			clearAllTimers();
			return audioNotFoundResponse();
		}

		const rawContentType = (
			response.headers.get("content-type") ?? ""
		).toLowerCase();
		const mimeType = rawContentType.split(";")[0]?.trim() ?? "";
		if (!Object.hasOwn(LIBRARY_AUDIO_MIME, mimeType)) {
			await cancelResponseBody(response);
			clearAllTimers();
			return audioNotFoundResponse();
		}

		const contentLengthHeader = response.headers.get("content-length")?.trim();
		let validDeclaredLength: number | null = null;
		if (contentLengthHeader) {
			if (!/^\d+$/.test(contentLengthHeader)) {
				await cancelResponseBody(response);
				clearAllTimers();
				return audioNotFoundResponse();
			}
			const declaredBytes = Number.parseInt(contentLengthHeader, 10);
			if (
				!Number.isFinite(declaredBytes) ||
				declaredBytes <= 0 ||
				declaredBytes > maxBytes
			) {
				await cancelResponseBody(response);
				clearAllTimers();
				return audioNotFoundResponse();
			}
			validDeclaredLength = declaredBytes;
		}

		let validatedPartial: { header: string; sliceLen: number } | null = null;
		if (isPartial) {
			validatedPartial = parseValidatedContentRange(
				response.headers.get("content-range"),
				maxBytes,
				validDeclaredLength,
			);
			if (!validatedPartial) {
				await cancelResponseBody(response);
				clearAllTimers();
				return audioNotFoundResponse();
			}
		}

		const effectiveMaxBytes = validatedPartial
			? Math.min(maxBytes, validatedPartial.sliceLen)
			: maxBytes;

		if (!response.body) {
			clearAllTimers();
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
			if (totalBytes > effectiveMaxBytes) {
				await cancelReader(reader);
				clearAllTimers();
				return audioNotFoundResponse();
			}
			firstChunk = value;
			break;
		}

		// Clear read idle timer before returning stream so paused/backpressured
		// clients are not aborted; arm hard wall-clock lifetime cap instead.
		clearReadTimer();

		if (!firstChunk || timedOutReason !== null) {
			await cancelReader(reader);
			clearAllTimers();
			return audioNotFoundResponse();
		}

		armLifetimeTimeout();

		const headers: Record<string, string> = {
			"Content-Type": mimeType,
			"Cache-Control": options?.cacheControl ?? "private, no-store",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "default-src 'none'; sandbox",
			"Cross-Origin-Resource-Policy": "same-site",
			"Referrer-Policy": "no-referrer",
		};
		if (options?.vary) {
			headers.Vary = options.vary;
		}
		if (
			isPartial ||
			(response.headers.get("accept-ranges") ?? "").trim().toLowerCase() ===
				"bytes"
		) {
			headers["Accept-Ranges"] = "bytes";
		}
		if (validatedPartial) {
			headers["Content-Range"] = validatedPartial.header;
		}
		if (validDeclaredLength !== null && validDeclaredLength >= totalBytes) {
			headers["Content-Length"] = String(validDeclaredLength);
		}

		const initialChunk = firstChunk;
		const stream = new ReadableStream<Uint8Array>({
			start(streamController) {
				activeStreamController = streamController;
				streamController.enqueue(initialChunk);
			},
			async pull(streamController) {
				activeStreamController = streamController;
				try {
					while (true) {
						armReadTimeout();
						let result: ReadableStreamReadResult<Uint8Array>;
						try {
							result = await reader.read();
						} finally {
							clearReadTimer();
						}
						if (timedOutReason !== null || abortController.signal.aborted) {
							clearAllTimers();
							activeStreamController = null;
							await cancelReader(reader);
							streamController.error(
								new Error(timedOutReason ?? "Upstream audio stream aborted"),
							);
							return;
						}
						const { done, value } = result;
						if (done) {
							clearAllTimers();
							activeStreamController = null;
							streamController.close();
							return;
						}
						if (!value || value.byteLength === 0) continue;
						totalBytes += value.byteLength;
						if (totalBytes > effectiveMaxBytes) {
							clearAllTimers();
							activeStreamController = null;
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
					clearAllTimers();
					activeStreamController = null;
					await cancelReader(reader);
					streamController.error(err);
				}
			},
			async cancel() {
				clearAllTimers();
				activeStreamController = null;
				abortController.abort();
				await cancelReader(reader);
			},
		});

		return new Response(stream, { status: isPartial ? 206 : 200, headers });
	} catch {
		clearAllTimers();
		await cancelReader(activeReader);
		return audioNotFoundResponse();
	}
}

/**
 * Serves study-pack / prompt listening audio from R2 (`audioKey`) when present,
 * falling back to the allowlisted external `.mp3` proxy (`audioUrl`) for legacy
 * built-in exercises.
 */
export async function serveStudyPackAudio(options: {
	audioKey?: string | null;
	audioUrl?: string | null;
	audioName?: string | null;
	rangeHeader?: string | null;
	ifNoneMatch?: string | null;
	cacheControl?: string;
	vary?: string;
	getLibraryAudioStore?: () => MediaStore | undefined;
	fetchExternalAudio?: typeof fetch;
}): Promise<Response> {
	const cacheControl = options.cacheControl ?? "private, no-store";
	const key = options.audioKey?.trim() ?? "";
	if (key) {
		const store = options.getLibraryAudioStore?.();
		if (!store) {
			return Response.json(
				{ error: "audio store unavailable" },
				{ status: 503 },
			);
		}
		const rawRange = options.rangeHeader?.trim() ?? "";
		const hasSingleRange =
			rawRange.startsWith("bytes=") && !rawRange.includes(",");
		const mediaName =
			options.audioName?.trim() || key.split("/").pop() || "listening.mp3";

		if (!hasSingleRange && options.ifNoneMatch && store.head) {
			const head = await store.head(key);
			if (!head) {
				return audioNotFoundResponse();
			}
			const etag = buildAudioEtag(key, head.size, head.etag);
			if (etagMatches(options.ifNoneMatch, etag)) {
				return notModifiedResponse({
					etag,
					cacheControl,
					vary: options.vary,
				});
			}
		}

		if (hasSingleRange) {
			if (store.head) {
				const head = await store.head(key);
				if (!head) {
					return audioNotFoundResponse();
				}
				const parsed = parseByteRange(rawRange, head.size);
				if (!parsed) {
					return rangeNotSatisfiableResponse({
						contentRange: `bytes */${head.size}`,
						vary: options.vary,
					});
				}
				const requestedLength = parsed.end - parsed.start + 1;
				const object = await store.get(key, {
					offset: parsed.start,
					length: requestedLength,
				});
				if (!object) {
					return audioNotFoundResponse();
				}
				if (parsed.start >= object.size) {
					await object.body.cancel().catch(() => {});
					return rangeNotSatisfiableResponse({
						contentRange: `bytes */${object.size}`,
						vary: options.vary,
					});
				}
				const effectiveEnd = Math.min(parsed.end, object.size - 1);
				const effectiveLength = effectiveEnd - parsed.start + 1;
				const etag = buildAudioEtag(key, object.size, object.etag ?? head.etag);
				const mediaType = resolveAudioMediaType(
					object.contentType,
					options.audioName,
					key,
				);
				if (
					object.range &&
					object.range.offset === parsed.start &&
					object.range.length === effectiveLength
				) {
					return mediaObjectResponse(
						object,
						{ mediaType, mediaName },
						{
							status: 206,
							acceptRanges: true,
							contentRange: `bytes ${parsed.start}-${effectiveEnd}/${object.size}`,
							contentLength: effectiveLength,
							cacheControl,
							etag,
							vary: options.vary,
						},
					);
				}
				if (object.range) {
					await object.body.cancel().catch(() => {});
					return rangeNotSatisfiableResponse({
						contentRange: `bytes */${object.size}`,
						vary: options.vary,
					});
				}
				return mediaObjectResponse(
					object,
					{ mediaType, mediaName },
					{
						status: 200,
						acceptRanges: true,
						cacheControl,
						etag,
						vary: options.vary,
					},
				);
			}

			// Fallback for minimal MediaStore implementations without head()
			const full = await store.get(key);
			if (!full) {
				return audioNotFoundResponse();
			}
			const parsed = parseByteRange(rawRange, full.size);
			if (!parsed) {
				await full.body.cancel().catch(() => {});
				return rangeNotSatisfiableResponse({
					contentRange: `bytes */${full.size}`,
					vary: options.vary,
				});
			}
			await full.body.cancel().catch(() => {});
			const requestedLength = parsed.end - parsed.start + 1;
			const ranged = await store.get(key, {
				offset: parsed.start,
				length: requestedLength,
			});
			if (!ranged) {
				return audioNotFoundResponse();
			}
			if (parsed.start >= ranged.size) {
				await ranged.body.cancel().catch(() => {});
				return rangeNotSatisfiableResponse({
					contentRange: `bytes */${ranged.size}`,
					vary: options.vary,
				});
			}
			const effectiveEnd = Math.min(parsed.end, ranged.size - 1);
			const effectiveLength = effectiveEnd - parsed.start + 1;
			const etag = buildAudioEtag(key, ranged.size, ranged.etag);
			const mediaType = resolveAudioMediaType(
				ranged.contentType,
				options.audioName,
				key,
			);
			if (
				ranged.range &&
				ranged.range.offset === parsed.start &&
				ranged.range.length === effectiveLength
			) {
				return mediaObjectResponse(
					ranged,
					{ mediaType, mediaName },
					{
						status: 206,
						acceptRanges: true,
						contentRange: `bytes ${parsed.start}-${effectiveEnd}/${ranged.size}`,
						contentLength: effectiveLength,
						cacheControl,
						etag,
						vary: options.vary,
					},
				);
			}
			if (ranged.range) {
				await ranged.body.cancel().catch(() => {});
				return rangeNotSatisfiableResponse({
					contentRange: `bytes */${ranged.size}`,
					vary: options.vary,
				});
			}
			return mediaObjectResponse(
				ranged,
				{ mediaType, mediaName },
				{
					status: 200,
					acceptRanges: true,
					cacheControl,
					etag,
					vary: options.vary,
				},
			);
		}

		const object = await store.get(key);
		if (!object) {
			return audioNotFoundResponse();
		}
		const etag = buildAudioEtag(key, object.size, object.etag);
		if (options.ifNoneMatch && etagMatches(options.ifNoneMatch, etag)) {
			await object.body.cancel().catch(() => {});
			return notModifiedResponse({
				etag,
				cacheControl,
				vary: options.vary,
			});
		}
		return mediaObjectResponse(
			object,
			{
				mediaType: resolveAudioMediaType(
					object.contentType,
					options.audioName,
					key,
				),
				mediaName,
			},
			{
				status: 200,
				acceptRanges: true,
				cacheControl,
				etag,
				vary: options.vary,
			},
		);
	}

	const url = options.audioUrl?.trim() ?? "";
	if (!url) {
		return audioNotFoundResponse();
	}
	return streamStudyPackAudio(
		url,
		options.fetchExternalAudio,
		LIBRARY_AUDIO_MAX_BYTES,
		{
			rangeHeader: options.rangeHeader,
			cacheControl,
			vary: options.vary,
		},
	);
}
