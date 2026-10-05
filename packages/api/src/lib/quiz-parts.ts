import type { StudentQuizQuestion } from "../contracts";
import { splitQuizIntro } from "./quiz-intro-sections";

/** Một câu hỏi trong part, mang sẵn index `q` (0-based, key của answers
 * map + PATCH body) và số hiển thị `number` (q + qStart). */
export interface QuizPartQuestion extends StudentQuizQuestion {
	q: number;
	number: number;
}

/**
 * Part hiển thị trên take screen. Nguồn part: (1) cụm câu liên tiếp cùng
 * dạng bài (`question.type ?? promptType` — fallback kép theo contract) —
 * đề 1 type gom 1 cụm duy nhất, đề trộn dạng mỗi cụm có header riêng;
 * (2) section của intro do giáo viên dán marker "Questions X–Y" (#301) —
 * khi đó part mang instructionHtml của giáo viên thay header chuẩn.
 */
export interface QuizPart {
	id: string;
	/** `Questions X–Y` (1 câu: `Questions X`). */
	label: string;
	qStart: number;
	/** Dạng bài hiệu dụng của cụm — key vào `QUIZ_TYPE_DISPLAY`. */
	typeId: string;
	questions: QuizPartQuestion[];
	/** Instruction riêng của giáo viên cho cụm (tách từ intro). undefined =
	 * cụm theo type → header dùng QUIZ_TYPE_DISPLAY. */
	instructionHtml?: string;
}

/** Chia questions trong nửa mở [fromQ, toQ) thành các cụm liên tiếp cùng
 * type hiệu dụng. `qStart`/`number` đánh theo q toàn cục (1-based). */
function clusterByType(
	questions: readonly StudentQuizQuestion[],
	fromQ: number,
	toQ: number,
	promptType: string,
): QuizPart[] {
	const parts: QuizPart[] = [];
	let current: QuizPart | null = null;
	for (const [q, question] of questions.entries()) {
		if (q < fromQ) continue;
		if (q >= toQ) break;
		const typeId = question.type ?? promptType;
		if (!current || current.typeId !== typeId) {
			current = {
				id: "",
				label: "",
				qStart: q + 1,
				typeId,
				questions: [],
			};
			parts.push(current);
		}
		current.questions.push({ q, number: q + 1, ...question });
	}
	return parts;
}

/** Đóng gói part: id theo thứ tự cuối cùng + label `Questions X–Y`. */
function finalizeParts(parts: QuizPart[]): QuizPart[] {
	for (const [index, part] of parts.entries()) {
		part.id = `part-${index + 1}`;
		const first = part.qStart;
		const last = part.qStart + part.questions.length - 1;
		part.label =
			first === last ? `Questions ${first}` : `Questions ${first}–${last}`;
	}
	return parts;
}

/** Chia questions thành các part hiển thị. Có `intro` và intro dán được các
 * khối "Questions X–Y" thì mỗi section thành 1 part mang instructionHtml
 * của giáo viên (offset numbering: "Questions 14–20" trên đề part 2 → câu
 * 1–7); khoảng không được intro phủ vẫn gom theo type. intro không tách được
 * → hành vi cũ nguyên vẹn. `q`/`number` không đổi vì đáp án và grading key
 * theo `q`. */
export function buildQuizParts(
	questions: readonly StudentQuizQuestion[],
	promptType: string,
	intro = "",
): QuizPart[] {
	const split = splitQuizIntro(intro, questions.length);
	if (!split) {
		return finalizeParts(
			clusterByType(questions, 0, questions.length, promptType),
		);
	}
	const parts: QuizPart[] = [];
	let cursor = 0;
	for (const section of split.sections) {
		if (cursor < section.start - 1) {
			parts.push(
				...clusterByType(questions, cursor, section.start - 1, promptType),
			);
		}
		const from = section.start - 1;
		const to = section.end;
		parts.push({
			id: "",
			label: "",
			qStart: section.start,
			// Fallback kép theo contract: type câu đầu của section.
			typeId: questions[from]?.type ?? promptType,
			instructionHtml: section.html,
			questions: questions.slice(from, to).map((question, offset) => ({
				q: from + offset,
				number: from + offset + 1,
				...question,
			})),
		});
		cursor = to;
	}
	if (cursor < questions.length) {
		parts.push(
			...clusterByType(questions, cursor, questions.length, promptType),
		);
	}
	return finalizeParts(parts);
}

/** Câu được tính là đã trả lời khi value tồn tại và khác rỗng sau trim
 * (khớp grader: blank = skipped). */
export function isAnsweredValue(value: string | undefined): boolean {
	return (value ?? "").trim().length > 0;
}

export function countAnswered(
	answers: Record<number, string>,
	questions: readonly QuizPartQuestion[],
): number {
	return questions.filter(({ q }) => isAnsweredValue(answers[q])).length;
}
