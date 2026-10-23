import { htmlToPlainText } from "@teacher-os/api/rich-text";
import { answerChoices, kindOf, type QuestionItem } from "./assignment-presets";

/** Độ rút gọn tối đa của excerpt (Task 1.5). */
export const QUESTION_SUMMARY_EXCERPT_MAX = 90;

export interface QuestionSummary {
	/** Stem dạng plain text, rút gọn 90 ký tự kèm `…`. */
	excerpt: string;
	/** Số lựa chọn của câu (chip `{n} lựa chọn`); null = không hiện chip. */
	choiceCount: number | null;
	hasAnswer: boolean;
	hasExplanation: boolean;
}

/** Gộp khoảng trắng của excerpt để chip hàng thu gọn luôn nằm một dòng. */
function toExcerpt(stem: string): string {
	const plain = htmlToPlainText(stem).replace(/\s+/g, " ").trim();
	if (plain.length === 0) return "";
	if (plain.length <= QUESTION_SUMMARY_EXCERPT_MAX) return plain;
	return `${plain.slice(0, QUESTION_SUMMARY_EXCERPT_MAX)}…`;
}

/**
 * Tóm tắt một câu cho hàng thu gọn của `AnswerKeyGrid` (#424 Task 1.5).
 * `choiceCount` resolve theo hàng: `kindOf(item.type ?? typeId)` (mirror
 * `rowTypeOf` của grid); nhóm matching có `optionBank` đếm theo bank, MCQ
 * đếm theo `item.opts` (fallback bộ đáp án chuẩn); các dạng còn lại (gõ chữ,
 * letter/roman không bank, 3-trạng-thái) trả null — không hiện chip.
 */
export function questionSummary(
	item: QuestionItem,
	typeId: string,
	optionBank?: readonly string[],
): QuestionSummary {
	const kind = kindOf(item.type ?? typeId);
	let choiceCount: number | null = null;
	if (
		optionBank &&
		optionBank.length > 0 &&
		(kind === "letter" || kind === "roman")
	) {
		choiceCount = optionBank.length;
	} else if (kind === "mcq4" || kind === "mcq3") {
		const fallback = answerChoices(kind)?.length ?? 0;
		choiceCount = item.opts?.length ?? fallback;
	}
	return {
		excerpt: toExcerpt(item.stem),
		choiceCount,
		hasAnswer: item.answer.trim() !== "",
		hasExplanation: Boolean(item.explanation?.trim()),
	};
}
