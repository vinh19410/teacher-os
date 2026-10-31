import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("./public", import.meta.url).pathname;
const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
const rootIndexFile = join(root, "index.html");
const port = Number(process.env.PORT) || 8005;
const types = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".mp3": "audio/mpeg",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".png": "image/png",
	".jpg": "image/jpeg",
	".webp": "image/webp",
	".pdf": "application/pdf",
};

const escapeAttr = (value) =>
	String(value)
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

export function replaceLeadApiMeta(html, leadApiUrl) {
	const trimmed = String(leadApiUrl ?? "").trim();
	if (!trimmed) return html;
	return html.replace(
		/<meta\s+name="lead-api"\s+content="[^"]*"\s*\/?>/,
		`<meta name="lead-api" content="${escapeAttr(trimmed)}">`,
	);
}

function parseByteRange(rangeHeader, totalLength) {
	const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
	if (!match) return null;
	const [, startStr, endStr] = match;
	if (startStr === "" && endStr === "") return null;
	let start;
	let end;
	if (startStr === "") {
		const suffixLength = Number(endStr);
		if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
		start = Math.max(0, totalLength - suffixLength);
		end = totalLength - 1;
	} else {
		start = Number(startStr);
		end = endStr === "" ? totalLength - 1 : Number(endStr);
	}
	if (
		!Number.isInteger(start) ||
		!Number.isInteger(end) ||
		start < 0 ||
		start >= totalLength ||
		start > end
	) {
		return null;
	}
	return { start, end: Math.min(end, totalLength - 1) };
}

export function createProfileServer(
	leadApiUrl = process.env.LEAD_API_URL || "http://localhost:8000",
) {
	return createServer(async (req, res) => {
		let url;
		let decodedPath;
		try {
			const rawReqUrl = String(req.url ?? "/").replace(/^\/+/, "/");
			url = new URL(rawReqUrl, "http://localhost");
			decodedPath = decodeURIComponent(url.pathname);
		} catch {
			res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
			res.end("Bad request");
			return;
		}

		if (decodedPath.includes("\0")) {
			res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
			res.end("Bad request");
			return;
		}

		const collapsedPath = decodedPath.replace(/^\/+/, "/");
		const relPath = collapsedPath.slice(1);
		const candidate = resolve(root, relPath);
		if (candidate !== root && !candidate.startsWith(rootWithSep)) {
			res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
			res.end("Forbidden");
			return;
		}

		try {
			if (!collapsedPath.endsWith("/")) {
				const info = await stat(candidate).catch(() => null);
				if (info?.isDirectory()) {
					const safeRedirectPath = `/${relPath.replace(/^\/+/, "")}`;
					res.writeHead(301, {
						location: `${safeRedirectPath}/${url.search}`,
					});
					res.end();
					return;
				}
			}

			const file = collapsedPath.endsWith("/")
				? join(candidate, "index.html")
				: candidate;
			if (file !== root && !file.startsWith(rootWithSep)) {
				res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
				res.end("Forbidden");
				return;
			}

			if (file === rootIndexFile) {
				const raw = await readFile(file, "utf8");
				const rendered = replaceLeadApiMeta(raw, leadApiUrl);
				const buf = Buffer.from(rendered, "utf8");
				res.writeHead(200, {
					"content-type": types[".html"],
					"content-length": String(buf.length),
				});
				res.end(req.method === "HEAD" ? undefined : buf);
				return;
			}

			const info = await stat(file);
			if (!info.isFile()) {
				res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
				res.end("Not found");
				return;
			}

			const body = await readFile(file);
			const total = body.length;
			const contentType = types[extname(file)] ?? "application/octet-stream";
			const rangeHeader = req.headers.range;

			if (typeof rangeHeader === "string" && rangeHeader.startsWith("bytes=")) {
				const range = parseByteRange(rangeHeader, total);
				if (!range) {
					res.writeHead(416, {
						"content-type": "text/plain; charset=utf-8",
						"content-range": `bytes */${total}`,
					});
					res.end("Range Not Satisfiable");
					return;
				}
				const chunk = body.subarray(range.start, range.end + 1);
				res.writeHead(206, {
					"content-type": contentType,
					"accept-ranges": "bytes",
					"content-range": `bytes ${range.start}-${range.end}/${total}`,
					"content-length": String(chunk.length),
				});
				res.end(req.method === "HEAD" ? undefined : chunk);
				return;
			}

			res.writeHead(200, {
				"content-type": contentType,
				"accept-ranges": "bytes",
				"content-length": String(total),
			});
			res.end(req.method === "HEAD" ? undefined : body);
		} catch {
			res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			res.end("Not found");
		}
	});
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	createProfileServer().listen(port, () =>
		console.log(`profile on http://localhost:${port}`),
	);
}
