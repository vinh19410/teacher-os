import path from "node:path";
import { defineConfig } from "vitest/config";

// Components inside this package self-reference via the package name
// ("@teacher-os/ui/..."), mirroring the exports map. pnpm does not link a
// package into its own node_modules, so alias the name to src for tests.
export default defineConfig({
	resolve: {
		alias: {
			"@teacher-os/ui": path.resolve(import.meta.dirname, "src"),
		},
	},
	test: {
		environment: "jsdom",
	},
});
