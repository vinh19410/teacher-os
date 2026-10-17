// @vitest-environment jsdom
import type { VocabSessionData } from "@teacher-os/api/contracts";
import { SeededRandom } from "@teacher-os/api/srs/rng";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as vocabRepo from "@/lib/repos/vocab";
import { VocabSessionView } from "./vocab-session-view";

vi.mock("@/lib/repos/vocab", () => ({
	postVocabAnswer: vi.fn(),
	postVocabLearnCommit: vi.fn(async (input) => ({
		card: {
			id: input.cardId,
			wordId: input.cardId,
			word: "x",
			translation: "x",
			ipa: null,
			audioKey: null,
			level: 1,
			isWarning: false,
			state: "review",
			intervalDays: 1,
			dueAt: 0,
			lapses: 0,
		},
	})),
	fetchVocabAudioObjectUrl: vi.fn(async () => "blob:http://localhost/audio-1"),
}));

const NOW = 1_700_000_000_000;

function makeThreeWordLearnData(): VocabSessionData {
	const words = ["resilient", "sustainable", "biodiversity"];
	const cards = words.map((word, idx) => ({
		id: `c-${idx + 1}`,
		wordId: `w-${idx + 1}`,
		word,
		translation: `nghĩa ${idx + 1}`,
		ipa: null,
		audioKey: null,
		level: 1,
		isWarning: false,
		state: "new" as const,
		intervalDays: 0,
		dueAt: NOW - 10 + idx,
		lapses: 0,
	}));
	const pool = cards.map((c) => ({
		wordId: c.wordId,
		word: c.word,
		translation: c.translation,
		lang: "en",
		deckId: "deck-1",
	}));
	return {
		deck: { id: "deck-1", title: "Env", lang: "en" },
		cards,
		pool,
	};
}

const WORD_BY_FIRST_LETTER: Record<string, string> = {
	r: "resilient",
	s: "sustainable",
	b: "biodiversity",
};

describe("VocabSessionView — e2e Learn loop reproduction (3 words, forgot-on-typing)", () => {
	afterEach(() => cleanup());

	it("drives the exact e2e loop: intro x3 with forgot on each typing, then correct answers", async () => {
		const data = makeThreeWordLearnData();
		render(
			<VocabSessionView
				sessionData={data}
				rng={new SeededRandom(3)}
				onExit={() => undefined}
			/>,
		);

		const typedWords: string[] = [];
		let safety = 0;
		while (
			!screen.queryByTestId("vocab-summary-learn") &&
			safety < 60
		) {
			safety += 1;
			const introFlip = screen.queryByTestId("vocab-intro-flip-btn");
			if (introFlip) {
				expect(
					(screen.getByTestId("vocab-intro-continue-btn") as HTMLButtonElement)
						.disabled,
				).toBe(true);
				act(() => introFlip.click());
				await waitFor(() =>
					expect(
						(screen.getByTestId("vocab-intro-continue-btn") as HTMLButtonElement)
							.disabled,
					).toBe(false),
				);
				act(() => screen.getByTestId("vocab-intro-continue-btn").click());
				continue;
			}
			const typingInput = screen.queryByTestId("vocab-typing-input");
			if (typingInput) {
				const hint = screen.getByTestId("vocab-typing-hint").textContent ?? "";
				const word = WORD_BY_FIRST_LETTER[hint.charAt(0)] ?? "resilient";
				typedWords.push(word);
				act(() => {
					fireEvent.change(typingInput, { target: { value: word } });
				});
				act(() => screen.getByTestId("vocab-typing-submit").click());
				await waitFor(() =>
					expect(screen.getByTestId("vocab-continue-btn")).toBeTruthy(),
				);
				await waitFor(() =>
					expect(
						(screen.getByTestId("vocab-continue-btn") as HTMLButtonElement)
							.disabled,
					).toBe(false),
				);
				act(() => screen.getByTestId("vocab-continue-btn").click());
				continue;
			}
			const optionCount = screen.getAllByTestId("vocab-option").length;
			if (optionCount > 0) {
				const option = screen.getAllByTestId(
					"vocab-option",
				)[0] as HTMLButtonElement;
				await waitFor(() => expect(option.disabled).toBe(false));
				act(() => option.click());
				await waitFor(() =>
					expect(screen.getByTestId("vocab-continue-btn")).toBeTruthy(),
				);
				await waitFor(() =>
					expect(
						(screen.getByTestId("vocab-continue-btn") as HTMLButtonElement)
							.disabled,
					).toBe(false),
				);
				act(() => screen.getByTestId("vocab-continue-btn").click());
				continue;
			}
			const forgot = screen.queryByTestId("vocab-forgot-btn");
			if (forgot) {
				act(() => forgot.click());
				await waitFor(() =>
					expect(screen.getByTestId("vocab-continue-btn")).toBeTruthy(),
				);
				await waitFor(() =>
					expect(
						(screen.getByTestId("vocab-continue-btn") as HTMLButtonElement)
							.disabled,
					).toBe(false),
				);
				act(() => screen.getByTestId("vocab-continue-btn").click());
				continue;
			}
			throw new Error(
				`STUCK: no actionable prompt at safety=${safety}; body=${document.body.innerHTML.slice(0, 600)}`,
			);
		}

		expect(screen.getByTestId("vocab-summary-learn")).toBeTruthy();
		expect(typedWords.length).toBeGreaterThan(0);
	}, 30_000);
});
