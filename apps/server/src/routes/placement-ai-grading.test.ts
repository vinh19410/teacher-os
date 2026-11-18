import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	buildPlacementSnapshot,
	PLACEMENT_AI_ERROR_CODES,
	type PlacementContent,
	type PlacementPublicResultView,
	type PlacementSubmissionDetail,
} from "@teacher-os/api/placement-test-contracts";
import type { Mailer, MailInput } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "vitest";
import {
	buildApp,
	type Db,
	enforceDeclaredSize,
	type MediaStore,
	type ServerApp,
} from "../app";
import {
	createFakePlacementAiGrader,
	FAKE_PLACEMENT_TRANSCRIPT,
	type FakePlacementAiGraderOptions,
} from "../lib/placement-ai/fake-grader";
import type { PlacementAiGrader } from "../lib/placement-ai/grader";
import {
	PLACEMENT_AI_HARD_TIMEOUT_MS,
	PLACEMENT_AI_STALE_AFTER_MS,
	runPlacementAiGrading,
} from "../lib/placement-ai/run-placement-grading";
import { resolvePlacementResultLink } from "../lib/placement-submission-service";
import { webmBytes } from "../lib/test-media-fixtures";

const CORS_ORIGIN = "http://localhost:8001";
const PROFILE_ORIGIN = "https://msmy.io.vn";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);
const ESSAY = "Hello Ben, I lives in District 9 with my sister.";

function createMemoryMediaStore(): MediaStore {
	const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
	return {
		async put(key, body, { contentType, size }) {
			const counted = enforceDeclaredSize(body, size);
			const bytes = new Uint8Array(
				await new Response(counted.stream).arrayBuffer(),
			);
			objects.set(key, { bytes, contentType });
		},
		async get(key) {
			const found = objects.get(key);
			if (!found) return null;
			return {
				body: new Response(found.bytes).body as ReadableStream<Uint8Array>,
				contentType: found.contentType,
				size: found.bytes.byteLength,
			};
		},
		async delete(key) {
			objects.delete(key);
		},
	};
}

function makeContent(): PlacementContent {
	return {
		bands: [
			{
				min: 0,
				max: 49,
				cefr: "A1",
				course: "comm-1",
				displayCourse: "Communication English Level 1",
				advice: "Học Level 1.",
			},
			{
				min: 50,
				max: 100,
				cefr: "A2",
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
						id: "clip-a",
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
				promptBody: "Write an email to Ben.",
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
						prompt: "What do you do at weekends?",
						prepSeconds: 5,
						answerSeconds: 20,
					},
				],
			},
		],
	};
}

function recordingMailer(fail = false) {
	const sent: MailInput[] = [];
	const mailer: Mailer = {
		async send(input) {
			if (fail) throw new Error("smtp down");
			sent.push(input);
		},
	};
	return { sent, mailer };
}

interface Harness {
	app: ServerApp;
	db: Db;
	calls: {
		transcribe: number;
		writing: number;
		speaking: number;
		poll: number;
	};
	/** Chờ mọi việc nền (kể cả việc được lên lịch trong lúc chờ). */
	flush(): Promise<void>;
	submit(input: {
		writingText?: string;
		speakingMode?: "upload" | "skipped" | "none";
		email?: string;
	}): Promise<{ submissionId: string; leadId: string; uploadToken: string }>;
	upload(submissionId: string, uploadToken: string): Promise<void>;
	detail(leadId: string): Promise<PlacementSubmissionDetail>;
	pipelineDeps: Parameters<typeof runPlacementAiGrading>[0];
}

async function createHarness(
	opts: {
		grader?: "none" | FakePlacementAiGraderOptions;
		mailer?: Mailer;
		brokenMailer?: boolean;
		studentOrigin?: string;
	} = {},
): Promise<Harness> {
	const client = createClient({ url: "file::memory:" });
	const raw = drizzle(client, { schema });
	await migrate(raw, { migrationsFolder: MIGRATIONS_DIR });
	const db = raw as unknown as Db;
	const store = createMemoryMediaStore();

	await db.insert(schema.organization).values({ id: "org-1", name: "Cô Mỹ" });
	await db.insert(schema.user).values({
		id: "u-t1",
		name: "Cô Mỹ",
		email: "my@test.local",
		role: "teacher",
	});
	await db
		.insert(schema.membership)
		.values({ id: "m-1", orgId: "org-1", userId: "u-t1", role: "teacher" });
	await db.insert(schema.placementTest).values({
		orgId: "org-1",
		draft: JSON.stringify(makeContent()),
		published: JSON.stringify(buildPlacementSnapshot(makeContent(), 1)),
		revision: 1,
		publishedRevision: 1,
		publishedVersion: 1,
		publishedAt: new Date(),
		updatedAt: new Date(),
	});

	const calls = { transcribe: 0, writing: 0, speaking: 0, poll: 0 };
	const grader: PlacementAiGrader | undefined =
		opts.grader === "none"
			? undefined
			: createFakePlacementAiGrader({ ...(opts.grader ?? {}), calls });
	const pending: Promise<unknown>[] = [];
	const runInBackground = (p: Promise<unknown>) => {
		pending.push(p);
	};

	const deps: Parameters<typeof buildApp>[0] = {
		getDb: () => db,
		corsOrigin: CORS_ORIGIN,
		leadOrgId: "org-1",
		leadOrigins: [PROFILE_ORIGIN],
		getMediaStore: () => store,
		getPlacementAiGrader: () => grader,
		runInBackground,
		...(opts.mailer ? { mailer: opts.mailer } : {}),
		...(opts.studentOrigin ? { studentOrigin: opts.studentOrigin } : {}),
		authHandler: async () => new Response("unused", { status: 404 }),
		getSessionUser: async (headers) =>
			headers.get("x-test-user") === "t1"
				? { userId: "u-t1", userName: "Cô Mỹ", role: "teacher" }
				: null,
	};
	if (opts.brokenMailer) {
		// Như `index.ts`: getter mailer throw khi thiếu cấu hình gửi mail.
		Object.defineProperty(deps, "mailer", {
			get(): Mailer {
				throw new Error("RESEND_API_KEY is required");
			},
		});
	}
	const app = buildApp(deps);

	let phoneSeq = 0;
	return {
		app,
		db,
		calls,
		pipelineDeps: {
			getDb: () => db,
			getMediaStore: () => store,
			getPlacementAiGrader: () => grader,
			runInBackground,
		},
		async flush() {
			while (pending.length > 0) {
				await Promise.all(pending.splice(0));
			}
		},
		async submit(input) {
			phoneSeq += 1;
			const res = await app.request("/public/placement-test/submissions", {
				method: "POST",
				headers: { origin: PROFILE_ORIGIN, "content-type": "application/json" },
				body: JSON.stringify({
					lead: {
						name: "Học viên A",
						phone: `090555${String(phoneSeq).padStart(4, "0")}`,
						email: input.email ?? "",
					},
					answers: {
						listening: { "l-a1": 1 },
						vocabGrammar: { "gv-01": 1 },
						reading: { "r-a1": 1 },
					},
					writingText: input.writingText ?? ESSAY,
					speakingMode: input.speakingMode ?? "skipped",
					speakingDurationSec: 30,
				}),
			});
			expect(res.status).toBe(201);
			return (await res.json()) as {
				submissionId: string;
				leadId: string;
				uploadToken: string;
			};
		},
		async upload(submissionId, uploadToken) {
			const bytes = webmBytes();
			const res = await app.request(
				`/public/placement-test/submissions/${submissionId}/speaking-media`,
				{
					method: "PUT",
					headers: {
						origin: PROFILE_ORIGIN,
						"x-upload-token": uploadToken,
						"x-media-filename": "speaking.webm",
						"content-type": "audio/webm",
						"content-length": String(bytes.byteLength),
					},
					body: bytes,
				},
			);
			expect(res.status).toBe(200);
		},
		async detail(leadId) {
			const res = await app.request(
				`/api/leads/${leadId}/placement-submission`,
				{ headers: { "x-test-user": "t1" } },
			);
			expect(res.status).toBe(200);
			return (await res.json()) as PlacementSubmissionDetail;
		},
	};
}

function teacherPost(app: ServerApp, path: string, body?: unknown) {
	return app.request(path, {
		method: body === undefined ? "POST" : "PATCH",
		headers: {
			"x-test-user": "t1",
			origin: CORS_ORIGIN,
			"content-type": "application/json",
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

describe("placement AI grading pipeline (#730)", () => {
	test("writing-only: nộp bài (không upload) → nháp Writing, lỗi định vị trên bài", async () => {
		const h = await createHarness();
		const { leadId } = await h.submit({ speakingMode: "skipped" });
		await h.flush();
		const d = await h.detail(leadId);
		expect(d.aiStatus).toBe("drafted");
		expect(d.aiErrorCode).toBeNull();
		expect(d.aiDraftedAt).not.toBeNull();
		expect(d.aiWriting?.rubric).toEqual({ ct: 3, or: 3, lg: 3 });
		expect(d.aiWriting?.errors[0]).toMatchObject({
			id: "w1",
			quote: "Hello",
			start: 0,
			end: 5,
		});
		expect(d.aiSpeaking).toBeNull();
		expect(d.speakingTranscript).toBe("");
		expect(d.writingErrors).toBeNull();
		expect(d.resultUrl).toBeNull();
		expect(h.calls).toEqual({
			transcribe: 0,
			writing: 1,
			speaking: 0,
			poll: 1,
		});
	});

	test("writing + speaking: chờ upload rồi chấm cả hai cùng lượt", async () => {
		const h = await createHarness();
		const created = await h.submit({ speakingMode: "upload" });
		await h.flush();
		expect((await h.detail(created.leadId)).aiStatus).toBe("none");

		await h.upload(created.submissionId, created.uploadToken);
		await h.flush();
		const d = await h.detail(created.leadId);
		expect(d.aiStatus).toBe("drafted");
		expect(d.speakingTranscript).toBe(FAKE_PLACEMENT_TRANSCRIPT);
		expect(d.aiWriting?.rubric.ct).toBe(3);
		expect(d.aiSpeaking?.rubric).toEqual({ gv: 3, dm: 3, pr: 3, ic: 3 });
		expect(d.aiSpeaking?.errors[0]).toMatchObject({
			id: "s1",
			quote: "I",
			start: 0,
			end: 1,
		});
		expect(h.calls).toEqual({
			transcribe: 1,
			writing: 1,
			speaking: 1,
			poll: 2,
		});
	});

	test("không có gì để chấm → giữ none, không gọi grader", async () => {
		const h = await createHarness();
		const { leadId } = await h.submit({
			writingText: "   ",
			speakingMode: "skipped",
		});
		await h.flush();
		expect((await h.detail(leadId)).aiStatus).toBe("none");
		expect(h.calls.writing).toBe(0);
	});

	test("grader vắng → failed AI_GRADING_DISABLED; retry trả 503", async () => {
		const h = await createHarness({ grader: "none" });
		const { leadId } = await h.submit({ speakingMode: "none" });
		await h.flush();
		const d = await h.detail(leadId);
		expect(d.aiStatus).toBe("failed");
		expect(d.aiErrorCode).toBe(PLACEMENT_AI_ERROR_CODES.DISABLED);

		const retry = await teacherPost(
			h.app,
			`/api/leads/${leadId}/placement-submission/ai-retry`,
		);
		expect(retry.status).toBe(503);
	});

	test("transcript rỗng → failed NO_TRANSCRIPT nhưng vẫn lưu nháp Writing", async () => {
		const h = await createHarness({ grader: { transcript: "  " } });
		const created = await h.submit({ speakingMode: "upload" });
		await h.upload(created.submissionId, created.uploadToken);
		await h.flush();
		const d = await h.detail(created.leadId);
		expect(d.aiStatus).toBe("failed");
		expect(d.aiErrorCode).toBe(PLACEMENT_AI_ERROR_CODES.NO_TRANSCRIPT);
		expect(d.aiWriting?.rubric.lg).toBe(3);
		expect(d.aiSpeaking).toBeNull();
		expect(h.calls.speaking).toBe(0);
	});

	test("grader lỗi → failed AI_GRADING_FAILED", async () => {
		const h = await createHarness();
		const { leadId } = await h.submit({ writingText: "ai-fail essay" });
		await h.flush();
		const d = await h.detail(leadId);
		expect(d.aiStatus).toBe("failed");
		expect(d.aiErrorCode).toBe(PLACEMENT_AI_ERROR_CODES.FAILED);
		expect(d.aiWriting).toBeNull();
	});

	test("CAS: hai lượt chạy đồng thời chỉ chấm một lần", async () => {
		const h = await createHarness({ grader: { delayMs: 20 } });
		const { submissionId, leadId } = await h.submit({ speakingMode: "upload" });
		await Promise.all([
			runPlacementAiGrading(h.pipelineDeps, submissionId),
			runPlacementAiGrading(h.pipelineDeps, submissionId),
		]);
		expect(h.calls.writing).toBe(1);
		expect((await h.detail(leadId)).aiStatus).toBe("drafted");
		// Đã nháp → trigger lại không chấm nữa.
		await runPlacementAiGrading(h.pipelineDeps, submissionId);
		expect(h.calls.writing).toBe(1);
	});

	test("sweep: processing quá 15 phút chưa có job nào → failed TIMEOUT khi giáo viên mở bài", async () => {
		const h = await createHarness();
		const { submissionId, leadId } = await h.submit({ speakingMode: "upload" });
		await h.db
			.update(schema.placementTestSubmission)
			.set({
				aiStatus: "processing",
				aiStartedAt: new Date(Date.now() - PLACEMENT_AI_STALE_AFTER_MS - 1000),
			})
			.where(eq(schema.placementTestSubmission.id, submissionId));
		const d = await h.detail(leadId);
		expect(d.aiStatus).toBe("failed");
		expect(d.aiErrorCode).toBe(PLACEMENT_AI_ERROR_CODES.TIMEOUT);
	});
});

describe("POST /api/leads/:id/placement-submission/ai-retry (#730)", () => {
	test("drafted → processing → chấm lại; không có gì để chấm/processing → 409", async () => {
		const h = await createHarness({ grader: { delayMs: 50 } });
		const pending = await h.submit({
			writingText: "   ",
			speakingMode: "upload",
		});
		const conflict = await teacherPost(
			h.app,
			`/api/leads/${pending.leadId}/placement-submission/ai-retry`,
		);
		expect(conflict.status).toBe(409);

		const { leadId } = await h.submit({ speakingMode: "skipped" });
		await h.flush();
		expect(h.calls.writing).toBe(1);

		const res = await teacherPost(
			h.app,
			`/api/leads/${leadId}/placement-submission/ai-retry`,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as PlacementSubmissionDetail;
		expect(body.aiStatus).toBe("processing");

		const again = await teacherPost(
			h.app,
			`/api/leads/${leadId}/placement-submission/ai-retry`,
		);
		expect(again.status).toBe(409);

		await h.flush();
		expect(h.calls.writing).toBe(2);
		expect((await h.detail(leadId)).aiStatus).toBe("drafted");
	});

	test("failed → retry được", async () => {
		const h = await createHarness({ grader: { transcript: "" } });
		const created = await h.submit({ speakingMode: "upload" });
		await h.upload(created.submissionId, created.uploadToken);
		await h.flush();
		expect((await h.detail(created.leadId)).aiStatus).toBe("failed");
		const res = await teacherPost(
			h.app,
			`/api/leads/${created.leadId}/placement-submission/ai-retry`,
		);
		expect(res.status).toBe(200);
		await h.flush();
		expect(h.calls.transcribe).toBe(2);
	});
});

describe("PATCH chốt + kết quả công khai (#730)", () => {
	const grade = (
		writingErrors: unknown[] = [],
		speakingErrors: unknown[] = [],
	) => ({
		writingRubric: { ct: 4, or: 4, lg: 3 },
		speakingRubric: { gv: 3, dm: 3, pr: 3, ic: 3 },
		teacherFeedback: "Cố gắng chia động từ đúng.",
		writingErrors,
		speakingErrors,
	});

	test("chốt sinh token một lần, định vị lỗi, gửi email; kết quả công khai không lộ nháp AI", async () => {
		const { sent, mailer } = recordingMailer();
		const h = await createHarness({ mailer });
		const created = await h.submit({
			speakingMode: "upload",
			email: "hocvien@test.local",
		});
		await h.upload(created.submissionId, created.uploadToken);
		await h.flush();

		const path = `/api/leads/${created.leadId}/placement-submission`;
		const res = await teacherPost(
			h.app,
			path,
			grade(
				[
					{
						id: "w1",
						category: "grammar",
						quote: "I lives",
						start: 0,
						end: 3,
						correction: "I live",
						explanation: "Chủ ngữ I.",
					},
				],
				[
					{
						id: "s1",
						category: "vocabulary",
						quote: "beach",
						correction: "seaside",
						explanation: "Gợi ý từ khác.",
					},
				],
			),
		);
		expect(res.status).toBe(200);
		const graded = (await res.json()) as PlacementSubmissionDetail;
		expect(graded.status).toBe("graded");
		expect(graded.writingErrors?.[0]).toMatchObject({
			start: ESSAY.indexOf("I lives"),
			end: ESSAY.indexOf("I lives") + 7,
		});
		expect(graded.speakingErrors?.[0]).toMatchObject({
			start: FAKE_PLACEMENT_TRANSCRIPT.indexOf("beach"),
		});
		const match = graded.resultUrl?.match(
			/^https:\/\/msmy\.io\.vn\/kiem-tra-dau-vao\/ket-qua\/\?t=([0-9a-f]{64})$/,
		);
		expect(match).not.toBeNull();
		const token = match?.[1] ?? "";
		expect(graded.resultEmailStatus).toBe("sent");
		expect(sent).toHaveLength(1);
		expect(sent[0]?.to).toBe("hocvien@test.local");
		expect(sent[0]?.text).toContain(graded.resultUrl ?? "-");
		expect(sent[0]?.text).toContain("Học viên A");
		expect(sent[0]?.text).not.toContain("0905");

		// Chốt lại giữ nguyên token.
		const regrade = await teacherPost(h.app, path, grade());
		const regraded = (await regrade.json()) as PlacementSubmissionDetail;
		expect(regraded.resultUrl).toBe(graded.resultUrl);
		expect(regraded.writingErrors).toEqual([]);

		// Kết quả công khai.
		const pub = await h.app.request(`/public/placement-test/results/${token}`, {
			headers: { origin: PROFILE_ORIGIN },
		});
		expect(pub.status).toBe(200);
		expect(pub.headers.get("cache-control")).toBe("no-store");
		expect(pub.headers.get("access-control-allow-origin")).toBe(PROFILE_ORIGIN);
		const view = (await pub.json()) as PlacementPublicResultView &
			Record<string, unknown>;
		expect(view.studentName).toBe("Học viên A");
		expect(view.writingText).toBe(ESSAY);
		expect(view.writingRubric).toEqual({ ct: 4, or: 4, lg: 3 });
		expect(view.speakingTranscript).toBe(FAKE_PLACEMENT_TRANSCRIPT);
		expect(view.teacherFeedback).toBe("Cố gắng chia động từ đúng.");
		expect(view.bandAdvice).toMatch(/^Học Level/);
		expect(view.objective.listening.total).toBe(1);
		for (const key of [
			"aiWriting",
			"aiSpeaking",
			"aiStatus",
			"studentPhone",
			"answers",
			"snapshot",
			"resultUrl",
		]) {
			expect(view).not.toHaveProperty(key);
		}
	});

	test("public results 404 khi token sai định dạng / không tồn tại / chưa chốt", async () => {
		const h = await createHarness();
		const created = await h.submit({ speakingMode: "skipped" });
		await h.flush();
		const bad = await h.app.request("/public/placement-test/results/abc");
		expect(bad.status).toBe(404);
		const unknown = await h.app.request(
			`/public/placement-test/results/${"a".repeat(64)}`,
		);
		expect(unknown.status).toBe(404);

		// Token có nhưng bài chưa chốt (không có published_at) → 404.
		const token = "b".repeat(64);
		await h.db
			.update(schema.placementTestSubmission)
			.set({ resultToken: token })
			.where(eq(schema.placementTestSubmission.id, created.submissionId));
		const notPublished = await h.app.request(
			`/public/placement-test/results/${token}`,
		);
		expect(notPublished.status).toBe(404);
	});

	test("email skipped khi lead không có email; failed khi mailer lỗi", async () => {
		const ok = recordingMailer();
		const h1 = await createHarness({ mailer: ok.mailer });
		const noEmail = await h1.submit({ speakingMode: "skipped" });
		await h1.flush();
		const r1 = await teacherPost(
			h1.app,
			`/api/leads/${noEmail.leadId}/placement-submission`,
			grade(),
		);
		expect(
			((await r1.json()) as PlacementSubmissionDetail).resultEmailStatus,
		).toBe("skipped");
		expect(ok.sent).toHaveLength(0);

		const broken = recordingMailer(true);
		const h2 = await createHarness({ mailer: broken.mailer });
		const withEmail = await h2.submit({
			speakingMode: "skipped",
			email: "hv@test.local",
		});
		await h2.flush();
		const r2 = await teacherPost(
			h2.app,
			`/api/leads/${withEmail.leadId}/placement-submission`,
			grade(),
		);
		expect(r2.status).toBe(200);
		const d2 = (await r2.json()) as PlacementSubmissionDetail;
		expect(d2.resultEmailStatus).toBe("failed");
		expect(d2.resultUrl).not.toBeNull();
		// GET kế tiếp phản ánh cùng trạng thái.
		expect((await h2.detail(withEmail.leadId)).resultEmailStatus).toBe(
			"failed",
		);
	});
});

describe("email kết quả: tóm tắt HTML + link chi tiết", () => {
	const STUDENT_ORIGIN = "https://hoc.msmy.io.vn/";
	const grade = {
		writingRubric: { ct: 4, or: 4, lg: 3 },
		speakingRubric: { gv: 3, dm: 3, pr: 3, ic: 3 },
		teacherFeedback: "",
		writingErrors: [],
		speakingErrors: [],
	};

	async function gradeLead(
		h: Harness,
		email: string,
		body: unknown = grade,
	): Promise<PlacementSubmissionDetail> {
		const created = await h.submit({ speakingMode: "skipped", email });
		await h.flush();
		const res = await teacherPost(
			h.app,
			`/api/leads/${created.leadId}/placement-submission`,
			body,
		);
		expect(res.status).toBe(200);
		return (await res.json()) as PlacementSubmissionDetail;
	}

	async function addUser(h: Harness, email: string, role: string) {
		await h.db.insert(schema.user).values({
			id: `u-${role}-${email}`,
			name: "Tài khoản",
			email,
			role,
		});
	}

	test("người nhận có tài khoản học viên → nút trỏ portal /placement-test; chốt lại không gửi lần hai", async () => {
		const { sent, mailer } = recordingMailer();
		const h = await createHarness({ mailer, studentOrigin: STUDENT_ORIGIN });
		await addUser(h, "hocvien@test.local", "student");

		const graded = await gradeLead(h, " HocVien@Test.local ");
		expect(graded.resultEmailStatus).toBe("sent");
		expect(sent).toHaveLength(1);
		const mail = sent[0];
		const portal = "https://hoc.msmy.io.vn/placement-test";
		expect(mail?.html).toContain(`href="${portal}"`);
		expect(mail?.html).not.toContain("?t=");
		expect(mail?.text).toContain(portal);
		// Tóm tắt khớp kết quả đã chốt (cùng nguồn với portal).
		expect(graded.finalBandLevel).toBe("A2");
		expect(mail?.html).toContain(">A2<");
		expect(mail?.html).toContain("Communication English Level 2");
		expect(mail?.html).toContain(`>${graded.finalScorePct}%<`);
		for (const row of [
			"Listening",
			"Từ vựng &amp; Ngữ pháp",
			"Reading",
			"Writing",
			"Speaking",
		]) {
			expect(mail?.html).toContain(`>${row}<`);
		}
		expect(mail?.html).toContain("1/1 (100%)");
		expect(mail?.html).toContain("11/15 điểm");
		expect(mail?.html).toContain("12/20 điểm");
		expect(mail?.text).toContain(`Điểm tổng hợp: ${graded.finalScorePct}%`);
		expect(mail?.text).not.toContain("0905");

		const regrade = await teacherPost(
			h.app,
			`/api/leads/${graded.leadId}/placement-submission`,
			grade,
		);
		expect(regrade.status).toBe(200);
		expect(sent).toHaveLength(1);
	});

	test("lead chưa có tài khoản (hoặc chỉ có tài khoản giáo viên) → link kết quả công khai; bỏ dòng Speaking khi không chấm", async () => {
		const { sent, mailer } = recordingMailer();
		const h = await createHarness({ mailer, studentOrigin: STUDENT_ORIGIN });
		await addUser(h, "gv@test.local", "teacher");

		const noAccount = await gradeLead(h, "lead@test.local", {
			...grade,
			speakingRubric: null,
		});
		const teacherOnly = await gradeLead(h, "gv@test.local");
		expect(sent).toHaveLength(2);
		for (const [i, detail] of [noAccount, teacherOnly].entries()) {
			expect(detail.resultUrl).toMatch(/\?t=[0-9a-f]{64}$/);
			expect(sent[i]?.html).toContain(
				`href="${(detail.resultUrl ?? "").replaceAll("&", "&amp;")}"`,
			);
			expect(sent[i]?.text).toContain(detail.resultUrl ?? "-");
			expect(sent[i]?.html).not.toContain('/placement-test"');
		}
		expect(sent[0]?.html).not.toContain("Speaking");
		expect(sent[1]?.html).toContain(">Speaking<");
	});

	test("không cấu hình studentOrigin → luôn dùng link công khai", async () => {
		const { sent, mailer } = recordingMailer();
		const h = await createHarness({ mailer });
		await addUser(h, "hocvien@test.local", "student");

		const graded = await gradeLead(h, "hocvien@test.local");
		expect(graded.resultEmailStatus).toBe("sent");
		expect(sent[0]?.html).toContain(`href="${graded.resultUrl}"`);
		expect(sent[0]?.text).toContain(graded.resultUrl ?? "-");
	});

	test("tra cứu tài khoản lỗi → fail-open về link công khai", async () => {
		const publicUrl = "https://msmy.io.vn/kiem-tra-dau-vao/ket-qua/?t=x";
		// Test double: chỉ cần `select` ném lỗi để kiểm tra fail-open.
		const brokenDb = {
			select() {
				throw new Error("db down");
			},
		} as unknown as Db;
		await expect(
			resolvePlacementResultLink(brokenDb, {
				recipientEmail: "hocvien@test.local",
				studentOrigin: STUDENT_ORIGIN,
				publicUrl,
			}),
		).resolves.toBe(publicUrl);
	});
});

async function rowOf(h: Harness, submissionId: string) {
	const [row] = await h.db
		.select()
		.from(schema.placementTestSubmission)
		.where(eq(schema.placementTestSubmission.id, submissionId))
		.limit(1);
	if (!row) throw new Error("submission not found");
	return row;
}

function makeStale(h: Harness, submissionId: string) {
	return h.db
		.update(schema.placementTestSubmission)
		.set({
			aiStartedAt: new Date(Date.now() - PLACEMENT_AI_STALE_AFTER_MS - 1000),
		})
		.where(eq(schema.placementTestSubmission.id, submissionId));
}

const finalGrade = {
	writingRubric: { ct: 4, or: 4, lg: 3 },
	speakingRubric: { gv: 3, dm: 3, pr: 3, ic: 3 },
	teacherFeedback: "Cố gắng chia động từ đúng.",
	writingErrors: [],
	speakingErrors: [],
};

describe("chấm nền qua job OpenAI background + finalize lười (#730)", () => {
	test("poll lỗi tạm thời kéo dài quá trần cứng → failed TIMEOUT, không treo mãi", async () => {
		const h = await createHarness({ grader: { transientPoll: true } });
		const { submissionId, leadId } = await h.submit({
			speakingMode: "skipped",
		});
		await h.flush();
		await h.db
			.update(schema.placementTestSubmission)
			.set({
				aiStartedAt: new Date(Date.now() - PLACEMENT_AI_HARD_TIMEOUT_MS - 1000),
			})
			.where(eq(schema.placementTestSubmission.id, submissionId));
		const d = await h.detail(leadId);
		expect(d.aiStatus).toBe("failed");
		expect(d.aiErrorCode).toBe("AI_GRADING_TIMEOUT");
	});

	test("chấm lại mà Speaking hỏng → bỏ nháp Speaking cũ, giữ Writing mới", async () => {
		// Harness spread options → giữ tham chiếu object con để đổi giữa test.
		const failPoll: NonNullable<FakePlacementAiGraderOptions["failPoll"]> = {};
		const h = await createHarness({ grader: { failPoll } });
		const created = await h.submit({ speakingMode: "upload" });
		await h.upload(created.submissionId, created.uploadToken);
		await h.flush();
		const first = await h.detail(created.leadId);
		expect(first.aiStatus).toBe("drafted");
		expect(first.aiSpeaking).not.toBeNull();

		failPoll.speaking = true;
		const retry = await teacherPost(
			h.app,
			`/api/leads/${created.leadId}/placement-submission/ai-retry`,
		);
		expect(retry.status).toBe(200);
		await h.flush();
		const after = await h.detail(created.leadId);
		expect(after.aiStatus).toBe("failed");
		expect(after.aiErrorCode).toBe("AI_GRADING_FAILED");
		expect(after.aiWriting).not.toBeNull();
		expect(after.aiSpeaking).toBeNull();
	});

	test("chấm lại mà không tạo được job Speaking → bỏ nháp Speaking cũ ngay ở pha nền", async () => {
		const failStart: NonNullable<FakePlacementAiGraderOptions["failStart"]> =
			{};
		const h = await createHarness({ grader: { failStart } });
		const created = await h.submit({ speakingMode: "upload" });
		await h.upload(created.submissionId, created.uploadToken);
		await h.flush();
		expect((await h.detail(created.leadId)).aiSpeaking).not.toBeNull();

		failStart.speaking = true;
		const retry = await teacherPost(
			h.app,
			`/api/leads/${created.leadId}/placement-submission/ai-retry`,
		);
		expect(retry.status).toBe(200);
		await h.flush();
		const row = await rowOf(h, created.submissionId);
		expect(row.aiSpeakingJson).toBeNull();
		expect(row.aiSpeakingResponseId).toBeNull();
		expect(row.aiWritingResponseId).not.toBeNull();

		const after = await h.detail(created.leadId);
		expect(after.aiStatus).toBe("failed");
		expect(after.aiErrorCode).toBe("AI_GRADING_FAILED");
		expect(after.aiWriting).not.toBeNull();
		expect(after.aiSpeaking).toBeNull();
	});

	test("cả hai kỹ năng không tạo được job → failed và bỏ cả hai nháp cũ", async () => {
		const failStart: NonNullable<FakePlacementAiGraderOptions["failStart"]> =
			{};
		const h = await createHarness({ grader: { failStart } });
		const created = await h.submit({ speakingMode: "upload" });
		await h.upload(created.submissionId, created.uploadToken);
		await h.flush();
		expect((await h.detail(created.leadId)).aiStatus).toBe("drafted");

		failStart.writing = true;
		failStart.speaking = true;
		await teacherPost(
			h.app,
			`/api/leads/${created.leadId}/placement-submission/ai-retry`,
		);
		await h.flush();
		const after = await h.detail(created.leadId);
		expect(after.aiStatus).toBe("failed");
		expect(after.aiWriting).toBeNull();
		expect(after.aiSpeaking).toBeNull();
	});

	test("mọi lời gọi OpenAI đều có deadline (pha nền dùng chung, poll riêng)", async () => {
		const signals: Array<AbortSignal | undefined> = [];
		const h = await createHarness({ grader: { signals } });
		const created = await h.submit({ speakingMode: "upload" });
		await h.upload(created.submissionId, created.uploadToken);
		await h.flush();
		// startWriting + transcribe + startSpeaking dùng cùng một deadline.
		expect(signals).toHaveLength(3);
		expect(signals.every((s) => s instanceof AbortSignal)).toBe(true);
		expect(new Set(signals).size).toBe(1);
		await h.detail(created.leadId);
		const pollSignals = signals.slice(3);
		expect(pollSignals).toHaveLength(2);
		expect(pollSignals.every((s) => s instanceof AbortSignal)).toBe(true);
		expect(pollSignals).not.toContain(signals[0]);
	});

	test("pipeline chỉ tạo job và lưu id; GET poll, xong hết → drafted", async () => {
		const h = await createHarness({ grader: { pendingPolls: 1 } });
		const created = await h.submit({ speakingMode: "upload" });
		await h.upload(created.submissionId, created.uploadToken);
		await h.flush();

		const started = await rowOf(h, created.submissionId);
		expect(started.aiStatus).toBe("processing");
		expect(started.aiWritingResponseId).toMatch(/^fake-writing-/);
		expect(started.aiSpeakingResponseId).toMatch(/^fake-speaking-/);
		// Transcript lưu ngay ở pha khởi tạo.
		expect(started.speakingTranscript).toBe(FAKE_PLACEMENT_TRANSCRIPT);
		expect(h.calls.poll).toBe(0);

		const first = await h.detail(created.leadId);
		expect(first.aiStatus).toBe("processing");
		expect(first.aiWriting).toBeNull();
		expect(h.calls.poll).toBe(2);

		const second = await h.detail(created.leadId);
		expect(second.aiStatus).toBe("drafted");
		expect(second.aiErrorCode).toBeNull();
		expect(second.aiWriting?.rubric).toEqual({ ct: 3, or: 3, lg: 3 });
		expect(second.aiSpeaking?.rubric).toEqual({ gv: 3, dm: 3, pr: 3, ic: 3 });
		const done = await rowOf(h, created.submissionId);
		expect(done.aiWritingResponseId).toBeNull();
		expect(done.aiSpeakingResponseId).toBeNull();

		// Đã xong → mở lại không poll nữa.
		await h.detail(created.leadId);
		expect(h.calls.poll).toBe(4);
	});

	test("lưu nháp từng phần: Writing xong trong khi Speaking còn chạy", async () => {
		const h = await createHarness({
			grader: { pendingPolls: { speaking: 1 } },
		});
		const created = await h.submit({ speakingMode: "upload" });
		await h.upload(created.submissionId, created.uploadToken);
		await h.flush();

		const partial = await h.detail(created.leadId);
		expect(partial.aiStatus).toBe("processing");
		expect(partial.aiWriting?.rubric.ct).toBe(3);
		expect(partial.aiSpeaking).toBeNull();
		const row = await rowOf(h, created.submissionId);
		expect(row.aiWritingResponseId).toBeNull();
		expect(row.aiSpeakingResponseId).not.toBeNull();

		const done = await h.detail(created.leadId);
		expect(done.aiStatus).toBe("drafted");
		expect(done.aiSpeaking?.rubric.gv).toBe(3);
		// Writing không bị poll lại sau khi đã có kết quả.
		expect(h.calls.poll).toBe(3);
	});

	test("hai lượt mở bài đồng thời không ghi chồng (CAS trên id job)", async () => {
		const h = await createHarness();
		const { leadId } = await h.submit({ speakingMode: "skipped" });
		await h.flush();
		const [a, b] = await Promise.all([h.detail(leadId), h.detail(leadId)]);
		expect(a.aiStatus).toBe("drafted");
		expect(b.aiStatus).toBe("drafted");
		expect(b.aiWriting?.rubric).toEqual({ ct: 3, or: 3, lg: 3 });
	});

	test("poll lỗi mạng tạm thời → giữ processing kể cả quá 15 phút; sweep không đụng lượt có job", async () => {
		const h = await createHarness({ grader: { transientPoll: true } });
		const { submissionId, leadId } = await h.submit({
			speakingMode: "skipped",
		});
		await h.flush();
		expect((await h.detail(leadId)).aiStatus).toBe("processing");
		await makeStale(h, submissionId);
		const d = await h.detail(leadId);
		expect(d.aiStatus).toBe("processing");
		expect(d.aiErrorCode).toBeNull();
		expect((await rowOf(h, submissionId)).aiWritingResponseId).not.toBeNull();
	});

	test("job còn chạy sau 15 phút → failed TIMEOUT nhưng giữ phần đã xong", async () => {
		const h = await createHarness({
			grader: { pendingPolls: { speaking: 100 } },
		});
		const created = await h.submit({ speakingMode: "upload" });
		await h.upload(created.submissionId, created.uploadToken);
		await h.flush();
		expect((await h.detail(created.leadId)).aiStatus).toBe("processing");

		await makeStale(h, created.submissionId);
		const d = await h.detail(created.leadId);
		expect(d.aiStatus).toBe("failed");
		expect(d.aiErrorCode).toBe(PLACEMENT_AI_ERROR_CODES.TIMEOUT);
		expect(d.aiWriting?.rubric.ct).toBe(3);
		expect(d.aiSpeaking).toBeNull();
	});

	test("lỗi khi tạo job (không job nào chạy) → failed ngay, không poll", async () => {
		const h = await createHarness({ grader: { error: new Error("boom") } });
		const { submissionId, leadId } = await h.submit({
			speakingMode: "skipped",
		});
		await h.flush();
		const row = await rowOf(h, submissionId);
		expect(row.aiStatus).toBe("failed");
		expect(row.aiErrorCode).toBe(PLACEMENT_AI_ERROR_CODES.FAILED);
		expect((await h.detail(leadId)).aiStatus).toBe("failed");
		expect(h.calls.poll).toBe(0);
	});

	test("bài đã chốt trước khi upload: pipeline không ghi đè transcript", async () => {
		const h = await createHarness();
		const created = await h.submit({ speakingMode: "upload" });
		const patch = await teacherPost(
			h.app,
			`/api/leads/${created.leadId}/placement-submission`,
			finalGrade,
		);
		expect(patch.status).toBe(200);
		await h.upload(created.submissionId, created.uploadToken);
		await h.flush();
		const d = await h.detail(created.leadId);
		expect(d.status).toBe("graded");
		expect(d.speakingTranscript).toBe("");
		expect(h.calls.transcribe).toBe(1);
	});
});

describe("ai-retry: content-type, bài đã chốt, bài bỏ ngang (#730)", () => {
	test("POST thiếu Content-Type JSON → 415; có JSON body → 200", async () => {
		const h = await createHarness();
		const { leadId } = await h.submit({ speakingMode: "skipped" });
		await h.flush();
		const path = `/api/leads/${leadId}/placement-submission/ai-retry`;
		const bare = await h.app.request(path, {
			method: "POST",
			headers: { "x-test-user": "t1", origin: CORS_ORIGIN },
		});
		expect(bare.status).toBe(415);
		const ok = await h.app.request(path, {
			method: "POST",
			headers: {
				"x-test-user": "t1",
				origin: CORS_ORIGIN,
				"Content-Type": "application/json",
			},
			body: "{}",
		});
		expect(ok.status).toBe(200);
	});

	test("kết quả đã chốt → 409, không chấm lại", async () => {
		const h = await createHarness();
		const { leadId } = await h.submit({ speakingMode: "skipped" });
		await h.flush();
		await h.detail(leadId);
		const patch = await teacherPost(
			h.app,
			`/api/leads/${leadId}/placement-submission`,
			finalGrade,
		);
		expect(patch.status).toBe(200);
		const res = await teacherPost(
			h.app,
			`/api/leads/${leadId}/placement-submission/ai-retry`,
		);
		expect(res.status).toBe(409);
		expect(((await res.json()) as { code: string }).code).toBe(
			"PLACEMENT_AI_RETRY_CONFLICT",
		);
		expect(h.calls.writing).toBe(1);
	});

	test("bài bỏ ngang upload (none, có Writing) → chấm được từ none", async () => {
		const h = await createHarness();
		const { leadId } = await h.submit({ speakingMode: "upload" });
		await h.flush();
		expect((await h.detail(leadId)).aiStatus).toBe("none");
		const res = await teacherPost(
			h.app,
			`/api/leads/${leadId}/placement-submission/ai-retry`,
		);
		expect(res.status).toBe(200);
		expect(((await res.json()) as PlacementSubmissionDetail).aiStatus).toBe(
			"processing",
		);
		await h.flush();
		const d = await h.detail(leadId);
		expect(d.aiStatus).toBe("drafted");
		expect(d.aiWriting?.rubric.ct).toBe(3);
	});

	test("retry lưu kết quả lượt cũ đã xong rồi mới claim lượt mới", async () => {
		const h = await createHarness();
		const { submissionId, leadId } = await h.submit({
			speakingMode: "skipped",
		});
		await h.flush();
		expect((await rowOf(h, submissionId)).aiStatus).toBe("processing");
		const res = await teacherPost(
			h.app,
			`/api/leads/${leadId}/placement-submission/ai-retry`,
		);
		expect(res.status).toBe(200);
		await h.flush();
		expect(h.calls.writing).toBe(2);
		expect((await h.detail(leadId)).aiStatus).toBe("drafted");
	});
});

describe("chốt kết quả: token và email (#730)", () => {
	test("hai lượt chốt đầu đồng thời dùng chung một token, chỉ một email", async () => {
		const { sent, mailer } = recordingMailer();
		const h = await createHarness({ mailer });
		const { leadId } = await h.submit({
			speakingMode: "skipped",
			email: "hv@test.local",
		});
		await h.flush();
		const path = `/api/leads/${leadId}/placement-submission`;
		const [a, b] = await Promise.all([
			teacherPost(h.app, path, finalGrade),
			teacherPost(h.app, path, finalGrade),
		]);
		const da = (await a.json()) as PlacementSubmissionDetail;
		const dbody = (await b.json()) as PlacementSubmissionDetail;
		expect(da.resultUrl).not.toBeNull();
		expect(dbody.resultUrl).toBe(da.resultUrl);
		expect((await h.detail(leadId)).resultUrl).toBe(da.resultUrl);
		expect(sent).toHaveLength(1);
		expect(sent[0]?.text).toContain(da.resultUrl ?? "-");
	});

	test("chốt lại không gửi email nữa và giữ trạng thái email cũ", async () => {
		const { sent, mailer } = recordingMailer();
		const h = await createHarness({ mailer });
		const { leadId } = await h.submit({
			speakingMode: "skipped",
			email: "hv@test.local",
		});
		await h.flush();
		const path = `/api/leads/${leadId}/placement-submission`;
		const first = (await (
			await teacherPost(h.app, path, finalGrade)
		).json()) as PlacementSubmissionDetail;
		expect(first.resultEmailStatus).toBe("sent");

		const again = await teacherPost(h.app, path, {
			...finalGrade,
			teacherFeedback: "Sửa nhận xét.",
		});
		expect(again.status).toBe(200);
		const regraded = (await again.json()) as PlacementSubmissionDetail;
		expect(regraded.teacherFeedback).toBe("Sửa nhận xét.");
		expect(regraded.resultEmailStatus).toBe("sent");
		expect(regraded.resultUrl).toBe(first.resultUrl);
		expect(sent).toHaveLength(1);
	});

	test("chốt lại sau lần gửi lỗi vẫn giữ failed, không gửi lại", async () => {
		let attempts = 0;
		const mailer: Mailer = {
			async send() {
				attempts += 1;
				throw new Error("smtp down");
			},
		};
		const h = await createHarness({ mailer });
		const { leadId } = await h.submit({
			speakingMode: "skipped",
			email: "hv@test.local",
		});
		await h.flush();
		const path = `/api/leads/${leadId}/placement-submission`;
		await teacherPost(h.app, path, finalGrade);
		const again = (await (
			await teacherPost(h.app, path, finalGrade)
		).json()) as PlacementSubmissionDetail;
		expect(again.resultEmailStatus).toBe("failed");
		expect(attempts).toBe(1);
	});

	test("getter mailer throw → email failed, chốt vẫn 200", async () => {
		const h = await createHarness({ brokenMailer: true });
		const { leadId } = await h.submit({
			speakingMode: "skipped",
			email: "hv@test.local",
		});
		await h.flush();
		const res = await teacherPost(
			h.app,
			`/api/leads/${leadId}/placement-submission`,
			finalGrade,
		);
		expect(res.status).toBe(200);
		const d = (await res.json()) as PlacementSubmissionDetail;
		expect(d.status).toBe("graded");
		expect(d.resultUrl).not.toBeNull();
		expect(d.resultEmailStatus).toBe("failed");
	});
});
