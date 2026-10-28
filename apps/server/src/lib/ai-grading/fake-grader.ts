import { AI_GRADING_ERROR_CODES } from "@teacher-os/api/contracts";
import { criteriaForSkill } from "@teacher-os/api/lib/ielts-band";
import {
	type AiGrader,
	AiGradingFailedError,
	type AiGradingInput,
	type AiGradingResult,
} from "./grader";
/** Nhận xét mặc định của fake grader — đủ dùng cho test + e2e AC-001. */
export const FAKE_AI_FEEDBACK =
	"Bài viết có ý tưởng rõ ràng, liên kết hợp lý. Cần phát triển thêm ví dụ ở đoạn 2 và đa dạng từ vựng học thuật.";

export interface FakeAiGraderOptions {
	/** Ghi đè điểm theo key tiêu chí (thiếu key lấy mặc định 6.5). */
	scores?: Record<string, number>;
	feedback?: string;
	/** Trì hoãn trước khi trả kết quả (test timeout — dùng giá trị nhỏ). */
	delayMs?: number;
	/** Ném lỗi thay vì trả kết quả (test nhánh lỗi). */
	error?: Error;
}

/**
 * Fake grader cho test node + e2e (boot.ts inject qua `getAiGrader`).
 * Mặc định trả điểm cố định task 6.5 / coherence 7.0 / lexical 6.0 /
 * grammar 6.5 — đúng kịch bản e2e AC-001 (phase-03).
 */
export function createFakeAiGrader(
	options: FakeAiGraderOptions = {},
): AiGrader {
	const defaultScores = [6.5, 7, 6, 6.5];
	return {
		// Cố ý BỎ QUA `signal` khi delay — mô phỏng AI treo cứng không hợp
		// tác; pipeline phải tự cắt deadline (kongming #478 follow-up).
		async grade(
			input: AiGradingInput,
			_signal?: AbortSignal,
		): Promise<AiGradingResult> {
			if (options.delayMs) {
				const { promise, resolve } = Promise.withResolvers<void>();
				setTimeout(resolve, options.delayMs);
				await promise;
			}
			if (options.error) throw options.error;
			const content =
				`${input.essay ?? ""} ${input.transcript ?? ""}`.toLowerCase();
			if (content.includes("ai-fail")) {
				throw new AiGradingFailedError(
					AI_GRADING_ERROR_CODES.FAILED,
					"simulated AI grading failure",
				);
			}
			const keys = criteriaForSkill(input.skill);
			const scores = Object.fromEntries(
				keys.map((key, index) => {
					const value = options.scores?.[key] ?? defaultScores[index % 4];
					return [key, value] as [string, number];
				}),
			);
			return { scores, feedback: options.feedback ?? FAKE_AI_FEEDBACK };
		},
	};
}
