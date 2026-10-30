import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = new URL("./public", import.meta.url).pathname;
const port = Number(process.env.PORT) || 8005;
// API mà form lead POST tới (#506): dev mặc định localhost:8000; e2e/deploy
// override bằng LEAD_API_URL. Content gốc trong index.html là prod default
// (dùng khi file phục vụ tĩnh không qua serve.mjs).
const LEAD_API_URL = process.env.LEAD_API_URL || "http://localhost:8000";
const LEAD_API_META_RE = /(<meta\s+name="lead-api"\s+content=")[^"]*(")/;
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

/** Thay content của meta lead-api trước khi trả index.html. */
function applyLeadApi(html) {
	return html.replace(LEAD_API_META_RE, `$1${LEAD_API_URL}$2`);
}

createServer(async (req, res) => {
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
		const body = await readFile(file);
		res.writeHead(200, {
			"content-type": types[extname(file)] ?? "application/octet-stream",
		});
		if (extname(file) === ".html") {
			res.end(applyLeadApi(body.toString("utf8")));
		} else {
			res.end(body);
		}
	} catch {
		res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
		res.end("Not found");
	}
}).listen(port, () => console.log(`profile on http://localhost:${port}`));
