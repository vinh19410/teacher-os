/**
 * Known exact routes served by the unified LMS gateway at root.
 */
export const VALID_LMS_EXACT_ROUTES: Record<string, true> = {
	"/": true,
	"/login": true,
	"/forgot-password": true,
	"/reset-password": true,
	"/verify-email": true,
};

/**
 * Known dynamic single-segment route prefixes at the unified LMS root.
 */
export const VALID_LMS_DYNAMIC_PREFIXES: readonly string[] = ["/pay/"];

/**
 * Known exact application routes mounted under `/teacher` (mirrored from `apps/web`).
 */
export const VALID_TEACHER_EXACT_ROUTES: Record<string, true> = {
	"/": true,
	"/login": true,
	"/verify-email": true,
	"/forgot-password": true,
	"/reset-password": true,
	"/dashboard": true,
	"/attendance": true,
	"/profile": true,
	"/reports": true,
	"/schedule": true,
	"/tuition": true,
	"/debts": true,
	"/assignments": true,
	"/assignments/new": true,
	"/assignments/preview": true,
	"/assignments/packs": true,
	"/assignments/tests/new": true,
	"/assignments/tests/preview": true,
	"/grading": true,
	"/classes": true,
	"/students": true,
	"/notifications": true,
	"/leads": true,
	"/placement-test": true,
	"/courses": true,
	"/syllabus": true,
	"/vocab": true,
	"/materials": true,
};

/**
 * Known dynamic single-segment route prefixes under `/teacher`.
 */
export const VALID_TEACHER_DYNAMIC_PREFIXES: readonly string[] = [
	"/assignments/",
	"/assignments/tests/",
	"/assignments/packs/",
	"/classes/",
	"/grading/",
	"/students/",
	"/syllabus/",
	"/tuition/",
];

const STATIC_ASSET_PREFIXES = [
	"/assets/",
	"/teacher/assets/",
	"/student/assets/",
	"/admin/assets/",
] as const;

const STATIC_ASSET_EXT_REGEX =
	/\.(?:js|mjs|cjs|css|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|otf|json|webmanifest|map|txt|xml|wasm|mp3)$/i;

const KNOWN_PUBLIC_ASSETS: Record<string, true> = {
	"/sw.js": true,
	"/registerSW.js": true,
	"/dev-sw.js": true,
	"/robots.txt": true,
	"/theme-init.js": true,
	"/favicon.ico": true,
	"/logo.png": true,
	"/manifest.webmanifest": true,
};

function stripQueryAndHash(pathname: string): string {
	return pathname.split("?")[0].split("#")[0];
}

function normalizeRoutePath(pathname: string): string {
	return stripQueryAndHash(pathname).replace(/\/+$/, "") || "/";
}

function matchesDynamicPrefix(
	normalized: string,
	prefixes: readonly string[],
): boolean {
	for (const prefix of prefixes) {
		if (normalized.startsWith(prefix) && normalized.length > prefix.length) {
			const sub = normalized.slice(prefix.length);
			if (!sub.includes("/")) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Blocks hidden dotfiles (e.g. `/.env`, `/.git`) and path traversal (`..`)
 * while allowing `/.well-known/*`.
 */
export function isDotFilePath(pathname: string): boolean {
	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		decoded = pathname;
	}

	if (decoded.includes("..")) {
		return true;
	}

	const segments = decoded.split("/").filter(Boolean);
	return segments.some(
		(segment) => segment.startsWith(".") && segment !== ".well-known",
	);
}

/**
 * Identifies static bundle/public assets that must be served directly from ASSETS.
 */
export function isStaticAssetPath(pathname: string): boolean {
	if (isDotFilePath(pathname)) {
		return false;
	}

	const normalized = stripQueryAndHash(pathname);

	if (STATIC_ASSET_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
		return true;
	}

	if (KNOWN_PUBLIC_ASSETS[normalized]) {
		return true;
	}

	return STATIC_ASSET_EXT_REGEX.test(normalized);
}

/**
 * Checks whether a sub-path (with `/teacher` stripped) is a valid teacher SPA route.
 */
export function isValidTeacherSubRoute(subPath: string): boolean {
	if (isDotFilePath(subPath)) {
		return false;
	}

	const normalized = normalizeRoutePath(subPath);
	if (VALID_TEACHER_EXACT_ROUTES[normalized]) {
		return true;
	}

	return matchesDynamicPrefix(normalized, VALID_TEACHER_DYNAMIC_PREFIXES);
}

/**
 * Checks whether a root pathname is a valid unified LMS gateway route.
 */
export function isValidLmsRootRoute(pathname: string): boolean {
	if (isDotFilePath(pathname)) {
		return false;
	}

	const normalized = normalizeRoutePath(pathname);
	if (VALID_LMS_EXACT_ROUTES[normalized]) {
		return true;
	}

	return matchesDynamicPrefix(normalized, VALID_LMS_DYNAMIC_PREFIXES);
}
