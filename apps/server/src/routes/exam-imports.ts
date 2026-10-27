import {
	CREDIT_COSTS,
	EXAM_IMPORT_ERROR_CODES,
	EXAM_IMPORT_LIMITS,
	EXAM_IMPORT_MIME,
	type ExamImportError,
	type ExamImportJob,
	examImportDraftUpdateSchema,
	examImportJobSchema,
	examImportPublishSchema,
	extractedExamDraftSchema,
	fingerprintSchema,
} from "@teacher-os/api/contracts";
import {
	normalizeMediaType,
	sanitizeMediaFileName,
} from "@teacher-os/api/lib/quiz-media";
import { canImportExam } from "@teacher-os/auth/role";
import { examImportJob } from "@teacher-os/db/schema/exam-import-job";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Db, KernelCtx } from "../app";
import {
	assertStaffCap,
	ensureWallet,
	InsufficientCreditsError,
	readWallet,
	reserveCredits,
} from "../lib/credits/wallet";
import { findCompletedImportByFingerprint } from "../lib/exam-import/dedupe";
import type { ExamExtractor } from "../lib/exam-import/extractor";
import { sha256Hex } from "../lib/exam-import/fingerprint";
import {
	mergeReviewedDraft,
	parseStoredDraft,
	publishExamImportToBank,
} from "../lib/exam-import/publish-to-bank";
import { releaseStaleImports } from "../lib/exam-import/release-stale";
import { type RunImportResult, runImport } from "../lib/exam-import/run-import";
import { inspectExamFile } from "../lib/exam-import/validate-file";
import { mediaObjectResponse } from "../lib/media-response";
import type { MediaStore } from "../lib/media-store";

export interface ExamImportRouteDeps {
	getDb(): Db;
	/** Vắng mặt (binding AI/kho chưa cấu hình) → POST trả 503 DISABLED. */
	getExamExtractor?(): ExamExtractor | undefined;
	getExamImportStore?(): MediaStore | undefined;
	corsOrigin?: string | string[];
	corsOrigins?: string | string[];
}

type Env = { Variables: { kernelCtx: KernelCtx } };

/** Row `exam_import_job` → wire DTO (không lộ fileKey/orgId; draft parse
 * từ draft_json — JSON hỏng hoặc lệch schema thì draft null thay vì 500;
 * row luôn ghi qua `extractedExamDraftSchema.parse` lúc write nên lệch
 * schema chỉ xảy ra với row hỏng ngoài luồng thường). */
function toJobDto(row: typeof examImportJob.$inferSelect): ExamImportJob {
	let draft: unknown = null;
	if (row.draftJson) {
		try {
			const parsed = extractedExamDraftSchema.safeParse(
				JSON.parse(row.draftJson),
			);
			draft = parsed.success ? parsed.data : null;
		} catch {
			draft = null;
		}
	}
	return examImportJobSchema.parse({
		id: row.id,
		fileName: row.fileName,
		mimeType: row.mimeType,
		sizeBytes: row.sizeBytes,
		pageCount: row.pageCount,
		contentFingerprint: row.contentFingerprint,
		heldCredits: row.heldCredits,
		importStatus: row.importStatus,
		draft,
		errorCode: row.errorCode,
		errorReason: row.errorReason,
		publishedTestId: row.publishedTestId ?? null,
		createdAt: row.createdAt.toISOString(),
		startedAt: row.startedAt.toISOString(),
		completedAt: row.completedAt?.toISOString() ?? null,
	});
}

/** Map kết quả `runImport` → response 200/502 — dùng chung POST và retry. */
function importFailureOrJob(
	c: Context<Env>,
	result: RunImportResult,
	jobId: string,
): Response {
	if (result.ok) return c.json(toJobDto(result.row), 200);
	if (result.kind === "hard") {
		// Settled rồi mới hỏng ghi job — credit ĐÃ trừ, KHÔNG hoàn: KHÔNG dùng
		// E-004 vì message E-004 nói "credit đã hoàn" sẽ sai sự thật.
		return c.json(
			{
				error: "exam import failed",
				code: EXAM_IMPORT_ERROR_CODES.FAILED,
				jobId,
			} satisfies ExamImportError,
			502,
		);
	}
	return c.json(
		{
			error: "exam import failed",
			code: EXAM_IMPORT_ERROR_CODES.EXAM_FAILED,
			reason: result.reason,
			jobId,
		} satisfies ExamImportError,
		502,
	);
}

/**
 * Route nhập đề bằng AI (TOS-24 #470). POST nhận RAW BODY là byte file
 * (precedent #305 — KHÔNG multipart): Content-Type là MIME, tên file qua
 * header `X-File-Name`. Luồng: kiểm file → fingerprint → ensureWallet →
 * INSERT job `processing` → reserve 5 Credit (thiếu → xoá job + file R2,
 * 402 — không job zombie) → extract (timeout 120s) → needsReview → UPDATE
 * `completed` + settle. Mọi lỗi sau reserve → release + `failed_refunded`
 * + 502 (Credit không bao giờ kẹt).
 */
export function examImportRoutes(deps: ExamImportRouteDeps) {
	const router = new Hono<Env>();
	const allowedOrigins = Array.isArray(deps.corsOrigins)
		? deps.corsOrigins
		: typeof deps.corsOrigins === "string"
			? [deps.corsOrigins]
			: Array.isArray(deps.corsOrigin)
				? deps.corsOrigin
				: typeof deps.corsOrigin === "string"
					? [deps.corsOrigin]
					: [];

	function checkJsonWriteCsrf(c: {
		req: { header(name: string): string | undefined };
		json(data: unknown, status: 403 | 415): Response;
	}): Response | null {
		const origin = c.req.header("Origin") ?? "";
		if (allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
			return c.json({ error: "origin not allowed" }, 403);
		}
		const contentType = c.req.header("Content-Type") ?? "";
		if (!contentType.toLowerCase().startsWith("application/json")) {
			return c.json({ error: "content-type must be application/json" }, 415);
		}
		return null;
	}

	router.post("/exam-imports", async (c) => {
		const kernelCtx = c.get("kernelCtx");
		if (!kernelCtx) return c.json({ error: "unauthorized" }, 401);
		// D8: chỉ teacher/owner được nhập đề; ta chỉ xem.
		if (!canImportExam(kernelCtx.role)) {
			return c.json({ error: "forbidden" }, 403);
		}
		const extractor = deps.getExamExtractor?.();
		const store = deps.getExamImportStore?.();
		if (!extractor || !store) {
			return c.json(
				{
					error: "exam import disabled",
					code: EXAM_IMPORT_ERROR_CODES.DISABLED,
				},
				503,
			);
		}

		const db = deps.getDb();
		const { orgId, userId } = kernelCtx;

		// Kiểm rẻ trước khi đọc body: MIME + Content-Length khai báo.
		const mimeType = normalizeMediaType(c.req.header("Content-Type") ?? "");
		if (!(EXAM_IMPORT_MIME as readonly string[]).includes(mimeType)) {
			return c.json(
				{
					error: "unsupported file type",
					code: EXAM_IMPORT_ERROR_CODES.INVALID_FILE,
					reason: "type",
				} satisfies ExamImportError,
				400,
			);
		}
		const lengthHeader = c.req.header("Content-Length");
		const declaredSize =
			lengthHeader !== undefined && /^\d+$/.test(lengthHeader)
				? Number(lengthHeader)
				: Number.NaN;
		if (
			!Number.isSafeInteger(declaredSize) ||
			declaredSize <= 0 ||
			declaredSize > EXAM_IMPORT_LIMITS.maxBytes
		) {
			return c.json(
				{
					error: "invalid file size",
					code: EXAM_IMPORT_ERROR_CODES.INVALID_FILE,
					reason: "size",
				} satisfies ExamImportError,
				400,
			);
		}
		let fileName: string | null = null;
		try {
			fileName = sanitizeMediaFileName(
				decodeURIComponent(c.req.header("X-File-Name") ?? ""),
			);
		} catch {
			fileName = null;
		}
		if (fileName === null) {
			return c.json(
				{
					error: "invalid file name",
					code: EXAM_IMPORT_ERROR_CODES.INVALID_FILE,
					reason: "type",
				} satisfies ExamImportError,
				400,
			);
		}

		const data = await c.req.raw.arrayBuffer();
		// Byte thật phải khớp khai báo và trong ngưỡng (file dối Content-Length).
		if (
			data.byteLength !== declaredSize ||
			data.byteLength > EXAM_IMPORT_LIMITS.maxBytes
		) {
			return c.json(
				{
					error: "invalid file size",
					code: EXAM_IMPORT_ERROR_CODES.INVALID_FILE,
					reason: "size",
				} satisfies ExamImportError,
				400,
			);
		}

		const fingerprint = await sha256Hex(data);

		// Kiểm sâu tệp (plan TOS-27 D1) TRƯỚC khi lưu R2 / tạo job / giữ
		// Credit: sai số trang / PDF có mật khẩu / hỏng → 400 E-003, ví
		// không bị đụng tới.
		const inspection = await inspectExamFile(data, mimeType);
		if (!inspection.ok) {
			return c.json(
				{
					error: "invalid file",
					code: EXAM_IMPORT_ERROR_CODES.INVALID_FILE,
					reason: inspection.reason,
				} satisfies ExamImportError,
				400,
			);
		}

		// Dọn lười job `processing` treo (plan TOS-27 D3) trước khi tạo job.
		await releaseStaleImports(db, orgId);

		// TOS-25 (#471): trùng mã băm trong cùng org (job `completed` có draft
		// đọc được) → không gọi AI, không tạo job, không lưu R2, không giữ/trừ
		// Credit. Chạy TRƯỚC ensureWallet/INSERT/reserve — 0 Credit tuyệt đối
		// kể cả khi client đã bỏ qua bước lookup (plan D3 lớp 2).
		const duplicate = await findCompletedImportByFingerprint(
			db,
			orgId,
			fingerprint,
		);
		if (duplicate) {
			return c.json({ duplicateOf: duplicate }, 200);
		}
		// Vĩ tạo lười (30 Credit Dùng thử) + hook trần cá nhân (TOS-49).
		await ensureWallet(db, orgId);
		assertStaffCap(kernelCtx, CREDIT_COSTS.examImport);

		const jobId = crypto.randomUUID();
		const fileKey = `exam-imports/${orgId}/${jobId}`;
		const startedAt = new Date();
		await db.insert(examImportJob).values({
			id: jobId,
			orgId,
			createdBy: userId,
			fileKey,
			fileName,
			mimeType,
			sizeBytes: data.byteLength,
			contentFingerprint: fingerprint,
			heldCredits: CREDIT_COSTS.examImport,
			importStatus: "processing",
			startedAt,
		});

		// Reserve TRƯỚC khi extract; thua → xoá sạch job + file để không còn
		// job `processing` mồ côi (kongming red-team #470).
		try {
			await reserveCredits(db, {
				orgId,
				actorUserId: userId,
				amount: CREDIT_COSTS.examImport,
				refId: jobId,
			});
		} catch (error) {
			if (error instanceof InsufficientCreditsError) {
				await db.delete(examImportJob).where(eq(examImportJob.id, jobId));
				await store.delete(fileKey);
				const wallet = await readWallet(db, orgId);
				return c.json(
					{
						error: "insufficient credits",
						code: EXAM_IMPORT_ERROR_CODES.INSUFFICIENT_CREDITS,
						balance: wallet?.balance ?? 0,
						// Khả dụng mới là số quyết định khi có reserve đang giữ
						// (kongming PR-review #474 Minor #3 — balance có thể lớn
						// hơn nhưng held chặn).
						available: wallet ? Math.max(0, wallet.balance - wallet.held) : 0,
					},
					402,
				);
			}
			throw error;
		}

		const result = await runImport({
			db,
			extractor,
			store,
			orgId,
			userId,
			jobId,
			fileKey,
			data,
			mimeType,
			fileName,
			putFile: true,
		});
		return importFailureOrJob(c, result, jobId);
	});

	/** TOS-25: kiểm tra trùng sớm theo fingerprint — client gọi trước upload
	 * để không phải gửi lại tệp 15 MB. Đăng ký TRƯỚC `/:id` để Hono không
	 * khớp "lookup" vào param id (khoá bằng test route-order). Gate
	 * `canImportExam` như POST: đây là tính năng nhập đề, không cho role
	 * chỉ-xem dùng làm oracle dò fingerprint của org. */
	router.get("/exam-imports/lookup", async (c) => {
		const kernelCtx = c.get("kernelCtx");
		if (!kernelCtx) return c.json({ error: "unauthorized" }, 401);
		if (!canImportExam(kernelCtx.role)) {
			return c.json({ error: "forbidden" }, 403);
		}
		const fingerprint = c.req.query("fingerprint") ?? "";
		if (!fingerprintSchema.safeParse(fingerprint).success) {
			return c.json(
				{
					error: "invalid fingerprint",
					code: EXAM_IMPORT_ERROR_CODES.INVALID_FILE,
				},
				400,
			);
		}
		const duplicate = await findCompletedImportByFingerprint(
			deps.getDb(),
			kernelCtx.orgId,
			fingerprint,
		);
		return c.json({ duplicate });
	});

	/** GET job — org-scoped; org khác/không tồn tại đều 404 cùng mã. GET KHÔNG
	 * gate `canImportExam`: role `student` không bao giờ chạm tới đây —
	 * bootstrapMiddleware trả 403 STUDENT_ON_TEACHER_APP cho toàn bộ /api/*
	 * trước khi set kernelCtx; member trong org (`ta`, `class_teacher`) được
	 * xem kết quả theo plan D8 ("TA chỉ xem") — chỉ POST cần teacher/owner. */
	router.get("/exam-imports/:id", async (c) => {
		const kernelCtx = c.get("kernelCtx");
		if (!kernelCtx) return c.json({ error: "unauthorized" }, 401);
		// Dọn lười job treo (plan TOS-27 D3) — xem kết quả cũng là cơ hội dọn.
		await releaseStaleImports(deps.getDb(), kernelCtx.orgId);
		const [row] = await deps
			.getDb()
			.select()
			.from(examImportJob)
			.where(
				and(
					eq(examImportJob.id, c.req.param("id")),
					eq(examImportJob.orgId, kernelCtx.orgId),
				),
			)
			.limit(1);
		if (!row) {
			return c.json(
				{
					error: "exam import not found",
					code: EXAM_IMPORT_ERROR_CODES.NOT_FOUND,
				},
				404,
			);
		}
		return c.json(toJobDto(row));
	});

	/** Stream file đề gốc — org-scoped, header khoá bởi mediaObjectResponse. */
	router.get("/exam-imports/:id/file", async (c) => {
		const kernelCtx = c.get("kernelCtx");
		if (!kernelCtx) return c.json({ error: "unauthorized" }, 401);
		const store = deps.getExamImportStore?.();
		if (!store) {
			return c.json(
				{
					error: "exam import disabled",
					code: EXAM_IMPORT_ERROR_CODES.DISABLED,
				},
				503,
			);
		}
		const [row] = await deps
			.getDb()
			.select()
			.from(examImportJob)
			.where(
				and(
					eq(examImportJob.id, c.req.param("id")),
					eq(examImportJob.orgId, kernelCtx.orgId),
				),
			)
			.limit(1);
		if (!row) {
			return c.json(
				{
					error: "exam import not found",
					code: EXAM_IMPORT_ERROR_CODES.NOT_FOUND,
				},
				404,
			);
		}
		const object = await store.get(row.fileKey);
		if (!object) {
			return c.json(
				{
					error: "exam import not found",
					code: EXAM_IMPORT_ERROR_CODES.NOT_FOUND,
				},
				404,
			);
		}
		return mediaObjectResponse(object, {
			mediaType: row.mimeType,
			mediaName: row.fileName,
		});
	});

	/** Thử bóc tách lại AI (plan TOS-27 D4): job `failed_refunded` cùng org +
	 * file còn trên R2 → tạo JOB MỚI dùng lại `file_key` +
	 * `content_fingerprint` (không upload lại), chạy lại toàn bộ reserve →
	 * extract → settle/release. Gate `canImportExam` như POST. */
	router.post("/exam-imports/:id/retry", async (c) => {
		const kernelCtx = c.get("kernelCtx");
		if (!kernelCtx) return c.json({ error: "unauthorized" }, 401);
		if (!canImportExam(kernelCtx.role)) {
			return c.json({ error: "forbidden" }, 403);
		}
		const extractor = deps.getExamExtractor?.();
		const store = deps.getExamImportStore?.();
		if (!extractor || !store) {
			return c.json(
				{
					error: "exam import disabled",
					code: EXAM_IMPORT_ERROR_CODES.DISABLED,
				} satisfies ExamImportError,
				503,
			);
		}

		const db = deps.getDb();
		const { orgId, userId } = kernelCtx;
		await releaseStaleImports(db, orgId);

		const [old] = await db
			.select()
			.from(examImportJob)
			.where(
				and(
					eq(examImportJob.id, c.req.param("id")),
					eq(examImportJob.orgId, orgId),
				),
			)
			.limit(1);
		if (!old) {
			return c.json(
				{
					error: "exam import not found",
					code: EXAM_IMPORT_ERROR_CODES.NOT_FOUND,
				} satisfies ExamImportError,
				404,
			);
		}
		if (old.importStatus !== "failed_refunded") {
			return c.json(
				{
					error: "exam import job is not retryable",
					code: EXAM_IMPORT_ERROR_CODES.NOT_RETRYABLE,
				} satisfies ExamImportError,
				409,
			);
		}
		// File gốc phải còn trên R2 — mất (đã dọn) → 410, không tạo job ảo.
		const object = await store.get(old.fileKey);
		if (!object) {
			return c.json(
				{
					error: "exam import file missing",
					code: EXAM_IMPORT_ERROR_CODES.FILE_MISSING,
				} satisfies ExamImportError,
				410,
			);
		}
		const data = await new Response(object.body).arrayBuffer();

		// Vĩ + trần cá nhân như POST (credit giữ lại từ đầu).
		await ensureWallet(db, orgId);
		assertStaffCap(kernelCtx, CREDIT_COSTS.examImport);

		const jobId = crypto.randomUUID();
		await db.insert(examImportJob).values({
			id: jobId,
			orgId,
			createdBy: userId,
			// Dùng lại key R2 của job cũ (D4): không upload lại, job cũ còn
			// làm lịch sử — 2 row cùng fileKey là chủ ý.
			fileKey: old.fileKey,
			fileName: old.fileName,
			mimeType: old.mimeType,
			sizeBytes: old.sizeBytes,
			contentFingerprint: old.contentFingerprint,
			heldCredits: CREDIT_COSTS.examImport,
			importStatus: "processing",
			startedAt: new Date(),
		});

		// Reserve TRƯỚC khi extract; thua → chỉ xoá job row mới (KHÔNG xoá
		// file — file thuộc job cũ, vẫn giữ làm lịch sử/xem lại).
		try {
			await reserveCredits(db, {
				orgId,
				actorUserId: userId,
				amount: CREDIT_COSTS.examImport,
				refId: jobId,
			});
		} catch (error) {
			if (error instanceof InsufficientCreditsError) {
				await db.delete(examImportJob).where(eq(examImportJob.id, jobId));
				const wallet = await readWallet(db, orgId);
				return c.json(
					{
						error: "insufficient credits",
						code: EXAM_IMPORT_ERROR_CODES.INSUFFICIENT_CREDITS,
						balance: wallet?.balance ?? 0,
						available: wallet ? Math.max(0, wallet.balance - wallet.held) : 0,
					} satisfies ExamImportError,
					402,
				);
			}
			throw error;
		}

		const result = await runImport({
			db,
			extractor,
			store,
			orgId,
			userId,
			jobId,
			fileKey: old.fileKey,
			data,
			mimeType: old.mimeType,
			fileName: old.fileName,
			putFile: false,
		});
		return importFailureOrJob(c, result, jobId);
	});

	/**
	 * PATCH /exam-imports/:id/draft — lưu bản nháp chỉnh sửa tay với chi phí
	 * 0 Credit (TOS-26 #472). Bảo toàn `needsReview` và `confidence` gốc từ DB
	 * để sửa câu không tự xoá nhãn cảnh báo.
	 */
	router.patch("/exam-imports/:id/draft", async (c) => {
		const kernelCtx = c.get("kernelCtx");
		if (!kernelCtx) return c.json({ error: "unauthorized" }, 401);
		if (!canImportExam(kernelCtx.role)) {
			return c.json({ error: "forbidden" }, 403);
		}
		const csrfError = checkJsonWriteCsrf(c);
		if (csrfError) return csrfError;

		const db = deps.getDb();
		const [row] = await db
			.select()
			.from(examImportJob)
			.where(
				and(
					eq(examImportJob.id, c.req.param("id")),
					eq(examImportJob.orgId, kernelCtx.orgId),
				),
			)
			.limit(1);
		if (!row) {
			return c.json(
				{
					error: "exam import not found",
					code: EXAM_IMPORT_ERROR_CODES.NOT_FOUND,
				},
				404,
			);
		}
		if (row.importStatus !== "completed") {
			return c.json(
				{
					error: "exam import is not completed",
					code: EXAM_IMPORT_ERROR_CODES.INVALID_STATE,
				},
				409,
			);
		}

		let rawBody: unknown;
		try {
			rawBody = await c.req.json();
		} catch {
			return c.json(
				{
					error: "invalid json",
					code: EXAM_IMPORT_ERROR_CODES.INVALID_DRAFT,
				},
				400,
			);
		}
		const wrapped = examImportDraftUpdateSchema.safeParse(rawBody);
		const direct = wrapped.success
			? null
			: extractedExamDraftSchema.safeParse(rawBody);
		const incomingDraft = wrapped.success
			? wrapped.data.draft
			: direct?.success
				? direct.data
				: null;
		if (!incomingDraft) {
			return c.json(
				{
					error: "invalid draft payload",
					code: EXAM_IMPORT_ERROR_CODES.INVALID_DRAFT,
				},
				422,
			);
		}

		const existingDraft = parseStoredDraft(row.draftJson);
		const mergedDraft = mergeReviewedDraft(existingDraft, incomingDraft);
		const [updated] = await db
			.update(examImportJob)
			.set({
				draftJson: JSON.stringify(mergedDraft),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(examImportJob.id, row.id),
					eq(examImportJob.orgId, kernelCtx.orgId),
				),
			)
			.returning();
		return c.json(
			toJobDto(updated ?? { ...row, draftJson: JSON.stringify(mergedDraft) }),
		);
	});

	/**
	 * POST /exam-imports/:id/publish — xuất bản đề vào Ngân hàng đề của tổ chức
	 * (`assignment_prompt` + `assignment_test` + `assignment_test_part`) sau khi
	 * kiểm tra cổng xác nhận câu gắn nhãn `(!) Cần rà soát lại` (TOS-26 #472).
	 */
	router.post("/exam-imports/:id/publish", async (c) => {
		const kernelCtx = c.get("kernelCtx");
		if (!kernelCtx) return c.json({ error: "unauthorized" }, 401);
		if (!canImportExam(kernelCtx.role)) {
			return c.json({ error: "forbidden" }, 403);
		}
		const csrfError = checkJsonWriteCsrf(c);
		if (csrfError) return csrfError;

		const db = deps.getDb();
		const [row] = await db
			.select()
			.from(examImportJob)
			.where(
				and(
					eq(examImportJob.id, c.req.param("id")),
					eq(examImportJob.orgId, kernelCtx.orgId),
				),
			)
			.limit(1);
		if (!row) {
			return c.json(
				{
					error: "exam import not found",
					code: EXAM_IMPORT_ERROR_CODES.NOT_FOUND,
				},
				404,
			);
		}
		if (row.importStatus !== "completed") {
			return c.json(
				{
					error: "exam import is not completed",
					code: EXAM_IMPORT_ERROR_CODES.INVALID_STATE,
				},
				409,
			);
		}

		let rawBody: unknown;
		try {
			rawBody = await c.req.json();
		} catch {
			return c.json(
				{
					error: "invalid json",
					code: EXAM_IMPORT_ERROR_CODES.INVALID_DRAFT,
				},
				400,
			);
		}
		const parsed = examImportPublishSchema.safeParse(rawBody);
		if (!parsed.success) {
			return c.json(
				{
					error: "invalid publish payload",
					code: EXAM_IMPORT_ERROR_CODES.INVALID_DRAFT,
				},
				422,
			);
		}

		const result = await publishExamImportToBank(db, {
			job: row,
			orgId: kernelCtx.orgId,
			draft: parsed.data.draft,
			reviewConfirmed: parsed.data.reviewConfirmed,
		});
		if (!result.ok) {
			return c.json(
				{
					error: result.error,
					code: result.code,
					...(result.partIndex !== undefined
						? { partIndex: result.partIndex }
						: {}),
					...(result.questionIndex !== undefined
						? { questionIndex: result.questionIndex }
						: {}),
					...(result.maxParts !== undefined
						? { maxParts: result.maxParts }
						: {}),
				},
				422,
			);
		}

		return c.json({
			testId: result.testId,
			status: result.status,
		});
	});
	return router;
}
