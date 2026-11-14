import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import type { LeadListResponse } from "@teacher-os/api/lead-contracts";
import {
	buildPlacementSnapshot,
	type PlacementContent,
	type PlacementSubmissionDetail,
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

function makeSampleContent(): PlacementContent {
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
				advice: "Học Level 1.",
			},
			{
				min: 55,
				max: 67,
				cefr: "A2",
				course: "comm-1",
				displayCourse: "Communication English Level 1",
				advice: "Chắc nền A2.",
			},
			{
				min: 68,
				max: 84,
				cefr: "A2+ / B1 thấp",
				course: "comm-2",
				displayCourse: "Communication English Level 2",
				advice: "Học Level 2.",
			},
			{
				min: 85,
				max: 100,
				cefr: "B1 trở lên",
				course: "comm-3",
				displayCourse: "Vượt Level 2",
				advice: "Học B1+.",
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
						instruction: "Listen.",
						title: "Clip 1",
						notesTitle: "",
						transcript: "",
						audioId: "11111111-1111-4111-8111-111111111111",
						maxPlays: 2,
						level: "A1",
						questions: [
							{
								id: "l-a1",
								type: "mcq",
								level: "A1",
								prompt: "What time?",
								options: ["7:00", "7:15", "7:45"],
								answer: 1,
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
						id: "gv-01",
						kind: "grammar",
						level: "A1",
						prompt: "My sister ___ a nurse.",
						options: ["am", "is", "are"],
						answer: 1,
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
						title: "POOL",
						body: "POOL CLOSED MONDAY",
						questions: [
							{
								id: "r-a1",
								level: "A1",
								prompt: "",
								options: ["Open", "Closed Monday", "Free"],
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
				promptBody: "Write an email.",
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

describe("leads placement-submission routes (#721)", () => {
	let db: Db;
	let store: MediaStore;
	let app: ServerApp;
	let leadId: string;

	beforeEach(async () => {
		const client = createClient({ url: "file::memory:" });
		const raw = drizzle(client, { schema });
		await migrate(raw, { migrationsFolder: MIGRATIONS_DIR });
		db = raw as unknown as Db;
		store = createMemoryMediaStore();

		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Cô Mỹ" },
			{ id: "org-2", name: "Org khác" },
		]);
		await db.insert(schema.user).values([
			{
				id: "u-t1",
				name: "Cô Mỹ",
				email: "my@test.local",
				role: "teacher",
			},
			{
				id: "u-t2",
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
		]);
		await db.insert(schema.membership).values([
			{ id: "m-1", orgId: "org-1", userId: "u-t1", role: "teacher" },
			{ id: "m-2", orgId: "org-2", userId: "u-t2", role: "teacher" },
			{ id: "m-3", orgId: "org-1", userId: "u-ta", role: "ta" },
		]);

		const snapshot = buildPlacementSnapshot(makeSampleContent(), 1);
		await db.insert(schema.placementTest).values({
			orgId: "org-1",
			draft: JSON.stringify(makeSampleContent()),
			published: JSON.stringify(snapshot),
			revision: 1,
			publishedRevision: 1,
			publishedVersion: 1,
			publishedAt: new Date(),
			updatedAt: new Date(),
		});

		app = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			leadOrgId: "org-1",
			leadOrigins: [PROFILE_ORIGIN],
			leadIpSecret: "secret",
			getMediaStore: () => store,
			authHandler: async () => new Response("unused", { status: 404 }),
			getSessionUser: async (headers) => {
				const tag = headers.get("x-test-user");
				if (tag === "t1") {
					return { userId: "u-t1", userName: "Cô Mỹ", role: "teacher" };
				}
				if (tag === "t2") {
					return { userId: "u-t2", userName: "Cô Hoa", role: "teacher" };
				}
				if (tag === "ta") {
					return { userId: "u-ta", userName: "Trợ giảng", role: "teacher" };
				}
				return null;
			},
		});

		const submitRes = await app.request("/public/placement-test/submissions", {
			method: "POST",
			headers: {
				origin: PROFILE_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				lead: { name: "Học viên A", phone: "0905556677" },
				answers: {
					listening: { "l-a1": 1 },
					vocabGrammar: { "gv-01": 1 },
					reading: { "r-a1": 1 },
				},
				writingText:
					"Hi Ben, I live in District 9 with my sister. On weekends I go cycling and drink coffee.",
				speakingMode: "upload",
				speakingDurationSec: 55,
			}),
		});
		const created = (await submitRes.json()) as {
			submissionId: string;
			leadId: string;
			uploadToken: string;
		};
		leadId = created.leadId;

		const webm = new Uint8Array([
			0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84,
			0x77, 0x65, 0x62, 0x6d, 0x11, 0x22, 0x33, 0x44,
		]);
		const putMedia = await app.request(
			`/public/placement-test/submissions/${created.submissionId}/speaking-media`,
			{
				method: "PUT",
				headers: {
					origin: PROFILE_ORIGIN,
					"x-upload-token": created.uploadToken,
					"x-media-filename": "speaking.webm",
					"content-type": "video/webm",
					"content-length": String(webm.byteLength),
				},
				body: webm,
			},
		);
		expect(putMedia.status).toBe(200);
	});

	test("chặn ta (403) và cô lập IDOR khác org (404); trả submission + media Range 206 kèm CORP/CSP", async () => {
		const taRes = await app.request(
			`/api/leads/${leadId}/placement-submission`,
			{
				headers: { "x-test-user": "ta" },
			},
		);
		expect(taRes.status).toBe(403);

		const idorRes = await app.request(
			`/api/leads/${leadId}/placement-submission`,
			{
				headers: { "x-test-user": "t2" },
			},
		);
		expect(idorRes.status).toBe(404);

		const idorMedia = await app.request(
			`/api/leads/${leadId}/placement-submission/media`,
			{
				headers: { "x-test-user": "t2" },
			},
		);
		expect(idorMedia.status).toBe(404);

		const listRes = await app.request("/api/leads", {
			headers: { "x-test-user": "t1" },
		});
		expect(listRes.status).toBe(200);
		const list = (await listRes.json()) as LeadListResponse;
		const row = list.rows.find((r) => r.id === leadId);
		expect(row?.hasPlacementSubmission).toBe(true);
		expect(row?.placementSubmissionStatus).toBe("pending_grading");

		const detailRes = await app.request(
			`/api/leads/${leadId}/placement-submission`,
			{
				headers: { "x-test-user": "t1" },
			},
		);
		expect(detailRes.status).toBe(200);
		const detail = (await detailRes.json()) as PlacementSubmissionDetail;
		expect(detail.speakingStatus).toBe("uploaded");
		expect(detail.speakingMediaUrl).toBe(
			`/api/leads/${leadId}/placement-submission/media`,
		);
		expect(detail.writingWordCount).toBe(18);

		const rangeMedia = await app.request(
			`/api/leads/${leadId}/placement-submission/media`,
			{
				headers: {
					"x-test-user": "t1",
					range: "bytes=0-7",
				},
			},
		);
		expect(rangeMedia.status).toBe(206);
		expect(rangeMedia.headers.get("cross-origin-resource-policy")).toBe(
			"same-site",
		);
		expect(rangeMedia.headers.get("content-security-policy")).toBe(
			"default-src 'none'; sandbox",
		);
		expect(rangeMedia.headers.get("content-range")).toBe("bytes 0-7/20");
		expect((await rangeMedia.arrayBuffer()).byteLength).toBe(8);
	});

	test("PATCH /placement-submission lưu rubric Writing & Speaking, áp dụng quy tắc hạ 1 bậc Speaking và cập nhật Lead", async () => {
		// Listening/G&V/Reading = 100%, Writing = 12/15 (80%), Speaking = 2/20 (10% -> Pre-A1, index 0)
		// Trung bình = (100+100+100+80+10)/5 = 78% (band index 3: A2+/B1 thấp) -> bi-si=3 >= 2 => hạ xuống index 2 (A2)!
		const gradeRes = await app.request(
			`/api/leads/${leadId}/placement-submission`,
			{
				method: "PATCH",
				headers: {
					"x-test-user": "t1",
					origin: CORS_ORIGIN,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					writingRubric: { ct: 4, or: 4, lg: 4 },
					speakingRubric: { gv: 1, dm: 0, pr: 1, ic: 0 },
					teacherFeedback: "Cần phản xạ nói nhanh hơn.",
				}),
			},
		);
		expect(gradeRes.status).toBe(200);
		const graded = (await gradeRes.json()) as PlacementSubmissionDetail;
		expect(graded.status).toBe("graded");
		expect(graded.writingScore).toBe(12);
		expect(graded.speakingScore).toBe(2);
		expect(graded.finalBandLevel).toBe("A2");
		expect(graded.finalNote).toContain("hạ 1 bậc");
		expect(graded.zaloText).toContain(
			"Nhan xet cua Co My: Cần phản xạ nói nhanh hơn.",
		);

		const [updatedLead] = await db
			.select()
			.from(schema.lead)
			.where(eq(schema.lead.id, leadId));
		expect(updatedLead?.course).toBe("comm-1");
		expect(updatedLead?.placement).toContain("CEFR A2 (78%");

		const listRes = await app.request("/api/leads", {
			headers: { "x-test-user": "t1" },
		});
		const list = (await listRes.json()) as LeadListResponse;
		expect(
			list.rows.find((r) => r.id === leadId)?.placementSubmissionStatus,
		).toBe("graded");
	});
});
