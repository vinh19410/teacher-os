import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		port: 8001,
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
		// No service worker on purpose (issue #125): the vite-plugin-pwa SW
		// broke SPA boot and auth fetches in real browsers and precached
		// index.html served stale shells across deploys. public/sw.js only
		// self-unregisters the SW in browsers that still hold it.
	],
});
