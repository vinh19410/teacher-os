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
	// No dts emission: nothing consumes apps/server's declaration output —
	// package exports point at src/*.ts and the worker deploys from src
	// (packages/infra/alchemy.run.ts). Emitting dts made tsdown follow
	// @teacher-os/auth sources (isolated mode dropped re-exported types;
	// eager mode OOMs CI runners at the default 2GB heap).
	dts: false,
});
