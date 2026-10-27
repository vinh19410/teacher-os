import {
	type CreditWallet,
	creditWalletSchema,
	EXAM_IMPORT_ERROR_CODES,
	type ExamImportDuplicate,
	type ExamImportJob,
	type ExamImportPublishResponse,
	type ExamImportSkill,
	type ExtractedExamDraft,
	examImportCreateResponseSchema,
	examImportJobSchema,
	examImportLookupResponseSchema,
	examImportPublishResponseSchema,
} from "@teacher-os/api/contracts";
import { getApiBaseUrl } from "@/lib/repos/api-base-url";

/**
 * Repos của luồng Nhập đề bằng AI (TOS-24, phase-03): POST raw-body file,
 * GET job, GET file gốc (stream) và GET ví Credit. Precedent upload #305 —
 * KHÔNG multipart: byte thô + header Content-Type/X-File-Name.
 * TOS-25 (#471): thêm `lookupExamImportByFingerprint` (kiểm tra trùng trước
 * upload) và `createExamImport` trả union — response 200 của POST giờ là
 * job mới **hoặc** `{ duplicateOf }` (narrow tại đây để route không bao giờ
 * đặt job rỗng vào state `done`).
 */

/** Kết quả POST /api/exam-imports sau khi narrow union của TOS-25. */
export type ExamImportCreateResult =
	| { kind: "created"; job: ExamImportJob }
	| { kind: "duplicate"; duplicate: ExamImportDuplicate };

/** Kết quả lỗi có cấu trúc của POST /api/exam-imports (contract đã đóng băng). */
export type ExamImportCreateError =
	| { kind: "insufficient_credits"; balance: number; available: number }
	| { kind: "invalid_file" }
	| { kind: "disabled" }
	| { kind: "failed"; jobId: string | null }
	// GET /:id trả 404 (job của org khác / đã xoá) — dùng chung ErrorNotice
	// của màn import (kongming PR-review #474 Minor #4).
	| { kind: "job_not_found" }
	| { kind: "unexpected"; status: number };

/**
 * POST /api/exam-imports — gửi nguyên byte file trong body. Server trả
 * 200 → job DTO; 402/400/503/502 map sang ExamImportCreateError để route
 * hiện đúng thông điệp (đều có ngữ nghĩa nghiệp vụ, không ném generic).
 */
export async function createExamImport(input: {
	file: File;
	baseUrl?: string;
	signal?: AbortSignal;
}): Promise<ExamImportCreateResult> {
	const baseUrl = input.baseUrl ?? getApiBaseUrl();
	const res = await fetch(`${baseUrl}/api/exam-imports`, {
		method: "POST",
		credentials: "include",
		headers: {
			"Content-Type": input.file.type || "application/octet-stream",
			"X-File-Name": encodeURIComponent(input.file.name),
		},
		body: input.file,
		signal: input.signal,
	});
	if (res.ok) {
		// TOS-25: union job | {duplicateOf} — job DTO là .strict() nên phân
		// biệt bằng presence của key `duplicateOf`.
		const body = examImportCreateResponseSchema.parse(await res.json());
		if ("duplicateOf" in body) {
			return { kind: "duplicate", duplicate: body.duplicateOf };
		}
		return { kind: "created", job: body };
	}
	throw await toCreateError(res);
}

async function toCreateError(res: Response): Promise<ExamImportCreateError> {
	// Body lỗi nhỏ dạng JSON; đọc defensively — server cũ trả rỗng thì vẫn
	// map đúng theo status code.
	let body: unknown = null;
	try {
		body = await res.json();
	} catch {
		// bỏ qua — status là nguồn chân lý chính.
	}
	const payload = (body ?? {}) as {
		code?: string;
		balance?: number;
		available?: number;
		jobId?: string;
	};
	if (res.status === 402) {
		const balance = typeof payload.balance === "number" ? payload.balance : 0;
		return {
			kind: "insufficient_credits",
			balance,
			// Server lỗi thời (chưa có available) → fallback bằng balance.
			available:
				typeof payload.available === "number" ? payload.available : balance,
		};
	}
	if (res.status === 400) return { kind: "invalid_file" };
	if (res.status === 503) return { kind: "disabled" };
	if (res.status === 502 && payload.code === EXAM_IMPORT_ERROR_CODES.FAILED) {
		return { kind: "failed", jobId: payload.jobId ?? null };
	}
	return { kind: "unexpected", status: res.status };
}

/** TOS-25: `GET /api/exam-imports/lookup?fingerprint=` — `duplicate | null`.
 * Throw khi mạng/server lỗi: caller (màn import) bắt và **fail-open** —
 * upload thẳng như TOS-24, không bao giờ chặn luồng (plan D1). */
export async function lookupExamImportByFingerprint(
	fingerprint: string,
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<ExamImportDuplicate | null> {
	const res = await fetch(
		`${baseUrl}/api/exam-imports/lookup?fingerprint=${encodeURIComponent(fingerprint)}`,
		{ credentials: "include", signal },
	);
	if (!res.ok) throw new Error(`Failed to lookup exam import: ${res.status}`);
	return examImportLookupResponseSchema.parse(await res.json()).duplicate;
}

/** GET /api/exam-imports/:id — job DTO (draft có needsReview do server tính). */
export async function fetchExamImportJob(
	jobId: string,
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<ExamImportJob> {
	const res = await fetch(`${baseUrl}/api/exam-imports/${jobId}`, {
		credentials: "include",
		signal,
	});
	if (res.status === 404) {
		throw { kind: "job_not_found" } satisfies ExamImportCreateError;
	}
	if (!res.ok)
		throw new Error(`Failed to fetch exam import job: ${res.status}`);
	return examImportJobSchema.parse(await res.json());
}

/**
 * GET /api/exam-imports/:id/file — stream file gốc về blob URL để pdfjs/ảnh
 * load trực tiếp. Caller nhớ revoke khi unmount (xem SourceDocumentViewer).
 */
export async function fetchExamImportFileUrl(
	jobId: string,
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<string> {
	const res = await fetch(`${baseUrl}/api/exam-imports/${jobId}/file`, {
		credentials: "include",
		signal,
	});
	if (!res.ok)
		throw new Error(`Failed to fetch exam import file: ${res.status}`);
	const blob = await res.blob();
	return URL.createObjectURL(blob);
}

/** GET /api/credits/wallet — { balance, held, available }. */
export async function fetchCreditWallet(
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<CreditWallet> {
	const res = await fetch(`${baseUrl}/api/credits/wallet`, {
		credentials: "include",
		signal,
	});
	if (!res.ok) throw new Error(`Failed to fetch credit wallet: ${res.status}`);
	return creditWalletSchema.parse(await res.json());
}

/** Skill hiển thị viết thường có dấu (Badge kỹ năng của panel bóc tách). */
export const EXAM_IMPORT_SKILL_LABELS: Record<ExamImportSkill, string> = {
	reading: "reading",
	listening: "listening",
	writing: "writing",
	speaking: "speaking",
	mixed: "mixed",
};

/** Kết quả lỗi nghiệp vụ của `POST /api/exam-imports/:id/publish` (TOS-26 #472). */
export type ExamImportPublishError =
	| { kind: "review_confirmation_required" }
	| { kind: "too_many_parts"; maxParts?: number }
	| { kind: "skill_mixed_not_allowed" }
	| {
			kind: "invalid_draft";
			partIndex?: number;
			questionIndex?: number;
	  }
	| { kind: "job_not_found" }
	| { kind: "unexpected"; status: number };

/**
 * PATCH /api/exam-imports/:id/draft — lưu bản nháp chỉnh sửa tay với chi phí
 * 0 Credit (TOS-26 #472).
 */
export async function saveExamImportDraft(input: {
	jobId: string;
	draft: ExtractedExamDraft;
	baseUrl?: string;
	signal?: AbortSignal;
}): Promise<ExamImportJob> {
	const baseUrl = input.baseUrl ?? getApiBaseUrl();
	const res = await fetch(`${baseUrl}/api/exam-imports/${input.jobId}/draft`, {
		method: "PATCH",
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ draft: input.draft }),
		signal: input.signal,
	});
	if (res.ok) return examImportJobSchema.parse(await res.json());
	throw new Error(`Failed to save exam import draft: ${res.status}`);
}

/**
 * POST /api/exam-imports/:id/publish — xuất bản đề vào Ngân hàng đề của tổ chức
 * sau khi kiểm tra cổng xác nhận câu gắn nhãn Cần rà soát lại (TOS-26 #472).
 */
export async function publishExamImport(input: {
	jobId: string;
	draft: ExtractedExamDraft;
	reviewConfirmed: boolean;
	baseUrl?: string;
	signal?: AbortSignal;
}): Promise<ExamImportPublishResponse> {
	const baseUrl = input.baseUrl ?? getApiBaseUrl();
	const res = await fetch(
		`${baseUrl}/api/exam-imports/${input.jobId}/publish`,
		{
			method: "POST",
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				draft: input.draft,
				reviewConfirmed: input.reviewConfirmed,
			}),
			signal: input.signal,
		},
	);
	if (res.ok) return examImportPublishResponseSchema.parse(await res.json());
	throw await toPublishError(res);
}

async function toPublishError(res: Response): Promise<ExamImportPublishError> {
	let body: unknown = null;
	try {
		body = await res.json();
	} catch {
		// bỏ qua
	}
	const record =
		body && typeof body === "object" ? (body as Record<string, unknown>) : {};
	const code = typeof record.code === "string" ? record.code : "";
	if (res.status === 404) return { kind: "job_not_found" };
	if (res.status === 422) {
		if (code === EXAM_IMPORT_ERROR_CODES.REVIEW_CONFIRMATION_REQUIRED) {
			return { kind: "review_confirmation_required" };
		}
		if (code === EXAM_IMPORT_ERROR_CODES.TOO_MANY_PARTS) {
			return {
				kind: "too_many_parts",
				maxParts:
					typeof record.maxParts === "number" ? record.maxParts : undefined,
			};
		}
		if (code === EXAM_IMPORT_ERROR_CODES.SKILL_MIXED_NOT_ALLOWED) {
			return { kind: "skill_mixed_not_allowed" };
		}
		return {
			kind: "invalid_draft",
			partIndex:
				typeof record.partIndex === "number" ? record.partIndex : undefined,
			questionIndex:
				typeof record.questionIndex === "number"
					? record.questionIndex
					: undefined,
		};
	}
	return { kind: "unexpected", status: res.status };
}
