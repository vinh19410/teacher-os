import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	buildPlacementSnapshot,
	type PlacementContent,
} from "@teacher-os/api/placement-test-contracts";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, test } from "vitest";
import {
	buildApp,
	type Db,
	enforceDeclaredSize,
	type MediaByteRange,
	type MediaStore,
} from "../app";

const CORS_ORIGIN = "http://localhost:8001";
const PROFILE_ORIGIN = "https://msmy.io.vn";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

function createMemoryMediaStore(): MediaStore {
	const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
	return {
		async put(key, body, { contentType, size }) {
			const counted = enforceDeclaredSize(body, size);
			const reader = counted.stream.getReader();
			const chunks: Uint8Array[] = [];
			let total = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) {
					chunks.push(value);
					total += value.byteLength;
				}
			}
			const bytes = new Uint8Array(total);
			let offset = 0;
			for (const chunk of chunks) {
				bytes.set(chunk, offset);
				offset += chunk.byteLength;
			}
			objects.set(key, { bytes, contentType });
		},
		async get(key, range?: MediaByteRange) {
			const found = objects.get(key);
			if (!found) return null;
			const slice = range
				? found.bytes.subarray(range.offset, range.offset + range.length)
				: found.bytes;
			return {
				body: new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(slice);
						controller.close();
					},
				}),
				contentType: found.contentType,
				size: found.bytes.byteLength,
				...(range ? { range } : {}),
			};
		},
		async delete(key) {
			objects.delete(key);
		},
	};
}

describe("public-placement-test routes (#515 phase 2)", () => {
	let db: Db;
	let store: MediaStore;

	beforeEach(async () => {
		const client = createClient({ url: "file::memory:" });
		const raw = drizzle(client, { schema });
		await migrate(raw, { migrationsFolder: MIGRATIONS_DIR });
		db = raw as unknown as Db;
		store = createMemoryMediaStore();

		await db.insert(schema.organization).values([
			{ id: "org-lead", name: "Cô Mỹ" },
			{ id: "org-other", name: "Org khác" },
		]);
	});

	function createAppWithLeadOrg(leadOrgId?: string) {
		return buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			leadOrgId,
			leadOrigins: [PROFILE_ORIGIN],
			getLibraryAudioStore: () => store,
			authHandler: async () => new Response("not used", { status: 404 }),
			getSessionUser: async () => null,
		});
	}

	test("trả 503 khi thiếu leadOrgId và 404 khi chưa phát hành", async () => {
		const disabledApp = createAppWithLeadOrg("");
		const res503 = await disabledApp.request("/public/placement-test", {
			headers: { origin: PROFILE_ORIGIN },
		});
		expect(res503.status).toBe(503);

		const activeApp = createAppWithLeadOrg("org-lead");
		const res404 = await activeApp.request("/public/placement-test", {
			headers: { origin: PROFILE_ORIGIN },
		});
		expect(res404.status).toBe(404);
		expect(res404.headers.get("access-control-allow-origin")).toBe(
			PROFILE_ORIGIN,
		);
	});

	test("trả đúng snapshot đã phát hành kèm CORS origin profile và Cache-Control: no-cache", async () => {
		const audioId = "11111111-1111-4111-8111-111111111111";
		const content: PlacementContent = {
			bands: [{ min: 0, max: 2, cefr: "A2", course: "ielts-first-step" }],
			parts: [
				{
					id: "vocab-grammar",
					title: "Vocab + Grammar",
					questions: [
						{
							id: "vg-01",
							kind: "grammar",
							level: "A1",
							prompt: "Q1",
							options: ["A", "B", "C", "D"],
							answer: 0,
						},
					],
				},
				{
					id: "listening",
					title: "Listening",
					clips: [
						{
							id: "clip-1",
							audioId,
							maxPlays: 2,
							level: "A2",
							title: "Clip 1",
							questions: [
								{
									id: "l-01",
									level: "A2",
									prompt: "L1",
									options: ["A", "B", "C", "D"],
									answer: 1,
								},
							],
						},
					],
				},
			],
		};
		const snapshot = buildPlacementSnapshot(content, 2);

		await db.insert(schema.placementTest).values({
			orgId: "org-lead",
			draft: JSON.stringify(content),
			published: JSON.stringify(snapshot),
			revision: 1,
			publishedRevision: 1,
			publishedVersion: 2,
			publishedAt: new Date(),
			updatedAt: new Date(),
		});

		const app = createAppWithLeadOrg("org-lead");
		const res = await app.request("/public/placement-test", {
			headers: { origin: PROFILE_ORIGIN },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("access-control-allow-origin")).toBe(PROFILE_ORIGIN);
		expect(res.headers.get("cache-control")).toBe("no-cache");
		expect(await res.json()).toEqual(snapshot);
	});

	test("audio công khai hỗ trợ 200, 206 với bytes=0-99, 416 với range ngoài file, và 404 với audio ngoài LEAD_ORG_ID", async () => {
		const leadAudioId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
		const otherAudioId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		const sampleBytes = new Uint8Array(250);
		for (let i = 0; i < sampleBytes.length; i += 1) {
			sampleBytes[i] = i % 256;
		}

		await store.put(
			`placement/org-lead/${leadAudioId}`,
			new ReadableStream({
				start(c) {
					c.enqueue(sampleBytes);
					c.close();
				},
			}),
			{ contentType: "audio/mpeg", size: sampleBytes.byteLength },
		);
		await store.put(
			`placement/org-other/${otherAudioId}`,
			new ReadableStream({
				start(c) {
					c.enqueue(sampleBytes);
					c.close();
				},
			}),
			{ contentType: "audio/mpeg", size: sampleBytes.byteLength },
		);

		await db.insert(schema.placementTestAudio).values([
			{
				id: leadAudioId,
				orgId: "org-lead",
				objectKey: `placement/org-lead/${leadAudioId}`,
				name: "clip-1.mp3",
				contentType: "audio/mpeg",
				size: sampleBytes.byteLength,
				createdAt: new Date(),
			},
			{
				id: otherAudioId,
				orgId: "org-other",
				objectKey: `placement/org-other/${otherAudioId}`,
				name: "clip-other.mp3",
				contentType: "audio/mpeg",
				size: sampleBytes.byteLength,
				createdAt: new Date(),
			},
		]);

		const app = createAppWithLeadOrg("org-lead");

		// 200 full
		const fullRes = await app.request(
			`/public/placement-test/audio/${leadAudioId}`,
			{
				headers: { origin: PROFILE_ORIGIN },
			},
		);
		expect(fullRes.status).toBe(200);
		expect(fullRes.headers.get("accept-ranges")).toBe("bytes");
		expect(fullRes.headers.get("content-length")).toBe("250");
		expect((await fullRes.arrayBuffer()).byteLength).toBe(250);

		// 206 partial bytes=0-99
		const rangeRes = await app.request(
			`/public/placement-test/audio/${leadAudioId}`,
			{
				headers: {
					origin: PROFILE_ORIGIN,
					range: "bytes=0-99",
				},
			},
		);
		expect(rangeRes.status).toBe(206);
		expect(rangeRes.headers.get("content-range")).toBe("bytes 0-99/250");
		expect(rangeRes.headers.get("content-length")).toBe("100");
		expect(rangeRes.headers.get("accept-ranges")).toBe("bytes");
		expect(rangeRes.headers.get("x-content-type-options")).toBe("nosniff");
		expect(rangeRes.headers.get("cache-control")).toBe(
			"public, max-age=31536000, immutable",
		);
		const slice = new Uint8Array(await rangeRes.arrayBuffer());
		expect(slice.byteLength).toBe(100);
		expect([...slice.slice(0, 5)]).toEqual([0, 1, 2, 3, 4]);

		// 416 out-of-bounds range
		const badRangeRes = await app.request(
			`/public/placement-test/audio/${leadAudioId}`,
			{
				headers: {
					origin: PROFILE_ORIGIN,
					range: "bytes=500-600",
				},
			},
		);
		expect(badRangeRes.status).toBe(416);
		expect(badRangeRes.headers.get("content-range")).toBe("bytes */250");

		// 404 audio belonging to another org
		const otherOrgRes = await app.request(
			`/public/placement-test/audio/${otherAudioId}`,
			{
				headers: { origin: PROFILE_ORIGIN },
			},
		);
		expect(otherOrgRes.status).toBe(404);
	});
});
