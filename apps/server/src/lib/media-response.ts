import type { QuizAttemptMedia } from "@teacher-os/api/contracts";
import { normalizeMediaType } from "@teacher-os/api/lib/quiz-media";
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

const INLINE_SOURCE_DOCUMENT_MIMES: Record<string, true> = {
	"application/pdf": true,
	"image/png": true,
	"image/jpeg": true,
	"image/webp": true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
};

function isAllowedInlineMediaObjectMime(normalized: string): boolean {
	if (!normalized) return false;
	if (normalized.startsWith("audio/") && normalized.length > "audio/".length) {
		return true;
	}
	if (normalized.startsWith("video/") && normalized.length > "video/".length) {
		return true;
	}
	return Object.hasOwn(INLINE_SOURCE_DOCUMENT_MIMES, normalized);
}

/**
 * Stream media bài nói / từ vựng / kiểm tra đầu vào / thư viện đề và file đề
 * gốc `exam-imports` — header khoá cứng cho mọi caller (#675):
 * - Khác với `materialFileResponse` (#647 / PR #674 — có nút «Phát»/«Mở» mở tab
 *   điều hướng cấp cao nhất `target="_blank"` nên cần `INLINE_MEDIA_CSP`), cả 7
 *   route dùng `mediaObjectResponse` đều nạp qua `fetch` → `Blob` hoặc nhúng
 *   `<audio src>`, đặc biệt `exam-imports` trả PDF/ảnh do người dùng tải lên nên
 *   chủ đích giữ nguyên `default-src 'none'; sandbox` (không có `allow-same-origin`).
 * - Chỉ cho phép MIME chuẩn hoá thuộc nhóm audio/video hoặc tài liệu nguồn
 *   `exam-imports` hiển thị `inline`; MIME rỗng hoặc nguy hiểm (`text/html`,
 *   `image/svg+xml`, JS…) bị ép về `application/octet-stream` + `attachment`.
 */
export interface MediaObjectResponseOptions {
	cacheControl?: string;
	acceptRanges?: boolean;
	status?: 200 | 206;
	contentRange?: string;
	contentLength?: number;
	etag?: string;
	vary?: string;
}

export function mediaObjectResponse(
	object: StoredMedia,
	meta: { mediaType: string | null; mediaName: string | null },
	opts?: MediaObjectResponseOptions,
): Response {
	const rawMime = meta.mediaType?.trim() || object.contentType?.trim() || "";
	const normalized = rawMime ? normalizeMediaType(rawMime) : "";
	const allowlisted = isAllowedInlineMediaObjectMime(normalized);
	const contentType = allowlisted ? normalized : "application/octet-stream";
	const disposition = allowlisted ? "inline" : "attachment";
	const contentLength =
		opts?.contentLength ?? (object.range ? object.range.length : object.size);
	const headers: Record<string, string> = {
		"Content-Type": contentType,
		"Content-Length": String(contentLength),
		"Content-Disposition": `${disposition}; filename*=UTF-8''${encodeRfc8187(meta.mediaName ?? "media")}`,
		"X-Content-Type-Options": "nosniff",
		"Cross-Origin-Opener-Policy": "same-origin",
		"Content-Security-Policy": "default-src 'none'; sandbox",
		"Cache-Control": opts?.cacheControl ?? "private, no-store",
	};
	if (opts?.acceptRanges) {
		headers["Accept-Ranges"] = "bytes";
	}
	if (opts?.contentRange) {
		headers["Content-Range"] = opts.contentRange;
	}
	if (opts?.etag) {
		headers.ETag = opts.etag;
	}
	if (opts?.vary) {
		headers.Vary = opts.vary;
	}
	return new Response(object.body, {
		status: opts?.status ?? 200,
		headers,
	});
}
