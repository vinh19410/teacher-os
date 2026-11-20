import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { handleLmsRequest } from "../src/worker.ts";

const MIME_TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".cjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".webmanifest": "application/manifest+json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".eot": "application/vnd.ms-fontobject",
	".otf": "font/otf",
	".txt": "text/plain; charset=utf-8",
	".xml": "application/xml; charset=utf-8",
	".wasm": "application/wasm",
	".mp3": "audio/mpeg",
	".pdf": "application/pdf",
};

function mimeTypeFor(filePath) {
	const ext = path.extname(filePath).toLowerCase();
	return MIME_TYPES[ext] ?? "application/octet-stream";
}

function isInsideRoot(rootDir, targetPath) {
	const relative = path.relative(rootDir, targetPath);
	return (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

async function resolveAssetFile(distDir, pathname) {
	let decoded;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return null;
	}

	const normalized = decoded.replace(/^\/+/, "");
	const candidate = path.resolve(distDir, normalized);
	if (!isInsideRoot(distDir, candidate)) {
		return null;
	}

	try {
		const info = await stat(candidate);
		if (info.isFile()) {
			return candidate;
		}
		if (info.isDirectory()) {
			const dirIndex = path.join(candidate, "index.html");
			const indexInfo = await stat(dirIndex);
			if (indexInfo.isFile()) {
				return dirIndex;
			}
		}
	} catch {
		return null;
	}
	return null;
}

export function createNodeAssetsBinding(distDir) {
	const resolvedDist = path.resolve(distDir);
	return {
		async fetch(input) {
			const req = typeof input === "string" ? new Request(input) : input;
			const url = new URL(req.url);
			const filePath = await resolveAssetFile(resolvedDist, url.pathname);
			if (!filePath) {
				return new Response("Not Found", {
					status: 404,
					headers: { "Content-Type": "text/plain; charset=utf-8" },
				});
			}

			const body = await readFile(filePath);
			return new Response(req.method === "HEAD" ? null : body, {
				status: 200,
				headers: {
					"Content-Type": mimeTypeFor(filePath),
					"Content-Length": String(body.byteLength),
				},
			});
		},
	};
}

function readFirstHeaderValue(raw) {
	if (typeof raw !== "string") {
		return null;
	}
	const first = raw.split(",")[0]?.trim();
	return first || null;
}

async function toWebRequest(req, fallbackPort) {
	const forwardedProto = readFirstHeaderValue(req.headers["x-forwarded-proto"]);
	const proto =
		forwardedProto === "https" || forwardedProto === "http"
			? forwardedProto
			: "http";
	const host =
		readFirstHeaderValue(req.headers["x-forwarded-host"]) ??
		readFirstHeaderValue(req.headers.host) ??
		`127.0.0.1:${fallbackPort}`;

	const rawUrl = req.url ?? "/";
	const fullUrl = new URL(rawUrl, `${proto}://${host}`);

	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value === undefined) continue;
		if (Array.isArray(value)) {
			for (const entry of value) {
				headers.append(key, entry);
			}
		} else {
			headers.set(key, value);
		}
	}

	const method = req.method ?? "GET";
	let body;
	if (method !== "GET" && method !== "HEAD") {
		const chunks = [];
		for await (const chunk of req) {
			chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
		}
		if (chunks.length > 0) {
			body = Buffer.concat(chunks);
		}
	}

	return new Request(fullUrl, {
		method,
		headers,
		body,
	});
}

export function startLmsServer(options = {}) {
	const port = Number(
		options.port ??
			process.env.PORT ??
			process.env.E2E_LMS_PORT ??
			process.env.E2E_WEB_PORT ??
			8001,
	);
	const host = options.host ?? process.env.HOST;
	const distDir =
		options.distDir ?? path.resolve(import.meta.dirname, "../dist");
	const assets = createNodeAssetsBinding(distDir);

	const server = http.createServer(async (req, res) => {
		try {
			const webRequest = await toWebRequest(req, port);
			const response = await handleLmsRequest(webRequest, {
				ASSETS: assets,
				VITE_SERVER_URL: process.env.VITE_SERVER_URL,
			});

			res.statusCode = response.status;
			response.headers.forEach((value, key) => {
				res.setHeader(key, value);
			});

			if (req.method === "HEAD" || !response.body) {
				res.end();
				return;
			}

			const payload = Buffer.from(await response.arrayBuffer());
			res.end(payload);
		} catch (error) {
			console.error("[lms:serve] Unhandled request error", error);
			if (!res.headersSent) {
				res.statusCode = 500;
				res.setHeader("Content-Type", "text/plain; charset=utf-8");
			}
			res.end("Internal Server Error");
		}
	});

	server.listen(port, host || undefined, () => {
		const displayHost = host ?? "127.0.0.1";
		console.log(`[lms:serve] Listening on http://${displayHost}:${port}`);
	});

	const shutdown = () => {
		server.close(() => {
			process.exit(0);
		});
	};
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);

	return server;
}

const isDirectRun =
	Boolean(process.argv[1]) &&
	path.resolve(process.argv[1]) ===
		path.resolve(import.meta.dirname, "serve-lms.mjs");

if (isDirectRun) {
	startLmsServer();
}
