import {
	type CreditWallet,
	creditWalletSchema,
	EXAM_IMPORT_ERROR_CODES,
	type ExamImportJob,
	type ExamImportSkill,
	examImportJobSchema,
} from "@teacher-os/api/contracts";
import { getApiBaseUrl } from "@/lib/repos/api-base-url";

/**
 * Repos của luồng Nhập đề bằng AI (TOS-24, phase-03): POST raw-body file,
 * GET job, GET file gốc (stream) và GET ví Credit. Precedent upload #305 —
 * KHÔNG multipart: byte thô + header Content-Type/X-File-Name.
 */

/** Kết quả lỗi có cấu trúc của POST /api/exam-imports (contract đã đóng băng). */
export type ExamImportCreateError =
	| { kind: "insufficient_credits"; balance: number }
	| { kind: "invalid_file" }
	| { kind: "disabled" }
	| { kind: "failed"; jobId: string | null }
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
}): Promise<ExamImportJob> {
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
	if (res.ok) return examImportJobSchema.parse(await res.json());
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
		jobId?: string;
	};
	if (res.status === 402) {
		return {
			kind: "insufficient_credits",
			balance: typeof payload.balance === "number" ? payload.balance : 0,
		};
	}
	if (res.status === 400) return { kind: "invalid_file" };
	if (res.status === 503) return { kind: "disabled" };
	if (res.status === 502 && payload.code === EXAM_IMPORT_ERROR_CODES.FAILED) {
		return { kind: "failed", jobId: payload.jobId ?? null };
	}
	return { kind: "unexpected", status: res.status };
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
