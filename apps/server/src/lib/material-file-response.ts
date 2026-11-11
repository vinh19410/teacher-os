import { normalizeMediaType } from "@teacher-os/api/lib/quiz-media";
import { MATERIAL_MIME } from "@teacher-os/api/material-contracts";
import { parseByteRange } from "./byte-range";
import type { MediaStore } from "./media-store";

/** Percent-encode cho `filename*` (RFC 8187 attr-char). */
function encodeRfc8187(value: string): string {
	return encodeURIComponent(value).replace(
		/['()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

/** CSP khoá cứng cho mọi phản hồi tải về (`attachment`) và lỗi `416`. */
export const STRICT_CSP = "default-src 'none'; frame-ancestors 'none'; sandbox";

/**
 * CSP cho tài liệu media mở trực tiếp trong tab mới (`inline` — nút «Phát» /
 * «Mở», #647): cho phép `MediaDocument` của trình duyệt nạp stream cùng origin
 * (`media-src 'self'` + `sandbox allow-same-origin`) và hiển thị thanh điều
 * khiển mặc định (`style-src 'unsafe-inline'`, `img-src 'self' data:`), nhưng
 * TUYỆT ĐỐI không có `allow-scripts` nên mọi script/form/plugin vẫn bị cấm.
 */
export const INLINE_MEDIA_CSP =
	"default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; sandbox allow-same-origin";

/** Header khoá cứng cho mọi file tài liệu: nosniff + cô lập opener/Referer. */
const LOCKED_HEADERS = {
	"X-Content-Type-Options": "nosniff",
	"Cross-Origin-Opener-Policy": "same-origin",
	"Referrer-Policy": "no-referrer",
	"Cache-Control": "private, no-store",
	"Accept-Ranges": "bytes",
} as const;

export interface MaterialFileRow {
	objectKey: string;
	mimeType: string | null;
	sizeBytes: number | null;
	originalName: string | null;
	kind: string;
}

/**
 * Stream file tài liệu từ kho, hỗ trợ một dải `Range: bytes=` (206) để
 * `<audio>`/`<video>` tua được trên Safari iOS. Audio/video mặc định
 * `inline` (phát trực tiếp), tài liệu mặc định `attachment`; `download`
 * ép `attachment`. Trả `null` khi object không còn trong kho (route → 404).
 */
export async function materialFileResponse(
	store: MediaStore,
	row: MaterialFileRow,
	request: { rangeHeader: string | undefined; download: boolean },
): Promise<Response | null> {
	const total = row.sizeBytes ?? 0;
	const rangeHeader = request.rangeHeader?.trim();
	let range: { start: number; end: number } | null = null;
	if (rangeHeader?.startsWith("bytes=") && !rangeHeader.includes(",")) {
		range = parseByteRange(rangeHeader, total);
		if (!range) {
			return new Response("Range Not Satisfiable", {
				status: 416,
				headers: {
					...LOCKED_HEADERS,
					"Content-Security-Policy": STRICT_CSP,
					"Content-Type": "text/plain; charset=utf-8",
					"Content-Range": `bytes */${total}`,
				},
			});
		}
	}

	const object = await store.get(
		row.objectKey,
		range
			? { offset: range.start, length: range.end - range.start + 1 }
			: undefined,
	);
	if (!object) return null;

	const normalizedMime = row.mimeType ? normalizeMediaType(row.mimeType) : "";
	const allowlistedEntry = Object.hasOwn(MATERIAL_MIME, normalizedMime)
		? MATERIAL_MIME[normalizedMime]
		: undefined;
	const inlineMedia =
		!request.download &&
		row.kind === "media" &&
		allowlistedEntry?.kind === "media";
	const disposition = inlineMedia ? "inline" : "attachment";
	const headers: Record<string, string> = {
		...LOCKED_HEADERS,
		"Content-Security-Policy": inlineMedia ? INLINE_MEDIA_CSP : STRICT_CSP,
		"Content-Type": allowlistedEntry
			? normalizedMime
			: "application/octet-stream",
		"Content-Disposition": `${disposition}; filename*=UTF-8''${encodeRfc8187(row.originalName ?? "file")}`,
	};
	if (range && object.range) {
		return new Response(object.body, {
			status: 206,
			headers: {
				...headers,
				"Content-Range": `bytes ${range.start}-${range.end}/${total}`,
				"Content-Length": String(object.range.length),
			},
		});
	}
	return new Response(object.body, {
		status: 200,
		headers: { ...headers, "Content-Length": String(object.size) },
	});
}
