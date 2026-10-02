/** Nguồn regex marker ô trống (≥ 4 gạch dưới) — nguồn duy nhất cho api + ui. */
export const CLOZE_MARKER_SOURCE = "_{4,}";

/** Các type điền chữ có editor cloze. Chỉ các type này mới được suy luận
 * type theo câu; `tablecomp`, `shortans`, `""` (prompt đã xoá) và mọi type
 * khác giữ nguyên. */
export const CLOZE_EDITOR_TYPES: ReadonlySet<string> = new Set([
	"sent",
	"note",
	"summary",
	"flowchart",
	"form",
	"notes",
	"sent4",
	"flow",
]);

type Family = "TF" | "YN" | "NEUTRAL";

/** Đáp án canonical (sau trim, phân biệt hoa thường) → họ của nó. */
const ANSWER_FAMILY: ReadonlyMap<string, Family> = new Map([
	["TRUE", "TF"],
	["FALSE", "TF"],
	["YES", "YN"],
	["NO", "YN"],
	["NOT GIVEN", "NEUTRAL"],
]);

const MARKER_PATTERN = new RegExp(CLOZE_MARKER_SOURCE);

interface InferableQuestion {
	stem: string;
	opts: readonly string[] | null;
	answer: string;
	type?: string | null;
	pin?: unknown;
}

function candidateFamily(question: InferableQuestion): Family | null {
	if (question.opts && question.opts.length > 0) return null;
	if (question.pin) return null;
	if (MARKER_PATTERN.test(question.stem)) return null;
	return ANSWER_FAMILY.get(question.answer.trim()) ?? null;
}

/**
 * Type hiệu dụng cho từng câu (cùng index với `questions`).
 *
 * - Câu có `type` → giữ nguyên.
 * - `promptType` không thuộc CLOZE_EDITOR_TYPES → mọi câu không type nhận
 *   `promptType`, không suy luận gì.
 * - Còn lại: câu "ứng viên" là câu không opts, không pin, stem không marker
 *   và đáp án (trim) đúng chính tả TRUE/FALSE/NOT GIVEN/YES/NO. Các ứng viên
 *   LIÊN TIẾP gom thành run, run bị cắt khi đổi họ TRUE/FALSE <-> YES/NO; run
 *   có họ YES/NO → "ynng", run họ TRUE/FALSE hoặc chỉ có NOT GIVEN → "tfng".
 *   Câu không phải ứng viên nhận `promptType`.
 */
export function inferQuestionTypes(
	questions: readonly InferableQuestion[],
	promptType: string,
): string[] {
	const result = questions.map((question) => question.type ?? promptType);
	if (!CLOZE_EDITOR_TYPES.has(promptType)) return result;

	let run: number[] = [];
	let runFamily: Exclude<Family, "NEUTRAL"> | null = null;
	const flush = () => {
		const inferred = runFamily === "YN" ? "ynng" : "tfng";
		for (const index of run) result[index] = inferred;
		run = [];
		runFamily = null;
	};

	questions.forEach((question, index) => {
		const family = question.type ? null : candidateFamily(question);
		if (family === null) {
			flush();
			return;
		}
		if (family !== "NEUTRAL") {
			if (runFamily !== null && runFamily !== family) flush();
			runFamily = family;
		}
		run.push(index);
	});
	flush();

	return result;
}
