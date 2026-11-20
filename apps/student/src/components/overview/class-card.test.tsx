// @vitest-environment jsdom

import type {
	StudentAssignment,
	StudentClass,
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

describe("ClassCard — Zoom join button", () => {
	let openSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		openSpy = vi.spyOn(window, "open");
	});

	afterEach(() => {
		openSpy.mockRestore();
	});

	it("renders prominent 'Vào lớp (Zoom)' button with z-10 above stretched card link and opens Zoom inside window", async () => {
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
			<ClassCard
				cls={makeClass({
					status: "active",
					enrollmentStatus: "active",
					nextSession: {
						date: "2026-11-22",
						time: "19:00",
						dur: 90,
						topic: "Speaking Part 2",
						hasZoom: true,
					},
				})}
				zoomNowMs={INSIDE_WINDOW_MS}
			/>,
		);

		const meetBtn = screen.getByRole("button", {
			name: "Vào lớp (Zoom)",
		});
		expect(meetBtn.className).toContain("relative");
		expect(meetBtn.className).toContain("z-10");

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

		render(
			<ClassCard
				cls={makeClass({
					status: "active",
					enrollmentStatus: "active",
					nextSession: {
						date: "2026-11-22",
						time: "19:00",
						dur: 90,
						topic: "Speaking Part 2",
						hasZoom: true,
					},
				})}
				zoomNowMs={TOO_EARLY_MS}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Vào lớp (Zoom)" }));

		await waitFor(() => {
			expect(toast.info).toHaveBeenCalledWith(msg);
		});
		expect(openSpy).not.toHaveBeenCalled();
	});

	it("does not render Zoom button when nextSession.hasZoom is false/absent and joinUrl is null", () => {
		render(
			<ClassCard
				cls={makeClass({
					nextSession: {
						date: "2026-11-22",
						time: "19:00",
						topic: "Speaking Part 2",
						hasZoom: false,
						joinUrl: null,
					},
				})}
			/>,
		);

		expect(screen.queryByRole("button", { name: "Vào lớp (Zoom)" })).toBeNull();
	});

	it("does not render Zoom button when class is paused even if nextSession hasZoom", () => {
		render(
			<ClassCard
				cls={makeClass({
					status: "paused",
					enrollmentStatus: "active",
					nextSession: {
						date: "2026-11-22",
						time: "19:00",
						topic: "Speaking Part 2",
						hasZoom: true,
					},
				})}
			/>,
		);

		expect(screen.queryByRole("button", { name: "Vào lớp (Zoom)" })).toBeNull();
	});

	it("does not render Zoom button when enrollmentStatus is invited", () => {
		render(
			<ClassCard
				cls={makeClass({
					status: "active",
					enrollmentStatus: "invited",
					nextSession: {
						date: "2026-11-22",
						time: "19:00",
						topic: "Speaking Part 2",
						hasZoom: true,
					},
				})}
				onAccept={vi.fn()}
			/>,
		);

		expect(screen.queryByRole("button", { name: "Vào lớp (Zoom)" })).toBeNull();
	});
});
