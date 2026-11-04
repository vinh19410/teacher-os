import fs from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vitest/config";

// @teacher-os/env/web validates VITE_SERVER_URL at import time. Tests must
// not depend on a developer .env (fresh worktrees/CI have none). Set it on
// the parent process here — vitest workers inherit it and merge process.env
// into import.meta.env before any test module is imported. Suites that care
// pass an explicit baseUrl and never read the value.
process.env.VITE_SERVER_URL ??= "http://localhost:8000";

const rootPkg = JSON.parse(
	await fs.readFile(
		path.resolve(import.meta.dirname, "../../package.json"),
		"utf-8",
	),
) as { version?: string };

const isCi =
	Boolean(process.env.CI) &&
	process.env.CI !== "0" &&
	process.env.CI !== "false";

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(rootPkg.version ?? "0.0.0"),
	},
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		environment: "node",
		maxWorkers: isCi ? 2 : undefined,
	},
});
