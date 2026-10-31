// @vitest-environment jsdom

import type { SelfStudyPlanDetailResponse } from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelfStudyPlanSection } from "./self-study-plan-section";

vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		data: {
			assignmentPrompts: [
				{
					id: "pr-1",
					title: "IELTS Reading Passage 1",
					skill: "reading",
					status: "ready",
					part: "Part 1",
					type: "Multiple choice",
					band: "6.5",
				},
				{
					id: "pr-2",
					title: "IELTS Writing Task 2",
					skill: "writing",
					status: "ready",
					part: "Task 2",
					type: "Opinion",
					band: "6.5",
				},
			],
		},
	}),
}));

describe("SelfStudyPlanSection (#526)", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("renders empty state with create button and default 06:00-17:00 hours when class has no plan", async () => {
		const emptyDetail: SelfStudyPlanDetailResponse = {
			plan: null,
			plans: [],
			page: {
				from: "2026-11-01",
				to: "2026-11-07",
				prevFrom: null,
				prevTo: null,
				nextFrom: null,
				nextTo: null,
				totalDays: 0,
			},
			days: [],
		};

		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify(emptyDetail), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		render(<SelfStudyPlanSection classId="cls-1" />);

		const createBtn = await screen.findByRole("button", {
			name: "Tạo kế hoạch tự học",
		});
		expect(createBtn).toBeTruthy();

		fireEvent.click(createBtn);
		expect(
			(screen.getByLabelText("Giờ giao bài") as HTMLInputElement).value,
		).toBe("06:00");
		expect(
			(screen.getByLabelText("Giờ hạn nộp") as HTMLInputElement).value,
		).toBe("17:00");
	});

	it("displays published plan with holiday badge, holidayOverride toggle, warning, missed release button, and late submission progress", async () => {
		const publishedDetail: SelfStudyPlanDetailResponse = {
			plan: {
				id: "ssp-1",
				classId: "cls-1",
				title: "Kế hoạch tự học tháng 11",
				startDate: "2026-11-01",
				endDate: "2026-11-10",
				releaseTime: "06:00",
				dueTime: "17:00",
				status: "published",
				publishedAt: "2026-10-31T00:00:00.000Z",
				completedAt: null,
				cancelledAt: null,
				createdAt: "2026-10-31T00:00:00.000Z",
				updatedAt: "2026-10-31T00:00:00.000Z",
			},
			plans: [],
			page: {
				from: "2026-11-01",
				to: "2026-11-03",
				prevFrom: null,
				prevTo: null,
				nextFrom: "2026-11-04",
				nextTo: "2026-11-06",
				totalDays: 10,
			},
			days: [
				{
					id: "d-1",
					date: "2026-11-01",
					releaseAt: "2026-10-31T23:00:00.000Z",
					dueAt: "2026-11-01T10:00:00.000Z",
					status: "released",
					holidayOverride: false,
					isHoliday: false,
					holidayName: null,
					warning: "Bỏ qua đề không còn ở trạng thái sẵn sàng: Đề Nháp",
					notifiedAt: "2026-10-31T23:00:05.000Z",
					releasedAt: "2026-10-31T23:00:00.000Z",
					editable: false,
					items: [
						{
							id: "item-1",
							promptId: "pr-1",
							promptTitle: "IELTS Reading Passage 1",
							promptSkill: "reading",
							promptStatus: "ready",
							position: 0,
							note: "Làm cẩn thận",
							assignmentId: "ca_ssp_item-1",
							dueAt: "2026-11-01T10:00:00.000Z",
							targetsTotal: 2,
							submittedOnTimeCount: 1,
							submittedLateCount: 1,
							overdueCount: 0,
							pendingCount: 0,
							students: [
								{
									studentId: "st-1",
									studentName: "Nguyễn Văn A",
									submittedAt: "2026-11-01T08:00:00.000Z",
									isLate: false,
									status: "submitted_on_time",
									attemptId: "att-1",
									gradedAt: null,
									band: null,
								},
								{
									studentId: "st-2",
									studentName: "Trần Thị B",
									submittedAt: "2026-11-01T10:15:00.000Z",
									isLate: true,
									status: "submitted_late",
									attemptId: "att-2",
									gradedAt: null,
									band: null,
								},
							],
						},
					],
				},
				{
					id: "d-2",
					date: "2026-11-02",
					releaseAt: "2026-11-01T23:00:00.000Z",
					dueAt: "2026-11-02T10:00:00.000Z",
					status: "missed",
					holidayOverride: false,
					isHoliday: false,
					holidayName: null,
					warning: "Quá hạn nộp trước khi hệ thống kịp giao bài.",
					notifiedAt: null,
					releasedAt: null,
					editable: false,
					items: [
						{
							id: "item-2",
							promptId: "pr-2",
							promptTitle: "IELTS Writing Task 2",
							promptSkill: "writing",
							promptStatus: "ready",
							position: 0,
							note: "",
							assignmentId: null,
							dueAt: null,
							targetsTotal: 0,
							submittedOnTimeCount: 0,
							submittedLateCount: 0,
							overdueCount: 0,
							pendingCount: 0,
							students: [],
						},
					],
				},
				{
					id: "d-3",
					date: "2026-11-03",
					releaseAt: "2026-11-02T23:00:00.000Z",
					dueAt: "2026-11-03T10:00:00.000Z",
					status: "pending",
					holidayOverride: false,
					isHoliday: true,
					holidayName: "Nghỉ lễ nội bộ",
					warning: "",
					notifiedAt: null,
					releasedAt: null,
					editable: true,
					items: [
						{
							id: "item-3",
							promptId: "pr-1",
							promptTitle: "IELTS Reading Passage 1",
							promptSkill: "reading",
							promptStatus: "ready",
							position: 0,
							note: "",
							assignmentId: null,
							dueAt: null,
							targetsTotal: 0,
							submittedOnTimeCount: 0,
							submittedLateCount: 0,
							overdueCount: 0,
							pendingCount: 0,
							students: [],
						},
					],
				},
			],
		};

		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify(publishedDetail), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		render(<SelfStudyPlanSection classId="cls-1" />);

		await waitFor(() => {
			expect(screen.getByText("Kế hoạch tự học tháng 11")).toBeTruthy();
		});

		expect(
			screen.getByText(/Bỏ qua đề không còn ở trạng thái sẵn sàng/i),
		).toBeTruthy();
		expect(screen.getByText(/1 nộp trễ/i)).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Giao lại ngày 2026-11-02" }),
		).toBeTruthy();
		expect(screen.getByText(/Nghỉ lễ nội bộ/i)).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Vẫn giao ngày nghỉ 2026-11-03" }),
		).toBeTruthy();
	});
});
