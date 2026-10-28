import { describe, expect, test } from "vitest";
import { createWorkersAiGrader } from "./workers-ai-grader";

describe("createWorkersAiGrader (TOS-30)", () => {
	const ESSAY =
		"Tourism has both positive and negative impacts on local culture.";

	/** Binding "hợp tác": reject đúng `signal.reason` khi bị abort. */
	function abortAwareBinding() {
		return {
			async run(
				_model: string,
				_input: Record<string, unknown>,
				options?: { signal?: AbortSignal },
			): Promise<never> {
				const signal = options?.signal;
				if (!signal) {
					return new Promise<never>(() => {});
				}
				const { promise, reject } = Promise.withResolvers<never>();
				signal.addEventListener("abort", () => reject(signal.reason), {
					once: true,
				});
				return promise;
			},
		};
	}

	test("signal hết hạn giữa chừng → lỗi giữ DOMException TimeoutError (không bị đổi FAILED)", async () => {
		const grader = createWorkersAiGrader(abortAwareBinding());
		await expect(
			grader.grade(
				{ skill: "writing", prompt: "Write an essay.", essay: ESSAY },
				AbortSignal.timeout(20),
			),
		).rejects.toMatchObject({ name: "TimeoutError" });
	});

	test("trả JSON bọc markdown fence → vẫn parse được điểm + nhận xét", async () => {
		const grader = createWorkersAiGrader({
			async run() {
				return {
					response:
						'```json\n{"scores": {"task": 6.5, "coherence": 7.0, "lexical": 6.0, "grammar": 6.5}, "feedback": "Bài tốt."}\n```',
				};
			},
		});
		const result = await grader.grade({
			skill: "writing",
			prompt: "Write an essay.",
			essay: ESSAY,
		});
		expect(result.scores).toEqual({
			task: 6.5,
			coherence: 7,
			lexical: 6,
			grammar: 6.5,
		});
		expect(result.feedback).toBe("Bài tốt.");
	});

	test("điểm lệch bước (6.3) → chuẩn hoá 6.5; thiếu key → FAILED", async () => {
		const rounding = createWorkersAiGrader({
			async run() {
				return {
					response:
						'{"scores": {"task": 6.3, "coherence": 7.0, "lexical": 6.0, "grammar": 6.5}, "feedback": "x"}',
				};
			},
		});
		const result = await rounding.grade({
			skill: "writing",
			prompt: "p",
			essay: ESSAY,
		});
		expect(result.scores.task).toBe(6.5);

		const incomplete = createWorkersAiGrader({
			async run() {
				return {
					response:
						'{"scores": {"task": 6.5, "coherence": 7.0}, "feedback": "x"}',
				};
			},
		});
		await expect(
			incomplete.grade({ skill: "writing", prompt: "p", essay: ESSAY }),
		).rejects.toMatchObject({ code: "AI_GRADING_FAILED" });
	});

	test("Speaking trả key sai bộ (task thay fluency) → FAILED", async () => {
		const grader = createWorkersAiGrader({
			async run() {
				return {
					response:
						'{"scores": {"task": 6.5, "coherence": 7.0, "lexical": 6.0, "grammar": 6.5}, "feedback": "x"}',
				};
			},
		});
		await expect(
			grader.grade({
				skill: "speaking",
				prompt: "Describe a person.",
				transcript: "...",
			}),
		).rejects.toMatchObject({ code: "AI_GRADING_FAILED" });
	});

	test("TOS-32: mode 'quick' dùng prompt ngắn gọn (không gợi ý sửa câu chi tiết)", async () => {
		const prompts: string[] = [];
		const grader = createWorkersAiGrader({
			async run(_model, input) {
				const msgs = input.messages as Array<{ content: string }>;
				prompts.push(msgs[0]?.content ?? "");
				return {
					response:
						'{"scores": {"task": 6.5, "coherence": 7.0, "lexical": 6.0, "grammar": 6.5}, "feedback": "Nhận xét ngắn."}',
				};
			},
		});
		await grader.grade({
			skill: "writing",
			prompt: "Write an essay.",
			essay: ESSAY,
			mode: "standard",
		});
		await grader.grade({
			skill: "writing",
			prompt: "Write an essay.",
			essay: ESSAY,
			mode: "quick",
		});
		expect(prompts[0]).toContain("gợi ý luyện tập cụ thể");
		expect(prompts[1]).toContain("Chế độ chấm nhanh");
		expect(prompts[1]).not.toContain("gợi ý luyện tập cụ thể");
	});
});
