import { PLACEMENT_AI_ERROR_CODES } from "@teacher-os/api/placement-test-contracts";
import {
	normalizeKindDraft,
	type PlacementAiGrader,
	PlacementAiGradingError,
	type PlacementAiPollResult,
	type PlacementAiSkillKind,
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
	/** Ném lỗi ở mọi lượt transcribe/start (test nhánh lỗi). */
	error?: Error;
	/** Trì hoãn mỗi lượt transcribe/start (test CAS chạy trùng). */
	delayMs?: number;
	/**
	 * Mỗi job trả `pending` bấy nhiêu lần poll đầu rồi mới có kết quả (một số
	 * cho mọi kỹ năng, hoặc riêng từng kỹ năng).
	 */
	pendingPolls?: number | Partial<Record<PlacementAiSkillKind, number>>;
	/** Poll trả `pending` tạm thời (mô phỏng lỗi mạng) — không bao giờ xong. */
	transientPoll?: boolean;
	/** Đếm số lượt gọi (test không chạy trùng). */
	calls?: {
		transcribe: number;
		writing: number;
		speaking: number;
		poll?: number;
	};
}

function firstWord(text: string): string {
	return text.trim().split(/\s+/)[0] ?? "";
}

interface FakeJob {
	kind: PlacementAiSkillKind;
	content: string;
	pollsLeft: number;
}

/**
 * Fake grader deterministic hai pha cho test node + e2e (boot.ts inject qua
 * `getPlacementAiGrader`): `start*` trả id giả, `poll` trả nháp ngay (hoặc
 * sau `pendingPolls` lần). Rubric 3 cho mọi tiêu chí, đánh dấu từ đầu tiên
 * của bài là lỗi ngữ pháp. Bài chứa `ai-fail` → job lỗi AI_GRADING_FAILED.
 */
export function createFakePlacementAiGrader(
	options: FakePlacementAiGraderOptions = {},
): PlacementAiGrader {
	const jobs = new Map<string, FakeJob>();
	let seq = 0;

	async function gate() {
		if (options.delayMs) {
			await new Promise((resolve) => setTimeout(resolve, options.delayMs));
		}
		if (options.error) throw options.error;
	}
	function enqueue(kind: PlacementAiSkillKind, content: string): string {
		seq += 1;
		const id = `fake-${kind}-${seq}`;
		const pending = options.pendingPolls;
		const pollsLeft =
			typeof pending === "number" ? pending : (pending?.[kind] ?? 0);
		jobs.set(id, { kind, content, pollsLeft });
		return id;
	}
	function draftFor(kind: PlacementAiSkillKind, text: string) {
		const word = firstWord(text);
		const label = kind === "writing" ? "Writing" : "Speaking";
		return normalizeKindDraft(
			{
				rubric:
					kind === "writing"
						? { ct: 3, or: 3, lg: 3 }
						: { gv: 3, dm: 3, pr: 3, ic: 3 },
				feedback:
					kind === "writing"
						? FAKE_PLACEMENT_WRITING_FEEDBACK
						: FAKE_PLACEMENT_SPEAKING_FEEDBACK,
				errors: word
					? [
							{
								category: "grammar",
								quote: word,
								correction: word,
								explanation: `Lỗi mẫu của fake grader (${label}).`,
							},
						]
					: [],
			},
			kind,
			text,
		);
	}

	return {
		async transcribe() {
			if (options.calls) options.calls.transcribe += 1;
			await gate();
			return options.transcript ?? FAKE_PLACEMENT_TRANSCRIPT;
		},
		async startWriting(input) {
			if (options.calls) options.calls.writing += 1;
			await gate();
			return enqueue("writing", input.text);
		},
		async startSpeaking(input) {
			if (options.calls) options.calls.speaking += 1;
			await gate();
			return enqueue("speaking", input.transcript);
		},
		async poll(id, kind, sourceText): Promise<PlacementAiPollResult> {
			if (options.calls) options.calls.poll = (options.calls.poll ?? 0) + 1;
			if (options.transientPoll) return { state: "pending", transient: true };
			const job = jobs.get(id);
			if (!job || job.kind !== kind) {
				return { state: "error", code: PLACEMENT_AI_ERROR_CODES.FAILED };
			}
			if (job.pollsLeft > 0) {
				job.pollsLeft -= 1;
				return { state: "pending" };
			}
			jobs.delete(id);
			if (job.content.toLowerCase().includes("ai-fail")) {
				return { state: "error", code: PLACEMENT_AI_ERROR_CODES.FAILED };
			}
			try {
				return { state: "draft", draft: draftFor(kind, sourceText) };
			} catch (error) {
				return {
					state: "error",
					code:
						error instanceof PlacementAiGradingError
							? error.code
							: PLACEMENT_AI_ERROR_CODES.FAILED,
				};
			}
		},
	};
}
