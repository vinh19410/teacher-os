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

export interface GradeQuizOptions {
	/** Fallback prompt-level type when a question leaves `type` empty/null. */
	promptType?: string;
}

export interface AnswerSetMember {
	index: number;
	question: AssignmentQuestion;
}

export interface ResolvedAnswerSetGroups {
	positional: AnswerSetMember[];
	/** Every unordered group contains at least 2 members. */
	unorderedGroups: AnswerSetMember[][];
}

/**
 * Maximum length of `answerSet` allowed by `assignmentQuestionSchema` and
 * `studentQuizQuestionSchema` (`contracts.ts`).
 */
export const ANSWER_SET_MAX_LENGTH = 20;

/**
 * Separator pinned by the authoring UI (`placeholder="Nhận thêm: alt1 / alt2"`)
 * — exactly space-slash-space. A slash without surrounding spaces is part of
 * the value, never a split point.
 */
export const ALT_SEPARATOR = " / ";

const IMPLICIT_SLOT_SUFFIX_RE =
	/\s*\((?:lựa chọn|choice)\s*(\d+)\s*\/\s*(\d+)\)\s*$/i;

/** Normalize = trim + collapse whitespace + lowercase. */
function normalize(value: string): string {
	return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function effectiveQuestionType(
	question: Pick<AssignmentQuestion, "type">,
	options?: GradeQuizOptions,
): string {
	return question.type?.trim() || options?.promptType?.trim() || "";
}

function hasValidImplicitMcqManyOpts(
	opts: readonly string[] | null | undefined,
): opts is readonly string[] {
	return (
		Array.isArray(opts) &&
		opts.filter((opt) => opt.trim().length > 0).length >= 2
	);
}

function areMcqManyOptionsEqual(
	a: readonly string[],
	b: readonly string[],
): boolean {
	return (
		a.length === b.length &&
		a.every((item, index) => item.trim() === (b[index] ?? "").trim())
	);
}

function parseImplicitSlotStem(stem: string): {
	base: string;
	slot: number | null;
	total: number | null;
} {
	const trimmed = stem.trim();
	const match = IMPLICIT_SLOT_SUFFIX_RE.exec(trimmed);
	if (!match) {
		return { base: trimmed, slot: null, total: null };
	}
	const slot = Number(match[1]);
	const total = Number(match[2]);
	if (
		!Number.isInteger(slot) ||
		!Number.isInteger(total) ||
		slot < 1 ||
		total < 2 ||
		slot > total
	) {
		return { base: trimmed, slot: null, total: null };
	}
	return {
		base: trimmed.slice(0, match.index).trim(),
		slot,
		total,
	};
}

/**
 * Single source of truth shared by `gradeQuiz` and `QuizPaper` for implicit
 * clustering of consecutive `mcq_many` questions that lack an explicit
 * `answerSet`. Requires at least 2 non-empty options on both questions,
 * element-wise trimmed option equality, and matching stem (supporting trailing
 * `(lựa chọn i/K)` / `(choice i/K)` slot suffixes with strictly increasing slot
 * numbers so adjacent clusters never merge).
 */
export function canClusterImplicitMcqMany(
	prev: { stem: string; opts?: readonly string[] | null },
	curr: { stem: string; opts?: readonly string[] | null },
): boolean {
	if (
		!hasValidImplicitMcqManyOpts(prev.opts) ||
		!hasValidImplicitMcqManyOpts(curr.opts)
	) {
		return false;
	}
	if (!areMcqManyOptionsEqual(prev.opts, curr.opts)) {
		return false;
	}
	const prevStem = parseImplicitSlotStem(prev.stem);
	const currStem = parseImplicitSlotStem(curr.stem);
	if (prevStem.slot === null && currStem.slot === null) {
		return prevStem.base === currStem.base;
	}
	if (prevStem.slot !== null && currStem.slot !== null) {
		return (
			prevStem.base === currStem.base &&
			prevStem.total === currStem.total &&
			currStem.slot > prevStem.slot
		);
	}
	return false;
}

/**
 * Sanitize `answerSet` keys across a question array so every emitted key
 * satisfies `1 <= length <= ANSWER_SET_MAX_LENGTH` without prefix collisions:
 * - whitespace-only keys are stripped;
 * - valid `1..20` keys are trimmed and preserved;
 * - overlong keys (`> 20` after trim) are deterministically remapped to short
 *   collision-free IDs (`s1`, `s2`, ...) avoiding any existing short keys.
 */
export function sanitizeAnswerSetKeys<T extends { answerSet?: string | null }>(
	questions: readonly T[],
): T[] {
	const usedKeys = new Set<string>();
	let needsRewrite = false;

	for (const question of questions) {
		if (typeof question.answerSet !== "string") continue;
		const trimmed = question.answerSet.trim();
		if (trimmed.length === 0) {
			needsRewrite = true;
			continue;
		}
		if (
			trimmed !== question.answerSet ||
			trimmed.length > ANSWER_SET_MAX_LENGTH
		) {
			needsRewrite = true;
		}
		if (trimmed.length <= ANSWER_SET_MAX_LENGTH) {
			usedKeys.add(trimmed);
		}
	}

	if (!needsRewrite) {
		return [...questions];
	}

	const remapped = new Map<string, string>();
	let seq = 0;
	const nextShortKey = (): string => {
		while (true) {
			seq += 1;
			const candidate = `s${seq}`;
			if (!usedKeys.has(candidate)) {
				usedKeys.add(candidate);
				return candidate;
			}
		}
	};

	return questions.map((question) => {
		if (typeof question.answerSet !== "string") return question;
		const trimmed = question.answerSet.trim();
		if (trimmed.length === 0) {
			const { answerSet: _drop, ...rest } = question;
			return rest as T;
		}
		if (trimmed.length <= ANSWER_SET_MAX_LENGTH) {
			return trimmed === question.answerSet
				? question
				: { ...question, answerSet: trimmed };
		}
		let shortKey = remapped.get(trimmed);
		if (!shortKey) {
			shortKey = nextShortKey();
			remapped.set(trimmed, shortKey);
		}
		return { ...question, answerSet: shortKey };
	});
}

/**
 * Partition questions into positional questions and unordered answer sets
 * (each with `>= 2` members). Explicit `answerSet` keys are grouped separately
 * from implicit consecutive `mcq_many` clusters so synthetic and authored keys
 * can never collide.
 */
export function resolveAnswerSetGroups(
	questions: readonly AssignmentQuestion[],
	options?: GradeQuizOptions,
): ResolvedAnswerSetGroups {
	const positional: AnswerSetMember[] = [];
	const explicitSets = new Map<string, AnswerSetMember[]>();
	const implicitGroups: AnswerSetMember[][] = [];
	let currentImplicit: AnswerSetMember[] = [];

	const flushImplicit = (): void => {
		if (currentImplicit.length >= 2) {
			implicitGroups.push(currentImplicit);
		} else if (currentImplicit.length === 1 && currentImplicit[0]) {
			positional.push(currentImplicit[0]);
		}
		currentImplicit = [];
	};

	for (const [index, question] of questions.entries()) {
		const member: AnswerSetMember = { index, question };
		const explicitKey = question.answerSet?.trim();
		if (explicitKey) {
			flushImplicit();
			const bucket = explicitSets.get(explicitKey);
			if (bucket) bucket.push(member);
			else explicitSets.set(explicitKey, [member]);
			continue;
		}

		if (
			effectiveQuestionType(question, options) === "mcq_many" &&
			hasValidImplicitMcqManyOpts(question.opts)
		) {
			const prev = currentImplicit[currentImplicit.length - 1];
			if (
				prev &&
				prev.index === index - 1 &&
				canClusterImplicitMcqMany(prev.question, question)
			) {
				currentImplicit.push(member);
			} else {
				flushImplicit();
				currentImplicit = [member];
			}
			continue;
		}

		flushImplicit();
		positional.push(member);
	}
	flushImplicit();

	const unorderedGroups: AnswerSetMember[][] = [];
	for (const bucket of explicitSets.values()) {
		if (bucket.length >= 2) {
			unorderedGroups.push(bucket);
		} else if (bucket[0]) {
			positional.push(bucket[0]);
		}
	}
	for (const group of implicitGroups) {
		unorderedGroups.push(group);
	}

	return { positional, unorderedGroups };
}

/**
 * Format summary display answer keys aligned 1-to-1 with `questions`.
 * Members of any unordered set (`length >= 2`) share the full deduplicated set
 * key (e.g. `"C, D, F"` sorted A–Z for single-letter choices, preserving
 * lowercase Roman numerals on `headings`, and preserving first-occurrence
 * order for free-text keys). Positional questions retain `question.answer`.
 */
export function resolveSummaryAnswerKeys(
	questions: readonly AssignmentQuestion[],
	options?: GradeQuizOptions,
): string[] {
	const result = questions.map((question) => question.answer);
	const { unorderedGroups } = resolveAnswerSetGroups(questions, options);

	for (const group of unorderedGroups) {
		const rawKeys = group
			.map((member) => member.question.answer.trim().replace(/\s+/g, " "))
			.filter((key) => key.length > 0);
		if (rawKeys.length === 0) continue;

		const isRomanHeadingsGroup = group.every(
			(member) =>
				effectiveQuestionType(member.question, options) === "headings",
		);
		const isSingleLetterSet =
			rawKeys.every((key) => /^[A-Z]$/.test(key)) ||
			(!isRomanHeadingsGroup && rawKeys.every((key) => /^[A-Z]$/i.test(key)));

		let formatted: string;
		if (isSingleLetterSet) {
			const unique = Array.from(
				new Set(rawKeys.map((key) => key.toUpperCase())),
			).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
			formatted = unique.join(", ");
		} else {
			const seen = new Set<string>();
			const unique: string[] = [];
			for (const key of rawKeys) {
				const norm = normalize(key);
				if (seen.has(norm)) continue;
				seen.add(norm);
				unique.push(key);
			}
			formatted = unique.join(", ");
		}

		for (const member of group) {
			result[member.index] = formatted;
		}
	}

	return result;
}

/**
 * Accepted answer candidates: the canonical `answer` plus every alt split on
 * the pinned " / " separator. Blank candidates are dropped so an empty alt can
 * never match a blank.
 */
function acceptedCandidates(key: string, alts: string): string[] {
	return [key, ...alts.split(ALT_SEPARATOR)]
		.map(normalize)
		.filter((candidate) => candidate.length > 0);
}

/**
 * Same match rule the grader applies (exact after normalize against `answer`
 * + alts) — exported so the review UI can highlight the correct choice row
 * with the grader's own semantics instead of reimplementing them.
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
 * Pure grader for a submitted quiz attempt. Reads ONLY the frozen
 * `questionsSnapshot` (full answer key) plus the stored `answers` map keyed
 * by 0-based question index — the live prompt is never consulted.
 *
 * Verdicts: `skipped` when the stored value is absent or blank, `correct`
 * when it equals any candidate exact-after-normalize, else `wrong`.
 *
 * Unordered sets (explicit `answerSet` or implicit consecutive `mcq_many`
 * clusters with identical normalized stem and `>= 2` non-empty options) are
 * graded via Kuhn's maximum bipartite matching in deterministic ascending index
 * order so re-grading on the review page matches the initial submit grade.
 */
export function gradeQuiz(
	questions: readonly AssignmentQuestion[],
	answers: Readonly<Record<string, string>>,
	options?: GradeQuizOptions,
): QuizGrade {
	const verdicts: QuizVerdict[] = new Array(questions.length).fill("wrong");
	const { positional, unorderedGroups } = resolveAnswerSetGroups(
		questions,
		options,
	);

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

	for (const members of unorderedGroups) {
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
 * Maximum bipartite matching (Kuhn) over one unordered answer set. Left side =
 * answered members (skipped excluded before matching), right side = all
 * members of the set (candidate keys, ascending). Edge (answer i, key k)
 * exists when i's normalized given value is an accepted candidate of k's
 * key. Both sides iterate in ascending index order for deterministic
 * verdict assignment.
 */
function gradeAnswerSet(
	members: readonly AnswerSetMember[],
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
			// enter `visited`, otherwise it blocks later augmenting paths.
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
