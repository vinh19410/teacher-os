import { QUIZ_MEDIA_NAME_MAX, QUIZ_MEDIA_TYPES } from "../contracts";

/** Đuôi file → MIME chuẩn, dùng khi `File.type` rỗng hoặc lạ (Windows hay
 * báo `.m4a` là rỗng; Safari iOS báo Voice Memos là `audio/x-m4a`). */
const EXTENSION_TYPES: Readonly<Record<string, string>> = {
	mp3: "audio/mpeg",
	m4a: "audio/mp4",
	aac: "audio/aac",
	wav: "audio/wav",
	weba: "audio/webm",
	ogg: "audio/ogg",
	oga: "audio/ogg",
	mp4: "video/mp4",
	mov: "video/quicktime",
	webm: "video/webm",
};

/** MIME bỏ `;params`, lowercase — dạng so khớp allowlist. */
export function normalizeMediaType(raw: string): string {
	return (raw.split(";")[0] ?? "").trim().toLowerCase();
}

export function isAllowedQuizMediaType(raw: string): boolean {
	return Object.hasOwn(QUIZ_MEDIA_TYPES, normalizeMediaType(raw));
}

/**
 * MIME gửi lên server cho file bài nói: giữ `browserType` nếu thuộc
 * allowlist, ngược lại tra theo đuôi file. Không khớp → null (từ chối ở
 * client). Server kiểm lại Content-Type theo cùng allowlist.
 */
export function resolveQuizMediaType(
	fileName: string,
	browserType: string,
): string | null {
	const normalized = normalizeMediaType(browserType);
	if (Object.hasOwn(QUIZ_MEDIA_TYPES, normalized)) return normalized;
	const dot = fileName.lastIndexOf(".");
	if (dot < 0) return null;
	const extension = fileName.slice(dot + 1).toLowerCase();
	return EXTENSION_TYPES[extension] ?? null;
}

export function isVideoMediaType(type: string): boolean {
	return normalizeMediaType(type).startsWith("video/");
}

/** Dung lượng hiển thị theo vi-VN: "820 KB", "12,4 MB". */
export function formatMediaSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	const rounded = Math.round(value * 10) / 10;
	return `${rounded.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ${units[unit]}`;
}

/**
 * Tên file an toàn để lưu/hiển thị — dùng chung server (header
 * `X-File-Name`) và client. Cắt phần đường dẫn, bỏ ký tự điều khiển (`Cc`)
 * và ký tự định dạng (`Cf`: bidi override như U+202E có thể giả đuôi file,
 * zero-width). Rỗng hoặc dài hơn `QUIZ_MEDIA_NAME_MAX` → null.
 */
export function sanitizeMediaFileName(raw: string): string | null {
	const base = raw.slice(
		Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\")) + 1,
	);
	const cleaned = base.replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
	if (cleaned === "" || cleaned.length > QUIZ_MEDIA_NAME_MAX) return null;
	return cleaned;
}

export type QuizMediaRejectReason =
	| "none"
	| "multiple"
	| "type"
	| "size"
	| "empty"
	| "name";

/**
 * Validate file học viên chọn/thả — một đường validate duy nhất cho
 * dropzone và nút "Thay file", khớp các bước kiểm của server: đúng 1 file
 * (thả chữ/link → `none`), MIME resolve được, 0 < size ≤ max, tên file hợp
 * lệ sau `sanitizeMediaFileName` (server từ chối tên rỗng hoặc > 200 ký tự).
 */
export function validateQuizMediaFiles(
	files: ArrayLike<File>,
	maxBytes: number,
):
	| { ok: true; file: File; type: string }
	| { ok: false; reason: "none" | "multiple" }
	| { ok: false; reason: "type" | "size" | "empty" | "name"; file: File } {
	if (files.length === 0) return { ok: false, reason: "none" };
	const file = files.length === 1 ? files[0] : undefined;
	if (!file) return { ok: false, reason: "multiple" };
	const type = resolveQuizMediaType(file.name, file.type);
	if (type === null) return { ok: false, reason: "type", file };
	if (file.size === 0) return { ok: false, reason: "empty", file };
	if (file.size > maxBytes) return { ok: false, reason: "size", file };
	if (sanitizeMediaFileName(file.name) === null) {
		return { ok: false, reason: "name", file };
	}
	return { ok: true, file, type };
}
