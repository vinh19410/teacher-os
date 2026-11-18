import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	NOTIFICATION_EVENT_TYPES,
	studentInboxResponseSchema,
} from "@teacher-os/api/contracts";
import {
	buildPlacementSnapshot,
	type PlacementContent,
	type PlacementPublicResultView,
	type PlacementSubmissionDetail,
	type StudentPlacementStatusResponse,
	type StudentPlacementSubmitResponse,
	type StudentPlacementViewResponse,
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
import type { PlacementAiGrader } from "../lib/placement-ai/grader";
import { mp3Id3Bytes } from "../lib/test-media-fixtures";

const STUDENT_ORIGIN = "http://localhost:8003";
const TEACHER_ORIGIN = "http://localhost:8001";
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
		0x77, 0x65, 0x62, 0x6d, 0x11, 0x22, 0x33, 0x44,
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
						audioId,
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
							{
								id: "l-gap-1",
								type: "gap",
								level: "A1",
								prompt: "Price: ___",
								accept: ["12", "$12"],
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

function createFakeAiGrader(): PlacementAiGrader {
	return {
		async transcribe() {
			return "Hello I live in District 9 with my sister.";
		},
		async startWriting() {
			return "w-job-1";
		},
		async startSpeaking() {
			return "s-job-1";
		},
		async poll(_id, kind) {
			if (kind === "writing") {
				return {
					state: "draft",
					draft: {
						rubric: { ct: 4, or: 4, lg: 4 },
						feedback: "Bài viết rõ ý.",
						errors: [
							{
								id: "we-1",
								category: "grammar",
								quote: "go cycling",
								start: null,
								end: null,
								correction: "went cycling",
								explanation: "Dùng quá khứ.",
							},
						],
					},
				};
			}
			return {
				state: "draft",
				draft: {
					rubric: { gv: 3, dm: 3, pr: 3, ic: 3 },
					feedback: "Phát âm ổn.",
					errors: [
						{
							id: "se-1",
							category: "pronunciation",
							quote: "District 9",
							start: null,
							end: null,
							correction: "District Nine",
							explanation: "Nhấn âm rõ hơn.",
						},
					],
				},
			};
		},
	};
}

describe("student portal placement test routes (#748)", () => {
	let db: Db;
	let mediaStore: MediaStore;
	let audioStore: MediaStore;
	let pendingTasks: Array<Promise<unknown>>;
	let sentEmails: Array<{ to: string; subject: string; text: string }>;
	let app: ServerApp;

	async function drainBackgroundTasks() {
		while (pendingTasks.length > 0) {
			const batch = pendingTasks.splice(0, pendingTasks.length);
			await Promise.all(batch);
		}
	}

	async function seedPublishedTest(
		orgId = "org-1",
		audioId = "11111111-1111-4111-8111-111111111111",
		version = 1,
	) {
		const audioBytes = mp3Id3Bytes("placement-listening");
		await audioStore.put(
			`placement/${orgId}/${audioId}`,
			new ReadableStream({
				start(controller) {
					controller.enqueue(audioBytes);
					controller.close();
				},
			}),
			{ contentType: "audio/mpeg", size: audioBytes.byteLength },
		);
		await db.insert(schema.placementTestAudio).values({
			id: audioId,
			orgId,
			objectKey: `placement/${orgId}/${audioId}`,
			name: "clip.mp3",
			contentType: "audio/mpeg",
			size: audioBytes.byteLength,
		});
		const content = makeSampleContent(audioId);
		const snapshot = buildPlacementSnapshot(content, version);
		await db.insert(schema.placementTest).values({
			orgId,
			draft: JSON.stringify(content),
			published: JSON.stringify(snapshot),
			revision: 1,
			publishedRevision: 1,
			publishedVersion: version,
			publishedAt: new Date(),
			updatedAt: new Date(),
		});
		return { audioId, audioBytes };
	}

	beforeEach(async () => {
		const client = createClient({ url: "file::memory:" });
		const raw = drizzle(client, { schema });
		await migrate(raw, { migrationsFolder: MIGRATIONS_DIR });
		db = raw as unknown as Db;
		mediaStore = createMemoryMediaStore();
		audioStore = createMemoryMediaStore();
		pendingTasks = [];
		sentEmails = [];

		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Cô Mỹ Academy" },
			{ id: "org-2", name: "Org Khác" },
			{ id: "org-lead", name: "Default Lead Org" },
		]);

		await db.insert(schema.user).values([
			{
				id: "u-t1",
				name: "Cô Mỹ",
				email: "my@test.local",
				emailVerified: true,
				role: "teacher",
			},
			{
				id: "u-ct1",
				name: "Giáo viên lớp",
				email: "ct@test.local",
				emailVerified: true,
				role: "class_teacher",
			},
			{
				id: "u-ta1",
				name: "Trợ giảng",
				email: "ta@test.local",
				emailVerified: true,
				role: "ta",
			},
			{
				id: "u-t2",
				name: "Cô Hoa",
				email: "hoa-teacher@test.local",
				emailVerified: true,
				role: "teacher",
			},
		]);

		await db.insert(schema.membership).values([
			{ id: "m-t1", orgId: "org-1", userId: "u-t1", role: "teacher" },
			{ id: "m-ct1", orgId: "org-1", userId: "u-ct1", role: "class_teacher" },
			{ id: "m-ta1", orgId: "org-1", userId: "u-ta1", role: "ta" },
			{ id: "m-t2", orgId: "org-2", userId: "u-t2", role: "teacher" },
		]);

		await db.insert(schema.student).values([
			{
				id: "stu-hoa",
				orgId: "org-1",
				name: "Nguyễn Thị Hoa",
				email: "hoa@student.local",
				phone: "0901111222",
			},
			{
				id: "stu-exempt",
				orgId: "org-1",
				name: "Trần Bảo Anh",
				email: "exempt@student.local",
				phone: "0903333444",
				entryScore: "6.5 IELTS",
			},
			{
				id: "stu-other",
				orgId: "org-2",
				name: "Lê Minh",
				email: "minh@student.local",
				phone: "0905555666",
			},
		]);

		app = buildApp({
			getDb: () => db,
			corsOrigin: [STUDENT_ORIGIN, TEACHER_ORIGIN],
			leadOrgId: "org-lead",
			teacherEmails: [
				"my@test.local",
				"ct@test.local",
				"ta@test.local",
				"hoa-teacher@test.local",
			],
			leadOrigins: [PROFILE_ORIGIN],
			getMediaStore: () => mediaStore,
			getLibraryAudioStore: () => audioStore,
			getPlacementAiGrader: createFakeAiGrader,
			runInBackground: (p) => {
				pendingTasks.push(p);
			},
			mailer: {
				async send(msg) {
					sentEmails.push({
						to: msg.to,
						subject: msg.subject,
						text: msg.text,
					});
				},
			},
			authHandler: async () => new Response("unused", { status: 404 }),
			getSessionUser: async (headers) => {
				const tag = headers.get("x-test-user");
				if (tag === "hoa") {
					return {
						userId: "u-stu-hoa",
						userName: "Nguyễn Thị Hoa",
						email: "hoa@student.local",
						emailVerified: true,
						role: "student",
					};
				}
				if (tag === "exempt") {
					return {
						userId: "u-stu-exempt",
						userName: "Trần Bảo Anh",
						email: "exempt@student.local",
						emailVerified: true,
						role: "student",
					};
				}
				if (tag === "unverified") {
					return {
						userId: "u-stu-unverified",
						userName: "Unverified",
						email: "hoa@student.local",
						emailVerified: false,
						role: "student",
					};
				}
				if (tag === "minh") {
					return {
						userId: "u-stu-minh",
						userName: "Lê Minh",
						email: "minh@student.local",
						emailVerified: true,
						role: "student",
					};
				}
				if (tag === "t1") {
					return {
						userId: "u-t1",
						userName: "Cô Mỹ",
						email: "my@test.local",
						emailVerified: true,
						role: "teacher",
					};
				}
				if (tag === "ct1") {
					return {
						userId: "u-ct1",
						userName: "Giáo viên lớp",
						email: "ct@test.local",
						emailVerified: true,
						role: "teacher",
					};
				}
				if (tag === "ta1") {
					return {
						userId: "u-ta1",
						userName: "Trợ giảng",
						email: "ta@test.local",
						emailVerified: true,
						role: "teacher",
					};
				}
				if (tag === "t2") {
					return {
						userId: "u-t2",
						userName: "Cô Hoa",
						email: "hoa-teacher@test.local",
						emailVerified: true,
						role: "teacher",
					};
				}
				return null;
			},
		});
	});

	test("enforces auth, email verification, role, org mismatch, and Origin/Content-Type/size CSRF guards", async () => {
		const unauth = await app.request("/api/student/placement-test/status");
		expect(unauth.status).toBe(401);

		const teacherBlocked = await app.request(
			"/api/student/placement-test/status",
			{ headers: { "x-test-user": "t1" } },
		);
		expect(teacherBlocked.status).toBe(403);

		const unverified = await app.request("/api/student/placement-test/status", {
			headers: { "x-test-user": "unverified" },
		});
		expect(unverified.status).toBe(403);

		const orgMismatch = await app.request(
			"/api/student/placement-test/status",
			{
				headers: {
					"x-test-user": "hoa",
					"x-student-org-id": "org-2",
				},
			},
		);
		expect(orgMismatch.status).toBe(403);

		const badOriginDismiss = await app.request(
			"/api/student/placement-test/dismiss",
			{
				method: "POST",
				headers: {
					"x-test-user": "hoa",
					origin: "https://evil.example",
				},
			},
		);
		expect(badOriginDismiss.status).toBe(403);

		const badOriginSubmit = await app.request(
			"/api/student/placement-test/submissions",
			{
				method: "POST",
				headers: {
					"x-test-user": "hoa",
					origin: "https://evil.example",
					"content-type": "application/json",
				},
				body: "{}",
			},
		);
		expect(badOriginSubmit.status).toBe(403);

		const badContentType = await app.request(
			"/api/student/placement-test/submissions",
			{
				method: "POST",
				headers: {
					"x-test-user": "hoa",
					origin: STUDENT_ORIGIN,
					"content-type": "text/plain",
				},
				body: "{}",
			},
		);
		expect(badContentType.status).toBe(415);

		const oversized = await app.request(
			"/api/student/placement-test/submissions",
			{
				method: "POST",
				headers: {
					"x-test-user": "hoa",
					origin: STUDENT_ORIGIN,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					answers: { listening: {}, vocabGrammar: {}, reading: {} },
					writingText: "a".repeat(130 * 1024),
					speakingMode: "none",
				}),
			},
		);
		expect(oversized.status).toBe(413);

		const badOriginPut = await app.request(
			"/api/student/placement-test/submissions/sub-1/speaking",
			{
				method: "PUT",
				headers: {
					"x-test-user": "hoa",
					origin: "https://evil.example",
				},
			},
		);
		expect(badOriginPut.status).toBe(403);
	});

	test("status transitions (unavailable -> exempt -> not_started), sanitized snapshot, Range audio proxy, and dismiss idempotency", async () => {
		// 1. No published test anywhere -> unavailable
		const unavailRes = await app.request("/api/student/placement-test/status", {
			headers: { "x-test-user": "hoa" },
		});
		expect(unavailRes.status).toBe(200);
		const unavail = (await unavailRes.json()) as StudentPlacementStatusResponse;
		expect(unavail).toEqual({
			status: "unavailable",
			hasEntryScore: false,
			entryScore: null,
			promptDismissedAt: null,
			submissionId: null,
			testAvailable: false,
			testVersion: null,
		});

		// 2. Student with existing entryScore -> exempt
		const exemptRes = await app.request("/api/student/placement-test/status", {
			headers: { "x-test-user": "exempt" },
		});
		expect(exemptRes.status).toBe(200);
		const exempt = (await exemptRes.json()) as StudentPlacementStatusResponse;
		expect(exempt.status).toBe("exempt");
		expect(exempt.hasEntryScore).toBe(true);
		expect(exempt.entryScore).toBe("6.5 IELTS");

		// 3. Submit without published test -> 404 PLACEMENT_NOT_PUBLISHED
		const notPubSubmit = await app.request(
			"/api/student/placement-test/submissions",
			{
				method: "POST",
				headers: {
					"x-test-user": "hoa",
					origin: STUDENT_ORIGIN,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					answers: { listening: {}, vocabGrammar: {}, reading: {} },
					writingText: "",
					speakingMode: "none",
				}),
			},
		);
		expect(notPubSubmit.status).toBe(404);
		expect(((await notPubSubmit.json()) as { code: string }).code).toBe(
			"PLACEMENT_NOT_PUBLISHED",
		);

		// 4. Publish fallback test on org-lead; org-1 picks it up + audio Range works
		const { audioId, audioBytes } = await seedPublishedTest("org-lead");

		const viewRes = await app.request("/api/student/placement-test", {
			headers: { "x-test-user": "hoa" },
		});
		expect(viewRes.status).toBe(200);
		const view = (await viewRes.json()) as StudentPlacementViewResponse;
		expect(view.status).toBe("not_started");
		expect(view.testAvailable).toBe(true);
		expect(view.testVersion).toBe(1);
		expect(view.submission).toBeNull();
		expect(view.snapshot).not.toBeNull();
		// Audio URL rewritten to authenticated student proxy
		expect(view.snapshot?.parts[0].clips[0]?.src).toBe(
			`/api/student/placement-test/audio/${audioId}`,
		);
		// Correct answers never exposed in snapshot
		const snapshotJson = JSON.stringify(view.snapshot);
		expect(snapshotJson).not.toContain('"answer"');
		expect(snapshotJson).not.toContain('"accept"');

		// Range audio request (206) + invalid range (416) + org-2 isolation (404 when org-2 has own/no fallback? Wait: org-2 also falls back to org-lead unless audio is in unrelated org-other-only)
		const rangeAudio = await app.request(
			`/api/student/placement-test/audio/${audioId}`,
			{
				headers: {
					"x-test-user": "hoa",
					range: "bytes=0-4",
				},
			},
		);
		expect(rangeAudio.status).toBe(206);
		expect(rangeAudio.headers.get("content-range")).toBe(
			`bytes 0-4/${audioBytes.byteLength}`,
		);
		expect(rangeAudio.headers.get("cross-origin-resource-policy")).toBe(
			"same-site",
		);
		expect((await rangeAudio.arrayBuffer()).byteLength).toBe(5);

		const badRange = await app.request(
			`/api/student/placement-test/audio/${audioId}`,
			{
				headers: {
					"x-test-user": "hoa",
					range: "bytes=9999-10000",
				},
			},
		);
		expect(badRange.status).toBe(416);

		// Audio in org-2 must NOT be accessible by student in org-1
		const org2OnlyAudioId = "22222222-2222-4222-8222-222222222222";
		await seedPublishedTest("org-2", org2OnlyAudioId, 2);
		const crossOrgAudio = await app.request(
			`/api/student/placement-test/audio/${org2OnlyAudioId}`,
			{ headers: { "x-test-user": "hoa" } },
		);
		expect(crossOrgAudio.status).toBe(404);

		// 5. Dismiss idempotency
		const dismiss1 = await app.request("/api/student/placement-test/dismiss", {
			method: "POST",
			headers: {
				"x-test-user": "hoa",
				origin: STUDENT_ORIGIN,
			},
		});
		expect(dismiss1.status).toBe(200);
		const d1 = (await dismiss1.json()) as {
			ok: boolean;
			promptDismissedAt: string;
		};
		expect(d1.ok).toBe(true);
		expect(typeof d1.promptDismissedAt).toBe("string");

		await new Promise((r) => setTimeout(r, 15));

		const dismiss2 = await app.request("/api/student/placement-test/dismiss", {
			method: "POST",
			headers: {
				"x-test-user": "hoa",
				origin: STUDENT_ORIGIN,
			},
		});
		expect(dismiss2.status).toBe(200);
		const d2 = (await dismiss2.json()) as {
			ok: boolean;
			promptDismissedAt: string;
		};
		expect(d2.promptDismissedAt).toBe(d1.promptDismissedAt);

		const statusAfterDismiss = await app.request(
			"/api/student/placement-test/status",
			{ headers: { "x-test-user": "hoa" } },
		);
		const statusJson =
			(await statusAfterDismiss.json()) as StudentPlacementStatusResponse;
		expect(statusJson.promptDismissedAt).toBe(d1.promptDismissedAt);
	});

	test("submit + speaking upload + teacher grading via /api/students/:id/placement-submission updates student.entryScore + public result with leadId = null", async () => {
		await seedPublishedTest("org-1");

		// Submit with speakingMode = upload
		const submitRes = await app.request(
			"/api/student/placement-test/submissions",
			{
				method: "POST",
				headers: {
					"x-test-user": "hoa",
					origin: STUDENT_ORIGIN,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					answers: {
						listening: { "l-a1": 1, "l-gap-1": "$12" },
						vocabGrammar: { "gv-01": 1 },
						reading: { "r-a1": 1 },
					},
					writingText:
						"Hi Ben, I live in District 9 with my sister and we go cycling every weekend.",
					speakingMode: "upload",
					speakingDurationSec: 32,
				}),
			},
		);
		expect(submitRes.status).toBe(201);
		const submitted =
			(await submitRes.json()) as StudentPlacementSubmitResponse;
		expect(submitted.submissionId).toBeTruthy();
		expect(submitted.uploadToken).toBeTruthy();
		expect(submitted.uploadTokenExpiresAt).toBeTruthy();
		expect(submitted.objective.listening).toEqual({
			correct: 2,
			total: 2,
			pct: 100,
		});
		expect(submitted.objective.vocabGrammar).toEqual({
			correct: 1,
			total: 1,
			pct: 100,
		});
		expect(submitted.objective.reading).toEqual({
			correct: 1,
			total: 1,
			pct: 100,
		});

		// Verify no fake lead was created
		const leadsAfter = await db
			.select()
			.from(schema.lead)
			.where(eq(schema.lead.orgId, "org-1"));
		expect(leadsAfter).toHaveLength(0);

		// Duplicate submit -> 409 PLACEMENT_ALREADY_SUBMITTED
		const dupSubmit = await app.request(
			"/api/student/placement-test/submissions",
			{
				method: "POST",
				headers: {
					"x-test-user": "hoa",
					origin: STUDENT_ORIGIN,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					answers: { listening: {}, vocabGrammar: {}, reading: {} },
					writingText: "",
					speakingMode: "upload",
				}),
			},
		);
		expect(dupSubmit.status).toBe(409);
		expect(((await dupSubmit.json()) as { code: string }).code).toBe(
			"PLACEMENT_ALREADY_SUBMITTED",
		);

		// Speaking upload guards: missing token (401), wrong student (404), bad magic/mime (415)
		const webm = validWebmBytes();
		const missingToken = await app.request(
			`/api/student/placement-test/submissions/${submitted.submissionId}/speaking`,
			{
				method: "PUT",
				headers: {
					"x-test-user": "hoa",
					origin: STUDENT_ORIGIN,
					"content-type": "video/webm",
					"content-length": String(webm.byteLength),
				},
				body: webm,
			},
		);
		expect(missingToken.status).toBe(401);

		const wrongStudent = await app.request(
			`/api/student/placement-test/submissions/${submitted.submissionId}/speaking`,
			{
				method: "PUT",
				headers: {
					"x-test-user": "minh",
					origin: STUDENT_ORIGIN,
					"x-upload-token": submitted.uploadToken ?? "",
					"x-media-filename": "speaking.webm",
					"content-type": "video/webm",
					"content-length": String(webm.byteLength),
				},
				body: webm,
			},
		);
		expect(wrongStudent.status).toBe(404);

		const fakeMp4 = new Uint8Array([
			0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
			0x00, 0x00, 0x02, 0x00,
		]);
		const badMime = await app.request(
			`/api/student/placement-test/submissions/${submitted.submissionId}/speaking`,
			{
				method: "PUT",
				headers: {
					"x-test-user": "hoa",
					origin: STUDENT_ORIGIN,
					"x-upload-token": submitted.uploadToken ?? "",
					"x-media-filename": "speaking.mp4",
					"content-type": "video/mp4",
					"content-length": String(fakeMp4.byteLength),
				},
				body: fakeMp4,
			},
		);
		expect(badMime.status).toBe(415);

		// Valid speaking upload -> 200 & triggers AI grading
		const okUpload = await app.request(
			`/api/student/placement-test/submissions/${submitted.submissionId}/speaking`,
			{
				method: "PUT",
				headers: {
					"x-test-user": "hoa",
					origin: STUDENT_ORIGIN,
					"x-upload-token": submitted.uploadToken ?? "",
					"x-media-filename": "speaking.webm",
					"x-speaking-duration": "35",
					"content-type": "video/webm",
					"content-length": String(webm.byteLength),
				},
				body: webm,
			},
		);
		expect(okUpload.status).toBe(200);
		expect(await okUpload.json()).toMatchObject({
			ok: true,
			speakingStatus: "uploaded",
		});

		await drainBackgroundTasks();

		// Student view while pending_grading hides snapshot, transcripts, AI drafts, and feedback
		const pendingViewRes = await app.request("/api/student/placement-test", {
			headers: { "x-test-user": "hoa" },
		});
		expect(pendingViewRes.status).toBe(200);
		const pendingView =
			(await pendingViewRes.json()) as StudentPlacementViewResponse;
		expect(pendingView.status).toBe("pending_grading");
		expect(pendingView.snapshot).toBeNull();
		expect(pendingView.submission?.speakingStatus).toBe("uploaded");
		expect(pendingView.submission?.speakingTranscript).toBe("");
		expect(JSON.stringify(pendingView)).not.toContain("aiWriting");
		expect(JSON.stringify(pendingView)).not.toContain("w-job-1");

		// Teacher role gates & org isolation on /api/students/:id/placement-submission*
		const taForbidden = await app.request(
			"/api/students/stu-hoa/placement-submission",
			{ headers: { "x-test-user": "ta1" } },
		);
		expect(taForbidden.status).toBe(403);

		const org2Forbidden = await app.request(
			"/api/students/stu-hoa/placement-submission",
			{ headers: { "x-test-user": "t2" } },
		);
		expect(org2Forbidden.status).toBe(404);
		expect(((await org2Forbidden.json()) as { code: string }).code).toBe(
			"STUDENT_NOT_FOUND",
		);

		const noSubStudent = await app.request(
			"/api/students/stu-exempt/placement-submission",
			{ headers: { "x-test-user": "t1" } },
		);
		expect(noSubStudent.status).toBe(404);
		expect(((await noSubStudent.json()) as { code: string }).code).toBe(
			"PLACEMENT_SUBMISSION_NOT_FOUND",
		);

		// class_teacher can inspect student placement submission
		const ctGet = await app.request(
			"/api/students/stu-hoa/placement-submission",
			{ headers: { "x-test-user": "ct1" } },
		);
		expect(ctGet.status).toBe(200);
		const detail = (await ctGet.json()) as PlacementSubmissionDetail;
		expect(detail.leadId).toBeNull();
		expect(detail.studentId).toBe("stu-hoa");
		expect(detail.speakingMediaUrl).toBe(
			"/api/students/stu-hoa/placement-submission/media",
		);
		expect(detail.aiStatus).toBe("drafted");
		expect(detail.aiWriting?.feedback).toBe("Bài viết rõ ý.");
		expect(detail.speakingTranscript).toBe(
			"Hello I live in District 9 with my sister.",
		);

		// Range media streaming via /api/students/:id/placement-submission/media
		const mediaRes = await app.request(
			"/api/students/stu-hoa/placement-submission/media",
			{
				headers: {
					"x-test-user": "t1",
					range: "bytes=0-7",
				},
			},
		);
		expect(mediaRes.status).toBe(206);
		expect(mediaRes.headers.get("cross-origin-resource-policy")).toBe(
			"same-site",
		);
		expect((await mediaRes.arrayBuffer()).byteLength).toBe(8);

		// AI retry via /api/students/:id/placement-submission/ai-retry
		const retryRes = await app.request(
			"/api/students/stu-hoa/placement-submission/ai-retry",
			{
				method: "POST",
				headers: {
					"x-test-user": "t1",
					origin: TEACHER_ORIGIN,
					"content-type": "application/json",
				},
				body: "{}",
			},
		);
		expect(retryRes.status).toBe(200);
		await drainBackgroundTasks();

		// Teacher grades via PATCH /api/students/stu-hoa/placement-submission
		// L/G&V/R = 100%, W = 12/15 (80%), S = 16/20 (80%) -> avg = 92% -> "B1 trở lên"
		const gradeRes = await app.request(
			"/api/students/stu-hoa/placement-submission",
			{
				method: "PATCH",
				headers: {
					"x-test-user": "t1",
					origin: TEACHER_ORIGIN,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					writingRubric: { ct: 4, or: 4, lg: 4 },
					speakingRubric: { gv: 4, dm: 4, pr: 4, ic: 4 },
					teacherFeedback: "Làm bài rất tốt!",
					writingErrors: [
						{
							id: "we-1",
							category: "grammar",
							quote: "go cycling",
							start: null,
							end: null,
							correction: "went cycling",
							explanation: "Quá khứ.",
						},
					],
					speakingErrors: [],
				}),
			},
		);
		expect(gradeRes.status).toBe(200);
		const graded = (await gradeRes.json()) as PlacementSubmissionDetail;
		expect(graded.status).toBe("graded");
		expect(graded.finalBandLevel).toBe("B1 trở lên");
		expect(graded.resultEmailStatus).toBe("sent");
		expect(graded.resultUrl).toContain(
			`${PROFILE_ORIGIN}/kiem-tra-dau-vao/ket-qua/?t=`,
		);
		expect(sentEmails).toHaveLength(1);
		expect(sentEmails[0]?.to).toBe("hoa@student.local");

		// Verify student.entryScore updated
		const [stuRow] = await db
			.select()
			.from(schema.student)
			.where(eq(schema.student.id, "stu-hoa"));
		expect(stuRow?.entryScore).toBe("B1 trở lên");

		// Student portal status & view reflect graded result
		const gradedStatusRes = await app.request(
			"/api/student/placement-test/status",
			{ headers: { "x-test-user": "hoa" } },
		);
		const gradedStatus =
			(await gradedStatusRes.json()) as StudentPlacementStatusResponse;
		expect(gradedStatus.status).toBe("graded");
		expect(gradedStatus.hasEntryScore).toBe(true);
		expect(gradedStatus.entryScore).toBe("B1 trở lên");

		const gradedViewRes = await app.request("/api/student/placement-test", {
			headers: { "x-test-user": "hoa" },
		});
		const gradedView =
			(await gradedViewRes.json()) as StudentPlacementViewResponse;
		expect(gradedView.submission?.status).toBe("graded");
		expect(gradedView.submission?.finalBandLevel).toBe("B1 trở lên");
		expect(gradedView.submission?.teacherFeedback).toBe("Làm bài rất tốt!");
		expect(gradedView.submission?.bandAdvice).toBe("Học B1+.");
		expect(gradedView.submission?.writingErrors[0]?.start).toBeGreaterThan(0);

		// Public result link works when leadId === null
		const token = new URL(graded.resultUrl ?? "").searchParams.get("t") ?? "";
		expect(token).toMatch(/^[0-9a-f]{64}$/);
		const publicResultRes = await app.request(
			`/public/placement-test/results/${token}`,
		);
		expect(publicResultRes.status).toBe(200);
		const publicResult =
			(await publicResultRes.json()) as PlacementPublicResultView;
		expect(publicResult.studentName).toBe("Nguyễn Thị Hoa");
		expect(publicResult.finalBandLevel).toBe("B1 trở lên");
		expect(publicResult.teacherFeedback).toBe("Làm bài rất tốt!");
	});

	test("links existing email-matched lead on student submit and backfills studentId for pre-existing lead submission", async () => {
		await seedPublishedTest("org-1");

		// Case 1: Pre-existing lead with same email (mixed case/spaces) -> student submit links leadId
		await db.insert(schema.lead).values({
			id: "lead-hoa",
			orgId: "org-1",
			name: "Nguyễn Thị Hoa",
			phone: "0901111222",
			email: "  HOA@student.local ",
			source: "profile",
			status: "new",
		});

		const submitRes = await app.request(
			"/api/student/placement-test/submissions",
			{
				method: "POST",
				headers: {
					"x-test-user": "hoa",
					origin: STUDENT_ORIGIN,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					answers: {
						listening: { "l-a1": 1 },
						vocabGrammar: { "gv-01": 1 },
						reading: { "r-a1": 1 },
					},
					writingText: "Short essay for AI draft.",
					speakingMode: "upload",
					speakingDurationSec: 20,
				}),
			},
		);
		expect(submitRes.status).toBe(201);
		const submitted =
			(await submitRes.json()) as StudentPlacementSubmitResponse;
		const webm = validWebmBytes();
		const uploadRes = await app.request(
			`/api/student/placement-test/submissions/${submitted.submissionId}/speaking`,
			{
				method: "PUT",
				headers: {
					"x-test-user": "hoa",
					origin: STUDENT_ORIGIN,
					"x-upload-token": submitted.uploadToken ?? "",
					"x-media-filename": "speaking.webm",
					"content-type": "audio/webm",
					"content-length": String(webm.byteLength),
				},
				body: webm,
			},
		);
		expect(uploadRes.status).toBe(200);
		await drainBackgroundTasks();

		const [subRow] = await db
			.select()
			.from(schema.placementTestSubmission)
			.where(eq(schema.placementTestSubmission.id, submitted.submissionId));
		expect(subRow?.leadId).toBe("lead-hoa");
		expect(subRow?.studentId).toBe("stu-hoa");
		expect(subRow?.aiStatus).toBe("processing");

		const detailRes = await app.request(
			"/api/students/stu-hoa/placement-submission",
			{ headers: { "x-test-user": "t1" } },
		);
		expect(detailRes.status).toBe(200);
		const detail = (await detailRes.json()) as PlacementSubmissionDetail;
		expect(detail.aiStatus).toBe("drafted");

		// Grading updates BOTH lead and student
		const gradeRes = await app.request(
			"/api/students/stu-hoa/placement-submission",
			{
				method: "PATCH",
				headers: {
					"x-test-user": "t1",
					origin: TEACHER_ORIGIN,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					writingRubric: { ct: 3, or: 3, lg: 3 },
					speakingRubric: null,
					teacherFeedback: "Ổn.",
					writingErrors: [],
					speakingErrors: [],
				}),
			},
		);
		expect(gradeRes.status).toBe(200);

		const [updatedLead] = await db
			.select()
			.from(schema.lead)
			.where(eq(schema.lead.id, "lead-hoa"));
		const [updatedStu] = await db
			.select()
			.from(schema.student)
			.where(eq(schema.student.id, "stu-hoa"));
		expect(updatedLead?.placement).toContain("CEFR");
		expect(updatedStu?.entryScore).toBeTruthy();

		// Case 2: Pre-existing public submission matched by lead email (studentId = null) gets backfilled on GET /placement-test
		await seedPublishedTest("org-2", "33333333-3333-4333-8333-333333333333", 1);
		await db.insert(schema.lead).values({
			id: "lead-minh",
			orgId: "org-2",
			name: "Lê Minh",
			phone: "0905555666",
			email: "MINH@student.local",
			source: "placement-test",
			status: "new",
		});
		const snapshot = buildPlacementSnapshot(
			makeSampleContent("33333333-3333-4333-8333-333333333333"),
			1,
		);
		await db.insert(schema.placementTestSubmission).values({
			id: "sub-minh-public",
			orgId: "org-2",
			leadId: "lead-minh",
			studentId: null,
			testVersion: 1,
			snapshotJson: JSON.stringify(snapshot),
			answersJson: JSON.stringify({
				listening: {},
				vocabGrammar: {},
				reading: {},
			}),
			objectiveBreakdownJson: JSON.stringify({
				listening: { correct: 1, total: 2, pct: 50 },
				vocabGrammar: { correct: 1, total: 1, pct: 100 },
				reading: { correct: 0, total: 1, pct: 0 },
				totalCorrect: 2,
				totalQuestions: 4,
				averagePct: 50,
				byLevel: [],
				items: [],
				provisionalBand: snapshot.bands[1],
				provisionalSummary: "Tạm tính A1",
			}),
			writingText: "",
			writingWordCount: 0,
			speakingStatus: "none",
			status: "pending_grading",
		});

		const minhStatusRes = await app.request(
			"/api/student/placement-test/status",
			{ headers: { "x-test-user": "minh" } },
		);
		const minhStatus =
			(await minhStatusRes.json()) as StudentPlacementStatusResponse;
		expect(minhStatus.status).toBe("pending_grading");
		expect(minhStatus.submissionId).toBe("sub-minh-public");

		const minhViewRes = await app.request("/api/student/placement-test", {
			headers: { "x-test-user": "minh" },
		});
		expect(minhViewRes.status).toBe(200);

		const [backfilled] = await db
			.select()
			.from(schema.placementTestSubmission)
			.where(eq(schema.placementTestSubmission.id, "sub-minh-public"));
		expect(backfilled?.studentId).toBe("stu-other");

		// Case 3: Newer unverified public lead submission with same email must NOT shadow an existing studentId-linked submission
		await db.insert(schema.lead).values({
			id: "lead-spoof-hoa",
			orgId: "org-1",
			name: "Spoof Hoa",
			phone: "0909888777",
			email: "hoa@student.local",
			source: "placement-test",
			status: "new",
		});
		await db.insert(schema.placementTestSubmission).values({
			id: "sub-spoof-hoa",
			orgId: "org-1",
			leadId: "lead-spoof-hoa",
			studentId: null,
			testVersion: 1,
			snapshotJson: JSON.stringify(snapshot),
			answersJson: JSON.stringify({
				listening: {},
				vocabGrammar: {},
				reading: {},
			}),
			objectiveBreakdownJson: JSON.stringify({
				listening: { correct: 0, total: 2, pct: 0 },
				vocabGrammar: { correct: 0, total: 1, pct: 0 },
				reading: { correct: 0, total: 1, pct: 0 },
				totalCorrect: 0,
				totalQuestions: 4,
				averagePct: 0,
				byLevel: [],
				items: [],
				provisionalBand: snapshot.bands[0],
				provisionalSummary: "Tạm tính Pre-A1",
			}),
			writingText: "",
			writingWordCount: 0,
			speakingStatus: "none",
			status: "pending_grading",
			submittedAt: new Date(Date.now() + 60_000),
		});

		const hoaAfterSpoof = await app.request("/api/student/placement-test", {
			headers: { "x-test-user": "hoa" },
		});
		expect(hoaAfterSpoof.status).toBe(200);
		const hoaView =
			(await hoaAfterSpoof.json()) as StudentPlacementViewResponse;
		expect(hoaView.status).toBe("graded");
		expect(hoaView.submission?.id).not.toBe("sub-spoof-hoa");

		// Audio proxy must use private Cache-Control
		const audioCheck = await app.request(
			"/api/student/placement-test/audio/11111111-1111-4111-8111-111111111111",
			{ headers: { "x-test-user": "hoa" } },
		);
		expect(audioCheck.status).toBe(200);
		expect(audioCheck.headers.get("Cache-Control")).toContain("private");
	});

	test("POST /placement-test/submissions từ chối speakingMode='skipped' (400 PLACEMENT_SUBMIT_INVALID) và speakingMode='none' khi đề có Speaking (400 PLACEMENT_SPEAKING_REQUIRED)", async () => {
		await seedPublishedTest("org-1");

		const skippedRes = await app.request(
			"/api/student/placement-test/submissions",
			{
				method: "POST",
				headers: {
					"x-test-user": "hoa",
					origin: STUDENT_ORIGIN,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					answers: { listening: {}, vocabGrammar: {}, reading: {} },
					writingText: "Hello",
					speakingMode: "skipped",
				}),
			},
		);
		expect(skippedRes.status).toBe(400);
		expect(((await skippedRes.json()) as { code: string }).code).toBe(
			"PLACEMENT_SUBMIT_INVALID",
		);

		const noneRes = await app.request(
			"/api/student/placement-test/submissions",
			{
				method: "POST",
				headers: {
					"x-test-user": "hoa",
					origin: STUDENT_ORIGIN,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					answers: { listening: {}, vocabGrammar: {}, reading: {} },
					writingText: "Hello",
					speakingMode: "none",
				}),
			},
		);
		expect(noneRes.status).toBe(400);
		expect(((await noneRes.json()) as { code: string }).code).toBe(
			"PLACEMENT_SPEAKING_REQUIRED",
		);

		const subs = await db.select().from(schema.placementTestSubmission);
		expect(subs).toHaveLength(0);
	});

	test("POST /placement-test/submissions emits 1 in-app-only placement_submitted notification visible in inbox and markable as read", async () => {
		await seedPublishedTest("org-1");

		const submitRes = await app.request(
			"/api/student/placement-test/submissions",
			{
				method: "POST",
				headers: {
					"x-test-user": "hoa",
					origin: STUDENT_ORIGIN,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					answers: {
						listening: { "l-a1": 1, "l-gap-1": "$12" },
						vocabGrammar: { "gv-01": 1 },
						reading: { "r-a1": 1 },
					},
					writingText: "",
					speakingMode: "upload",
					speakingDurationSec: 15,
				}),
			},
		);
		expect(submitRes.status).toBe(201);
		const submitted =
			(await submitRes.json()) as StudentPlacementSubmitResponse;

		// In-app only: no email sent on submission
		expect(sentEmails).toHaveLength(0);

		const records = await db
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.studentId, "stu-hoa"));
		expect(records).toHaveLength(1);
		const record = records[0];
		if (!record) throw new Error("expected placement_submitted notification");
		expect(record.eventType).toBe("placement_submitted");
		expect(NOTIFICATION_EVENT_TYPES).toContain(record.eventType);
		expect(record.channels).toBe("in_app");
		expect(record.status).toBe("sent");
		expect(record.recipientEmail).toBeNull();
		expect(record.linkPath).toBe("/placement-test");
		expect(record.refType).toBe("placement_submission");
		expect(record.refId).toBe(submitted.submissionId);

		// Appears in GET /api/student/inbox with unread >= 1
		const inboxRes = await app.request("/api/student/inbox", {
			headers: { "x-test-user": "hoa" },
		});
		expect(inboxRes.status).toBe(200);
		const inbox = studentInboxResponseSchema.parse(await inboxRes.json());
		expect(inbox.unread).toBeGreaterThanOrEqual(1);
		const item = inbox.items.find((i) => i.id === record.id);
		expect(item).toBeDefined();
		expect(item?.eventType).toBe("placement_submitted");
		expect(item?.linkPath).toBe("/placement-test");
		expect(item?.status).toBe("sent");
		expect(item?.readAt).toBeNull();

		// Snapshot placement_test_submission before mark-read
		const [subBefore] = await db
			.select()
			.from(schema.placementTestSubmission)
			.where(eq(schema.placementTestSubmission.id, submitted.submissionId));

		// POST /api/student/inbox/:id/read marks notification read without changing submission
		const readRes = await app.request(`/api/student/inbox/${record.id}/read`, {
			method: "POST",
			headers: {
				"x-test-user": "hoa",
				origin: STUDENT_ORIGIN,
				"content-type": "application/json",
			},
		});
		expect(readRes.status).toBe(200);

		const [updatedRecord] = await db
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.id, record.id));
		expect(updatedRecord?.status).toBe("read");
		expect(updatedRecord?.readAt).not.toBeNull();

		const [subAfter] = await db
			.select()
			.from(schema.placementTestSubmission)
			.where(eq(schema.placementTestSubmission.id, submitted.submissionId));
		expect(subAfter).toEqual(subBefore);
	});
});
