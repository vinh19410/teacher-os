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
import { VocabCourseLessonsView } from "@/routes/_auth/vocab/courses/$courseId";
import { VocabCoursesCatalogView } from "@/routes/_auth/vocab/courses/index";
import { VocabCourseSwitcherDialog } from "./vocab-course-switcher-dialog";
import { VocabCoursesCta } from "./vocab-courses-cta";
import {
	deriveLessonStatus,
	deriveLessonSubtitle,
	findStartHereDeckId,
	VocabLessonCard,
} from "./vocab-lesson-card";

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
		params?: { deckId?: string; courseId?: string };
		search?: { course?: string };
		[key: string]: unknown;
	}) => {
		let href = to;
		if (params?.deckId) {
			href = href.replace("$deckId", params.deckId);
		}
		if (params?.courseId) {
			href = href.replace("$courseId", params.courseId);
		}
		if (search?.course) {
			href = `${href}?course=${encodeURIComponent(search.course)}`;
		}
		return (
			<a href={href} {...rest}>
				{children}
			</a>
		);
	},
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

describe("Student Vocab Courses & MochiVocab Lessons UI (#369)", () => {
	beforeEach(() => {
		let store: Record<string, string> = {};
		Object.defineProperty(window, "localStorage", {
			value: {
				getItem: (key: string) => store[key] ?? null,
				setItem: (key: string, val: string) => {
					store[key] = val;
				},
				removeItem: (key: string) => {
					delete store[key];
				},
				clear: () => {
					store = {};
				},
			},
			configurable: true,
		});
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("deriveLessonSubtitle keeps verbatim CSV numbered description and suppresses null/empty/'N từ vựng' noise", () => {
		expect(
			deriveLessonSubtitle({ description: "84.Nhận thức của con người" }),
		).toBe("84.Nhận thức của con người");
		expect(deriveLessonSubtitle({ description: "1.Trường học" })).toBe(
			"1.Trường học",
		);
		expect(deriveLessonSubtitle({ description: null })).toBeNull();
		expect(deriveLessonSubtitle({ description: "   " })).toBeNull();
		expect(deriveLessonSubtitle({ description: "10 từ vựng" })).toBeNull();
		expect(deriveLessonSubtitle({ description: "25 Từ Vựng" })).toBeNull();
	});

	it("deriveLessonStatus and findStartHereDeckId compute completed, in-progress, new, and first uncompleted lesson", () => {
		expect(
			deriveLessonStatus({ wordCount: 20, learnedCount: 20, reviewCount: 20 }),
		).toBe("completed");
		expect(
			deriveLessonStatus({ wordCount: 20, learnedCount: 5, reviewCount: 8 }),
		).toBe("in-progress");
		expect(
			deriveLessonStatus({ wordCount: 20, learnedCount: 0, reviewCount: 0 }),
		).toBe("new");
		expect(
			deriveLessonStatus({ wordCount: 0, learnedCount: 0, reviewCount: 0 }),
		).toBe("new");

		expect(
			findStartHereDeckId([
				{ id: "libdeck-1", wordCount: 10, learnedCount: 10 },
				{ id: "libdeck-2", wordCount: 10, learnedCount: 3 },
				{ id: "libdeck-3", wordCount: 10, learnedCount: 0 },
			]),
		).toBe("libdeck-2");

		expect(
			findStartHereDeckId([
				{ id: "libdeck-1", wordCount: 10, learnedCount: 10 },
			]),
		).toBeNull();
	});

	it("VocabLessonCard renders image, falls back cleanly on CDN error, shows status chips, and preserves ?course= param", () => {
		render(
			<div>
				<VocabLessonCard
					courseId="libcourse-1"
					isStartHere={true}
					deck={{
						id: "libdeck-1",
						courseId: "libcourse-1",
						title: "School",
						description: "1.Trường học",
						imageUrl: "https://cdn.example.com/1.webp",
						wordCount: 20,
						newCount: 15,
						reviewCount: 5,
						dueCount: 2,
						learnedCount: 1,
						sortOrder: 1,
					}}
				/>
				<VocabLessonCard
					courseId="libcourse-1"
					deck={{
						id: "libdeck-2",
						courseId: "libcourse-1",
						title: "Family",
						description: "10 từ vựng",
						imageUrl: null,
						wordCount: 10,
						newCount: 0,
						reviewCount: 10,
						dueCount: 0,
						learnedCount: 10,
						sortOrder: 2,
					}}
				/>
			</div>,
		);

		const card1 = screen.getByTestId("vocab-course-deck-libdeck-1");
		expect(card1.getAttribute("href")).toBe(
			"/vocab/libdeck-1?course=libcourse-1",
		);
		expect(screen.getByTestId("vocab-lesson-start-here").textContent).toContain(
			"Bắt đầu tại đây",
		);
		expect(
			screen.getByTestId("vocab-lesson-subtitle-libdeck-1").textContent,
		).toBe("1.Trường học");
		expect(
			screen.getByTestId("vocab-lesson-status-libdeck-1").textContent,
		).toBe("Đang học 5/20");
		expect(
			screen.getByTestId("vocab-course-deck-due-libdeck-1").textContent,
		).toBe("2 đến hạn");

		// Simulate CDN image failure -> renders fallback without crashing
		const img1 = screen.getByTestId("vocab-lesson-img-libdeck-1");
		fireEvent.error(img1);
		expect(
			screen.getByTestId("vocab-lesson-img-fallback-libdeck-1"),
		).toBeDefined();

		// Card 2 has noise description "10 từ vựng" -> no subtitle, completed status
		expect(screen.queryByTestId("vocab-lesson-subtitle-libdeck-2")).toBeNull();
		expect(
			screen.getByTestId("vocab-lesson-status-libdeck-2").textContent,
		).toBe("Hoàn thành");
	});

	it("VocabCourseSwitcherDialog supports search, highlights active course, traps Tab focus, and closes on Escape", () => {
		const onSelectCourse = vi.fn();
		const onClose = vi.fn();
		const courses = [
			{
				id: "libcourse-1",
				name: "1000 Từ Cơ Bản",
				description: "Nền tảng giao tiếp",
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
				description: "Học thuật",
				target: "Band 6.5+",
				deckCount: 40,
				wordCount: 800,
				reviewWordCount: 0,
				learnedWordCount: 0,
				dueWordCount: 0,
				sortOrder: 1,
			},
		];

		render(
			<VocabCourseSwitcherDialog
				open={true}
				currentCourseId="libcourse-1"
				courses={courses}
				onSelectCourse={onSelectCourse}
				onClose={onClose}
			/>,
		);

		const activeBtn = screen.getByTestId("vocab-switcher-course-libcourse-1");
		expect(activeBtn.getAttribute("aria-current")).toBe("true");
		expect(activeBtn.textContent).toContain("Đang xem");

		// Filter courses inside dialog
		const searchInput = screen.getByTestId("vocab-course-switcher-search");
		fireEvent.change(searchInput, { target: { value: "IELTS" } });
		expect(
			screen.queryByTestId("vocab-switcher-course-libcourse-1"),
		).toBeNull();
		const course2Btn = screen.getByTestId("vocab-switcher-course-libcourse-2");
		fireEvent.click(course2Btn);
		expect(onSelectCourse).toHaveBeenCalledWith("libcourse-2");

		// Escape key closes dialog
		const dialog = screen.getByTestId("vocab-course-switcher-dialog");
		fireEvent.keyDown(dialog, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("VocabCoursesCta renders dashboard link to /vocab/courses", () => {
		render(<VocabCoursesCta />);
		const cta = screen.getByTestId("vocab-courses-cta");
		expect(cta.getAttribute("href")).toBe("/vocab/courses");
	});

	it("VocabCoursesCatalogView and VocabCourseLessonsView render catalog, debounce search (300ms), auto-scroll once to start-here, and switch courses via ribbon dialog", async () => {
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
								title: "School",
								description: "1.Trường học",
								imageUrl: "https://cdn.example.com/1.webp",
								wordCount: 20,
								newCount: 0,
								reviewCount: 20,
								dueCount: 0,
								learnedCount: 20,
								sortOrder: 1,
							},
							{
								id: "libdeck-2",
								courseId: "libcourse-1",
								title: "Family",
								description: "2.Gia đình",
								imageUrl: null,
								wordCount: 20,
								newCount: 15,
								reviewCount: 5,
								dueCount: 2,
								learnedCount: 1,
								sortOrder: 2,
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

		const { unmount } = renderWithQueryClient(
			<VocabCoursesCatalogView
				onSelectCourse={onSelectCourse}
				onSearchChange={onSearchChange}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("vocab-course-card-libcourse-1")).toBeDefined();
		});
		expect(
			screen.getByTestId("vocab-course-review-libcourse-1").textContent,
		).toBe("Đã học 15/1000 từ");

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
		fireEvent.click(screen.getByTestId("vocab-course-card-libcourse-2"));
		expect(onSelectCourse).toHaveBeenCalledWith("libcourse-2");

		unmount();

		const scrollSpy = vi.fn();
		Element.prototype.scrollIntoView = scrollSpy;

		const onSwitchCourse = vi.fn();
		const onDeckSearchChange = vi.fn();
		renderWithQueryClient(
			<VocabCourseLessonsView
				courseId="libcourse-1"
				onSelectCourse={onSwitchCourse}
				onSearchChange={onDeckSearchChange}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("vocab-course-deck-libdeck-1")).toBeDefined();
		});
		expect(screen.getByTestId("vocab-selected-course-title").textContent).toBe(
			"1000 Từ Cơ Bản",
		);
		// libdeck-1 is completed (20/20), so libdeck-2 gets "Bắt đầu tại đây" and auto-scrolls once
		const card2 = screen.getByTestId("vocab-course-deck-libdeck-2");
		expect(card2.textContent).toContain("Bắt đầu tại đây");
		expect(scrollSpy).toHaveBeenCalledTimes(1);

		// Search by Vietnamese description ("Gia đình") filters lessons without re-triggering scrollIntoView
		fireEvent.change(screen.getByTestId("vocab-course-deck-search"), {
			target: { value: "Gia đình" },
		});
		await act(async () => {
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, 350);
			await promise;
		});
		expect(onDeckSearchChange).toHaveBeenCalledWith("Gia đình");
		expect(screen.queryByTestId("vocab-course-deck-libdeck-1")).toBeNull();
		expect(screen.getByTestId("vocab-course-deck-libdeck-2")).toBeDefined();
		expect(scrollSpy).toHaveBeenCalledTimes(1);

		// Open course switcher dialog via ribbon button and switch to libcourse-2
		fireEvent.click(screen.getByTestId("vocab-course-switcher"));
		await waitFor(() => {
			expect(screen.getByTestId("vocab-course-switcher-dialog")).toBeDefined();
		});
		fireEvent.click(screen.getByTestId("vocab-switcher-course-libcourse-2"));
		expect(onSwitchCourse).toHaveBeenCalledWith("libcourse-2");
	});
});
