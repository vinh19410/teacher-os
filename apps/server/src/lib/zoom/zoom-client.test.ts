import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createZoomClient,
	type FetchFn,
	ZoomIntegrationError,
	type ZoomMeetingInput,
} from "./zoom-client";

const input: ZoomMeetingInput = {
	topic: "Lớp A",
	agenda: "Buổi 1",
	dateISO: "2026-12-01",
	time: "19:30",
	durMinutes: 90,
};

let n = 0;
function cfg() {
	n += 1;
	// Mỗi test dùng account riêng để token cache cấp module không rò rỉ giữa các ca.
	return { accountId: `acc-${n}`, clientId: "cid", clientSecret: "sec" };
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
const token = (t = "tok") => json({ access_token: t, expires_in: 3600 });
const created = () =>
	json({ id: 123456789, join_url: "https://zoom.us/j/123456789" }, 201);

function mockFetch(...responses: Response[]) {
	const fn = vi.fn<FetchFn>();
	for (const r of responses) fn.mockResolvedValueOnce(r);
	return fn;
}

function bodyOf(fn: ReturnType<typeof mockFetch>, call: number) {
	const init = fn.mock.calls[call]?.[1] as RequestInit;
	return JSON.parse(init.body as string);
}

describe("createZoomClient", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("ném ZOOM_NOT_CONFIGURED khi thiếu cấu hình", () => {
		try {
			createZoomClient({ accountId: "a", clientId: "", clientSecret: "s" });
			expect.unreachable();
		} catch (e) {
			expect(e).toBeInstanceOf(ZoomIntegrationError);
			expect((e as ZoomIntegrationError).code).toBe("ZOOM_NOT_CONFIGURED");
			expect((e as ZoomIntegrationError).status).toBe(503);
		}
	});

	it("cache token và gửi body tạo meeting đúng", async () => {
		const fn = mockFetch(token(), created(), created());
		const client = createZoomClient(cfg(), fn);
		const r = await client.createMeeting(input);
		await client.createMeeting(input);
		expect(r).toEqual({
			meetingId: "123456789",
			joinUrl: "https://zoom.us/j/123456789",
		});
		const tokenCalls = fn.mock.calls.filter(([u]) =>
			String(u).startsWith("https://zoom.us/oauth/token"),
		);
		expect(tokenCalls).toHaveLength(1);
		expect(fn).toHaveBeenCalledTimes(3);
		const body = bodyOf(fn, 1);
		expect(body.type).toBe(2);
		expect(body.timezone).toBe("Asia/Ho_Chi_Minh");
		expect(body.start_time).toBe("2026-12-01T19:30:00");
		expect(body.settings.auto_recording).toBe("cloud");
		expect(body.settings.join_before_host).toBe(true);
		expect(body.settings.waiting_room).toBe(false);
		expect(String(fn.mock.calls[1]?.[0])).toBe(
			"https://api.zoom.us/v2/users/me/meetings",
		);
	});

	it("cắt topic dài còn 200 ký tự", async () => {
		const fn = mockFetch(token(), created());
		await createZoomClient(cfg(), fn).createMeeting({
			...input,
			topic: "x".repeat(250),
		});
		expect(bodyOf(fn, 1).topic).toHaveLength(200);
	});

	it("401 lần đầu thì lấy token mới và thử lại", async () => {
		const fn = mockFetch(
			token("old"),
			json({ message: "Invalid access token" }, 401),
			token("new"),
			created(),
		);
		const r = await createZoomClient(cfg(), fn).createMeeting(input);
		expect(r.meetingId).toBe("123456789");
		expect(fn).toHaveBeenCalledTimes(4);
		const retryInit = fn.mock.calls[3]?.[1] as RequestInit;
		expect((retryInit.headers as Record<string, string>).Authorization).toBe(
			"Bearer new",
		);
	});

	it("429 có 'daily' báo giới hạn ngày", async () => {
		const fn = mockFetch(
			token(),
			json({ message: "Daily limit reached" }, 429),
		);
		await expect(
			createZoomClient(cfg(), fn).createMeeting(input),
		).rejects.toMatchObject({
			code: "ZOOM_RATE_LIMITED",
			status: 429,
			message: expect.stringContaining("100 lần"),
		});
	});

	it("429 không có 'daily' báo thử lại sau ít phút", async () => {
		const fn = mockFetch(token(), json({ message: "Too many requests" }, 429));
		await expect(
			createZoomClient(cfg(), fn).createMeeting(input),
		).rejects.toMatchObject({
			code: "ZOOM_RATE_LIMITED",
			message: expect.stringContaining("ít phút"),
		});
	});

	it("deleteMeeting gặp 404 thì không ném", async () => {
		const fn = mockFetch(token(), json({ message: "not found" }, 404));
		await expect(
			createZoomClient(cfg(), fn).deleteMeeting("1"),
		).resolves.toBeUndefined();
	});

	it("lỗi khác trả ZOOM_API_ERROR kèm message của Zoom", async () => {
		const fn = mockFetch(token(), json({ message: "Invalid topic" }, 400));
		await expect(
			createZoomClient(cfg(), fn).createMeeting(input),
		).rejects.toMatchObject({
			code: "ZOOM_API_ERROR",
			status: 502,
			message: "Zoom API lỗi 400: Invalid topic",
		});
	});

	it("getRecording: missing / pending / ready", async () => {
		const c = cfg();
		const missing = createZoomClient(
			c,
			mockFetch(token(), json({ message: "nf" }, 404)),
		);
		expect(await missing.getRecording("1")).toEqual({ status: "missing" });

		const pending = createZoomClient(
			c,
			mockFetch(
				json({
					share_url: "https://zoom.us/rec/share/x",
					recording_files: [{ status: "processing", file_type: "MP4" }],
				}),
			),
		);
		expect(await pending.getRecording("1")).toEqual({ status: "pending" });

		const ready = createZoomClient(
			c,
			mockFetch(
				json({
					share_url: "https://zoom.us/rec/share/x",
					password: "pw",
					recording_files: [{ status: "completed", file_type: "MP4" }],
				}),
			),
		);
		expect(await ready.getRecording("1")).toEqual({
			status: "ready",
			shareUrl: "https://zoom.us/rec/share/x",
			password: "pw",
		});
	});
});
