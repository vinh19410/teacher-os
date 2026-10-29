import type { VocabPoolItem, VocabSessionCard } from "../contracts";
import {
	CHOICE_OPTION_COUNT,
	normalizeAnswer,
	typingEligible,
	typingHint,
} from "./quiz-rules";
import { type RandomSource, shuffleInPlace } from "./rng";

export type GameKind =
	| "meaningChoice"
	| "wordChoice"
	| "listeningChoice"
	| "typing"
	| "selfCheck";

export type AnswerResult = "correct" | "wrong" | "forgot";

export interface QuizCandidate {
	id: string;
	wordId: string;
	deckId: string;
	lang: string;
	word: string;
	translation: string;
	wordKey: string;
	translationKey: string;
	ipa: string | null;
	audioKey: string | null;
	hasAudio?: boolean;
	level: number;
}

export interface QuizPrompt {
	cardId: string;
	wordId: string;
	kind: GameKind;
	/** Shuffled choices; empty for `typing` and `selfCheck`. */
	options: string[];
	/** Exact option/word text that scores as correct. */
	answer: string;
	/** Typing hint; empty for every other kind. */
	hint: string;
}

interface DistractorOption {
	text: string;
	key: string;
}

interface DistractorLists {
	sameDeck: DistractorOption[];
	otherDeck: DistractorOption[];
}

export function toQuizCandidate(
	card: VocabSessionCard,
	deckId: string,
	lang: string,
): QuizCandidate {
	return {
		id: card.id,
		wordId: card.wordId,
		deckId,
		lang,
		word: card.word,
		translation: card.translation,
		wordKey: normalizeAnswer(card.word),
		translationKey: normalizeAnswer(card.translation),
		ipa: card.ipa,
		audioKey: card.audioKey,
		hasAudio: card.hasAudio === true,
		level: card.level,
	};
}

function distractorLists(
	card: QuizCandidate,
	pool: readonly VocabPoolItem[],
	useTranslation: boolean,
): DistractorLists {
	const answerKey = useTranslation ? card.translationKey : card.wordKey;
	const sameDeck: DistractorOption[] = [];
	const otherDeck: DistractorOption[] = [];

	for (const other of pool) {
		if (other.wordId === card.wordId) continue;
		if (!useTranslation && other.lang !== card.lang) continue;
		const text = useTranslation ? other.translation : other.word;
		if (text.trim().length === 0) continue;
		const key = normalizeAnswer(text);
		if (key.length === 0 || key === answerKey) continue;
		const opt: DistractorOption = { text, key };
		if (other.deckId === card.deckId) {
			sameDeck.push(opt);
		} else {
			otherDeck.push(opt);
		}
	}

	return { sameDeck, otherDeck };
}

/**
 * Partial Fisher–Yates draw per docs/srs-spec.md §4:
 * stops as soon as `count` distinct normalized keys are collected.
 */
function drawDistractors(
	list: readonly DistractorOption[],
	count: number,
	seen: Set<string>,
	rng: RandomSource,
): string[] {
	const items = list.slice();
	const collected: string[] = [];
	let index = 0;
	while (collected.length < count && index < items.length) {
		const swapIndex = index + rng.nextInt(items.length - index);
		if (swapIndex !== index) {
			const tmp = items[index] as DistractorOption;
			items[index] = items[swapIndex] as DistractorOption;
			items[swapIndex] = tmp;
		}
		const item = items[index] as DistractorOption;
		if (!seen.has(item.key)) {
			seen.add(item.key);
			collected.push(item.text);
		}
		index += 1;
	}
	return collected;
}

function buildChoicePrompt(
	card: QuizCandidate,
	kind: GameKind,
	pool: readonly VocabPoolItem[],
	useTranslation: boolean,
	rng: RandomSource,
): QuizPrompt {
	const answer = useTranslation ? card.translation : card.word;
	const needed = CHOICE_OPTION_COUNT - 1;
	const source = distractorLists(card, pool, useTranslation);
	const seen = new Set<string>();
	const options = [answer];

	for (const list of [source.sameDeck, source.otherDeck]) {
		const remainingNeeded = needed - (options.length - 1);
		if (remainingNeeded <= 0) break;
		const drawn = drawDistractors(list, remainingNeeded, seen, rng);
		options.push(...drawn);
	}

	shuffleInPlace(options, rng);
	return {
		cardId: card.id,
		wordId: card.wordId,
		kind,
		options,
		answer,
		hint: "",
	};
}

/**
 * Eligible minigame kinds for `card` in fixed spec order (never includes `selfCheck`).
 * Per docs/srs-spec.md §4:
 * - meaningChoice: level <= 4, translation not blank, >= 1 translation distractor
 * - wordChoice: level <= 4, translation not blank, >= 1 same-lang word distractor
 * - listeningChoice: (audioKey != null or hasAudio), >= 1 same-lang word distractor
 * - typing: translation not blank and typingEligible(word)
 */
export function eligibleKinds(
	card: QuizCandidate,
	pool: readonly VocabPoolItem[],
): GameKind[] {
	const kinds: GameKind[] = [];
	const hasTranslation = card.translation.trim().length > 0;
	const meaningLists = distractorLists(card, pool, true);
	if (
		card.level <= 4 &&
		hasTranslation &&
		(meaningLists.sameDeck.length > 0 || meaningLists.otherDeck.length > 0)
	) {
		kinds.push("meaningChoice");
	}

	const wordLists = distractorLists(card, pool, false);
	const hasWordDistractor =
		wordLists.sameDeck.length > 0 || wordLists.otherDeck.length > 0;

	if (card.level <= 4 && hasTranslation && hasWordDistractor) {
		kinds.push("wordChoice");
	}
	if (
		((card.audioKey !== null && card.audioKey.trim().length > 0) ||
			card.hasAudio === true) &&
		hasWordDistractor
	) {
		kinds.push("listeningChoice");
	}
	if (hasTranslation && typingEligible(card.word)) {
		kinds.push("typing");
	}
	return kinds;
}

/**
 * Builds the prompt for `card` with a predetermined `kind` per docs/srs-spec.md §4.
 */
export function buildPrompt(
	card: QuizCandidate,
	kind: GameKind,
	pool: readonly VocabPoolItem[],
	rng: RandomSource,
): QuizPrompt {
	switch (kind) {
		case "meaningChoice":
			return buildChoicePrompt(card, kind, pool, true, rng);
		case "wordChoice":
		case "listeningChoice":
			return buildChoicePrompt(card, kind, pool, false, rng);
		case "typing":
			return {
				cardId: card.id,
				wordId: card.wordId,
				kind: "typing",
				options: [],
				answer: card.word,
				hint: typingHint(card.word, card.level),
			};
		case "selfCheck":
			return {
				cardId: card.id,
				wordId: card.wordId,
				kind: "selfCheck",
				options: [],
				answer: card.word,
				hint: "",
			};
	}
}

/**
 * Strict-priority kind choice + prompt build per docs/srs-spec.md §4:
 * (a) E minus {cardLastKind, previousKind}
 * (b) E minus {cardLastKind}
 * (c) E
 * else -> selfCheck.
 */
export function chooseAndBuildPrompt(
	card: QuizCandidate,
	pool: readonly VocabPoolItem[],
	cardLastKind: GameKind | null,
	previousKind: GameKind | null,
	rng: RandomSource,
): QuizPrompt {
	const eligible = eligibleKinds(card, pool);
	const tierA = eligible.filter(
		(k) => k !== cardLastKind && k !== previousKind,
	);
	const tierB = eligible.filter((k) => k !== cardLastKind);
	const candidates =
		tierA.length > 0 ? tierA : tierB.length > 0 ? tierB : eligible;

	if (candidates.length === 0) {
		return buildPrompt(card, "selfCheck", pool, rng);
	}
	const chosen = candidates[rng.nextInt(candidates.length)] ?? "selfCheck";
	return buildPrompt(card, chosen, pool, rng);
}
