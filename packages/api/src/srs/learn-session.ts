import type { VocabPoolItem, VocabSessionCard } from "../contracts";
import {
	type AnswerResult,
	buildPrompt,
	eligibleKinds,
	type GameKind,
	type QuizPrompt,
	toQuizCandidate,
} from "./quiz-generator";
import { matchTyping } from "./quiz-rules";
import type { QuizResponse } from "./review-session";
import { cryptoRandom, type RandomSource } from "./rng";
import { learned, roundHalfAwayFromZero, type SrsCard } from "./scheduler";

export type LearnStepKind =
	| "intro"
	| "listeningChoice"
	| "meaningChoice"
	| "typing"
	| "wordChoice";

export interface LearnStep {
	cardId: string;
	kind: LearnStepKind;
}

export interface LearnedWordSummary {
	cardId: string;
	word: string;
	translation: string;
	grade: "good" | "again";
}

export interface LearnedCommitEvent {
	card: VocabSessionCard;
	applied: SrsCard;
	grade: "good" | "again";
	gradeGood: boolean;
	durationMs: number;
	intervalBefore: number;
	nowMs: number;
}

export interface LearnSummary {
	learnedCount: number;
	goodCount: number;
	recallRate: number | null;
	learnedWords: LearnedWordSummary[];
}

export interface LearnSessionOptions {
	cards: readonly VocabSessionCard[];
	pool: readonly VocabPoolItem[];
	deckId: string;
	lang: string;
	nowMs?: number;
	rng?: RandomSource;
	onCommit?: (event: LearnedCommitEvent) => void;
	/** Optional explicit step plan override (used by conformance vector tests). */
	plan?: ReadonlyArray<{
		card: VocabSessionCard;
		steps: readonly LearnStepKind[];
	}>;
}

/**
 * Deterministic per-word Learn step list from eligible minigame kinds at level 1
 * per docs/srs-spec.md §3b rule 3.
 */
export function learnSteps(eligible: readonly string[]): LearnStepKind[] {
	const steps: LearnStepKind[] = ["intro"];
	if (eligible.includes("listeningChoice")) {
		steps.push("listeningChoice");
	} else if (eligible.includes("meaningChoice")) {
		steps.push("meaningChoice");
	}
	if (eligible.includes("typing")) {
		steps.push("typing");
	} else if (eligible.includes("wordChoice")) {
		steps.push("wordChoice");
	}
	return steps;
}

/**
 * Learn session state machine per docs/srs-spec.md §3b.
 * Note: wrong-streak overlay, 2-forgot cap, and offset 4-5 requeue do NOT apply in Learn (§3b.10).
 */
export class LearnSession {
	queue: LearnStep[];
	readonly total: number;
	done = 0;
	feedback: AnswerResult | null = null;
	isRevealed = false;
	introRevealedOnce = false;
	prompt: QuizPrompt | null = null;
	finished: boolean;
	turn = 0;
	learnedCount = 0;
	goodCount = 0;
	learnedWords: LearnedWordSummary[] = [];
	readonly startedAtMs: number;
	onCommit?: (event: LearnedCommitEvent) => void;

	private readonly rng: RandomSource;
	private readonly cardsById = new Map<string, VocabSessionCard>();
	private readonly pool: readonly VocabPoolItem[];
	private readonly deckId: string;
	private readonly lang: string;
	private readonly firstTryByStep = new Map<string, boolean>();
	private readonly firstTryCorrectByCard = new Map<string, boolean>();
	private readonly durationMsByCard = new Map<string, number>();
	private readonly removedCardIds = new Set<string>();
	private stepShownAtMs: number;

	/**
	 * §3b rule 2: selects all `state === "new"` cards sorted by `dueAt` ascending, then `id` ascending (uncapped).
	 */
	static selectNewCards(
		cards: readonly VocabSessionCard[],
	): VocabSessionCard[] {
		return cards
			.filter((c) => c.state === "new")
			.map((c) => ({ ...c }))
			.sort((a, b) =>
				a.dueAt !== b.dueAt ? a.dueAt - b.dueAt : a.id.localeCompare(b.id),
			);
	}

	constructor(options: LearnSessionOptions) {
		const nowMs = options.nowMs ?? Date.now();
		this.rng = options.rng ?? cryptoRandom;
		this.pool = options.pool;
		this.deckId = options.deckId;
		this.lang = options.lang;
		this.onCommit = options.onCommit;
		this.startedAtMs = nowMs;
		this.stepShownAtMs = nowMs;

		const resolvedPlan =
			options.plan ??
			LearnSession.selectNewCards(options.cards).map((card) => {
				const candidate = toQuizCandidate(
					{ ...card, level: 1 },
					this.deckId,
					this.lang,
				);
				const eligible = eligibleKinds(candidate, this.pool);
				return { card, steps: learnSteps(eligible) };
			});

		const builtQueue: LearnStep[] = [];
		for (const entry of resolvedPlan) {
			const cloned = { ...entry.card };
			this.cardsById.set(cloned.id, cloned);
			this.firstTryCorrectByCard.set(cloned.id, true);
			for (const kind of entry.steps) {
				builtQueue.push({ cardId: cloned.id, kind });
			}
		}

		this.queue = builtQueue;
		this.total = builtQueue.length;
		this.finished = builtQueue.length === 0;
		this.preparePrompt();
	}

	get currentStep(): LearnStep | null {
		return this.queue.find((s) => !this.removedCardIds.has(s.cardId)) ?? null;
	}

	get currentCard(): VocabSessionCard | null {
		const step = this.currentStep;
		if (!step) return null;
		return this.cardsById.get(step.cardId) ?? null;
	}

	get remaining(): number {
		return this.queue.filter((s) => !this.removedCardIds.has(s.cardId)).length;
	}

	get progress(): number {
		return this.total > 0 ? this.done / this.total : 0;
	}

	get recallRate(): number | null {
		if (this.learnedCount === 0) return null;
		return roundHalfAwayFromZero((this.goodCount / this.learnedCount) * 100);
	}

	/**
	 * §3b rule 5: flips the flashcard on `intro` and latches `introRevealedOnce = true`.
	 */
	reveal(): void {
		if (this.finished || this.feedback !== null) return;
		if (this.queue[0]?.kind !== "intro") return;
		this.isRevealed = !this.isRevealed;
		this.introRevealedOnce = true;
	}

	/**
	 * §3b rule 5: advances past `intro` once the card has been flipped at least once.
	 */
	continueIntro(nowMs = Date.now()): void {
		if (this.finished || this.feedback !== null || !this.introRevealedOnce) {
			return;
		}
		const step = this.queue[0];
		if (step?.kind !== "intro") return;

		const cardId = step.cardId;
		this.durationMsByCard.set(
			cardId,
			(this.durationMsByCard.get(cardId) ?? 0) +
				Math.max(0, nowMs - this.stepShownAtMs),
		);
		this.queue.shift();
		if (!this.removedCardIds.has(cardId) && this.cardsById.has(cardId)) {
			this.done += 1;
			this.completeIfLast(cardId, nowMs);
		}
		this.queue = this.queue.filter((s) => !this.removedCardIds.has(s.cardId));
		this.feedback = null;
		this.isRevealed = false;
		this.introRevealedOnce = false;
		this.turn += 1;
		this.stepShownAtMs = nowMs;
		this.finished = this.queue.length === 0;
		this.preparePrompt();
	}

	/**
	 * §3b rule 6: scores a response on a scored step (`listeningChoice`, `meaningChoice`, `typing`, `wordChoice`).
	 */
	respond(response: QuizResponse, nowMs = Date.now()): void {
		if (this.finished || this.feedback !== null) return;
		const step = this.queue[0];
		if (!step || step.kind === "intro") return;
		const card = this.cardsById.get(step.cardId);
		if (!card || this.removedCardIds.has(card.id)) return;

		let result: AnswerResult;
		switch (response.type) {
			case "remembered":
				result = "correct";
				break;
			case "forgot":
				result = "forgot";
				break;
			case "option":
				result = response.text === this.prompt?.answer ? "correct" : "wrong";
				break;
			case "typed":
				result = matchTyping(card.word, response.text) ? "correct" : "wrong";
				break;
		}

		const stepKey = `${step.cardId}:${step.kind}`;
		if (!this.firstTryByStep.has(stepKey)) {
			const isCorrect = result === "correct";
			this.firstTryByStep.set(stepKey, isCorrect);
			if (!isCorrect) {
				this.firstTryCorrectByCard.set(step.cardId, false);
			}
			this.durationMsByCard.set(
				step.cardId,
				(this.durationMsByCard.get(step.cardId) ?? 0) +
					Math.max(0, nowMs - this.stepShownAtMs),
			);
		}

		this.feedback = result;
	}

	/**
	 * §3b rule 6: moves past feedback on a scored step.
	 * Correct removes the step and increments `done`; wrong or forgot appends the step to the end of the queue.
	 */
	continueAfterFeedback(nowMs = Date.now()): void {
		if (this.feedback === null || this.queue.length === 0) return;
		const result = this.feedback;
		const step = this.queue.shift()!;
		if (
			!this.removedCardIds.has(step.cardId) &&
			this.cardsById.has(step.cardId)
		) {
			if (result === "correct") {
				this.done += 1;
				this.completeIfLast(step.cardId, nowMs);
			} else {
				this.queue.push(step);
			}
		}
		this.queue = this.queue.filter((s) => !this.removedCardIds.has(s.cardId));
		this.feedback = null;
		this.isRevealed = false;
		this.introRevealedOnce = false;
		this.turn += 1;
		this.stepShownAtMs = nowMs;
		this.finished = this.queue.length === 0;
		this.preparePrompt();
	}

	continue_(nowMs = Date.now()): void {
		if (this.queue[0]?.kind === "intro") {
			this.continueIntro(nowMs);
		} else {
			this.continueAfterFeedback(nowMs);
		}
	}

	/**
	 * §3b rule 9: removes all remaining steps of a card deleted mid-session without committing it.
	 */
	removeCard(cardId: string, nowMs = Date.now()): boolean {
		this.removedCardIds.add(cardId);
		if (this.finished) return false;
		const frontDeleted = this.queue[0]?.cardId === cardId;
		this.queue = this.queue.filter((s) => !this.removedCardIds.has(s.cardId));
		if (frontDeleted) {
			this.feedback = null;
			this.isRevealed = false;
			this.introRevealedOnce = false;
			this.turn += 1;
			this.stepShownAtMs = nowMs;
			this.finished = this.queue.length === 0;
			this.preparePrompt();
			return true;
		}
		if (this.queue.length === 0) {
			this.feedback = null;
			this.isRevealed = false;
			this.introRevealedOnce = false;
			this.finished = true;
			this.prompt = null;
		}
		return false;
	}

	summary(): LearnSummary {
		return {
			learnedCount: this.learnedCount,
			goodCount: this.goodCount,
			recallRate: this.recallRate,
			learnedWords: this.learnedWords.slice(),
		};
	}

	private completeIfLast(cardId: string, nowMs: number): void {
		const card = this.cardsById.get(cardId);
		if (!card || this.removedCardIds.has(cardId)) return;
		if (this.queue.some((s) => s.cardId === cardId)) return;

		const intervalBefore = card.intervalDays;
		const applied = learned(card, nowMs);
		card.level = applied.level;
		card.isWarning = applied.isWarning;
		card.state = applied.state;
		card.intervalDays = applied.intervalDays;
		card.dueAt = applied.dueAt;
		card.lapses = applied.lapses;

		const gradeGood = this.firstTryCorrectByCard.get(cardId) ?? true;
		const grade: "good" | "again" = gradeGood ? "good" : "again";
		this.learnedCount += 1;
		if (gradeGood) {
			this.goodCount += 1;
		}
		this.learnedWords.push({
			cardId: card.id,
			word: card.word,
			translation: card.translation,
			grade,
		});
		this.onCommit?.({
			card: { ...card },
			applied,
			grade,
			gradeGood,
			durationMs: this.durationMsByCard.get(cardId) ?? 0,
			intervalBefore,
			nowMs,
		});
	}

	private preparePrompt(): void {
		this.queue = this.queue.filter((s) => !this.removedCardIds.has(s.cardId));
		const step = this.queue[0];
		if (!step) {
			this.finished = true;
			this.prompt = null;
			return;
		}
		if (step.kind === "intro") {
			this.prompt = null;
			return;
		}
		const card = this.cardsById.get(step.cardId);
		if (!card) {
			this.finished = true;
			this.prompt = null;
			return;
		}
		const candidate = toQuizCandidate(
			{ ...card, level: 1 },
			this.deckId,
			this.lang,
		);
		this.prompt = buildPrompt(
			candidate,
			step.kind as GameKind,
			this.pool,
			this.rng,
		);
	}
}
