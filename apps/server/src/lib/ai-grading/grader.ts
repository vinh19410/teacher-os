import type { GradableSkill } from "@teacher-os/api/lib/ielts-band";

/**
 * Đầu vào chấm nháp AI (TOS-30 #478) — interface THUẦN, không tham chiếu
 * type Cloudflare: e2e (tsconfig `types: ["node"]`) type-check `server/app`
 * kéo theo file này, nên adapter Workers AI nằm ở `workers-ai-grader.ts`
 * và chỉ `index.ts` import (precedent extractor TOS-24 #470).
 */
export interface AiGradingInput {
	skill: GradableSkill;
	/** Đề gốc (prompt của part cho Writing, cue card cho Speaking). */
	prompt: string;
	/** Part của đề Writing ("task1"/"task2"/…); rỗng với Speaking/đề cũ. */
	part?: string;
	/** Bài viết Writing — plain text đã bóc markup. */
	essay?: string;
	/** Lời nói Speaking đã chuyển văn bản (TOS-31 STT; TOS-30 luôn rỗng). */
	transcript?: string;
}

/** Kết quả chấm nháp — `scores` theo key `criteriaForSkill(skill)`. */
export interface AiGradingResult {
	scores: Record<string, number>;
	feedback: string;
}

/** Grader chấm nháp — cài thật (Workers AI) và fake (test/e2e) cùng hợp đồng. */
export interface AiGrader {
	grade(input: AiGradingInput, signal?: AbortSignal): Promise<AiGradingResult>;
}

/** Lỗi pipeline coi grader thất bại — draft `manual_pending` + release Credit. */
export class AiGradingFailedError extends Error {
	readonly code: string;

	constructor(code: string, message: string, options?: { cause?: unknown }) {
		super(message);
		this.name = "AiGradingFailedError";
		this.code = code;
		this.cause = options?.cause;
	}
}

/**
 * Chuẩn hoá một band LLM về bước 0.5 trong [0, 9] (`isBandStep`): giá
 * không phải số về 0, ngoài khoảng kẹp lại, lẻ 0.25/0.75 làm tròn gần nhất.
 * Chạy TRƯỚC khi validate bằng `writingGradeScoresSchema`/`speakingGradeScoresSchema`
 * để model không vì lệch 0.01 mà làm hỏng cả lượt chấm.
 */
export function roundBandStep(value: number): number {
	if (!Number.isFinite(value)) return 0;
	const rounded = Math.round(value * 2) / 2;
	return Math.min(9, Math.max(0, rounded));
}
