/**
 * Avatar policy — single source of truth for the `user.image` allowlist and
 * size cap. Consumed by the server `/update-user` hook (same package) and by
 * the web upload helpers (`@teacher-os/auth/avatar-policy`), so the two sides
 * can never drift: packages never import from apps.
 *
 * Why this exists at all: sign-up is public, better-auth's update-user route
 * accepts arbitrary strings for `image`, and every get-session fetch carries
 * the stored value back — one unvalidated 2MB blob would poison them all.
 */
export const AVATAR_TARGET_PX = 192;

/**
 * Measured as the number of characters in the persisted string (the D1
 * column is text). Both the client resize loop and the server hook count
 * the same way — counting bytes on one side would let a ~35% gap open.
 */
export const AVATAR_MAX_IMAGE_CHARS = 64 * 1024;

/** PNG/JPEG data URLs only (the resize pipeline always emits JPEG) plus
 * https URLs, which covers unmodified Google avatars (lh3.googleusercontent.com). */
export const SAFE_AVATAR_SRC_PATTERN =
	/^(data:image\/(png|jpeg);base64,|https:\/\/)/;

export function isSafeAvatarSrc(src: string | null | undefined): boolean {
	if (!src) return false;
	return SAFE_AVATAR_SRC_PATTERN.test(src);
}

/** Mirrors the /profile form rule: trimmed length 2–100. */
export function validateUpdateUserName(name: unknown): string | null {
	if (name === undefined || name === null) return null;
	if (typeof name !== "string") return "Tên hiển thị không hợp lệ.";
	const trimmed = name.trim();
	if (trimmed.length < 2) return "Tên hiển thị phải có ít nhất 2 ký tự.";
	if (trimmed.length > 100) return "Tên hiển thị tối đa 100 ký tự.";
	return null;
}

/** Rejects oversized or non-allowlisted payloads before they reach user.image. */
export function validateUpdateUserImage(image: unknown): string | null {
	if (image === undefined || image === null) return null;
	if (typeof image !== "string") return "Ảnh đại diện không hợp lệ.";
	if (image.length > AVATAR_MAX_IMAGE_CHARS)
		return "Ảnh đại diện vượt quá 64KB sau khi nén.";
	if (!SAFE_AVATAR_SRC_PATTERN.test(image))
		return "Ảnh đại diện chỉ chấp nhận JPEG/PNG data URL hoặc liên kết https.";
	return null;
}
