import { parseByteRange } from "./byte-range";
import type { MediaStore } from "./media-store";

/** Percent-encode cho `filename*` (RFC 8187 attr-char). */
function encodeRfc8187(value: string): string {
	return encodeURIComponent(value).replace(
		/['()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

/** Header khoá cứng cho mọi file tài liệu: nosniff + CSP sandbox để file
 * giả MIME không chạy được trên origin API. */
const LOCKED_HEADERS = {
	"X-Content-Type-Options": "nosniff",
	"Content-Security-Policy": "default-src 'none'; sandbox",
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
	if (
		rangeHeader?.startsWith("bytes=") &&
		!rangeHeader.includes(",")
	) {
		range = parseByteRange(rangeHeader, total);
		if (!range) {
			return new Response("Range Not Satisfiable", {
				status: 416,
				headers: {
					...LOCKED_HEADERS,
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

	const disposition =
		row.kind === "media" && !request.download ? "inline" : "attachment";
	const headers: Record<string, string> = {
		...LOCKED_HEADERS,
		"Content-Type": row.mimeType ?? object.contentType,
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
