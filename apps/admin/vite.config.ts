import fs from "node:fs/promises";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
	server: {
		port: 8004,
		strictPort: true,
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		tailwindcss(),
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		react(),
	],
});
