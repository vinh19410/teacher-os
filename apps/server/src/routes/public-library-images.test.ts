import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { MediaStore } from "../lib/media-store";
import { LIBRARY_IMAGE_R2_PREFIX } from "./public-library-images";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

describe("GET /public/library-images/:filename", () => {
	let app: ServerApp;
	let appWithoutStore: ServerApp;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const drizzleDb = drizzle(client, { schema });
		await migrate(drizzleDb, { migrationsFolder: MIGRATIONS_DIR });
		const db = drizzleDb as unknown as Db;

		const pngBytes = new Uint8Array([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		]);
		const objects = new Map<string, { bytes: Uint8Array; contentType: string }>(
			[
				[
					`${LIBRARY_IMAGE_R2_PREFIX}map-test-1.png`,
					{ bytes: pngBytes, contentType: "image/png" },
				],
			],
		);
		const store: MediaStore = {
			async put(key, body, meta) {
				const bytes = new Uint8Array(await new Response(body).arrayBuffer());
				objects.set(key, { bytes, contentType: meta.contentType });
			},
			async get(key) {
				const obj = objects.get(key);
				if (!obj) return null;
				return {
					body: new Response(obj.bytes).body as ReadableStream,
					contentType: obj.contentType,
					size: obj.bytes.byteLength,
				};
			},
			async delete(key) {
				objects.delete(key);
			},
		};

		app = buildApp({
			getDb: () => db,
			corsOrigin: ["http://localhost:8001"],
			getLibraryAudioStore: () => store,
			getSessionUser: async () => null,
			authHandler: () => new Response("ok"),
		});
		appWithoutStore = buildApp({
			getDb: () => db,
			corsOrigin: ["http://localhost:8001"],
			getSessionUser: async () => null,
			authHandler: () => new Response("ok"),
		});
	});

	test("serves stored PNG image with immutable cache and safe headers", async () => {
		const res = await app.request("/public/library-images/map-test-1.png");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/png");
		expect(res.headers.get("cache-control")).toContain("immutable");
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
		expect(res.headers.get("content-security-policy")).toContain("sandbox");
		expect(res.headers.get("cross-origin-resource-policy")).toBe(
			"cross-origin",
		);
		const body = new Uint8Array(await res.arrayBuffer());
		expect(body.byteLength).toBe(8);
	});

	test("rejects disallowed extensions (e.g. svg, html) and invalid filenames", async () => {
		for (const bad of ["evil.svg", "x.html", "bad%20name.png", ".hidden.png"]) {
			const res = await app.request(`/public/library-images/${bad}`);
			expect(res.status).toBe(400);
		}
	});

	test("returns 404 for missing image and 503 when store is absent", async () => {
		const missing = await app.request("/public/library-images/missing-id.png");
		expect(missing.status).toBe(404);

		const unavailable = await appWithoutStore.request(
			"/public/library-images/map-test-1.png",
		);
		expect(unavailable.status).toBe(503);
	});
});
