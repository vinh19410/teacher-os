// @vitest-environment jsdom

import type { StudentClass } from "@teacher-os/api/contracts";
import { ZOOM_JOIN_ERROR_CODES } from "@teacher-os/api/zoom-window";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestStudentZoomJoin } from "@/lib/repos/student";
import { UpcomingSessions } from "./upcoming-sessions";

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

const INSIDE_WINDOW_MS = Date.parse("2026-11-22T11:45:00Z"); // 18:45 VN
const TOO_EARLY_MS = Date.parse("2026-11-22T10:00:00Z"); // 17:00 VN

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
			dur: 90,
			topic: "Speaking Part 2",
			hasZoom: true,
		},
		enrollmentId: "enr-1",
		enrollmentStatus: "active",
		teacher: null,
		...overrides,
	};
}

describe("UpcomingSessions — Zoom join button", () => {
	let openSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		openSpy = vi.spyOn(window, "open");
	});

	afterEach(() => {
		openSpy.mockRestore();
		cleanup();
	});

	it("renders 'Vào lớp (Zoom)' button when class is active and nextSession hasZoom and opens Zoom inside window", async () => {
		const fakeWin = {
			opener: window as Window | null,
			closed: false,
			close: vi.fn(),
			location: { assign: vi.fn() },
		};
		openSpy.mockReturnValue(fakeWin as unknown as Window);
		vi.mocked(requestStudentZoomJoin).mockResolvedValueOnce({
			ok: true,
			data: {
				joinUrl: "https://zoom.us/j/123456789",
				openAt: "2026-11-22T11:30:00.000Z",
				closeAt: "2026-11-22T13:30:00.000Z",
			},
		});

		render(
			<UpcomingSessions classes={[makeClass()]} nowMs={INSIDE_WINDOW_MS} />,
		);

		const meetBtn = screen.getByRole("button", {
			name: "Vào lớp (Zoom)",
		});
		fireEvent.click(meetBtn);

		await waitFor(() => {
			expect(requestStudentZoomJoin).toHaveBeenCalledWith(
				"cls-1",
				"2026-11-22",
			);
			expect(fakeWin.location.assign).toHaveBeenCalledWith(
				"https://zoom.us/j/123456789",
			);
		});
	});

	it("shows info toast when clicking 'Vào lớp (Zoom)' outside window", async () => {
		const msg =
			"Chưa đến giờ vào lớp. Link Zoom chỉ mở từ 18:30 đến 20:30 ngày 22/11/2026 (được vào sớm 30 phút).";
		vi.mocked(requestStudentZoomJoin).mockResolvedValueOnce({
			ok: false,
			status: 403,
			error: {
				error: msg,
				code: ZOOM_JOIN_ERROR_CODES.TOO_EARLY,
			},
		});

		render(<UpcomingSessions classes={[makeClass()]} nowMs={TOO_EARLY_MS} />);

		fireEvent.click(screen.getByRole("button", { name: "Vào lớp (Zoom)" }));

		await waitFor(() => {
			expect(toast.info).toHaveBeenCalledWith(msg);
		});
		expect(openSpy).not.toHaveBeenCalled();
	});

	it("hides Zoom button when class is paused even if nextSession hasZoom", () => {
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
		expect(screen.queryByRole("button", { name: "Vào lớp (Zoom)" })).toBeNull();
	});

	it("hides Zoom button when session hasZoom is false/absent and joinUrl is null", () => {
		render(
			<UpcomingSessions
				classes={[
					makeClass({
						nextSession: {
							date: "2026-11-22",
							time: "19:00",
							topic: "Reading",
							hasZoom: false,
							joinUrl: null,
						},
					}),
				]}
			/>,
		);

		expect(screen.getByText("IELTS 6.5")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Vào lớp (Zoom)" })).toBeNull();
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
