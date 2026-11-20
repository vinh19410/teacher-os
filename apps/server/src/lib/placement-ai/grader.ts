import {
	locatePlacementErrors,
	normalizePlacementErrorCategory,
	PLACEMENT_AI_ERROR_CODES,
	PLACEMENT_ERROR_EXPLANATION_MAX,
	PLACEMENT_ERROR_QUOTE_MAX,
	type PlacementAiSkillDraft,
	type PlacementError,
	placementSpeakingErrorListSchema,
	placementWritingErrorListSchema,
} from "@teacher-os/api/placement-test-contracts";

/**
 * Phân tích lỗi nháp AI Writing/Speaking của bài test đầu vào (#730) — interface
 * THUẦN (không type Cloudflare) để e2e type-check được qua `server/app`.
 * Cài thật: OpenAI (`openai-grader.ts`); cài giả: `fake-grader.ts`.
 */
export interface PlacementAiAudio {
	bytes: ArrayBuffer | Uint8Array;
	mime: string;
	filename: string;
}

export type PlacementAiSkillKind = "writing" | "speaking";

/** Nháp một kỹ năng (chỉ liệt kê lỗi) — lưu nguyên JSON. */
export type PlacementAiAnyDraft = PlacementAiSkillDraft;

/**
 * Kết quả poll một job chấm nền:
 * - `pending`: job còn chạy; `transient` = không hỏi được lúc này (mạng,
 *   timeout, 5xx/429) — giữ `processing`, không tính quá hạn.
 * - `draft`: job xong, nháp đã chuẩn hoá.
 * - `error`: job hỏng vĩnh viễn (failed/cancelled/incomplete, JSON sai…).
 */
export type PlacementAiPollResult =
	| { state: "pending"; transient?: boolean }
	| { state: "draft"; draft: PlacementAiAnyDraft }
	| { state: "error"; code: PlacementAiErrorCode };

/**
 * Chấm hai pha: `start*` tạo job nền (trả id job) trong vài giây để vừa
 * ngân sách `waitUntil` của Workers; `poll` hỏi kết quả lúc giáo viên mở
 * bài. `transcribe` vẫn đồng bộ (một lượt ngắn, có timeout).
 */
export interface PlacementAiGrader {
	transcribe(audio: PlacementAiAudio, signal?: AbortSignal): Promise<string>;
	startWriting(
		input: { prompt: string; text: string },
		signal?: AbortSignal,
	): Promise<string>;
	startSpeaking(
		input: { prompts: string[]; transcript: string },
		signal?: AbortSignal,
	): Promise<string>;
	poll(
		id: string,
		kind: PlacementAiSkillKind,
		sourceText: string,
		signal?: AbortSignal,
	): Promise<PlacementAiPollResult>;
}

export type PlacementAiErrorCode =
	(typeof PLACEMENT_AI_ERROR_CODES)[keyof typeof PLACEMENT_AI_ERROR_CODES];

/** Lỗi grader mang mã `PLACEMENT_AI_ERROR_CODES` (lưu `ai_error_code`). */
export class PlacementAiGradingError extends Error {
	readonly code: PlacementAiErrorCode;

	constructor(
		code: PlacementAiErrorCode,
		message: string,
		options?: { cause?: unknown },
	) {
		super(message);
		this.name = "PlacementAiGradingError";
		this.code = code;
		this.cause = options?.cause;
	}
}

/** Mỗi lượt AI tối đa ~25 lỗi — ưu tiên lỗi quan trọng, đỡ rối học viên. */
export const PLACEMENT_AI_ERRORS_MAX = 25;

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/**
 * Chuẩn hoá đầu ra LLM thành `PlacementAiSkillDraft` (chỉ danh sách lỗi):
 * kiểm tra có mảng `errors`, chuẩn hoá loại lỗi theo kỹ năng (loại key lạ hoặc
 * quote rỗng), cắt độ dài theo schema, gán id ổn định (`w1`, `s1`…), validate
 * zod theo kỹ năng rồi định vị lại offset trên `sourceText`.
 */
export function normalizeSkillDraft(
	raw: unknown,
	params: {
		idPrefix: string;
		sourceText: string;
		skill: PlacementAiSkillKind;
	},
): PlacementAiSkillDraft {
	if (
		typeof raw !== "object" ||
		raw === null ||
		Array.isArray(raw) ||
		!Array.isArray((raw as Record<string, unknown>).errors)
	) {
		throw new PlacementAiGradingError(
			PLACEMENT_AI_ERROR_CODES.FAILED,
			"grader returned incomplete errors",
		);
	}
	const obj = asRecord(raw);
	const rawErrors = Array.isArray(obj.errors) ? obj.errors : [];
	const errors: PlacementError[] = [];
	for (const item of rawErrors) {
		if (errors.length >= PLACEMENT_AI_ERRORS_MAX) break;
		const e = asRecord(item);
		const rawCategory = typeof e.category === "string" ? e.category : "";
		const category = normalizePlacementErrorCategory(rawCategory, params.skill);
		const quote =
			typeof e.quote === "string"
				? e.quote.trim().slice(0, PLACEMENT_ERROR_QUOTE_MAX)
				: "";
		if (!category || quote.length === 0) continue;
		errors.push({
			id: `${params.idPrefix}${errors.length + 1}`,
			category,
			quote,
			start: null,
			end: null,
			correction:
				typeof e.correction === "string"
					? e.correction.trim().slice(0, PLACEMENT_ERROR_QUOTE_MAX)
					: "",
			explanation:
				typeof e.explanation === "string"
					? e.explanation.trim().slice(0, PLACEMENT_ERROR_EXPLANATION_MAX)
					: "",
		});
	}
	const listSchema =
		params.skill === "writing"
			? placementWritingErrorListSchema
			: placementSpeakingErrorListSchema;
	const parsed = listSchema.safeParse(errors);
	if (!parsed.success) {
		throw new PlacementAiGradingError(
			PLACEMENT_AI_ERROR_CODES.FAILED,
			"grader errors failed validation",
			{ cause: parsed.error },
		);
	}
	return {
		errors: locatePlacementErrors(params.sourceText, parsed.data),
	};
}

/** Tiền tố id lỗi theo kỹ năng. */
const PLACEMENT_AI_KIND_ID_PREFIX: Record<PlacementAiSkillKind, string> = {
	writing: "w",
	speaking: "s",
};

/** `normalizeSkillDraft` theo kỹ năng (Writing hoặc Speaking). */
export function normalizeKindDraft(
	raw: unknown,
	kind: PlacementAiSkillKind,
	sourceText: string,
): PlacementAiAnyDraft {
	return normalizeSkillDraft(raw, {
		idPrefix: PLACEMENT_AI_KIND_ID_PREFIX[kind],
		sourceText,
		skill: kind,
	});
}
