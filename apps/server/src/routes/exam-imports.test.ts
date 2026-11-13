import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	CREDIT_COSTS,
	creditWalletSchema,
	EXAM_IMPORT_ERROR_CODES,
	type ExamImportJob,
	examImportCreateResponseSchema,
	examImportErrorSchema,
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
	ensureWallet,
	reserveCredits,
	settleCredits,
} from "../lib/credits/wallet";
import {
	type ExamExtractor,
	ExtractionFailedError,
} from "../lib/exam-import/extractor";
import { createFakeExamExtractor } from "../lib/exam-import/fake-extractor";
import { sha256Hex } from "../lib/exam-import/fingerprint";
// PDF tối thiểu HỢP LỆ (TOS-27): server inspect bằng unpdf nên bytes giả
// "%%%%" không còn qua nổi kiểm trang — fixture phải là PDF thật.
import { buildExamPdf } from "../lib/exam-import/make-pdf";
import { pngBytes } from "../lib/test-media-fixtures";
import type { SessionUser } from "../session";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

// 1 trang — nội dung không ảnh hưởng extractor giả, chỉ cần parse được.
const PDF_BYTES = new Uint8Array(buildExamPdf(1));

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
	let appEmptyExtractor: ServerApp;

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
		// Extractor "thành công" nhưng 0 nhóm câu hỏi hợp lệ (TOS-27: E-004
		// reason empty_result — AI không đọc được cấu trúc nào).
		const emptyExtractor: ExamExtractor = {
			extract: () =>
				Promise.resolve({
					exam: {
						title: "Trống",
						skill: "reading",
						timeLimitMinutes: null,
						parts: [{ passage: "", questions: [] }],
					},
					pageCount: 1,
				}),
		};
		appEmptyExtractor = buildApp({
			...baseDeps,
			getExamImportStore: () => memory.store,
			getExamExtractor: () => emptyExtractor,
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
		expect(
			memory.objects.get(`exam-imports/org-1/${job.id}`)?.bytes.byteLength,
		).toBe(PDF_BYTES.byteLength);

		// GET job + file đọc lại được nguyên vẹn byte.
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
		expect((await fileRes.arrayBuffer()).byteLength).toBe(PDF_BYTES.byteLength);
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

	test("extractor ném lỗi: job failed_refunded E-004, log released, ví nguyên 30", async () => {
		const res = await upload(appBrokenExtractor);
		expect(res.status).toBe(502);
		const body = examImportErrorSchema.parse(await res.json());
		// TOS-27: lỗi sau reserve dùng mã E-004 + reason phân loại.
		expect(body.code).toBe(EXAM_IMPORT_ERROR_CODES.EXAM_FAILED);
		expect(body.reason).toBe("ai_error");
		if (!body.jobId) throw new Error("expected jobId");
		const [job] = await db
			.select()
			.from(examImportJob)
			.where(eq(examImportJob.id, body.jobId));
		expect(job?.importStatus).toBe("failed_refunded");
		expect(job?.errorCode).toBe(EXAM_IMPORT_ERROR_CODES.EXAM_FAILED);
		expect(job?.errorReason).toBe("ai_error");
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

	test("store.put hỏng sau reserve: job failed_refunded E-004, log released, ví nguyên 30 (Important #1)", async () => {
		const res = await upload(appBrokenStore);
		expect(res.status).toBe(502);
		const body = examImportErrorSchema.parse(await res.json());
		expect(body.code).toBe(EXAM_IMPORT_ERROR_CODES.EXAM_FAILED);
		expect(body.reason).toBe("ai_error");
		if (!body.jobId) throw new Error("expected jobId");
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

	test("MIME không thuộc danh sách → 400 E-selfomy-alignment-003 reason type", async () => {
		const res = await upload(app, "teacher", {
			"Content-Type": "text/plain",
		});
		expect(res.status).toBe(400);
		expect(examImportErrorSchema.parse(await res.json())).toEqual({
			error: "unsupported file type",
			code: EXAM_IMPORT_ERROR_CODES.INVALID_FILE,
			reason: "type",
		});
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

	// ==== TOS-27 (#473): chặn tệp trước khi giữ Credit + hoàn trả khi AI lỗi ====

	test("PDF 25 trang → 400 E-003 reason pages, không job/log/file", async () => {
		const bytes = new Uint8Array(buildExamPdf(25));
		const res = await app.request("/api/exam-imports", {
			method: "POST",
			headers: {
				"x-test-user": "teacher",
				"Content-Type": "application/pdf",
				"Content-Length": String(bytes.byteLength),
				"X-File-Name": encodeURIComponent("de-25-trang.pdf"),
			},
			body: bytes,
		});
		expect(res.status).toBe(400);
		const body = examImportErrorSchema.parse(await res.json());
		expect(body.code).toBe(EXAM_IMPORT_ERROR_CODES.INVALID_FILE);
		expect(body.reason).toBe("pages");
		expect(await db.select().from(examImportJob)).toHaveLength(0);
		expect(await walletLogs()).toHaveLength(0);
		expect(memory.objects.size).toBe(0);
	});

	test("PDF có mật khẩu → 400 E-003 reason password, không job/log", async () => {
		// Fixture mã hoá thật (pypdf RC4) — pdf.js bỏ qua /Encrypt giả nên
		// phải dùng file encrypt chuẩn để unpdf ném PasswordException.
		const bytes = new Uint8Array(
			readFileSync(
				fileURLToPath(
					new URL(
						"../../../e2e/fixtures/exam-import/protected.pdf",
						import.meta.url,
					).href,
				),
			),
		);
		const res = await app.request("/api/exam-imports", {
			method: "POST",
			headers: {
				"x-test-user": "teacher",
				"Content-Type": "application/pdf",
				"Content-Length": String(bytes.byteLength),
				"X-File-Name": encodeURIComponent("bi-mat.pdf"),
			},
			body: bytes,
		});
		expect(res.status).toBe(400);
		const body = examImportErrorSchema.parse(await res.json());
		expect(body.code).toBe(EXAM_IMPORT_ERROR_CODES.INVALID_FILE);
		expect(body.reason).toBe("password");
		expect(await db.select().from(examImportJob)).toHaveLength(0);
		expect(await walletLogs()).toHaveLength(0);
	});

	test("file khai báo 18 MB → 400 E-003 reason size, không job/log", async () => {
		const res = await upload(app, "teacher", {
			"Content-Length": String(18 * 1024 * 1024),
		});
		expect(res.status).toBe(400);
		const body = examImportErrorSchema.parse(await res.json());
		expect(body.code).toBe(EXAM_IMPORT_ERROR_CODES.INVALID_FILE);
		expect(body.reason).toBe("size");
		expect(await db.select().from(examImportJob)).toHaveLength(0);
		expect(await walletLogs()).toHaveLength(0);
	});

	test("extractor trả 0 câu hợp lệ → 502 E-004 reason empty_result, released", async () => {
		const res = await upload(appEmptyExtractor);
		expect(res.status).toBe(502);
		const body = examImportErrorSchema.parse(await res.json());
		expect(body.code).toBe(EXAM_IMPORT_ERROR_CODES.EXAM_FAILED);
		expect(body.reason).toBe("empty_result");
		if (!body.jobId) throw new Error("expected jobId");
		const [job] = await db
			.select()
			.from(examImportJob)
			.where(eq(examImportJob.id, body.jobId));
		expect(job?.importStatus).toBe("failed_refunded");
		expect(job?.errorReason).toBe("empty_result");
		const wallet = await db
			.select()
			.from(creditWallet)
			.where(eq(creditWallet.orgId, "org-1"));
		expect(wallet[0]?.balance).toBe(TRIAL_CREDITS);
		expect(wallet[0]?.held).toBe(0);
		expect((await walletLogs()).map((row) => row.txStatus)).toEqual([
			"reserved",
			"released",
		]);
	});

	test("retry: tạo job mới dùng lại file R2, settle bình thường", async () => {
		const failedRes = await upload(appBrokenExtractor);
		const failedBody = (await failedRes.json()) as { jobId: string };
		const res = await app.request(
			`/api/exam-imports/${failedBody.jobId}/retry`,
			{ method: "POST", headers: { "x-test-user": "teacher" } },
		);
		expect(res.status).toBe(200);
		const job = examImportJobSchema.parse(await res.json());
		expect(job.importStatus).toBe("completed");
		const jobs = await db.select().from(examImportJob);
		expect(jobs).toHaveLength(2);
		const oldJob = jobs.find((row) => row.id === failedBody.jobId);
		const newJobRow = jobs.find((row) => row.id === job.id);
		expect(oldJob?.importStatus).toBe("failed_refunded");
		// Job mới DÙNG LẠI key R2 của job cũ (D4 — không upload lại).
		expect(oldJob?.fileKey).toBe(`exam-imports/org-1/${failedBody.jobId}`);
		expect(newJobRow?.fileKey).toBe(oldJob?.fileKey);
		// File KHÔNG put lại — memory vẫn chỉ 1 object (key của job cũ).
		expect(memory.objects.size).toBe(1);
		// Sổ cái: reserve + released (lần fail) + reserved + settled (retry).
		expect((await walletLogs()).map((row) => row.txStatus)).toEqual([
			"reserved",
			"released",
			"reserved",
			"settled",
		]);
	});

	test("retry job không ở failed_refunded → 409", async () => {
		const okRes = await upload(app);
		const okJob = examImportJobSchema.parse(await okRes.json());
		const res = await app.request(`/api/exam-imports/${okJob.id}/retry`, {
			method: "POST",
			headers: { "x-test-user": "teacher" },
		});
		expect(res.status).toBe(409);
		expect(examImportErrorSchema.parse(await res.json()).code).toBe(
			EXAM_IMPORT_ERROR_CODES.NOT_RETRYABLE,
		);
	});

	test("retry job không tồn tại → 404", async () => {
		const res = await app.request("/api/exam-imports/khong-co/retry", {
			method: "POST",
			headers: { "x-test-user": "teacher" },
		});
		expect(res.status).toBe(404);
	});

	test("retry khi file đã mất trên R2 → 410, không tạo job mới", async () => {
		const failedRes = await upload(appBrokenExtractor);
		const failedBody = (await failedRes.json()) as { jobId: string };
		memory.objects.clear();
		const res = await app.request(
			`/api/exam-imports/${failedBody.jobId}/retry`,
			{ method: "POST", headers: { "x-test-user": "teacher" } },
		);
		expect(res.status).toBe(410);
		expect(examImportErrorSchema.parse(await res.json()).code).toBe(
			EXAM_IMPORT_ERROR_CODES.FILE_MISSING,
		);
		expect(await db.select().from(examImportJob)).toHaveLength(1);
	});

	test("retry thiếu Credit → xoá job mới, GIỮ file cũ, không log mới", async () => {
		const failedRes = await upload(appBrokenExtractor);
		const failedBody = (await failedRes.json()) as { jobId: string };
		// Xả ví xuống dưới 5 Cr khả dụng.
		const walletRow = await db
			.select()
			.from(creditWallet)
			.where(eq(creditWallet.orgId, "org-1"));
		await db
			.update(creditWallet)
			.set({ balance: 3 })
			.where(eq(creditWallet.orgId, "org-1"));
		expect(walletRow[0]).toBeDefined();
		const res = await app.request(
			`/api/exam-imports/${failedBody.jobId}/retry`,
			{ method: "POST", headers: { "x-test-user": "teacher" } },
		);
		expect(res.status).toBe(402);
		// Chỉ job cũ còn; file giữ nguyên cho job cũ xem lại.
		expect(await db.select().from(examImportJob)).toHaveLength(1);
		expect(memory.objects.size).toBe(1);
		expect((await walletLogs()).map((row) => row.txStatus)).toEqual([
			"reserved",
			"released",
		]);
	});

	test("job processing treo 151s → wallet GET tự hoàn đúng 1 lần (lazy sweep)", async () => {
		await ensureWallet(db, "org-1");
		const jobId = "job-stale-1";
		await db.insert(examImportJob).values({
			id: jobId,
			orgId: "org-1",
			createdBy: "u-teacher",
			fileKey: `exam-imports/org-1/${jobId}`,
			fileName: "treo.pdf",
			mimeType: "application/pdf",
			sizeBytes: 10,
			contentFingerprint: "a".repeat(64),
			heldCredits: CREDIT_COSTS.examImport,
			importStatus: "processing",
			startedAt: new Date(Date.now() - 151_000),
		});
		await reserveCredits(db, {
			orgId: "org-1",
			actorUserId: "u-teacher",
			amount: CREDIT_COSTS.examImport,
			refId: jobId,
		});

		const walletRes = await app.request("/api/credits/wallet", {
			headers: { "x-test-user": "teacher" },
		});
		expect(creditWalletSchema.parse(await walletRes.json())).toEqual({
			balance: TRIAL_CREDITS,
			held: 0,
			available: TRIAL_CREDITS,
		});
		const [job] = await db
			.select()
			.from(examImportJob)
			.where(eq(examImportJob.id, jobId));
		expect(job?.importStatus).toBe("failed_refunded");
		expect(job?.errorCode).toBe(EXAM_IMPORT_ERROR_CODES.EXAM_FAILED);
		expect(job?.errorReason).toBe("timeout");
		expect((await walletLogs()).map((row) => row.txStatus)).toEqual([
			"reserved",
			"released",
		]);

		// Gọi sweep lần 2 — idempotency key chặn hoàn lần thứ hai.
		await app.request("/api/credits/wallet", {
			headers: { "x-test-user": "teacher" },
		});
		expect((await walletLogs()).map((row) => row.txStatus)).toEqual([
			"reserved",
			"released",
		]);
	});

	test("job treo đã settle trước khi treo (crash-sau-settle) → sweep mark completed, KHÔNG hoàn", async () => {
		await ensureWallet(db, "org-1");
		const jobId = "job-stale-settled";
		await db.insert(examImportJob).values({
			id: jobId,
			orgId: "org-1",
			createdBy: "u-teacher",
			fileKey: `exam-imports/org-1/${jobId}`,
			fileName: "crash.pdf",
			mimeType: "application/pdf",
			sizeBytes: 10,
			contentFingerprint: "b".repeat(64),
			heldCredits: CREDIT_COSTS.examImport,
			importStatus: "processing",
			startedAt: new Date(Date.now() - 151_000),
		});
		await reserveCredits(db, {
			orgId: "org-1",
			actorUserId: "u-teacher",
			amount: CREDIT_COSTS.examImport,
			refId: jobId,
		});
		await settleCredits(db, {
			orgId: "org-1",
			actorUserId: "u-teacher",
			amount: CREDIT_COSTS.examImport,
			refId: jobId,
		});

		await app.request("/api/credits/wallet", {
			headers: { "x-test-user": "teacher" },
		});
		const [job] = await db
			.select()
			.from(examImportJob)
			.where(eq(examImportJob.id, jobId));
		// Credit đã trừ là sự thật sổ cái — job phải completed, không released.
		expect(job?.importStatus).toBe("completed");
		expect(job?.errorCode).toBeNull();
		const wallet = await db
			.select()
			.from(creditWallet)
			.where(eq(creditWallet.orgId, "org-1"));
		expect(wallet[0]?.balance).toBe(TRIAL_CREDITS - CREDIT_COSTS.examImport);
		expect(wallet[0]?.held).toBe(0);
		expect((await walletLogs()).map((row) => row.txStatus)).toEqual([
			"reserved",
			"settled",
		]);
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

	test("#681: đuôi lệch payload.html + image/png → 400 INVALID_FILE reason type, không đụng ví", async () => {
		const htmlBytes = new TextEncoder().encode(
			"<!doctype html><html><script>alert(1)</script></html>",
		);
		const res = await app.request("/api/exam-imports", {
			method: "POST",
			headers: {
				"x-test-user": "teacher",
				"Content-Type": "image/png",
				"Content-Length": String(htmlBytes.byteLength),
				"X-File-Name": encodeURIComponent("payload.html"),
			},
			body: htmlBytes,
		});
		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toMatchObject({
			code: EXAM_IMPORT_ERROR_CODES.INVALID_FILE,
			reason: "type",
		});
		expect(await db.select().from(examImportJob)).toHaveLength(0);
		expect(memory.objects.size).toBe(0);
		expect(await walletLogs()).toHaveLength(0);
	});

	test("#681: đuôi wrong.pdf + image/png → 400 INVALID_FILE reason type", async () => {
		const res = await app.request("/api/exam-imports", {
			method: "POST",
			headers: {
				"x-test-user": "teacher",
				"Content-Type": "image/png",
				"Content-Length": String(PDF_BYTES.byteLength),
				"X-File-Name": encodeURIComponent("wrong.pdf"),
			},
			body: PDF_BYTES,
		});
		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toMatchObject({ reason: "type" });
		expect(await db.select().from(examImportJob)).toHaveLength(0);
	});

	test("#681: spoof.png mang body HTML → 400 INVALID_FILE reason type", async () => {
		const htmlBytes = new TextEncoder().encode(
			"<!doctype html><html><script>alert(1)</script></html>",
		);
		const res = await app.request("/api/exam-imports", {
			method: "POST",
			headers: {
				"x-test-user": "teacher",
				"Content-Type": "image/png",
				"Content-Length": String(htmlBytes.byteLength),
				"X-File-Name": encodeURIComponent("spoof.png"),
			},
			body: htmlBytes,
		});
		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toMatchObject({
			code: EXAM_IMPORT_ERROR_CODES.INVALID_FILE,
			reason: "type",
		});
		expect(await db.select().from(examImportJob)).toHaveLength(0);
	});

	test("#681: spoof.jpg mang \\xff\\xd8\\xff<html> → 400 INVALID_FILE reason type", async () => {
		const spoofJpeg = new Uint8Array([
			0xff,
			0xd8,
			0xff,
			...new TextEncoder().encode("<html><script>alert(1)</script>"),
		]);
		const res = await app.request("/api/exam-imports", {
			method: "POST",
			headers: {
				"x-test-user": "teacher",
				"Content-Type": "image/jpeg",
				"Content-Length": String(spoofJpeg.byteLength),
				"X-File-Name": encodeURIComponent("spoof.jpg"),
			},
			body: spoofJpeg,
		});
		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toMatchObject({ reason: "type" });
		expect(await db.select().from(examImportJob)).toHaveLength(0);
	});

	test("#681: ảnh PNG thật + de-anh.png → 200 và file lưu nguyên vẹn lên R2", async () => {
		const png = pngBytes(64, 7);
		const res = await app.request("/api/exam-imports", {
			method: "POST",
			headers: {
				"x-test-user": "teacher",
				"Content-Type": "image/png",
				"Content-Length": String(png.byteLength),
				"X-File-Name": encodeURIComponent("de-anh.png"),
			},
			body: png,
		});
		expect(res.status).toBe(200);
		const job = examImportJobSchema.parse(await res.json());
		expect(job.mimeType).toBe("image/png");
		expect(memory.objects.has(`exam-imports/org-1/${job.id}`)).toBe(true);
		expect(memory.objects.get(`exam-imports/org-1/${job.id}`)?.bytes).toEqual(
			png,
		);
	});

	test("#681: stream khai Content-Length 100 nhưng bơm 150 byte → 400 reason size, ngắt tại byte 101", async () => {
		let sent = false;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (!sent) {
					sent = true;
					controller.enqueue(PDF_BYTES.subarray(0, 100));
					return;
				}
				// Nguồn bơm tiếp 50 byte sau khi server đã ngắt — chỉ có ý
				// nghĩa nếu server KHÔNG cancel; mọi trường hợp đều kết thúc.
				controller.enqueue(PDF_BYTES.subarray(0, 50));
				controller.close();
			},
		});
		const res = await app.request("/api/exam-imports", {
			method: "POST",
			headers: {
				"x-test-user": "teacher",
				"Content-Type": "application/pdf",
				"Content-Length": "100",
				"X-File-Name": encodeURIComponent("oversize.pdf"),
			},
			body: stream,
			duplex: "half",
		} as RequestInit & { duplex: "half" });
		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toMatchObject({
			code: EXAM_IMPORT_ERROR_CODES.INVALID_FILE,
			reason: "size",
		});
		expect(await db.select().from(examImportJob)).toHaveLength(0);
		expect(memory.objects.size).toBe(0);
	});

	test("#681: stream kết thúc sớm trước declaredSize → 400 reason size", async () => {
		const res = await app.request("/api/exam-imports", {
			method: "POST",
			headers: {
				"x-test-user": "teacher",
				"Content-Type": "application/pdf",
				"Content-Length": String(PDF_BYTES.byteLength + 50),
				"X-File-Name": encodeURIComponent("short.pdf"),
			},
			body: PDF_BYTES,
		});
		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toMatchObject({ reason: "size" });
		expect(await db.select().from(examImportJob)).toHaveLength(0);
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

	test("lookup & POST dedupe: trùng → duplicate đủ jobId/title/completedAt từ draft (kể cả sau khi PATCH /:id/draft đổi title)", async () => {
		const first = await upload();
		const firstJob = examImportJobSchema.parse(await first.json());
		const fp = await sha256Hex(PDF_BYTES.buffer);
		// Hash thật của byte upload — không dùng hex giả làm fixture.
		const res = await lookup("teacher", fp);
		expect(res.status).toBe(200);
		const body = examImportLookupResponseSchema.parse(await res.json());
		expect(body.duplicate?.jobId).toBe(firstJob.id);
		// Title parse từ draft_json của fake extractor, không phải fileName.
		expect(body.duplicate?.title).toBe("Cambridge IELTS Sample");
		expect(body.duplicate?.completedAt).toEqual(expect.any(String));

		// Giáo viên sửa tên đề qua PATCH /:id/draft (TOS-26) → lookup & POST
		// dedupe đều trả về title mới nhất.
		const patchRes = await app.request(
			`/api/exam-imports/${firstJob.id}/draft`,
			{
				method: "PATCH",
				headers: {
					"x-test-user": "teacher",
					Origin: "http://localhost:8001",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					draft: { ...firstJob.draft, title: "Cambridge IELTS — Đã đổi tên" },
				}),
			},
		);
		expect(patchRes.status).toBe(200);

		const lookupAfterPatch = examImportLookupResponseSchema.parse(
			await (await lookup("teacher", fp)).json(),
		);
		expect(lookupAfterPatch.duplicate?.title).toBe(
			"Cambridge IELTS — Đã đổi tên",
		);

		const postAfterPatch = examImportCreateResponseSchema.parse(
			await (await upload()).json(),
		);
		expect(
			"duplicateOf" in postAfterPatch && postAfterPatch.duplicateOf.title,
		).toBe("Cambridge IELTS — Đã đổi tên");
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
