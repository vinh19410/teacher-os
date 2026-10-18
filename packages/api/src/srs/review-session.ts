import type { VocabPoolItem, VocabSessionCard } from "../contracts";
import {
	type AnswerResult,
	chooseAndBuildPrompt,
	type GameKind,
	type QuizPrompt,
	toQuizCandidate,
} from "./quiz-generator";
import { matchTyping } from "./quiz-rules";
import { cryptoRandom, type RandomSource, shuffleInPlace } from "./rng";
import { applyAnswer, roundHalfAwayFromZero, type SrsCard } from "./scheduler";

export type QuizResponse =
	| { type: "remembered" }
	| { type: "forgot" }
	| { type: "option"; text: string }
	| { type: "typed"; text: string };

export interface FirstResultEvent {
	card: VocabSessionCard;
	result: AnswerResult;
	kind: GameKind;
	levelBefore: number;
	applied: SrsCard;
	durationMs: number;
	intervalBefore: number;
}

export interface ReviewTally {
	correct: number;
	wrong: number;
	forgot: number;
}

export interface ReviewSummary {
	reviewed: number;
	firstTryCorrect: number;
	recallRate: number | null;
	levelUps: number;
	levelDowns: number;
	tally: ReviewTally;
}

export interface ReviewSessionOptions {
	cards: readonly VocabSessionCard[];
	pool: readonly VocabPoolItem[];
	deckId: string;
	lang: string;
	nowMs?: number;
	cap?: number;
	rng?: RandomSource;
	onFirstResult?: (event: FirstResultEvent) => void;
}

const ENCOURAGEMENT_STREAK = 5;

/**
 * Review session state machine per docs/srs-spec.md §3.
 */
export class ReviewSession {
	queue: VocabSessionCard[];
	readonly total: number;
	done = 0;
	isRevealed = false;
	feedback: AnswerResult | null = null;
	turn = 0;
	tally: ReviewTally = { correct: 0, wrong: 0, forgot: 0 };
	levelUps = 0;
	levelDowns = 0;
	showEncouragement = false;
	prompt: QuizPrompt | null = null;
	finished: boolean;
	readonly startedAtMs: number;
	onFirstResult?: (event: FirstResultEvent) => void;

	private readonly rng: RandomSource;
	private readonly pool: readonly VocabPoolItem[];
	private readonly deckId: string;
	private readonly lang: string;
	private readonly firstResults = new Map<string, AnswerResult>();
	private readonly forgotCounts = new Map<string, number>();
	private readonly removedCardIds = new Set<string>();
	private readonly lastKindByCard = new Map<string, GameKind>();
	private previousKind: GameKind | null = null;
	private wrongStreak = 0;
	private promptShownAtMs: number;

	/**
	 * Selects cards for a Review session per docs/srs-spec.md §3 rule 1:
	 * - Filters to `state === "review"` (red-team F5: never flood with unstudied `new` cards).
	 * - Sorts by `dueAt` ascending, ties by `id` ascending.
	 * - If `allowAllWhenNoneDue` is true (per-deck course lesson review when all cards are studied
	 *   and none are currently due), falls back to all `review` cards of the deck.
	 * - Applies optional `cap`.
	 */
	static selectReviewCards(
		cards: readonly VocabSessionCard[],
		nowMs: number,
		options?: { cap?: number; allowAllWhenNoneDue?: boolean },
	): VocabSessionCard[] {
		const reviewCards = cards
			.filter((c) => c.state === "review")
			.map((c) => ({ ...c }));
		const sortByDue = (a: VocabSessionCard, b: VocabSessionCard) =>
			a.dueAt !== b.dueAt ? a.dueAt - b.dueAt : a.id.localeCompare(b.id);

		const due = reviewCards.filter((c) => c.dueAt <= nowMs).sort(sortByDue);
		const base =
			due.length > 0
				? due
				: options?.allowAllWhenNoneDue
					? reviewCards.sort(sortByDue)
					: [];

		if (options?.cap !== undefined) {
			return base.slice(0, Math.max(0, options.cap));
		}
		return base;
	}

	constructor(options: ReviewSessionOptions) {
		const nowMs = options.nowMs ?? Date.now();
		this.rng = options.rng ?? cryptoRandom;
		this.pool = options.pool;
		this.deckId = options.deckId;
		this.lang = options.lang;
		this.onFirstResult = options.onFirstResult;
		this.startedAtMs = nowMs;
		this.promptShownAtMs = nowMs;

		const cloned = options.cards.map((c) => ({ ...c }));
		const capped =
			options.cap !== undefined
				? cloned.slice(0, Math.max(0, options.cap))
				: cloned;
		shuffleInPlace(capped, this.rng);
		this.queue = capped;
		this.total = capped.length;
		this.finished = capped.length === 0;
		this.preparePrompt();
	}

	get currentCard(): VocabSessionCard | null {
		return this.queue.find((c) => !this.removedCardIds.has(c.id)) ?? null;
	}

	get remaining(): number {
		return this.queue.filter((c) => !this.removedCardIds.has(c.id)).length;
	}

	get progress(): number {
		return this.total > 0 ? this.done / this.total : 0;
	}

	get reviewedCount(): number {
		return this.firstResults.size;
	}

	get recallRate(): number | null {
		const total = this.tally.correct + this.tally.wrong + this.tally.forgot;
		if (total === 0) return null;
		return roundHalfAwayFromZero((this.tally.correct / total) * 100);
	}

	/**
	 * Flips the self-check card. Ignored for other minigames or while feedback/overlay is shown.
	 */
	reveal(): void {
		if (
			this.finished ||
			this.feedback !== null ||
			this.showEncouragement ||
			this.prompt?.kind !== "selfCheck"
		) {
			return;
		}
		this.isRevealed = true;
	}

	/**
	 * Records the learner's response to the front card per docs/srs-spec.md §3 rules 2–4.
	 */
	respond(response: QuizResponse, nowMs = Date.now()): void {
		if (this.finished || this.feedback !== null || this.showEncouragement) {
			return;
		}
		const card = this.queue[0];
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

		if (!this.firstResults.has(card.id)) {
			this.firstResults.set(card.id, result);
			const levelBefore = card.level;
			const intervalBefore = card.intervalDays;
			const applied = applyAnswer(card, result === "correct", nowMs);
			card.level = applied.level;
			card.isWarning = applied.isWarning;
			card.state = applied.state;
			card.intervalDays = applied.intervalDays;
			card.dueAt = applied.dueAt;
			card.lapses = applied.lapses;

			if (result === "correct") this.tally.correct += 1;
			else if (result === "wrong") this.tally.wrong += 1;
			else this.tally.forgot += 1;

			if (applied.level > levelBefore) this.levelUps += 1;
			if (applied.level < levelBefore) this.levelDowns += 1;

			const durationMs = Math.max(0, nowMs - this.promptShownAtMs);
			this.onFirstResult?.({
				card: { ...card },
				result,
				kind: this.prompt?.kind ?? "selfCheck",
				levelBefore,
				applied,
				durationMs,
				intervalBefore,
			});
		}

		this.feedback = result;
		if (result === "correct") {
			this.wrongStreak = 0;
		} else {
			this.wrongStreak += 1;
			if (this.wrongStreak >= ENCOURAGEMENT_STREAK) {
				this.wrongStreak = 0;
				this.showEncouragement = true;
			}
		}
	}

	/**
	 * Advances past feedback per docs/srs-spec.md §3 rules 5–7.
	 * No-op unless `feedback !== null` and encouragement overlay is closed.
	 */
	continueAfterFeedback(nowMs = Date.now()): void {
		if (
			this.feedback === null ||
			this.showEncouragement ||
			this.queue.length === 0
		) {
			return;
		}
		const result = this.feedback;
		const card = this.queue.shift()!;
		if (!this.removedCardIds.has(card.id)) {
			if (result === "correct") {
				this.done += 1;
			} else if (result === "forgot") {
				const count = (this.forgotCounts.get(card.id) ?? 0) + 1;
				this.forgotCounts.set(card.id, count);
				if (count >= 2) {
					this.done += 1;
				} else {
					this.requeue(card);
				}
			} else {
				this.requeue(card);
			}
		}

		this.queue = this.queue.filter((c) => !this.removedCardIds.has(c.id));
		this.feedback = null;
		this.isRevealed = false;
		this.turn += 1;
		this.finished = this.queue.length === 0;
		this.promptShownAtMs = nowMs;
		this.preparePrompt();
	}

	continue_(nowMs = Date.now()): void {
		this.continueAfterFeedback(nowMs);
	}

	/**
	 * Skips the front card without recording a result or calling `onFirstResult`
	 * (used when remote/CDN audio fails to load on `listeningChoice`, #361).
	 */
	skipCurrentPrompt(nowMs = Date.now()): void {
		if (
			this.finished ||
			this.feedback !== null ||
			this.showEncouragement ||
			this.queue.length === 0
		) {
			return;
		}
		const card = this.queue.shift();
		if (card && !this.removedCardIds.has(card.id)) {
			this.done += 1;
		}
		this.queue = this.queue.filter((c) => !this.removedCardIds.has(c.id));
		this.feedback = null;
		this.isRevealed = false;
		this.turn += 1;
		this.finished = this.queue.length === 0;
		this.promptShownAtMs = nowMs;
		this.preparePrompt();
	}
	/**
	 * Closes the encouragement overlay per docs/srs-spec.md §3 rule 4.
	 * If the current prompt is `selfCheck`, also advances past feedback.
	 */
	dismissEncouragement(nowMs = Date.now()): void {
		if (!this.showEncouragement) return;
		this.showEncouragement = false;
		if (this.prompt?.kind === "selfCheck") {
			this.continueAfterFeedback(nowMs);
		}
	}

	/**
	 * Removes a deleted card mid-session (red-team F14 / §3 rule 1).
	 */
	removeCard(cardId: string, nowMs = Date.now()): boolean {
		this.removedCardIds.add(cardId);
		if (this.finished) return false;
		const frontDeleted = this.queue[0]?.id === cardId;
		this.queue = this.queue.filter((c) => !this.removedCardIds.has(c.id));
		if (frontDeleted) {
			this.feedback = null;
			this.isRevealed = false;
			this.showEncouragement = false;
			this.turn += 1;
			this.finished = this.queue.length === 0;
			this.promptShownAtMs = nowMs;
			this.preparePrompt();
			return true;
		}
		if (this.queue.length === 0) {
			this.feedback = null;
			this.isRevealed = false;
			this.showEncouragement = false;
			this.finished = true;
			this.prompt = null;
		}
		return false;
	}

	summary(): ReviewSummary {
		return {
			reviewed: this.reviewedCount,
			firstTryCorrect: this.tally.correct,
			recallRate: this.recallRate,
			levelUps: this.levelUps,
			levelDowns: this.levelDowns,
			tally: { ...this.tally },
		};
	}

	private requeue(card: VocabSessionCard): void {
		const position = Math.min(4 + this.rng.nextInt(2), this.queue.length);
		this.queue.splice(position, 0, card);
	}

	private preparePrompt(): void {
		this.queue = this.queue.filter((c) => !this.removedCardIds.has(c.id));
		const card = this.queue[0];
		if (!card) {
			this.finished = true;
			this.prompt = null;
			return;
		}
		const candidate = toQuizCandidate(card, this.deckId, this.lang);
		const next = chooseAndBuildPrompt(
			candidate,
			this.pool,
			this.lastKindByCard.get(card.id) ?? null,
			this.previousKind,
			this.rng,
		);
		this.lastKindByCard.set(card.id, next.kind);
		this.previousKind = next.kind;
		this.prompt = next;
	}
}
