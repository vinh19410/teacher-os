// @vitest-environment jsdom

import type {
	KernelAssignmentPromptRow,
	KernelAssignmentRow,
	KernelClassAssignmentRow,
} from "@teacher-os/api/contracts";
import type {
	PlacementPublishedBand,
	PlacementSubmissionDetail,
} from "@teacher-os/api/placement-test-contracts";
import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	classRow,
	enrollmentRow,
	type KernelServer,
	RouteErrorBoundary,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
} from "@/test/kernel-harness";
import { resetRouterState, routerState } from "@/test/router-mock";

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

import { Route } from "./$studentId";

const StudentDetail = (Route as unknown as { component: () => React.ReactNode })
	.component;

const BAND: PlacementPublishedBand = {
	min: 0,
	max: 100,
	cefr: "B1",
	course: "comm-2",
	courseLabel: "Giao tiếp 2",
	displayCourse: "Giao tiếp 2",
	advice: "Lộ trình B1",
};

function makeStudentSubmission(
	overrides: Partial<PlacementSubmissionDetail> = {},
): PlacementSubmissionDetail {
	return {
		id: "sub-st-1",
		leadId: null,
		studentId: "st-1",
		studentName: "Học viên Một",
		studentPhone: "0901000001",
		testVersion: 3,
		status: "pending_grading",
		submittedAt: "2026-11-16T08:00:00.000Z",
		snapshot: {
			version: 3,
			bands: [BAND],
			parts: [
				{ id: "listening", title: "Listening", clips: [] },
				{ id: "vocab-grammar", title: "G&V", questions: [] },
				{ id: "reading", title: "Reading", passages: [] },
				{
					id: "writing",
					title: "Writing",
					promptTitle: "Email",
					promptBody: "Write an email",
					minWords: 50,
					maxWords: 80,
				},
				{ id: "speaking", title: "Speaking", tasks: [] },
			],
		},
		answers: { listening: {}, vocabGrammar: {}, reading: {} },
		objective: {
			listening: { correct: 8, total: 10, pct: 80 },
			vocabGrammar: { correct: 7, total: 10, pct: 70 },
			reading: { correct: 6, total: 10, pct: 60 },
			totalCorrect: 21,
			totalQuestions: 30,
			averagePct: 70,
			byLevel: [],
			items: [],
			provisionalBand: BAND,
			provisionalSummary: "Tạm tính B1 (70%)",
		},
		writingText: "Hello teacher, this is my placement essay.",
		writingWordCount: 7,
		speakingStatus: "skipped",
		speakingMediaUrl: null,
		speakingMediaMime: null,
		speakingMediaSize: null,
		speakingDurationSec: null,
		writingRubric: null,
		writingScore: null,
		writingCriterionComments: null,
		speakingRubric: null,
		speakingScore: null,
		speakingCriterionComments: null,
		teacherFeedback: "",
		finalBandLevel: null,
		finalCourseId: null,
		finalCourse: null,
		finalDisplayCourse: null,
		finalScorePct: null,
		finalNote: "",
		gradedAt: null,
		zaloText: "",
		aiStatus: "none",
		aiErrorCode: null,
		aiDraftedAt: null,
		aiWriting: null,
		aiSpeaking: null,
		speakingTranscript: "",
		writingErrors: null,
		speakingErrors: null,
		resultUrl: null,
		resultEmailStatus: null,
		...overrides,
	};
}

function notFoundPlacementHandler(req: { path: string; method: string }) {
	if (req.method === "GET" && req.path.endsWith("/placement-submission")) {
		return { status: 404, body: { error: "PLACEMENT_SUBMISSION_NOT_FOUND" } };
	}
	return undefined;
}

beforeEach(() => {
	resetRouterState();
	toastMock.success.mockReset();
	toastMock.error.mockReset();
	startKernelServer(
		snapshotFixture({
			classes: [classRow({ id: "cl-1", name: "IELTS Writing" })],
			students: [
				studentRow({ id: "st-1", name: "Học viên Một", phone: "0901000001" }),
				studentRow({ id: "st-2", name: "Học viên Hai", phone: "0902000002" }),
			],
			enrollments: [enrollmentRow({ classId: "cl-1", studentId: "st-1" })],
		}),
		notFoundPlacementHandler,
	);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("student detail", () => {
	it("shows the student named in the URL, not another one", async () => {
		routerState.params = { studentId: "st-2" };
		renderWithKernel(<StudentDetail />);
		expect(
			await screen.findByRole("heading", { level: 1, name: "Học viên Hai" }),
		).toBeTruthy();
		expect(screen.getByText(/0902000002/)).toBeTruthy();
		expect(screen.queryByText("Học viên Một")).toBeNull();
	});

	it("treats an unknown student id as not found", async () => {
		routerState.params = { studentId: "st-missing" };
		vi.spyOn(console, "error").mockImplementation(() => {});
		renderWithKernel(
			<RouteErrorBoundary>
				<StudentDetail />
			</RouteErrorBoundary>,
		);
		expect((await screen.findByTestId("route-error")).textContent).toBe(
			"not-found",
		);
	});

	it("renders 'Chưa đặt mục tiêu' when student has no targetBand or skills", async () => {
		routerState.params = { studentId: "st-1" };
		renderWithKernel(<StudentDetail />);
		expect(
			await screen.findByRole("heading", { level: 1, name: "Học viên Một" }),
		).toBeTruthy();
		expect(screen.getByText("Chưa đặt mục tiêu")).toBeTruthy();
		expect(screen.queryByText(/Band —/)).toBeNull();
		expect(screen.queryByText(/\(\)/)).toBeNull();
	});

	it("renders Tạm dừng badge next to paused enrolled classes (#694)", async () => {
		vi.unstubAllGlobals();
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({ id: "cl-1", name: "IELTS Writing", status: "active" }),
					classRow({ id: "cl-2", name: "Lớp Tạm Dừng", status: "paused" }),
				],
				students: [
					studentRow({ id: "st-1", name: "Học viên Một", phone: "0901000001" }),
				],
				enrollments: [
					enrollmentRow({ id: "en-1", classId: "cl-1", studentId: "st-1" }),
					enrollmentRow({ id: "en-2", classId: "cl-2", studentId: "st-1" }),
				],
			}),
			notFoundPlacementHandler,
		);
		routerState.params = { studentId: "st-1" };
		renderWithKernel(<StudentDetail />);
		expect(await screen.findByText("Lớp Tạm Dừng")).toBeTruthy();
		const pausedClassRow = screen
			.getByText("Lớp Tạm Dừng")
			.closest("div") as HTMLElement;
		expect(within(pausedClassRow).getByText("Tạm dừng")).toBeTruthy();
		const activeClassRow = screen
			.getByText("IELTS Writing")
			.closest("div") as HTMLElement;
		expect(within(activeClassRow).queryByText("Tạm dừng")).toBeNull();
	});

	it("renders empty state cleanly when /api/students/:id/placement-submission returns 404", async () => {
		routerState.params = { studentId: "st-1" };
		renderWithKernel(<StudentDetail />);
		const section = await screen.findByTestId("student-placement-section");
		expect(within(section).getByText("Bài kiểm tra đầu vào")).toBeTruthy();
		expect(
			await within(section).findByText(
				"Học viên chưa nộp bài kiểm tra đầu vào.",
			),
		).toBeTruthy();
		expect(screen.queryByTestId("placement-submission-panel")).toBeNull();
	});

	it("renders PlacementSubmissionPanel for pending submission, submits PATCH grade, and refreshes student entryScore", async () => {
		vi.unstubAllGlobals();
		let submission = makeStudentSubmission();
		const server: KernelServer = startKernelServer(
			snapshotFixture({
				students: [
					studentRow({
						id: "st-1",
						name: "Học viên Một",
						phone: "0901000001",
						entryScore: "",
					}),
				],
			}),
			(req, srv) => {
				if (
					req.method === "GET" &&
					req.path === "/api/courses?activeOnly=true"
				) {
					return {
						status: 200,
						body: {
							categories: [
								{
									id: "cat-ielts",
									name: "IELTS",
									sortOrder: 0,
									isActive: true,
									createdAt: "2026-11-01T00:00:00.000Z",
									updatedAt: "2026-11-01T00:00:00.000Z",
									courses: [
										{
											id: "course-ielts-1",
											categoryId: "cat-ielts",
											name: "Foundation",
											sortOrder: 0,
											isActive: true,
											createdAt: "2026-11-01T00:00:00.000Z",
											updatedAt: "2026-11-01T00:00:00.000Z",
										},
									],
								},
							],
						},
					};
				}
				if (
					req.method === "GET" &&
					req.path === "/api/students/st-1/placement-submission"
				) {
					return { status: 200, body: submission };
				}
				if (
					req.method === "PATCH" &&
					req.path === "/api/students/st-1/placement-submission"
				) {
					const body = req.body as {
						writingRubric: {
							task: number;
							coherence: number;
							lexical: number;
							grammar: number;
						};
						writingScore: number;
						speakingRubric: {
							fluency: number;
							lexical: number;
							grammar: number;
							pronunciation: number;
						} | null;
						speakingScore: number | null;
						teacherFeedback: string;
					};
					submission = makeStudentSubmission({
						status: "graded",
						gradedAt: "2026-11-17T05:00:00.000Z",
						writingRubric: body.writingRubric,
						writingScore: body.writingScore,
						speakingRubric: body.speakingRubric,
						speakingScore: body.speakingScore,
						teacherFeedback: body.teacherFeedback,
						finalBandLevel: "B1",
						finalScorePct: 78,
						resultUrl: "https://example.test/placement-test/results/st1",
					});
					const student = srv.snapshot.students.find((s) => s.id === "st-1");
					if (student) {
						student.entryScore = "CEFR B1 (78%)";
					}
					return { status: 200, body: submission };
				}
				return undefined;
			},
		);

		routerState.params = { studentId: "st-1" };
		renderWithKernel(<StudentDetail />);

		expect(
			await screen.findByTestId("placement-submission-panel"),
		).toBeTruthy();
		expect(screen.getByTestId("student-entry-score").textContent).toBe(
			"Chưa có",
		);
		expect(screen.getByText("Chờ chấm W&S")).toBeTruthy();

		fireEvent.change(screen.getByTestId("writing-task-input"), {
			target: { value: "7" },
		});
		fireEvent.change(screen.getByTestId("writing-coherence-input"), {
			target: { value: "6.5" },
		});
		fireEvent.change(screen.getByTestId("writing-lexical-input"), {
			target: { value: "7" },
		});
		fireEvent.change(screen.getByTestId("writing-grammar-input"), {
			target: { value: "6.5" },
		});
		fireEvent.change(screen.getByLabelText("Nhận xét bài kiểm tra đầu vào"), {
			target: { value: "Nền tảng tốt" },
		});
		const courseSelect = (await screen.findByTestId(
			"placement-course-select",
		)) as HTMLSelectElement;
		await waitFor(() => expect(courseSelect.disabled).toBe(false));
		fireEvent.change(courseSelect, { target: { value: "course-ielts-1" } });

		fireEvent.click(screen.getByTestId("save-placement-grade-btn"));

		await waitFor(() => {
			const patchWrite = server.writes.find(
				(w) =>
					w.method === "PATCH" &&
					w.path === "/api/students/st-1/placement-submission",
			);
			expect(patchWrite).toBeDefined();
			expect(patchWrite?.body).toEqual({
				writingRubric: { task: 7, coherence: 6.5, lexical: 7, grammar: 6.5 },
				writingScore: 7,
				writingCriterionComments: {
					task: "",
					coherence: "",
					lexical: "",
					grammar: "",
				},
				speakingRubric: null,
				speakingScore: null,
				speakingCriterionComments: null,
				courseId: "course-ielts-1",
				teacherFeedback: "Nền tảng tốt",
				writingErrors: [],
				speakingErrors: [],
			});
		});

		await waitFor(() => {
			expect(screen.getByTestId("student-entry-score").textContent).toBe(
				"CEFR B1 (78%)",
			);
		});
		expect(toastMock.success).toHaveBeenCalled();
	});

	describe("tab Bài tập", () => {
		const FIXED_NOW = new Date("2026-11-26T05:00:00.000Z");

		function promptRow(
			overrides: Partial<KernelAssignmentPromptRow> = {},
		): KernelAssignmentPromptRow {
			return {
				id: "pr-writing",
				skill: "writing",
				part: "task2",
				type: "opinion",
				task: "task2",
				genre: "opinion",
				title: "Writing Prompt",
				band: "6.5",
				source: "",
				prompt: "<p>Write an essay.</p>",
				intro: "",
				passage: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				imageUrl: "",
				questions: [],
				optionBank: [],
				note: "",
				status: "ready",
				createdAt: "2026-11-01T00:00:00.000Z",
				...overrides,
			};
		}

		function classAssignmentRow(
			overrides: Partial<KernelClassAssignmentRow> = {},
		): KernelClassAssignmentRow {
			return {
				id: "ca-1",
				classId: "cl-1",
				promptId: "pr-writing",
				title: "Homework 2",
				due: "2026-11-30",
				dueAt: null,
				note: "",
				createdAt: "2026-11-15T00:00:00.000Z",
				targets: [
					{
						studentId: "st-1",
						submittedAt: "2026-11-25T10:00:00.000Z",
						attemptId: "att-1",
						gradedAt: "2026-11-25T12:00:00.000Z",
						band: 5.5,
					},
				],
				...overrides,
			};
		}

		function legacyAssignmentRow(
			overrides: Partial<KernelAssignmentRow> = {},
		): KernelAssignmentRow {
			return {
				id: "leg-1",
				studentId: "st-1",
				title: "Legacy Essay",
				type: "Task 2",
				due: "2026-11-10",
				status: "graded",
				scores: { task: 6.5, coherence: 6.5, lexical: 6.5, grammar: 6.5 },
				...overrides,
			};
		}

		function rowCellsByTitle(title: string): string[] {
			const cell = screen.getByText(title).closest("tr");
			if (!cell) throw new Error(`Row not found for title: ${title}`);
			return Array.from(cell.querySelectorAll("td")).map(
				(td) => td.textContent?.trim() ?? "",
			);
		}

		it("renders formatted Band and Đã chấm for graded class assignments including band 0", async () => {
			vi.useFakeTimers({ toFake: ["Date"] });
			vi.setSystemTime(FIXED_NOW);
			vi.unstubAllGlobals();
			startKernelServer(
				snapshotFixture({
					classes: [classRow({ id: "cl-1", name: "IELTS Writing" })],
					students: [studentRow({ id: "st-1", name: "Leah" })],
					assignmentPrompts: [
						promptRow({ id: "pr-writing", skill: "writing" }),
					],
					classAssignments: [
						classAssignmentRow({
							id: "ca-hw2",
							title: "Homework 2",
							due: "2026-11-20",
							targets: [
								{
									studentId: "st-1",
									submittedAt: "2026-11-19T10:00:00.000Z",
									attemptId: "att-hw2",
									gradedAt: "2026-11-21T08:00:00.000Z",
									band: 5.5,
								},
							],
						}),
						classAssignmentRow({
							id: "ca-hw3",
							title: "Homework 3",
							due: "2026-11-22",
							targets: [
								{
									studentId: "st-1",
									submittedAt: "2026-11-21T10:00:00.000Z",
									attemptId: "att-hw3",
									gradedAt: "2026-11-23T09:00:00.000Z",
									band: 6.5,
								},
							],
						}),
						classAssignmentRow({
							id: "ca-zero",
							title: "Zero Band Essay",
							due: "2026-11-24",
							targets: [
								{
									studentId: "st-1",
									submittedAt: "2026-11-23T10:00:00.000Z",
									attemptId: "att-zero",
									gradedAt: "2026-11-24T08:00:00.000Z",
									band: 0,
								},
							],
						}),
					],
				}),
				notFoundPlacementHandler,
			);
			routerState.params = { studentId: "st-1" };
			renderWithKernel(<StudentDetail />);

			fireEvent.click(await screen.findByRole("tab", { name: "Bài tập" }));

			const hw2 = rowCellsByTitle("Homework 2");
			expect(hw2[3]).toBe("5.5");
			expect(hw2[4]).toBe("Đã chấm");

			const hw3 = rowCellsByTitle("Homework 3");
			expect(hw3[3]).toBe("6.5");
			expect(hw3[4]).toBe("Đã chấm");

			const zero = rowCellsByTitle("Zero Band Essay");
			expect(zero[3]).toBe("0.0");
			expect(zero[4]).toBe("Đã chấm");
		});

		it("handles ungraded, unsubmitted, flip-first, malformed, multi-student isolation, and legacy rows", async () => {
			vi.useFakeTimers({ toFake: ["Date"] });
			vi.setSystemTime(FIXED_NOW);
			vi.unstubAllGlobals();
			startKernelServer(
				snapshotFixture({
					classes: [classRow({ id: "cl-1", name: "IELTS Writing" })],
					students: [
						studentRow({ id: "st-1", name: "Leah" }),
						studentRow({ id: "st-2", name: "Minh" }),
					],
					assignmentPrompts: [
						promptRow({ id: "pr-writing", skill: "writing" }),
						promptRow({
							id: "pr-reading",
							skill: "reading",
							part: "passage1",
						}),
					],
					classAssignments: [
						classAssignmentRow({
							id: "ca-read",
							promptId: "pr-reading",
							title: "Reading Quiz",
							due: "2026-11-30",
							targets: [
								{
									studentId: "st-1",
									submittedAt: "2026-11-25T10:00:00.000Z",
									attemptId: "att-read",
									gradedAt: null,
									band: null,
								},
							],
						}),
						classAssignmentRow({
							id: "ca-late",
							title: "Late Writing",
							due: "2026-11-20",
							targets: [
								{
									studentId: "st-1",
									submittedAt: "2026-11-22T10:00:00.000Z",
									attemptId: "att-late",
									gradedAt: null,
									band: null,
								},
							],
						}),
						classAssignmentRow({
							id: "ca-open",
							title: "Future Writing",
							due: "2099-12-31",
							targets: [
								{
									studentId: "st-1",
									submittedAt: null,
									attemptId: null,
									gradedAt: null,
									band: null,
								},
							],
						}),
						classAssignmentRow({
							id: "ca-overdue",
							title: "Overdue Writing",
							due: "2026-11-20",
							targets: [
								{
									studentId: "st-1",
									submittedAt: null,
									attemptId: null,
									gradedAt: null,
									band: null,
								},
							],
						}),
						classAssignmentRow({
							id: "ca-flip-first",
							title: "Flip First Graded",
							due: "2026-11-20",
							targets: [
								{
									studentId: "st-1",
									submittedAt: null,
									attemptId: "att-flip",
									gradedAt: "2026-11-21T08:00:00.000Z",
									band: 5.5,
								},
							],
						}),
						classAssignmentRow({
							id: "ca-partial",
							title: "Malformed Partial Grade",
							due: "2026-11-30",
							targets: [
								{
									studentId: "st-1",
									submittedAt: "2026-11-25T10:00:00.000Z",
									attemptId: "att-partial",
									gradedAt: null,
									band: 6.5,
								},
							],
						}),
						classAssignmentRow({
							id: "ca-out-of-range",
							title: "Malformed Band Range",
							due: "2026-11-30",
							targets: [
								{
									studentId: "st-1",
									submittedAt: "2026-11-25T10:00:00.000Z",
									attemptId: "att-range",
									gradedAt: "2026-11-25T12:00:00.000Z",
									band: 9.5,
								},
							],
						}),
						classAssignmentRow({
							id: "ca-bad-date",
							title: "Malformed Graded Date",
							due: "2026-11-30",
							targets: [
								{
									studentId: "st-1",
									submittedAt: "2026-11-25T10:00:00.000Z",
									attemptId: "att-date",
									gradedAt: "invalid",
									band: 6.5,
								},
							],
						}),
						classAssignmentRow({
							id: "ca-shared",
							title: "Shared Class Essay",
							due: "2026-11-30",
							targets: [
								{
									studentId: "st-2",
									submittedAt: "2026-11-25T09:00:00.000Z",
									attemptId: "att-st2",
									gradedAt: "2026-11-25T12:00:00.000Z",
									band: 8.0,
								},
								{
									studentId: "st-1",
									submittedAt: "2026-11-25T10:00:00.000Z",
									attemptId: "att-st1",
									gradedAt: null,
									band: null,
								},
							],
						}),
					],
					assignments: [legacyAssignmentRow()],
				}),
				notFoundPlacementHandler,
			);
			routerState.params = { studentId: "st-1" };
			renderWithKernel(<StudentDetail />);

			fireEvent.click(await screen.findByRole("tab", { name: "Bài tập" }));

			expect(rowCellsByTitle("Reading Quiz").slice(3, 5)).toEqual([
				"—",
				"Đã nộp",
			]);
			expect(rowCellsByTitle("Late Writing").slice(3, 5)).toEqual([
				"—",
				"Đã nộp · trễ hạn",
			]);
			expect(rowCellsByTitle("Future Writing").slice(3, 5)).toEqual([
				"—",
				"Chưa nộp",
			]);
			expect(rowCellsByTitle("Overdue Writing").slice(3, 5)).toEqual([
				"—",
				"Chưa nộp · quá hạn",
			]);
			expect(rowCellsByTitle("Flip First Graded").slice(3, 5)).toEqual([
				"5.5",
				"Đã chấm",
			]);
			expect(rowCellsByTitle("Malformed Partial Grade").slice(3, 5)).toEqual([
				"—",
				"Đã nộp",
			]);
			expect(rowCellsByTitle("Malformed Band Range").slice(3, 5)).toEqual([
				"—",
				"Đã nộp",
			]);
			expect(rowCellsByTitle("Malformed Graded Date").slice(3, 5)).toEqual([
				"—",
				"Đã nộp",
			]);
			expect(rowCellsByTitle("Shared Class Essay").slice(3, 5)).toEqual([
				"—",
				"Đã nộp",
			]);

			const legacyLink = screen.getByRole("link", { name: "Legacy Essay" });
			expect(legacyLink.getAttribute("href")).toBe("/assignments/leg-1");
			expect(rowCellsByTitle("Legacy Essay").slice(3, 5)).toEqual([
				"6.5",
				"Đã chấm",
			]);
		});

		it("opens submitted auto-graded and manual rows on click or Enter without nested Link, ignores unsubmitted rows, and honors ?tab=assign (#978)", async () => {
			vi.useFakeTimers({ toFake: ["Date"] });
			vi.setSystemTime(FIXED_NOW);
			vi.unstubAllGlobals();
			startKernelServer(
				snapshotFixture({
					classes: [classRow({ id: "cl-1", name: "IELTS Foundation" })],
					students: [studentRow({ id: "st-1", name: "Grok Test Student" })],
					assignmentPrompts: [
						promptRow({ id: "pr-writing", skill: "writing" }),
						promptRow({ id: "pr-grammar", skill: "grammar", part: "tenses" }),
					],
					classAssignments: [
						classAssignmentRow({
							id: "ca-grammar",
							promptId: "pr-grammar",
							title: "Grammar quick check",
							due: "2026-11-30",
							targets: [
								{
									studentId: "st-1",
									submittedAt: "2026-11-26T08:29:00.000Z",
									attemptId: "att-grammar",
									gradedAt: null,
									band: null,
								},
							],
						}),
						classAssignmentRow({
							id: "ca-writing-graded",
							promptId: "pr-writing",
							title: "Writing Graded",
							due: "2026-11-29",
							targets: [
								{
									studentId: "st-1",
									submittedAt: "2026-11-25T10:00:00.000Z",
									attemptId: "att-w-graded",
									gradedAt: "2026-11-25T12:00:00.000Z",
									band: 6.5,
								},
							],
						}),
						classAssignmentRow({
							id: "ca-unsubmitted",
							promptId: "pr-grammar",
							title: "Grammar unsubmitted",
							due: "2026-12-05",
							targets: [
								{
									studentId: "st-1",
									submittedAt: null,
									attemptId: null,
									gradedAt: null,
									band: null,
								},
							],
						}),
					],
				}),
				notFoundPlacementHandler,
			);
			routerState.params = { studentId: "st-1" };
			routerState.search = { tab: "assign" };
			renderWithKernel(<StudentDetail />);

			expect(await screen.findByText("Grammar quick check")).toBeTruthy();

			const grammarRow = screen
				.getByText("Grammar quick check")
				.closest("tr") as HTMLTableRowElement;
			expect(grammarRow.textContent).toContain("Xem bài làm");
			expect(within(grammarRow).queryByRole("link")).toBeNull();
			fireEvent.click(grammarRow);
			expect(routerState.navigate).toHaveBeenCalledWith({
				to: "/grading/$attemptId",
				params: { attemptId: "att-grammar" },
				search: { from: "student" },
			});

			routerState.navigate.mockClear();
			fireEvent.keyDown(grammarRow, { key: "Enter" });
			expect(routerState.navigate).toHaveBeenCalledWith({
				to: "/grading/$attemptId",
				params: { attemptId: "att-grammar" },
				search: { from: "student" },
			});

			routerState.navigate.mockClear();
			const writingRow = screen
				.getByText("Writing Graded")
				.closest("tr") as HTMLTableRowElement;
			expect(writingRow.textContent).toContain("Xem / sửa điểm");
			fireEvent.click(writingRow);
			expect(routerState.navigate).toHaveBeenCalledWith({
				to: "/grading/$attemptId",
				params: { attemptId: "att-w-graded" },
				search: { from: "student" },
			});

			routerState.navigate.mockClear();
			const openRow = screen
				.getByText("Grammar unsubmitted")
				.closest("tr") as HTMLTableRowElement;
			expect(openRow.getAttribute("tabindex")).toBeNull();
			fireEvent.click(openRow);
			expect(routerState.navigate).not.toHaveBeenCalled();
		});
	});
});
