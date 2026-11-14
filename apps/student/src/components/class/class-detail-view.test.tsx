// @vitest-environment jsdom

import type { StudentClassDetail } from "@teacher-os/api/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassDetailView } from "./class-detail-view";

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
	}) => {
		const href =
			typeof to === "string"
				? to.replace("$classId", params?.classId ?? "")
				: String(to);
		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

afterEach(cleanup);

function makeDetail(status: "active" | "paused"): StudentClassDetail {
	return {
		class: {
			id: "cls-1",
			name: "IELTS Speaking",
			level: "IELTS 6.5",
			mode: "1:1",
			schedule: '{"days":[1,4],"start":"19:00","end":"20:30"}',
			sessionsDone: 1,
			sessionsTotal: 8,
			status,
			nextSession: null,
			enrollmentId: "enr-1",
			enrollmentStatus: "active",
			startDate: "2026-11-01",
			teacher: {
				name: "Thầy Minh",
				email: "minh@test.local",
				image: null,
			},
		},
		lessons: [
			{
				id: "l-done",
				date: "2026-11-10",
				day: 2,
				time: "19:00",
				dur: 90,
				status: "completed",
				topic: "Part 1 Basics",
			},
			{
				id: "l-up",
				date: "2026-11-28",
				day: 6,
				time: "19:00",
				dur: 90,
				status: "upcoming",
				topic: "Cue Cards",
			},
		],
		assignments: [],
	};
}

describe("ClassDetailView — lớp tạm dừng (#694)", () => {
	const NOW = new Date("2026-11-20T03:00:00Z");
	const TODAY = "2026-11-20";

	it("shows neutral pause banner and suppresses Buổi tới in both ClassInfoCard and ClassLessonList", () => {
		render(
			<ClassDetailView
				detail={makeDetail("paused")}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		expect(screen.getByText("Tạm dừng")).toBeTruthy();
		const banner = screen.getByTestId("class-paused-banner");
		expect(banner.textContent).toContain("Lớp đang tạm dừng");
		expect(banner.className).not.toContain("destructive");
		expect(screen.queryByText(/Buổi tới/)).toBeNull();
		expect(screen.getByText("Tạm hoãn")).toBeTruthy();
		expect(screen.getByText("Đã học")).toBeTruthy();
	});

	it("still shows Buổi tới for active class", () => {
		render(
			<ClassDetailView
				detail={makeDetail("active")}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		expect(screen.queryByTestId("class-paused-banner")).toBeNull();
		expect(screen.getAllByText(/Buổi tới/).length).toBeGreaterThanOrEqual(1);
	});
});
