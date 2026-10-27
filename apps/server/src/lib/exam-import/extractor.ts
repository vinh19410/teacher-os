import {
	EXAM_IMPORT_SKILLS,
	type ExtractedExam,
	extractedExamSchema,
} from "@teacher-os/api/contracts";

/** Đầu vào extract — buffer đề gốc + MIME đã kiểm ở route. */
export interface ExamExtractInput {
	data: ArrayBuffer;
	mimeType: string;
	fileName: string;
}

/**
 * Extractor bóc tách đề (TOS-24 #470). Interface THUẦN — KHÔNG tham chiếu
 * type Cloudflare: e2e (tsconfig `types: ["node"]`) type-check `server/app`
 * kéo theo file này, nên adapter Workers AI nằm ở `createWorkersAiExtractor`
 * và chỉ `index.ts` import (precedent media-store.ts).
 */
export interface ExamExtractor {
	extract(
		input: ExamExtractInput,
		signal?: AbortSignal,
	): Promise<{ exam: ExtractedExam; pageCount: number | null }>;
}

/**
 * Binding `AI` nhìn theo cấu trúc cục bộ (chỉ 2 phương thức extractor dùng):
 * `toMarkdown` của AI Search/markdown conversion + `run` của Workers AI.
 * `toMarkdown` tuỳ phiên bản trả chuỗi, `{ data }` hoặc mảng kết quả theo
 * file (binding thật trả `ConversionResponse[]` — shape union ở dưới nhận
 * được cả ba, chuẩn hoá trong `markdownText`).
 */
export interface WorkersAiBinding {
	toMarkdown(
		contents: Array<{ name: string; blob: Blob }>,
	): Promise<
		| string
		| { data: string }
		| Array<{ name: string; data?: string; error?: unknown }>
	>;
	run(
		model: string,
		input: Record<string, unknown>,
		options?: { signal?: AbortSignal },
	): Promise<unknown>;
}

/** Model multimodal Workers AI dùng cho bước bóc tách (plan phase-02). */
export const EXAM_EXTRACT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

/** Lỗi extractor: markdown conversion, JSON parse hoặc schema không khớp. */
export class ExtractionFailedError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message);
		this.name = "ExtractionFailedError";
		this.cause = options?.cause;
	}
}

/**
 * json_schema viết tay khớp `extractedExamSchema` (contracts) — truyền
 * nguyên văn vào `response_format` của `AI.run`; schema zod vẫn là nguồn
 * chuẩn, bản literal này chỉ phục vụ prompt bên LLM.
 */
const EXAM_JSON_SCHEMA = {
	type: "object",
	properties: {
		title: { type: "string", minLength: 1, maxLength: 200 },
		skill: { type: "string", enum: [...EXAM_IMPORT_SKILLS] },
		timeLimitMinutes: {
			type: ["integer", "null"],
			minimum: 1,
			maximum: 300,
		},
		parts: {
			type: "array",
			minItems: 1,
			maxItems: 10,
			items: {
				type: "object",
				properties: {
					passage: { type: ["string", "null"], maxLength: 20_000 },
					questions: {
						type: "array",
						minItems: 1,
						maxItems: 40,
						items: {
							type: "object",
							properties: {
								stem: { type: "string", minLength: 1, maxLength: 500 },
								opts: {
									type: ["array", "null"],
									items: { type: "string", minLength: 1, maxLength: 500 },
									maxItems: 6,
								},
								answer: { type: ["string", "null"], maxLength: 200 },
								type: { type: ["string", "null"], minLength: 1, maxLength: 20 },
								explanation: {
									type: ["string", "null"],
									minLength: 1,
									maxLength: 2000,
								},
								confidence: { type: "number", minimum: 0, maximum: 1 },
							},
							required: ["stem", "confidence"],
							additionalProperties: false,
						},
					},
				},
				required: ["questions"],
				additionalProperties: false,
			},
		},
	},
	required: ["title", "skill", "parts"],
	additionalProperties: false,
} as const;

const EXTRACT_SYSTEM_PROMPT = [
	"You are an exam-paper structuring assistant. From the document markdown, extract the exam as JSON matching the given json_schema exactly.",
	"Rules: keep question stems verbatim; put multiple-choice options in `opts` and the correct option text in `answer`; set `type` to a short label (mcq, tfng, short_answer, gap_fill); set `confidence` between 0 and 1 for how sure the extraction is (lower when the scan is blurry or the answer is guessed).",
	"Set `skill` to one of reading, listening, writing, speaking, mixed, and `timeLimitMinutes` when the paper states one.",
	'Example output for a tiny IELTS reading sheet: {"title":"IELTS Reading Practice 1","skill":"reading","timeLimitMinutes":20,"parts":[{"passage":"The honeybee waggle dance communicates food direction and distance.\\nScouts repeat the dance until recruits depart.","questions":[{"stem":"The waggle dance signals food distance.","opts":["TRUE","FALSE","NOT GIVEN"],"answer":"TRUE","type":"tfng","confidence":0.95},{"stem":"How long do scouts repeat the dance?","opts":null,"answer":"Until recruits depart","type":"short_answer","confidence":0.7}]}]}.',
].join(" ");

/** Bỏ bọc ```json fences LLM hay thêm quanh JSON. */
function stripCodeFence(raw: string): string {
	const trimmed = raw.trim();
	const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/.exec(trimmed);
	return (fenced?.[1] ?? trimmed).trim();
}

/** LLM có thể trả chuỗi thuần, `{ response: string }` hoặc object lạ —
 * thu hẹp bằng typeof/`in`, không cast; object lạ serialize để parse thử. */
function responseText(raw: unknown): string {
	if (typeof raw === "string") return raw;
	if (raw !== null && typeof raw === "object" && "response" in raw) {
		const { response } = raw;
		if (typeof response === "string") return response;
	}
	return JSON.stringify(raw);
}

/** Chuẩn hoá 3 shape `toMarkdown` → markdown của file đầu; null = lỗi. */
function markdownText(
	converted: string | { data: string } | Array<{ name: string; data?: string }>,
): string | null {
	if (typeof converted === "string") return converted;
	if (Array.isArray(converted)) {
		const first = converted[0];
		return first && typeof first.data === "string" ? first.data : null;
	}
	return typeof converted.data === "string" ? converted.data : null;
}

/**
 * Extractor thật từ binding Workers AI: `toMarkdown` chuyển PDF/ảnh thành
 * markdown, rồi `run` LLM với json_schema; parse lỗi →
 * `ExtractionFailedError`. `pageCount` trả null — Workers AI không cung cấp,
 * route tự fallback regex đếm trang PDF (`countPdfPages`).
 */
export function createWorkersAiExtractor(ai: WorkersAiBinding): ExamExtractor {
	return {
		async extract(input, signal) {
			let markdown: string;
			try {
				const converted = await ai.toMarkdown([
					{
						name: input.fileName,
						blob: new Blob([input.data], { type: input.mimeType }),
					},
				]);
				const text = markdownText(converted);
				if (text === null) {
					throw new Error("conversion result has no markdown data");
				}
				markdown = text;
			} catch (error) {
				throw new ExtractionFailedError("markdown conversion failed", {
					cause: error,
				});
			}

			let parsed: unknown;
			try {
				const raw = await ai.run(
					EXAM_EXTRACT_MODEL,
					{
						messages: [
							{ role: "system", content: EXTRACT_SYSTEM_PROMPT },
							{ role: "user", content: markdown },
						],
						response_format: {
							type: "json_schema",
							json_schema: {
								name: "extracted_exam",
								schema: EXAM_JSON_SCHEMA,
								strict: true,
							},
						},
					},
					{ signal },
				);
				const text = responseText(raw);
				parsed = JSON.parse(stripCodeFence(text));
			} catch (error) {
				throw new ExtractionFailedError("extraction output is not JSON", {
					cause: error,
				});
			}

			const result = extractedExamSchema.safeParse(parsed);
			if (!result.success) {
				throw new ExtractionFailedError(
					`extraction failed schema validation (${result.error.issues.length} issue(s))`,
					{ cause: result.error },
				);
			}
			return { exam: result.data, pageCount: null };
		},
	};
}
