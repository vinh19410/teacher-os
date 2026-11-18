// @vitest-environment jsdom
import type {
	VocabTeacherSuggestion,
	VocabTeacherWord,
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
				return {
					status: 201,
					body: { id: "deck-csv-1", updated: body.decks.length },
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
				return { status: 201, body: { updated: body.words.length } };
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
});
