import { normalizeMediaType } from "@teacher-os/api/lib/quiz-media";
import { parseByteRange } from "./byte-range";
import { INLINE_MEDIA_CSP, STRICT_CSP } from "./material-file-response";
import type { RecordingStore } from "./recording-store";

function encodeRfc8187(value: string): string {
	return encodeURIComponent(value).replace(
		/['()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

const LOCKED_VIDEO_HEADERS = {
	"X-Content-Type-Options": "nosniff",
	"Cross-Origin-Opener-Policy": "same-origin",
	"Referrer-Policy": "no-referrer",
	"Cache-Control": "private, no-store",
	"Accept-Ranges": "bytes",
} as const;

export interface RecordingVideoRow {
	storageKey: string;
	mimeType: string | null;
	sizeBytes: number | null;
	fileName: string;
}

function resolveSafeVideoMime(rawMime: string | null): string {
	const normalized = rawMime ? normalizeMediaType(rawMime) : "";
	if (normalized.startsWith("video/") && normalized.length > "video/".length) {
		return normalized;
	}
	return "video/mp4";
}

/**
 * Stream video recording từ kho R2 (hỗ trợ `Range: bytes=` trả HTTP 206 để
 * `<video>` tua được trên desktop & Safari iOS).
 *
 * Luôn trả `Content-Disposition: inline` (không hỗ trợ cờ download attachment).
 * Trả `null` khi object không còn trong kho (route map sang 410/404).
 */
export async function recordingVideoResponse(
	store: RecordingStore,
	row: RecordingVideoRow,
	request: { rangeHeader: string | undefined },
): Promise<Response | null> {
	let total = row.sizeBytes ?? 0;
	if (total <= 0 && store.head) {
		const meta = await store.head(row.storageKey);
		if (!meta) return null;
		total = meta.size;
	}

	const rangeHeader = request.rangeHeader?.trim();
	let range: { start: number; end: number } | null = null;
	if (rangeHeader?.startsWith("bytes=") && !rangeHeader.includes(",")) {
		if (total > 0) {
			range = parseByteRange(rangeHeader, total);
			if (!range) {
				return new Response("Range Not Satisfiable", {
					status: 416,
					headers: {
						...LOCKED_VIDEO_HEADERS,
						"Content-Security-Policy": STRICT_CSP,
						"Content-Type": "text/plain; charset=utf-8",
						"Content-Range": `bytes */${total}`,
					},
				});
			}
		}
	}

	const object = await store.get(
		row.storageKey,
		range
			? { offset: range.start, length: range.end - range.start + 1 }
			: undefined,
	);
	if (!object) return null;

	const effectiveTotal = total > 0 ? total : object.size;
	const contentType = resolveSafeVideoMime(row.mimeType ?? object.contentType);
	const headers: Record<string, string> = {
		...LOCKED_VIDEO_HEADERS,
		"Content-Security-Policy": INLINE_MEDIA_CSP,
		"Content-Type": contentType,
		"Content-Disposition": `inline; filename*=UTF-8''${encodeRfc8187(row.fileName)}`,
		...(object.etag ? { ETag: object.etag } : {}),
	};

	if (range && object.range) {
		return new Response(object.body, {
			status: 206,
			headers: {
				...headers,
				"Content-Range": `bytes ${range.start}-${range.end}/${effectiveTotal}`,
				"Content-Length": String(object.range.length),
			},
		});
	}

	return new Response(object.body, {
		status: 200,
		headers: {
			...headers,
			"Content-Length": String(object.size),
		},
	});
}
