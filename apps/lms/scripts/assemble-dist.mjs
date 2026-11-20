import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
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
 * Assemble built sub-portal bundles (`apps/web`, `apps/student`, `apps/admin`)
 * under `<lmsOutDir>/teacher`, `<lmsOutDir>/student`, and `<lmsOutDir>/admin`.
 *
 * @param {{ lmsOutDir?: string; repoRoot?: string; rebuildPortals?: boolean }} [options]
 */
export function assemblePortalDists(options = {}) {
	const lmsOutDir = options.lmsOutDir ?? DEFAULT_LMS_OUT_DIR;
	const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
	const rebuildPortals =
		options.rebuildPortals ?? process.env.LMS_REBUILD_PORTALS === "1";

	mkdirSync(lmsOutDir, { recursive: true });

	for (const { pkg, mount } of PORTAL_MOUNTS) {
		const portalDist = path.join(repoRoot, "apps", pkg, "dist");
		const portalIndex = path.join(portalDist, "index.html");

		if (rebuildPortals || !existsSync(portalIndex)) {
			execFileSync("pnpm", ["--filter", pkg, "exec", "vite", "build"], {
				cwd: repoRoot,
				env: process.env,
				stdio: "inherit",
			});
		}

		if (!existsSync(portalIndex)) {
			throw new Error(
				`[lms:assemble] Missing built portal entrypoint at ${portalIndex}`,
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
