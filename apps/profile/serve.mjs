import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("./public", import.meta.url).pathname;
const port = Number(process.env.PORT) || 8005;
const types = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
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

export function createProfileServer(
	leadApiUrl = process.env.LEAD_API_URL || "http://localhost:8000",
) {
	return createServer(async (req, res) => {
		const pathname = normalize(
			decodeURIComponent(new URL(req.url, "http://localhost").pathname),
		);
		const file = join(root, pathname === "/" ? "index.html" : pathname);
		if (!file.startsWith(root)) {
			res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
			res.end("Forbidden");
			return;
		}
		try {
			if (file.endsWith("/index.html")) {
				const raw = await readFile(file, "utf8");
				const rendered = replaceLeadApiMeta(raw, leadApiUrl);
				res.writeHead(200, { "content-type": types[".html"] });
				res.end(rendered);
				return;
			}
			const body = await readFile(file);
			res.writeHead(200, {
				"content-type": types[extname(file)] ?? "application/octet-stream",
			});
			res.end(body);
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
