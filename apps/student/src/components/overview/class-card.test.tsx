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
