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

	it("getRecording: missing / pending / ready (không có download_url)", async () => {
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
			primaryFile: null,
		});
	});

	it("getRecording chọn 1 file MP4 chính theo thứ tự ưu tiên recording_type và tie-breaker file_size", async () => {
		const c = cfg();
		const client = createZoomClient(
			c,
			mockFetch(
				token(),
				json({
					share_url: "https://zoom.us/rec/share/abc",
					password: "pw1",
					recording_files: [
						{
							id: "m4a-1",
							status: "completed",
							file_type: "M4A",
							file_size: 9_000_000,
							download_url: "https://us06web.zoom.us/rec/download/m4a",
							recording_type: "audio_only",
						},
						{
							id: "speaker-1",
							status: "completed",
							file_type: "MP4",
							file_size: 50_000_000,
							download_url: "https://us06web.zoom.us/rec/download/speaker",
							recording_type: "active_speaker",
						},
						{
							id: "shared-small",
							status: "completed",
							file_type: "MP4",
							file_size: 40_000_000,
							download_url: "https://us06web.zoom.us/rec/download/shared-small",
							recording_type: "shared_screen_with_speaker_view",
						},
						{
							id: "shared-big",
							status: "completed",
							file_extension: "mp4",
							file_size: 80_000_000,
							download_url: "https://us06web.zoom.us/rec/download/shared-big",
							recording_type: "shared_screen_with_speaker_view",
						},
					],
				}),
			),
		);

		expect(await client.getRecording("100")).toEqual({
			status: "ready",
			shareUrl: "https://zoom.us/rec/share/abc",
			password: "pw1",
			primaryFile: {
				id: "shared-big",
				downloadUrl: "https://us06web.zoom.us/rec/download/shared-big",
				fileSize: 80_000_000,
				recordingType: "shared_screen_with_speaker_view",
				mimeType: "video/mp4",
			},
		});
	});

	it("getRecording trả pending khi M4A đã xong nhưng MP4 vẫn đang processing", async () => {
		const c = cfg();
		const client = createZoomClient(
			c,
			mockFetch(
				token(),
				json({
					share_url: "https://zoom.us/rec/share/wait",
					recording_files: [
						{
							id: "m4a-done",
							status: "completed",
							file_type: "M4A",
							download_url: "https://us06web.zoom.us/rec/download/m4a",
						},
						{
							id: "mp4-proc",
							status: "processing",
							file_type: "MP4",
						},
					],
				}),
			),
		);

		expect(await client.getRecording("101")).toEqual({ status: "pending" });
	});

	it("downloadRecordingFile theo dõi redirect an toàn, không chuyển Authorization sang CDN ngoài zoom.us", async () => {
		const bytes = new Uint8Array([0, 0, 0, 32, 102, 116, 121, 112]);
		const fn = mockFetch(
			token("tok-dl"),
			new Response(null, {
				status: 302,
				headers: { Location: "https://ssrweb.zoom.us/step-2" },
			}),
			new Response(null, {
				status: 302,
				headers: { Location: "https://d123.cloudfront.net/video.mp4?sig=ok" },
			}),
			new Response(bytes, {
				status: 200,
				headers: {
					"Content-Type": "application/octet-stream",
					"Content-Length": String(bytes.byteLength),
				},
			}),
		);
		const client = createZoomClient(cfg(), fn);
		const res = await client.downloadRecordingFile(
			"https://us06web.zoom.us/rec/download/xyz",
		);

		expect(res.contentType).toBe("video/mp4");
		expect(res.contentLength).toBe(bytes.byteLength);
		const out = new Uint8Array(await new Response(res.body).arrayBuffer());
		expect(out).toEqual(bytes);

		// Hop 0 (us06web.zoom.us) và Hop 1 (ssrweb.zoom.us) có Authorization.
		const hop0Init = fn.mock.calls[1]?.[1] as RequestInit | undefined;
		const hop1Init = fn.mock.calls[2]?.[1] as RequestInit | undefined;
		const hop2Init = fn.mock.calls[3]?.[1] as RequestInit | undefined;
		const hop0Headers = hop0Init?.headers as Record<string, string> | undefined;
		const hop1Headers = hop1Init?.headers as Record<string, string> | undefined;
		const hop2Headers = hop2Init?.headers as Record<string, string> | undefined;
		expect(hop0Headers?.Authorization).toBe("Bearer tok-dl");
		expect(hop1Headers?.Authorization).toBe("Bearer tok-dl");
		// Hop 2 (cloudfront.net) TUYỆT ĐỐI không gửi Bearer token Zoom.
		expect(hop2Headers?.Authorization).toBeUndefined();
	});

	it("downloadRecordingFile tự làm mới token khi gặp 401 ở hop Zoom đầu tiên", async () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const fn = mockFetch(
			token("old-tok"),
			new Response("unauthorized", { status: 401 }),
			token("new-tok"),
			new Response(bytes, {
				status: 200,
				headers: { "Content-Type": "video/mp4" },
			}),
		);
		const res = await createZoomClient(cfg(), fn).downloadRecordingFile(
			"https://us06web.zoom.us/rec/download/retry",
		);
		expect(res.contentType).toBe("video/mp4");
		expect(res.contentLength).toBeUndefined();
		const retryInit = fn.mock.calls[3]?.[1] as RequestInit | undefined;
		const retryHeaders = retryInit?.headers as
			| Record<string, string>
			| undefined;
		expect(retryHeaders?.Authorization).toBe("Bearer new-tok");
	});

	it("downloadRecordingFile từ chối URL ngoài zoom.us, redirect HTTP và body HTML/JSON", async () => {
		const client = createZoomClient(cfg(), mockFetch());
		await expect(
			client.downloadRecordingFile("http://us06web.zoom.us/rec/download/1"),
		).rejects.toMatchObject({ code: "ZOOM_API_ERROR", status: 502 });
		await expect(
			client.downloadRecordingFile("https://evilzoom.us/rec/download/1"),
		).rejects.toMatchObject({ code: "ZOOM_API_ERROR", status: 502 });
		await expect(
			client.downloadRecordingFile("https://zoom.us.evil.com/rec/download/1"),
		).rejects.toMatchObject({ code: "ZOOM_API_ERROR", status: 502 });

		const httpRedirectClient = createZoomClient(
			cfg(),
			mockFetch(
				token(),
				new Response(null, {
					status: 302,
					headers: { Location: "http://cdn.example.com/file.mp4" },
				}),
			),
		);
		await expect(
			httpRedirectClient.downloadRecordingFile(
				"https://us06web.zoom.us/rec/download/1",
			),
		).rejects.toMatchObject({
			code: "ZOOM_API_ERROR",
			status: 502,
			message: expect.stringContaining("HTTPS"),
		});

		const htmlBodyClient = createZoomClient(
			cfg(),
			mockFetch(
				token(),
				new Response("<html>login</html>", {
					status: 200,
					headers: { "Content-Type": "text/html; charset=utf-8" },
				}),
			),
		);
		await expect(
			htmlBodyClient.downloadRecordingFile(
				"https://us06web.zoom.us/rec/download/1",
			),
		).rejects.toMatchObject({
			code: "ZOOM_API_ERROR",
			status: 502,
			message: expect.stringContaining("text/html"),
		});

		const tooManyRedirectsClient = createZoomClient(
			cfg(),
			mockFetch(
				token(),
				...Array.from(
					{ length: 6 },
					(_, i) =>
						new Response(null, {
							status: 302,
							headers: {
								Location: `https://us06web.zoom.us/hop/${i + 1}`,
							},
						}),
				),
			),
		);
		await expect(
			tooManyRedirectsClient.downloadRecordingFile(
				"https://us06web.zoom.us/rec/download/loop",
			),
		).rejects.toMatchObject({
			code: "ZOOM_API_ERROR",
			status: 502,
		});
	});

	it("getRecording: chờ pending khi còn đoạn MP4 thứ 2 đang processing", async () => {
		const client = createZoomClient(
			cfg(),
			mockFetch(
				token(),
				json({
					share_url: "https://zoom.us/rec/share/seg",
					recording_files: [
						{
							id: "seg-1",
							status: "completed",
							file_type: "MP4",
							file_size: 1_000,
							download_url: "https://us06web.zoom.us/rec/download/seg-1",
							recording_type: "shared_screen_with_speaker_view",
						},
						{
							id: "seg-2",
							status: "processing",
							file_type: "MP4",
						},
					],
				}),
			),
		);
		expect(await client.getRecording("seg")).toEqual({ status: "pending" });
	});

	it("downloadRecordingFile chặn redirect sang IP private/loopback/credentials, chặn XML/text và bỏ Content-Length khi có Content-Encoding", async () => {
		for (const badLocation of [
			"https://127.0.0.1/secret",
			"https://169.254.169.254/latest/meta-data",
			"https://localhost/internal",
			"https://[::1]/secret",
			"https://user:pass@cdn.example.com/video.mp4",
		]) {
			const ssrfClient = createZoomClient(
				cfg(),
				mockFetch(
					token(),
					new Response(null, {
						status: 302,
						headers: { Location: badLocation },
					}),
				),
			);
			await expect(
				ssrfClient.downloadRecordingFile(
					"https://us06web.zoom.us/rec/download/ssrf",
				),
			).rejects.toMatchObject({
				code: "ZOOM_API_ERROR",
				status: 502,
			});
		}

		for (const badMime of ["application/xml", "text/plain; charset=utf-8"]) {
			const badMimeClient = createZoomClient(
				cfg(),
				mockFetch(
					token(),
					new Response("<Error>AccessDenied</Error>", {
						status: 200,
						headers: { "Content-Type": badMime },
					}),
				),
			);
			await expect(
				badMimeClient.downloadRecordingFile(
					"https://us06web.zoom.us/rec/download/badmime",
				),
			).rejects.toMatchObject({
				code: "ZOOM_API_ERROR",
				status: 502,
			});
		}

		const gzipClient = createZoomClient(
			cfg(),
			mockFetch(
				token(),
				new Response(new Uint8Array([1, 2, 3, 4]), {
					status: 200,
					headers: {
						"Content-Type": "video/mp4",
						"Content-Length": "4",
						"Content-Encoding": "gzip",
					},
				}),
			),
		);
		const gzipped = await gzipClient.downloadRecordingFile(
			"https://us06web.zoom.us/rec/download/gzip",
		);
		expect(gzipped.contentType).toBe("video/mp4");
		expect(gzipped.contentLength).toBeUndefined();
		await gzipped.body.cancel();
	});

	it("trashRecording gọi DELETE ?action=trash và coi 404 là thành công idempotent", async () => {
		const fn = mockFetch(
			token(),
			new Response(null, { status: 204 }),
			json({ message: "not found" }, 404),
		);
		const client = createZoomClient(cfg(), fn);
		await expect(client.trashRecording("999")).resolves.toBeUndefined();
		await expect(client.trashRecording("999")).resolves.toBeUndefined();

		expect(String(fn.mock.calls[1]?.[0])).toBe(
			"https://api.zoom.us/v2/meetings/999/recordings?action=trash",
		);
		const trashInit = fn.mock.calls[1]?.[1] as RequestInit | undefined;
		expect(trashInit?.method).toBe("DELETE");
	});
});
