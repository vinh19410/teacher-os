// @vitest-environment jsdom

import type {
	StudentAssignment,
	StudentClass,
} from "@teacher-os/api/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassCard } from "./class-card";

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

function makeClass(overrides: Partial<StudentClass> = {}): StudentClass {
	return {
		id: "cls-1",
		name: "IELTS 6.5",
		level: "IELTS 6.5",
		mode: "1:1",
		schedule: '{"days":[1,4],"start":"19:00","end":"20:30"}',
		sessionsDone: 2,
		sessionsTotal: 10,
		status: "active",
		nextSession: null,
		enrollmentId: "enr-1",
		enrollmentStatus: "active",
		teacher: {
			name: "Cô Lan",
			email: "lan@test.local",
			image: null,
		},
		...overrides,
	};
}

describe("ClassCard — paused class state (#694)", () => {
	it("shows Tạm dừng badge and disables Tham gia lớp when invited to a paused class", () => {
		const onAccept = vi.fn();
		render(
			<ClassCard
				cls={makeClass({
					status: "paused",
					enrollmentStatus: "invited",
				})}
				onAccept={onAccept}
			/>,
		);

		expect(screen.getByText("Tạm dừng")).toBeTruthy();
		expect(
			screen.getByText("Lớp đang tạm dừng — chưa thể tham gia"),
		).toBeTruthy();

		const joinBtn = screen.getByRole("button", { name: "Tham gia lớp" });
		expect((joinBtn as HTMLButtonElement).disabled).toBe(true);
		fireEvent.click(joinBtn);
		expect(onAccept).not.toHaveBeenCalled();
	});

	it("shows Lớp đang tạm dừng instead of Chưa có lịch buổi tới while keeping class link and assignments accessible", () => {
		const assignment: StudentAssignment = {
			id: "asg-1",
			title: "Essay Practice",
			source: "class_assignment",
			classId: "cls-1",
			className: "IELTS 6.5",
			due: "2026-11-25",
			submittedAt: null,
			scores: null,
		};

		render(
			<ClassCard
				cls={makeClass({
					status: "paused",
					enrollmentStatus: "active",
					nextSession: null,
				})}
				assignments={[assignment]}
				todayISO="2026-11-20"
				nowMs={new Date("2026-11-20T03:00:00Z").getTime()}
			/>,
		);

		expect(screen.getByText("Tạm dừng")).toBeTruthy();
		expect(screen.getByText("Lớp đang tạm dừng")).toBeTruthy();
		expect(screen.queryByText("Chưa có lịch buổi tới")).toBeNull();
		expect(
			screen.getByRole("link", { name: "IELTS 6.5" }).getAttribute("href"),
		).toBe("/classes/cls-1");
		expect(screen.getByText("Essay Practice")).toBeTruthy();
	});
});

describe("ClassCard — Google Meet link (#816)", () => {
	it("renders prominent 'Vào lớp (Google Meet)' link with z-10 above stretched card link when active and nextSession has meetUrl", () => {
		render(
			<ClassCard
				cls={makeClass({
					status: "active",
					enrollmentStatus: "active",
					nextSession: {
						date: "2026-11-22",
						time: "19:00",
						topic: "Speaking Part 2",
						meetUrl: "https://meet.google.com/abc-defg-hij",
					},
				})}
			/>,
		);

		const meetLink = screen.getByRole("link", {
			name: "Vào lớp (Google Meet)",
		});
		expect(meetLink.getAttribute("href")).toBe(
			"https://meet.google.com/abc-defg-hij",
		);
		expect(meetLink.getAttribute("target")).toBe("_blank");
		expect(meetLink.getAttribute("rel")).toBe("noopener noreferrer");
		expect(meetLink.className).toContain("relative");
		expect(meetLink.className).toContain("z-10");
	});

	it("does not render Meet link when nextSession.meetUrl is missing or null", () => {
		render(
			<ClassCard
				cls={makeClass({
					nextSession: {
						date: "2026-11-22",
						time: "19:00",
						topic: "Speaking Part 2",
						meetUrl: null,
					},
				})}
			/>,
		);

		expect(
			screen.queryByRole("link", { name: "Vào lớp (Google Meet)" }),
		).toBeNull();
	});

	it("does not render Meet link when class is paused even if nextSession has meetUrl", () => {
		render(
			<ClassCard
				cls={makeClass({
					status: "paused",
					enrollmentStatus: "active",
					nextSession: {
						date: "2026-11-22",
						time: "19:00",
						topic: "Speaking Part 2",
						meetUrl: "https://meet.google.com/paused-cls",
					},
				})}
			/>,
		);

		expect(
			screen.queryByRole("link", { name: "Vào lớp (Google Meet)" }),
		).toBeNull();
	});

	it("does not render Meet link when enrollmentStatus is invited", () => {
		render(
			<ClassCard
				cls={makeClass({
					status: "active",
					enrollmentStatus: "invited",
					nextSession: {
						date: "2026-11-22",
						time: "19:00",
						topic: "Speaking Part 2",
						meetUrl: "https://meet.google.com/invited-cls",
					},
				})}
				onAccept={vi.fn()}
			/>,
		);

		expect(
			screen.queryByRole("link", { name: "Vào lớp (Google Meet)" }),
		).toBeNull();
	});
});
