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

const zoomRepo = vi.hoisted(() => ({
	createSessionZoom: vi.fn(),
	syncSessionRecording: vi.fn(),
	updateSessionRecording: vi.fn(),
}));
vi.mock("@/lib/repos/zoom-meeting", () => zoomRepo);

import { SessionZoomPanel } from "./session-zoom-panel";

beforeEach(() => {
	toast.success.mockReset();
	toast.error.mockReset();
	toast.info.mockReset();
	zoomRepo.createSessionZoom.mockReset();
	zoomRepo.syncSessionRecording.mockReset();
	zoomRepo.updateSessionRecording.mockReset();
});

afterEach(cleanup);

describe("SessionZoomPanel", () => {
	it("creates Zoom link when missing and refreshes", async () => {
		const onRefreshed = vi.fn().mockResolvedValue(true);
		zoomRepo.createSessionZoom.mockResolvedValue({
			joinUrl: "https://zoom.us/j/123456789",
			zoomMeetingId: "123456789",
			warning: null,
		});

		render(
			<SessionZoomPanel
				classId="cls-1"
				dateISO="2026-11-20"
				zoom=""
				status="upcoming"
				onRefreshed={onRefreshed}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /Tạo link Zoom/i }));

		await waitFor(() =>
			expect(zoomRepo.createSessionZoom).toHaveBeenCalledWith(
				"cls-1",
				"2026-11-20",
			),
		);
		await waitFor(() => expect(onRefreshed).toHaveBeenCalledTimes(1));
		expect(toast.success).toHaveBeenCalled();
	});

	it("shows Zoom link, recording link, and allows manual sync & manual edit", async () => {
		const onRefreshed = vi.fn().mockResolvedValue(true);
		zoomRepo.syncSessionRecording.mockResolvedValue({
			status: "ready",
			recordingUrl: "https://zoom.us/rec/share/rec-1",
			syncedAt: "2026-11-20T14:00:00Z",
			message: null,
		});

		render(
			<SessionZoomPanel
				classId="cls-1"
				dateISO="2026-11-20"
				zoom="https://zoom.us/j/123456789"
				status="completed"
				meeting={{
					id: "m-1",
					classId: "cls-1",
					date: "2026-11-20",
					joinUrl: "https://zoom.us/j/123456789",
					zoomMeetingId: "123456789",
					recordingPassword: null,
					recordingUrl: "",
					recordingStatus: "pending",
					recordingError: null,
					recordingSyncedAt: null,
				}}
				onRefreshed={onRefreshed}
			/>,
		);

		const zoomLink = screen.getByRole("link", { name: /Mở Zoom/i });
		expect(zoomLink.getAttribute("href")).toBe("https://zoom.us/j/123456789");
		expect(screen.getByText("Đang chờ recording")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /Đồng bộ recording/i }));
		await waitFor(() =>
			expect(zoomRepo.syncSessionRecording).toHaveBeenCalledWith(
				"cls-1",
				"2026-11-20",
			),
		);
		expect(onRefreshed).toHaveBeenCalledTimes(1);
	});

	it("shows the recording passcode with a copy button when ready", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText },
			configurable: true,
		});
		render(
			<SessionZoomPanel
				classId="cls-1"
				dateISO="2026-11-20"
				zoom="https://zoom.us/j/123456789"
				status="completed"
				meeting={{
					id: "m-1",
					classId: "cls-1",
					date: "2026-11-20",
					joinUrl: "https://zoom.us/j/123456789",
					zoomMeetingId: "123456789",
					recordingPassword: "Ab3dEf",
					recordingUrl: "https://zoom.us/rec/share/rec-1",
					recordingStatus: "ready",
					recordingError: null,
					recordingSyncedAt: "2026-11-20T14:00:00Z",
				}}
				onRefreshed={vi.fn().mockResolvedValue(true)}
			/>,
		);

		expect(screen.getByText("Ab3dEf")).toBeTruthy();
		fireEvent.click(
			screen.getByRole("button", { name: "Sao chép mật khẩu recording" }),
		);
		await waitFor(() => expect(writeText).toHaveBeenCalledWith("Ab3dEf"));
	});

	it("shows the failure badge and recordingError when recording failed", () => {
		render(
			<SessionZoomPanel
				classId="cls-1"
				dateISO="2026-11-20"
				zoom="https://zoom.us/j/123456789"
				status="completed"
				meeting={{
					id: "m-1",
					classId: "cls-1",
					date: "2026-11-20",
					joinUrl: "https://zoom.us/j/123456789",
					zoomMeetingId: "123456789",
					recordingPassword: null,
					recordingUrl: "",
					recordingStatus: "failed",
					recordingError: "Dung lượng cloud đã đầy",
					recordingSyncedAt: null,
				}}
				onRefreshed={vi.fn().mockResolvedValue(true)}
			/>,
		);

		expect(screen.getByText("Recording lỗi")).toBeTruthy();
		expect(screen.getByText("Dung lượng cloud đã đầy").className).toContain(
			"text-destructive",
		);
	});
});
