import type { AssignmentQuestion, QuizVerdict } from "../contracts";

export type { QuizVerdict };

export interface QuizGrade {
	/** Verdict per snapshot question, index-aligned (0-based). */
	verdicts: QuizVerdict[];
	correctCount: number;
	wrongCount: number;
	skippedCount: number;
	totalCount: number;
}

/**
 * Separator pinned by the authoring UI (`placeholder="Nhận thêm: alt1 / alt2"`)
 * — exactly space-slash-space. A slash without surrounding spaces is part of
 * the value, never a split point.
 */
const ALT_SEPARATOR = " / ";

/** Normalize = trim + collapse whitespace + lowercase (plan RT#15). */
function normalize(value: string): string {
	return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Accepted answer candidates: the canonical `answer` plus every alt split on
 * the pinned " / " separator. Authoring stores one canonical value per
 * question (checked: `answerKindByType` maps every type to a single-choice
 * kind — no multi-part answers exist), so there is no multiset compare.
 * Blank candidates are dropped so an empty alt can never match a blank.
 */
function candidatesFor(question: AssignmentQuestion): string[] {
	return [question.answer, ...question.alts.split(ALT_SEPARATOR)]
		.map(normalize)
		.filter((candidate) => candidate.length > 0);
}

/**
 * Pure grader for a submitted quiz attempt (#283). Reads ONLY the frozen
 * `questionsSnapshot` (full answer key) plus the stored `answers` map keyed
 * by 0-based question index — the live prompt is never consulted (RT#3).
 *
 * Verdicts: `skipped` when the stored value is absent or blank, `correct`
 * when it equals any candidate exact-after-normalize, else `wrong`.
 */
export function gradeQuiz(
	questions: readonly AssignmentQuestion[],
	answers: Readonly<Record<string, string>>,
): QuizGrade {
	const verdicts = questions.map((question, index): QuizVerdict => {
		const given = normalize(answers[String(index)] ?? "");
		if (given.length === 0) return "skipped";
		return candidatesFor(question).includes(given) ? "correct" : "wrong";
	});
	return {
		verdicts,
		correctCount: verdicts.filter((v) => v === "correct").length,
		wrongCount: verdicts.filter((v) => v === "wrong").length,
		skippedCount: verdicts.filter((v) => v === "skipped").length,
		totalCount: questions.length,
	};
}
