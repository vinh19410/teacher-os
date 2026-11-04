// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	acceptVocabSuggestion,
	dismissVocabSuggestion,
} from "@/lib/repos/vocab";
import { VocabSuggestionList } from "./vocab-suggestion-list";

describe("Student VocabSuggestionList & suggestion repo (#363)", () => {
	beforeEach(() => {
		const store = new Map<string, string>();
		Object.defineProperty(window, "localStorage", {
			value: {
				getItem: (key: string) => store.get(key) ?? null,
				setItem: (key: string, value: string) => {
					store.set(key, value);
				},
				removeItem: (key: string) => {
					store.delete(key);
				},
			},
			configurable: true,
		});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("hides section completely when suggestions is empty", () => {
		const { container } = render(
			<VocabSuggestionList
				suggestions={[]}
				onAccept={vi.fn()}
				onDismiss={vi.fn()}
			/>,
		);
		expect(container.firstChild).toBeNull();
		expect(screen.queryByTestId("vocab-suggestions-section")).toBeNull();
	});

	it("renders suggestion cards with note/wordCount and invokes onAccept & onDismiss", () => {
		const onAccept = vi.fn();
		const onDismiss = vi.fn();
		const suggestions = [
			{
				id: "sug-1",
				deckId: "deck-indep-1",
				title: "TOEIC 600 Essential",
				wordCount: 25,
				note: "Ôn trước thứ 7 nhé",
				createdAt: "2026-10-19T00:00:00.000Z",
			},
			{
				id: "sug-2",
				deckId: "deck-indep-2",
				title: "IELTS Collocations",
				wordCount: 15,
				note: null,
				createdAt: "2026-10-19T01:00:00.000Z",
			},
		];

		render(
			<VocabSuggestionList
				suggestions={suggestions}
				onAccept={onAccept}
				onDismiss={onDismiss}
			/>,
		);

		expect(screen.getByTestId("vocab-suggestions-section")).toBeDefined();
		expect(screen.getByTestId("vocab-suggestion-note-sug-1").textContent).toBe(
			"Ôn trước thứ 7 nhé",
		);
		expect(screen.queryByTestId("vocab-suggestion-note-sug-2")).toBeNull();
		const acceptBtn = screen.getByTestId("vocab-suggestion-accept-sug-1");
		expect(acceptBtn.classList.contains("text-bg")).toBe(false);
		expect(acceptBtn.classList.contains("text-primary-foreground")).toBe(true);
		expect(acceptBtn.classList.contains("hover:bg-primary/90")).toBe(true);

		fireEvent.click(screen.getByTestId("vocab-suggestion-accept-sug-1"));
		expect(onAccept).toHaveBeenCalledWith(suggestions[0]);

		fireEvent.click(screen.getByTestId("vocab-suggestion-dismiss-sug-2"));
		expect(onDismiss).toHaveBeenCalledWith(suggestions[1]);
	});

	it("acceptVocabSuggestion and dismissVocabSuggestion POST JSON body to correct student endpoints", async () => {
		const fetchMock = vi.fn(async (url: string) => {
			const isAccept = url.endsWith("/accept");
			return new Response(
				JSON.stringify({
					id: "sug-1",
					deckId: "deck-indep-1",
					status: isAccept ? "accepted" : "dismissed",
					respondedAt: "2026-10-19T03:00:00.000Z",
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		const accepted = await acceptVocabSuggestion("sug-1");
		expect(accepted.status).toBe("accepted");
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining("/api/student/vocab/suggestions/sug-1/accept"),
			expect.objectContaining({
				method: "POST",
				credentials: "include",
				body: "{}",
			}),
		);

		const dismissed = await dismissVocabSuggestion("sug-1");
		expect(dismissed.status).toBe("dismissed");
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining("/api/student/vocab/suggestions/sug-1/dismiss"),
			expect.objectContaining({
				method: "POST",
				credentials: "include",
				body: "{}",
			}),
		);
	});
});
