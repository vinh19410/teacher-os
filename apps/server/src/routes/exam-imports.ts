import {
	CREDIT_COSTS,
	EXAM_IMPORT_ERROR_CODES,
	EXAM_IMPORT_LIMITS,
	EXAM_IMPORT_MIME,
	type ExamImportJob,
	type ExtractedExam,
	examImportJobSchema,
	extractedExamDraftSchema,
} from "@teacher-os/api/contracts";
import {
	normalizeMediaType,
	sanitizeMediaFileName,
} from "@teacher-os/api/lib/quiz-media";
import { canImportExam } from "@teacher-os/auth/role";
import { examImportJob } from "@teacher-os/db/schema/exam-import-job";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db, KernelCtx } from "../app";
import {
	assertStaffCap,
	ensureWallet,
	InsufficientCreditsError,
	readWallet,
	releaseCredits,
	reserveCredits,
	settleCredits,
} from "../lib/credits/wallet";
import type { ExamExtractor } from "../lib/exam-import/extractor";
import { countPdfPages, sha256Hex } from "../lib/exam-import/fingerprint";
import { mediaObjectResponse } from "../lib/media-response";
import { enforceDeclaredSize, type MediaStore } from "../lib/media-store";

export interface ExamImportRouteDeps {
	getDb(): Db;
	/** Vắng mặt (binding AI/kho chưa cấu hình) → POST trả 503 DISABLED. */
	getExamExtractor?(): ExamExtractor | undefined;
	getExamImportStore?(): MediaStore | undefined;
}

type Env = { Variables: { kernelCtx: KernelCtx } };

/** Mã error_code khi extract lỗi: timeout riêng để UI nhắc thử lại. */
const ERROR_CODE_EXTRACTION_TIMEOUT = "EXTRACTION_TIMEOUT";
const ERROR_CODE_EXTRACTION_FAILED = "EXTRACTION_FAILED";

/**
 * Hậu xử lý gán `needsReview` (server tính, UI chỉ đọc): tin cậy thấp,
 * thiếu đáp án, opts dưới 2 lựa chọn, hoặc đáp án không nằm trong opts.
 */
function toReviewedDraft(exam: ExtractedExam) {
	return {
		...exam,
		parts: exam.parts.map((part) => ({
			...part,
			questions: part.questions.map((question) => {
				const opts = question.opts ?? undefined;
				const answer = question.answer ?? undefined;
				return {
					...question,
					needsReview:
						question.confidence < EXAM_IMPORT_LIMITS.reviewConfidence ||
						answer === undefined ||
						(opts !== undefined && opts.length < 2) ||
						(opts !== undefined &&
							answer !== undefined &&
							!opts.includes(answer)),
				};
			}),
		})),
	};
}

/** Row `exam_import_job` → wire DTO (không lộ fileKey/orgId; draft parse
 * từ draft_json — JSON hỏng thì draft null thay vì 500). */
function toJobDto(row: typeof examImportJob.$inferSelect): ExamImportJob {
	let draft: unknown = null;
	if (row.draftJson) {
		try {
			draft = JSON.parse(row.draftJson);
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
		createdAt: row.createdAt.toISOString(),
		startedAt: row.startedAt.toISOString(),
		completedAt: row.completedAt?.toISOString() ?? null,
	});
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
				},
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
				},
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
				},
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
				},
				400,
			);
		}

		const fingerprint = await sha256Hex(data);

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
					},
					402,
				);
			}
			throw error;
		}

		const signal = AbortSignal.timeout(EXAM_IMPORT_LIMITS.timeoutMs);
		// `settled` phân nhánh catch-all: settle là 1 batch nguyên tử nên khi
		// nó đã chạy thì held đã nhả + balance đã trừ — catch-all KHÔNG được
		// release nữa (kongming review #470: tránh hoàn nhầm tiền đã trừ).
		let settled = false;
		try {
			// Ghi file R2 TRONG try catch-all — put hỏng (503/quota) vẫn phải
			// release + `failed_refunded`, không để job `processing` giữ credit
			// (kongming review #470, Important #1).
			const body = new Response(data).body;
			if (body === null) {
				throw new Error("re-streaming uploaded body failed");
			}
			const counted = enforceDeclaredSize(body, data.byteLength);
			await store.put(fileKey, counted.stream, {
				contentType: mimeType,
				size: data.byteLength,
			});
			const { exam, pageCount: extractorPageCount } = await extractor.extract(
				{ data, mimeType, fileName },
				signal,
			);
			const draft = extractedExamDraftSchema.parse(toReviewedDraft(exam));
			const pageCount =
				extractorPageCount !== null ? extractorPageCount : countPdfPages(data);
			const completedAt = new Date();
			// Settle TRƯỚC khi mark `completed`: nếu settle hỏng thì job chưa
			// thành công, catch-all hoàn credit sạch sẽ; chiều ngược lại sẽ kẹt
			// "job completed nhưng credit vẫn held" (kongming review #470,
			// Important #2). Cửa sổ hẹp còn lại — crash đúng sau settle trước
			// UPDATE — là rủi ro beta đã ghi nhận trong plan (TOS-27 dọn sau).
			await settleCredits(db, {
				orgId,
				actorUserId: userId,
				amount: CREDIT_COSTS.examImport,
				refId: jobId,
			});
			settled = true;
			await db
				.update(examImportJob)
				.set({
					draftJson: JSON.stringify(draft),
					importStatus: "completed",
					completedAt,
					pageCount,
				})
				.where(eq(examImportJob.id, jobId));
			const [row] = await db
				.select()
				.from(examImportJob)
				.where(eq(examImportJob.id, jobId))
				.limit(1);
			if (!row) {
				throw new Error("exam import job disappeared after settle");
			}
			return c.json(toJobDto(row), 200);
		} catch {
			if (settled) {
				// Settle đã chốt mà UPDATE job hỏng (2 lỗi DB liên tiếp): credit
				// đã trừ đúng sổ cái — KHÔNG release. Thử mark lại 1 lần, vẫn
				// lỗi thì 500 thật (job `processing` có credit đã trừ — cùng
				// lớp rủi ro crash-sau-settle đã chấp nhận ở beta).
				try {
					await db
						.update(examImportJob)
						.set({ importStatus: "completed", completedAt: new Date() })
						.where(eq(examImportJob.id, jobId));
				} catch (error) {
					console.error("[exam-imports] mark completed sau settle lỗi", error);
				}
				return c.json(
					{
						error: "exam import failed",
						code: EXAM_IMPORT_ERROR_CODES.FAILED,
						jobId,
					},
					502,
				);
			}
			// Catch-all sau reserve: hoàn Credit + đánh dấu job để ví không kẹt.
			const errorCode = signal.aborted
				? ERROR_CODE_EXTRACTION_TIMEOUT
				: ERROR_CODE_EXTRACTION_FAILED;
			await releaseCredits(db, {
				orgId,
				actorUserId: userId,
				amount: CREDIT_COSTS.examImport,
				refId: jobId,
			});
			await db
				.update(examImportJob)
				.set({
					importStatus: "failed_refunded",
					errorCode,
					completedAt: new Date(),
				})
				.where(eq(examImportJob.id, jobId));
			return c.json(
				{
					error: "exam import failed",
					code: EXAM_IMPORT_ERROR_CODES.FAILED,
					jobId,
				},
				502,
			);
		}
	});

	/** GET job — org-scoped; org khác/không tồn tại đều 404 cùng mã. GET KHÔNG
	 * gate `canImportExam`: `ta` được xem kết quả theo plan D8 ("TA chỉ xem")
	 * — chỉ POST mới cần teacher/owner. */
	router.get("/exam-imports/:id", async (c) => {
		const kernelCtx = c.get("kernelCtx");
		if (!kernelCtx) return c.json({ error: "unauthorized" }, 401);
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

	return router;
}
