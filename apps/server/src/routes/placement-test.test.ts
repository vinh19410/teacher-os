import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import type {
	PlacementContent,
	PlacementPublishIssue,
	PlacementSnapshot,
	PlacementTeacherStateResponse,
} from "@teacher-os/api/placement-test-contracts";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, test } from "vitest";
import {
	buildApp,
	type Db,
	enforceDeclaredSize,
	type MediaByteRange,
	type MediaStore,
	type ServerApp,
} from "../app";

const CORS_ORIGIN = "http://localhost:8001";
const PROFILE_ORIGIN = "http://localhost:8005";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);
interface MemoryMediaStore {
	store: MediaStore;
	objects: Map<string, { bytes: Uint8Array; contentType: string }>;
}

function createMemoryMediaStore(): MemoryMediaStore {
	const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
	const store: MediaStore = {
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
	return { store, objects };
}

function makeContent(audioId: string | null): PlacementContent {
	return {
		bands: [
			{ min: 0, max: 1, cefr: "A1", course: "ielts-foundation" },
			{ min: 2, max: 2, cefr: "B1", course: "ielts-pre" },
		],
		parts: [
			{
				id: "vocab-grammar",
				title: "Vocab + Grammar",
				questions: [
					{
						id: "vg-01",
						kind: "grammar",
						level: "A1",
						prompt: "She ______ to school every morning.",
						options: ["go", "goes", "going", "went"],
						answer: 1,
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
						title: "Đoạn nghe 1",
						questions: [
							{
								id: "l-01",
								level: "A2",
								prompt: "Where is the speaker?",
								options: ["Library", "Station", "Park", "Office"],
								answer: 0,
							},
						],
					},
				],
			},
		],
	};
}
describe("placement-test teacher routes (#515 phase 2)", () => {
	let db: Db;
	let app: ServerApp;
	let memoryStore: MemoryMediaStore;
	let bgTasks: Promise<unknown>[];

	beforeEach(async () => {
		const client = createClient({ url: "file::memory:" });
		const raw = drizzle(client, { schema });
		await migrate(raw, { migrationsFolder: MIGRATIONS_DIR });
		db = raw as unknown as Db;
		memoryStore = createMemoryMediaStore();
		bgTasks = [];

		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Cô Mỹ" },
			{ id: "org-2", name: "Org khác" },
		]);
		await db.insert(schema.user).values([
			{
				id: "u-teacher",
				name: "Cô Mỹ",
				email: "my@test.local",
				role: "teacher",
			},
			{
				id: "u-org2",
				name: "Cô Hoa",
				email: "hoa@test.local",
				role: "teacher",
			},
			{
				id: "u-ta",
				name: "Trợ giảng",
				email: "ta@test.local",
				role: "teacher",
			},
			{
				id: "u-ct",
				name: "GV đứng lớp",
				email: "ct@test.local",
				role: "teacher",
			},
		]);
		await db.insert(schema.membership).values([
			{ id: "m-1", orgId: "org-1", userId: "u-teacher", role: "teacher" },
			{ id: "m-2", orgId: "org-2", userId: "u-org2", role: "teacher" },
			{ id: "m-3", orgId: "org-1", userId: "u-ta", role: "ta" },
			{
				id: "m-4",
				orgId: "org-1",
				userId: "u-ct",
				role: "class_teacher",
			},
		]);

		app = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			leadOrgId: "org-1",
			leadOrigins: [PROFILE_ORIGIN],
			getLibraryAudioStore: () => memoryStore.store,
			runInBackground: (p) => {
				bgTasks.push(p);
			},
			authHandler: async () => new Response("not used", { status: 404 }),
			getSessionUser: async (headers) => {
				const tag = headers.get("x-test-user");
				if (tag === "teacher-1") {
					return { userId: "u-teacher", userName: "Cô Mỹ", role: "teacher" };
				}
				if (tag === "teacher-2") {
					return { userId: "u-org2", userName: "Cô Hoa", role: "teacher" };
				}
				if (tag === "ta-1") {
					return { userId: "u-ta", userName: "Trợ giảng", role: "teacher" };
				}
				if (tag === "ct-1") {
					return { userId: "u-ct", userName: "GV đứng lớp", role: "teacher" };
				}
				return null;
			},
		});
	});

	async function uploadSampleAudio(
		userHeader = "teacher-1",
		content = "ID3-mp3-data",
	) {
		const bytes = new TextEncoder().encode(content);
		const res = await app.request("/api/placement-test/audio", {
			method: "PUT",
			headers: {
				"x-test-user": userHeader,
				origin: CORS_ORIGIN,
				"content-type": "audio/mpeg",
				"content-length": String(bytes.byteLength),
				"x-file-name": encodeURIComponent("clip-1.mp3"),
			},
			body: bytes,
		});
		expect(res.status).toBe(200);
		return (await res.json()) as {
			audioId: string;
			name: string;
			size: number;
			type: string;
		};
	}

	test("chặn ta, class_teacher và request thiếu Origin hợp lệ với 403", async () => {
		for (const userTag of ["ta-1", "ct-1"]) {
			const getRes = await app.request("/api/placement-test", {
				headers: { "x-test-user": userTag },
			});
			expect(getRes.status).toBe(403);

			const putRes = await app.request("/api/placement-test/draft", {
				method: "PUT",
				headers: {
					"x-test-user": userTag,
					origin: CORS_ORIGIN,
					"content-type": "application/json",
				},
				body: JSON.stringify({ revision: 0, content: makeContent(null) }),
			});
			expect(putRes.status).toBe(403);
		}

		const badOriginRes = await app.request("/api/placement-test/draft", {
			method: "PUT",
			headers: {
				"x-test-user": "teacher-1",
				origin: "https://evil.example",
				"content-type": "application/json",
			},
			body: JSON.stringify({ revision: 0, content: makeContent(null) }),
		});
		expect(badOriginRes.status).toBe(403);
	});

	test("CAS: hai PUT cùng revision (kể cả revision = 0) thì cái sau nhận 409; publish sai revision nhận 409", async () => {
		const firstSave = await app.request("/api/placement-test/draft", {
			method: "PUT",
			headers: {
				"x-test-user": "teacher-1",
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ revision: 0, content: makeContent(null) }),
		});
		expect(firstSave.status).toBe(200);
		expect(await firstSave.json()).toEqual({ revision: 1, dirty: true });

		const duplicateZero = await app.request("/api/placement-test/draft", {
			method: "PUT",
			headers: {
				"x-test-user": "teacher-1",
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ revision: 0, content: makeContent(null) }),
		});
		expect(duplicateZero.status).toBe(409);

		const secondSave = await app.request("/api/placement-test/draft", {
			method: "PUT",
			headers: {
				"x-test-user": "teacher-1",
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ revision: 1, content: makeContent(null) }),
		});
		expect(secondSave.status).toBe(200);
		expect(await secondSave.json()).toEqual({ revision: 2, dirty: true });

		const staleSave = await app.request("/api/placement-test/draft", {
			method: "PUT",
			headers: {
				"x-test-user": "teacher-1",
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ revision: 1, content: makeContent(null) }),
		});
		expect(staleSave.status).toBe(409);

		const stalePublish = await app.request("/api/placement-test/publish", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-1",
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ revision: 1 }),
		});
		expect(stalePublish.status).toBe(409);
	});

	test("lưu nháp sau khi phát hành không làm đổi response công khai và bật lại dirty = true", async () => {
		const { audioId } = await uploadSampleAudio("teacher-1");
		const contentV1 = makeContent(audioId);

		const save1 = await app.request("/api/placement-test/draft", {
			method: "PUT",
			headers: {
				"x-test-user": "teacher-1",
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ revision: 0, content: contentV1 }),
		});
		expect(save1.status).toBe(200);

		const pub1 = await app.request("/api/placement-test/publish", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-1",
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ revision: 1 }),
		});
		expect(pub1.status).toBe(200);
		const pubJson = await pub1.json();
		expect(pubJson).toMatchObject({
			publishedVersion: 1,
			revision: 1,
			dirty: false,
		});

		const stateAfterPub = (await (
			await app.request("/api/placement-test", {
				headers: { "x-test-user": "teacher-1" },
			})
		).json()) as PlacementTeacherStateResponse;
		expect(stateAfterPub.dirty).toBe(false);
		expect(stateAfterPub.isLeadOrg).toBe(true);

		const editedDraft = makeContent(audioId);
		editedDraft.parts[0].questions[0]!.prompt = "Câu hỏi chỉ mới lưu nháp";
		const save2 = await app.request("/api/placement-test/draft", {
			method: "PUT",
			headers: {
				"x-test-user": "teacher-1",
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ revision: 1, content: editedDraft }),
		});
		expect(save2.status).toBe(200);

		const publicRes = await app.request("/public/placement-test", {
			headers: { origin: PROFILE_ORIGIN },
		});
		expect(publicRes.status).toBe(200);
		const publicSnapshot = (await publicRes.json()) as PlacementSnapshot;
		expect(publicSnapshot.version).toBe(1);
		expect(publicSnapshot.parts[0].questions[0]?.prompt).toBe(
			"She ______ to school every morning.",
		);

		const stateAfterEdit = (await (
			await app.request("/api/placement-test", {
				headers: { "x-test-user": "teacher-1" },
			})
		).json()) as PlacementTeacherStateResponse;
		expect(stateAfterEdit.dirty).toBe(true);
	});

	test("cô lập đa org: teacher org-2 không đọc được và không publish được audio của org-1; GET audio có CORP same-site", async () => {
		const { audioId } = await uploadSampleAudio("teacher-1", "secret-org1-mp3");

		const ownAudioRes = await app.request(
			`/api/placement-test/audio/${audioId}`,
			{
				headers: { "x-test-user": "teacher-1" },
			},
		);
		expect(ownAudioRes.status).toBe(200);
		expect(ownAudioRes.headers.get("cross-origin-resource-policy")).toBe(
			"same-site",
		);
		expect(await ownAudioRes.text()).toBe("secret-org1-mp3");

		const otherOrgRead = await app.request(
			`/api/placement-test/audio/${audioId}`,
			{
				headers: { "x-test-user": "teacher-2" },
			},
		);
		expect(otherOrgRead.status).toBe(404);

		// Org 2 cố gắn audioId của Org 1 vào nháp và publish -> 422
		await app.request("/api/placement-test/draft", {
			method: "PUT",
			headers: {
				"x-test-user": "teacher-2",
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ revision: 0, content: makeContent(audioId) }),
		});
		const crossOrgPublish = await app.request("/api/placement-test/publish", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-2",
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ revision: 1 }),
		});
		expect(crossOrgPublish.status).toBe(422);
		const body = (await crossOrgPublish.json()) as {
			issues: PlacementPublishIssue[];
		};
		expect(body.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ path: "parts.1.clips.0.audioId" }),
			]),
		);
	});

	test("publish thiếu ngưỡng trả 422 kèm issues; dọn rác D11 giữ audio đang tham chiếu hoặc mới hơn 24h", async () => {
		const { audioId: publishedAudioId } = await uploadSampleAudio(
			"teacher-1",
			"published-audio",
		);
		const { audioId: recentOrphanId } = await uploadSampleAudio(
			"teacher-1",
			"recent-orphan",
		);
		const { audioId: oldOrphanId } = await uploadSampleAudio(
			"teacher-1",
			"old-orphan",
		);

		const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
		await db
			.update(schema.placementTestAudio)
			.set({ createdAt: twoDaysAgo })
			.where(eq(schema.placementTestAudio.id, oldOrphanId));
		await db
			.update(schema.placementTestAudio)
			.set({ createdAt: twoDaysAgo })
			.where(eq(schema.placementTestAudio.id, publishedAudioId));

		// Nháp có ngưỡng sai (chỉ tới 1 trong khi có 2 câu) -> 422
		const badContent = makeContent(publishedAudioId);
		badContent.bands = [
			{ min: 0, max: 1, cefr: "A1", course: "ielts-foundation" },
		];
		await app.request("/api/placement-test/draft", {
			method: "PUT",
			headers: {
				"x-test-user": "teacher-1",
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ revision: 0, content: badContent }),
		});
		const badPub = await app.request("/api/placement-test/publish", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-1",
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ revision: 1 }),
		});
		expect(badPub.status).toBe(422);

		// Sửa lại ngưỡng đúng và publish -> dọn oldOrphanId, giữ publishedAudioId và recentOrphanId
		await app.request("/api/placement-test/draft", {
			method: "PUT",
			headers: {
				"x-test-user": "teacher-1",
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				revision: 1,
				content: makeContent(publishedAudioId),
			}),
		});
		const okPub = await app.request("/api/placement-test/publish", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-1",
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ revision: 2 }),
		});
		expect(okPub.status).toBe(200);
		await Promise.all(bgTasks);

		const remainingRows = await db
			.select({ id: schema.placementTestAudio.id })
			.from(schema.placementTestAudio)
			.where(eq(schema.placementTestAudio.orgId, "org-1"));
		const remainingIds = remainingRows.map((r) => r.id).sort();
		expect(remainingIds).toEqual([publishedAudioId, recentOrphanId].sort());
	});
});
