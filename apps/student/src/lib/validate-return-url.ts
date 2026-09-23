export const DEFAULT_RETURN_URL = "/";

function hasControlCharacter(value: string): boolean {
	for (let i = 0; i < value.length; i += 1) {
		const code = value.charCodeAt(i);
		if (code <= 0x1f || code === 0x7f) {
			return true;
		}
	}
	return false;
}

/**
 * Validate a post-login return URL. Only same-app paths are allowed: it must
 * decode to a value starting with exactly one `/`, never `//` or `/\` (which
 * browsers treat as foreign origins), and never a `scheme:` URL. Control
 * characters are rejected outright.
 */
export function validateReturnUrl(raw: string | undefined | null): string {
	if (!raw) {
		return DEFAULT_RETURN_URL;
	}
	let candidate = raw;
	for (let round = 0; round < 2; round += 1) {
		try {
			const decoded = decodeURIComponent(candidate);
			if (decoded === candidate) {
				break;
			}
			candidate = decoded;
		} catch {
			return DEFAULT_RETURN_URL;
		}
	}
	if (hasControlCharacter(candidate)) {
		return DEFAULT_RETURN_URL;
	}
	if (
		!candidate.startsWith("/") ||
		candidate.startsWith("//") ||
		candidate.startsWith("/\\")
	) {
		return DEFAULT_RETURN_URL;
	}
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
		return DEFAULT_RETURN_URL;
	}
	return candidate;
}
