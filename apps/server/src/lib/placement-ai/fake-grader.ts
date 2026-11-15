import { PLACEMENT_AI_ERROR_CODES } from "@teacher-os/api/placement-test-contracts";
import {
	normalizeSkillDraft,
	type PlacementAiGrader,
	PlacementAiGradingError,
} from "./grader";

/** Transcript cố định của fake grader — e2e/test kiểm highlight trên đó. */
export const FAKE_PLACEMENT_TRANSCRIPT =
	"I like to go to the beach with my family.";
export const FAKE_PLACEMENT_WRITING_FEEDBACK =
	"Bài viết đủ ý chính, bố cục email rõ ràng. Cần chú ý chia động từ và dùng thêm từ nối.";
export const FAKE_PLACEMENT_SPEAKING_FEEDBACK =
	"Trả lời đúng trọng tâm, câu ngắn gọn. Phát âm chỉ đánh giá sơ bộ qua transcript.";

export interface FakePlacementAiGraderOptions {
	/** Transcript trả về (mặc định `FAKE_PLACEMENT_TRANSCRIPT`; "" để thử NO_TRANSCRIPT). */
	transcript?: string;
	/** Ném lỗi ở mọi lượt (test nhánh lỗi). */
	error?: Error;
	/** Trì hoãn mỗi lượt (test CAS chạy trùng). */
	delayMs?: number;
	/** Đếm số lượt gọi (test không chạy trùng). */
	calls?: { transcribe: number; writing: number; speaking: number };
}

function firstWord(text: string): string {
	return text.trim().split(/\s+/)[0] ?? "";
}

/**
 * Fake grader deterministic cho test node + e2e (boot.ts inject qua
 * `getPlacementAiGrader`): rubric 3 cho mọi tiêu chí, đánh dấu từ đầu tiên
 * của bài là lỗi ngữ pháp. Bài chứa `ai-fail` → lỗi AI_GRADING_FAILED.
 */
export function createFakePlacementAiGrader(
	options: FakePlacementAiGraderOptions = {},
): PlacementAiGrader {
	async function gate(content: string) {
		if (options.delayMs) {
			await new Promise((resolve) => setTimeout(resolve, options.delayMs));
		}
		if (options.error) throw options.error;
		if (content.toLowerCase().includes("ai-fail")) {
			throw new PlacementAiGradingError(
				PLACEMENT_AI_ERROR_CODES.FAILED,
				"simulated placement AI failure",
			);
		}
	}
	function errorsFor(text: string, explanation: string) {
		const word = firstWord(text);
		return word
			? [
					{
						category: "grammar",
						quote: word,
						correction: word,
						explanation,
					},
				]
			: [];
	}
	return {
		async transcribe() {
			if (options.calls) options.calls.transcribe += 1;
			await gate("");
			return options.transcript ?? FAKE_PLACEMENT_TRANSCRIPT;
		},
		async gradeWriting(input) {
			if (options.calls) options.calls.writing += 1;
			await gate(input.text);
			return normalizeSkillDraft(
				{
					rubric: { ct: 3, or: 3, lg: 3 },
					feedback: FAKE_PLACEMENT_WRITING_FEEDBACK,
					errors: errorsFor(input.text, "Lỗi mẫu của fake grader (Writing)."),
				},
				{
					rubricKeys: ["ct", "or", "lg"],
					idPrefix: "w",
					sourceText: input.text,
				},
			);
		},
		async gradeSpeaking(input) {
			if (options.calls) options.calls.speaking += 1;
			await gate(input.transcript);
			return normalizeSkillDraft(
				{
					rubric: { gv: 3, dm: 3, pr: 3, ic: 3 },
					feedback: FAKE_PLACEMENT_SPEAKING_FEEDBACK,
					errors: errorsFor(
						input.transcript,
						"Lỗi mẫu của fake grader (Speaking).",
					),
				},
				{
					rubricKeys: ["gv", "dm", "pr", "ic"],
					idPrefix: "s",
					sourceText: input.transcript,
				},
			);
		},
	};
}
