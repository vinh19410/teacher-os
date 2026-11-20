import {
	PLACEMENT_AI_ERROR_CODES,
	PLACEMENT_SPEAKING_ERROR_CATEGORIES,
	PLACEMENT_WRITING_ERROR_CATEGORIES,
	type PlacementErrorSkill,
	type PlacementSpeakingErrorCategory,
	type PlacementWritingErrorCategory,
	placementErrorCategoriesForSkill,
} from "@teacher-os/api/placement-test-contracts";
import {
	normalizeKindDraft,
	PLACEMENT_AI_ERRORS_MAX,
	type PlacementAiGrader,
	PlacementAiGradingError,
	type PlacementAiPollResult,
} from "./grader";

export const OPENAI_API_BASE = "https://api.openai.com/v1";
export const DEFAULT_OPENAI_GRADING_MODEL = "gpt-6-luna";
export const DEFAULT_OPENAI_TRANSCRIBE_MODEL = "gpt-4o-transcribe";
/**
 * Timeout mỗi lượt HTTP tới OpenAI. Chấm chạy ở background mode (tạo job +
 * poll) nên mỗi lượt ngắn — vừa ngân sách ~30s của `waitUntil` trên Workers.
 */
export const OPENAI_CALL_TIMEOUT_MS = 25_000;

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

const WRITING_CATEGORY_DESCRIPTIONS: Record<
	PlacementWritingErrorCategory,
	string
> = {
	task: "trả lời chưa đầy đủ, lạc ý hoặc thiếu yêu cầu đề bài",
	coherence: "mạch lạc, liên kết câu/đoạn, từ nối và bố cục bài viết",
	lexical: "chọn từ, cụm từ, lặp từ và lỗi chính tả (spelling)",
	grammar: "ngữ pháp, chia động từ, cấu trúc câu và dấu câu",
};

const SPEAKING_CATEGORY_DESCRIPTIONS: Record<
	PlacementSpeakingErrorCategory,
	string
> = {
	fluency: "độ trôi chảy, ngập ngừng, lặp ý, mạch lạc và từ nối khi nói",
	lexical: "chọn từ, cụm từ tự nhiên và phạm vi từ vựng",
	grammar: "ngữ pháp, chia động từ và cấu trúc câu khi nói",
	pronunciation:
		"phát âm sai từ hoặc bị nhận diện lệch rõ ràng trong transcript",
};

function categoryLinesFor(skill: PlacementErrorSkill): string {
	if (skill === "writing") {
		return PLACEMENT_WRITING_ERROR_CATEGORIES.map(
			(c) =>
				`- "${c.key}" (${c.label}): ${WRITING_CATEGORY_DESCRIPTIONS[c.key]}`,
		).join("\n");
	}
	return PLACEMENT_SPEAKING_ERROR_CATEGORIES.map(
		(c) =>
			`- "${c.key}" (${c.label}): ${SPEAKING_CATEGORY_DESCRIPTIONS[c.key]}`,
	).join("\n");
}

function commonRulesFor(skill: PlacementErrorSkill): string {
	return [
		"Nhiệm vụ DUY NHẤT của bạn là liệt kê các lỗi ngôn ngữ thực sự có trong bài làm của học viên.",
		"TUYỆT ĐỐI KHÔNG chấm điểm, KHÔNG gợi ý band hay trình độ, và KHÔNG viết nhận xét tổng quan.",
		`"errors": tối đa ${PLACEMENT_AI_ERRORS_MAX} lỗi, ưu tiên lỗi quan trọng nhất. Mỗi lỗi gồm:`,
		'  - "category": một trong 4 key IELTS sau:',
		categoryLinesFor(skill),
		'  - "quote": đoạn NGUYÊN VĂN NGẮN NHẤT chứa lỗi, chép y hệt từ bài (giữ nguyên hoa/thường, dấu câu) — không sửa, không thêm dấu ba chấm.',
		'  - "correction": cách viết/nói đúng cho đoạn đó (tiếng Anh).',
		'  - "explanation": giải thích tiếng Việt 1–2 câu, ngắn gọn, dễ hiểu cho học viên.',
		"Không bịa lỗi; bài không có lỗi thì trả errors rỗng.",
	].join("\n");
}

function writingMessages(input: { prompt: string; text: string }) {
	return [
		{
			role: "system",
			content: [
				"Bạn là trợ lý phân tích lỗi bài WRITING theo 4 tiêu chí IELTS trong bài kiểm tra đầu vào tiếng Anh cho học viên người Việt.",
				'Lưu ý: mọi lỗi chính tả (spelling) đều xếp vào category "lexical".',
				commonRulesFor("writing"),
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
				"Bạn là trợ lý phân tích lỗi bài SPEAKING theo 4 tiêu chí IELTS trong bài kiểm tra đầu vào tiếng Anh cho học viên người Việt.",
				"Bạn CHỈ có transcript (văn bản do máy chuyển từ giọng nói), không nghe được audio.",
				'Lỗi category "pronunciation" chỉ đánh dấu khi transcript cho thấy rõ từ bị nói sai hoặc bị nhận diện lệch rõ ràng; tránh suy đoán khi không chắc chắn.',
				commonRulesFor("speaking"),
			].join("\n"),
		},
		{
			role: "user",
			content: `CÂU HỎI SPEAKING:\n${input.prompts.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\nTRANSCRIPT LỜI NÓI CỦA HỌC VIÊN:\n${input.transcript}`,
		},
	];
}

function draftJsonSchema(name: string, skill: PlacementErrorSkill) {
	return {
		name,
		strict: true,
		schema: {
			type: "object",
			additionalProperties: false,
			required: ["errors"],
			properties: {
				errors: {
					type: "array",
					items: {
						type: "object",
						additionalProperties: false,
						required: ["category", "quote", "correction", "explanation"],
						properties: {
							category: {
								type: "string",
								enum: placementErrorCategoriesForSkill(skill).map((c) => c.key),
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

/** Lỗi HTTP không đáng thử lại (job hỏng vĩnh viễn) — trừ 408/409/429/5xx. */
function isTransientStatus(status: number): boolean {
	return status === 408 || status === 409 || status === 429 || status >= 500;
}

class OpenAiHttpError extends PlacementAiGradingError {
	readonly status: number;

	constructor(path: string, status: number) {
		super(PLACEMENT_AI_ERROR_CODES.FAILED, `openai ${path} http ${status}`);
		this.status = status;
	}
}

/** Lấy text JSON từ `output[].content[]` (type `output_text`) của Responses. */
function responseOutputText(data: unknown): string | null {
	const output = (data as { output?: unknown })?.output;
	if (!Array.isArray(output)) return null;
	const parts: string[] = [];
	for (const item of output) {
		const content = (item as { content?: unknown })?.content;
		if (!Array.isArray(content)) continue;
		for (const c of content) {
			const part = c as { type?: unknown; text?: unknown };
			if (part.type === "output_text" && typeof part.text === "string") {
				parts.push(part.text);
			}
		}
	}
	const text = parts.join("");
	return text.trim().length > 0 ? text : null;
}

/**
 * Adapter OpenAI dùng `fetch` thuần (chạy được trên Workers lẫn node). Chấm
 * qua Responses API background mode: `start*` tạo job (`background: true`,
 * `store: true`) trả `response.id`; `poll` đọc `GET /responses/{id}`. Không
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
		init: { method: "GET" | "POST"; body?: BodyInit; json?: boolean },
		signal?: AbortSignal,
	): Promise<unknown> {
		const combined = callSignal(timeoutMs, signal);
		let res: Response;
		try {
			res = await doFetch(`${OPENAI_API_BASE}${path}`, {
				method: init.method,
				headers: {
					Authorization: `Bearer ${options.apiKey}`,
					...(init.json ? { "Content-Type": "application/json" } : {}),
				},
				...(init.body === undefined ? {} : { body: init.body }),
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
			throw new OpenAiHttpError(path, res.status);
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

	async function startJob(
		messages: Array<{ role: string; content: string }>,
		schema: ReturnType<typeof draftJsonSchema>,
		signal?: AbortSignal,
	): Promise<string> {
		const data = await request(
			"/responses",
			{
				method: "POST",
				json: true,
				body: JSON.stringify({
					model: gradingModel,
					background: true,
					store: true,
					input: messages,
					text: {
						format: {
							type: "json_schema",
							name: schema.name,
							strict: schema.strict,
							schema: schema.schema,
						},
					},
				}),
			},
			signal,
		);
		const id = (data as { id?: unknown })?.id;
		if (typeof id !== "string" || id.length === 0) {
			throw new PlacementAiGradingError(
				PLACEMENT_AI_ERROR_CODES.FAILED,
				"openai responses returned no id",
			);
		}
		return id;
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
				{ method: "POST", body: form },
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

		startWriting(input, signal) {
			return startJob(
				writingMessages(input),
				draftJsonSchema("placement_writing_grade", "writing"),
				signal,
			);
		},

		startSpeaking(input, signal) {
			return startJob(
				speakingMessages(input),
				draftJsonSchema("placement_speaking_grade", "speaking"),
				signal,
			);
		},

		async poll(id, kind, sourceText, signal): Promise<PlacementAiPollResult> {
			let data: unknown;
			try {
				data = await request(
					`/responses/${encodeURIComponent(id)}`,
					{ method: "GET" },
					signal,
				);
			} catch (error) {
				if (
					error instanceof OpenAiHttpError &&
					!isTransientStatus(error.status)
				) {
					return { state: "error", code: error.code };
				}
				// Mạng/timeout/5xx/429: chưa biết kết quả — thử lại lượt sau.
				return { state: "pending", transient: true };
			}
			const status = (data as { status?: unknown })?.status;
			if (
				status === "failed" ||
				status === "cancelled" ||
				status === "incomplete"
			) {
				return { state: "error", code: PLACEMENT_AI_ERROR_CODES.FAILED };
			}
			// queued/in_progress (hoặc trạng thái trung gian khác) → chờ tiếp;
			// job treo quá lâu bị finalize đánh dấu TIMEOUT.
			if (status !== "completed") return { state: "pending" };
			const text = responseOutputText(data);
			if (text === null) {
				return { state: "error", code: PLACEMENT_AI_ERROR_CODES.FAILED };
			}
			try {
				return {
					state: "draft",
					draft: normalizeKindDraft(JSON.parse(text), kind, sourceText),
				};
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
