// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	classRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
} from "@/test/kernel-harness";
import { VocabDeckList } from "./vocab-deck-list";
import { VocabWordRow } from "./vocab-word-row";

describe("VocabLibraryDialog & VocabDeckList library integration (#361)", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("filters courses, shows existing-in-class chip, clones selected decks via command bus, and renders 'Thư viện' badge", async () => {
		const initialSnapshot = snapshotFixture({
			classes: [classRow({ id: "cl-1", name: "IELTS 6.5" })],
			vocabDecks: [
				{
					id: "deck-existing",
					classId: "cl-1",
					title: "Lesson 1: Education",
					lang: "en",
					wordCount: 10,
					createdAt: "2026-10-18T00:00:00.000Z",
					sourceLibraryDeckId: "libdeck-101",
				},
			],
		});

		const server = startKernelServer(initialSnapshot, (req, srv) => {
			if (
				req.method === "GET" &&
				req.path === "/api/kernel/vocab-library/courses"
			) {
				return {
					status: 200,
					body: {
						courses: [
							{
								id: "libcourse-6",
								name: "IELTS CƠ BẢN",
								description: "Hơn 1200 từ IELTS",
								target: "Ôn IELTS 6.5",
								deckCount: 3,
								sortOrder: 1,
							},
							{
								id: "libcourse-7",
								name: "TIẾNG ANH CNTT",
								description: "Từ vựng công nghệ",
								target: "Đi làm",
								deckCount: 25,
								sortOrder: 2,
							},
						],
					},
				};
			}

			if (
				req.method === "GET" &&
				req.path === "/api/kernel/vocab-library/courses/libcourse-6/decks"
			) {
				return {
					status: 200,
					body: {
						decks: [
							{
								id: "libdeck-101",
								courseId: "libcourse-6",
								title: "Lesson 1: Education",
								imageUrl: null,
								wordCount: 10,
								sortOrder: 1,
							},
							{
								id: "libdeck-102",
								courseId: "libcourse-6",
								title: "Lesson 2: Environment",
								imageUrl: null,
								wordCount: 12,
								sortOrder: 2,
							},
							{
								id: "libdeck-103",
								courseId: "libcourse-6",
								title: "Lesson 3: Health",
								imageUrl: null,
								wordCount: 8,
								sortOrder: 3,
							},
						],
					},
				};
			}

			if (
				req.method === "POST" &&
				req.path === "/api/kernel/vocab-library/clone"
			) {
				srv.snapshot.vocabDecks.push(
					{
						id: "deck-cloned-102",
						classId: "cl-1",
						title: "Lesson 2: Environment",
						lang: "en",
						wordCount: 12,
						createdAt: "2026-10-18T01:00:00.000Z",
						sourceLibraryDeckId: "libdeck-102",
					},
					{
						id: "deck-cloned-103",
						classId: "cl-1",
						title: "Lesson 3: Health",
						lang: "en",
						wordCount: 8,
						createdAt: "2026-10-18T01:00:00.000Z",
						sourceLibraryDeckId: "libdeck-103",
					},
				);
				return {
					status: 201,
					body: {
						id: "deck-cloned-102",
						updated: 2,
						duplicates: [],
					},
				};
			}

			return undefined;
		});

		renderWithKernel(<VocabDeckList classId="cl-1" />);

		// Existing cloned deck already displays the "Thư viện" badge
		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-deck-library-badge-deck-existing"),
			).toBeTruthy();
		});

		// Open library dialog
		fireEvent.click(screen.getByTestId("vocab-add-from-library"));

		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-library-course-libcourse-6"),
			).toBeTruthy();
		});
		expect(screen.getByTestId("vocab-library-course-libcourse-7")).toBeTruthy();

		// Filter course list
		fireEvent.change(screen.getByTestId("vocab-library-course-search"), {
			target: { value: "IELTS" },
		});
		expect(screen.getByTestId("vocab-library-course-libcourse-6")).toBeTruthy();
		expect(screen.queryByTestId("vocab-library-course-libcourse-7")).toBeNull();

		// Select IELTS course -> Step 2 (decks)
		fireEvent.click(
			screen.getByTestId("vocab-library-select-course-libcourse-6"),
		);

		await waitFor(() => {
			expect(screen.getByTestId("vocab-library-deck-libdeck-101")).toBeTruthy();
		});

		// Deck 101 already exists in class -> shows "Đã có trong lớp" chip
		expect(
			screen.getByTestId("vocab-library-existing-chip-libdeck-101").textContent,
		).toContain("Đã có trong lớp");
		expect(
			screen.queryByTestId("vocab-library-existing-chip-libdeck-102"),
		).toBeNull();

		// Select libdeck-102 (12 words) and libdeck-103 (8 words) -> 2 bộ · 20 từ
		fireEvent.click(
			screen.getByTestId("vocab-library-deck-checkbox-libdeck-102"),
		);
		fireEvent.click(
			screen.getByTestId("vocab-library-deck-checkbox-libdeck-103"),
		);

		expect(
			screen.getByTestId("vocab-library-selection-summary").textContent,
		).toContain("Đã chọn 2 bộ · 20 từ");

		const confirmBtn = screen.getByTestId(
			"vocab-library-confirm-btn",
		) as HTMLButtonElement;
		expect(confirmBtn.disabled).toBe(false);
		fireEvent.click(confirmBtn);

		// Dialog closes after refreshed and new decks appear with "Thư viện" badge
		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-deck-library-badge-deck-cloned-102"),
			).toBeTruthy();
		});
		expect(
			screen.getByTestId("vocab-deck-library-badge-deck-cloned-103"),
		).toBeTruthy();

		const cloneWrite = server.writes.find(
			(w) =>
				w.method === "POST" && w.path === "/api/kernel/vocab-library/clone",
		);
		expect(cloneWrite?.body).toEqual({
			classId: "cl-1",
			deckIds: ["libdeck-102", "libdeck-103"],
		});
	});

	it("disables confirm button and shows cap warning when total statements (decks + words) exceed 500", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1", name: "IELTS 6.5" })],
			}),
			(req) => {
				if (
					req.method === "GET" &&
					req.path === "/api/kernel/vocab-library/courses"
				) {
					return {
						status: 200,
						body: {
							courses: [
								{
									id: "libcourse-6",
									name: "IELTS CƠ BẢN",
									description: null,
									target: null,
									deckCount: 2,
									sortOrder: 1,
								},
							],
						},
					};
				}
				if (
					req.method === "GET" &&
					req.path === "/api/kernel/vocab-library/courses/libcourse-6/decks"
				) {
					return {
						status: 200,
						body: {
							decks: [
								{
									id: "libdeck-big-1",
									courseId: "libcourse-6",
									title: "Big Lesson 1",
									imageUrl: null,
									wordCount: 300,
									sortOrder: 1,
								},
								{
									id: "libdeck-big-2",
									courseId: "libcourse-6",
									title: "Big Lesson 2",
									imageUrl: null,
									wordCount: 200,
									sortOrder: 2,
								},
							],
						},
					};
				}
				return undefined;
			},
		);

		renderWithKernel(<VocabDeckList classId="cl-1" />);
		await waitFor(() => {
			expect(screen.getByTestId("vocab-add-from-library")).toBeTruthy();
		});

		fireEvent.click(screen.getByTestId("vocab-add-from-library"));
		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-library-select-course-libcourse-6"),
			).toBeTruthy();
		});
		fireEvent.click(
			screen.getByTestId("vocab-library-select-course-libcourse-6"),
		);

		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-library-deck-checkbox-libdeck-big-1"),
			).toBeTruthy();
		});

		// 2 decks + 500 words = 502 statements > 500
		fireEvent.click(
			screen.getByTestId("vocab-library-deck-checkbox-libdeck-big-1"),
		);
		fireEvent.click(
			screen.getByTestId("vocab-library-deck-checkbox-libdeck-big-2"),
		);

		expect(screen.getByTestId("vocab-library-cap-warning")).toBeTruthy();
		const confirmBtn = screen.getByTestId(
			"vocab-library-confirm-btn",
		) as HTMLButtonElement;
		expect(confirmBtn.disabled).toBe(true);
	});

	it("shows 'Đã có audio' in VocabWordRow when audioUrl is present and audioKey is null", () => {
		render(
			<VocabWordRow
				row={{
					id: "w-1",
					deckId: "d-1",
					word: "teacher",
					ipa: "/ˈtiːtʃər/",
					translation: "Giáo viên",
					audioKey: null,
					audioUrl:
						"https://mochien3.1-api.mochidemy.com/public/audios/question/teacher.mp3",
					sortOrder: 0,
				}}
				saving={false}
				onSave={async () => undefined}
				onRemove={async () => undefined}
				onUploadAudio={async () => "ok"}
			/>,
		);

		expect(screen.getByText("Đã có audio")).toBeTruthy();
	});
});
