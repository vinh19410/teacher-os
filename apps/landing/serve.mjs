import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = new URL("./public", import.meta.url).pathname;
const port = Number(process.env.PORT) || 8002;
const types = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
};

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
		res.end(body);
	} catch {
		res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
		res.end("Not found");
	}
}).listen(port, () => console.log(`landing on http://localhost:${port}`));
