// @vitest-environment jsdom

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
		speakingRubric: null,
		speakingScore: null,
		teacherFeedback: "",
		finalBandLevel: null,
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
					req.path === "/api/students/st-1/placement-submission"
				) {
					return { status: 200, body: submission };
				}
				if (
					req.method === "PATCH" &&
					req.path === "/api/students/st-1/placement-submission"
				) {
					const body = req.body as {
						writingRubric: { ct: number; or: number; lg: number };
						speakingRubric: {
							gv: number;
							dm: number;
							pr: number;
							ic: number;
						} | null;
						teacherFeedback: string;
					};
					submission = makeStudentSubmission({
						status: "graded",
						gradedAt: "2026-11-17T05:00:00.000Z",
						writingRubric: body.writingRubric,
						writingScore:
							body.writingRubric.ct +
							body.writingRubric.or +
							body.writingRubric.lg,
						speakingRubric: body.speakingRubric,
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

		fireEvent.click(screen.getByTestId("writing-ct-5"));
		fireEvent.click(screen.getByTestId("writing-or-4"));
		fireEvent.click(screen.getByTestId("writing-lg-4"));
		fireEvent.change(screen.getByLabelText("Nhận xét bài kiểm tra đầu vào"), {
			target: { value: "Nền tảng tốt" },
		});

		fireEvent.click(screen.getByTestId("save-placement-grade-btn"));

		await waitFor(() => {
			const patchWrite = server.writes.find(
				(w) =>
					w.method === "PATCH" &&
					w.path === "/api/students/st-1/placement-submission",
			);
			expect(patchWrite).toBeDefined();
			expect(patchWrite?.body).toEqual({
				writingRubric: { ct: 5, or: 4, lg: 4 },
				speakingRubric: null,
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
});
