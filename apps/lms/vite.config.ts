import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { assemblePortalDists } from "./scripts/assemble-dist.mjs";

const rootPkg = JSON.parse(
	await fs.readFile(
		path.resolve(import.meta.dirname, "../../package.json"),
		"utf-8",
	),
) as { version?: string };

function assemblePortalsPlugin(): Plugin {
	let resolvedOutDir = path.resolve(import.meta.dirname, "dist");
	const repoRoot = path.resolve(import.meta.dirname, "../..");

	return {
		name: "lms-assemble-portals",
		apply: "build",
		configResolved(config) {
			resolvedOutDir = path.resolve(config.root, config.build.outDir);
		},
		closeBundle() {
			if (process.env.LMS_SKIP_PORTAL_ASSEMBLE === "1") {
				return;
			}
			if (!existsSync(path.join(resolvedOutDir, "index.html"))) {
				return;
			}
			assemblePortalDists({
				lmsOutDir: resolvedOutDir,
				repoRoot,
				rebuildPortals: process.env.LMS_REBUILD_PORTALS === "1",
			});
		},
	};
}

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(rootPkg.version ?? "0.0.0"),
	},
	server: {
		port: 8001,
		strictPort: true,
		proxy: {
			"/teacher": {
				target: process.env.LMS_TEACHER_DEV_URL ?? "http://localhost:8002",
				changeOrigin: false,
				ws: true,
			},
			"/student": {
				target: process.env.LMS_STUDENT_DEV_URL ?? "http://localhost:8003",
				changeOrigin: false,
				ws: true,
			},
			"/admin": {
				target: process.env.LMS_ADMIN_DEV_URL ?? "http://localhost:8004",
				changeOrigin: false,
				ws: true,
			},
		},
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		tailwindcss(),
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
			routeFileIgnorePattern: "\\.test\\.tsx?$",
		}),
		react(),
		assemblePortalsPlugin(),
	],
});
