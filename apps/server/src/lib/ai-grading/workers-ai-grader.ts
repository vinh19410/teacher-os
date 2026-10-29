import { AI_GRADING_ERROR_CODES } from "@teacher-os/api/contracts";
import {
	criteriaForSkill,
	criterionLabel,
} from "@teacher-os/api/lib/ielts-band";
import { z } from "zod";
import {
	type AiGrader,
	AiGradingFailedError,
	type AiGradingInput,
	type AiGradingResult,
	roundBandStep,
} from "./grader";

/**
 * Binding `AI` nhìn theo cấu trúc cục bộ (chỉ 1 phương thức grader dùng):
 * `run` của Workers AI. Khớp mọi handle `Ai` của alchemy/alchemy-runtime
 * mà không import type Cloudflare (chuẩn `WorkersAiBinding` extractor).
 */
export interface WorkersAiBinding {
	run(
		model: string,
		input: Record<string, unknown>,
		options?: { signal?: AbortSignal },
	): Promise<unknown>;
}

/** Model text Workers AI dùng chấm IELTS — 70B đủ chất lượng band gợi ý. */
export const AI_GRADING_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** Nội dung chấm tách riêng khỏi adapter — chỉnh chất lượng chỉ đụng 1 file. */
function gradingPrompt(input: AiGradingInput): string {
	const criteria = criteriaForSkill(input.skill)
		.map(
			(key) =>
				`- "${key}": ${criterionLabel(input.skill, key, input.part ?? "")}`,
		)
		.join("\n");
	const submission =
		input.skill === "writing"
			? `BÀI VIẾT CỦA THÍ SINH:\n${input.essay ?? ""}`
			: `LỜI NÓI CỦA THÍ SINH (đã chuyển văn bản):\n${input.transcript ?? ""}`;
	return [
		"Bạn là giám khảo IELTS giàu kinh nghiệm. Chấm bài nộp của thí sinh theo đúng tiêu chí IELTS chính thức, thang 0–9, chỉ dùng bội số của 0.5.",
		"",
		`KỸ NĂNG: ${input.skill.toUpperCase()}`,
		input.part ? `PART: ${input.part}` : "",
		`ĐỀ BÀI:\n${input.prompt}`,
		"",
		submission,
		"",
		"Tiêu chí cần chấm (dùng ĐÚNG key, đủ 4 key, mỗi key một số thang 0–9 bội của 0.5):",
		criteria,
		"",
		input.mode === "quick"
			? "Chế độ chấm nhanh: Nhận xét (tiếng Việt, 1–2 câu ngắn gọn) chỉ nêu đánh giá tổng quan, KHÔNG gợi ý sửa câu chi tiết."
			: "Nhận xét (tiếng Việt, 2–4 câu): nêu 1 điểm mạnh, 1 điểm cần cải thiện và 1 gợi ý luyện tập cụ thể.",
		"",
		'Trả về CHỈ MỘT JSON object, không markdown, không chữ nào khác: {"scores": {<4 key trên>: <số>}, "feedback": "<chuỗi>"}',
	]
		.filter((line) => line !== "")
		.join("\n");
}

/** Shape JSON mà grader được yêu cầu trả — boundary ngoài (LLM) nên parse zod. */
const graderResponseSchema = z.object({
	scores: z.record(z.string(), z.unknown()),
	feedback: z.string(),
});

/** Bóc JSON khỏi câu trả lời LLM (chịu markdown fence / chữ thừa). */
function extractJson(text: string): unknown {
	const trimmed = text
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/```\s*$/, "");
	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start === -1 || end <= start) {
		throw new AiGradingFailedError(
			AI_GRADING_ERROR_CODES.FAILED,
			"grader response has no JSON object",
		);
	}
	try {
		return JSON.parse(trimmed.slice(start, end + 1));
	} catch (error) {
		throw new AiGradingFailedError(
			AI_GRADING_ERROR_CODES.FAILED,
			"grader response is not valid JSON",
			{ cause: error },
		);
	}
}

/** Adapter Workers AI — production dùng qua binding `AI` (index.ts inject). */
export function createWorkersAiGrader(binding: WorkersAiBinding): AiGrader {
	return {
		async grade(
			input: AiGradingInput,
			signal?: AbortSignal,
		): Promise<AiGradingResult> {
			let raw: unknown;
			try {
				raw = await binding.run(
					AI_GRADING_MODEL,
					{
						messages: [{ role: "user", content: gradingPrompt(input) }],
						max_tokens: 1024,
						temperature: 0.2,
					},
					{ signal },
				);
			} catch (error) {
				// Signal đã abort → ném lại `signal.reason` (DOMException
				// "TimeoutError") giữ đúng ý nghĩa timeout (kongming #478):
				// Workers AI có thể bọc AbortError thành lỗi chung, nếu để
				// FAILED thì dashboard/analytics đếm nhầm timeout thành lỗi AI.
				if (signal?.aborted) throw signal.reason ?? error;
				throw new AiGradingFailedError(
					AI_GRADING_ERROR_CODES.FAILED,
					"workers ai run failed",
					{ cause: error },
				);
			}
			// Shape chuẩn text model của Workers AI: `{ response: string }`
			// (narrowing `in` — không cast mù).
			let text = "";
			if (typeof raw === "string") {
				text = raw;
			} else if (typeof raw === "object" && raw !== null && "response" in raw) {
				const response: unknown = raw.response;
				if (typeof response === "string") text = response;
			}
			if (text.length === 0) {
				throw new AiGradingFailedError(
					AI_GRADING_ERROR_CODES.FAILED,
					"grader response is empty",
				);
			}
			const parsed = graderResponseSchema.safeParse(extractJson(text));
			if (!parsed.success) {
				throw new AiGradingFailedError(
					AI_GRADING_ERROR_CODES.FAILED,
					"grader response shape mismatch",
					{ cause: parsed.error },
				);
			}
			// Chuẩn hoá band bước 0.5 + CHỈ giữ đúng 4 key tiêu chí của skill;
			// thiếu key coi grader hỏng (FAILED) — không điền 0 thay (shape chấm
			// tay `parseGradeScores` ở publish là nguồn chuẩn).
			const keys = criteriaForSkill(input.skill);
			const scores: Record<string, number> = {};
			for (const key of keys) {
				const value = parsed.data.scores[key];
				if (typeof value !== "number") {
					throw new AiGradingFailedError(
						AI_GRADING_ERROR_CODES.FAILED,
						"grader returned incomplete scores",
					);
				}
				scores[key] = roundBandStep(value);
			}
			return { scores, feedback: parsed.data.feedback.slice(0, 5000) };
		},
	};
}
