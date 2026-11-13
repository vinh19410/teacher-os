// @vitest-environment jsdom

import type {
	ClassStudyPacksResponse,
	StudyPackSummaryView,
} from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildStudyPackSchedulePreview,
	ClassStudyPackSection,
} from "./class-study-pack-section";

const mockFetchClassStudyPacks =
	vi.fn<(classId: string) => Promise<ClassStudyPacksResponse>>();
const mockFetchStudyPacks =
	vi.fn<() => Promise<{ packs: StudyPackSummaryView[] }>>();
const mockAssignStudyPackToClass =
	vi.fn<
		(
			classId: string,
			input: {
				packId: string;
				startDate: string;
				releaseTime: string;
				dueTime: string;
			},
		) => Promise<ClassStudyPacksResponse>
	>();
const mockCancelClassStudyPack =
	vi.fn<
		(classId: string, classPackId: string) => Promise<ClassStudyPacksResponse>
	>();

vi.mock("@/lib/repos/study-pack", () => ({
	fetchClassStudyPacks: (...args: [string]) =>
		mockFetchClassStudyPacks(...args),
	fetchStudyPacks: () => mockFetchStudyPacks(),
	assignStudyPackToClass: (
		...args: [
			string,
			{
				packId: string;
				startDate: string;
				releaseTime: string;
				dueTime: string;
			},
		]
	) => mockAssignStudyPackToClass(...args),
	cancelClassStudyPack: (...args: [string, string]) =>
		mockCancelClassStudyPack(...args),
}));

const sampleReadyPack: StudyPackSummaryView = {
	id: "pack-1",
	orgId: "org-1",
	scope: "org",
	title: "Bộ đề Grammar & Reading 2 ngày",
	description: "Lộ trình ôn tập 2 ngày",
	level: "",
	status: "ready",
	sourcePackId: null,
	dayCount: 2,
	itemCount: 2,
	createdAt: "2026-11-01T00:00:00.000Z",
	updatedAt: "2026-11-01T00:00:00.000Z",
};

const sampleActiveClassPack: ClassStudyPacksResponse["packs"][number] = {
	id: "csp-1",
	classId: "cl-1",
	packId: "pack-1",
	title: "Bộ đề Grammar & Reading 2 ngày",
	startDate: "2026-11-01",
	releaseTime: "06:00",
	dueTime: "17:00",
	status: "active",
	createdAt: "2026-11-01T00:00:00.000Z",
	cancelledAt: null,
	assignments: [
		{
			assignmentId: "ca-1",
			promptId: "pr-1",
			title: "Grammar: Thì hiện tại hoàn thành",
			skill: "grammar",
			dayIndex: 1,
			date: "2026-11-01",
			availableAt: "2026-10-31T23:00:00.000Z",
			dueAt: "2026-11-01T10:00:00.000Z",
			isReleased: true,
			targetsTotal: 5,
			submittedCount: 3,
			submittedLateCount: 1,
			overdueCount: 0,
			pendingCount: 2,
		},
		{
			assignmentId: "ca-2",
			promptId: "pr-2",
			title: "Reading: Passage 1 TFNG",
			skill: "reading",
			dayIndex: 2,
			date: "2026-11-03",
			availableAt: "2026-11-02T23:00:00.000Z",
			dueAt: "2026-11-03T10:00:00.000Z",
			isReleased: false,
			targetsTotal: 5,
			submittedCount: 0,
			submittedLateCount: 0,
			overdueCount: 0,
			pendingCount: 5,
		},
	],
};

beforeEach(() => {
	mockFetchClassStudyPacks.mockReset();
	mockFetchStudyPacks.mockReset();
	mockAssignStudyPackToClass.mockReset();
	mockCancelClassStudyPack.mockReset();
});

afterEach(() => {
	cleanup();
});

describe("buildStudyPackSchedulePreview", () => {
	it("skips class holidays when projecting day dates", () => {
		const preview = buildStudyPackSchedulePreview("2026-11-01", 2, [
			{ date: "2026-11-02", name: "Nghỉ bù" },
		]);
		expect(preview.days).toEqual([
			{ dayIndex: 1, date: "2026-11-01" },
			{ dayIndex: 2, date: "2026-11-03" },
		]);
		expect(preview.skippedHolidays).toEqual([
			{ date: "2026-11-02", name: "Nghỉ bù" },
		]);
	});
});

describe("ClassStudyPackSection", () => {
	it("renders empty state when no study packs are assigned", async () => {
		mockFetchClassStudyPacks.mockResolvedValue({
			packs: [],
			holidays: [],
		});
		mockFetchStudyPacks.mockResolvedValue({
			packs: [sampleReadyPack],
		});

		render(<ClassStudyPackSection classId="cl-1" />);

		expect(
			await screen.findByText("Chưa gán bộ đề tự học nào cho lớp này"),
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Gán bộ đề đầu tiên" }),
		).toBeTruthy();
	});

	it("opens assign modal, previews schedule skipping holidays, and assigns pack", async () => {
		mockFetchClassStudyPacks.mockResolvedValue({
			packs: [],
			holidays: [{ date: "2026-11-02", name: "Nghỉ lễ trung tâm" }],
		});
		mockFetchStudyPacks.mockResolvedValue({
			packs: [sampleReadyPack],
		});
		mockAssignStudyPackToClass.mockResolvedValue({
			packs: [sampleActiveClassPack],
			holidays: [{ date: "2026-11-02", name: "Nghỉ lễ trung tâm" }],
		});

		render(<ClassStudyPackSection classId="cl-1" />);

		await screen.findByText("Chưa gán bộ đề tự học nào cho lớp này");
		fireEvent.click(screen.getByRole("button", { name: "Gán bộ đề" }));

		const dialog = screen.getByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText(/Ngày bắt đầu/), {
			target: { value: "2026-11-01" },
		});

		expect(
			within(dialog).getByText(
				/Tự động bỏ qua ngày nghỉ: 02\/11\/2026 \(Nghỉ lễ trung tâm\)/,
			),
		).toBeTruthy();
		expect(within(dialog).getByText(/Ngày 1 → 01\/11\/2026/)).toBeTruthy();
		expect(within(dialog).getByText(/Ngày 2 → 03\/11\/2026/)).toBeTruthy();

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Xác nhận gán bộ đề" }),
		);

		await waitFor(() =>
			expect(mockAssignStudyPackToClass).toHaveBeenCalledWith("cl-1", {
				packId: "pack-1",
				startDate: "2026-11-01",
				releaseTime: "06:00",
				dueTime: "17:00",
			}),
		);

		expect(
			await screen.findByText("Grammar: Thì hiện tại hoàn thành"),
		).toBeTruthy();
	});

	it("renders released/unreleased statuses, submission progress, late counts, and cancels an active pack", async () => {
		mockFetchClassStudyPacks.mockResolvedValue({
			packs: [sampleActiveClassPack],
			holidays: [],
		});
		mockFetchStudyPacks.mockResolvedValue({
			packs: [sampleReadyPack],
		});
		mockCancelClassStudyPack.mockResolvedValue({
			packs: [
				{
					...sampleActiveClassPack,
					status: "cancelled",
					cancelledAt: "2026-11-01T12:00:00.000Z",
					assignments: [sampleActiveClassPack.assignments[0]],
				},
			],
			holidays: [],
		});

		render(<ClassStudyPackSection classId="cl-1" />);

		expect(
			await screen.findByText("Bộ đề Grammar & Reading 2 ngày"),
		).toBeTruthy();
		expect(screen.getByText("Đang chạy")).toBeTruthy();
		expect(
			screen.getByText("Bắt đầu: 01/11/2026 · Khung giờ: 06:00 – 17:00"),
		).toBeTruthy();
		expect(screen.getByText("Đã mở")).toBeTruthy();
		expect(screen.getByText("Chưa đến giờ")).toBeTruthy();
		expect(screen.getByText("3/5 đã nộp")).toBeTruthy();
		expect(screen.getByText("(1 nộp trễ)")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Huỷ bộ đề" }));

		await waitFor(() =>
			expect(mockCancelClassStudyPack).toHaveBeenCalledWith("cl-1", "csp-1"),
		);

		expect(await screen.findByText("Đã huỷ")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Huỷ bộ đề" })).toBeNull();
	});

	it("displays cancelled error message and refreshes packs when assign fails with 409 'study pack was cancelled' (#554)", async () => {
		mockFetchClassStudyPacks.mockResolvedValue({
			packs: [],
			holidays: [],
		});
		mockFetchStudyPacks.mockResolvedValue({
			packs: [sampleReadyPack],
		});
		mockAssignStudyPackToClass.mockRejectedValueOnce(
			Object.assign(new Error("study pack was cancelled"), {
				status: 409,
				studyPackErrorCode: "study pack was cancelled",
			}),
		);

		render(<ClassStudyPackSection classId="cl-1" />);

		await screen.findByText("Chưa gán bộ đề tự học nào cho lớp này");
		fireEvent.click(screen.getByRole("button", { name: "Gán bộ đề" }));

		const dialog = screen.getByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText(/Ngày bắt đầu/), {
			target: { value: "2026-11-01" },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Xác nhận gán bộ đề" }),
		);

		expect(
			await within(dialog).findByText(
				"Bộ đề này vừa bị huỷ. Vui lòng kiểm tra lại danh sách.",
			),
		).toBeTruthy();
		expect(
			within(dialog).queryByText("Bộ đề này đang chạy trên lớp với lịch khác."),
		).toBeNull();
		await waitFor(() =>
			expect(mockFetchClassStudyPacks).toHaveBeenCalledTimes(2),
		);
	});
});
