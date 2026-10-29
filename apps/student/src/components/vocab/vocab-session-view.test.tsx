// @vitest-environment jsdom
import type { VocabSessionData } from "@teacher-os/api/contracts";
import { SeededRandom } from "@teacher-os/api/srs/rng";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/query-client";
import * as vocabRepo from "@/lib/repos/vocab";
import { VocabSessionView } from "./vocab-session-view";

vi.mock("@/lib/repos/vocab", () => ({
	postVocabAnswer: vi.fn(),
	postVocabLearnCommit: vi.fn(),
	fetchVocabAudioObjectUrl: vi.fn(async () => "blob:http://localhost/audio-1"),
}));

const NOW = 1_700_000_000_000;

function makeReviewSessionData(count = 6): VocabSessionData {
	const cards = Array.from({ length: count }, (_, idx) => ({
		id: `c-${idx + 1}`,
		wordId: `w-${idx + 1}`,
		word: idx === 0 ? "café" : `word${idx + 1}`,
		translation: idx === 0 ? "quán cà phê" : `nghĩa ${idx + 1}`,
		ipa: "/ka.fe/",
		audioKey: null,
		hasAudio: false,
		level: 1,
		isWarning: false,
		state: "review" as const,
		intervalDays: 1,
		dueAt: NOW - (count - idx) * 1000,
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
		deck: { id: "deck-1", title: "Food & Drinks", lang: "en" },
		cards,
		pool,
	};
}

function makeMixedSessionData(): VocabSessionData {
	const newCards = [1, 2, 3].map((idx) => ({
		id: `cn-${idx}`,
		wordId: `wn-${idx}`,
		word: `fresh${idx}`,
		translation: `nghĩa mới ${idx}`,
		ipa: "/fresh/",
		audioKey: null,
		hasAudio: false,
		level: 0,
		isWarning: false,
		state: "new" as const,
		intervalDays: 0,
		dueAt: NOW,
		lapses: 0,
	}));
	const reviewCards = [
		{
			id: "cr-1",
			wordId: "wr-1",
			word: "resilient",
			translation: "kiên cường",
			ipa: "/re.zi.li.ənt/",
			audioKey: null,
			hasAudio: false,
			level: 1,
			isWarning: false,
			state: "review" as const,
			intervalDays: 1,
			dueAt: NOW - 60_000,
			lapses: 0,
		},
	];
	const cards = [...newCards, ...reviewCards];
	const pool = cards.map((c) => ({
		wordId: c.wordId,
		word: c.word,
		translation: c.translation,
		lang: "en",
		deckId: "deck-mixed",
	}));
	return {
		deck: { id: "deck-mixed", title: "Mixed Deck", lang: "en" },
		cards,
		pool,
	};
}

function makeReviewOnlyNotDueSessionData(): VocabSessionData {
	const cards = [
		{
			id: "cr-10",
			wordId: "wr-10",
			word: "sustainable",
			translation: "bền vững",
			ipa: "/sə.teɪ.nə.bəl/",
			audioKey: null,
			hasAudio: false,
			level: 1,
			isWarning: false,
			state: "review" as const,
			intervalDays: 1,
			dueAt: Date.now() + 3_600_000,
			lapses: 0,
		},
	];
	const pool = cards.map((c) => ({
		wordId: c.wordId,
		word: c.word,
		translation: c.translation,
		lang: "en",
		deckId: "deck-notdue",
	}));
	return {
		deck: { id: "deck-notdue", title: "Not Due Deck", lang: "en" },
		cards,
		pool,
	};
}

describe("VocabSessionView (Phase 5 UI & red-team F9/F14 invariants)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it("preserves session queue across parent re-renders (red-team F14)", async () => {
		const data = makeReviewSessionData(4);
		vi.mocked(vocabRepo.postVocabAnswer).mockResolvedValue({
			card: data.cards[0]!,
		});

		function Wrapper() {
			const [parentCount, setParentCount] = useState(0);
			return (
				<div>
					<button
						type="button"
						data-testid="bump-parent"
						onClick={() => setParentCount((c) => c + 1)}
					>
						Bump {parentCount}
					</button>
					<VocabSessionView
						sessionData={data}
						rng={new SeededRandom(1)}
						onExit={() => undefined}
					/>
				</div>
			);
		}

		render(<Wrapper />);
		const initialQuestion = screen.getByTestId(
			"vocab-prompt-question",
		).textContent;

		fireEvent.click(screen.getByTestId("bump-parent"));
		fireEvent.click(screen.getByTestId("bump-parent"));

		expect(screen.getByTestId("vocab-prompt-question").textContent).toBe(
			initialQuestion,
		);
		expect(screen.getByTestId("vocab-session-progress").textContent).toContain(
			"0/4",
		);
	});

	it("blocks Continue when POST answer fails, shows retry banner, and retries with identical clientLogId (red-team F9)", async () => {
		const data = makeReviewSessionData(3);
		const capturedLogIds: string[] = [];

		vi.mocked(vocabRepo.postVocabAnswer)
			.mockImplementationOnce(async (input) => {
				capturedLogIds.push(input.clientLogId);
				throw new Error("network down");
			})
			.mockImplementationOnce(async (input) => {
				capturedLogIds.push(input.clientLogId);
				return { card: data.cards[0]! };
			});

		render(
			<VocabSessionView
				sessionData={data}
				rng={new SeededRandom(2)}
				onExit={() => undefined}
			/>,
		);

		fireEvent.click(screen.getByTestId("vocab-forgot-btn"));

		await waitFor(() => {
			expect(screen.getByTestId("vocab-persist-error")).toBeTruthy();
		});

		const continueBtn = screen.getByTestId(
			"vocab-continue-btn",
		) as HTMLButtonElement;
		expect(continueBtn.disabled).toBe(true);

		// Retry succeeds with the EXACT same clientLogId
		fireEvent.click(screen.getByTestId("vocab-retry-btn"));

		await waitFor(() => {
			expect(continueBtn.disabled).toBe(false);
		});
		expect(capturedLogIds).toHaveLength(2);
		expect(capturedLogIds[0]).toBe(capturedLogIds[1]);
	});

	it("opens deleted-deck dialog and removes card when POST returns 404 (red-team F14)", async () => {
		const data = makeReviewSessionData(2);
		const onExit = vi.fn();

		vi.mocked(vocabRepo.postVocabAnswer).mockRejectedValueOnce(
			new HttpError(404, "Not found", { code: "VOCAB_CARD_NOT_FOUND" }),
		);

		render(
			<VocabSessionView
				sessionData={data}
				rng={new SeededRandom(5)}
				onExit={onExit}
			/>,
		);

		fireEvent.click(screen.getByTestId("vocab-forgot-btn"));

		await waitFor(() => {
			expect(screen.getByTestId("vocab-deleted-dialog")).toBeTruthy();
		});

		fireEvent.click(screen.getByTestId("vocab-deleted-exit-btn"));
		expect(onExit).toHaveBeenCalledTimes(1);
	});

	it("displays wrong-streak overlay after 5 consecutive wrong/forgot responses and blocks input until dismissed", async () => {
		const data = makeReviewSessionData(6);
		vi.mocked(vocabRepo.postVocabAnswer).mockImplementation(async (input) => ({
			card: data.cards.find((c) => c.id === input.cardId) ?? data.cards[0]!,
		}));

		render(
			<VocabSessionView
				sessionData={data}
				rng={new SeededRandom(10)}
				onExit={() => undefined}
			/>,
		);

		for (let i = 0; i < 4; i++) {
			fireEvent.click(screen.getByTestId("vocab-forgot-btn"));
			await waitFor(() => {
				expect(
					(screen.getByTestId("vocab-continue-btn") as HTMLButtonElement)
						.disabled,
				).toBe(false);
			});
			fireEvent.click(screen.getByTestId("vocab-continue-btn"));
		}

		// 5th forgot triggers wrong-streak overlay
		fireEvent.click(screen.getByTestId("vocab-forgot-btn"));
		await waitFor(() => {
			expect(screen.getByTestId("vocab-wrong-streak-overlay")).toBeTruthy();
		});

		fireEvent.click(screen.getByTestId("vocab-dismiss-overlay"));
		expect(screen.queryByTestId("vocab-wrong-streak-overlay")).toBeNull();
	});

	it("runs Learn session intro -> typing with NFC normalization (café != cafe) and commits word", async () => {
		const learnData: VocabSessionData = {
			deck: { id: "deck-learn", title: "French Loanwords", lang: "en" },
			cards: [
				{
					id: "c-cafe",
					wordId: "w-cafe",
					word: "café",
					translation: "quán cà phê",
					ipa: "/ka.fe/",
					audioKey: null,
					hasAudio: false,
					level: 1,
					isWarning: false,
					state: "new",
					intervalDays: 0,
					dueAt: NOW,
					lapses: 0,
				},
			],
			pool: [
				{
					wordId: "w-cafe",
					word: "café",
					translation: "quán cà phê",
					lang: "en",
					deckId: "deck-learn",
				},
			],
		};

		vi.mocked(vocabRepo.postVocabLearnCommit).mockResolvedValue({
			card: { ...learnData.cards[0]!, state: "review", intervalDays: 1 },
		});

		render(
			<VocabSessionView
				sessionData={learnData}
				rng={new SeededRandom(1)}
				onExit={() => undefined}
			/>,
		);

		// 1) Intro step: Continue is disabled before flipping card
		const introContinue = screen.getByTestId(
			"vocab-intro-continue-btn",
		) as HTMLButtonElement;
		expect(introContinue.disabled).toBe(true);
		fireEvent.click(screen.getByTestId("vocab-intro-flip-btn"));
		expect(introContinue.disabled).toBe(false);
		fireEvent.click(introContinue);

		// 2) Typing step (no other words in pool -> only typing is eligible at L1)
		expect(screen.getByTestId("vocab-typing-hint").textContent).toBe("c___");

		// Typing "cafe" without accent fails NFC comparison
		const input = screen.getByTestId("vocab-typing-input");
		fireEvent.change(input, { target: { value: "cafe" } });
		fireEvent.click(screen.getByTestId("vocab-typing-submit"));
		expect(screen.getByTestId("vocab-feedback-verdict").textContent).toBe(
			"Chưa đúng",
		);
		fireEvent.click(screen.getByTestId("vocab-continue-btn"));

		// Retrying with decomposed NFC "cafe\u0301" passes!
		const retryInput = screen.getByTestId("vocab-typing-input");
		fireEvent.change(retryInput, { target: { value: "cafe\u0301" } });
		fireEvent.click(screen.getByTestId("vocab-typing-submit"));
		expect(screen.getByTestId("vocab-feedback-verdict").textContent).toBe(
			"Chính xác",
		);
		fireEvent.click(screen.getByTestId("vocab-continue-btn"));

		await waitFor(() => {
			expect(screen.getByTestId("vocab-summary-learn")).toBeTruthy();
		});
		expect(screen.getByTestId("vocab-missed-first-try")).toBeTruthy();
		expect(vocabRepo.postVocabLearnCommit).toHaveBeenCalledWith(
			expect.objectContaining({
				cardId: "c-cafe",
				gradeGood: false,
			}),
		);
	});

	it("shows 'Bỏ qua' button when remote audio fails on listeningChoice and skips without firing answer or penalizing SRS (#361)", async () => {
		const data = makeReviewSessionData(4);
		data.cards = data.cards.map((c) => ({
			...c,
			level: 5,
			hasAudio: true,
		}));
		vi.mocked(vocabRepo.fetchVocabAudioObjectUrl).mockRejectedValueOnce(
			new Error("CDN 502"),
		);

		render(
			<VocabSessionView
				sessionData={data}
				rng={new SeededRandom(1)}
				onExit={() => undefined}
			/>,
		);

		expect(screen.getByTestId("vocab-prompt-listeningChoice")).toBeTruthy();

		const skipBtn = await screen.findByTestId("vocab-audio-skip-btn");
		expect(skipBtn.textContent).toContain("Bỏ qua");

		fireEvent.click(skipBtn);

		// Progress advances 0/4 -> 1/4 without calling postVocabAnswer
		expect(screen.getByTestId("vocab-session-progress").textContent).toContain(
			"1/4",
		);
		expect(vocabRepo.postVocabAnswer).not.toHaveBeenCalled();
	});

	it("renders Nghe / Nghe chậm buttons on learn intro card when card has audio (#371)", async () => {
		const learnData: VocabSessionData = {
			deck: { id: "deck-learn", title: "French Loanwords", lang: "en" },
			cards: [
				{
					id: "c-audio",
					wordId: "w-audio",
					word: "bonjour",
					translation: "xin chào",
					ipa: "/bɔ̃.ʒuʁ/",
					audioKey: "vocab/org/w-audio/audio.mp3",
					hasAudio: true,
					level: 1,
					isWarning: false,
					state: "new",
					intervalDays: 0,
					dueAt: NOW,
					lapses: 0,
				},
			],
			pool: [
				{
					wordId: "w-audio",
					word: "bonjour",
					translation: "xin chào",
					lang: "en",
					deckId: "deck-learn",
				},
			],
		};

		render(
			<VocabSessionView
				sessionData={learnData}
				rng={new SeededRandom(1)}
				onExit={() => undefined}
			/>,
		);

		expect(vocabRepo.fetchVocabAudioObjectUrl).toHaveBeenCalledWith(
			"w-audio",
			expect.anything(),
		);
		await waitFor(() => {
			expect(screen.getByTestId("vocab-intro-audio")).toBeTruthy();
		});
		expect(screen.getByTestId("vocab-intro-audio-normal")).toBeTruthy();
		expect(screen.getByTestId("vocab-intro-audio-slow")).toBeTruthy();
	});
});

describe("VocabSessionView mode prop (#372)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it("mode='review' forces review prompts even when deck still has new cards", () => {
		render(
			<VocabSessionView
				sessionData={makeMixedSessionData()}
				rng={new SeededRandom(1)}
				mode="review"
				onExit={() => undefined}
			/>,
		);

		expect(screen.queryByTestId("vocab-learn-intro")).toBeNull();
		// Review prompt renders (selfCheck/wordChoice/meaningChoice/typing theo RNG)
		const prompt = [
			"vocab-prompt-selfCheck",
			"vocab-prompt-wordChoice",
			"vocab-prompt-meaningChoice",
			"vocab-prompt-typing",
		]
			.map((id) => screen.queryByTestId(id))
			.find(Boolean);
		expect(prompt).toBeTruthy();
	});

	it("mode='learn' starts the learn intro on a mixed deck", () => {
		render(
			<VocabSessionView
				sessionData={makeMixedSessionData()}
				rng={new SeededRandom(1)}
				mode="learn"
				onExit={() => undefined}
			/>,
		);

		expect(screen.getByTestId("vocab-learn-intro")).toBeTruthy();
	});

	it("no mode keeps legacy auto behavior (learn intro when new cards exist)", () => {
		render(
			<VocabSessionView
				sessionData={makeMixedSessionData()}
				rng={new SeededRandom(1)}
				onExit={() => undefined}
			/>,
		);

		expect(screen.getByTestId("vocab-learn-intro")).toBeTruthy();
	});

	it("mode='learn' falls back to review when deck has only non-due review cards (allowAllWhenNoneDue)", () => {
		render(
			<VocabSessionView
				sessionData={makeReviewOnlyNotDueSessionData()}
				rng={new SeededRandom(1)}
				mode="learn"
				onExit={() => undefined}
			/>,
		);

		expect(screen.queryByTestId("vocab-learn-intro")).toBeNull();
		const prompt = [
			"vocab-prompt-selfCheck",
			"vocab-prompt-wordChoice",
			"vocab-prompt-meaningChoice",
			"vocab-prompt-typing",
		]
			.map((id) => screen.queryByTestId(id))
			.find(Boolean);
		expect(prompt).toBeTruthy();
	});

	it("changing mode prop on the same mount rebuilds the engine (review -> learn)", () => {
		const { rerender } = render(
			<VocabSessionView
				sessionData={makeMixedSessionData()}
				rng={new SeededRandom(1)}
				mode="review"
				onExit={() => undefined}
			/>,
		);
		expect(screen.queryByTestId("vocab-learn-intro")).toBeNull();

		rerender(
			<VocabSessionView
				sessionData={makeMixedSessionData()}
				rng={new SeededRandom(1)}
				mode="learn"
				onExit={() => undefined}
			/>,
		);
		expect(screen.getByTestId("vocab-learn-intro")).toBeTruthy();
	});
});
