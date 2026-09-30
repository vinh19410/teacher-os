import type { StudentQuizQuestion } from "../contracts";

/** Một câu hỏi trong part, mang sẵn index `q` (0-based, key của answers
 * map + PATCH body) và số hiển thị `number` (q + qStart). */
export interface QuizPartQuestion extends StudentQuizQuestion {
	q: number;
	number: number;
}

/**
 * Part hiển thị trên take screen. Hôm nay N=1 (một assignment = một prompt,
 * RT#13: flat, không chế group boundary) — cấu trúc parts[] giữ sẵn shape
 * cho navigator/paper khi đề đa phần xuất hiện.
 */
export interface QuizPart {
	id: string;
	label: string;
	qStart: number;
	questions: QuizPartQuestion[];
}

/** Chia questions thành parts. Đánh số từ 1 theo từng assignment
 * (Selfomy parity: quiz đơn đề đánh số từ câu 1; server chấm theo index). */
export function buildQuizParts(
	questions: readonly StudentQuizQuestion[],
): QuizPart[] {
	return [
		{
			id: "part-1",
			label: "Phần 1",
			qStart: 1,
			questions: questions.map((question, q) => ({
				q,
				number: q + 1,
				...question,
			})),
		},
	];
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
