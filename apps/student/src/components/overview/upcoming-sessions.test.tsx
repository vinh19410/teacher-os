// @vitest-environment jsdom

import type { StudentClass } from "@teacher-os/api/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UpcomingSessions } from "./upcoming-sessions";

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
		nextSession: {
			date: "2026-11-22",
			time: "19:00",
			topic: "Speaking Part 2",
			joinUrl: "https://zoom.us/j/123456789",
		},
		enrollmentId: "enr-1",
		enrollmentStatus: "active",
		teacher: null,
		...overrides,
	};
}

describe("UpcomingSessions — Zoom link", () => {
	it("renders 'Vào lớp (Zoom)' link when class is active and nextSession has joinUrl", () => {
		render(<UpcomingSessions classes={[makeClass()]} />);

		const meetLink = screen.getByRole("link", {
			name: "Vào lớp (Zoom)",
		});
		expect(meetLink.getAttribute("href")).toBe("https://zoom.us/j/123456789");
		expect(meetLink.getAttribute("target")).toBe("_blank");
		expect(meetLink.getAttribute("rel")).toBe("noopener noreferrer");
	});

	it("hides Zoom link when class is paused even if nextSession has joinUrl", () => {
		render(
			<UpcomingSessions
				classes={[
					makeClass({
						status: "paused",
					}),
				]}
			/>,
		);

		expect(screen.getByText("IELTS 6.5")).toBeTruthy();
		expect(screen.queryByRole("link", { name: "Vào lớp (Zoom)" })).toBeNull();
	});

	it("hides Zoom link when session.joinUrl is missing or null", () => {
		render(
			<UpcomingSessions
				classes={[
					makeClass({
						nextSession: {
							date: "2026-11-22",
							time: "19:00",
							topic: "Reading",
							joinUrl: null,
						},
					}),
				]}
			/>,
		);

		expect(screen.getByText("IELTS 6.5")).toBeTruthy();
		expect(screen.queryByRole("link", { name: "Vào lớp (Zoom)" })).toBeNull();
	});

	it("hides entire card when enrollmentStatus is invited even if nextSession is attached", () => {
		const { container } = render(
			<UpcomingSessions
				classes={[
					makeClass({
						enrollmentStatus: "invited",
					}),
				]}
			/>,
		);

		expect(container.firstChild).toBeNull();
	});
});
