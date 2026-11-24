import { Hono } from "hono";
import type { AppDeps } from "../app";

const IMAGE_FILENAME_RE = /^[a-zA-Z0-9_-]{1,128}\.(png|jpg|jpeg|webp|gif)$/;

const IMAGE_MIME_BY_EXT: Readonly<Record<string, string>> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
};

export const LIBRARY_IMAGE_R2_PREFIX = "library-images/";

/**
 * Public read-only endpoint serving re-hosted library map/diagram images from R2
 * (`LIBRARY_AUDIO` bucket under `library-images/`). Mounted outside `/api/*` so
 * `<img>` elements on every portal (`/admin`, `/teacher`, `/student`) load directly
 * without cookies or third-party host dependencies.
 */
export function publicLibraryImagesRoutes(
	deps: Pick<AppDeps, "getLibraryAudioStore">,
) {
	const router = new Hono();

	router.get("/:filename", async (c) => {
		const filename = c.req.param("filename");
		const match = IMAGE_FILENAME_RE.exec(filename);
		if (!match) {
			return c.json({ error: "invalid image filename" }, 400);
		}
		const ext = match[1]?.toLowerCase() ?? "";
		const contentType = IMAGE_MIME_BY_EXT[ext];
		if (!contentType) {
			return c.json({ error: "unsupported image type" }, 400);
		}

		const store = deps.getLibraryAudioStore?.();
		if (!store) {
			return c.json({ error: "image store unavailable" }, 503);
		}

		const object = await store.get(`${LIBRARY_IMAGE_R2_PREFIX}${filename}`);
		if (!object) {
			return c.json({ error: "image not found" }, 404);
		}

		const headers = new Headers({
			"Content-Type": contentType,
			"Cache-Control": "public, max-age=31536000, immutable",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "default-src 'none'; sandbox",
			"Cross-Origin-Resource-Policy": "cross-origin",
			"Referrer-Policy": "no-referrer",
		});
		if (object.size > 0) {
			headers.set("Content-Length", String(object.size));
		}

		return new Response(object.body, { status: 200, headers });
	});

	return router;
}
