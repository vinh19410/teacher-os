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
function acceptedCandidates(key: string, alts: string): string[] {
	return [key, ...alts.split(ALT_SEPARATOR)]
		.map(normalize)
		.filter((candidate) => candidate.length > 0);
}

/**
 * Same match rule the grader applies (exact after normalize against `answer`
 * + alts) — exported so the review UI can highlight the correct choice row
 * with the grader's own semantics instead of reimplementing them (#351).
 */
export function isAcceptedAnswer(
	value: string,
	key: string,
	alts: string,
): boolean {
	const given = normalize(value);
	return given.length > 0 && acceptedCandidates(key, alts).includes(given);
}

/**
 * Pure grader for a submitted quiz attempt (#283). Reads ONLY the frozen
 * `questionsSnapshot` (full answer key) plus the stored `answers` map keyed
 * by 0-based question index — the live prompt is never consulted (RT#3).
 *
 * Verdicts: `skipped` when the stored value is absent or blank, `correct`
 * when it equals any candidate exact-after-normalize, else `wrong`.
 *
 * `answerSet` branch (#420, IELTS "Choose TWO"): questions sharing the same
 * non-empty `answerSet` key are graded as one UNORDERED set — a key's answer
 * accepted at one question is accepted at its sibling. The grader only sees
 * the flat question array (never groups), so the set semantics travel on the
 * per-question key. Matching is MAXIMUM bipartite matching (Kuhn's
 * algorithm; sets are ≤ 40 questions) instead of greedy-by-index because
 * `alts` can make candidate sets overlap: greedy mis-grades a valid
 * permutation when one question's candidates are a subset of another's.
 * Determinism (kongming #420): skipped answers leave the graph BEFORE
 * matching, both sides are traversed in ascending index order, so the same
 * input always yields the same per-question verdicts — a re-grade on the
 * review page must match the first grade. Each key answer is consumed at
 * most once. Counts are unchanged: correct/wrong/skipped tallies as before.
 */
export function gradeQuiz(
	questions: readonly AssignmentQuestion[],
	answers: Readonly<Record<string, string>>,
): QuizGrade {
	const verdicts: QuizVerdict[] = new Array(questions.length).fill("wrong");
	// Members carrying no answerSet — graded positionally.
	const positional: { index: number; question: AssignmentQuestion }[] = [];
	// answerSet key → members carrying that key, ascending by index.
	const sets = new Map<
		string,
		{ index: number; question: AssignmentQuestion }[]
	>();

	for (const [index, question] of questions.entries()) {
		const key = question.answerSet?.trim();
		if (!key) {
			positional.push({ index, question });
			continue;
		}
		const bucket = sets.get(key);
		if (bucket) bucket.push({ index, question });
		else sets.set(key, [{ index, question }]);
	}

	for (const { index, question } of positional) {
		const given = normalize(answers[String(index)] ?? "");
		if (given.length === 0) {
			verdicts[index] = "skipped";
			continue;
		}
		verdicts[index] = acceptedCandidates(
			question.answer,
			question.alts,
		).includes(given)
			? "correct"
			: "wrong";
	}

	for (const members of sets.values()) {
		gradeAnswerSet(members, answers, verdicts);
	}

	return {
		verdicts,
		correctCount: verdicts.filter((v) => v === "correct").length,
		wrongCount: verdicts.filter((v) => v === "wrong").length,
		skippedCount: verdicts.filter((v) => v === "skipped").length,
		totalCount: questions.length,
	};
}

/**
 * Maximum bipartite matching (Kuhn) over one answerSet group. Left side =
 * answered members (skipped excluded before matching), right side = all
 * members of the set (candidate keys, ascending). Edge (answer i, key k)
 * exists when i's normalized given value is an accepted candidate of k's
 * key. Both sides iterate in ascending index order for deterministic
 * verdict assignment.
 */
function gradeAnswerSet(
	members: readonly { index: number; question: AssignmentQuestion }[],
	answers: Readonly<Record<string, string>>,
	verdicts: QuizVerdict[],
): void {
	// keyIndex → member whose key is currently consumed by that answer.
	const matchFromKey = new Map<number, number>();

	const tryMatch = (answerSlot: number, visited: Set<number>): boolean => {
		const answer = members[answerSlot];
		if (!answer) return false;
		const given = normalize(answers[String(answer.index)] ?? "");
		for (const [keySlot, key] of members.entries()) {
			// Kuhn's algorithm only walks EDGES: a key with no edge must never
			// enter `visited`, otherwise it blocks later augmenting paths
			// (kongming #420 — marking before the edge check graded a valid
			// sibling answer wrong when an earlier recursion visited the key).
			const edge =
				given.length > 0 &&
				acceptedCandidates(key.question.answer, key.question.alts).includes(
					given,
				);
			if (visited.has(keySlot) || !edge) continue;
			visited.add(keySlot);
			const current = matchFromKey.get(keySlot);
			if (current === undefined || tryMatch(current, visited)) {
				matchFromKey.set(keySlot, answerSlot);
				return true;
			}
		}
		return false;
	};

	// Left side in ascending order; skipped answers never enter the graph.
	for (const [slot, member] of members.entries()) {
		const given = normalize(answers[String(member.index)] ?? "");
		if (given.length === 0) {
			verdicts[member.index] = "skipped";
			continue;
		}
		verdicts[member.index] = tryMatch(slot, new Set<number>())
			? "correct"
			: "wrong";
	}
}
