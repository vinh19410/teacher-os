// @vitest-environment jsdom
import type { VocabTeacherSuggestion } from "@teacher-os/api/contracts";
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
		).toContain("8");
		expect(screen.getByTestId("vocab-progress-stat-due").textContent).toContain(
			"3",
		);
		expect(
			screen.getByTestId("vocab-progress-deck-deck-indep-1-level-2")
				.textContent,
		).toContain("4");
	});
});
