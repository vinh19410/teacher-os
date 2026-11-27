// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
	AssignmentPrompt,
	ClassAssignment,
	ClassGroup,
} from "@/lib/mock-data";

const mockDispatch = vi.fn();
const mockRefresh = vi.fn();

vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		dispatch: mockDispatch,
		refresh: mockRefresh,
	}),
}));

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	},
}));

import { AssignPromptToClassesModal } from "./assign-prompt-to-classes-modal";

afterEach(() => {
	cleanup();
	mockDispatch.mockReset();
	mockRefresh.mockReset();
});

const promptFixture: AssignmentPrompt = {
	id: "ap-1",
	skill: "writing",
	part: "task2",
	type: "discuss",
	task: "task2",
	genre: "discuss",
	title: "Remote work in big cities",
	band: "6.5",
	source: "Tự soạn",
	prompt: "<p>Essay prompt</p>",
	note: "",
	status: "ready",
	createdAt: "2026-11-20T10:00:00.000Z",
};

const classesFixture: ClassGroup[] = [
	{
		id: "c1",
		name: "IELTS 6.5 · K12",
		level: "6.5",
		type: "ielts",
		skills: ["Writing"],
		mode: "Online",
		syllabusId: "",
		studentIds: ["st-1", "st-2"],
		invitedStudentIds: [],
		schedule: "T3 & T5",
		sessionsDone: 0,
		sessionsTotal: 12,
		status: "active",
		startDate: "2026-11-01",
		tuitionFee: null,
		notes: "",
	},
	{
		id: "c2",
		name: "IELTS 5.5 · K08",
		level: "5.5",
		type: "ielts",
		skills: ["Writing"],
		mode: "Online",
		syllabusId: "",
		studentIds: ["st-3"],
		invitedStudentIds: [],
		schedule: "T2 & T4",
		sessionsDone: 0,
		sessionsTotal: 12,
		status: "active",
		startDate: "2026-11-01",
		tuitionFee: null,
		notes: "",
	},
	{
		id: "c3",
		name: "Lớp đã giao",
		level: "6.0",
		type: "ielts",
		skills: ["Writing"],
		mode: "Online",
		syllabusId: "",
		studentIds: ["st-4"],
		invitedStudentIds: [],
		schedule: "",
		sessionsDone: 0,
		sessionsTotal: 12,
		status: "active",
		startDate: "2026-11-01",
		tuitionFee: null,
		notes: "",
	},
	{
		id: "c4",
		name: "Lớp tạm dừng",
		level: "6.0",
		type: "ielts",
		skills: ["Writing"],
		mode: "Online",
		syllabusId: "",
		studentIds: ["st-5"],
		invitedStudentIds: [],
		schedule: "",
		sessionsDone: 0,
		sessionsTotal: 12,
		status: "paused",
		startDate: "2026-11-01",
		tuitionFee: null,
		notes: "",
	},
	{
		id: "c5",
		name: "Lớp trống",
		level: "6.0",
		type: "ielts",
		skills: ["Writing"],
		mode: "Online",
		syllabusId: "",
		studentIds: [],
		invitedStudentIds: ["st-6"],
		schedule: "",
		sessionsDone: 0,
		sessionsTotal: 12,
		status: "active",
		startDate: "2026-11-01",
		tuitionFee: null,
		notes: "",
	},
];

const existingAssignments: ClassAssignment[] = [
	{
		id: "ca-1",
		classId: "c3",
		promptId: "ap-1",
		title: "Remote work in big cities",
		due: "2026-12-01",
		note: "",
		createdAt: "2026-11-25T10:00:00.000Z",
		targets: [{ studentId: "st-4", submittedAt: null }],
	},
];

describe("AssignPromptToClassesModal", () => {
	test("renders <Modal> dialog (not native <dialog>) and disables assigned/paused/empty classes", () => {
		const { container } = render(
			<AssignPromptToClassesModal
				open
				prompt={promptFixture}
				classes={classesFixture}
				classAssignments={existingAssignments}
				onClose={vi.fn()}
				onAssigned={vi.fn()}
			/>,
		);

		expect(container.querySelector("dialog")).toBeNull();
		expect(
			screen.getByRole("dialog", { name: "Giao đề cho lớp" }),
		).toBeTruthy();

		const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
		expect(checkboxes[0]?.disabled).toBe(false);
		expect(checkboxes[1]?.disabled).toBe(false);
		expect(checkboxes[2]?.disabled).toBe(true); // c3 already assigned
		expect(checkboxes[3]?.disabled).toBe(true); // c4 paused
		expect(checkboxes[4]?.disabled).toBe(true); // c5 0 active students

		expect(screen.getByText("Đã giao · hạn 01/12")).toBeTruthy();
		expect(screen.getByText("Lớp đang tạm dừng")).toBeTruthy();
		expect(
			screen.getByText("Chưa có học viên hoạt động (1 chờ tham gia)"),
		).toBeTruthy();
	});

	test("dispatches sequential assign-class-prompt with skipRefresh: true and single refresh() on success", async () => {
		mockDispatch.mockResolvedValue({ kind: "committed", id: "ca-new" });
		mockRefresh.mockResolvedValue(true);
		const onAssigned = vi.fn();
		const onClose = vi.fn();

		render(
			<AssignPromptToClassesModal
				open
				prompt={promptFixture}
				classes={classesFixture}
				classAssignments={existingAssignments}
				onClose={onClose}
				onAssigned={onAssigned}
			/>,
		);

		const checkboxes = screen.getAllByRole("checkbox");
		fireEvent.click(checkboxes[0]!);
		fireEvent.click(checkboxes[1]!);
		fireEvent.click(screen.getByRole("button", { name: "Giao đề" }));

		await waitFor(() => {
			expect(mockDispatch).toHaveBeenCalledTimes(2);
		});

		expect(mockDispatch).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				type: "assign-class-prompt",
				payload: expect.objectContaining({
					classId: "c1",
					promptId: "ap-1",
					dueTime: "21:00",
					note: "",
					studentIds: ["st-1", "st-2"],
					targetScope: "class",
				}),
			}),
			{ skipRefresh: true },
		);
		expect(mockDispatch).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				type: "assign-class-prompt",
				payload: expect.objectContaining({
					classId: "c2",
					promptId: "ap-1",
					note: "",
					studentIds: ["st-3"],
					targetScope: "class",
				}),
			}),
			{ skipRefresh: true },
		);
		expect(mockRefresh).toHaveBeenCalledTimes(1);
		expect(onAssigned).toHaveBeenCalledWith(2, expect.any(String));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	test("unchecks succeeded class and keeps failed class checked on partial failure", async () => {
		mockDispatch
			.mockResolvedValueOnce({ kind: "committed", id: "ca-ok" })
			.mockResolvedValueOnce({
				kind: "definite-failure",
				status: 400,
				error: new Error("fail"),
				reason: "Lỗi dữ liệu lớp 2",
			});
		mockRefresh.mockResolvedValue(true);
		const onClose = vi.fn();

		render(
			<AssignPromptToClassesModal
				open
				prompt={promptFixture}
				classes={classesFixture}
				classAssignments={existingAssignments}
				onClose={onClose}
				onAssigned={vi.fn()}
			/>,
		);

		const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
		fireEvent.click(checkboxes[0]!);
		fireEvent.click(checkboxes[1]!);
		fireEvent.click(screen.getByRole("button", { name: "Giao đề" }));

		await waitFor(() => {
			expect(screen.getByText(/Lỗi dữ liệu lớp 2/)).toBeTruthy();
		});
		expect(onClose).not.toHaveBeenCalled();
		expect(checkboxes[0]?.checked).toBe(false);
		expect(checkboxes[1]?.checked).toBe(true);
	});

	test("blocks re-submit when all classes return outcome-unknown and refresh fails until sync succeeds", async () => {
		mockDispatch.mockResolvedValueOnce({ kind: "outcome-unknown" });
		mockRefresh.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

		render(
			<AssignPromptToClassesModal
				open
				prompt={promptFixture}
				classes={classesFixture}
				classAssignments={existingAssignments}
				onClose={vi.fn()}
				onAssigned={vi.fn()}
			/>,
		);

		const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
		fireEvent.click(checkboxes[0]!);
		fireEvent.click(screen.getByRole("button", { name: "Giao đề" }));

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Tải lại dữ liệu" }),
			).toBeTruthy();
		});
		const submitBtn = screen.getByRole("button", {
			name: "Giao đề",
		}) as HTMLButtonElement;
		expect(submitBtn.disabled).toBe(true);

		fireEvent.click(screen.getByRole("button", { name: "Tải lại dữ liệu" }));
		await waitFor(() => {
			expect(mockRefresh).toHaveBeenCalledTimes(2);
		});
		await waitFor(() => {
			expect(submitBtn.disabled).toBe(false);
		});
	});

	test("shows validation error when submitting with 0 selected classes", async () => {
		render(
			<AssignPromptToClassesModal
				open
				prompt={promptFixture}
				classes={classesFixture}
				classAssignments={existingAssignments}
				onClose={vi.fn()}
				onAssigned={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "2 ngày nữa" }));
		fireEvent.click(screen.getByRole("button", { name: "Giao đề" }));

		await waitFor(() => {
			expect(screen.getByText("Chọn ít nhất một lớp để giao đề.")).toBeTruthy();
		});
		expect(mockDispatch).not.toHaveBeenCalled();
	});
});
