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
		// Prepares all tsconfig files for tsc in one pass (single-tsconfig
		// monorepo mode). The default isolated path failed to emit the
		// @teacher-os/auth sources, so types re-exported from session.ts
		// went missing from the bundled d.ts and the build errored.
		eager: true,
	},
});
