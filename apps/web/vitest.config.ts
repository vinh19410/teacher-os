import fs from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vitest/config";

const rootPkg = JSON.parse(
	await fs.readFile(
		path.resolve(import.meta.dirname, "../../package.json"),
		"utf-8",
	),
) as { version?: string };

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(rootPkg.version ?? "0.0.0"),
	},
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		environment: "node",
	},
});
