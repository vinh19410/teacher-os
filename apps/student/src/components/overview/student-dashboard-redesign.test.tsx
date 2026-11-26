// @vitest-environment jsdom

import type {
	StudentAssignment,
	StudentClass,
	StudentInvoiceItem,
	StudentScheduleLesson,
} from "@teacher-os/api/contracts";
import { ZOOM_JOIN_ERROR_CODES } from "@teacher-os/api/zoom-window";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestStudentZoomJoin } from "@/lib/repos/student";
import {
	deriveStudentGoalSummary,
	selectNextTaskHero,
	selectStudentTuitionSummary,
	selectTodaySchedule,
} from "@/lib/student-overview-selectors";
import { GoalProgressCard } from "./goal-progress-card";
import { NextTaskHero } from "./next-task-hero";
import { TodayScheduleCard } from "./today-schedule-card";
import { TuitionSummaryCard } from "./tuition-summary-card";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	} & Record<string, unknown>) => {
		const href = Object.entries(params ?? {}).reduce(
			(acc, [key, value]) => acc.replace(`$${key}`, value),
			to,
		);
		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

vi.mock("sonner", () => ({
	toast: {
		info: vi.fn(),
		error: vi.fn(),
		success: vi.fn(),
	},
}));

vi.mock("@/lib/repos/student", async (importOriginal) => {
	const mod = await importOriginal<typeof import("@/lib/repos/student")>();
	return {
		...mod,
		requestStudentZoomJoin: vi.fn(),
	};
});

afterEach(cleanup);

function makeAssignment(
	overrides: Partial<StudentAssignment> = {},
): StudentAssignment {
	return {
		id: "asg-1",
		title: "Writing Task 2 — Opinion essay",
		source: "class_assignment",
		classId: "cls-1",
		className: "IELTS Writing 6.5 · K08",
		due: "2026-11-26",
		dueAt: "2026-11-26T16:59:00Z", // 23:59 ICT
		submittedAt: null,
		scores: null,
		skill: "writing",
		gradedAt: null,
		...overrides,
	};
}

function makeClass(overrides: Partial<StudentClass> = {}): StudentClass {
	return {
		id: "cls-1",
		name: "IELTS Speaking 6.0 · K11",
		level: "IELTS 6.0",
		mode: "Online",
		schedule: "T5 · 18:00–19:30",
		sessionsDone: 8,
		sessionsTotal: 20,
		status: "active",
		enrollmentId: "enr-1",
		enrollmentStatus: "active",
		nextSession: null,
		teacher: { name: "Trần Quốc Bảo", email: "bao@test.local", image: null },
		...overrides,
	};
}

function makeLesson(
	overrides: Partial<StudentScheduleLesson> = {},
): StudentScheduleLesson {
	return {
		id: "les-1",
		classId: "cls-1",
		className: "IELTS Speaking 6.0 · K11",
		date: "2026-11-26",
		day: 4,
		time: "18:00",
		dur: 90,
		status: "upcoming",
		topic: "Part 2 cue card",
		hasZoom: true,
		...overrides,
	};
}

function makeInvoice(
	overrides: Partial<StudentInvoiceItem> = {},
): StudentInvoiceItem {
	return {
		id: "inv-1",
		invoiceCode: "INV-0001",
		amount: 3_200_000,
		paidAmount: 0,
		amountDue: 3_200_000,
		status: "unpaid",
		due: "30/11",
		type: "Học phí",
		...overrides,
	};
}

describe("NextTaskHero", () => {
	const TODAY = "2026-11-26";
	const NOW_MS = Date.parse("2026-11-26T10:52:00Z");

	it("renders active task with fixed heading (no 'bài tập'), <p> title, real metadata, 2-item queue, and non-colliding CTA link", () => {
		const data = selectNextTaskHero(
			[
				makeAssignment({
					id: "a1",
					title: "Bài tập Writing Task 2",
				}),
				makeAssignment({
					id: "a2",
					title: "Speaking Part 2",
					due: "2026-11-27",
					dueAt: "2026-11-27T14:00:00Z",
				}),
				makeAssignment({
					id: "a3",
					title: "Writing Task 1",
					due: "2026-11-29",
					dueAt: "2026-11-29T16:59:00Z",
				}),
			],
			TODAY,
			NOW_MS,
		);

		render(<NextTaskHero data={data} vocabDueCount={0} />);

		const heading = screen.getByRole("heading", { level: 2 });
		expect(heading.textContent).toBe("Việc tiếp theo");
		expect(heading.textContent?.toLowerCase()).not.toContain("bài tập");

		expect(screen.getByText("Bài tập Writing Task 2").tagName).toBe("P");
		expect(screen.getByText("3 bài cần làm")).toBeTruthy();
		expect(screen.getByText("IELTS Writing 6.5 · K08")).toBeTruthy();
		expect(screen.getByText("Writing")).toBeTruthy();
		expect(screen.getByText("Speaking Part 2")).toBeTruthy();
		expect(screen.getByText("Writing Task 1")).toBeTruthy();

		const cta = screen.getByRole("link", { name: "Làm bài" });
		expect(cta.getAttribute("href")).toBe("/learn/quizzes/a1");
		expect(
			screen.queryByRole("link", { name: "Làm bài: Bài tập Writing Task 2" }),
		).toBeNull();

		const allLink = screen.getByRole("link", { name: "Xem tất cả bài tập" });
		expect(allLink.getAttribute("href")).toBe("#assignments");
	});

	it("renders done state without 'bài tập' in heading and shows vocab CTA with due count", () => {
		const data = selectNextTaskHero([], TODAY, NOW_MS);
		render(<NextTaskHero data={data} vocabDueCount={24} />);

		const heading = screen.getByRole("heading", { level: 2 });
		expect(heading.textContent?.toLowerCase()).not.toContain("bài tập");
		expect(screen.getByText(/24 từ vựng đến hạn ôn/)).toBeTruthy();
		const vocabLink = screen.getByRole("link", { name: /Ôn từ vựng/ });
		expect(vocabLink.getAttribute("href")).toBe("/practice/vocabulary");
	});
});

describe("TodayScheduleCard", () => {
	// 2026-11-26 17:52 ICT = 2026-11-26 10:52 UTC
	const NOW_MS = Date.parse("2026-11-26T10:52:00Z");
	let openSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		openSpy = vi.spyOn(window, "open");
	});

	afterEach(() => {
		openSpy.mockRestore();
	});

	it("renders all 4 states, passes nowMs to ZoomJoinButton without popup when too early, and never invents room", async () => {
		vi.mocked(requestStudentZoomJoin).mockResolvedValueOnce({
			ok: false,
			status: 403,
			error: {
				error: "Chưa đến giờ vào lớp.",
				code: ZOOM_JOIN_ERROR_CODES.TOO_EARLY,
			},
		});

		const cls = makeClass();
		const data = selectTodaySchedule({
			classes: [cls],
			lessons: [
				makeLesson({
					id: "l-ended",
					time: "09:00",
					dur: 90,
					status: "completed",
					hasZoom: false,
				}),
				makeLesson({
					id: "l-live",
					time: "17:00",
					dur: 90,
					status: "upcoming",
					hasZoom: true,
				}),
				makeLesson({
					id: "l-open",
					time: "18:10",
					dur: 90,
					status: "upcoming",
					hasZoom: true,
				}),
				makeLesson({
					id: "l-later-zoom",
					time: "20:00",
					dur: 60,
					status: "upcoming",
					hasZoom: true,
				}),
				makeLesson({
					id: "l-later-offline",
					time: "21:15",
					dur: 60,
					status: "upcoming",
					hasZoom: false,
				}),
			],
			nowMs: NOW_MS,
		});

		const { container } = render(
			<TodayScheduleCard data={data} isLoading={false} nowMs={NOW_MS} />,
		);

		expect(screen.getByRole("heading", { name: "Lịch hôm nay" })).toBeTruthy();
		expect(screen.getByText("Bây giờ 17:52")).toBeTruthy();
		expect(screen.getByText("Đã kết thúc")).toBeTruthy();
		expect(screen.getByText("Đang diễn ra")).toBeTruthy();
		expect(screen.getByText("Bắt đầu sau 18 phút")).toBeTruthy();
		expect(screen.getByText("Mở từ 19:30 (trước 30 phút)")).toBeTruthy();
		expect(screen.getByText("Bắt đầu sau 3 giờ 23 phút")).toBeTruthy();
		expect(container.textContent).not.toContain("Phòng 305");

		// Click the 'later' Zoom button (3rd ZoomJoinButton) — nowMs is outside window so window.open MUST NOT be called.
		const zoomButtons = screen.getAllByRole("button", {
			name: "Vào lớp (Zoom)",
		});
		expect(zoomButtons).toHaveLength(3);
		const laterZoomButton = zoomButtons.at(2);
		if (!laterZoomButton) {
			throw new Error("Expected 3rd ZoomJoinButton");
		}
		fireEvent.click(laterZoomButton);
		await waitFor(() => {
			expect(toast.info).toHaveBeenCalledWith("Chưa đến giờ vào lớp.");
		});
		expect(openSpy).not.toHaveBeenCalled();
	});

	it("renders local skeleton when isLoading is true", () => {
		const empty = selectTodaySchedule({
			classes: [],
			lessons: [],
			nowMs: NOW_MS,
		});
		const { container } = render(
			<TodayScheduleCard data={empty} isLoading={true} nowMs={NOW_MS} />,
		);
		expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
			0,
		);
	});

	it("renders fallback notice when isFallback is true and upcomingFallback when today has no lessons", () => {
		const cls = makeClass({
			nextSession: {
				date: "2026-11-28",
				time: "09:00",
				dur: 90,
				topic: "Speaking Mock",
				hasZoom: true,
			},
		});
		const data = selectTodaySchedule({
			classes: [cls],
			lessons: null,
			nowMs: NOW_MS,
		});

		render(<TodayScheduleCard data={data} isLoading={false} nowMs={NOW_MS} />);

		expect(screen.getByText("Hôm nay không có buổi học.")).toBeTruthy();
		expect(screen.getByText(/Speaking Mock/)).toBeTruthy();
		expect(screen.getByText(/hiển thị buổi học kế tiếp/i)).toBeTruthy();
		const scheduleLink = screen.getByRole("link", { name: /Xem lịch học/ });
		expect(scheduleLink.getAttribute("href")).toBe("/schedule");
	});
});

describe("GoalProgressCard", () => {
	it("returns null when student has no goal data", () => {
		const summary = deriveStudentGoalSummary({
			student: {
				examInterest: null,
				currentLevel: null,
				targetScore: null,
				entryScore: null,
				dailyStudyHours: null,
			},
			activeClassCount: 0,
		});
		const { container } = render(
			<GoalProgressCard summary={summary} showPlacementHighlight={false} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("renders 4 stats, IELTS badge, scale ticks, and embeds placement-highlight-banner only when showPlacementHighlight is true", () => {
		const summary = deriveStudentGoalSummary({
			student: {
				examInterest: "ielts",
				currentLevel: "intermediate",
				targetScore: "6.5",
				entryScore: "5.5",
				dailyStudyHours: "1-2",
			},
			activeClassCount: 2,
		});

		const { rerender } = render(
			<GoalProgressCard summary={summary} showPlacementHighlight={true} />,
		);

		expect(
			screen.getByRole("heading", { name: "Tiến độ tới mục tiêu" }),
		).toBeTruthy();
		expect(screen.getByText("IELTS")).toBeTruthy();
		expect(screen.getByRole("img", { name: /Thang IELTS/ })).toBeTruthy();
		expect(screen.getByTestId("placement-highlight-banner")).toBeTruthy();
		const cta = screen.getByTestId("placement-banner-cta");
		expect(cta.getAttribute("href")).toBe("/placement-test");

		rerender(
			<GoalProgressCard summary={summary} showPlacementHighlight={false} />,
		);
		expect(screen.queryByTestId("placement-highlight-banner")).toBeNull();
		expect(screen.queryByTestId("placement-banner-cta")).toBeNull();
	});

	it("renders reached target and CEFR entryScore cleanly without negative values", () => {
		const summary = deriveStudentGoalSummary({
			student: {
				examInterest: "ielts",
				currentLevel: "advanced",
				targetScore: "6.5",
				entryScore: "7.0",
				dailyStudyHours: "1-2",
			},
			activeClassCount: 1,
		});
		const { container } = render(
			<GoalProgressCard summary={summary} showPlacementHighlight={false} />,
		);
		expect(container.textContent).toContain("Đã đạt");
		expect(container.textContent).not.toContain("+-");
	});
});

describe("TuitionSummaryCard", () => {
	it("returns null when summary is null", () => {
		const { container } = render(<TuitionSummaryCard summary={null} />);
		expect(container.firstChild).toBeNull();
	});

	it("normalizes raw 'tuition' type, preserves Học phí heading & primary QR link regex, and renders secondary list link when >1 invoice", () => {
		const summary = selectStudentTuitionSummary([
			makeInvoice({
				id: "inv-a",
				amount: 500_000,
				amountDue: 500_000,
				type: "tuition",
				due: "30/11",
			}),
			makeInvoice({
				id: "inv-b",
				amount: 400_000,
				amountDue: 400_000,
				type: "Phí tài liệu",
				due: "15/12",
			}),
		]);

		const { container } = render(<TuitionSummaryCard summary={summary} />);

		expect(screen.getByRole("heading", { name: "Học phí" })).toBeTruthy();
		expect(container.textContent).not.toContain("tuition");
		expect(container.textContent).toContain("900.000đ");
		expect(container.textContent).toContain("2 hóa đơn chưa đóng");

		const primaryLink = screen.getByRole("link", { name: /Học phí/ });
		expect(primaryLink.getAttribute("href")).toBe("/tuition/inv-a");

		const allLink = screen.getByRole("link", { name: "Tất cả (2)" });
		expect(allLink.getAttribute("href")).toBe("/tuition");
	});

	it("shows Đã thanh toán đủ when all invoices are settled", () => {
		const summary = selectStudentTuitionSummary([
			makeInvoice({
				id: "inv-done",
				amount: 500_000,
				paidAmount: 500_000,
				amountDue: 0,
				status: "paid",
			}),
		]);
		render(<TuitionSummaryCard summary={summary} />);
		expect(screen.getByText("Đã thanh toán đủ")).toBeTruthy();
		expect(
			screen.getByRole("link", { name: /Học phí/ }).getAttribute("href"),
		).toBe("/tuition/inv-done");
	});
});
