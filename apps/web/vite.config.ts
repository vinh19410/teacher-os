import fs from "node:fs/promises";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { type Connect, defineConfig, type Plugin } from "vite";
import {
	isDotFilePath,
	isStaticAssetPath,
	isValidAppRoute,
} from "./src/routes-matcher";

function spa404Plugin(): Plugin {
	const createMiddleware =
		(
			getRoot: () => string,
			transformHtml: (url: string, html: string) => Promise<string>,
		): Connect.NextHandleFunction =>
		async (req, res, next) => {
			const url = req.url ?? "/";
			const pathname = new URL(url, "http://localhost").pathname;

			// 1. Vite dev internals pass through first
			if (
				pathname.startsWith("/@") ||
				pathname.startsWith("/src/") ||
				pathname.startsWith("/node_modules/")
			) {
				next();
				return;
			}

			// 2. Block dotfiles with 404 plain text
			if (isDotFilePath(pathname)) {
				res.statusCode = 404;
				res.setHeader("Content-Type", "text/plain; charset=utf-8");
				res.setHeader("Cache-Control", "no-store");
				res.end("Not Found");
				return;
			}

			// 3. Static assets pass through
			if (isStaticAssetPath(pathname)) {
				next();
				return;
			}

			// 3. Valid SPA routes pass through to Vite SPA fallback (200 OK)
			if (isValidAppRoute(pathname)) {
				next();
				return;
			}

			// 4. Unknown routes
			const isGetOrHead = req.method === "GET" || req.method === "HEAD";
			const accept = req.headers.accept ?? "";
			if (isGetOrHead && accept.includes("text/html")) {
				try {
					const indexPath = path.resolve(getRoot(), "index.html");
					const template = await fs.readFile(indexPath, "utf-8");
					const html = await transformHtml(url, template);
					res.statusCode = 404;
					res.setHeader("Content-Type", "text/html; charset=utf-8");
					res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
					res.end(html);
					return;
				} catch (e) {
					next(e);
					return;
				}
			}

			// Non-HTML curl / probe to unknown route
			res.statusCode = 404;
			res.setHeader("Content-Type", "text/plain; charset=utf-8");
			res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
			res.end("Not Found");
		};

	return {
		name: "spa-404-handler",
		configureServer(server) {
			server.middlewares.use(
				createMiddleware(
					() => server.config.root,
					(url, html) => server.transformIndexHtml(url, html),
				),
			);
		},
		configurePreviewServer(server) {
			server.middlewares.use(
				createMiddleware(
					() => path.resolve(server.config.root, server.config.build.outDir),
					async (_, html) => html,
				),
			);
		},
	};
}
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
		spa404Plugin(),
		// No service worker on purpose (issue #125): the vite-plugin-pwa SW
		// broke SPA boot and auth fetches in real browsers and precached
		// index.html served stale shells across deploys. public/sw.js only
		// self-unregisters the SW in browsers that still hold it.
	],
});
