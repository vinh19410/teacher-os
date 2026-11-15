import {
	PLACEMENT_AI_ERROR_CODES,
	PLACEMENT_ERROR_CATEGORIES,
	PLACEMENT_SPEAKING_RUBRIC,
	PLACEMENT_WRITING_RUBRIC,
} from "@teacher-os/api/placement-test-contracts";
import {
	normalizeSkillDraft,
	PLACEMENT_AI_ERRORS_MAX,
	type PlacementAiGrader,
	PlacementAiGradingError,
} from "./grader";

export const OPENAI_API_BASE = "https://api.openai.com/v1";
export const DEFAULT_OPENAI_GRADING_MODEL = "gpt-6-luna";
export const DEFAULT_OPENAI_TRANSCRIBE_MODEL = "gpt-4o-transcribe";
/** Timeout mỗi lượt gọi OpenAI (chấm hoặc chuyển giọng nói). */
export const OPENAI_CALL_TIMEOUT_MS = 90_000;

export interface OpenAiPlacementGraderOptions {
	apiKey: string;
	gradingModel?: string;
	transcribeModel?: string;
	/** Test inject fetch giả; mặc định `fetch` toàn cục. */
	fetch?: typeof fetch;
	timeoutMs?: number;
}

export interface PlacementAiEnv {
	OPENAI_API_KEY?: string;
	OPENAI_GRADING_MODEL?: string;
	OPENAI_TRANSCRIBE_MODEL?: string;
}

/**
 * Gate (#730): chỉ bật khi có `OPENAI_API_KEY` — độc lập `AI_ENABLED`
 * (Workers AI). Rỗng → undefined → pipeline đánh dấu `AI_GRADING_DISABLED`.
 */
export function createPlacementAiGrader(
	env: PlacementAiEnv,
): PlacementAiGrader | undefined {
	const apiKey = env.OPENAI_API_KEY?.trim() ?? "";
	if (!apiKey) return undefined;
	return createOpenAiPlacementGrader({
		apiKey,
		gradingModel: env.OPENAI_GRADING_MODEL?.trim() || undefined,
		transcribeModel: env.OPENAI_TRANSCRIBE_MODEL?.trim() || undefined,
	});
}

const CATEGORY_LINES = PLACEMENT_ERROR_CATEGORIES.map(
	(c) => `- "${c.key}": ${c.label}`,
).join("\n");

function rubricLines(
	rubric: ReadonlyArray<{ key: string; label: string; desc: string }>,
): string {
	return rubric.map((r) => `- "${r.key}" (${r.label}): ${r.desc}`).join("\n");
}

const COMMON_RULES = [
	"Mỗi tiêu chí rubric chấm một SỐ NGUYÊN từ 0 đến 5 (5 = rất tốt so với trình độ A1–B1).",
	'"feedback": 2–4 câu tiếng Việt: nêu điểm mạnh, điểm cần cải thiện và một gợi ý luyện tập cụ thể.',
	`"errors": tối đa ${PLACEMENT_AI_ERRORS_MAX} lỗi, ưu tiên lỗi quan trọng nhất. Mỗi lỗi gồm:`,
	'  - "category": một trong các key sau:',
	CATEGORY_LINES,
	'  - "quote": đoạn NGUYÊN VĂN NGẮN NHẤT chứa lỗi, chép y hệt từ bài (giữ nguyên hoa/thường, dấu câu) — không sửa, không thêm dấu ba chấm.',
	'  - "correction": cách viết/nói đúng cho đoạn đó (tiếng Anh).',
	'  - "explanation": giải thích tiếng Việt 1–2 câu, dễ hiểu cho học viên trình độ A1–B1.',
	"Không bịa lỗi; bài không có lỗi thì trả errors rỗng.",
].join("\n");

function writingMessages(input: { prompt: string; text: string }) {
	return [
		{
			role: "system",
			content: [
				"Bạn là giáo viên tiếng Anh chấm bài kiểm tra đầu vào (trình độ A1–B1) cho học viên người Việt.",
				"Chấm phần WRITING theo rubric:",
				rubricLines(PLACEMENT_WRITING_RUBRIC),
				COMMON_RULES,
			].join("\n"),
		},
		{
			role: "user",
			content: `ĐỀ BÀI:\n${input.prompt}\n\nBÀI VIẾT CỦA HỌC VIÊN:\n${input.text}`,
		},
	];
}

function speakingMessages(input: { prompts: string[]; transcript: string }) {
	return [
		{
			role: "system",
			content: [
				"Bạn là giáo viên tiếng Anh chấm bài kiểm tra đầu vào (trình độ A1–B1) cho học viên người Việt.",
				"Chấm phần SPEAKING theo rubric:",
				rubricLines(PLACEMENT_SPEAKING_RUBRIC),
				"Bạn CHỈ có transcript (văn bản do máy chuyển từ giọng nói), không nghe được audio: chấm Pronunciation (pr) thận trọng, chỉ dựa trên dấu hiệu trong transcript (từ bị nhận sai, câu đứt quãng), và nói rõ hạn chế này trong feedback.",
				"Lỗi category pronunciation chỉ đánh dấu khi transcript cho thấy rõ từ bị nói sai.",
				COMMON_RULES,
			].join("\n"),
		},
		{
			role: "user",
			content: `CÂU HỎI SPEAKING:\n${input.prompts.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\nTRANSCRIPT LỜI NÓI CỦA HỌC VIÊN:\n${input.transcript}`,
		},
	];
}

function draftJsonSchema(name: string, rubricKeys: readonly string[]) {
	return {
		name,
		strict: true,
		schema: {
			type: "object",
			additionalProperties: false,
			required: ["rubric", "feedback", "errors"],
			properties: {
				rubric: {
					type: "object",
					additionalProperties: false,
					required: [...rubricKeys],
					properties: Object.fromEntries(
						rubricKeys.map((k) => [
							k,
							{ type: "integer", minimum: 0, maximum: 5 },
						]),
					),
				},
				feedback: { type: "string" },
				errors: {
					type: "array",
					items: {
						type: "object",
						additionalProperties: false,
						required: ["category", "quote", "correction", "explanation"],
						properties: {
							category: {
								type: "string",
								enum: PLACEMENT_ERROR_CATEGORIES.map((c) => c.key),
							},
							quote: { type: "string" },
							correction: { type: "string" },
							explanation: { type: "string" },
						},
					},
				},
			},
		},
	};
}

/** Gộp signal caller + timeout mỗi lượt. */
function callSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
	const timeout = AbortSignal.timeout(timeoutMs);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function isAbortLike(error: unknown, signal: AbortSignal): boolean {
	if (signal.aborted) return true;
	return (
		error instanceof Error &&
		(error.name === "AbortError" || error.name === "TimeoutError")
	);
}

/**
 * Adapter OpenAI dùng `fetch` thuần (chạy được trên Workers lẫn node). Không
 * bao giờ log key hay nội dung bài làm — lỗi chỉ mang mã + HTTP status.
 */
export function createOpenAiPlacementGrader(
	options: OpenAiPlacementGraderOptions,
): PlacementAiGrader {
	const doFetch = options.fetch ?? fetch;
	const gradingModel = options.gradingModel || DEFAULT_OPENAI_GRADING_MODEL;
	const transcribeModel =
		options.transcribeModel || DEFAULT_OPENAI_TRANSCRIBE_MODEL;
	const timeoutMs = options.timeoutMs ?? OPENAI_CALL_TIMEOUT_MS;

	async function request(
		path: string,
		init: { body: BodyInit; json: boolean },
		signal?: AbortSignal,
	): Promise<unknown> {
		const combined = callSignal(timeoutMs, signal);
		let res: Response;
		try {
			res = await doFetch(`${OPENAI_API_BASE}${path}`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${options.apiKey}`,
					...(init.json ? { "Content-Type": "application/json" } : {}),
				},
				body: init.body,
				signal: combined,
			});
		} catch (error) {
			if (isAbortLike(error, combined)) {
				throw new PlacementAiGradingError(
					PLACEMENT_AI_ERROR_CODES.TIMEOUT,
					`openai ${path} timed out`,
				);
			}
			throw new PlacementAiGradingError(
				PLACEMENT_AI_ERROR_CODES.FAILED,
				`openai ${path} network error`,
			);
		}
		if (!res.ok) {
			// Bỏ body: thân lỗi có thể lặp lại nội dung bài làm.
			await res.body?.cancel().catch(() => {});
			throw new PlacementAiGradingError(
				PLACEMENT_AI_ERROR_CODES.FAILED,
				`openai ${path} http ${res.status}`,
			);
		}
		try {
			return await res.json();
		} catch (error) {
			if (isAbortLike(error, combined)) {
				throw new PlacementAiGradingError(
					PLACEMENT_AI_ERROR_CODES.TIMEOUT,
					`openai ${path} timed out`,
				);
			}
			throw new PlacementAiGradingError(
				PLACEMENT_AI_ERROR_CODES.FAILED,
				`openai ${path} returned invalid JSON`,
			);
		}
	}

	async function chatJson(
		messages: Array<{ role: string; content: string }>,
		schema: ReturnType<typeof draftJsonSchema>,
		signal?: AbortSignal,
	): Promise<unknown> {
		const data = await request(
			"/chat/completions",
			{
				json: true,
				body: JSON.stringify({
					model: gradingModel,
					messages,
					response_format: { type: "json_schema", json_schema: schema },
				}),
			},
			signal,
		);
		const choices = (data as { choices?: unknown })?.choices;
		const message = Array.isArray(choices)
			? (choices[0] as { message?: { content?: unknown } } | undefined)?.message
			: undefined;
		const content = message?.content;
		if (typeof content !== "string" || content.trim().length === 0) {
			throw new PlacementAiGradingError(
				PLACEMENT_AI_ERROR_CODES.FAILED,
				"openai chat returned no content",
			);
		}
		try {
			return JSON.parse(content);
		} catch {
			throw new PlacementAiGradingError(
				PLACEMENT_AI_ERROR_CODES.FAILED,
				"openai chat content is not valid JSON",
			);
		}
	}

	return {
		async transcribe(audio, signal) {
			const form = new FormData();
			const bytes =
				audio.bytes instanceof Uint8Array
					? audio.bytes
					: new Uint8Array(audio.bytes);
			form.append(
				"file",
				new Blob([bytes as Uint8Array<ArrayBuffer>], { type: audio.mime }),
				audio.filename,
			);
			form.append("model", transcribeModel);
			form.append("language", "en");
			form.append("response_format", "json");
			const data = await request(
				"/audio/transcriptions",
				{ json: false, body: form },
				signal,
			);
			const text = (data as { text?: unknown })?.text;
			if (typeof text !== "string") {
				throw new PlacementAiGradingError(
					PLACEMENT_AI_ERROR_CODES.FAILED,
					"openai transcription has no text",
				);
			}
			return text.trim();
		},

		async gradeWriting(input, signal) {
			const keys = PLACEMENT_WRITING_RUBRIC.map((r) => r.key);
			const raw = await chatJson(
				writingMessages(input),
				draftJsonSchema("placement_writing_grade", keys),
				signal,
			);
			return normalizeSkillDraft(raw, {
				rubricKeys: keys,
				idPrefix: "w",
				sourceText: input.text,
			});
		},

		async gradeSpeaking(input, signal) {
			const keys = PLACEMENT_SPEAKING_RUBRIC.map((r) => r.key);
			const raw = await chatJson(
				speakingMessages(input),
				draftJsonSchema("placement_speaking_grade", keys),
				signal,
			);
			return normalizeSkillDraft(raw, {
				rubricKeys: keys,
				idPrefix: "s",
				sourceText: input.transcript,
			});
		},
	};
}
