// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
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
	sessionRecordingVideoUrl: vi.fn(
		(classId: string, dateISO: string) =>
			`http://localhost:8000/api/classes/${encodeURIComponent(classId)}/sessions/${encodeURIComponent(dateISO)}/recording/video`,
	),
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
	zoomRepo.sessionRecordingVideoUrl.mockClear();
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

	it("opens in-app RecordingPlayerModal for R2 videos, hides passcode, and shows VN expiry date", () => {
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
					recordingPassword: "ShouldNotShow",
					recordingUrl: "",
					recordingStatus: "ready",
					recordingSource: "r2",
					hasRecordingVideo: true,
					recordingExpiresAt: "2027-02-18T18:30:00Z",
					recordingError: null,
					recordingSyncedAt: "2026-11-20T14:00:00Z",
				}}
				onRefreshed={vi.fn().mockResolvedValue(true)}
			/>,
		);

		expect(screen.getByText("Đã có recording")).toBeTruthy();
		expect(screen.getByText("Lưu đến 19/02/2027")).toBeTruthy();
		expect(screen.queryByText(/Mật khẩu recording/i)).toBeNull();
		expect(screen.queryByText("ShouldNotShow")).toBeNull();
		expect(screen.queryByRole("link", { name: /Xem recording/i })).toBeNull();

		const playBtn = screen.getByRole("button", { name: /Xem recording/i });
		fireEvent.click(playBtn);

		const dialog = screen.getByRole("dialog");
		const video = dialog.querySelector("video") as HTMLVideoElement | null;
		expect(video).not.toBeNull();
		expect(video?.getAttribute("controlslist")).toBe("nodownload");
		expect(video?.getAttribute("src")).toBe(
			"http://localhost:8000/api/classes/cls-1/sessions/2026-11-20/recording/video",
		);
		expect(
			within(dialog).getByText(
				"Lưu trữ đến 19/02/2027 (tự động xóa sau 90 ngày)",
			),
		).toBeTruthy();

		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("shows expired retention badge when recordingStatus is expired", () => {
		render(
			<SessionZoomPanel
				classId="cls-1"
				dateISO="2026-08-01"
				zoom="https://zoom.us/j/123456789"
				status="completed"
				meeting={{
					id: "m-1",
					classId: "cls-1",
					date: "2026-08-01",
					joinUrl: "https://zoom.us/j/123456789",
					zoomMeetingId: "123456789",
					recordingPassword: null,
					recordingUrl: "",
					recordingStatus: "expired",
					hasRecordingVideo: false,
					recordingExpiresAt: "2026-10-30T14:00:00Z",
					recordingError: null,
					recordingSyncedAt: "2026-08-01T14:00:00Z",
				}}
				onRefreshed={vi.fn().mockResolvedValue(true)}
			/>,
		);

		expect(screen.getByText("Đã hết hạn lưu trữ (90 ngày)")).toBeTruthy();
		expect(screen.queryByRole("button", { name: /Xem recording/i })).toBeNull();
		expect(screen.queryByRole("link", { name: /Xem recording/i })).toBeNull();
	});

	it("shows fallback Zoom badge, error text, external recording link, and passcode when R2 sync failed with Zoom link", () => {
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
					recordingPassword: "FallBack99",
					recordingUrl: "https://zoom.us/rec/share/fallback-1",
					recordingStatus: "failed",
					hasRecordingVideo: false,
					recordingError: "Tải lên R2 thất bại — tạm giữ link Zoom",
					recordingSyncedAt: "2026-11-20T14:00:00Z",
				}}
				onRefreshed={vi.fn().mockResolvedValue(true)}
			/>,
		);

		expect(screen.getByText("Tạm dùng link Zoom")).toBeTruthy();
		expect(
			screen.getByText("Tải lên R2 thất bại — tạm giữ link Zoom"),
		).toBeTruthy();
		const link = screen.getByRole("link", { name: /Xem recording/i });
		expect(link.getAttribute("href")).toBe(
			"https://zoom.us/rec/share/fallback-1",
		);
		expect(screen.getByText("FallBack99")).toBeTruthy();
	});

	it("toasts R2 success and fallback info messages on sync", async () => {
		const onRefreshed = vi.fn().mockResolvedValue(true);
		zoomRepo.syncSessionRecording
			.mockResolvedValueOnce({
				status: "ready",
				recordingUrl: "",
				recordingSource: "r2",
				hasRecordingVideo: true,
				recordingExpiresAt: "2027-02-18T14:00:00Z",
				syncedAt: "2026-11-20T14:00:00Z",
				message: null,
			})
			.mockResolvedValueOnce({
				status: "failed",
				recordingUrl: "https://zoom.us/rec/share/fallback-2",
				hasRecordingVideo: false,
				syncedAt: "2026-11-20T14:05:00Z",
				message: "File vượt giới hạn, tạm dùng link Zoom.",
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

		const syncBtn = screen.getByRole("button", { name: /Đồng bộ recording/i });
		fireEvent.click(syncBtn);
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith(
				"Đã lưu recording lên R2 cho buổi học.",
			),
		);

		fireEvent.click(syncBtn);
		await waitFor(() =>
			expect(toast.info).toHaveBeenCalledWith(
				"File vượt giới hạn, tạm dùng link Zoom.",
			),
		);
	});
});
