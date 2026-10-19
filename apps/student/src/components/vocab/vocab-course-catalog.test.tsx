// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VocabCourseCatalog } from "./vocab-course-catalog";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		params,
		...rest
	}: {
		children: ReactNode;
		to: string;
		params?: { deckId?: string };
		[key: string]: unknown;
	}) => (
		<a
			href={params?.deckId ? to.replace("$deckId", params.deckId) : to}
			{...rest}
		>
			{children}
		</a>
	),
}));

function renderWithQueryClient(ui: ReactNode) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});
	return render(
		<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
	);
}

describe("VocabCourseCatalog (#366)", () => {
	beforeEach(() => {
		const store = new Map<string, string>();
		Object.defineProperty(window, "localStorage", {
			value: {
				getItem: (key: string) => store.get(key) ?? null,
				setItem: (key: string, val: string) => store.set(key, val),
				removeItem: (key: string) => store.delete(key),
				clear: () => store.clear(),
			},
			configurable: true,
		});
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("renders 20-course catalog with progress badges, debounces search (300ms), drills down into course decks, and returns to course list", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith("/api/student/vocab/library/courses")) {
				return new Response(
					JSON.stringify({
						courses: [
							{
								id: "libcourse-1",
								name: "1000 Từ Cơ Bản",
								description: "Nền tảng tiếng Anh giao tiếp",
								target: "Mất gốc",
								deckCount: 50,
								wordCount: 1000,
								reviewWordCount: 15,
								learnedWordCount: 4,
								dueWordCount: 2,
								sortOrder: 0,
							},
							{
								id: "libcourse-2",
								name: "IELTS Reading Academic",
								description: "Từ vựng học thuật IELTS",
								target: "Band 6.5+",
								deckCount: 40,
								wordCount: 800,
								reviewWordCount: 0,
								learnedWordCount: 0,
								dueWordCount: 0,
								sortOrder: 1,
							},
						],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			if (
				url.endsWith("/api/student/vocab/library/courses/libcourse-1/decks")
			) {
				return new Response(
					JSON.stringify({
						course: {
							id: "libcourse-1",
							name: "1000 Từ Cơ Bản",
							description: "Nền tảng tiếng Anh giao tiếp",
							target: "Mất gốc",
						},
						decks: [
							{
								id: "libdeck-1",
								courseId: "libcourse-1",
								title: "Bài 1: Chào hỏi",
								imageUrl: null,
								wordCount: 20,
								newCount: 15,
								reviewCount: 5,
								dueCount: 2,
								learnedCount: 1,
								sortOrder: 0,
							},
							{
								id: "libdeck-2",
								courseId: "libcourse-1",
								title: "Bài 2: Gia đình",
								imageUrl: null,
								wordCount: 20,
								newCount: 20,
								reviewCount: 0,
								dueCount: 0,
								learnedCount: 0,
								sortOrder: 1,
							},
						],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			return new Response(JSON.stringify({ error: "not found" }), {
				status: 404,
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const onSelectCourse = vi.fn();
		const onSearchChange = vi.fn();

		renderWithQueryClient(
			<VocabCourseCatalog
				onSelectCourse={onSelectCourse}
				onSearchChange={onSearchChange}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("vocab-course-card-libcourse-1")).toBeDefined();
		});
		expect(screen.getByTestId("vocab-course-card-libcourse-2")).toBeDefined();
		expect(
			screen.getByTestId("vocab-course-review-libcourse-1").textContent,
		).toBe("Đã học 15/1000 từ");
		expect(
			screen.getByTestId("vocab-course-learned-libcourse-1").textContent,
		).toBe("4 thành thạo");
		expect(screen.getByTestId("vocab-course-due-libcourse-1").textContent).toBe(
			"2 đến hạn",
		);

		// Debounced course search (300ms)
		fireEvent.change(screen.getByTestId("vocab-course-search"), {
			target: { value: "IELTS" },
		});
		await act(async () => {
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, 350);
			await promise;
		});
		expect(onSearchChange).toHaveBeenCalledWith("IELTS");
		expect(screen.queryByTestId("vocab-course-card-libcourse-1")).toBeNull();
		expect(screen.getByTestId("vocab-course-card-libcourse-2")).toBeDefined();

		// Clear search & select course 1
		fireEvent.change(screen.getByTestId("vocab-course-search"), {
			target: { value: "" },
		});
		await act(async () => {
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, 350);
			await promise;
		});
		fireEvent.click(screen.getByTestId("vocab-course-card-libcourse-1"));
		expect(onSelectCourse).toHaveBeenCalledWith("libcourse-1");

		await waitFor(() => {
			expect(screen.getByTestId("vocab-course-deck-libdeck-1")).toBeDefined();
		});
		expect(screen.getByTestId("vocab-selected-course-title").textContent).toBe(
			"1000 Từ Cơ Bản",
		);
		expect(
			screen.getByTestId("vocab-course-deck-review-libdeck-1").textContent,
		).toBe("5 đã học");
		expect(
			screen.getByTestId("vocab-course-deck-learned-libdeck-1").textContent,
		).toBe("1 thành thạo");
		expect(
			screen.getByTestId("vocab-course-deck-due-libdeck-1").textContent,
		).toBe("2 đến hạn");
		expect(
			screen.getByTestId("vocab-course-deck-libdeck-1").getAttribute("href"),
		).toBe("/vocab/libdeck-1");

		// Click back button -> returns to course list
		fireEvent.click(screen.getByTestId("vocab-course-back-btn"));
		expect(onSelectCourse).toHaveBeenCalledWith(null);
		await waitFor(() => {
			expect(screen.getByTestId("vocab-course-card-libcourse-1")).toBeDefined();
		});
	});
});
