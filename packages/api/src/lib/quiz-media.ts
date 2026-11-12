import { QUIZ_MEDIA_NAME_MAX, QUIZ_MEDIA_TYPES } from "../contracts";
import { LIBRARY_AUDIO_MIME } from "../library-contracts";

export {
	matchesLibraryAudioMagic,
	matchesQuizMediaMagic,
	QUIZ_MEDIA_MAGIC_PEEK_BYTES,
} from "./media-magic";

/** Đuôi file → MIME mặc định khi `File.type` rỗng hoặc `application/octet-stream`
 * (Windows hay báo `.m4a` rỗng; Safari iOS báo Voice Memos là `audio/x-m4a`). */
const EXTENSION_TYPES: Readonly<Record<string, string>> = {
	mp3: "audio/mpeg",
	m4a: "audio/mp4",
	aac: "audio/aac",
	wav: "audio/wav",
	wave: "audio/wav",
	weba: "audio/webm",
	ogg: "audio/ogg",
	oga: "audio/ogg",
	opus: "audio/ogg",
	mp4: "video/mp4",
	mov: "video/quicktime",
	qt: "video/quicktime",
	webm: "video/webm",
};

const COMPATIBLE_QUIZ_MIMES_BY_EXT: Readonly<
	Record<string, readonly string[]>
> = {
	mp3: ["audio/mpeg"],
	m4a: ["audio/mp4", "audio/x-m4a", "audio/aac"],
	mp4: ["video/mp4", "audio/mp4"],
	aac: ["audio/aac", "audio/mp4", "audio/x-m4a"],
	wav: ["audio/wav", "audio/x-wav", "audio/wave"],
	wave: ["audio/wav", "audio/x-wav", "audio/wave"],
	webm: ["video/webm", "audio/webm"],
	weba: ["audio/webm"],
	ogg: ["audio/ogg"],
	oga: ["audio/ogg"],
	opus: ["audio/ogg"],
	mov: ["video/quicktime"],
	qt: ["video/quicktime"],
};

const QUIZ_MEDIA_MIME_ALIASES: Readonly<Record<string, string>> = {
	"audio/mp3": "audio/mpeg",
	"audio/x-mp3": "audio/mpeg",
	"audio/x-mpeg": "audio/mpeg",
	"audio/mpeg3": "audio/mpeg",
	"audio/x-mpeg-3": "audio/mpeg",
	"audio/m4a": "audio/mp4",
	"audio/mp4a-latm": "audio/mp4",
	"audio/vnd.wave": "audio/wav",
	"audio/x-aac": "audio/aac",
	"audio/aacp": "audio/aac",
	"audio/vnd.dlna.adts": "audio/aac",
	"audio/adts": "audio/aac",
	"audio/x-hx-aac-adts": "audio/aac",
	"audio/opus": "audio/ogg",
	"audio/x-opus+ogg": "audio/ogg",
	"audio/x-vorbis+ogg": "audio/ogg",
	"audio/x-speex+ogg": "audio/ogg",
	"video/ogg": "audio/ogg",
	"application/ogg": "audio/ogg",
};

function cleanAllowedExtension(fileName: string): string | null {
	const clean = sanitizeMediaFileName(fileName);
	if (!clean || clean.startsWith(".")) return null;
	const dot = clean.lastIndexOf(".");
	if (dot <= 0 || dot === clean.length - 1) return null;
	const ext = clean.slice(dot + 1).toLowerCase();
	return Object.hasOwn(EXTENSION_TYPES, ext) ? ext : null;
}

/** MIME bỏ `;params`, lowercase — dạng so khớp allowlist. */
export function normalizeMediaType(raw: string): string {
	return (raw.split(";")[0] ?? "").trim().toLowerCase();
}

export function isAllowedQuizMediaType(raw: string): boolean {
	return Object.hasOwn(QUIZ_MEDIA_TYPES, normalizeMediaType(raw));
}

/**
 * MIME gửi lên server cho file bài nói (#681): tên file sau sanitize phải có
 * thân + đuôi thuộc `EXTENSION_TYPES`; chỉ fallback tự do khi `browserType`
 * rỗng hoặc `application/octet-stream`, còn lại bắt buộc `browserType` (sau
 * khi gộp bí danh OS/trình duyệt) nằm trong tập tương thích của đuôi file.
 */
export function resolveQuizMediaType(
	fileName: string,
	browserType: string,
): string | null {
	const ext = cleanAllowedExtension(fileName);
	if (!ext) return null;
	const normalized = normalizeMediaType(browserType);
	if (normalized === "" || normalized === "application/octet-stream") {
		return EXTENSION_TYPES[ext] ?? null;
	}
	if (ext === "m4a" && normalized === "video/mp4") {
		return "audio/mp4";
	}
	const canonical = Object.hasOwn(QUIZ_MEDIA_MIME_ALIASES, normalized)
		? (QUIZ_MEDIA_MIME_ALIASES[normalized] ?? normalized)
		: normalized;
	if (!Object.hasOwn(QUIZ_MEDIA_TYPES, canonical)) return null;
	return COMPATIBLE_QUIZ_MIMES_BY_EXT[ext]?.includes(canonical) === true
		? canonical
		: null;
}

/** Kiểm tra tên file có phần thân và đuôi tương thích với MIME trong `QUIZ_MEDIA_TYPES`. */
export function quizMediaExtensionMatches(
	fileName: string,
	mimeType: string,
): boolean {
	const normalized = normalizeMediaType(mimeType);
	if (!Object.hasOwn(QUIZ_MEDIA_TYPES, normalized)) return false;
	const ext = cleanAllowedExtension(fileName);
	if (!ext) return false;
	return COMPATIBLE_QUIZ_MIMES_BY_EXT[ext]?.includes(normalized) === true;
}

/** Resolver chỉ nhận audio thuộc `LIBRARY_AUDIO_MIME` (Library, Placement, Vocab). */
export function resolveLibraryAudioMimeType(
	fileName: string,
	browserType: string,
): string | null {
	const ext = cleanAllowedExtension(fileName);
	if (!ext) return null;
	const normalized = normalizeMediaType(browserType);
	if (
		ext === "webm" &&
		(normalized === "" ||
			normalized === "application/octet-stream" ||
			normalized === "video/webm")
	) {
		return "audio/webm";
	}
	const resolved = resolveQuizMediaType(fileName, browserType);
	return resolved !== null && Object.hasOwn(LIBRARY_AUDIO_MIME, resolved)
		? resolved
		: null;
}

/** Kiểm tra tên file có phần thân và đuôi tương thích với MIME audio trong `LIBRARY_AUDIO_MIME`. */
export function libraryAudioExtensionMatches(
	fileName: string,
	mimeType: string,
): boolean {
	const normalized = normalizeMediaType(mimeType);
	return (
		Object.hasOwn(LIBRARY_AUDIO_MIME, normalized) &&
		quizMediaExtensionMatches(fileName, normalized)
	);
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
	if (sanitizeMediaFileName(file.name) === null) {
		return { ok: false, reason: "name", file };
	}
	const type = resolveQuizMediaType(file.name, file.type);
	if (type === null) return { ok: false, reason: "type", file };
	if (file.size === 0) return { ok: false, reason: "empty", file };
	if (file.size > maxBytes) return { ok: false, reason: "size", file };
	return { ok: true, file, type };
}
