// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	formatRecordingExpiryVN,
	RecordingPlayerModal,
} from "./recording-player-modal";

afterEach(() => {
	cleanup();
});

describe("formatRecordingExpiryVN", () => {
	it("formats ISO timestamps into dd/mm/yyyy in Asia/Ho_Chi_Minh timezone", () => {
		// 18:30 UTC ngày 26/11 -> 01:30 ngày 27/11 giờ Việt Nam (UTC+7)
		expect(formatRecordingExpiryVN("2026-11-26T18:30:00Z")).toBe("27/11/2026");
		expect(formatRecordingExpiryVN("2027-02-05T00:00:00.000Z")).toBe(
			"05/02/2027",
		);
	});

	it("returns null for empty, nullish, or invalid values", () => {
		expect(formatRecordingExpiryVN(null)).toBeNull();
		expect(formatRecordingExpiryVN(undefined)).toBeNull();
		expect(formatRecordingExpiryVN("")).toBeNull();
		expect(formatRecordingExpiryVN("   ")).toBeNull();
		expect(formatRecordingExpiryVN("not-a-valid-date")).toBeNull();
	});
});

describe("RecordingPlayerModal", () => {
	it("returns null when closed", () => {
		render(
			<RecordingPlayerModal
				open={false}
				onClose={vi.fn()}
				title="Recording buổi 1"
				videoUrl="http://localhost:8000/api/classes/c1/sessions/2026-11-20/recording/video"
			/>,
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("renders video with controlsList=nodownload, blocks context menu, displays VN expiry, and renders zero download links/buttons", () => {
		render(
			<RecordingPlayerModal
				open={true}
				onClose={vi.fn()}
				title="Recording — Writing Task 2"
				subtitle="Thứ Sáu, 20/11 · 19:00–20:30"
				videoUrl="http://localhost:8000/api/classes/c1/sessions/2026-11-20/recording/video"
				expiresAt="2027-02-18T18:30:00Z"
			/>,
		);

		const dialog = screen.getByRole("dialog", {
			name: "Recording — Writing Task 2",
		});
		expect(dialog.getAttribute("aria-modal")).toBe("true");
		expect(
			within(dialog).getByText("Thứ Sáu, 20/11 · 19:00–20:30"),
		).toBeTruthy();

		const video = dialog.querySelector("video") as HTMLVideoElement | null;
		expect(video).not.toBeNull();
		expect(video?.controls).toBe(true);
		expect(video?.getAttribute("controlslist")).toBe("nodownload");
		expect(video?.getAttribute("preload")).toBe("metadata");
		expect(video?.hasAttribute("playsinline")).toBe(true);
		expect(video?.getAttribute("src")).toBe(
			"http://localhost:8000/api/classes/c1/sessions/2026-11-20/recording/video",
		);

		const ctxEvent = new MouseEvent("contextmenu", {
			bubbles: true,
			cancelable: true,
		});
		video?.dispatchEvent(ctxEvent);
		expect(ctxEvent.defaultPrevented).toBe(true);

		expect(
			within(dialog).getByText(
				"Lưu trữ đến 19/02/2027 (tự động xóa sau 90 ngày)",
			),
		).toBeTruthy();

		// Tuyệt đối không có nút hay link tải video xuống.
		expect(dialog.querySelector("a")).toBeNull();
		expect(within(dialog).queryByRole("link")).toBeNull();
		expect(
			within(dialog).queryByRole("button", { name: /tải xuống|download/i }),
		).toBeNull();
	});

	it("closes on close button, backdrop click, and Escape without leaking Escape to underlying modal listeners", () => {
		const underlyingEscape = vi.fn();
		const docBubbleListener = (event: KeyboardEvent) => {
			if (event.key === "Escape") underlyingEscape();
		};
		document.addEventListener("keydown", docBubbleListener);

		try {
			const onClose = vi.fn();
			render(
				<RecordingPlayerModal
					open={true}
					onClose={onClose}
					title="Recording buổi 2"
					videoUrl="http://localhost:8000/video.mp4"
				/>,
			);

			const dialog = screen.getByRole("dialog", { name: "Recording buổi 2" });
			const closeBtn = within(dialog).getByRole("button", { name: "Đóng" });
			expect(document.activeElement).toBe(closeBtn);
			expect(closeBtn.className).toContain(
				"focus-visible:shadow-[var(--focus-ring)]",
			);

			fireEvent.keyDown(document, { key: "Escape" });
			expect(onClose).toHaveBeenCalledTimes(1);
			expect(underlyingEscape).not.toHaveBeenCalled();

			fireEvent.click(closeBtn);
			expect(onClose).toHaveBeenCalledTimes(2);

			// Backdrop click đóng modal
			const backdrop = dialog.parentElement as HTMLElement;
			fireEvent.pointerDown(backdrop);
			fireEvent.click(backdrop);
			expect(onClose).toHaveBeenCalledTimes(3);

			// Drag từ bên trong dialog thả ra backdrop KHÔNG đóng modal
			fireEvent.pointerDown(dialog);
			fireEvent.click(backdrop);
			expect(onClose).toHaveBeenCalledTimes(3);
		} finally {
			document.removeEventListener("keydown", docBubbleListener);
		}
	});

	it("moves focus into close button on open and restores focus on close", () => {
		function Harness() {
			const [open, setOpen] = useState(false);
			return (
				<div>
					<button type="button" onClick={() => setOpen(true)}>
						Mở video
					</button>
					<RecordingPlayerModal
						open={open}
						onClose={() => setOpen(false)}
						title="Recording buổi 3"
						videoUrl="http://localhost:8000/video.mp4"
					/>
				</div>
			);
		}

		render(<Harness />);
		const trigger = screen.getByRole("button", { name: "Mở video" });
		trigger.focus();
		expect(document.activeElement).toBe(trigger);

		fireEvent.click(trigger);
		const closeBtn = screen.getByRole("button", { name: "Đóng" });
		expect(document.activeElement).toBe(closeBtn);

		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it("renders error banner on video error, retries cleanly, traps Tab focus, and resets error on videoUrl/open change", () => {
		const { rerender } = render(
			<RecordingPlayerModal
				open={true}
				onClose={vi.fn()}
				title="Recording buổi 4"
				videoUrl="http://localhost:8000/video-1.mp4"
			/>,
		);

		const dialog = screen.getByRole("dialog", { name: "Recording buổi 4" });
		const video = dialog.querySelector("video") as HTMLVideoElement;
		fireEvent.error(video);

		const alert = within(dialog).getByRole("alert");
		expect(alert.textContent).toContain(
			"Không phát được video recording. Video có thể đã hết hạn lưu trữ (90 ngày) hoặc kết nối bị gián đoạn.",
		);

		const closeBtn = within(dialog).getByRole("button", { name: "Đóng" });
		const retryBtn = within(dialog).getByRole("button", {
			name: "Thử tải lại",
		});

		// Kiểm tra Tab focus trap giữa nút Đóng và nút Thử tải lại
		retryBtn.focus();
		fireEvent.keyDown(retryBtn, { key: "Tab" });
		expect(document.activeElement).toBe(closeBtn);

		fireEvent.keyDown(closeBtn, { key: "Tab", shiftKey: true });
		expect(document.activeElement).toBe(retryBtn);

		// Bấm Thử tải lại -> ẩn banner lỗi và mount lại thẻ video
		fireEvent.click(retryBtn);
		expect(within(dialog).queryByRole("alert")).toBeNull();
		const reloadedVideo = dialog.querySelector("video") as HTMLVideoElement;
		expect(reloadedVideo).not.toBeNull();
		expect(reloadedVideo.getAttribute("src")).toBe(
			"http://localhost:8000/video-1.mp4",
		);

		// Kích lỗi lần 2 rồi đổi videoUrl -> tự reset trạng thái lỗi
		fireEvent.error(reloadedVideo);
		expect(within(dialog).getByRole("alert")).toBeTruthy();

		rerender(
			<RecordingPlayerModal
				open={true}
				onClose={vi.fn()}
				title="Recording buổi 4"
				videoUrl="http://localhost:8000/video-2.mp4"
			/>,
		);
		expect(within(dialog).queryByRole("alert")).toBeNull();
		expect(dialog.querySelector("video")?.getAttribute("src")).toBe(
			"http://localhost:8000/video-2.mp4",
		);
	});
});
