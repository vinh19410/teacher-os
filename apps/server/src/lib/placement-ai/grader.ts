import {
	locatePlacementErrors,
	PLACEMENT_AI_ERROR_CODES,
	PLACEMENT_ERROR_CATEGORIES,
	PLACEMENT_ERROR_EXPLANATION_MAX,
	PLACEMENT_ERROR_QUOTE_MAX,
	PLACEMENT_SPEAKING_RUBRIC,
	PLACEMENT_WRITING_RUBRIC,
	type PlacementAiSkillDraft,
	type PlacementError,
	type PlacementSpeakingRubric,
	type PlacementWritingRubric,
	placementErrorListSchema,
} from "@teacher-os/api/placement-test-contracts";

/**
 * Chấm nháp AI Writing/Speaking của bài test đầu vào (#730) — interface
 * THUẦN (không type Cloudflare) để e2e type-check được qua `server/app`.
 * Cài thật: OpenAI (`openai-grader.ts`); cài giả: `fake-grader.ts`.
 */
export interface PlacementAiAudio {
	bytes: ArrayBuffer | Uint8Array;
	mime: string;
	filename: string;
}

export type PlacementAiSkillKind = "writing" | "speaking";

/** Nháp một kỹ năng (rubric Writing hoặc Speaking) — lưu nguyên JSON. */
export type PlacementAiAnyDraft =
	| PlacementAiSkillDraft<PlacementWritingRubric>
	| PlacementAiSkillDraft<PlacementSpeakingRubric>;

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
/** Giới hạn độ dài nhận xét AI (2–4 câu là đủ; chặn model lan man). */
export const PLACEMENT_AI_FEEDBACK_MAX = 2000;

const CATEGORY_KEYS = new Set<string>(
	PLACEMENT_ERROR_CATEGORIES.map((c) => c.key),
);

/** Điểm rubric LLM → số nguyên 0–5 (không phải số → lỗi FAILED). */
function clampRubricScore(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new PlacementAiGradingError(
			PLACEMENT_AI_ERROR_CODES.FAILED,
			"grader returned incomplete rubric",
		);
	}
	return Math.min(5, Math.max(0, Math.round(value)));
}

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/**
 * Chuẩn hoá đầu ra LLM thành `PlacementAiSkillDraft`: kẹp rubric 0–5 nguyên,
 * lọc lỗi sai loại/quote rỗng, cắt độ dài theo schema, gán id ổn định
 * (`w1`, `s1`…), validate zod rồi định vị lại offset trên `sourceText`.
 */
export function normalizeSkillDraft<K extends string>(
	raw: unknown,
	params: { rubricKeys: readonly K[]; idPrefix: string; sourceText: string },
): PlacementAiSkillDraft<Record<K, number>> {
	const obj = asRecord(raw);
	const rubricRaw = asRecord(obj.rubric);
	const rubric = Object.fromEntries(
		params.rubricKeys.map((key) => [key, clampRubricScore(rubricRaw[key])]),
	) as Record<K, number>;
	const feedback =
		typeof obj.feedback === "string"
			? obj.feedback.trim().slice(0, PLACEMENT_AI_FEEDBACK_MAX)
			: "";
	const rawErrors = Array.isArray(obj.errors) ? obj.errors : [];
	const errors: PlacementError[] = [];
	for (const item of rawErrors) {
		if (errors.length >= PLACEMENT_AI_ERRORS_MAX) break;
		const e = asRecord(item);
		const category = typeof e.category === "string" ? e.category : "";
		const quote =
			typeof e.quote === "string"
				? e.quote.trim().slice(0, PLACEMENT_ERROR_QUOTE_MAX)
				: "";
		if (!CATEGORY_KEYS.has(category) || quote.length === 0) continue;
		errors.push({
			id: `${params.idPrefix}${errors.length + 1}`,
			category: category as PlacementError["category"],
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
	const parsed = placementErrorListSchema.safeParse(errors);
	if (!parsed.success) {
		throw new PlacementAiGradingError(
			PLACEMENT_AI_ERROR_CODES.FAILED,
			"grader errors failed validation",
			{ cause: parsed.error },
		);
	}
	return {
		rubric,
		feedback,
		errors: locatePlacementErrors(params.sourceText, parsed.data),
	};
}

/** Key rubric + tiền tố id lỗi theo kỹ năng. */
export const PLACEMENT_AI_KIND_CONFIG = {
	writing: {
		rubricKeys: PLACEMENT_WRITING_RUBRIC.map((r) => r.key),
		idPrefix: "w",
	},
	speaking: {
		rubricKeys: PLACEMENT_SPEAKING_RUBRIC.map((r) => r.key),
		idPrefix: "s",
	},
} as const;

/** `normalizeSkillDraft` theo kỹ năng (rubric Writing hoặc Speaking). */
export function normalizeKindDraft(
	raw: unknown,
	kind: PlacementAiSkillKind,
	sourceText: string,
): PlacementAiAnyDraft {
	const config = PLACEMENT_AI_KIND_CONFIG[kind];
	return normalizeSkillDraft(raw, {
		rubricKeys: config.rubricKeys,
		idPrefix: config.idPrefix,
		sourceText,
	}) as PlacementAiAnyDraft;
}
