import { createClient } from "@libsql/client";
import {
	CREDIT_COSTS,
	creditWalletSchema,
	EXAM_IMPORT_ERROR_CODES,
	type ExamImportJob,
	examImportCreateResponseSchema,
	examImportJobSchema,
	examImportLookupResponseSchema,
	examImportPublishResponseSchema,
	TRIAL_CREDITS,
} from "@teacher-os/api/contracts";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import {
	assignmentTest,
	assignmentTestPart,
} from "@teacher-os/db/schema/assignment-test";
import {
	creditUsageLog,
	creditWallet,
} from "@teacher-os/db/schema/credit-wallet";
import { examImportJob } from "@teacher-os/db/schema/exam-import-job";
import * as schema from "@teacher-os/db/schema/index";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
	type AppDeps,
	buildApp,
	type Db,
	enforceDeclaredSize,
	type MediaStore,
	type ServerApp,
} from "../app";
import {
	type ExamExtractor,
	ExtractionFailedError,
} from "../lib/exam-import/extractor";
import { createFakeExamExtractor } from "../lib/exam-import/fake-extractor";
import { sha256Hex } from "../lib/exam-import/fingerprint";
import type { SessionUser } from "../session";

const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

const PDF_BYTES = new Uint8Array(2048).fill(0x25); // "%PDF"-ish bytes giả

const sessionFor = async (headers: Headers): Promise<SessionUser | null> => {
	// `role` ở đây là ACCOUNT role (SessionUser); role org ("ta") đọc từ
	// bảng membership bởi bootstrapMiddleware.
	const userKey = headers.get("x-test-user");
	if (userKey === "teacher") {
		return {
			userId: "u-teacher",
			userName: "Cô Lan",
			email: "lan@test.local",
			emailVerified: true,
			role: "teacher" as const,
		};
	}
	if (userKey === "ta") {
		return {
			userId: "u-ta",
			userName: "Trợ giảng",
			email: "ta@test.local",
			emailVerified: true,
			role: "teacher" as const,
		};
	}
	if (userKey === "other-org") {
		return {
			userId: "u-teacher2",
			userName: "Thầy Hùng",
			email: "hung@test.local",
			emailVerified: true,
			role: "teacher" as const,
		};
	}
	return null;
};

/** Store Map trong bộ nhớ — kiểm file R2 thật sự bị xoá khi reserve thua. */
interface MemoryMediaStore {
	store: MediaStore;
	objects: Map<string, { bytes: Uint8Array; contentType: string }>;
}

function createMemoryMediaStore(): MemoryMediaStore {
	const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
	const store: MediaStore = {
		async put(key, body, { contentType, size }) {
			const counted = enforceDeclaredSize(body, size);
			const bytes = new Uint8Array(
				await new Response(counted.stream).arrayBuffer(),
			);
			objects.set(key, { bytes, contentType });
		},
		async get(key) {
			const object = objects.get(key);
			if (!object) return null;
			return {
				body: new Response(object.bytes).body as ReadableStream<Uint8Array>,
				contentType: object.contentType,
				size: object.bytes.byteLength,
			};
		},
		async delete(key) {
			objects.delete(key);
		},
	};
	return { store, objects };
}

describe("exam imports + ví Credit (TOS-24 #470)", () => {
	let db: Db;
	let memory: MemoryMediaStore;
	let app: ServerApp;
	let appDisabled: ServerApp;
	let appBrokenExtractor: ServerApp;
	let appBrokenStore: ServerApp;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		]);
		await db.insert(schema.user).values([
			{
				id: "u-teacher",
				name: "Cô Lan",
				email: "lan@test.local",
				role: "teacher",
			},
			{
				id: "u-ta",
				name: "Trợ giảng",
				email: "ta@test.local",
				role: "teacher",
			},
			{
				id: "u-teacher2",
				name: "Thầy Hùng",
				email: "hung@test.local",
				role: "teacher",
			},
		]);
		await db.insert(schema.membership).values([
			{ id: "m-1", orgId: "org-1", userId: "u-teacher", role: "teacher" },
			{ id: "m-2", orgId: "org-1", userId: "u-ta", role: "ta" },
			{ id: "m-3", orgId: "org-2", userId: "u-teacher2", role: "teacher" },
		]);

		memory = createMemoryMediaStore();
		const baseDeps: AppDeps = {
			getDb: () => db,
			corsOrigin: ["http://localhost:8001"],
			getSessionUser: sessionFor,
			authHandler: () => new Response("auth OK"),
		};
		const failingExtractor: ExamExtractor = {
			extract: () => Promise.reject(new ExtractionFailedError("boom")),
		};
		app = buildApp({
			...baseDeps,
			getExamImportStore: () => memory.store,
			getExamExtractor: () => createFakeExamExtractor(),
		});
		appDisabled = buildApp(baseDeps);
		appBrokenExtractor = buildApp({
			...baseDeps,
			getExamImportStore: () => memory.store,
			getExamExtractor: () => failingExtractor,
		});
		// store.put luôn hỏng — mô phỏng R2 503/quota (kongming review #470
		// Important #1: put hỏng sau reserve vẫn phải release + failed_refunded).
		appBrokenStore = buildApp({
			...baseDeps,
			getExamImportStore: () => ({
				put: () => Promise.reject(new Error("r2 unavailable")),
				get: () => Promise.resolve(null),
				delete: () => Promise.resolve(),
			}),
			getExamExtractor: () => createFakeExamExtractor(),
		});
	});

	beforeEach(async () => {
		await db.delete(assignmentTestPart);
		await db.delete(assignmentTest);
		await db.delete(assignmentPrompt);
		await db.delete(creditUsageLog);
		await db.delete(creditWallet);
		await db.delete(examImportJob);
		memory.objects.clear();
	});

	function upload(
		target: ServerApp = app,
		user = "teacher",
		overrides: Record<string, string> = {},
	) {
		return target.request("/api/exam-imports", {
			method: "POST",
			headers: {
				"x-test-user": user,
				"Content-Type": "application/pdf",
				"Content-Length": String(PDF_BYTES.byteLength),
				"X-File-Name": encodeURIComponent("cambridge-sample.pdf"),
				...overrides,
			},
			body: PDF_BYTES,
		});
	}

	async function walletLogs(orgId = "org-1") {
		return (
			db
				.select()
				.from(creditUsageLog)
				.where(eq(creditUsageLog.orgId, orgId))
				// rowid = thứ tự chèn (createdAt có thể cùng ms).
				.orderBy(creditUsageLog.createdAt, sql`rowid`)
		);
	}

	test("happy path: reserve + settle đúng 1 log, ví 30→25, needsReview đúng 1 câu", async () => {
		const res = await upload();
		expect(res.status).toBe(200);
		const job = examImportJobSchema.parse(await res.json());
		expect(job.importStatus).toBe("completed");
		expect(job.pageCount).toBe(2);
		expect(job.heldCredits).toBe(CREDIT_COSTS.examImport);
		expect(job.draft?.title).toBe("Cambridge IELTS Sample");
		const questions = job.draft?.parts[0]?.questions ?? [];
		expect(questions).toHaveLength(3);
		expect(questions.filter((q) => q.needsReview)).toHaveLength(1);
		expect(questions.filter((q) => !q.needsReview)).toHaveLength(2);

		// Ví: 30 → 25, held nhả hết; đúng 1 reserved + 1 settled.
		const wallet = creditWalletSchema.parse(
			await (
				await app.request("/api/credits/wallet", {
					headers: { "x-test-user": "teacher" },
				})
			).json(),
		);
		expect(wallet).toEqual({
			balance: TRIAL_CREDITS - CREDIT_COSTS.examImport,
			held: 0,
			available: TRIAL_CREDITS - CREDIT_COSTS.examImport,
		});
		const logs = await walletLogs();
		expect(logs.map((row) => row.txStatus)).toEqual(["reserved", "settled"]);

		// File nằm đúng key R2 org-scoped.
		expect(memory.objects.has(`exam-imports/org-1/${job.id}`)).toBe(true);
		expect(
			memory.objects.get(`exam-imports/org-1/${job.id}`)?.contentType,
		).toBe("application/pdf");

		// GET job + file đọc lại được.
		const getRes = await app.request(`/api/exam-imports/${job.id}`, {
			headers: { "x-test-user": "teacher" },
		});
		expect(getRes.status).toBe(200);
		expect(examImportJobSchema.parse(await getRes.json())).toEqual(job);
		const fileRes = await app.request(`/api/exam-imports/${job.id}/file`, {
			headers: { "x-test-user": "teacher" },
		});
		expect(fileRes.status).toBe(200);
		expect(fileRes.headers.get("Content-Type")).toBe("application/pdf");
	});

	test("thiếu Credit: 402 kèm balance, xoá sạch job + file + không log", async () => {
		await db
			.insert(creditWallet)
			.values({ orgId: "org-1", balance: CREDIT_COSTS.examImport - 1 });
		const res = await upload();
		expect(res.status).toBe(402);
		const body = (await res.json()) as {
			code: string;
			balance: number;
			available: number;
		};
		expect(body.code).toBe(EXAM_IMPORT_ERROR_CODES.INSUFFICIENT_CREDITS);
		expect(body.balance).toBe(CREDIT_COSTS.examImport - 1);
		// Không có reserve đang giữ → available = balance (held = 0).
		expect(body.available).toBe(CREDIT_COSTS.examImport - 1);
		const jobs = await db.select().from(examImportJob);
		expect(jobs).toHaveLength(0);
		expect(memory.objects.size).toBe(0);
		expect(await walletLogs()).toHaveLength(0);
	});

	test("extractor ném lỗi: job failed_refunded, log released, ví nguyên 30", async () => {
		const res = await upload(appBrokenExtractor);
		expect(res.status).toBe(502);
		const body = (await res.json()) as { code: string; jobId: string };
		expect(body.code).toBe(EXAM_IMPORT_ERROR_CODES.FAILED);
		const [job] = await db
			.select()
			.from(examImportJob)
			.where(eq(examImportJob.id, body.jobId));
		expect(job?.importStatus).toBe("failed_refunded");
		expect(job?.errorCode).toBe("EXTRACTION_FAILED");
		const wallet = await db
			.select()
			.from(creditWallet)
			.where(eq(creditWallet.orgId, "org-1"));
		expect(wallet[0]?.balance).toBe(TRIAL_CREDITS);
		expect(wallet[0]?.held).toBe(0);
		const logs = await walletLogs();
		expect(logs.map((row) => row.txStatus)).toEqual(["reserved", "released"]);
		// Job vẫn đọc được (failed_refunded) nhưng không lộ draft.
		const dto = examImportJobSchema.parse(
			await (
				await app.request(`/api/exam-imports/${body.jobId}`, {
					headers: { "x-test-user": "teacher" },
				})
			).json(),
		);
		expect(dto.importStatus).toBe("failed_refunded");
		expect(dto.draft).toBeNull();
	});

	test("store.put hỏng sau reserve: job failed_refunded, log released, ví nguyên 30 (Important #1)", async () => {
		const res = await upload(appBrokenStore);
		expect(res.status).toBe(502);
		const body = (await res.json()) as { code: string; jobId: string };
		expect(body.code).toBe(EXAM_IMPORT_ERROR_CODES.FAILED);
		const [job] = await db
			.select()
			.from(examImportJob)
			.where(eq(examImportJob.id, body.jobId));
		// Không job zombie `processing` — credit không kẹt held.
		expect(job?.importStatus).toBe("failed_refunded");
		const wallet = await db
			.select()
			.from(creditWallet)
			.where(eq(creditWallet.orgId, "org-1"));
		expect(wallet[0]?.balance).toBe(TRIAL_CREDITS);
		expect(wallet[0]?.held).toBe(0);
		const logs = await walletLogs();
		expect(logs.map((row) => row.txStatus)).toEqual(["reserved", "released"]);
	});

	test("org khác không đọc được job/file của org-1 (404 cùng mã)", async () => {
		const res = await upload();
		const job = (await res.json()) as ExamImportJob;
		const getRes = await app.request(`/api/exam-imports/${job.id}`, {
			headers: { "x-test-user": "other-org" },
		});
		expect(getRes.status).toBe(404);
		expect(((await getRes.json()) as { code: string }).code).toBe(
			EXAM_IMPORT_ERROR_CODES.NOT_FOUND,
		);
		const fileRes = await app.request(`/api/exam-imports/${job.id}/file`, {
			headers: { "x-test-user": "other-org" },
		});
		expect(fileRes.status).toBe(404);
		expect(((await fileRes.json()) as { code: string }).code).toBe(
			EXAM_IMPORT_ERROR_CODES.NOT_FOUND,
		);
	});

	test("MIME không thuộc danh sách → 400 E-selfomy-alignment-003", async () => {
		const res = await upload(app, "teacher", {
			"Content-Type": "text/plain",
		});
		expect(res.status).toBe(400);
		expect(((await res.json()) as { code: string }).code).toBe(
			EXAM_IMPORT_ERROR_CODES.INVALID_FILE,
		);
	});

	test("binding AI/kho vắng mặt → 503 EXAM_IMPORT_DISABLED", async () => {
		const res = await upload(appDisabled);
		expect(res.status).toBe(503);
		expect(((await res.json()) as { code: string }).code).toBe(
			EXAM_IMPORT_ERROR_CODES.DISABLED,
		);
	});

	test("role ta POST → 403 (chỉ teacher/owner được nhập đề)", async () => {
		const res = await upload(app, "ta");
		expect(res.status).toBe(403);
	});

	test("chưa đăng nhập → 401", async () => {
		const res = await upload(app, "nobody");
		expect(res.status).toBe(401);
	});

	test("GET /credits/wallet tạo lười ví 30 Credit cho org mới", async () => {
		const res = await app.request("/api/credits/wallet", {
			headers: { "x-test-user": "other-org" },
		});
		expect(res.status).toBe(200);
		expect(creditWalletSchema.parse(await res.json())).toEqual({
			balance: TRIAL_CREDITS,
			held: 0,
			available: TRIAL_CREDITS,
		});
	});

	test("TOS-26 PATCH /:id/draft: cập nhật draft 0 Credit (không ghi thêm log ví), giữ nguyên needsReview=true", async () => {
		const uploadRes = await upload();
		const created = examImportJobSchema.parse(await uploadRes.json());
		const logsBefore = await walletLogs();
		expect(logsBefore).toHaveLength(2);

		const initialDraft = created.draft;
		if (!initialDraft) throw new Error("expected created.draft");
		const editedDraft = {
			...initialDraft,
			title: "Cambridge IELTS 18 — Đã sửa tay",
			parts: initialDraft.parts.map((part) => ({
				questions: part.questions.map((q, idx) =>
					idx === 2
						? {
								...q,
								answer: "infrastructure",
								explanation: "Đoạn 2 nêu rõ hạ tầng quyết định.",
								// Thử gửi needsReview=false từ client — server phải giữ nguyên true.
								needsReview: false,
							}
						: q,
				),
			})),
		};

		const patchRes = await app.request(
			`/api/exam-imports/${created.id}/draft`,
			{
				method: "PATCH",
				headers: {
					"x-test-user": "teacher",
					Origin: "http://localhost:8001",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ draft: editedDraft }),
			},
		);
		expect(patchRes.status).toBe(200);
		const updated = examImportJobSchema.parse(await patchRes.json());
		expect(updated.draft?.title).toBe("Cambridge IELTS 18 — Đã sửa tay");
		expect(updated.draft?.parts[0]?.questions[2]?.answer).toBe(
			"infrastructure",
		);
		expect(updated.draft?.parts[0]?.questions[2]?.needsReview).toBe(true);

		// Ví và log ví hoàn toàn không đổi (0 Credit).
		const logsAfter = await walletLogs();
		expect(logsAfter).toHaveLength(2);
		const [wallet] = await db
			.select()
			.from(creditWallet)
			.where(eq(creditWallet.orgId, "org-1"));
		expect(wallet?.balance).toBe(TRIAL_CREDITS - CREDIT_COSTS.examImport);
	});

	test("TOS-26 POST /:id/publish: cổng xác nhận 422 khi reviewConfirmed=false, 200 ready khi reviewConfirmed=true, idempotent lần 2", async () => {
		const uploadRes = await upload();
		const created = examImportJobSchema.parse(await uploadRes.json());
		const initialDraft = created.draft;
		if (!initialDraft) throw new Error("expected created.draft");
		const editedDraft = {
			...initialDraft,
			parts: initialDraft.parts.map((part) => ({
				questions: part.questions.map((q, idx) =>
					idx === 2 ? { ...q, answer: "infrastructure" } : q,
				),
			})),
		};

		// 1. Chưa tích xác nhận → 422 REVIEW_CONFIRMATION_REQUIRED
		const unconfirmedRes = await app.request(
			`/api/exam-imports/${created.id}/publish`,
			{
				method: "POST",
				headers: {
					"x-test-user": "teacher",
					Origin: "http://localhost:8001",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					draft: editedDraft,
					reviewConfirmed: false,
				}),
			},
		);
		expect(unconfirmedRes.status).toBe(422);
		const unconfirmedBody: unknown = await unconfirmedRes.json();
		expect(
			unconfirmedBody &&
				typeof unconfirmedBody === "object" &&
				"code" in unconfirmedBody
				? unconfirmedBody.code
				: undefined,
		).toBe(EXAM_IMPORT_ERROR_CODES.REVIEW_CONFIRMATION_REQUIRED);

		// 2. Đã tích xác nhận → 200 { testId, status: "ready" }
		const publishRes = await app.request(
			`/api/exam-imports/${created.id}/publish`,
			{
				method: "POST",
				headers: {
					"x-test-user": "teacher",
					Origin: "http://localhost:8001",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					draft: editedDraft,
					reviewConfirmed: true,
				}),
			},
		);
		expect(publishRes.status).toBe(200);
		const published = examImportPublishResponseSchema.parse(
			await publishRes.json(),
		);
		expect(published.status).toBe("ready");
		expect(published.testId).toBe(`test-import-${created.id}`);

		// 3. Gọi publish lần 2 → trả cùng testId, không nhân bản bộ đề
		const publishAgainRes = await app.request(
			`/api/exam-imports/${created.id}/publish`,
			{
				method: "POST",
				headers: {
					"x-test-user": "teacher",
					Origin: "http://localhost:8001",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					draft: editedDraft,
					reviewConfirmed: true,
				}),
			},
		);
		expect(publishAgainRes.status).toBe(200);
		expect(await publishAgainRes.json()).toEqual(published);

		const testsInDb = await db
			.select()
			.from(assignmentTest)
			.where(eq(assignmentTest.orgId, "org-1"));
		expect(testsInDb).toHaveLength(1);
	});

	test("TOS-26 guard: vượt số slot preset → 422 TOO_MANY_PARTS; org khác → 404; role ta → 403; Origin lạ → 403; non-JSON → 415", async () => {
		const uploadRes = await upload();
		const created = examImportJobSchema.parse(await uploadRes.json());
		const initialDraft = created.draft;
		const part0 = initialDraft?.parts[0];
		if (!initialDraft || !part0) throw new Error("expected created.draft");
		const tooManyPartsDraft = {
			...initialDraft,
			parts: [part0, part0, part0, part0],
		};

		const tooManyRes = await app.request(
			`/api/exam-imports/${created.id}/publish`,
			{
				method: "POST",
				headers: {
					"x-test-user": "teacher",
					Origin: "http://localhost:8001",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					draft: tooManyPartsDraft,
					reviewConfirmed: true,
				}),
			},
		);
		expect(tooManyRes.status).toBe(422);
		const tooManyBody: unknown = await tooManyRes.json();
		expect(
			tooManyBody && typeof tooManyBody === "object" && "code" in tooManyBody
				? tooManyBody.code
				: undefined,
		).toBe(EXAM_IMPORT_ERROR_CODES.TOO_MANY_PARTS);

		const otherOrgRes = await app.request(
			`/api/exam-imports/${created.id}/draft`,
			{
				method: "PATCH",
				headers: {
					"x-test-user": "other-org",
					Origin: "http://localhost:8001",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ draft: created.draft }),
			},
		);
		expect(otherOrgRes.status).toBe(404);

		const taRes = await app.request(`/api/exam-imports/${created.id}/publish`, {
			method: "POST",
			headers: {
				"x-test-user": "ta",
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				draft: created.draft,
				reviewConfirmed: true,
			}),
		});
		expect(taRes.status).toBe(403);

		const badOriginRes = await app.request(
			`/api/exam-imports/${created.id}/publish`,
			{
				method: "POST",
				headers: {
					"x-test-user": "teacher",
					Origin: "https://evil.example",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					draft: created.draft,
					reviewConfirmed: true,
				}),
			},
		);
		expect(badOriginRes.status).toBe(403);

		const nonJsonRes = await app.request(
			`/api/exam-imports/${created.id}/publish`,
			{
				method: "POST",
				headers: {
					"x-test-user": "teacher",
					Origin: "http://localhost:8001",
					"Content-Type": "text/plain",
				},
				body: "{}",
			},
		);
		expect(nonJsonRes.status).toBe(415);
	});
});

describe("exam imports dedupe (TOS-25 #471)", () => {
	let db: Db;
	let memory: MemoryMediaStore;
	let app: ServerApp;
	let appBrokenExtractor: ServerApp;
	// Đếm số lần AI chạy — assert "trùng → extractor 0 lần".
	let extractCalls = 0;

	/** POST raw-body giống harness describe trên (test seam — nhiều call site). */
	function upload(target: ServerApp = app, user = "teacher") {
		return target.request("/api/exam-imports", {
			method: "POST",
			headers: {
				"x-test-user": user,
				"Content-Type": "application/pdf",
				"Content-Length": String(PDF_BYTES.byteLength),
				"X-File-Name": encodeURIComponent("cambridge-sample.pdf"),
			},
			body: PDF_BYTES,
		});
	}

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		]);
		await db.insert(schema.user).values([
			{
				id: "u-teacher",
				name: "Cô Lan",
				email: "lan@test.local",
				role: "teacher",
			},
			{
				id: "u-ta",
				name: "Trợ giảng",
				email: "ta@test.local",
				role: "teacher",
			},
			{
				id: "u-teacher2",
				name: "Thầy Hùng",
				email: "hung@test.local",
				role: "teacher",
			},
		]);
		await db.insert(schema.membership).values([
			{ id: "m-1", orgId: "org-1", userId: "u-teacher", role: "teacher" },
			{ id: "m-2", orgId: "org-1", userId: "u-ta", role: "ta" },
			{ id: "m-3", orgId: "org-2", userId: "u-teacher2", role: "teacher" },
		]);

		memory = createMemoryMediaStore();
		const baseDeps: AppDeps = {
			getDb: () => db,
			corsOrigin: ["http://localhost:8001"],
			getSessionUser: sessionFor,
			authHandler: () => new Response("auth OK"),
		};
		const countingExtractor: ExamExtractor = {
			extract: (input, signal) => {
				extractCalls++;
				return createFakeExamExtractor().extract(input, signal);
			},
		};
		app = buildApp({
			...baseDeps,
			getExamImportStore: () => memory.store,
			getExamExtractor: () => countingExtractor,
		});
		const failingExtractor: ExamExtractor = {
			extract: () => Promise.reject(new ExtractionFailedError("boom")),
		};
		appBrokenExtractor = buildApp({
			...baseDeps,
			getExamImportStore: () => memory.store,
			getExamExtractor: () => failingExtractor,
		});
	});

	beforeEach(async () => {
		await db.delete(creditUsageLog);
		await db.delete(creditWallet);
		await db.delete(examImportJob);
		memory.objects.clear();
		extractCalls = 0;
	});

	const lookup = (user: string, fingerprint: string, target: ServerApp = app) =>
		target.request(
			`/api/exam-imports/lookup?fingerprint=${encodeURIComponent(fingerprint)}`,
			{ headers: { "x-test-user": user } },
		);

	test("route-order: GET /lookup khớp đúng handler, không bị /:id nuốt", async () => {
		// Fingerprint hợp lệ, chưa có job nào → 200 {duplicate: null}. Nếu route
		// /lookup bị đăng ký sau /:id, Hono sẽ khớp id="lookup" → 404 NOT_FOUND.
		const res = await lookup("teacher", "a".repeat(64));
		expect(res.status).toBe(200);
		expect(examImportLookupResponseSchema.parse(await res.json())).toEqual({
			duplicate: null,
		});
	});

	test("lookup: fingerprint sai format → 400; ta → 403; chưa đăng nhập → 401", async () => {
		const bad = await lookup("teacher", "không-phải-hex");
		expect(bad.status).toBe(400);
		expect(((await bad.json()) as { code: string }).code).toBe(
			EXAM_IMPORT_ERROR_CODES.INVALID_FILE,
		);
		const forbidden = await lookup("ta", "a".repeat(64));
		expect(forbidden.status).toBe(403);
		const unauthorized = await lookup("nobody", "a".repeat(64));
		expect(unauthorized.status).toBe(401);
	});

	test("lookup: trùng → duplicate đủ jobId/title/completedAt từ draft", async () => {
		await upload();
		// Hash thật của byte upload — không dùng hex giả làm fixture.
		const res = await lookup("teacher", await sha256Hex(PDF_BYTES.buffer));
		expect(res.status).toBe(200);
		const body = examImportLookupResponseSchema.parse(await res.json());
		expect(body.duplicate?.jobId).toEqual(expect.any(String));
		// Title parse từ draft_json của fake extractor, không phải fileName.
		expect(body.duplicate?.title).toBe("Cambridge IELTS Sample");
		expect(body.duplicate?.completedAt).toEqual(expect.any(String));
	});

	test("upload lại cùng tệp: 200 {duplicateOf}, AI 0 lần, ví/log/R2 không đổi", async () => {
		const first = await upload();
		expect(first.status).toBe(200);
		const firstJob = examImportJobSchema.parse(await first.json());
		expect(extractCalls).toBe(1);

		const second = await upload();
		expect(second.status).toBe(200);
		// Body là {duplicateOf}, KHÔNG phải job DTO — parse union phân biệt.
		const body = examImportCreateResponseSchema.parse(await second.json());
		expect("duplicateOf" in body).toBe(true);
		if (!("duplicateOf" in body)) throw new Error("unreachable");
		expect(body.duplicateOf.jobId).toBe(firstJob.id);
		expect(body.duplicateOf.title).toBe("Cambridge IELTS Sample");

		// AI chạy đúng 1 lần (lần đầu) — lần 2 không gọi extractor.
		expect(extractCalls).toBe(1);
		// Ví chỉ trừ đúng 1 lần: 30 → 25, held nhả hết.
		const wallet = creditWalletSchema.parse(
			await (
				await app.request("/api/credits/wallet", {
					headers: { "x-test-user": "teacher" },
				})
			).json(),
		);
		expect(wallet).toEqual({
			balance: TRIAL_CREDITS - CREDIT_COSTS.examImport,
			held: 0,
			available: TRIAL_CREDITS - CREDIT_COSTS.examImport,
		});
		// Log chỉ [reserved, settled] của lần đầu — không thêm dòng nào.
		const logs = await db
			.select()
			.from(creditUsageLog)
			.where(eq(creditUsageLog.orgId, "org-1"));
		expect(logs.map((row) => row.txStatus)).toEqual(["reserved", "settled"]);
		// R2 không lưu thêm file, DB không tạo thêm job.
		expect(memory.objects.size).toBe(1);
		expect(
			(await db.select().from(examImportJob)).map((row) => row.id),
		).toEqual([firstJob.id]);
	});

	test("cùng byte ở org khác → bóc tách bình thường (org-scoped)", async () => {
		await upload(app, "teacher");
		const other = await upload(app, "other-org");
		expect(other.status).toBe(200);
		const job = examImportJobSchema.parse(await other.json());
		expect(job.importStatus).toBe("completed");
		expect(extractCalls).toBe(2);
	});

	test("job `failed_refunded` không chặn re-import", async () => {
		const failed = await upload(appBrokenExtractor);
		expect(failed.status).toBe(502);
		const retried = await upload(app);
		expect(retried.status).toBe(200);
		const job = examImportJobSchema.parse(await retried.json());
		expect(job.importStatus).toBe("completed");
		expect(extractCalls).toBe(1);
	});

	test("job `completed` thiếu draft_json không chặn re-import (không khoá vĩnh viễn)", async () => {
		// Mô phỏng row sinh bởi nhánh settled-retry sau crash: completed nhưng
		// draftJson NULL (exam-imports.ts nhánh `if (settled)`).
		const fingerprint = await sha256Hex(PDF_BYTES.buffer);
		await db.insert(examImportJob).values({
			id: "j-crash-no-draft",
			orgId: "org-1",
			createdBy: "u-teacher",
			fileKey: "exam-imports/org-1/j-crash-no-draft",
			fileName: "cambridge-sample.pdf",
			mimeType: "application/pdf",
			sizeBytes: PDF_BYTES.byteLength,
			contentFingerprint: fingerprint,
			importStatus: "completed",
			draftJson: null,
			completedAt: new Date(),
		});
		const res = await upload(app);
		expect(res.status).toBe(200);
		const job = examImportJobSchema.parse(await res.json());
		expect(job.importStatus).toBe("completed");
		expect(job.id).not.toBe("j-crash-no-draft");
		expect(extractCalls).toBe(1);
	});
});
