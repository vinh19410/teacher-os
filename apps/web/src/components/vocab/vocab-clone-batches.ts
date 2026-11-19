export const MAX_VOCAB_CLONE_DECKS_PER_BATCH = 50;
export const MAX_VOCAB_CLONE_STATEMENTS_PER_BATCH = 500;

export interface VocabCloneCandidate {
	id: string;
	wordCount: number;
}

export interface VocabCloneBatch {
	deckIds: string[];
	totalWords: number;
}

export interface VocabCloneBatchPlan {
	batches: VocabCloneBatch[];
	oversizedDeckIds: string[];
}

export function isVocabDeckOversized(
	wordCount: number,
	maxStatements = MAX_VOCAB_CLONE_STATEMENTS_PER_BATCH,
): boolean {
	return 1 + Math.max(0, wordCount) > maxStatements;
}

export function splitVocabCloneBatches(
	items: ReadonlyArray<VocabCloneCandidate>,
	maxDecks = MAX_VOCAB_CLONE_DECKS_PER_BATCH,
	maxStatements = MAX_VOCAB_CLONE_STATEMENTS_PER_BATCH,
): VocabCloneBatchPlan {
	const batches: VocabCloneBatch[] = [];
	const oversizedDeckIds: string[] = [];
	let current: VocabCloneBatch | null = null;

	for (const item of items) {
		const wordCount = Math.max(0, item.wordCount);
		if (isVocabDeckOversized(wordCount, maxStatements)) {
			oversizedDeckIds.push(item.id);
			continue;
		}

		if (
			current !== null &&
			current.deckIds.length + 1 <= maxDecks &&
			current.deckIds.length + 1 + (current.totalWords + wordCount) <=
				maxStatements
		) {
			current.deckIds.push(item.id);
			current.totalWords += wordCount;
		} else {
			current = {
				deckIds: [item.id],
				totalWords: wordCount,
			};
			batches.push(current);
		}
	}

	return { batches, oversizedDeckIds };
}
