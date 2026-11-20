// @vitest-environment jsdom

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
import {
	requestStudentZoomJoin,
	type StudentZoomJoinResult,
} from "@/lib/repos/student";
import { ZoomJoinButton } from "./zoom-join-button";

vi.mock("sonner", () => ({
	toast: {
		info: vi.fn(),
		error: vi.fn(),
		success: vi.fn(),
	},
}));

// 2026-11-22 19:00–20:30 VN (UTC+7):
// open  = 18:30 VN = 2026-11-22T11:30:00Z
// start = 19:00 VN = 2026-11-22T12:00:00Z
// close = 20:30 VN = 2026-11-22T13:30:00Z
const SESSION_DATE = "2026-11-22";
const SESSION_TIME = "19:00";
const SESSION_DUR = 90;
const INSIDE_WINDOW_MS = Date.parse("2026-11-22T11:45:00Z"); // 18:45 VN
const TOO_EARLY_MS = Date.parse("2026-11-22T10:00:00Z"); // 17:00 VN
const ENDED_MS = Date.parse("2026-11-22T14:00:00Z"); // 21:00 VN

function makeFakeWindow() {
	return {
		opener: window as Window | null,
		closed: false,
		close: vi.fn(function (this: { closed: boolean }) {
			this.closed = true;
		}),
		location: {
			assign: vi.fn(),
		},
	};
}

describe("ZoomJoinButton", () => {
	let openSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		openSpy = vi.spyOn(window, "open");
	});

	afterEach(() => {
		openSpy.mockRestore();
		cleanup();
	});

	it("opens tab inside window with opener=null, calls server, and navigates to returned joinUrl", async () => {
		const fakeWin = makeFakeWindow();
		openSpy.mockReturnValue(fakeWin as unknown as Window);
		const onRequestJoin = vi.fn(
			async (): Promise<StudentZoomJoinResult> => ({
				ok: true,
				data: {
					joinUrl: "https://zoom.us/j/999888777",
					openAt: "2026-11-22T11:30:00.000Z",
					closeAt: "2026-11-22T13:30:00.000Z",
				},
			}),
		);

		render(
			<ZoomJoinButton
				classId="cls-1"
				date={SESSION_DATE}
				time={SESSION_TIME}
				dur={SESSION_DUR}
				nowMs={INSIDE_WINDOW_MS}
				onRequestJoin={onRequestJoin}
			/>,
		);

		const button = screen.getByRole("button", { name: "Vào lớp (Zoom)" });
		fireEvent.click(button);

		await waitFor(() => {
			expect(onRequestJoin).toHaveBeenCalledWith("cls-1", SESSION_DATE);
			expect(fakeWin.location.assign).toHaveBeenCalledWith(
				"https://zoom.us/j/999888777",
			);
		});

		expect(openSpy).toHaveBeenCalledTimes(1);
		expect(openSpy).toHaveBeenCalledWith("", "_blank");
		expect(fakeWin.opener).toBeNull();
		expect(fakeWin.close).not.toHaveBeenCalled();
		expect(toast.info).not.toHaveBeenCalled();
		expect(toast.error).not.toHaveBeenCalled();
	});

	it("does not pre-open blank tab when locally TOO_EARLY, calls server, and shows toast.info", async () => {
		const serverMsg =
			"Chưa đến giờ vào lớp. Link Zoom chỉ mở từ 18:30 đến 20:30 ngày 22/11/2026 (được vào sớm 30 phút).";
		const onRequestJoin = vi.fn(
			async (): Promise<StudentZoomJoinResult> => ({
				ok: false,
				status: 403,
				error: {
					error: serverMsg,
					code: ZOOM_JOIN_ERROR_CODES.TOO_EARLY,
					date: SESSION_DATE,
					time: SESSION_TIME,
					dur: SESSION_DUR,
					openAt: "2026-11-22T11:30:00.000Z",
					closeAt: "2026-11-22T13:30:00.000Z",
				},
			}),
		);

		render(
			<ZoomJoinButton
				classId="cls-1"
				date={SESSION_DATE}
				time={SESSION_TIME}
				dur={SESSION_DUR}
				nowMs={TOO_EARLY_MS}
				onRequestJoin={onRequestJoin}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Vào lớp (Zoom)" }));

		await waitFor(() => {
			expect(onRequestJoin).toHaveBeenCalledWith("cls-1", SESSION_DATE);
			expect(toast.info).toHaveBeenCalledWith(serverMsg);
		});

		expect(openSpy).not.toHaveBeenCalled();
		expect(toast.error).not.toHaveBeenCalled();
	});

	it("does not pre-open blank tab when locally ENDED, calls server, and shows toast.info with ended message", async () => {
		const endedMsg =
			"Buổi học đã kết thúc (19:00 – 20:30 ngày 22/11/2026). Link Zoom không còn hiệu lực.";
		const onRequestJoin = vi.fn(
			async (): Promise<StudentZoomJoinResult> => ({
				ok: false,
				status: 403,
				error: {
					error: endedMsg,
					code: ZOOM_JOIN_ERROR_CODES.ENDED,
					date: SESSION_DATE,
					time: SESSION_TIME,
					dur: SESSION_DUR,
				},
			}),
		);

		render(
			<ZoomJoinButton
				classId="cls-1"
				date={SESSION_DATE}
				time={SESSION_TIME}
				dur={SESSION_DUR}
				nowMs={ENDED_MS}
				onRequestJoin={onRequestJoin}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Vào lớp (Zoom)" }));

		await waitFor(() => {
			expect(toast.info).toHaveBeenCalledWith(endedMsg);
		});
		expect(openSpy).not.toHaveBeenCalled();
		expect(toast.error).not.toHaveBeenCalled();
	});

	it("closes pre-opened tab and shows toast.info when client thinks open but server says TOO_EARLY (clock skew)", async () => {
		const fakeWin = makeFakeWindow();
		openSpy.mockReturnValue(fakeWin as unknown as Window);
		const serverMsg = "Chưa đến giờ vào lớp theo giờ máy chủ.";
		const onRequestJoin = vi.fn(
			async (): Promise<StudentZoomJoinResult> => ({
				ok: false,
				status: 403,
				error: {
					error: serverMsg,
					code: ZOOM_JOIN_ERROR_CODES.TOO_EARLY,
					date: SESSION_DATE,
					time: SESSION_TIME,
					dur: SESSION_DUR,
				},
			}),
		);

		render(
			<ZoomJoinButton
				classId="cls-1"
				date={SESSION_DATE}
				time={SESSION_TIME}
				dur={SESSION_DUR}
				nowMs={INSIDE_WINDOW_MS}
				onRequestJoin={onRequestJoin}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Vào lớp (Zoom)" }));

		await waitFor(() => {
			expect(fakeWin.close).toHaveBeenCalledTimes(1);
			expect(toast.info).toHaveBeenCalledWith(serverMsg);
		});
		expect(fakeWin.location.assign).not.toHaveBeenCalled();
		expect(toast.error).not.toHaveBeenCalled();
	});

	it("opens joinUrl in new tab when client thinks TOO_EARLY but server says open (clock skew)", async () => {
		const openedWin = makeFakeWindow();
		openSpy.mockReturnValue(openedWin as unknown as Window);
		const onRequestJoin = vi.fn(
			async (): Promise<StudentZoomJoinResult> => ({
				ok: true,
				data: {
					joinUrl: "https://zoom.us/j/555666777",
					openAt: "2026-11-22T11:30:00.000Z",
					closeAt: "2026-11-22T13:30:00.000Z",
				},
			}),
		);

		render(
			<ZoomJoinButton
				classId="cls-1"
				date={SESSION_DATE}
				time={SESSION_TIME}
				dur={SESSION_DUR}
				nowMs={TOO_EARLY_MS}
				onRequestJoin={onRequestJoin}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Vào lớp (Zoom)" }));

		await waitFor(() => {
			expect(openSpy).toHaveBeenCalledWith(
				"https://zoom.us/j/555666777",
				"_blank",
				"noopener,noreferrer",
			);
		});
		expect(toast.info).not.toHaveBeenCalled();
		expect(toast.error).not.toHaveBeenCalled();
	});

	it("shows popup blocked notice when fallback window.open returns null", async () => {
		openSpy.mockReturnValue(null);
		const onRequestJoin = vi.fn(
			async (): Promise<StudentZoomJoinResult> => ({
				ok: true,
				data: {
					joinUrl: "https://zoom.us/j/555666777",
					openAt: "2026-11-22T11:30:00.000Z",
					closeAt: "2026-11-22T13:30:00.000Z",
				},
			}),
		);

		render(
			<ZoomJoinButton
				classId="cls-1"
				date={SESSION_DATE}
				time={SESSION_TIME}
				dur={SESSION_DUR}
				nowMs={TOO_EARLY_MS}
				onRequestJoin={onRequestJoin}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Vào lớp (Zoom)" }));

		await waitFor(() => {
			expect(toast.info).toHaveBeenCalledWith(
				"Trình duyệt đang chặn mở tab mới. Hãy cho phép cửa sổ bật lên để vào lớp.",
			);
		});
	});

	it("closes pre-opened tab and shows toast.error when session is inactive or paused", async () => {
		const fakeWin = makeFakeWindow();
		openSpy.mockReturnValue(fakeWin as unknown as Window);
		const onRequestJoin = vi.fn(
			async (): Promise<StudentZoomJoinResult> => ({
				ok: false,
				status: 409,
				error: {
					error: "Lớp đang tạm dừng nên không thể vào phòng Zoom.",
					code: ZOOM_JOIN_ERROR_CODES.SESSION_INACTIVE,
				},
			}),
		);

		render(
			<ZoomJoinButton
				classId="cls-1"
				date={SESSION_DATE}
				time={SESSION_TIME}
				dur={SESSION_DUR}
				nowMs={INSIDE_WINDOW_MS}
				onRequestJoin={onRequestJoin}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Vào lớp (Zoom)" }));

		await waitFor(() => {
			expect(fakeWin.close).toHaveBeenCalledTimes(1);
			expect(toast.error).toHaveBeenCalledWith(
				"Lớp đang tạm dừng nên không thể vào phòng Zoom.",
			);
		});
	});

	it("closes pre-opened tab and shows toast.error on network error", async () => {
		const fakeWin = makeFakeWindow();
		openSpy.mockReturnValue(fakeWin as unknown as Window);
		const onRequestJoin = vi.fn(async () => {
			throw new Error("Network failure");
		});

		render(
			<ZoomJoinButton
				classId="cls-1"
				date={SESSION_DATE}
				time={SESSION_TIME}
				dur={SESSION_DUR}
				nowMs={INSIDE_WINDOW_MS}
				onRequestJoin={onRequestJoin}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Vào lớp (Zoom)" }));

		await waitFor(() => {
			expect(fakeWin.close).toHaveBeenCalledTimes(1);
			expect(toast.error).toHaveBeenCalledWith(
				"Không thể kết nối máy chủ để mở phòng Zoom. Vui lòng thử lại.",
			);
		});
	});

	it("rejects non-https joinUrl, closes pre-opened tab, and shows toast.error", async () => {
		const fakeWin = makeFakeWindow();
		openSpy.mockReturnValue(fakeWin as unknown as Window);
		const onRequestJoin = vi.fn(
			async (): Promise<StudentZoomJoinResult> => ({
				ok: true,
				data: {
					joinUrl: "javascript:alert(1)",
					openAt: "2026-11-22T11:30:00.000Z",
					closeAt: "2026-11-22T13:30:00.000Z",
				},
			}),
		);

		render(
			<ZoomJoinButton
				classId="cls-1"
				date={SESSION_DATE}
				time={SESSION_TIME}
				dur={SESSION_DUR}
				nowMs={INSIDE_WINDOW_MS}
				onRequestJoin={onRequestJoin}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Vào lớp (Zoom)" }));

		await waitFor(() => {
			expect(fakeWin.close).toHaveBeenCalledTimes(1);
			expect(toast.error).toHaveBeenCalledWith("Link Zoom không hợp lệ.");
		});
		expect(fakeWin.location.assign).not.toHaveBeenCalled();
	});

	it("shows toast.info without calling API when date is null", () => {
		const onRequestJoin = vi.fn();

		render(
			<ZoomJoinButton
				classId="cls-1"
				date={null}
				time={SESSION_TIME}
				dur={SESSION_DUR}
				nowMs={INSIDE_WINDOW_MS}
				onRequestJoin={onRequestJoin}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Vào lớp (Zoom)" }));

		expect(onRequestJoin).not.toHaveBeenCalled();
		expect(openSpy).not.toHaveBeenCalled();
		expect(toast.info).toHaveBeenCalledWith(
			"Không xác định được khung giờ buổi học để mở link Zoom.",
		);
	});

	it("stops click propagation and ignores concurrent clicks while pending", async () => {
		let resolveJoin: ((res: StudentZoomJoinResult) => void) | undefined;
		const onRequestJoin = vi.fn(
			() =>
				new Promise<StudentZoomJoinResult>((resolve) => {
					resolveJoin = resolve;
				}),
		);
		const parentClick = vi.fn();

		render(
			// biome-ignore lint/a11y/noStaticElementInteractions: test wrapper verifying stopPropagation
			// biome-ignore lint/a11y/useKeyWithClickEvents: test wrapper verifying stopPropagation
			<div onClick={parentClick}>
				<ZoomJoinButton
					classId="cls-1"
					date={SESSION_DATE}
					time={SESSION_TIME}
					dur={SESSION_DUR}
					nowMs={TOO_EARLY_MS}
					onRequestJoin={onRequestJoin}
				/>
			</div>,
		);

		const button = screen.getByRole("button", {
			name: "Vào lớp (Zoom)",
		}) as HTMLButtonElement;
		fireEvent.click(button);

		expect(parentClick).not.toHaveBeenCalled();
		expect(onRequestJoin).toHaveBeenCalledTimes(1);
		expect(button.disabled).toBe(true);
		expect(button.getAttribute("aria-busy")).toBe("true");

		// Bấm thêm lần nữa khi nút đang chờ — không gọi trùng request
		fireEvent.click(button);
		expect(onRequestJoin).toHaveBeenCalledTimes(1);

		resolveJoin?.({
			ok: false,
			status: 403,
			error: {
				error: "Chưa đến giờ",
				code: ZOOM_JOIN_ERROR_CODES.TOO_EARLY,
			},
		});

		await waitFor(() => {
			expect(button.disabled).toBe(false);
		});
	});
});

describe("requestStudentZoomJoin", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("returns ok:true with parsed response on 200 and sends cache: no-store", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						joinUrl: "https://zoom.us/j/123456789",
						openAt: "2026-11-22T11:30:00.000Z",
						closeAt: "2026-11-22T13:30:00.000Z",
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		);
		globalThis.fetch = fetchMock as typeof fetch;

		const result = await requestStudentZoomJoin("cls/1", "2026-11-22");

		expect(result).toEqual({
			ok: true,
			data: {
				joinUrl: "https://zoom.us/j/123456789",
				openAt: "2026-11-22T11:30:00.000Z",
				closeAt: "2026-11-22T13:30:00.000Z",
			},
		});
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining(
				"/api/student/classes/cls%2F1/sessions/2026-11-22/zoom-join",
			),
			expect.objectContaining({
				method: "GET",
				credentials: "include",
				cache: "no-store",
			}),
		);
	});

	it("returns ok:false on 403 ZOOM_JOIN_TOO_EARLY", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						error: "Chưa đến giờ vào lớp.",
						code: ZOOM_JOIN_ERROR_CODES.TOO_EARLY,
						date: "2026-11-22",
						time: "19:00",
						dur: 90,
					}),
					{ status: 403, headers: { "Content-Type": "application/json" } },
				),
		) as typeof fetch;

		const result = await requestStudentZoomJoin("cls-1", "2026-11-22");

		expect(result).toEqual({
			ok: false,
			status: 403,
			error: {
				error: "Chưa đến giờ vào lớp.",
				code: ZOOM_JOIN_ERROR_CODES.TOO_EARLY,
				date: "2026-11-22",
				time: "19:00",
				dur: 90,
			},
		});
	});

	it("throws HttpError on 401 and on auth/account 403 codes like STUDENT_ORG_MISMATCH", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ error: "Unauthorized" }), {
					status: 401,
					headers: { "Content-Type": "application/json" },
				}),
		) as typeof fetch;

		await expect(
			requestStudentZoomJoin("cls-1", "2026-11-22"),
		).rejects.toMatchObject({ status: 401 });

		globalThis.fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						error: "Org mismatch",
						code: "STUDENT_ORG_MISMATCH",
					}),
					{ status: 403, headers: { "Content-Type": "application/json" } },
				),
		) as typeof fetch;

		await expect(
			requestStudentZoomJoin("cls-1", "2026-11-22"),
		).rejects.toMatchObject({ status: 403, code: "STUDENT_ORG_MISMATCH" });
	});
});
