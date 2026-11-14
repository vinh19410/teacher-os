import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	buildPlacementSnapshot,
	type PlacementContent,
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
} from "../app";
import { PLACEMENT_SUBMISSION_IP_MAX } from "./public-placement-test";

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

function validWebmBytes(): Uint8Array {
	return new Uint8Array([
		0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84,
		0x77, 0x65, 0x62, 0x6d, 0x00, 0x00,
	]);
}

function makeSampleContent(
	audioId = "11111111-1111-4111-8111-111111111111",
): PlacementContent {
	return {
		bands: [
			{
				min: 0,
				max: 29,
				cefr: "Pre-A1",
				course: "foundation-core",
				displayCourse: "Chưa đủ nền cho Level 1",
				advice: "Học nền tảng.",
			},
			{
				min: 30,
				max: 54,
				cefr: "A1",
				course: "comm-1",
				displayCourse: "Communication English Level 1",
				advice: "Học trọn khoá Level 1.",
			},
			{
				min: 55,
				max: 100,
				cefr: "B1 trở lên",
				course: "comm-2",
				displayCourse: "Communication English Level 2",
				advice: "Học Level 2.",
			},
		],
		parts: [
			{
				id: "listening",
				title: "Listening",
				clips: [
					{
						id: "clip-la",
						partLabel: "Part 1",
						instruction: "Choose.",
						title: "Clip 1",
						notesTitle: "",
						transcript: "",
						audioId,
						maxPlays: 2,
						level: "A2",
						questions: [
							{
								id: "l-01",
								type: "mcq",
								level: "A2",
								prompt: "L1",
								options: ["A", "B", "C"],
								answer: 1,
							},
							{
								id: "l-e1",
								type: "gap",
								level: "A2",
								prompt: "Price: $ ____",
								accept: ["240", "twohundredforty"],
							},
						],
					},
				],
			},
			{
				id: "vocab-grammar",
				title: "Grammar & Vocabulary",
				questions: [
					{
						id: "vg-01",
						kind: "grammar",
						level: "A1",
						prompt: "Q1",
						options: ["A", "B", "C"],
						answer: 0,
					},
				],
			},
			{
				id: "reading",
				title: "Reading",
				passages: [
					{
						id: "ra",
						partLabel: "Part 1",
						kind: "sign",
						instruction: "Choose.",
						title: "SIGN",
						body: "CLOSED MONDAY",
						questions: [
							{
								id: "r-a1",
								level: "A1",
								prompt: "",
								options: ["Open", "Closed", "Free"],
								answer: 1,
							},
						],
					},
				],
			},
			{
				id: "writing",
				title: "Writing",
				promptTitle: "Email",
				promptBody: "Write to friend.",
				minWords: 50,
				maxWords: 80,
			},
			{
				id: "speaking",
				title: "Speaking",
				tasks: [
					{
						id: "s-01",
						partLabel: "Part 1",
						level: "A1",
						prompt: "Name?",
						prepSeconds: 5,
						answerSeconds: 20,
					},
				],
			},
		],
	};
}

describe("public-placement-test routes (#515, #721)", () => {
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
			leadIpSecret: "test-secret",
			getLibraryAudioStore: () => store,
			getMediaStore: () => store,
			authHandler: async () => new Response("not used", { status: 404 }),
			getSessionUser: async () => null,
		});
	}

	async function seedPublishedOrgLead() {
		const snapshot = buildPlacementSnapshot(makeSampleContent(), 2);
		await db.insert(schema.placementTest).values({
			orgId: "org-lead",
			draft: JSON.stringify(makeSampleContent()),
			published: JSON.stringify(snapshot),
			revision: 1,
			publishedRevision: 1,
			publishedVersion: 2,
			publishedAt: new Date(),
			updatedAt: new Date(),
		});
		return snapshot;
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
		const snapshot = await seedPublishedOrgLead();
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

		const otherOrgRes = await app.request(
			`/public/placement-test/audio/${otherAudioId}`,
			{
				headers: { origin: PROFILE_ORIGIN },
			},
		);
		expect(otherOrgRes.status).toBe(404);
	});

	test("POST /submissions chấm điểm tự động chuẩn, liên kết Lead theo SĐT 24h, chặn Origin lạ và rate limit", async () => {
		await seedPublishedOrgLead();
		const app = createAppWithLeadOrg("org-lead");

		const badOrigin = await app.request("/public/placement-test/submissions", {
			method: "POST",
			headers: {
				origin: "https://evil.example",
				"content-type": "application/json",
			},
			body: JSON.stringify({}),
		});
		expect(badOrigin.status).toBe(403);

		const res = await app.request("/public/placement-test/submissions", {
			method: "POST",
			headers: {
				origin: PROFILE_ORIGIN,
				"content-type": "application/json",
				"cf-connecting-ip": "1.2.3.4",
			},
			body: JSON.stringify({
				lead: { name: "Nguyễn Minh", phone: "0901234567" },
				answers: {
					listening: { "l-01": 1, "l-e1": "$240" },
					vocabGrammar: { "vg-01": 0 },
					reading: { "r-a1": 1 },
				},
				writingText: "Hi Anna, I live in District 9 now.",
				speakingMode: "upload",
				speakingDurationSec: 42,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			submissionId: string;
			leadId: string;
			uploadToken: string | null;
			speakingStatus: string;
			objective: {
				listening: { correct: number; total: number };
				vocabGrammar: { correct: number; total: number };
				reading: { correct: number; total: number };
				averagePct: number;
				provisionalBand: { cefr: string };
				provisionalSummary: string;
			};
		};
		expect(body.uploadToken).toBeTruthy();
		expect(body.speakingStatus).toBe("pending_upload");
		expect(body.objective.listening).toMatchObject({ correct: 2, total: 2 });
		expect(body.objective.vocabGrammar).toMatchObject({ correct: 1, total: 1 });
		expect(body.objective.reading).toMatchObject({ correct: 1, total: 1 });
		expect(body.objective.averagePct).toBe(100);
		expect(body.objective.provisionalSummary).toContain("Tạm tính B1 trở lên");

		const [leadRow] = await db
			.select()
			.from(schema.lead)
			.where(eq(schema.lead.id, body.leadId));
		expect(leadRow?.source).toBe("placement-test");
		expect(leadRow?.placement).toBe(body.objective.provisionalSummary);

		// Rate limit sau PLACEMENT_SUBMISSION_IP_MAX lần từ cùng IP
		for (let i = 1; i < PLACEMENT_SUBMISSION_IP_MAX; i += 1) {
			const okRes = await app.request("/public/placement-test/submissions", {
				method: "POST",
				headers: {
					origin: PROFILE_ORIGIN,
					"content-type": "application/json",
					"cf-connecting-ip": "1.2.3.4",
				},
				body: JSON.stringify({
					lead: { name: "Nguyễn Minh", phone: "0901234567" },
					answers: { listening: {}, vocabGrammar: {}, reading: {} },
					writingText: "",
					speakingMode: "skipped",
				}),
			});
			expect(okRes.status).toBe(201);
			const nextBody = (await okRes.json()) as { leadId: string };
			expect(nextBody.leadId).toBe(body.leadId);
		}

		const cappedRes = await app.request("/public/placement-test/submissions", {
			method: "POST",
			headers: {
				origin: PROFILE_ORIGIN,
				"content-type": "application/json",
				"cf-connecting-ip": "1.2.3.4",
			},
			body: JSON.stringify({
				lead: { name: "Spammer", phone: "0909998888" },
				answers: { listening: {}, vocabGrammar: {}, reading: {} },
				writingText: "",
				speakingMode: "none",
			}),
		});
		expect(cappedRes.status).toBe(429);
	});

	test("PUT /submissions/:id/speaking-media kiểm tra uploadToken dùng 1 lần, từ chối sai magic bytes và chấp nhận WebM thật", async () => {
		await seedPublishedOrgLead();
		const app = createAppWithLeadOrg("org-lead");

		const subRes = await app.request("/public/placement-test/submissions", {
			method: "POST",
			headers: {
				origin: PROFILE_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				lead: { name: "Lê Bảo", phone: "0912345678" },
				answers: { listening: {}, vocabGrammar: {}, reading: {} },
				writingText: "",
				speakingMode: "upload",
				speakingDurationSec: 30,
			}),
		});
		const { submissionId, uploadToken } = (await subRes.json()) as {
			submissionId: string;
			uploadToken: string;
		};

		// Fake HTML masquerading as WebM -> 415
		const fakeHtml = new TextEncoder().encode(
			"<html><script>1</script></html>",
		);
		const badMagic = await app.request(
			`/public/placement-test/submissions/${submissionId}/speaking-media`,
			{
				method: "PUT",
				headers: {
					origin: PROFILE_ORIGIN,
					"x-upload-token": uploadToken,
					"x-media-filename": "speaking.webm",
					"content-type": "video/webm",
					"content-length": String(fakeHtml.byteLength),
				},
				body: fakeHtml,
			},
		);
		expect(badMagic.status).toBe(415);

		// Token sai -> 401
		const webm = validWebmBytes();
		const wrongTok = await app.request(
			`/public/placement-test/submissions/${submissionId}/speaking-media`,
			{
				method: "PUT",
				headers: {
					origin: PROFILE_ORIGIN,
					"x-upload-token": "wrong-token",
					"x-media-filename": "speaking.webm",
					"content-type": "video/webm",
					"content-length": String(webm.byteLength),
				},
				body: webm,
			},
		);
		expect(wrongTok.status).toBe(401);

		// Hợp lệ -> 200 & hủy uploadTokenHash
		const okUpload = await app.request(
			`/public/placement-test/submissions/${submissionId}/speaking-media`,
			{
				method: "PUT",
				headers: {
					origin: PROFILE_ORIGIN,
					"x-upload-token": uploadToken,
					"x-media-filename": "speaking.webm",
					"content-type": "video/webm;codecs=vp8,opus",
					"content-length": String(webm.byteLength),
				},
				body: webm,
			},
		);
		expect(okUpload.status).toBe(200);

		// Dùng lại token đã dùng -> 401
		const reuseTok = await app.request(
			`/public/placement-test/submissions/${submissionId}/speaking-media`,
			{
				method: "PUT",
				headers: {
					origin: PROFILE_ORIGIN,
					"x-upload-token": uploadToken,
					"x-media-filename": "speaking.webm",
					"content-type": "video/webm",
					"content-length": String(webm.byteLength),
				},
				body: webm,
			},
		);
		expect(reuseTok.status).toBe(401);
	});

	test("GET / và POST /submissions nâng cấp an toàn snapshot published v1 cũ trong D1", async () => {
		const v1Published = {
			version: 1,
			bands: [
				{
					min: 0,
					max: 1,
					cefr: "A1",
					course: "comm-1",
					courseLabel: "Giao tiếp 1",
				},
				{
					min: 2,
					max: 2,
					cefr: "B1",
					course: "comm-3",
					courseLabel: "Giao tiếp 3",
				},
			],
			parts: [
				{
					id: "vocab-grammar",
					title: "Vocab + Grammar",
					questions: [
						{
							id: "v1-vg-1",
							kind: "grammar",
							level: "A1",
							prompt: "I ____ a student.",
							options: ["am", "is", "are", "be"],
							answer: 0,
						},
					],
				},
				{
					id: "listening",
					title: "Listening",
					clips: [
						{
							id: "clip-v1",
							src: "/public/placement-test/audio/11111111-1111-4111-8111-111111111111",
							maxPlays: 2,
							level: "A1",
							title: "Old Clip",
							questions: [
								{
									id: "v1-l-1",
									level: "A1",
									prompt: "Who called?",
									options: ["Tom", "Anna", "Lee", "Sam"],
									answer: 1,
								},
							],
						},
					],
				},
			],
		};

		await db.insert(schema.placementTest).values({
			orgId: "org-lead",
			draft: null,
			published: JSON.stringify(v1Published),
			revision: 1,
			publishedRevision: 1,
			publishedVersion: 1,
			publishedAt: new Date(),
			updatedAt: new Date(),
		});

		const app = createAppWithLeadOrg("org-lead");
		const getRes = await app.request("/public/placement-test", {
			headers: { origin: PROFILE_ORIGIN },
		});
		expect(getRes.status).toBe(200);
		const served = (await getRes.json()) as {
			parts: Array<{ id: string }>;
			bands: Array<{ min: number; max: number }>;
		};
		expect(served.parts.map((p) => p.id)).toEqual([
			"listening",
			"vocab-grammar",
			"reading",
			"writing",
			"speaking",
		]);
		expect(served.bands[served.bands.length - 1]?.max).toBe(100);

		const subRes = await app.request("/public/placement-test/submissions", {
			method: "POST",
			headers: {
				origin: PROFILE_ORIGIN,
				"content-type": "application/json",
				"cf-connecting-ip": "5.6.7.8",
			},
			body: JSON.stringify({
				lead: { name: "Học viên V1", phone: "0908887766" },
				answers: {
					listening: { "v1-l-1": 1 },
					vocabGrammar: { "v1-vg-1": 0 },
					reading: {},
				},
				writingText: "",
				speakingMode: "none",
			}),
		});
		expect(subRes.status).toBe(201);
		const subBody = (await subRes.json()) as {
			objective: { averagePct: number; provisionalBand: { cefr: string } };
		};
		expect(subBody.objective.averagePct).toBe(100);
		expect(subBody.objective.provisionalBand.cefr).toBe("B1");
	});

	test("POST /submissions tạo Lead mới khi Lead trùng SĐT trong 24h đã có bài chấm chính thức (status=graded)", async () => {
		const snapshot = await seedPublishedOrgLead();
		const now = new Date();
		const existingLeadId = "lead-graded-existing";
		await db.insert(schema.lead).values({
			id: existingLeadId,
			orgId: "org-lead",
			name: "Trần Hoa",
			phone: "0907776655",
			email: "hoa@example.com",
			birthDate: "",
			course: "comm-1",
			studyMode: "",
			studyDays: "",
			timeSlot: "",
			note: "Đã tư vấn xong",
			placement: "A2 (71%) — Communication English Level 1",
			teacherNote: "",
			source: "placement-test",
			status: "contacted",
			ipHash: "old-ip",
			submitCount: 1,
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(schema.placementTestSubmission).values({
			id: "sub-graded-existing",
			orgId: "org-lead",
			leadId: existingLeadId,
			testVersion: 2,
			snapshotJson: JSON.stringify(snapshot),
			answersJson: JSON.stringify({
				listening: {},
				vocabGrammar: {},
				reading: {},
			}),
			objectiveBreakdownJson: JSON.stringify({}),
			status: "graded",
			finalBandLevel: "A2",
			finalCourse: "comm-1",
			finalDisplayCourse: "Communication English Level 1",
			finalScorePct: 71,
			gradedBy: "teacher-1",
			gradedAt: now,
			submittedAt: now,
			updatedAt: now,
		});

		const app = createAppWithLeadOrg("org-lead");
		const retakeRes = await app.request("/public/placement-test/submissions", {
			method: "POST",
			headers: {
				origin: PROFILE_ORIGIN,
				"content-type": "application/json",
				"cf-connecting-ip": "9.8.7.6",
			},
			body: JSON.stringify({
				lead: { name: "Trần Hoa", phone: "0907776655", note: "Làm lại" },
				answers: { listening: {}, vocabGrammar: {}, reading: {} },
				writingText: "",
				speakingMode: "none",
			}),
		});
		expect(retakeRes.status).toBe(201);
		const retakeBody = (await retakeRes.json()) as { leadId: string };
		expect(retakeBody.leadId).not.toBe(existingLeadId);

		const [originalLead] = await db
			.select()
			.from(schema.lead)
			.where(eq(schema.lead.id, existingLeadId));
		expect(originalLead?.placement).toBe(
			"A2 (71%) — Communication English Level 1",
		);
		expect(originalLead?.course).toBe("comm-1");
		expect(originalLead?.note).toBe("Đã tư vấn xong");
	});
});
