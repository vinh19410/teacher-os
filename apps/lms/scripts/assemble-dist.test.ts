import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	assemblePortalDists,
	bundleContainsServerUrl,
	extractViteEnvFromConfig,
	isValidHttpUrl,
} from "./assemble-dist.mjs";

const tempDirs: string[] = [];

function createTempDir(): string {
	const dir = mkdtempSync(path.join(tmpdir(), "lms-assemble-test-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (dir) {
			rmSync(dir, { recursive: true, force: true });
		}
	}
});

describe("extractViteEnvFromConfig", () => {
	it("extracts VITE_* values from Alchemy config.define even when process.env lacks them", () => {
		const resolved = extractViteEnvFromConfig(
			{
				env: {},
				define: {
					"import.meta.env.VITE_SERVER_URL": JSON.stringify(
						"https://api.staging.teacheros.io.vn",
					),
					"import.meta.env.VITE_AI_ENABLED": JSON.stringify("false"),
					__APP_VERSION__: JSON.stringify("0.0.25"),
				},
			},
			{},
		);

		expect(resolved).toEqual({
			VITE_SERVER_URL: "https://api.staging.teacheros.io.vn",
			VITE_AI_ENABLED: "false",
		});
	});

	it("gives config.define precedence over stale process.env and config.env values", () => {
		const resolved = extractViteEnvFromConfig(
			{
				env: {
					VITE_SERVER_URL: "http://localhost:8000",
					VITE_STUDENT_PRACTICE_ENABLED: "true",
				},
				define: {
					"import.meta.env.VITE_SERVER_URL": JSON.stringify(
						"https://api.msmy.io.vn",
					),
				},
			},
			{
				VITE_SERVER_URL: "http://stale.local",
				VITE_TEACHER_SIGNUP_ENABLED: "true",
				UNRELATED_SECRET: "should-not-pass",
			},
		);

		expect(resolved).toEqual({
			VITE_SERVER_URL: "https://api.msmy.io.vn",
			VITE_STUDENT_PRACTICE_ENABLED: "true",
			VITE_TEACHER_SIGNUP_ENABLED: "true",
		});
	});
});

describe("assemblePortalDists", () => {
	it("forwards portalEnv into child portal builds and verifies assembled bundles contain VITE_SERVER_URL", () => {
		const repoRoot = createTempDir();
		const lmsOutDir = path.join(repoRoot, "apps/lms/dist");
		const targetApi = "https://api.staging.teacheros.io.vn";

		const buildPortal = vi.fn(
			(pkg: string, env: Record<string, string | undefined>, cwd: string) => {
				expect(env.VITE_SERVER_URL).toBe(targetApi);
				expect(env.VITE_AI_ENABLED).toBe("true");
				const assetsDir = path.join(cwd, "apps", pkg, "dist", "assets");
				mkdirSync(assetsDir, { recursive: true });
				writeFileSync(
					path.join(cwd, "apps", pkg, "dist", "index.html"),
					`<!doctype html><title>${pkg}</title>`,
				);
				writeFileSync(
					path.join(assetsDir, "auth-client-abc.js"),
					`const runtimeEnv={VITE_SERVER_URL:"${env.VITE_SERVER_URL}"};`,
				);
			},
		);

		assemblePortalDists({
			lmsOutDir,
			repoRoot,
			rebuildPortals: true,
			portalEnv: {
				VITE_SERVER_URL: targetApi,
				VITE_AI_ENABLED: "true",
			},
			buildPortal,
		});

		expect(buildPortal).toHaveBeenCalledTimes(3);
		for (const mount of ["teacher", "student", "admin"]) {
			expect(
				bundleContainsServerUrl(path.join(lmsOutDir, mount), targetApi),
			).toBe(true);
			expect(
				readFileSync(path.join(lmsOutDir, mount, "index.html"), "utf8"),
			).toContain("<!doctype html>");
		}
	});

	it("rebuilds stale prebuilt portal dist when its embedded VITE_SERVER_URL disagrees with portalEnv", () => {
		const repoRoot = createTempDir();
		const lmsOutDir = path.join(repoRoot, "apps/lms/dist");
		const targetApi = "https://api.msmy.io.vn";

		for (const pkg of ["web", "student", "admin"]) {
			const assetsDir = path.join(repoRoot, "apps", pkg, "dist", "assets");
			mkdirSync(assetsDir, { recursive: true });
			writeFileSync(
				path.join(repoRoot, "apps", pkg, "dist", "index.html"),
				"<!doctype html>",
			);
			writeFileSync(
				path.join(assetsDir, "auth-client-old.js"),
				'const runtimeEnv={VITE_SERVER_URL:"http://localhost:8000"};',
			);
		}

		const buildPortal = vi.fn(
			(pkg: string, env: Record<string, string | undefined>, cwd: string) => {
				const assetsDir = path.join(cwd, "apps", pkg, "dist", "assets");
				writeFileSync(
					path.join(assetsDir, "auth-client-old.js"),
					`const runtimeEnv={VITE_SERVER_URL:"${env.VITE_SERVER_URL}"};`,
				);
			},
		);

		assemblePortalDists({
			lmsOutDir,
			repoRoot,
			rebuildPortals: false,
			portalEnv: { VITE_SERVER_URL: targetApi },
			buildPortal,
		});

		expect(buildPortal).toHaveBeenCalledTimes(3);
		expect(
			bundleContainsServerUrl(path.join(lmsOutDir, "teacher"), targetApi),
		).toBe(true);
	});

	it("fails loud when rebuilding portals without a valid VITE_SERVER_URL", () => {
		const repoRoot = createTempDir();
		const lmsOutDir = path.join(repoRoot, "apps/lms/dist");

		expect(() =>
			assemblePortalDists({
				lmsOutDir,
				repoRoot,
				rebuildPortals: true,
				portalEnv: { VITE_SERVER_URL: "" },
				buildPortal: vi.fn(),
			}),
		).toThrow(/without a valid VITE_SERVER_URL/);
	});

	it("fails loud if a built portal bundle omits the expected VITE_SERVER_URL", () => {
		const repoRoot = createTempDir();
		const lmsOutDir = path.join(repoRoot, "apps/lms/dist");
		const targetApi = "https://api.staging.teacheros.io.vn";

		const brokenBuild = vi.fn(
			(pkg: string, _env: Record<string, string | undefined>, cwd: string) => {
				const assetsDir = path.join(cwd, "apps", pkg, "dist", "assets");
				mkdirSync(assetsDir, { recursive: true });
				writeFileSync(
					path.join(cwd, "apps", pkg, "dist", "index.html"),
					"<!doctype html>",
				);
				writeFileSync(
					path.join(assetsDir, "auth-client-broken.js"),
					'const runtimeEnv={BASE_URL:"/teacher/",PROD:!0};',
				);
			},
		);

		expect(() =>
			assemblePortalDists({
				lmsOutDir,
				repoRoot,
				rebuildPortals: true,
				portalEnv: { VITE_SERVER_URL: targetApi },
				buildPortal: brokenBuild,
			}),
		).toThrow(/do not contain VITE_SERVER_URL/);
	});

	it("validates http/https URLs strictly", () => {
		expect(isValidHttpUrl("https://api.msmy.io.vn")).toBe(true);
		expect(isValidHttpUrl("http://localhost:8000")).toBe(true);
		expect(isValidHttpUrl("")).toBe(false);
		expect(isValidHttpUrl("ftp://api.msmy.io.vn")).toBe(false);
		expect(isValidHttpUrl("not-a-url")).toBe(false);
	});
});
