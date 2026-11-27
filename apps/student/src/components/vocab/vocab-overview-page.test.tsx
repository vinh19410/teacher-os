// @vitest-environment jsdom
import type {
	VocabOverview,
	VocabOverviewDeck,
} from "@teacher-os/api/contracts";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VocabOverviewContent } from "@/routes/_auth/practice/vocabulary/index";
import type { VocabOverviewSearchState } from "./vocab-overview-helpers";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => () => ({}),
	useNavigate: () => vi.fn(),
	Link: ({
		children,
		to,
		params,
		search,
		...rest
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
		search?: Record<string, string | number | undefined>;
		[key: string]: unknown;
	}) => {
		let href = to;
		if (params) {
			for (const [k, v] of Object.entries(params)) {
				href = href.replace(`$${k}`, encodeURIComponent(v));
			}
		}
		if (search) {
			const qs = new URLSearchParams();
			for (const [k, v] of Object.entries(search)) {
				if (v !== undefined && v !== "") {
					qs.set(k, String(v));
				}
			}
			const serialized = qs.toString();
			if (serialized) href = `${href}?${serialized}`;
		}
		return (
			<a href={href} {...rest}>
				{children}
			</a>
		);
	},
}));

function makeDeck(
	overrides: Partial<VocabOverviewDeck> = {},
): VocabOverviewDeck {
	return {
		deckId: "d1",
		title: "Education & Learning",
		className: "IELTS 6.5",
		source: "class",
		total: 20,
		newCount: 5,
		dueCount: 3,
		levelDistribution: [2, 3, 4, 4, 2],
		...overrides,
	};
}

function makeOverview(overrides: Partial<VocabOverview> = {}): VocabOverview {
	return {
		dueCount: 3,
		nextDueAt: null,
		upcomingCount: 0,
		learnedCount: 13,
		matureCount: 2,
		levelDistribution: [2, 3, 4, 4, 2],
		streak: 1,
		streakDays: [false, false, false, false, false, false, true],
		retention: 87,
		forecast: [3, 0, 0, 0, 0, 0, 0],
		decks: [makeDeck()],
		suggestions: [],
		...overrides,
	};
}

describe("VocabOverviewContent & redesigned components", () => {
	beforeEach(() => {
		vi.useRealTimers();
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it("renders due Hero state, picks topDueDeck/topNewDeck accurately, and preserves exact E2E testid text", () => {
		const overview = makeOverview({
			dueCount: 4,
			decks: [
				makeDeck({
					deckId: "d-due-only",
					title: "Environment",
					dueCount: 4,
					newCount: 0,
				}),
				makeDeck({
					deckId: "d-new-only",
					title: "Health",
					source: "suggested",
					className: "",
					dueCount: 0,
					newCount: 6,
				}),
			],
		});

		const { container } = render(
			<VocabOverviewContent
				data={overview}
				librarySummary={{ courseCount: 6, lessonCount: 48 }}
				busySuggestionId={null}
				suggestionError={null}
				onAcceptSuggestion={vi.fn()}
				onDismissSuggestion={vi.fn()}
				onExpired={vi.fn()}
				todayISO="2026-11-27"
			/>,
		);

		expect(screen.getByTestId("vocab-overview-page")).toBeDefined();
		expect(screen.getByTestId("vocab-overview-due-count").textContent).toBe(
			"4",
		);
		expect(screen.getAllByTestId("vocab-overview-new-count")).toHaveLength(1);
		expect(screen.getByTestId("vocab-overview-new-count").textContent).toBe(
			"6",
		);
		expect(screen.getByTestId("vocab-overview-streak").textContent).toBe(
			"1 ngày",
		);
		expect(screen.getByTestId("vocab-overview-learned").textContent).toBe("13");
		expect(screen.getByTestId("vocab-overview-mature").textContent).toBe("2");
		expect(container.textContent).toContain("tỉ lệ nhớ");
		expect(container.textContent).not.toContain("30 ngày");

		const reviewCta = screen.getByRole("link", { name: "Bắt đầu ôn" });
		expect(reviewCta.getAttribute("href")).toBe(
			"/practice/vocabulary/d-due-only/session?mode=review",
		);
		const learnCta = screen.getByRole("link", { name: "Học từ mới" });
		expect(learnCta.getAttribute("href")).toBe(
			"/practice/vocabulary/d-new-only/session?mode=learn",
		);

		// Stretched-link on card title -> detail page; footer CTA -> session
		const deck1TitleLink = screen.getByRole("link", { name: "Environment" });
		expect(deck1TitleLink.getAttribute("href")).toBe(
			"/practice/vocabulary/d-due-only",
		);
		expect(screen.getByTestId("vocab-deck-source-d-new-only").textContent).toBe(
			"Gợi ý",
		);
		expect(screen.getByTestId("vocab-deck-new-d-new-only").textContent).toBe(
			"6 từ mới",
		);

		// Exactly one aria-live="polite" region on the page
		expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
	});

	it("renders new-only, empty-decks, and no-decks Hero states and guards total === 0 cards", () => {
		const newOnly = makeOverview({
			dueCount: 0,
			nextDueAt: null,
			decks: [makeDeck({ deckId: "d1", dueCount: 0, newCount: 3 })],
		});
		const { rerender } = render(
			<VocabOverviewContent
				data={newOnly}
				librarySummary={null}
				busySuggestionId={null}
				suggestionError={null}
				onAcceptSuggestion={vi.fn()}
				onDismissSuggestion={vi.fn()}
				onExpired={vi.fn()}
				todayISO="2026-11-27"
			/>,
		);
		expect(screen.getByTestId("vocab-overview-new-count").textContent).toBe(
			"3",
		);
		expect(
			screen.getByRole("link", { name: "Học từ mới" }).getAttribute("href"),
		).toBe("/practice/vocabulary/d1/session?mode=learn");

		const zeroDeck = makeOverview({
			dueCount: 0,
			nextDueAt: null,
			decks: [
				makeDeck({
					deckId: "d-empty",
					title: "Empty Deck",
					total: 0,
					dueCount: 0,
					newCount: 0,
					levelDistribution: [0, 0, 0, 0, 0],
				}),
			],
		});
		rerender(
			<VocabOverviewContent
				data={zeroDeck}
				librarySummary={null}
				busySuggestionId={null}
				suggestionError={null}
				onAcceptSuggestion={vi.fn()}
				onDismissSuggestion={vi.fn()}
				onExpired={vi.fn()}
				todayISO="2026-11-27"
			/>,
		);
		const emptyCard = screen.getByTestId("vocab-deck-card-d-empty");
		expect(emptyCard.textContent).toContain("0%");
		expect(emptyCard.textContent).not.toContain("NaN");
		expect(emptyCard.textContent).not.toContain("Đã thuộc hết");
		// Decorative "Xem bộ từ" does not create a second link inside the card
		expect(emptyCard.querySelectorAll("a")).toHaveLength(1);
		expect(screen.getByText("Chưa có từ cần ôn hôm nay")).toBeDefined();
	});

	it("renders caught-up state with countdown and fires onExpired once when countdown elapses", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-11-27T10:00:00Z"));
		const onExpired = vi.fn();

		const caughtUp = makeOverview({
			dueCount: 0,
			nextDueAt: Date.now() + 86_395_000, // 23:59:55
			upcomingCount: 2,
			decks: [makeDeck({ deckId: "d1", dueCount: 0, newCount: 0 })],
		});

		const { rerender } = render(
			<VocabOverviewContent
				data={caughtUp}
				librarySummary={null}
				busySuggestionId={null}
				suggestionError={null}
				onAcceptSuggestion={vi.fn()}
				onDismissSuggestion={vi.fn()}
				onExpired={onExpired}
				todayISO="2026-11-27"
			/>,
		);

		expect(screen.getByTestId("vocab-countdown-label").textContent).toMatch(
			/^23:59/,
		);
		expect(screen.getByTestId("vocab-upcoming-label").textContent).toBe("2 từ");

		const nearDue = makeOverview({
			dueCount: 0,
			nextDueAt: Date.now() + 1_500,
			upcomingCount: 1,
			decks: [makeDeck({ deckId: "d1", dueCount: 0, newCount: 0 })],
		});
		rerender(
			<VocabOverviewContent
				data={nearDue}
				librarySummary={null}
				busySuggestionId={null}
				suggestionError={null}
				onAcceptSuggestion={vi.fn()}
				onDismissSuggestion={vi.fn()}
				onExpired={onExpired}
				todayISO="2026-11-27"
			/>,
		);

		act(() => {
			vi.advanceTimersByTime(5000);
		});
		expect(onExpired).toHaveBeenCalledTimes(1);
	});

	it("supports level filtering + focus restore, segmented filter, debounced search, and mid-debounce reset cancellation", () => {
		vi.useFakeTimers();
		const overview = makeOverview({
			decks: [
				makeDeck({
					deckId: "d-env",
					title: "Môi trường",
					dueCount: 2,
					newCount: 1,
					levelDistribution: [3, 1, 0, 0, 0],
				}),
				makeDeck({
					deckId: "d-edu",
					title: "Giáo dục",
					dueCount: 0,
					newCount: 0,
					total: 5,
					levelDistribution: [0, 2, 1, 1, 1],
				}),
			],
		});

		function ControlledHarness() {
			const [searchState, setSearchState] = useState<VocabOverviewSearchState>(
				{},
			);
			return (
				<VocabOverviewContent
					data={overview}
					librarySummary={null}
					busySuggestionId={null}
					suggestionError={null}
					onAcceptSuggestion={vi.fn()}
					onDismissSuggestion={vi.fn()}
					onExpired={vi.fn()}
					searchState={searchState}
					onSearchChange={(updater) => setSearchState((prev) => updater(prev))}
					todayISO="2026-11-27"
				/>
			);
		}

		render(<ControlledHarness />);

		// Level filter toggle and clear restores focus to level button
		const lv1Btn = document.querySelector<HTMLButtonElement>(
			'[data-vocab-level="1"]',
		);
		if (!lv1Btn) {
			throw new Error("Expected [data-vocab-level='1'] button to exist");
		}
		fireEvent.click(lv1Btn);
		expect(lv1Btn.getAttribute("aria-pressed")).toBe("true");
		expect(screen.queryByTestId("vocab-deck-card-d-edu")).toBeNull();
		expect(screen.getByTestId("vocab-deck-card-d-env")).toBeDefined();

		fireEvent.click(screen.getByTestId("vocab-clear-level-filter"));
		expect(document.activeElement).toBe(lv1Btn);
		expect(screen.getByTestId("vocab-deck-card-d-edu")).toBeDefined();

		// Segmented filter
		fireEvent.click(screen.getByTestId("vocab-deck-filter-done"));
		expect(screen.queryByTestId("vocab-deck-card-d-env")).toBeNull();
		expect(screen.getByTestId("vocab-deck-card-d-edu")).toBeDefined();
		fireEvent.click(screen.getByTestId("vocab-deck-filter-all"));

		// Vietnamese diacritic-insensitive search + mid-debounce reset cancellation
		const searchInput = screen.getByTestId(
			"vocab-deck-search",
		) as HTMLInputElement;
		fireEvent.change(searchInput, { target: { value: "zzzz-no-match" } });
		expect(screen.getByTestId("vocab-decks-filter-empty")).toBeDefined();

		// Reset before 300ms elapses -> cancels timer and restores all decks
		act(() => {
			vi.advanceTimersByTime(150);
		});
		fireEvent.click(screen.getByTestId("vocab-reset-filters"));
		expect(searchInput.value).toBe("");
		expect(screen.getByTestId("vocab-deck-card-d-env")).toBeDefined();

		act(() => {
			vi.advanceTimersByTime(400);
		});
		// Stale timer did NOT re-apply "zzzz-no-match"
		expect(searchInput.value).toBe("");
		expect(screen.getByTestId("vocab-deck-card-d-env")).toBeDefined();

		// Inline clear button keeps f/lv and restores focus to #vocab-deck-search
		fireEvent.click(screen.getByTestId("vocab-deck-filter-due"));
		fireEvent.change(searchInput, { target: { value: "zzzz-no-match" } });
		act(() => {
			vi.advanceTimersByTime(150);
		});
		const clearSearchBtn = screen.getByRole("button", {
			name: "Xóa tìm kiếm bộ từ",
		});
		fireEvent.click(clearSearchBtn);
		expect(searchInput.value).toBe("");
		expect(document.activeElement).toBe(searchInput);
		expect(
			screen.getByTestId("vocab-deck-filter-due").getAttribute("aria-pressed"),
		).toBe("true");
		expect(screen.getByTestId("vocab-deck-card-d-env")).toBeDefined();
		act(() => {
			vi.advanceTimersByTime(400);
		});
		expect(searchInput.value).toBe("");
	});

	it("shows suggestion error alert and formats suggestion date in Vietnam timezone", () => {
		render(
			<VocabOverviewContent
				data={makeOverview({
					suggestions: [
						{
							id: "sug-1",
							deckId: "d-sug",
							title: "Academic Speaking",
							wordCount: 8,
							note: "Ôn sớm nhé",
							// 2026-10-18T22:00:00Z = 2026-10-19T05:00:00+07:00 (Asia/Ho_Chi_Minh)
							createdAt: "2026-10-18T22:00:00.000Z",
						},
					],
				})}
				librarySummary={{ courseCount: 6, lessonCount: 48 }}
				busySuggestionId={null}
				suggestionError="Không thể ẩn gợi ý. Vui lòng thử lại."
				onAcceptSuggestion={vi.fn()}
				onDismissSuggestion={vi.fn()}
				onExpired={vi.fn()}
				todayISO="2026-11-27"
			/>,
		);
		expect(screen.getByTestId("vocab-suggestions-error").textContent).toContain(
			"Không thể ẩn gợi ý",
		);
		const sugCardText = screen.getByTestId(
			"vocab-suggestion-card-sug-1",
		).textContent;
		expect(sugCardText).toMatch(/19\/10\/2026/);
	});
});
