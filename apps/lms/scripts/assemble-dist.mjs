import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PORTAL_MOUNTS = [
	{ pkg: "web", mount: "teacher" },
	{ pkg: "student", mount: "student" },
	{ pkg: "admin", mount: "admin" },
];

const DEFAULT_LMS_OUT_DIR = path.resolve(import.meta.dirname, "../dist");
const DEFAULT_REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

/**
 * Checks whether a value is a non-empty HTTP(S) URL suitable for `VITE_SERVER_URL`.
 *
 * @param {string | undefined | null} value
 * @returns {boolean}
 */
export function isValidHttpUrl(value) {
	if (typeof value !== "string" || value.trim().length === 0) {
		return false;
	}
	try {
		const parsed = new URL(value.trim());
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Extracts all `VITE_*` environment variables for sub-portal builds by merging:
 * 1. `processEnv` (lowest precedence)
 * 2. Vite `config.env` (dotenv-loaded `VITE_*` keys)
 * 3. Vite `config.define["import.meta.env.VITE_*"]` (highest precedence — this
 *    is how Alchemy's `Cloudflare.Website.Vite` injects deploy-time `VITE_*`
 *    bindings without placing them in `process.env`).
 *
 * @param {{ env?: Record<string, unknown>; define?: Record<string, unknown> } | undefined} config
 * @param {Record<string, string | undefined>} [processEnv]
 * @returns {Record<string, string>}
 */
export function extractViteEnvFromConfig(config, processEnv = process.env) {
	/** @type {Record<string, string>} */
	const resolved = {};

	for (const [key, value] of Object.entries(processEnv ?? {})) {
		if (key.startsWith("VITE_") && typeof value === "string" && value !== "") {
			resolved[key] = value;
		}
	}

	for (const [key, value] of Object.entries(config?.env ?? {})) {
		if (key.startsWith("VITE_") && typeof value === "string" && value !== "") {
			resolved[key] = value;
		}
	}

	const DEFINE_PREFIX = "import.meta.env.";
	for (const [key, rawValue] of Object.entries(config?.define ?? {})) {
		if (!key.startsWith(`${DEFINE_PREFIX}VITE_`)) {
			continue;
		}
		if (typeof rawValue !== "string") {
			continue;
		}
		const envKey = key.slice(DEFINE_PREFIX.length);
		try {
			const parsed = JSON.parse(rawValue);
			if (typeof parsed === "string" && parsed !== "") {
				resolved[envKey] = parsed;
			}
		} catch {
			// Skip non-JSON-literal define expressions.
		}
	}

	return resolved;
}

/**
 * Verifies that at least one built JS asset under `<portalDir>/assets/` embeds
 * the expected `VITE_SERVER_URL` string. Catches stale or env-stripped builds
 * before they can ship a runtime white screen from `@t3-oss/env-core`.
 *
 * @param {string} portalDir
 * @param {string} expectedServerUrl
 * @returns {boolean}
 */
export function bundleContainsServerUrl(portalDir, expectedServerUrl) {
	const assetsDir = path.join(portalDir, "assets");
	if (!existsSync(assetsDir)) {
		return false;
	}
	const jsFiles = readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
	for (const name of jsFiles) {
		const content = readFileSync(path.join(assetsDir, name), "utf8");
		if (content.includes(expectedServerUrl)) {
			return true;
		}
	}
	return false;
}

const STUDENT_PRACTICE_ENABLED_PATTERN =
	/VITE_STUDENT_PRACTICE_ENABLED["'`]?\s*:\s*["'`]true["'`]/;

/**
 * Verifies whether built JS assets under `<portalDir>/assets/` match the
 * expected `VITE_STUDENT_PRACTICE_ENABLED` build flag (true = must embed the
 * enabled flag; false = must not embed `"true"`). Prevents stale student dists
 * or flag mismatches from shipping silently.
 *
 * @param {string} portalDir
 * @param {boolean} expectedEnabled
 * @returns {boolean}
 */
export function bundleMatchesStudentPracticeFlag(portalDir, expectedEnabled) {
	const assetsDir = path.join(portalDir, "assets");
	if (!existsSync(assetsDir)) {
		return false;
	}
	const jsFiles = readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
	if (jsFiles.length === 0) {
		return false;
	}
	const hasEnabledFlag = jsFiles.some((name) =>
		STUDENT_PRACTICE_ENABLED_PATTERN.test(
			readFileSync(path.join(assetsDir, name), "utf8"),
		),
	);
	return expectedEnabled ? hasEnabledFlag : !hasEnabledFlag;
}

/**
 * Assemble built sub-portal bundles (`apps/web`, `apps/student`, `apps/admin`)
 * under `<lmsOutDir>/teacher`, `<lmsOutDir>/student`, and `<lmsOutDir>/admin`.
 *
 * @param {{
 *   lmsOutDir?: string;
 *   repoRoot?: string;
 *   rebuildPortals?: boolean;
 *   portalEnv?: Record<string, string | undefined>;
 *   buildPortal?: (pkg: string, env: Record<string, string | undefined>, repoRoot: string) => void;
 * }} [options]
 */
export function assemblePortalDists(options = {}) {
	const lmsOutDir = options.lmsOutDir ?? DEFAULT_LMS_OUT_DIR;
	const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
	const rebuildPortals =
		options.rebuildPortals ??
		(process.env.LMS_REBUILD_PORTALS === "1" ||
			process.env.ALCHEMY_CLOUDFLARE_VITE_INJECTED === "1");
	/** @type {Record<string, string | undefined>} */
	const childEnv = {
		...process.env,
		...(options.portalEnv ?? {}),
	};
	const expectedServerUrl = childEnv.VITE_SERVER_URL?.trim() ?? "";
	const expectedStudentPractice =
		childEnv.VITE_STUDENT_PRACTICE_ENABLED === "true";

	const buildPortal =
		options.buildPortal ??
		((pkg, env, cwd) => {
			execFileSync("pnpm", ["--filter", pkg, "exec", "vite", "build"], {
				cwd,
				env,
				stdio: "inherit",
			});
		});

	mkdirSync(lmsOutDir, { recursive: true });

	for (const { pkg, mount } of PORTAL_MOUNTS) {
		const portalDist = path.join(repoRoot, "apps", pkg, "dist");
		const portalIndex = path.join(portalDist, "index.html");

		const staleOrMissingEnv =
			existsSync(portalIndex) &&
			((isValidHttpUrl(expectedServerUrl) &&
				!bundleContainsServerUrl(portalDist, expectedServerUrl)) ||
				(pkg === "student" &&
					!bundleMatchesStudentPracticeFlag(
						portalDist,
						expectedStudentPractice,
					)));

		if (rebuildPortals || !existsSync(portalIndex) || staleOrMissingEnv) {
			if (!isValidHttpUrl(expectedServerUrl)) {
				throw new Error(
					`[lms:assemble] Refusing to build portal "${pkg}" without a valid VITE_SERVER_URL (received "${expectedServerUrl}")`,
				);
			}
			buildPortal(pkg, childEnv, repoRoot);
		}

		if (!existsSync(portalIndex)) {
			throw new Error(
				`[lms:assemble] Missing built portal entrypoint at ${portalIndex}`,
			);
		}

		if (
			isValidHttpUrl(expectedServerUrl) &&
			!bundleContainsServerUrl(portalDist, expectedServerUrl)
		) {
			throw new Error(
				`[lms:assemble] Built portal "${pkg}" assets do not contain VITE_SERVER_URL "${expectedServerUrl}" — refusing to assemble broken bundle`,
			);
		}

		if (
			pkg === "student" &&
			!bundleMatchesStudentPracticeFlag(portalDist, expectedStudentPractice)
		) {
			throw new Error(
				`[lms:assemble] Built portal "student" assets do not match expected VITE_STUDENT_PRACTICE_ENABLED="${expectedStudentPractice ? "true" : "false"}" — refusing to assemble mismatched bundle`,
			);
		}

		const targetDir = path.join(lmsOutDir, mount);
		rmSync(targetDir, { recursive: true, force: true });
		cpSync(portalDist, targetDir, { recursive: true });
	}
}

const isDirectRun =
	Boolean(process.argv[1]) &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	assemblePortalDists();
}
