import {
	CREDIT_COSTS,
	EXAM_IMPORT_ERROR_CODES,
	EXAM_IMPORT_LIMITS,
	type ExamImportFailReason,
	type ExtractedExam,
	extractedExamDraftSchema,
} from "@teacher-os/api/contracts";
import { examImportJob } from "@teacher-os/db/schema/exam-import-job";
import { and, eq } from "drizzle-orm";
import type { Db } from "../../app";
import {
	InsufficientCreditsError,
	releaseCredits,
	settleCredits,
} from "../credits/wallet";
import { enforceDeclaredSize, type MediaStore } from "../media-store";
import type { ExamExtraction, ExamExtractor } from "./extractor";
import { countPdfPages } from "./fingerprint";

type ExamImportJobRow = typeof examImportJob.$inferSelect;

/** Extract xong nhưng 0 nhóm câu hỏi hợp lệ → `empty_result` (E-004). */
export class EmptyResultError extends Error {
	constructor() {
		super("extracted exam has no valid question group");
		this.name = "EmptyResultError";
	}
}

/**
 * Nhóm câu hỏi hợp lệ (plan TOS-27 D2): có ít nhất 1 câu với `stem` và
 * `answer` đều không rỗng. Đề chỉ toàn passage trống/câu thiếu đáp án →
 * coi như AI không đọc được cấu trúc → hoàn Credit.
 */
export function hasValidQuestionGroup(exam: ExtractedExam): boolean {
	return exam.parts.some((part) =>
		part.questions.some(
			(question) =>
				question.stem.trim() !== "" && (question.answer ?? "").trim() !== "",
		),
	);
}

/** Phân loại lỗi sau reserve (plan TOS-27 D2) → `error_reason` của E-004. */
export function classifyImportError(
	error: unknown,
	timedOut: boolean,
): ExamImportFailReason {
	if (timedOut) return "timeout";
	if (error instanceof EmptyResultError) return "empty_result";
	return "ai_error";
}

/**
 * Hậu xử lý gán `needsReview` (server tính, UI chỉ đọc): tin cậy thấp,
 * thiếu đáp án, opts dưới 2 lựa chọn, hoặc đáp án không nằm trong opts.
 * (Chuyển từ route sang đây để POST và retry dùng chung một luồng.)
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

export interface RunImportInput {
	db: Db;
	extractor: ExamExtractor;
	store: MediaStore;
	orgId: string;
	userId: string;
	jobId: string;
	fileKey: string;
	/** Byte tệp: POST truyền byte vừa upload; retry truyền byte đọc lại từ R2. */
	data: ArrayBuffer;
	mimeType: string;
	fileName: string;
	/** Retry: file đã nằm trên R2 từ job trước — KHÔNG put lại. */
	putFile: boolean;
	/** Override timeout cho test (mặc định `EXAM_IMPORT_LIMITS.timeoutMs`). */
	timeoutMs?: number;
}

export type RunImportResult =
	| { ok: true; row: ExamImportJobRow }
	/** AI lỗi / timeout / 0 câu hợp lệ — credit đã hoàn, wire E-004. */
	| { ok: false; kind: "refunded"; reason: ExamImportFailReason }
	/** Settled rồi mới hỏng ghi job — credit ĐÃ trừ, wire `EXAM_IMPORT_FAILED`. */
	| { ok: false; kind: "hard" };

async function selectJobRow(
	db: Db,
	jobId: string,
): Promise<ExamImportJobRow | null> {
	const [row] = await db
		.select()
		.from(examImportJob)
		.where(eq(examImportJob.id, jobId))
		.limit(1);
	return row ?? null;
}

/**
 * Luồng extract dùng chung POST `/api/exam-imports` và retry (plan TOS-27
 * D2/D4): job đã INSERT `processing` + reserve xong trước khi vào đây.
 *
 * Bất biến:
 * - Timeout 120s kép — `AbortSignal` cho extractor nào nhận signal + race
 *   timer bảo đảm luồng luôn thoát đúng hạn dù extractor phớt lờ signal.
 * - Mỗi đổi trạng thái job đều UPDATE có điều kiện `import_status='processing'`
 *   (plan TOS-27): stale sweep thắng race → 0 row → luồng này KHÔNG ghi đè
 *   kết quả của sweep, và settle muộn tự bị chặn bởi precondition
 *   `held >= amount` của ví (settle/release thành công mới đổi status).
 */
export async function runImport(
	input: RunImportInput,
): Promise<RunImportResult> {
	const {
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
		putFile,
		timeoutMs,
	} = input;
	let signal: AbortSignal | undefined;
	let timedOut = false;
	let settled = false;
	try {
		if (putFile) {
			const body = new Response(data).body;
			if (body === null) {
				throw new Error("re-streaming uploaded body failed");
			}
			const counted = enforceDeclaredSize(body, data.byteLength);
			await store.put(fileKey, counted.stream, {
				contentType: mimeType,
				size: data.byteLength,
			});
		}
		signal = AbortSignal.timeout(timeoutMs ?? EXAM_IMPORT_LIMITS.timeoutMs);
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = Promise.withResolvers<never>();
		timer = setTimeout(() => {
			timedOut = true;
			timeout.reject(new Error("extraction timed out"));
		}, timeoutMs ?? EXAM_IMPORT_LIMITS.timeoutMs);
		let extraction: ExamExtraction;
		try {
			extraction = await Promise.race([
				extractor.extract({ data, mimeType, fileName }, signal),
				timeout.promise,
			]);
		} finally {
			clearTimeout(timer);
		}
		if (!hasValidQuestionGroup(extraction.exam)) throw new EmptyResultError();
		const draft = extractedExamDraftSchema.parse(
			toReviewedDraft(extraction.exam),
		);
		const pageCount =
			extraction.pageCount !== null
				? extraction.pageCount
				: countPdfPages(data);
		const completedAt = new Date();
		// Settle TRƯỚC khi mark `completed` (bất biến #470): settle hỏng →
		// catch-all hoàn credit sạch sẽ; chiều ngược lại kẹt "completed nhưng
		// held".
		await settleCredits(db, {
			orgId,
			actorUserId: userId,
			amount: CREDIT_COSTS.examImport,
			refId: jobId,
		});
		settled = true;
		const claimedRow = (
			await db
				.update(examImportJob)
				.set({
					draftJson: JSON.stringify(draft),
					importStatus: "completed",
					completedAt,
					pageCount,
				})
				.where(
					and(
						eq(examImportJob.id, jobId),
						eq(examImportJob.importStatus, "processing"),
					),
				)
				.returning()
		)[0];
		if (claimedRow) return { ok: true, row: claimedRow };
		// 0 row — stale sweep đã can thiệp trong cửa sổ hẹp: nếu sweep nhánh
		// crash-sau-settle đã mark completed (không kịp ghi draft) thì bổ sung
		// draft; nếu sweep đã release + failed thì nhận thất bại của sweep.
		const row = await selectJobRow(db, jobId);
		if (row?.importStatus === "completed") {
			const rewritten = (
				await db
					.update(examImportJob)
					.set({ draftJson: JSON.stringify(draft), pageCount })
					.where(eq(examImportJob.id, jobId))
					.returning()
			)[0];
			if (rewritten) return { ok: true, row: rewritten };
		}
		return {
			ok: false,
			kind: "refunded",
			reason: (row?.errorReason as ExamImportFailReason | null) ?? "timeout",
		};
	} catch (error) {
		if (settled) {
			// Settle đã chốt mà bước sau hỏng: credit đã trừ đúng sổ cái —
			// KHÔNG release. Thử mark lại 1 lần, vẫn lỗi thì trả `hard` (wire
			// `EXAM_IMPORT_FAILED` — KHÔNG dùng E-004 vì message E-004 nói
			// "credit đã hoàn" sẽ sai sự thật cho trường hợp này).
			try {
				await db
					.update(examImportJob)
					.set({ importStatus: "completed", completedAt: new Date() })
					.where(
						and(
							eq(examImportJob.id, jobId),
							eq(examImportJob.importStatus, "processing"),
						),
					);
			} catch (markError) {
				console.error(
					"[exam-imports] mark completed sau settle lỗi",
					markError,
				);
			}
			return { ok: false, kind: "hard" };
		}
		const reason = classifyImportError(
			error,
			timedOut || Boolean(signal?.aborted),
		);
		try {
			await releaseCredits(db, {
				orgId,
				actorUserId: userId,
				amount: CREDIT_COSTS.examImport,
				refId: jobId,
			});
		} catch (releaseError) {
			// Chỉ nuốt `InsufficientCreditsError` (held đã nhả do stale sweep
			// hoặc luồng khác); lỗi DB thật phải ném lên để job giữ nguyên
			// `processing` cho stale sweep hoàn ở lần dọn sau, không mark
			// `failed_refunded` khi held vẫn kẹt (code-review Important #1).
			if (!(releaseError instanceof InsufficientCreditsError)) {
				throw releaseError;
			}
		}
		// Mark `failed_refunded` CHỈ khi job vẫn `processing` — sweep thắng
		// race thì giữ nguyên kết quả của sweep (đúng reason của sweep).
		const updated = await db
			.update(examImportJob)
			.set({
				importStatus: "failed_refunded",
				errorCode: EXAM_IMPORT_ERROR_CODES.EXAM_FAILED,
				errorReason: reason,
				completedAt: new Date(),
			})
			.where(
				and(
					eq(examImportJob.id, jobId),
					eq(examImportJob.importStatus, "processing"),
				),
			)
			.returning();
		if (updated.length > 0) return { ok: false, kind: "refunded", reason };
		const row = await selectJobRow(db, jobId);
		return {
			ok: false,
			kind: "refunded",
			reason: (row?.errorReason as ExamImportFailReason | null) ?? reason,
		};
	}
}
