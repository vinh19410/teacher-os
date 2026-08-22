import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	outDir: "./dist",
	clean: true,
	deps: {
		alwaysBundle: [/@teacher-os\/.*/],
		neverBundle: ["cloudflare:workers"],
	},
	dts: {
		// Emit declarations in-process: the isolated-declarations path fails to
		// emit workspace sources (e.g. @teacher-os/auth types re-exported from
		// session.ts), leaving the bundled d.ts missing those exports.
		eager: true,
	},
});
