// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

const meetRepo = vi.hoisted(() => ({
	createSessionMeet: vi.fn(),
	syncSessionRecording: vi.fn(),
	updateSessionRecording: vi.fn(),
}));
vi.mock("@/lib/repos/google-meet", () => meetRepo);

import { SessionMeetPanel } from "./session-meet-panel";

beforeEach(() => {
	toast.success.mockReset();
	toast.error.mockReset();
	toast.info.mockReset();
	meetRepo.createSessionMeet.mockReset();
	meetRepo.syncSessionRecording.mockReset();
	meetRepo.updateSessionRecording.mockReset();
});

afterEach(cleanup);

describe("SessionMeetPanel", () => {
	it("creates Google Meet link when missing and refreshes", async () => {
		const onRefreshed = vi.fn().mockResolvedValue(true);
		meetRepo.createSessionMeet.mockResolvedValue({
			meetUrl: "https://meet.google.com/abc-defg-hij",
			googleCalendarEventId: "evt-1",
			googleMeetCode: "abc-defg-hij",
			warning: null,
		});

		render(
			<SessionMeetPanel
				classId="cls-1"
				dateISO="2026-11-20"
				zoom=""
				status="upcoming"
				onRefreshed={onRefreshed}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /Tạo link Meet/i }));

		await waitFor(() =>
			expect(meetRepo.createSessionMeet).toHaveBeenCalledWith(
				"cls-1",
				"2026-11-20",
			),
		);
		await waitFor(() => expect(onRefreshed).toHaveBeenCalledTimes(1));
		expect(toast.success).toHaveBeenCalled();
	});

	it("shows Meet link, recording link, and allows manual sync & manual edit", async () => {
		const onRefreshed = vi.fn().mockResolvedValue(true);
		meetRepo.syncSessionRecording.mockResolvedValue({
			status: "ready",
			recordingUrl: "https://drive.google.com/file/d/rec-1/view",
			syncedAt: "2026-11-20T14:00:00Z",
			message: null,
		});

		render(
			<SessionMeetPanel
				classId="cls-1"
				dateISO="2026-11-20"
				zoom="https://meet.google.com/abc-defg-hij"
				status="completed"
				meeting={{
					id: "m-1",
					classId: "cls-1",
					date: "2026-11-20",
					meetUrl: "https://meet.google.com/abc-defg-hij",
					googleCalendarEventId: "evt-1",
					googleMeetCode: "abc-defg-hij",
					recordingUrl: "",
					recordingStatus: "pending",
					recordingError: null,
					recordingSyncedAt: null,
				}}
				onRefreshed={onRefreshed}
			/>,
		);

		const meetLink = screen.getByRole("link", { name: /Mở Google Meet/i });
		expect(meetLink.getAttribute("href")).toBe(
			"https://meet.google.com/abc-defg-hij",
		);
		expect(screen.getByText("Đang chờ recording")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /Đồng bộ recording/i }));
		await waitFor(() =>
			expect(meetRepo.syncSessionRecording).toHaveBeenCalledWith(
				"cls-1",
				"2026-11-20",
			),
		);
		expect(onRefreshed).toHaveBeenCalledTimes(1);
	});
});
