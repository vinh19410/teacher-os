import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	assemblePortalDists,
	bundleContainsServerUrl,
	bundleMatchesStudentPracticeFlag,
	extractViteEnvFromConfig,
	isValidHttpUrl,
} from "./assemble-dist.mjs";

const tempDirs: string[] = [];

function createTempDir(): string {
	const dir = mkdtempSync(path.join(tmpdir(), "lms-assemble-test-"));
	tempDirs.push(dir);
	return dir;
}

beforeEach(() => {
	vi.stubEnv("VITE_STUDENT_PRACTICE_ENABLED", "");
});

afterEach(() => {
	vi.unstubAllEnvs();
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

	it("overrides stale VITE_STUDENT_PRACTICE_ENABLED from process.env/config.env using config.define", () => {
		const enabled = extractViteEnvFromConfig(
			{
				env: { VITE_STUDENT_PRACTICE_ENABLED: "false" },
				define: {
					"import.meta.env.VITE_SERVER_URL": JSON.stringify(
						"https://api.staging.teacheros.io.vn",
					),
					"import.meta.env.VITE_STUDENT_PRACTICE_ENABLED":
						JSON.stringify("true"),
				},
			},
			{ VITE_STUDENT_PRACTICE_ENABLED: "false" },
		);
		expect(enabled.VITE_STUDENT_PRACTICE_ENABLED).toBe("true");

		const disabled = extractViteEnvFromConfig(
			{
				env: { VITE_STUDENT_PRACTICE_ENABLED: "true" },
				define: {
					"import.meta.env.VITE_SERVER_URL": JSON.stringify(
						"https://api.msmy.io.vn",
					),
					"import.meta.env.VITE_STUDENT_PRACTICE_ENABLED":
						JSON.stringify("false"),
				},
			},
			{ VITE_STUDENT_PRACTICE_ENABLED: "true" },
		);
		expect(disabled.VITE_STUDENT_PRACTICE_ENABLED).toBe("false");
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

	it("matches VITE_STUDENT_PRACTICE_ENABLED flag across quote styles in built student assets", () => {
		const portalDir = createTempDir();
		const assetsDir = path.join(portalDir, "assets");
		mkdirSync(assetsDir, { recursive: true });

		writeFileSync(
			path.join(assetsDir, "env.js"),
			'const e={VITE_STUDENT_PRACTICE_ENABLED:"true"};',
		);
		expect(bundleMatchesStudentPracticeFlag(portalDir, true)).toBe(true);
		expect(bundleMatchesStudentPracticeFlag(portalDir, false)).toBe(false);

		writeFileSync(
			path.join(assetsDir, "env.js"),
			"const e={'VITE_STUDENT_PRACTICE_ENABLED': 'true'};",
		);
		expect(bundleMatchesStudentPracticeFlag(portalDir, true)).toBe(true);
		expect(bundleMatchesStudentPracticeFlag(portalDir, false)).toBe(false);

		writeFileSync(
			path.join(assetsDir, "env.js"),
			"const e={VITE_STUDENT_PRACTICE_ENABLED:`true`};",
		);
		expect(bundleMatchesStudentPracticeFlag(portalDir, true)).toBe(true);
		expect(bundleMatchesStudentPracticeFlag(portalDir, false)).toBe(false);

		writeFileSync(
			path.join(assetsDir, "env.js"),
			'const e={VITE_STUDENT_PRACTICE_ENABLED:"false"};',
		);
		expect(bundleMatchesStudentPracticeFlag(portalDir, false)).toBe(true);
		expect(bundleMatchesStudentPracticeFlag(portalDir, true)).toBe(false);
	});

	it("returns false for both true and false when assets directory is missing or has no JS files", () => {
		const missingDir = createTempDir();
		expect(bundleMatchesStudentPracticeFlag(missingDir, true)).toBe(false);
		expect(bundleMatchesStudentPracticeFlag(missingDir, false)).toBe(false);

		const emptyAssetsDir = createTempDir();
		mkdirSync(path.join(emptyAssetsDir, "assets"), { recursive: true });
		writeFileSync(path.join(emptyAssetsDir, "assets", "app.css"), "body{}");
		expect(bundleMatchesStudentPracticeFlag(emptyAssetsDir, true)).toBe(false);
		expect(bundleMatchesStudentPracticeFlag(emptyAssetsDir, false)).toBe(false);
	});

	it("rebuilds stale prebuilt student dist when VITE_STUDENT_PRACTICE_ENABLED disagrees in either direction", () => {
		const repoRoot = createTempDir();
		const lmsOutDir = path.join(repoRoot, "apps/lms/dist");
		const targetApi = "https://api.staging.teacheros.io.vn";

		for (const pkg of ["web", "student", "admin"]) {
			const assetsDir = path.join(repoRoot, "apps", pkg, "dist", "assets");
			mkdirSync(assetsDir, { recursive: true });
			writeFileSync(
				path.join(repoRoot, "apps", pkg, "dist", "index.html"),
				"<!doctype html>",
			);
			writeFileSync(
				path.join(assetsDir, "auth-client-old.js"),
				`const runtimeEnv={VITE_SERVER_URL:"${targetApi}",VITE_STUDENT_PRACTICE_ENABLED:"false"};`,
			);
		}

		const buildPortal = vi.fn(
			(pkg: string, env: Record<string, string | undefined>, cwd: string) => {
				const assetsDir = path.join(cwd, "apps", pkg, "dist", "assets");
				const flag = env.VITE_STUDENT_PRACTICE_ENABLED ?? "false";
				writeFileSync(
					path.join(assetsDir, "auth-client-old.js"),
					`const runtimeEnv={VITE_SERVER_URL:"${env.VITE_SERVER_URL}",VITE_STUDENT_PRACTICE_ENABLED:"${flag}"};`,
				);
			},
		);

		// Flip false -> true: only student dist is stale and must rebuild
		assemblePortalDists({
			lmsOutDir,
			repoRoot,
			rebuildPortals: false,
			portalEnv: {
				VITE_SERVER_URL: targetApi,
				VITE_STUDENT_PRACTICE_ENABLED: "true",
			},
			buildPortal,
		});
		expect(buildPortal).toHaveBeenCalledTimes(1);
		expect(buildPortal.mock.calls[0]?.[0]).toBe("student");
		expect(
			bundleMatchesStudentPracticeFlag(path.join(lmsOutDir, "student"), true),
		).toBe(true);

		// Flip true -> false: stale enabled student dist must rebuild to disabled
		buildPortal.mockClear();
		assemblePortalDists({
			lmsOutDir,
			repoRoot,
			rebuildPortals: false,
			portalEnv: {
				VITE_SERVER_URL: targetApi,
				VITE_STUDENT_PRACTICE_ENABLED: "false",
			},
			buildPortal,
		});
		expect(buildPortal).toHaveBeenCalledTimes(1);
		expect(buildPortal.mock.calls[0]?.[0]).toBe("student");
		expect(
			bundleMatchesStudentPracticeFlag(path.join(lmsOutDir, "student"), false),
		).toBe(true);
	});

	it("fails loud if built student bundle disagrees with expected VITE_STUDENT_PRACTICE_ENABLED", () => {
		const targetApi = "https://api.staging.teacheros.io.vn";

		// Expected true, bundle omits flag
		const repoMissing = createTempDir();
		expect(() =>
			assemblePortalDists({
				lmsOutDir: path.join(repoMissing, "apps/lms/dist"),
				repoRoot: repoMissing,
				rebuildPortals: true,
				portalEnv: {
					VITE_SERVER_URL: targetApi,
					VITE_STUDENT_PRACTICE_ENABLED: "true",
				},
				buildPortal: (pkg, env, cwd) => {
					const assetsDir = path.join(cwd, "apps", pkg, "dist", "assets");
					mkdirSync(assetsDir, { recursive: true });
					writeFileSync(
						path.join(cwd, "apps", pkg, "dist", "index.html"),
						"<!doctype html>",
					);
					writeFileSync(
						path.join(assetsDir, "env.js"),
						`const runtimeEnv={VITE_SERVER_URL:"${env.VITE_SERVER_URL}"};`,
					);
				},
			}),
		).toThrow(/VITE_STUDENT_PRACTICE_ENABLED/);

		// Expected false, bundle leaks flag=true
		const repoLeaked = createTempDir();
		expect(() =>
			assemblePortalDists({
				lmsOutDir: path.join(repoLeaked, "apps/lms/dist"),
				repoRoot: repoLeaked,
				rebuildPortals: true,
				portalEnv: {
					VITE_SERVER_URL: "https://api.msmy.io.vn",
					VITE_STUDENT_PRACTICE_ENABLED: "false",
				},
				buildPortal: (pkg, env, cwd) => {
					const assetsDir = path.join(cwd, "apps", pkg, "dist", "assets");
					mkdirSync(assetsDir, { recursive: true });
					writeFileSync(
						path.join(cwd, "apps", pkg, "dist", "index.html"),
						"<!doctype html>",
					);
					writeFileSync(
						path.join(assetsDir, "env.js"),
						`const runtimeEnv={VITE_SERVER_URL:"${env.VITE_SERVER_URL}",VITE_STUDENT_PRACTICE_ENABLED:"true"};`,
					);
				},
			}),
		).toThrow(/VITE_STUDENT_PRACTICE_ENABLED/);
	});
});
