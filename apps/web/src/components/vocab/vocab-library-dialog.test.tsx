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

	it("defaults to system library tab, switches to teacher decks tab, filters by source/search with debounce, clears filters, and clones into class", async () => {
		const initialSnapshot = snapshotFixture({
			classes: [
				classRow({ id: "cl-1", name: "IELTS 6.5" }),
				classRow({ id: "cl-2", name: "IELTS 7.5" }),
			],
			vocabDecks: [
				{
					id: "deck-in-cl1",
					classId: "cl-1",
					title: "Already In Target Class",
					lang: "en",
					wordCount: 9,
					createdAt: "2026-10-18T00:00:00.000Z",
					sourceLibraryDeckId: null,
					sourceDeckId: "deck-indep-dup",
				},
				{
					id: "deck-indep-dup",
					classId: null,
					title: "Academic Collocations",
					lessonNumber: 1,
					topic: "Writing Task 2",
					lang: "en",
					wordCount: 15,
					createdAt: "2026-10-18T01:00:00.000Z",
					sourceLibraryDeckId: null,
					sourceDeckId: null,
				},
				{
					id: "deck-indep-fresh",
					classId: null,
					title: "Speaking Idioms",
					lessonNumber: 3,
					topic: null,
					lang: "en",
					wordCount: 12,
					createdAt: "2026-10-18T02:00:00.000Z",
					sourceLibraryDeckId: null,
					sourceDeckId: null,
				},
				{
					id: "deck-cl2-env",
					classId: "cl-2",
					title: "Environment Mastery",
					lessonNumber: null,
					topic: "Climate Change",
					lang: "en",
					wordCount: 18,
					createdAt: "2026-10-18T03:00:00.000Z",
					sourceLibraryDeckId: null,
					sourceDeckId: null,
				},
			],
		});

		const server = startKernelServer(initialSnapshot, (req, srv) => {
			if (
				req.method === "GET" &&
				req.path === "/api/kernel/vocab-library/courses"
			) {
				return { status: 200, body: { courses: [] } };
			}
			if (
				req.method === "POST" &&
				req.path === "/api/kernel/vocab/decks/clone"
			) {
				const body = req.body as { classId: string | null; deckIds: string[] };
				body.deckIds.forEach((sourceId, idx) => {
					const src = srv.snapshot.vocabDecks.find((d) => d.id === sourceId);
					srv.snapshot.vocabDecks.push({
						id: `deck-cloned-${idx + 1}`,
						classId: body.classId,
						title: src?.title ?? sourceId,
						lessonNumber: src?.lessonNumber ?? null,
						topic: src?.topic ?? null,
						lang: src?.lang ?? "en",
						wordCount: src?.wordCount ?? 0,
						createdAt: "2026-10-19T00:00:00.000Z",
						sourceLibraryDeckId: null,
						sourceDeckId: sourceId,
					});
				});
				return {
					status: 201,
					body: {
						id: "deck-cloned-1",
						updated: body.deckIds.length,
						duplicates: [],
					},
				};
			}
			return undefined;
		});

		renderWithKernel(<VocabDeckList classId="cl-1" />);
		await waitFor(() => {
			expect(screen.getByTestId("vocab-add-from-library")).toBeTruthy();
		});

		fireEvent.click(screen.getByTestId("vocab-add-from-library"));

		// Default active tab is "Thư viện hệ thống"
		const libraryTab = screen.getByRole("tab", { name: "Thư viện hệ thống" });
		const teacherTab = screen.getByRole("tab", { name: "Bộ từ đã tạo" });
		expect(libraryTab.getAttribute("aria-selected")).toBe("true");
		expect(teacherTab.getAttribute("aria-selected")).toBe("false");
		expect(screen.getByTestId("vocab-library-courses-step")).toBeTruthy();

		// Switch to "Bộ từ đã tạo"
		fireEvent.click(teacherTab);
		expect(teacherTab.getAttribute("aria-selected")).toBe("true");
		expect(screen.getByTestId("vocab-teacher-decks-tab")).toBeTruthy();

		// Excludes current class deck; shows independent + other class decks
		expect(screen.queryByTestId("vocab-teacher-deck-deck-in-cl1")).toBeNull();
		expect(
			screen.getByTestId("vocab-teacher-deck-deck-indep-dup"),
		).toBeTruthy();
		expect(
			screen.getByTestId("vocab-teacher-deck-deck-indep-fresh"),
		).toBeTruthy();
		expect(screen.getByTestId("vocab-teacher-deck-deck-cl2-env")).toBeTruthy();

		// Source badges, lesson/topic metadata, and duplicate chip
		expect(
			screen.getByTestId("vocab-teacher-source-badge-deck-indep-dup")
				.textContent,
		).toBe("Riêng");
		expect(
			screen.getByTestId("vocab-teacher-lesson-meta-deck-indep-dup")
				.textContent,
		).toBe("Buổi 01 · Writing Task 2");
		expect(
			screen.getByTestId("vocab-teacher-existing-chip-deck-indep-dup")
				.textContent,
		).toBe("Đã có trong lớp");

		expect(
			screen.getByTestId("vocab-teacher-lesson-meta-deck-indep-fresh")
				.textContent,
		).toBe("Buổi 03");
		expect(
			screen.queryByTestId("vocab-teacher-existing-chip-deck-indep-fresh"),
		).toBeNull();

		expect(
			screen.getByTestId("vocab-teacher-source-badge-deck-cl2-env").textContent,
		).toBe("Lớp IELTS 7.5");
		expect(
			screen.getByTestId("vocab-teacher-lesson-meta-deck-cl2-env").textContent,
		).toBe("Climate Change");

		// Filter by source dropdown: "Riêng"
		fireEvent.change(screen.getByTestId("vocab-teacher-source-filter"), {
			target: { value: "independent" },
		});
		expect(
			screen.getByTestId("vocab-teacher-deck-deck-indep-dup"),
		).toBeTruthy();
		expect(
			screen.getByTestId("vocab-teacher-deck-deck-indep-fresh"),
		).toBeTruthy();
		expect(screen.queryByTestId("vocab-teacher-deck-deck-cl2-env")).toBeNull();

		// Filter by specific class
		fireEvent.change(screen.getByTestId("vocab-teacher-source-filter"), {
			target: { value: "class:cl-2" },
		});
		expect(screen.getByTestId("vocab-teacher-deck-deck-cl2-env")).toBeTruthy();
		expect(
			screen.queryByTestId("vocab-teacher-deck-deck-indep-dup"),
		).toBeNull();

		// Clear filters restores all 3 candidate decks
		fireEvent.click(screen.getByTestId("vocab-teacher-clear-filters"));
		expect(
			screen.getByTestId("vocab-teacher-deck-deck-indep-dup"),
		).toBeTruthy();
		expect(screen.getByTestId("vocab-teacher-deck-deck-cl2-env")).toBeTruthy();

		// Search by topic (debounced 300ms)
		fireEvent.change(screen.getByTestId("vocab-teacher-deck-search"), {
			target: { value: "climate" },
		});
		await waitFor(
			() => {
				expect(
					screen.queryByTestId("vocab-teacher-deck-deck-indep-dup"),
				).toBeNull();
			},
			{ timeout: 1000 },
		);
		expect(screen.getByTestId("vocab-teacher-deck-deck-cl2-env")).toBeTruthy();

		// Search by class name
		fireEvent.change(screen.getByTestId("vocab-teacher-deck-search"), {
			target: { value: "IELTS 7.5" },
		});
		await waitFor(
			() => {
				expect(
					screen.getByTestId("vocab-teacher-deck-deck-cl2-env"),
				).toBeTruthy();
			},
			{ timeout: 1000 },
		);

		// Search with zero matches shows empty state and clear button
		fireEvent.change(screen.getByTestId("vocab-teacher-deck-search"), {
			target: { value: "khong-ton-tai" },
		});
		await waitFor(
			() => {
				expect(screen.getByText("Không tìm thấy bộ từ phù hợp.")).toBeTruthy();
			},
			{ timeout: 1000 },
		);
		fireEvent.click(screen.getByTestId("vocab-teacher-clear-filters"));
		expect(
			screen.getByTestId("vocab-teacher-deck-deck-indep-fresh"),
		).toBeTruthy();

		// Select two teacher decks -> verify selection summary and confirm button
		fireEvent.click(
			screen.getByTestId("vocab-teacher-deck-checkbox-deck-indep-fresh"),
		);
		fireEvent.click(
			screen.getByTestId("vocab-teacher-deck-checkbox-deck-cl2-env"),
		);
		expect(
			screen.getByTestId("vocab-library-selection-summary").textContent,
		).toContain("Đã chọn 2 bộ · 30 từ");

		const confirmBtn = screen.getByTestId(
			"vocab-library-confirm-btn",
		) as HTMLButtonElement;
		expect(confirmBtn.textContent).toBe("Thêm vào lớp");
		expect(confirmBtn.disabled).toBe(false);
		fireEvent.click(confirmBtn);

		// Refreshes snapshot and renders cloned decks in VocabDeckList
		await waitFor(() => {
			expect(screen.getByTestId("vocab-deck-row-deck-cloned-1")).toBeTruthy();
		});
		expect(screen.getByTestId("vocab-deck-row-deck-cloned-2")).toBeTruthy();

		const cloneWrite = server.writes.find(
			(w) => w.method === "POST" && w.path === "/api/kernel/vocab/decks/clone",
		);
		expect(cloneWrite?.body).toEqual({
			classId: "cl-1",
			deckIds: ["deck-indep-fresh", "deck-cl2-env"],
		});
	});

	it("supports batch selection, enforces cap limits, and clears teacher selections when switching back to library tab", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({ id: "cl-1", name: "IELTS 6.5" }),
					classRow({ id: "cl-2", name: "IELTS 7.0" }),
				],
				vocabDecks: [
					{
						id: "deck-big-1",
						classId: "cl-2",
						title: "Large Pack 1",
						lang: "en",
						wordCount: 300,
						createdAt: "2026-10-18T01:00:00.000Z",
						sourceLibraryDeckId: null,
					},
					{
						id: "deck-big-2",
						classId: "cl-2",
						title: "Large Pack 2",
						lang: "en",
						wordCount: 250,
						createdAt: "2026-10-18T02:00:00.000Z",
						sourceLibraryDeckId: null,
					},
				],
			}),
			(req) => {
				if (
					req.method === "GET" &&
					req.path === "/api/kernel/vocab-library/courses"
				) {
					return { status: 200, body: { courses: [] } };
				}
				return undefined;
			},
		);

		renderWithKernel(<VocabDeckList classId="cl-1" />);
		await waitFor(() => {
			expect(screen.getByTestId("vocab-add-from-library")).toBeTruthy();
		});

		fireEvent.click(screen.getByTestId("vocab-add-from-library"));
		fireEvent.click(screen.getByRole("tab", { name: "Bộ từ đã tạo" }));

		// Batch select picks only the first deck (301 <= 500) and shows batch cap hint
		fireEvent.click(screen.getByTestId("vocab-teacher-select-all"));
		expect(
			screen.getByTestId("vocab-library-selection-summary").textContent,
		).toContain("Đã chọn 1 bộ · 300 từ");
		expect(screen.getByTestId("vocab-library-batch-hint")).toBeTruthy();

		// Manually checking the second deck exceeds 500 statements -> cap warning & confirm disabled
		fireEvent.click(
			screen.getByTestId("vocab-teacher-deck-checkbox-deck-big-2"),
		);
		expect(screen.getByTestId("vocab-library-cap-warning")).toBeTruthy();
		expect(
			(screen.getByTestId("vocab-library-confirm-btn") as HTMLButtonElement)
				.disabled,
		).toBe(true);

		// Switching back to "Thư viện hệ thống" clears selections and notices
		fireEvent.click(screen.getByRole("tab", { name: "Thư viện hệ thống" }));
		expect(
			screen.getByTestId("vocab-library-selection-summary").textContent,
		).toContain("Đã chọn 0 bộ · 0 từ");
		expect(screen.queryByTestId("vocab-library-cap-warning")).toBeNull();
		expect(screen.queryByTestId("vocab-library-batch-hint")).toBeNull();
	});

	it("works in Hub mode (classId=null): excludes independent decks, shows 'Đã có trong hub', and dispatches classId=null", async () => {
		const initialSnapshot = snapshotFixture({
			classes: [classRow({ id: "cl-2", name: "IELTS 7.0" })],
			vocabDecks: [
				{
					id: "deck-hub-existing",
					classId: null,
					title: "Hub Own Deck",
					lang: "en",
					wordCount: 10,
					createdAt: "2026-10-18T00:00:00.000Z",
					sourceLibraryDeckId: null,
					sourceDeckId: "deck-cl2-cloned-before",
				},
				{
					id: "deck-cl2-cloned-before",
					classId: "cl-2",
					title: "Class Deck Already In Hub",
					lang: "en",
					wordCount: 14,
					createdAt: "2026-10-18T01:00:00.000Z",
					sourceLibraryDeckId: null,
					sourceDeckId: null,
				},
				{
					id: "deck-cl2-new",
					classId: "cl-2",
					title: "Class Deck To Hub",
					lang: "en",
					wordCount: 22,
					createdAt: "2026-10-18T02:00:00.000Z",
					sourceLibraryDeckId: null,
					sourceDeckId: null,
				},
			],
		});

		const server = startKernelServer(initialSnapshot, (req, srv) => {
			if (
				req.method === "GET" &&
				req.path === "/api/kernel/vocab-library/courses"
			) {
				return { status: 200, body: { courses: [] } };
			}
			if (
				req.method === "POST" &&
				req.path === "/api/kernel/vocab/decks/clone"
			) {
				const body = req.body as { classId: string | null; deckIds: string[] };
				srv.snapshot.vocabDecks.push({
					id: "deck-hub-cloned-1",
					classId: body.classId,
					title: "Class Deck To Hub",
					lang: "en",
					wordCount: 22,
					createdAt: "2026-10-19T00:00:00.000Z",
					sourceLibraryDeckId: null,
					sourceDeckId: "deck-cl2-new",
				});
				return {
					status: 201,
					body: { id: "deck-hub-cloned-1", updated: 1, duplicates: [] },
				};
			}
			return undefined;
		});

		renderWithKernel(<VocabDeckList classId={null} />);
		await waitFor(() => {
			expect(screen.getByTestId("vocab-add-from-library")).toBeTruthy();
		});

		fireEvent.click(screen.getByTestId("vocab-add-from-library"));
		fireEvent.click(screen.getByRole("tab", { name: "Bộ từ đã tạo" }));

		// Excludes independent Hub decks (classId === null), shows class decks
		expect(
			screen.queryByTestId("vocab-teacher-deck-deck-hub-existing"),
		).toBeNull();
		expect(
			screen.getByTestId("vocab-teacher-deck-deck-cl2-cloned-before"),
		).toBeTruthy();
		expect(screen.getByTestId("vocab-teacher-deck-deck-cl2-new")).toBeTruthy();

		// Duplicate chip uses Hub wording
		expect(
			screen.getByTestId("vocab-teacher-existing-chip-deck-cl2-cloned-before")
				.textContent,
		).toBe("Đã có trong hub");

		// Select class deck and confirm -> button says "Thêm bộ từ" and sends classId: null
		fireEvent.click(
			screen.getByTestId("vocab-teacher-deck-checkbox-deck-cl2-new"),
		);
		const confirmBtn = screen.getByTestId(
			"vocab-library-confirm-btn",
		) as HTMLButtonElement;
		expect(confirmBtn.textContent).toBe("Thêm bộ từ");
		fireEvent.click(confirmBtn);

		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-deck-row-deck-hub-cloned-1"),
			).toBeTruthy();
		});

		const cloneWrite = server.writes.find(
			(w) => w.method === "POST" && w.path === "/api/kernel/vocab/decks/clone",
		);
		expect(cloneWrite?.body).toEqual({
			classId: null,
			deckIds: ["deck-cl2-new"],
		});
	});

	it("renders empty candidate state when no teacher decks exist from other sources", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1", name: "IELTS 6.5" })],
				vocabDecks: [
					{
						id: "deck-only-in-cl1",
						classId: "cl-1",
						title: "Only In Current Class",
						lang: "en",
						wordCount: 5,
						createdAt: "2026-10-18T00:00:00.000Z",
						sourceLibraryDeckId: null,
					},
				],
			}),
			(req) => {
				if (
					req.method === "GET" &&
					req.path === "/api/kernel/vocab-library/courses"
				) {
					return { status: 200, body: { courses: [] } };
				}
				return undefined;
			},
		);

		renderWithKernel(<VocabDeckList classId="cl-1" />);
		await waitFor(() => {
			expect(screen.getByTestId("vocab-add-from-library")).toBeTruthy();
		});

		fireEvent.click(screen.getByTestId("vocab-add-from-library"));
		fireEvent.click(screen.getByRole("tab", { name: "Bộ từ đã tạo" }));

		expect(
			screen.getByText(/Chưa có bộ từ đã tạo nào từ lớp khác/),
		).toBeTruthy();
		expect(screen.queryByTestId("vocab-teacher-deck-search")).toBeNull();
	});
});
