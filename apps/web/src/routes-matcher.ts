/**
 * Known exact application routes defined in TeacherOS.
 */
export const VALID_EXACT_ROUTES: Record<string, true> = {
	"/": true,
	"/login": true,
	"/verify-email": true,
	"/forgot-password": true,
	"/reset-password": true,
	"/dashboard": true,
	"/profile": true,
	"/reports": true,
	"/schedule": true,
	"/tuition": true,
	"/payments": true,
	"/assignments": true,
	"/assignments/new": true,
	"/assignments/preview": true,
	"/assignments/tests/new": true,
	"/assignments/tests/preview": true,
	"/classes": true,
	"/students": true,
	"/syllabus": true,
};

/**
 * Known dynamic route prefixes in TeacherOS.
 */
export const VALID_DYNAMIC_PREFIXES = [
	"/assignments/",
	// Full-test edit route /assignments/tests/$id — prefix cha
	// "/assignments/" chỉ nhận MỘT segment, "tests/<id>" có slash nên cần
	// prefix riêng (exact /tests/new + /tests/preview đã có ở trên).
	"/assignments/tests/",
	"/classes/",
	// Trang chấm bài Writing/Speaking (#319) — /grading/$attemptId.
	"/grading/",
	"/students/",
	"/syllabus/",
	// Public pay page (#320) — outside the auth layout by design.
	"/pay/",
];

/**
 * Static file extensions that should be treated as static assets.
 */
const STATIC_ASSET_EXT_REGEX =
	/\.(?:js|mjs|cjs|css|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|otf|json|webmanifest|map|txt|xml|wasm)$/i;

/**
 * Public files served from the root.
 */
const KNOWN_PUBLIC_ASSETS: Record<string, true> = {
	"/favicon.ico": true,
	"/logo.png": true,
	"/sw.js": true,
	"/registerSW.js": true,
	"/dev-sw.js": true,
	"/manifest.webmanifest": true,
	"/robots.txt": true,
};

/**
 * Checks if the given path is a sensitive dotfile (e.g. .env, .git) or path traversal attempt.
 */
export function isDotFilePath(pathname: string): boolean {
	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		decoded = pathname;
	}

	// Check path traversal attempts (e.g. /../, /..)
	if (decoded.includes("..")) {
		return true;
	}

	// Check if any path segment starts with '.' (excluding standard .well-known)
	const segments = decoded.split("/").filter(Boolean);
	return segments.some(
		(segment) => segment.startsWith(".") && segment !== ".well-known",
	);
}

/**
 * Strips the query string and hash fragment from a pathname.
 */
function stripQueryAndHash(pathname: string): string {
	return pathname.split("?")[0].split("#")[0];
}

/**
 * Checks if the given path is a static asset.
 */
export function isStaticAssetPath(pathname: string): boolean {
	if (isDotFilePath(pathname)) {
		return false;
	}

	const normalized = stripQueryAndHash(pathname);

	if (normalized.startsWith("/assets/")) {
		return true;
	}

	if (KNOWN_PUBLIC_ASSETS[normalized]) {
		return true;
	}

	return STATIC_ASSET_EXT_REGEX.test(normalized);
}

/**
 * Checks if the given path is a valid TeacherOS client-side route.
 */
export function isValidAppRoute(pathname: string): boolean {
	if (isDotFilePath(pathname)) {
		return false;
	}

	// Strip query string, hash, and normalize trailing slashes
	const normalized = stripQueryAndHash(pathname).replace(/\/+$/, "") || "/";

	if (VALID_EXACT_ROUTES[normalized]) {
		return true;
	}

	for (const prefix of VALID_DYNAMIC_PREFIXES) {
		if (normalized.startsWith(prefix) && normalized.length > prefix.length) {
			const sub = normalized.slice(prefix.length);
			// Dynamic sub-route should not contain extra unhandled path segments
			if (!sub.includes("/")) {
				return true;
			}
		}
	}

	return false;
}
