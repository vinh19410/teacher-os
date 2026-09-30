import type { StudentQuizQuestion } from "@teacher-os/api/contracts";

/** Một câu hỏi trong part, mang sẵn index `q` (0-based, key của answers
 * map + PATCH body) và số hiển thị `number` (q + qStart). */
export interface QuizPartQuestion extends StudentQuizQuestion {
	q: number;
	number: number;
}

/**
 * Part hiển thị trên take screen = một CỤM câu liên tiếp cùng dạng bài
 * (`question.type ?? promptType` — fallback kép theo contract). Đề 1 type
 * gom 1 cụm duy nhất (hiển thị gần như cũ, thêm 1 header); đề trộn dạng
 * (như đề thi thật) mỗi cụm có header instruction riêng.
 */
export interface QuizPart {
	id: string;
	/** `Questions X–Y` (1 câu: `Questions X`). */
	label: string;
	qStart: number;
	/** Dạng bài hiệu dụng của cụm — key vào `QUIZ_TYPE_DISPLAY`. */
	typeId: string;
	questions: QuizPartQuestion[];
}

/** Chia questions thành các cụm liên tiếp cùng type. Đánh số từ 1 theo từng
 * assignment (Selfomy parity: quiz đơn đề đánh số từ câu 1; server chấm theo
 * index `q` — clustering không đổi q/number). */
export function buildQuizParts(
	questions: readonly StudentQuizQuestion[],
	promptType: string,
): QuizPart[] {
	const parts: QuizPart[] = [];
	let current: QuizPart | null = null;
	for (const [q, question] of questions.entries()) {
		const typeId = question.type ?? promptType;
		if (!current || current.typeId !== typeId) {
			current = {
				id: `part-${parts.length + 1}`,
				label: "",
				qStart: q + 1,
				typeId,
				questions: [],
			};
			parts.push(current);
		}
		current.questions.push({ q, number: q + 1, ...question });
	}
	for (const part of parts) {
		const first = part.qStart;
		const last = part.qStart + part.questions.length - 1;
		part.label =
			first === last ? `Questions ${first}` : `Questions ${first}–${last}`;
	}
	return parts;
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
