import type { QuizAttemptMedia } from "@teacher-os/api/contracts";
import type { StoredMedia } from "./media-store";

/** Percent-encode cho `filename*` (RFC 8187 attr-char): encodeURIComponent
 * còn để lọt `'()*`. */
function encodeRfc8187(value: string): string {
	return encodeURIComponent(value).replace(
		/['()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

/** Cột media_* của attempt → payload wire (không lộ object key). */
export function toQuizAttemptMedia(row: {
	mediaKey: string | null;
	mediaName: string | null;
	mediaType: string | null;
	mediaSize: number | null;
	mediaUploadedAt: Date | null;
}): QuizAttemptMedia | null {
	if (row.mediaKey === null) return null;
	return {
		name: row.mediaName ?? "",
		type: row.mediaType ?? "",
		size: row.mediaSize ?? 0,
		uploadedAt: row.mediaUploadedAt ? row.mediaUploadedAt.toISOString() : "",
	};
}

/** Stream file bài nói — header khoá cứng cho mọi caller (học viên,
 * giáo viên): nosniff + CSP sandbox nên file giả MIME không chạy được. */
export function mediaObjectResponse(
	object: StoredMedia,
	meta: { mediaType: string | null; mediaName: string | null },
): Response {
	return new Response(object.body, {
		headers: {
			"Content-Type": meta.mediaType ?? object.contentType,
			"Content-Length": String(object.size),
			"Content-Disposition": `inline; filename*=UTF-8''${encodeRfc8187(meta.mediaName ?? "media")}`,
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "default-src 'none'; sandbox",
			"Cache-Control": "private, no-store",
		},
	});
}
