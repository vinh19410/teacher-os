// @vitest-environment jsdom
import {
	normalizeVocabGroupName,
	VOCAB_ERROR_CODES,
	type VocabTeacherSuggestion,
	type VocabTeacherWord,
} from "@teacher-os/api/contracts";
import { VOCAB_SAMPLE_CSV_CONTENT } from "@teacher-os/api/lib/vocab-csv";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VocabHubRoute } from "@/routes/_auth/vocab/index";
import {
	classRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
} from "@/test/kernel-harness";
import { VocabDeckList } from "./vocab-deck-list";

describe("Teacher Vocab Hub, Suggestions & Progress (#363)", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("renders org-wide decks in hub mode ('Riêng' + 'Lớp {name}'), hides independent decks in class mode, and creates independent deck with classId=null", async () => {
		const initialSnapshot = snapshotFixture({
			classes: [classRow({ id: "cl-1", name: "IELTS 6.5" })],
			vocabDecks: [
				{
					id: "deck-class-1",
					classId: "cl-1",
					title: "Academic Verbs",
					lang: "en",
					wordCount: 15,
					createdAt: "2026-10-18T00:00:00.000Z",
					sourceLibraryDeckId: null,
				},
				{
					id: "deck-indep-1",
					classId: null,
					title: "TOEIC 600 Essential",
					lang: "en",
					wordCount: 20,
					createdAt: "2026-10-19T00:00:00.000Z",
					sourceLibraryDeckId: null,
				},
			],
			vocabSuggestions: [
				{
					id: "sug-pending-1",
					deckId: "deck-indep-1",
					studentId: "st-1",
					note: "Ôn tuần này",
					createdAt: "2026-10-19T01:00:00.000Z",
				},
			],
		});

		const server = startKernelServer(initialSnapshot, (req, srv) => {
			if (req.method === "POST" && req.path === "/api/kernel/vocab/decks") {
				const body = req.body as { classId: string | null; title: string };
				srv.snapshot.vocabDecks.push({
					id: "deck-indep-new",
					classId: body.classId,
					title: body.title,
					lang: "en",
					wordCount: 0,
					createdAt: "2026-10-19T02:00:00.000Z",
					sourceLibraryDeckId: null,
				});
				return { status: 201, body: { id: "deck-indep-new" } };
			}
			return undefined;
		});

		// 1) Class mode only shows deck-class-1, NOT deck-indep-1
		const classRender = renderWithKernel(<VocabDeckList classId="cl-1" />);
		await waitFor(() => {
			expect(screen.getByTestId("vocab-deck-row-deck-class-1")).toBeDefined();
		});
		expect(screen.queryByTestId("vocab-deck-row-deck-indep-1")).toBeNull();
		classRender.unmount();
		cleanup();

		// 2) Hub mode shows BOTH decks with accurate source badges and pending suggestion count
		renderWithKernel(<VocabHubRoute />);
		await waitFor(() => {
			expect(screen.getByTestId("vocab-deck-row-deck-indep-1")).toBeDefined();
		});
		expect(
			screen.getByTestId("vocab-deck-source-badge-deck-class-1").textContent,
		).toBe("Lớp IELTS 6.5");
		expect(
			screen.getByTestId("vocab-deck-source-badge-deck-indep-1").textContent,
		).toBe("Riêng");
		expect(
			screen.getByTestId("vocab-deck-pending-badge-deck-indep-1").textContent,
		).toBe("1 chờ");

		// 3) Create independent deck from hub sends classId: null
		fireEvent.click(screen.getByRole("button", { name: "Tạo bộ từ" }));
		const input = screen.getByLabelText("Tiêu đề bộ từ");
		fireEvent.change(input, { target: { value: "IELTS Speaking Idioms" } });
		fireEvent.click(screen.getByTestId("vocab-create-deck-submit"));

		await waitFor(() => {
			expect(screen.getByTestId("vocab-deck-row-deck-indep-new")).toBeDefined();
		});

		const createCall = server.writes.find(
			(r) => r.method === "POST" && r.path === "/api/kernel/vocab/decks",
		);
		expect(createCall?.body).toEqual({
			classId: null,
			title: "IELTS Speaking Idioms",
		});
	});

	it("fetches fresh suggestions on modal open, sends suggest-vocab-deck, revokes suggestion, and renders per-student progress tab", async () => {
		const initialSnapshot = snapshotFixture({
			students: [
				studentRow({ id: "st-1", name: "Nguyễn Minh Anh" }),
				studentRow({ id: "st-2", name: "Trần Bảo Ngọc" }),
			],
			vocabDecks: [
				{
					id: "deck-indep-1",
					classId: null,
					title: "TOEIC 600 Essential",
					lang: "en",
					wordCount: 20,
					createdAt: "2026-10-19T00:00:00.000Z",
					sourceLibraryDeckId: null,
				},
			],
		});

		let deckSuggestions: VocabTeacherSuggestion[] = [
			{
				id: "sug-existing-accepted",
				deckId: "deck-indep-1",
				studentId: "st-1",
				note: "Học kỹ nhé",
				status: "accepted",
				createdAt: "2026-10-18T10:00:00.000Z",
				respondedAt: "2026-10-18T12:00:00.000Z",
			},
		];

		const server = startKernelServer(initialSnapshot, (req) => {
			if (
				req.method === "GET" &&
				req.path === "/api/kernel/vocab/decks/deck-indep-1/suggestions"
			) {
				return {
					status: 200,
					body: { suggestions: deckSuggestions },
				};
			}
			if (
				req.method === "POST" &&
				req.path === "/api/kernel/vocab/suggestions"
			) {
				const body = req.body as {
					deckId: string;
					studentId: string;
					note: string | null;
				};
				deckSuggestions = [
					...deckSuggestions,
					{
						id: "sug-new-st2",
						deckId: body.deckId,
						studentId: body.studentId,
						note: body.note ?? "",
						status: "pending" as const,
						createdAt: "2026-10-19T03:00:00.000Z",
						respondedAt: null,
					},
				];
				return { status: 201, body: { id: "sug-new-st2" } };
			}
			if (
				req.method === "POST" &&
				req.path === "/api/kernel/vocab/suggestions/revoke"
			) {
				const body = req.body as { suggestionId: string };
				deckSuggestions = deckSuggestions.map((s) =>
					s.id === body.suggestionId
						? { ...s, status: "dismissed" as const }
						: s,
				);
				return { status: 200, body: { id: body.suggestionId } };
			}
			if (
				req.method === "GET" &&
				req.path.startsWith("/api/kernel/vocab/progress")
			) {
				return {
					status: 200,
					body: {
						studentId: "st-1",
						decks: [
							{
								deckId: "deck-indep-1",
								title: "TOEIC 600 Essential",
								classId: null,
								source: "suggested",
								total: 20,
								byLevel: [1, 4, 2, 0, 1],
								dueToday: 3,
								stateNew: 12,
								stateReview: 8,
								lastActivityAt: "2026-10-19T03:00:00.000Z",
							},
							{
								deckId: "libdeck-1",
								title: "Bài 1: Chào hỏi",
								classId: null,
								className: "1000 Từ Cơ Bản",
								source: "library",
								total: 10,
								byLevel: [2, 1, 0, 0, 0],
								dueToday: 1,
								stateNew: 7,
								stateReview: 3,
								lastActivityAt: "2026-10-19T04:00:00.000Z",
							},
						],
						activity7Days: [
							{ dateISO: "2026-10-13", sessions: 0, correct: 0 },
							{ dateISO: "2026-10-14", sessions: 0, correct: 0 },
							{ dateISO: "2026-10-15", sessions: 0, correct: 0 },
							{ dateISO: "2026-10-16", sessions: 0, correct: 0 },
							{ dateISO: "2026-10-17", sessions: 0, correct: 0 },
							{ dateISO: "2026-10-18", sessions: 3, correct: 2 },
							{ dateISO: "2026-10-19", sessions: 5, correct: 5 },
						],
					},
				};
			}
			return undefined;
		});

		renderWithKernel(<VocabHubRoute />);
		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-suggest-deck-deck-indep-1"),
			).toBeDefined();
		});

		// Open suggest modal -> fetches fresh status and displays "Đã chấp nhận"
		fireEvent.click(screen.getByTestId("vocab-suggest-deck-deck-indep-1"));
		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-suggestion-status-sug-existing-accepted")
					.textContent,
			).toBe("Đã chấp nhận");
		});

		// Suggest to st-2 with note
		fireEvent.change(screen.getByTestId("vocab-suggest-student-select"), {
			target: { value: "st-2" },
		});
		fireEvent.change(screen.getByTestId("vocab-suggest-note-input"), {
			target: { value: "Ôn trước thứ 7 nhé" },
		});
		fireEvent.click(screen.getByTestId("vocab-suggest-submit"));

		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-suggestion-status-sug-new-st2").textContent,
			).toBe("Đang chờ");
		});

		const suggestCall = server.writes.find(
			(r) => r.method === "POST" && r.path === "/api/kernel/vocab/suggestions",
		);
		expect(suggestCall?.body).toEqual({
			deckId: "deck-indep-1",
			studentId: "st-2",
			note: "Ôn trước thứ 7 nhé",
		});

		// Revoke sug-existing-accepted -> status flips to "Đã ẩn"
		fireEvent.click(
			screen.getByTestId("vocab-revoke-suggestion-sug-existing-accepted"),
		);
		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-suggestion-status-sug-existing-accepted")
					.textContent,
			).toBe("Đã ẩn");
		});

		// Close modal and switch to "Tiến độ" tab
		fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
		fireEvent.click(screen.getByRole("tab", { name: "Tiến độ" }));

		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-progress-deck-deck-indep-1"),
			).toBeDefined();
		});
		expect(
			screen.getByTestId("vocab-progress-stat-learning").textContent,
		).toContain("11");
		expect(screen.getByTestId("vocab-progress-stat-due").textContent).toContain(
			"4",
		);
		expect(
			screen.getByTestId("vocab-progress-deck-source-deck-indep-1").textContent,
		).toBe("Gợi ý");
		expect(
			screen.getByTestId("vocab-progress-deck-source-libdeck-1").textContent,
		).toBe("Khóa 1000 Từ Cơ Bản");
		expect(
			screen.getByTestId("vocab-progress-deck-deck-indep-1-level-2")
				.textContent,
		).toContain("4");
	});

	it("imports decks from sample CSV, shows validation errors for malformed CSV, and creates deck with Lesson + Topic metadata", async () => {
		const initialSnapshot = snapshotFixture({
			vocabDecks: [],
		});

		const server = startKernelServer(initialSnapshot, (req, srv) => {
			if (
				req.method === "POST" &&
				req.path === "/api/kernel/vocab/decks/import-csv"
			) {
				const body = req.body as {
					classId: string | null;
					decks: Array<{
						title: string;
						lessonNumber?: number | null;
						topic?: string | null;
						lang?: string;
						words: unknown[];
					}>;
				};
				body.decks.forEach((deck, index) => {
					srv.snapshot.vocabDecks.push({
						id: `deck-csv-${index + 1}`,
						classId: body.classId,
						title: deck.title,
						lessonNumber: deck.lessonNumber ?? null,
						topic: deck.topic ?? null,
						lang: deck.lang ?? "en",
						wordCount: deck.words.length,
						createdAt: "2026-10-20T00:00:00.000Z",
						sourceLibraryDeckId: null,
					});
				});
				const importedDeckIds = body.decks.map(
					(_, index) => `deck-csv-${index + 1}`,
				);
				const importedWords = body.decks.reduce(
					(sum, deck) => sum + deck.words.length,
					0,
				);
				return {
					status: 201,
					body: {
						id: importedDeckIds[0] ?? "deck-csv-1",
						deckIds: importedDeckIds,
						importedDecks: importedDeckIds.length,
						importedWords,
					},
				};
			}
			if (req.method === "POST" && req.path === "/api/kernel/vocab/decks") {
				const body = req.body as {
					classId: string | null;
					title: string;
					lessonNumber?: number | null;
					topic?: string | null;
				};
				srv.snapshot.vocabDecks.push({
					id: "deck-lesson-2",
					classId: body.classId,
					title: body.title,
					lessonNumber: body.lessonNumber ?? null,
					topic: body.topic ?? null,
					lang: "en",
					wordCount: 0,
					createdAt: "2026-10-20T01:00:00.000Z",
					sourceLibraryDeckId: null,
				});
				return { status: 201, body: { id: "deck-lesson-2" } };
			}
			return undefined;
		});

		renderWithKernel(<VocabHubRoute />);
		await waitFor(() => {
			expect(screen.getByTestId("vocab-import-csv-btn")).toBeDefined();
		});

		// 1) Open CSV import dialog & upload invalid CSV first
		fireEvent.click(screen.getByTestId("vocab-import-csv-btn"));
		expect(screen.getByTestId("vocab-csv-download-sample")).toBeDefined();

		const badFile = new File(
			[
				"Lesson,Topic,Type,Word / Chunk,Vietnamese\n1,Intro,InvalidType,hello,xin chào\n",
			],
			"bad.csv",
			{ type: "text/csv" },
		);
		fireEvent.change(screen.getByTestId("vocab-csv-file-input"), {
			target: { files: [badFile] },
		});

		await waitFor(() => {
			expect(screen.getByTestId("vocab-csv-errors")).toBeDefined();
		});
		expect(screen.getByTestId("vocab-csv-errors").textContent).toContain(
			"Dòng 2",
		);
		expect(
			(screen.getByTestId("vocab-csv-submit-btn") as HTMLButtonElement)
				.disabled,
		).toBe(true);

		// 2) Upload sample CSV -> preview Lesson 01 with Word + Chunk rows & submit
		const sampleFile = new File([VOCAB_SAMPLE_CSV_CONTENT], "sample.csv", {
			type: "text/csv",
		});
		fireEvent.change(screen.getByTestId("vocab-csv-file-input"), {
			target: { files: [sampleFile] },
		});

		await waitFor(() => {
			expect(screen.getByTestId("vocab-csv-preview")).toBeDefined();
		});
		expect(screen.getByTestId("vocab-csv-preview").textContent).toContain(
			"Lesson 01 – Friends & Introductions",
		);
		expect(screen.getByTestId("vocab-csv-preview").textContent).toContain(
			"16 từ · 12 cụm",
		);

		fireEvent.click(screen.getByTestId("vocab-csv-submit-btn"));
		await waitFor(() => {
			expect(screen.getByTestId("vocab-deck-row-deck-csv-1")).toBeDefined();
		});
		expect(
			screen.getByTestId("vocab-deck-lesson-meta-deck-csv-1").textContent,
		).toBe("Buổi 01 · Friends & Introductions");

		const importCall = server.writes.find(
			(r) =>
				r.method === "POST" && r.path === "/api/kernel/vocab/decks/import-csv",
		);
		expect(importCall?.body).toMatchObject({
			classId: null,
			decks: [
				{
					title: "Lesson 01 – Friends & Introductions",
					lessonNumber: 1,
					topic: "Friends & Introductions",
					lang: "en",
				},
			],
		});
		const importedBody = importCall?.body as
			| { decks: Array<{ words: Array<{ entryType: string }> }> }
			| undefined;
		const importedWords = importedBody?.decks[0]?.words;
		expect(importedWords).toHaveLength(28);
		expect(importedWords?.some((w) => w.entryType === "word")).toBe(true);
		expect(importedWords?.some((w) => w.entryType === "chunk")).toBe(true);

		// 3) Create deck with Lesson + Topic only -> auto-computes canonical title
		fireEvent.click(screen.getByRole("button", { name: "Tạo bộ từ" }));
		fireEvent.change(screen.getByLabelText("Số buổi học"), {
			target: { value: "2" },
		});
		fireEvent.change(screen.getByLabelText("Chủ đề"), {
			target: { value: "Daily Routines" },
		});
		fireEvent.click(screen.getByTestId("vocab-create-deck-submit"));

		await waitFor(() => {
			expect(screen.getByTestId("vocab-deck-row-deck-lesson-2")).toBeDefined();
		});
		const createLessonCall = server.writes.find(
			(r) => r.method === "POST" && r.path === "/api/kernel/vocab/decks",
		);
		expect(createLessonCall?.body).toEqual({
			classId: null,
			title: "Lesson 02 – Daily Routines",
			lessonNumber: 2,
			topic: "Daily Routines",
		});
	});

	it("appends CSV words inside VocabDeckEditorDialog and edits entryType, pos, example in VocabWordRow", async () => {
		const initialSnapshot = snapshotFixture({
			vocabDecks: [
				{
					id: "deck-1",
					classId: null,
					title: "Lesson 01 – Friends & Introductions",
					lessonNumber: 1,
					topic: "Friends & Introductions",
					lang: "en",
					wordCount: 1,
					createdAt: "2026-10-19T00:00:00.000Z",
					sourceLibraryDeckId: null,
				},
			],
		});

		let deckWords: VocabTeacherWord[] = [
			{
				id: "w-1",
				deckId: "deck-1",
				word: "introduce",
				entryType: "word",
				ipa: "/ˌɪntrəˈdjuːs/",
				pos: "v.",
				translation: "giới thiệu",
				example: "Can I introduce my friend Nam?",
				audioKey: null,
				audioUrl: null,
				sortOrder: 0,
			},
		];

		const server = startKernelServer(initialSnapshot, (req, srv) => {
			if (
				req.method === "GET" &&
				req.path === "/api/kernel/vocab/decks/deck-1/words"
			) {
				return { status: 200, body: { words: deckWords } };
			}
			if (
				req.method === "POST" &&
				req.path === "/api/kernel/vocab/decks/deck-1/words/import"
			) {
				const body = req.body as {
					words: Array<{
						word: string;
						entryType: "word" | "chunk";
						ipa: string | null;
						pos: string | null;
						translation: string;
						example: string | null;
					}>;
				};
				body.words.forEach((item, index) => {
					deckWords = [
						...deckWords,
						{
							id: `w-imp-${index + 1}`,
							deckId: "deck-1",
							word: item.word,
							entryType: item.entryType,
							ipa: item.ipa,
							pos: item.pos,
							translation: item.translation,
							example: item.example,
							audioKey: null,
							audioUrl: null,
							sortOrder: deckWords.length,
						},
					];
				});
				const deck = srv.snapshot.vocabDecks.find((d) => d.id === "deck-1");
				if (deck) deck.wordCount = deckWords.length;
				return {
					status: 201,
					body: {
						id: "deck-1",
						deckIds: ["deck-1"],
						importedDecks: 0,
						importedWords: body.words.length,
					},
				};
			}
			if (
				req.method === "POST" &&
				req.path === "/api/kernel/vocab/words/upsert"
			) {
				const body = req.body as {
					id?: string;
					deckId: string;
					word: string;
					entryType?: "word" | "chunk";
					ipa?: string | null;
					pos?: string | null;
					translation?: string;
					example?: string | null;
					sortOrder?: number;
				};
				if (body.id) {
					deckWords = deckWords.map((w) =>
						w.id === body.id
							? {
									...w,
									word: body.word,
									entryType: body.entryType ?? "word",
									ipa: body.ipa ?? null,
									pos: body.pos ?? null,
									translation: body.translation ?? "",
									example: body.example ?? null,
								}
							: w,
					);
					return { status: 200, body: { id: body.id } };
				}
				const newId = "w-draft-saved";
				deckWords = [
					...deckWords,
					{
						id: newId,
						deckId: body.deckId,
						word: body.word,
						entryType: body.entryType ?? "word",
						ipa: body.ipa ?? null,
						pos: body.pos ?? null,
						translation: body.translation ?? "",
						example: body.example ?? null,
						audioKey: null,
						audioUrl: null,
						sortOrder: body.sortOrder ?? deckWords.length,
					},
				];
				return { status: 201, body: { id: newId } };
			}
			return undefined;
		});

		renderWithKernel(<VocabHubRoute />);
		await waitFor(() => {
			expect(screen.getByTestId("vocab-edit-deck-deck-1")).toBeDefined();
		});

		// 1) Open VocabDeckEditorDialog
		fireEvent.click(screen.getByTestId("vocab-edit-deck-deck-1"));
		await waitFor(() => {
			expect(screen.getByTestId("vocab-word-row-w-1")).toBeDefined();
		});

		// 2) Edit entryType, pos, example in existing VocabWordRow and save
		fireEvent.change(screen.getByTestId("vocab-type-w-1"), {
			target: { value: "chunk" },
		});
		fireEvent.change(screen.getByTestId("vocab-pos-w-1"), {
			target: { value: "phr. v." },
		});
		fireEvent.change(screen.getByTestId("vocab-example-w-1"), {
			target: { value: "Let me introduce my best friend." },
		});
		fireEvent.click(screen.getByTestId("vocab-save-word-w-1"));

		await waitFor(() => {
			const upsertCall = server.writes.find(
				(r) =>
					r.method === "POST" && r.path === "/api/kernel/vocab/words/upsert",
			);
			expect(upsertCall?.body).toEqual({
				id: "w-1",
				deckId: "deck-1",
				word: "introduce",
				entryType: "chunk",
				ipa: "/ˌɪntrəˈdjuːs/",
				pos: "phr. v.",
				translation: "giới thiệu",
				example: "Let me introduce my best friend.",
				sortOrder: 0,
			});
		});

		// 3) Import CSV inside editor (append-words mode)
		fireEvent.click(screen.getByTestId("vocab-editor-import-csv-btn"));
		const appendCsv = [
			"Type,Word / Chunk,IPA,Part of speech,Vietnamese,Example",
			"Word,hometown,/ˈhəʊmtaʊn/,n.,quê nhà,My hometown is Da Nang.",
			"Chunk,make friends with sb,,,kết bạn với ai,I make friends easily.",
		].join("\n");
		const appendFile = new File([appendCsv], "append.csv", {
			type: "text/csv",
		});
		fireEvent.change(screen.getByTestId("vocab-csv-file-input"), {
			target: { files: [appendFile] },
		});

		await waitFor(() => {
			expect(screen.getByTestId("vocab-csv-preview")).toBeDefined();
		});
		expect(screen.getByTestId("vocab-csv-preview").textContent).toContain(
			"1 Word · 1 Chunk",
		);
		fireEvent.click(screen.getByTestId("vocab-csv-submit-btn"));

		await waitFor(() => {
			expect(screen.getByTestId("vocab-word-row-w-imp-1")).toBeDefined();
		});
		expect(screen.getByTestId("vocab-word-row-w-imp-2")).toBeDefined();
		const appendCall = server.writes.find(
			(r) =>
				r.method === "POST" &&
				r.path === "/api/kernel/vocab/decks/deck-1/words/import",
		);
		expect(appendCall?.body).toEqual({
			words: [
				{
					word: "hometown",
					entryType: "word",
					ipa: "/ˈhəʊmtaʊn/",
					pos: "n.",
					translation: "quê nhà",
					example: "My hometown is Da Nang.",
				},
				{
					word: "make friends with sb",
					entryType: "chunk",
					ipa: null,
					pos: null,
					translation: "kết bạn với ai",
					example: "I make friends easily.",
				},
			],
		});
	});

	it("allows editing title, lessonNumber, and topic on an existing deck via rename-vocab-deck", async () => {
		const initialSnapshot = snapshotFixture({
			vocabDecks: [
				{
					id: "deck-edit-1",
					classId: null,
					title: "Old Title",
					lessonNumber: null,
					topic: null,
					lang: "en",
					wordCount: 5,
					createdAt: "2026-10-20T00:00:00.000Z",
					sourceLibraryDeckId: null,
				},
			],
		});

		const server = startKernelServer(initialSnapshot, (req, srv) => {
			if (
				req.method === "POST" &&
				req.path === "/api/kernel/vocab/decks/rename"
			) {
				const body = req.body as {
					deckId: string;
					title: string;
					lessonNumber?: number | null;
					topic?: string | null;
				};
				const target = srv.snapshot.vocabDecks.find(
					(d) => d.id === body.deckId,
				);
				if (!target) return { status: 404, body: { error: "not found" } };
				target.title = body.title;
				target.lessonNumber = body.lessonNumber ?? null;
				target.topic = body.topic ?? null;
				return { status: 200, body: { id: target.id } };
			}
			return undefined;
		});

		renderWithKernel(<VocabHubRoute />);
		await waitFor(() => {
			expect(screen.getByTestId("vocab-rename-deck-deck-edit-1")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("vocab-rename-deck-deck-edit-1"));
		fireEvent.change(screen.getByLabelText("Số buổi học"), {
			target: { value: "2" },
		});
		fireEvent.change(screen.getByLabelText("Chủ đề"), {
			target: { value: "Daily Life" },
		});
		fireEvent.change(screen.getByLabelText("Tiêu đề bộ từ"), {
			target: { value: "Lesson 02 – Daily Life" },
		});
		fireEvent.click(screen.getByTestId("vocab-rename-deck-submit"));

		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-deck-lesson-meta-deck-edit-1").textContent,
			).toBe("Buổi 02 · Daily Life");
		});
		expect(
			screen.getByTestId("vocab-deck-row-deck-edit-1").textContent,
		).toContain("Lesson 02 – Daily Life");

		const renameCall = server.writes.find(
			(r) => r.method === "POST" && r.path === "/api/kernel/vocab/decks/rename",
		);
		expect(renameCall?.body).toEqual({
			deckId: "deck-edit-1",
			title: "Lesson 02 – Daily Life",
			lessonNumber: 2,
			topic: "Daily Life",
		});
	});

	it("manages vocab groups (create, duplicate error, rename, delete preserving decks) via VocabGroupManagerModal", async () => {
		const initialSnapshot = snapshotFixture({
			vocabGroups: [],
			vocabDecks: [
				{
					id: "deck-g-1",
					classId: null,
					groupId: null,
					title: "Foundation Lesson 1",
					lang: "en",
					wordCount: 10,
					createdAt: "2026-10-20T00:00:00.000Z",
					sourceLibraryDeckId: null,
				},
			],
		});

		let groupSeq = 0;
		const server = startKernelServer(initialSnapshot, (req, srv) => {
			if (req.method === "POST" && req.path === "/api/kernel/vocab/groups") {
				const body = req.body as { name: string };
				const norm = normalizeVocabGroupName(body.name);
				const groups = srv.snapshot.vocabGroups ?? [];
				if (groups.some((g) => normalizeVocabGroupName(g.name) === norm)) {
					return {
						status: 409,
						body: {
							error: "group name already exists",
							code: VOCAB_ERROR_CODES.GROUP_NAME_EXISTS,
						},
					};
				}
				groupSeq += 1;
				const id = `grp-${groupSeq}`;
				groups.push({
					id,
					name: body.name.trim(),
					createdAt: "2026-10-20T00:00:00.000Z",
					updatedAt: "2026-10-20T00:00:00.000Z",
				});
				srv.snapshot.vocabGroups = groups;
				// Attach existing deck to the first created group to verify delete clears groupId
				if (groupSeq === 1 && srv.snapshot.vocabDecks[0]) {
					srv.snapshot.vocabDecks[0].groupId = id;
				}
				return { status: 201, body: { id } };
			}
			if (
				req.method === "POST" &&
				req.path === "/api/kernel/vocab/groups/rename"
			) {
				const body = req.body as { groupId: string; name: string };
				const norm = normalizeVocabGroupName(body.name);
				const groups = srv.snapshot.vocabGroups ?? [];
				if (
					groups.some(
						(g) =>
							g.id !== body.groupId && normalizeVocabGroupName(g.name) === norm,
					)
				) {
					return {
						status: 409,
						body: {
							error: "group name already exists",
							code: VOCAB_ERROR_CODES.GROUP_NAME_EXISTS,
						},
					};
				}
				const target = groups.find((g) => g.id === body.groupId);
				if (!target) return { status: 404, body: { error: "not found" } };
				target.name = body.name.trim();
				return { status: 200, body: { id: target.id } };
			}
			if (
				req.method === "POST" &&
				req.path === "/api/kernel/vocab/groups/delete"
			) {
				const body = req.body as { groupId: string };
				srv.snapshot.vocabGroups = (srv.snapshot.vocabGroups ?? []).filter(
					(g) => g.id !== body.groupId,
				);
				for (const deck of srv.snapshot.vocabDecks) {
					if (deck.groupId === body.groupId) {
						deck.groupId = null;
					}
				}
				return { status: 200, body: { id: body.groupId } };
			}
			return undefined;
		});

		renderWithKernel(<VocabHubRoute />);
		await waitFor(() => {
			expect(screen.getByTestId("vocab-manage-groups-btn")).toBeDefined();
		});

		// 1) Open manager modal -> empty state
		fireEvent.click(screen.getByTestId("vocab-manage-groups-btn"));
		expect(screen.getByTestId("vocab-group-list").textContent).toContain(
			"Chưa có nhóm nào",
		);

		// 2) Create first group
		fireEvent.change(screen.getByTestId("vocab-group-create-input"), {
			target: { value: "IELTS Foundation" },
		});
		fireEvent.click(screen.getByTestId("vocab-group-create-submit"));

		await waitFor(() => {
			expect(screen.getByTestId("vocab-group-row-grp-1")).toBeDefined();
		});
		expect(screen.getByTestId("vocab-group-row-grp-1").textContent).toContain(
			"1 bộ từ",
		);

		// 3) Duplicate group name -> inline 409 error
		fireEvent.change(screen.getByTestId("vocab-group-create-input"), {
			target: { value: "ielts foundation" },
		});
		fireEvent.click(screen.getByTestId("vocab-group-create-submit"));

		await waitFor(() => {
			expect(screen.getByTestId("vocab-group-create-error").textContent).toBe(
				"Tên nhóm đã tồn tại.",
			);
		});

		// 4) Create second group, test duplicate rename error, then valid rename
		fireEvent.change(screen.getByTestId("vocab-group-create-input"), {
			target: { value: "Giao tiếp" },
		});
		fireEvent.click(screen.getByTestId("vocab-group-create-submit"));
		await waitFor(() => {
			expect(screen.getByTestId("vocab-group-row-grp-2")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("vocab-group-rename-btn-grp-2"));
		fireEvent.change(screen.getByTestId("vocab-group-rename-input-grp-2"), {
			target: { value: "IELTS Foundation" },
		});
		fireEvent.click(screen.getByTestId("vocab-group-rename-submit-grp-2"));
		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-group-rename-error-grp-2").textContent,
			).toBe("Tên nhóm đã tồn tại.");
		});

		fireEvent.change(screen.getByTestId("vocab-group-rename-input-grp-2"), {
			target: { value: "Giao tiếp cơ bản" },
		});
		fireEvent.click(screen.getByTestId("vocab-group-rename-submit-grp-2"));
		await waitFor(() => {
			expect(screen.getByTestId("vocab-group-row-grp-2").textContent).toContain(
				"Giao tiếp cơ bản",
			);
		});

		// 5) Delete grp-1 -> shows affected deck warning, removes group, preserves deck without badge
		fireEvent.click(screen.getByTestId("vocab-group-delete-btn-grp-1"));
		expect(
			screen.getByTestId("vocab-group-delete-panel-grp-1").textContent,
		).toContain(
			"1 bộ từ trong nhóm sẽ được giữ nguyên và chuyển về Chưa phân nhóm.",
		);
		fireEvent.click(screen.getByTestId("vocab-group-delete-confirm-grp-1"));

		await waitFor(() => {
			expect(screen.queryByTestId("vocab-group-row-grp-1")).toBeNull();
		});
		// Deck still exists without group badge
		expect(screen.getByTestId("vocab-deck-row-deck-g-1")).toBeDefined();
		expect(screen.queryByTestId("vocab-deck-group-badge-deck-g-1")).toBeNull();

		const deleteCall = server.writes.find(
			(r) =>
				r.method === "POST" && r.path === "/api/kernel/vocab/groups/delete",
		);
		expect(deleteCall?.body).toEqual({ groupId: "grp-1" });
	});

	it("quick-creates a group inline inside Create Deck modal, auto-selects it, and sends groupId on deck creation", async () => {
		const initialSnapshot = snapshotFixture({
			vocabGroups: [
				{
					id: "grp-existing",
					name: "IELTS 6.5",
					createdAt: "2026-10-19T00:00:00.000Z",
					updatedAt: "2026-10-19T00:00:00.000Z",
				},
			],
			vocabDecks: [],
		});

		const server = startKernelServer(initialSnapshot, (req, srv) => {
			if (req.method === "POST" && req.path === "/api/kernel/vocab/groups") {
				const body = req.body as { name: string };
				const groups = srv.snapshot.vocabGroups ?? [];
				if (
					groups.some(
						(g) =>
							normalizeVocabGroupName(g.name) ===
							normalizeVocabGroupName(body.name),
					)
				) {
					return {
						status: 409,
						body: {
							error: "group name already exists",
							code: VOCAB_ERROR_CODES.GROUP_NAME_EXISTS,
						},
					};
				}
				const created = {
					id: "grp-quick-1",
					name: body.name.trim(),
					createdAt: "2026-10-20T00:00:00.000Z",
					updatedAt: "2026-10-20T00:00:00.000Z",
				};
				groups.push(created);
				srv.snapshot.vocabGroups = groups;
				return { status: 201, body: { id: created.id } };
			}
			if (req.method === "POST" && req.path === "/api/kernel/vocab/decks") {
				const body = req.body as {
					classId: string | null;
					title: string;
					groupId?: string | null;
				};
				srv.snapshot.vocabDecks.push({
					id: "deck-grouped-new",
					classId: body.classId,
					groupId: body.groupId ?? null,
					title: body.title,
					lang: "en",
					wordCount: 0,
					createdAt: "2026-10-20T01:00:00.000Z",
					sourceLibraryDeckId: null,
				});
				return { status: 201, body: { id: "deck-grouped-new" } };
			}
			return undefined;
		});

		renderWithKernel(<VocabHubRoute />);
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Tạo bộ từ" })).toBeDefined();
		});

		fireEvent.click(screen.getByRole("button", { name: "Tạo bộ từ" }));

		// Open inline quick-create and test duplicate error
		fireEvent.click(
			screen.getByTestId("vocab-create-deck-group-quick-create-toggle"),
		);
		fireEvent.change(
			screen.getByTestId("vocab-create-deck-group-quick-create-input"),
			{ target: { value: "ielts 6.5" } },
		);
		fireEvent.click(
			screen.getByTestId("vocab-create-deck-group-quick-create-submit"),
		);
		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-create-deck-group-quick-create-error")
					.textContent,
			).toBe("Tên nhóm đã tồn tại.");
		});

		// Escape cancels inline quick-create without closing parent Create Deck modal
		fireEvent.keyDown(
			screen.getByTestId("vocab-create-deck-group-quick-create-input"),
			{ key: "Escape" },
		);
		expect(
			screen.queryByTestId("vocab-create-deck-group-quick-create-input"),
		).toBeNull();
		expect(screen.getByTestId("vocab-create-deck-submit")).toBeDefined();

		// Re-open inline quick-create, create new group -> auto-selected
		fireEvent.click(
			screen.getByTestId("vocab-create-deck-group-quick-create-toggle"),
		);
		fireEvent.change(
			screen.getByTestId("vocab-create-deck-group-quick-create-input"),
			{ target: { value: "TOEIC 750" } },
		);
		fireEvent.keyDown(
			screen.getByTestId("vocab-create-deck-group-quick-create-input"),
			{ key: "Enter" },
		);

		await waitFor(() => {
			expect(
				(screen.getByTestId("vocab-create-deck-group") as HTMLSelectElement)
					.value,
			).toBe("grp-quick-1");
		});

		// Create deck with the newly selected group
		fireEvent.change(screen.getByLabelText("Tiêu đề bộ từ"), {
			target: { value: "Lesson 01 – Office" },
		});
		fireEvent.click(screen.getByTestId("vocab-create-deck-submit"));

		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-deck-group-badge-deck-grouped-new")
					.textContent,
			).toBe("TOEIC 750");
		});

		const createDeckCall = server.writes.find(
			(r) => r.method === "POST" && r.path === "/api/kernel/vocab/decks",
		);
		expect(createDeckCall?.body).toEqual({
			classId: null,
			title: "Lesson 01 – Office",
			groupId: "grp-quick-1",
		});
	});

	it("assigns, changes, and clears a deck's group via Edit Deck modal", async () => {
		const initialSnapshot = snapshotFixture({
			vocabGroups: [
				{
					id: "grp-1",
					name: "IELTS 6.5",
					createdAt: "2026-10-19T00:00:00.000Z",
					updatedAt: "2026-10-19T00:00:00.000Z",
				},
				{
					id: "grp-2",
					name: "Giao tiếp",
					createdAt: "2026-10-19T00:00:00.000Z",
					updatedAt: "2026-10-19T00:00:00.000Z",
				},
			],
			vocabDecks: [
				{
					id: "deck-edit-grp",
					classId: null,
					groupId: null,
					title: "Core Verbs",
					lessonNumber: null,
					topic: null,
					lang: "en",
					wordCount: 12,
					createdAt: "2026-10-20T00:00:00.000Z",
					sourceLibraryDeckId: null,
				},
			],
		});

		const server = startKernelServer(initialSnapshot, (req, srv) => {
			if (
				req.method === "POST" &&
				req.path === "/api/kernel/vocab/decks/rename"
			) {
				const body = req.body as {
					deckId: string;
					title: string;
					groupId?: string | null;
					lessonNumber?: number | null;
					topic?: string | null;
				};
				const target = srv.snapshot.vocabDecks.find(
					(d) => d.id === body.deckId,
				);
				if (!target) return { status: 404, body: { error: "not found" } };
				target.title = body.title;
				target.lessonNumber = body.lessonNumber ?? null;
				target.topic = body.topic ?? null;
				if (body.groupId !== undefined) {
					target.groupId = body.groupId;
				}
				return { status: 200, body: { id: target.id } };
			}
			return undefined;
		});

		renderWithKernel(<VocabHubRoute />);
		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-rename-deck-deck-edit-grp"),
			).toBeDefined();
		});
		expect(
			screen.queryByTestId("vocab-deck-group-badge-deck-edit-grp"),
		).toBeNull();

		// 1) Assign grp-1
		fireEvent.click(screen.getByTestId("vocab-rename-deck-deck-edit-grp"));
		fireEvent.change(screen.getByTestId("vocab-edit-deck-group"), {
			target: { value: "grp-1" },
		});
		fireEvent.click(screen.getByTestId("vocab-rename-deck-submit"));

		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-deck-group-badge-deck-edit-grp").textContent,
			).toBe("IELTS 6.5");
		});

		// 2) Change grp-1 -> grp-2
		fireEvent.click(screen.getByTestId("vocab-rename-deck-deck-edit-grp"));
		expect(
			(screen.getByTestId("vocab-edit-deck-group") as HTMLSelectElement).value,
		).toBe("grp-1");
		fireEvent.change(screen.getByTestId("vocab-edit-deck-group"), {
			target: { value: "grp-2" },
		});
		fireEvent.click(screen.getByTestId("vocab-rename-deck-submit"));

		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-deck-group-badge-deck-edit-grp").textContent,
			).toBe("Giao tiếp");
		});

		// 3) Clear group -> null
		fireEvent.click(screen.getByTestId("vocab-rename-deck-deck-edit-grp"));
		fireEvent.change(screen.getByTestId("vocab-edit-deck-group"), {
			target: { value: "" },
		});
		fireEvent.click(screen.getByTestId("vocab-rename-deck-submit"));

		await waitFor(() => {
			expect(
				screen.queryByTestId("vocab-deck-group-badge-deck-edit-grp"),
			).toBeNull();
		});

		const renameCalls = server.writes.filter(
			(r) => r.method === "POST" && r.path === "/api/kernel/vocab/decks/rename",
		);
		expect(
			renameCalls.map((c) => (c.body as { groupId?: string | null }).groupId),
		).toEqual(["grp-1", "grp-2", null]);
	});

	it("renders group badges and filters decks by group, ungrouped, and empty group in both hub and class mode", async () => {
		const initialSnapshot = snapshotFixture({
			classes: [classRow({ id: "cl-1", name: "IELTS 6.5" })],
			vocabGroups: [
				{
					id: "grp-ielts",
					name: "IELTS Foundation",
					createdAt: "2026-10-19T00:00:00.000Z",
					updatedAt: "2026-10-19T00:00:00.000Z",
				},
				{
					id: "grp-empty",
					name: "TOEIC 800",
					createdAt: "2026-10-19T00:00:00.000Z",
					updatedAt: "2026-10-19T00:00:00.000Z",
				},
			],
			vocabDecks: [
				{
					id: "deck-hub-grouped",
					classId: null,
					groupId: "grp-ielts",
					title: "Hub Grouped Deck",
					lang: "en",
					wordCount: 10,
					createdAt: "2026-10-20T00:00:00.000Z",
					sourceLibraryDeckId: null,
				},
				{
					id: "deck-hub-ungrouped",
					classId: null,
					groupId: null,
					title: "Hub Ungrouped Deck",
					lang: "en",
					wordCount: 8,
					createdAt: "2026-10-20T01:00:00.000Z",
					sourceLibraryDeckId: null,
				},
				{
					id: "deck-class-grouped",
					classId: "cl-1",
					groupId: "grp-ielts",
					title: "Class Grouped Deck",
					lang: "en",
					wordCount: 15,
					createdAt: "2026-10-20T02:00:00.000Z",
					sourceLibraryDeckId: null,
				},
			],
		});

		startKernelServer(initialSnapshot);

		// 1) Hub mode
		const hubRender = renderWithKernel(<VocabHubRoute />);
		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-deck-row-deck-hub-grouped"),
			).toBeDefined();
		});

		expect(
			screen.getByTestId("vocab-deck-group-badge-deck-hub-grouped").textContent,
		).toBe("IELTS Foundation");
		expect(
			screen.getByTestId("vocab-deck-group-badge-deck-class-grouped")
				.textContent,
		).toBe("IELTS Foundation");
		expect(
			screen.queryByTestId("vocab-deck-group-badge-deck-hub-ungrouped"),
		).toBeNull();

		// Filter by grp-ielts
		fireEvent.change(screen.getByTestId("vocab-deck-group-filter"), {
			target: { value: "grp-ielts" },
		});
		expect(screen.getByTestId("vocab-deck-row-deck-hub-grouped")).toBeDefined();
		expect(
			screen.getByTestId("vocab-deck-row-deck-class-grouped"),
		).toBeDefined();
		expect(
			screen.queryByTestId("vocab-deck-row-deck-hub-ungrouped"),
		).toBeNull();
		expect(
			screen.getByTestId("vocab-deck-group-filter-count").textContent,
		).toContain("2 / 3");

		// Filter by ungrouped
		fireEvent.change(screen.getByTestId("vocab-deck-group-filter"), {
			target: { value: "ungrouped" },
		});
		expect(
			screen.getByTestId("vocab-deck-row-deck-hub-ungrouped"),
		).toBeDefined();
		expect(screen.queryByTestId("vocab-deck-row-deck-hub-grouped")).toBeNull();

		// Filter by empty group -> empty state + clear button restores all
		fireEvent.change(screen.getByTestId("vocab-deck-group-filter"), {
			target: { value: "grp-empty" },
		});
		expect(
			screen.getByTestId("vocab-deck-group-filter-empty").textContent,
		).toContain("Không có bộ từ nào trong nhóm đã chọn.");
		fireEvent.click(screen.getByTestId("vocab-deck-group-filter-clear"));
		expect(screen.getByTestId("vocab-deck-row-deck-hub-grouped")).toBeDefined();
		expect(
			screen.getByTestId("vocab-deck-row-deck-hub-ungrouped"),
		).toBeDefined();
		expect(
			screen.getByTestId("vocab-deck-row-deck-class-grouped"),
		).toBeDefined();

		hubRender.unmount();
		cleanup();

		// 2) Class mode shows class decks only with group badge and filter
		renderWithKernel(<VocabDeckList classId="cl-1" />);
		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-deck-row-deck-class-grouped"),
			).toBeDefined();
		});
		expect(screen.queryByTestId("vocab-deck-row-deck-hub-grouped")).toBeNull();
		expect(
			screen.getByTestId("vocab-deck-group-badge-deck-class-grouped")
				.textContent,
		).toBe("IELTS Foundation");
		fireEvent.change(screen.getByTestId("vocab-deck-group-filter"), {
			target: { value: "grp-empty" },
		});
		expect(screen.getByTestId("vocab-deck-group-filter-empty")).toBeDefined();
		fireEvent.click(screen.getByTestId("vocab-deck-group-filter-clear"));
		expect(
			screen.getByTestId("vocab-deck-row-deck-class-grouped"),
		).toBeDefined();
	});

	it("imports CSV decks with a selected or quick-created groupId in create-decks mode", async () => {
		const initialSnapshot = snapshotFixture({
			vocabGroups: [],
			vocabDecks: [],
		});

		const server = startKernelServer(initialSnapshot, (req, srv) => {
			if (req.method === "POST" && req.path === "/api/kernel/vocab/groups") {
				const body = req.body as { name: string };
				const created = {
					id: "grp-csv-1",
					name: body.name.trim(),
					createdAt: "2026-10-20T00:00:00.000Z",
					updatedAt: "2026-10-20T00:00:00.000Z",
				};
				srv.snapshot.vocabGroups = [
					...(srv.snapshot.vocabGroups ?? []),
					created,
				];
				return { status: 201, body: { id: created.id } };
			}
			if (
				req.method === "POST" &&
				req.path === "/api/kernel/vocab/decks/import-csv"
			) {
				const body = req.body as {
					classId: string | null;
					groupId?: string | null;
					decks: Array<{
						title: string;
						lessonNumber?: number | null;
						topic?: string | null;
						lang?: string;
						words: unknown[];
					}>;
				};
				body.decks.forEach((deck, index) => {
					srv.snapshot.vocabDecks.push({
						id: `deck-csv-grp-${index + 1}`,
						classId: body.classId,
						groupId: body.groupId ?? null,
						title: deck.title,
						lessonNumber: deck.lessonNumber ?? null,
						topic: deck.topic ?? null,
						lang: deck.lang ?? "en",
						wordCount: deck.words.length,
						createdAt: "2026-10-20T00:00:00.000Z",
						sourceLibraryDeckId: null,
					});
				});
				return {
					status: 201,
					body: {
						id: "deck-csv-grp-1",
						deckIds: ["deck-csv-grp-1"],
						importedDecks: body.decks.length,
						importedWords: body.decks.reduce((s, d) => s + d.words.length, 0),
					},
				};
			}
			return undefined;
		});

		renderWithKernel(<VocabHubRoute />);
		await waitFor(() => {
			expect(screen.getByTestId("vocab-import-csv-btn")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("vocab-import-csv-btn"));

		// Quick-create group inside CSV import dialog
		fireEvent.click(
			screen.getByTestId("vocab-csv-group-select-quick-create-toggle"),
		);
		fireEvent.change(
			screen.getByTestId("vocab-csv-group-select-quick-create-input"),
			{ target: { value: "IELTS Foundation" } },
		);
		fireEvent.click(
			screen.getByTestId("vocab-csv-group-select-quick-create-submit"),
		);

		await waitFor(() => {
			expect(
				(screen.getByTestId("vocab-csv-group-select") as HTMLSelectElement)
					.value,
			).toBe("grp-csv-1");
		});

		const sampleFile = new File([VOCAB_SAMPLE_CSV_CONTENT], "sample.csv", {
			type: "text/csv",
		});
		fireEvent.change(screen.getByTestId("vocab-csv-file-input"), {
			target: { files: [sampleFile] },
		});

		await waitFor(() => {
			expect(screen.getByTestId("vocab-csv-preview")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("vocab-csv-submit-btn"));

		await waitFor(() => {
			expect(
				screen.getByTestId("vocab-deck-group-badge-deck-csv-grp-1").textContent,
			).toBe("IELTS Foundation");
		});

		const importCall = server.writes.find(
			(r) =>
				r.method === "POST" && r.path === "/api/kernel/vocab/decks/import-csv",
		);
		expect(importCall?.body).toMatchObject({
			classId: null,
			groupId: "grp-csv-1",
		});
	});
});
