import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("./public", import.meta.url).pathname;
const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
const rootIndexFile = join(root, "index.html");
const testIndexFile = join(root, "kiem-tra-dau-vao", "index.html");
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

const STUDENT_PORTAL_TAG_RE = /<a\b[^>]*\bid="studentPortalLink"[^>]*>/g;

function normalizeStudentPortalUrl(studentPortalUrl) {
	const trimmed = String(studentPortalUrl ?? "").trim();
	if (!trimmed) return "";

	let parsed;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error(`Invalid STUDENT_PORTAL_URL: ${trimmed}`);
	}
	if (
		(parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
		parsed.username ||
		parsed.password
	) {
		throw new Error(
			`Invalid STUDENT_PORTAL_URL (must be http/https without credentials): ${trimmed}`,
		);
	}
	return trimmed;
}

export function replaceStudentPortalHref(html, studentPortalUrl) {
	const trimmed = normalizeStudentPortalUrl(studentPortalUrl);
	if (!trimmed) return html;

	const matches = html.match(STUDENT_PORTAL_TAG_RE) ?? [];
	if (matches.length !== 1 || !/\bhref="[^"]*"/.test(matches[0])) {
		throw new Error(
			`Expected exactly one <a id="studentPortalLink" href="..."> in HTML (found ${matches.length})`,
		);
	}

	const escapedHref = `href="${escapeAttr(trimmed)}"`;
	return html.replace(STUDENT_PORTAL_TAG_RE, (tag) =>
		tag.replace(/\bhref="[^"]*"/, () => escapedHref),
	);
}

export function createProfileServer(
	leadApiUrl = process.env.LEAD_API_URL || "http://localhost:8000",
	// Use ?? (not ||) so explicit STUDENT_PORTAL_URL="" preserves the HTML prod default (#560).
	studentPortalUrl = process.env.STUDENT_PORTAL_URL ?? "http://localhost:8003",
) {
	const validatedStudentPortalUrl = normalizeStudentPortalUrl(studentPortalUrl);
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

			const isRootIndex = file.toLowerCase() === rootIndexFile.toLowerCase();
			const isTestIndex = file.toLowerCase() === testIndexFile.toLowerCase();
			if (isRootIndex || isTestIndex) {
				const raw = await readFile(file, "utf8");
				const withLeadApi = replaceLeadApiMeta(raw, leadApiUrl);
				const rendered = isRootIndex
					? replaceStudentPortalHref(withLeadApi, validatedStudentPortalUrl)
					: withLeadApi;
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

			res.writeHead(200, {
				"content-type": contentType,
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
