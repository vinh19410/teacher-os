import {
	placementTest,
	placementTestAudio,
} from "@teacher-os/db/schema/placement-test";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Db } from "../app";
import { parseByteRange } from "../lib/byte-range";
import type { MediaStore } from "../lib/media-store";

export interface PublicPlacementTestRouteDeps {
	getDb(): Db;
	leadOrgId?: string;
	leadOrigins?: string[];
	getLibraryAudioStore?(): MediaStore | undefined;
}

/**
 * Route công khai cho `/kiem-tra-dau-vao/` trên `apps/profile` (#515 Phase 2).
 * Mount ngoài `/api/*` để không qua bootstrap/session; CORS theo `leadOrigins`
 * (không credentials). Audio hỗ trợ HTTP `Range` (`206 Partial Content`) cho
 * Safari iOS.
 */
export function publicPlacementTestRoutes(deps: PublicPlacementTestRouteDeps) {
	const router = new Hono();

	router.use(
		"*",
		cors({
			origin: deps.leadOrigins ?? [],
			allowMethods: ["GET", "OPTIONS"],
			allowHeaders: ["Range"],
			exposeHeaders: ["Accept-Ranges", "Content-Range", "Content-Length"],
			maxAge: 600,
		}),
	);

	router.get("/", async (c) => {
		const leadOrgId = deps.leadOrgId?.trim() ?? "";
		if (!leadOrgId) {
			return c.json(
				{ error: "PLACEMENT_DISABLED", code: "PLACEMENT_DISABLED" },
				503,
			);
		}

		const [row] = await deps
			.getDb()
			.select({ published: placementTest.published })
			.from(placementTest)
			.where(eq(placementTest.orgId, leadOrgId));

		if (!row || row.published === null) {
			return c.json(
				{ error: "PLACEMENT_NOT_PUBLISHED", code: "PLACEMENT_NOT_PUBLISHED" },
				404,
			);
		}

		return new Response(row.published, {
			status: 200,
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				"Cache-Control": "no-cache",
			},
		});
	});

	router.get("/audio/:id", async (c) => {
		const leadOrgId = deps.leadOrgId?.trim() ?? "";
		if (!leadOrgId) {
			return c.json(
				{ error: "PLACEMENT_DISABLED", code: "PLACEMENT_DISABLED" },
				503,
			);
		}

		const store = deps.getLibraryAudioStore?.();
		if (!store) {
			return c.json(
				{ error: "PLACEMENT_AUDIO_DISABLED", code: "PLACEMENT_AUDIO_DISABLED" },
				503,
			);
		}

		const audioId = c.req.param("id") ?? "";
		if (!audioId) {
			return c.json({ error: "not found" }, 404);
		}

		const [row] = await deps
			.getDb()
			.select()
			.from(placementTestAudio)
			.where(
				and(
					eq(placementTestAudio.id, audioId),
					eq(placementTestAudio.orgId, leadOrgId),
				),
			);

		if (!row) {
			return c.json({ error: "not found" }, 404);
		}

		const total = row.size;
		const rangeHeader = c.req.header("Range");
		let requestedRange: { start: number; end: number } | null = null;

		if (
			typeof rangeHeader === "string" &&
			rangeHeader.trim().startsWith("bytes=") &&
			!rangeHeader.includes(",")
		) {
			requestedRange = parseByteRange(rangeHeader, total);
			if (!requestedRange) {
				return new Response("Range Not Satisfiable", {
					status: 416,
					headers: {
						"Content-Type": "text/plain; charset=utf-8",
						"Content-Range": `bytes */${total}`,
						"Accept-Ranges": "bytes",
						"X-Content-Type-Options": "nosniff",
						"Content-Security-Policy": "default-src 'none'; sandbox",
					},
				});
			}
		}

		const object = await store.get(
			row.objectKey,
			requestedRange
				? {
						offset: requestedRange.start,
						length: requestedRange.end - requestedRange.start + 1,
					}
				: undefined,
		);

		if (!object) {
			return c.json({ error: "not found" }, 404);
		}

		const commonHeaders: Record<string, string> = {
			"Content-Type": row.contentType || object.contentType,
			"Accept-Ranges": "bytes",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "default-src 'none'; sandbox",
			"Cache-Control": "public, max-age=31536000, immutable",
		};

		if (requestedRange && object.range) {
			return new Response(object.body, {
				status: 206,
				headers: {
					...commonHeaders,
					"Content-Range": `bytes ${requestedRange.start}-${requestedRange.end}/${total}`,
					"Content-Length": String(object.range.length),
				},
			});
		}

		return new Response(object.body, {
			status: 200,
			headers: {
				...commonHeaders,
				"Content-Length": String(total),
			},
		});
	});

	return router;
}
