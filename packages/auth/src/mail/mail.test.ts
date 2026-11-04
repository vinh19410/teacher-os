import { afterEach, describe, expect, test, vi } from "vitest";
import { composeFrom, createLogMailer, createResendMailer } from "./mailer";
import { otpEmailTemplate } from "./otp-email-template";
import { resetPasswordEmailTemplate } from "./reset-password-email-template";
import { verificationEmailTemplate } from "./verification-email-template";

describe("verificationEmailTemplate", () => {
	const sampleUrl =
		"https://api.example.com/api/auth/verify-email?token=abc123xyz&callbackURL=https%3A%2F%2Fapp.example.com%2Flogin";

	test("generates valid HTML meeting email client and branding requirements", () => {
		const { html, text } = verificationEmailTemplate({ url: sampleUrl });

		expect(html).toContain('lang="vi"');
		expect(html).toContain('color-scheme" content="light dark"');
		expect(html).toContain("Xác thực email");
		expect(html).toContain("TeacherOS");
		expect(html).toContain("hiệu lực trong 1 giờ");
		expect(html).toContain('role="presentation"');

		// URL escaped in href and present in fallback
		const escaped = sampleUrl.replace(/&/g, "&amp;");
		expect(html).toContain(`href="${escaped}"`);
		expect(html).toContain(escaped);

		// HTML size budget
		expect(html.length).toBeLessThan(15_000);

		// Text part verification
		expect(text).toContain(sampleUrl);
		expect(text).toContain("hiệu lực 1 giờ");
		// URL must be on its own line
		expect(text).toMatch(/^https?:\/\/\S+$/m);
	});
});

describe("resetPasswordEmailTemplate", () => {
	const sampleUrl =
		"https://api.example.com/api/auth/reset-password/tok123?callbackURL=https%3A%2F%2Fapp.example.com%2Freset-password&x=1";

	test("generates valid HTML meeting email client and branding requirements", () => {
		const { html, text } = resetPasswordEmailTemplate({ url: sampleUrl });

		expect(html).toContain('lang="vi"');
		expect(html).toContain('color-scheme" content="light dark"');
		expect(html).toContain("Đặt lại mật khẩu");
		expect(html).toContain("TeacherOS");
		expect(html).toContain("1 giờ");
		expect(html).toContain('role="presentation"');

		const escaped = sampleUrl.replace(/&/g, "&amp;");
		expect(html).toContain(`href="${escaped}"`);
		expect(html.length).toBeLessThan(15_000);

		expect(text).toContain(sampleUrl);
		expect(text).toContain("1 giờ");
		expect(text).toMatch(/^https?:\/\/\S+$/m);
	});

	test("escapes markup in the url instead of injecting it", () => {
		const { html } = resetPasswordEmailTemplate({
			url: 'https://x.test/a?b="><script>alert(1)</script>',
		});
		expect(html).not.toContain("<script>alert(1)</script>");
		expect(html).toContain("&lt;script&gt;");
	});
});

describe("otpEmailTemplate", () => {
	test("generates valid HTML containing OTP and 5-minute expiration notice", () => {
		const { html, text } = otpEmailTemplate({ otp: "849201" });

		expect(html).toContain('lang="vi"');
		expect(html).toContain('color-scheme" content="light dark"');
		expect(html).toContain("Mã xác thực đăng nhập");
		expect(html).toContain("TeacherOS");
		expect(html).toContain("5 phút");
		expect(html).toContain("849201");
		expect(html.length).toBeLessThan(15_000);

		expect(text).toContain("849201");
		expect(text).toContain("5 phút");
	});

	test("escapes markup in otp if somehow passed unsafe string", () => {
		const { html } = otpEmailTemplate({ otp: "<script>123</script>" });
		expect(html).not.toContain("<script>123</script>");
		expect(html).toContain("&lt;script&gt;123&lt;/script&gt;");
	});
});

describe("createResendMailer", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	test("posts to Resend API with correct headers, payload, and AbortSignal", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ id: "email-123" }),
			text: async () => JSON.stringify({ id: "email-123" }),
		});
		vi.stubGlobal("fetch", fetchMock);

		const mailer = createResendMailer({
			apiKey: "test-api-key",
			from: "TeacherOS <onboarding@resend.dev>",
		});

		await mailer.send({
			to: "student@example.com",
			subject: "Verify Email",
			html: "<p>Hello</p>",
			text: "Hello",
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://api.resend.com/emails");
		expect(init.method).toBe("POST");
		expect(init.headers).toEqual({
			Authorization: "Bearer test-api-key",
			"Content-Type": "application/json",
		});
		expect(init.signal).toBeDefined();
		const body = JSON.parse(init.body as string);
		expect(body).toEqual({
			from: "TeacherOS <onboarding@resend.dev>",
			to: ["student@example.com"],
			subject: "Verify Email",
			html: "<p>Hello</p>",
			text: "Hello",
		});
	});

	test("retries exactly once on 500 status then succeeds", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: false,
				status: 500,
				text: async () => "Internal Server Error",
				headers: new Headers({ "Retry-After": "0" }),
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify({ id: "email-456" }),
			});
		vi.stubGlobal("fetch", fetchMock);

		const mailer = createResendMailer({
			apiKey: "test-api-key",
			from: "TeacherOS <onboarding@resend.dev>",
		});

		await mailer.send({
			to: "student@example.com",
			subject: "Verify Email",
			html: "<p>Hello</p>",
			text: "Hello",
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test("throws error when response is 400 without retrying", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 400,
			text: async () => "Invalid domain",
		});
		vi.stubGlobal("fetch", fetchMock);

		const mailer = createResendMailer({
			apiKey: "test-api-key",
			from: "TeacherOS <onboarding@resend.dev>",
		});

		await expect(
			mailer.send({
				to: "student@example.com",
				subject: "Verify Email",
				html: "<p>Hello</p>",
				text: "Hello",
			}),
		).rejects.toThrow("resend send failed: 400 Invalid domain");

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test("propagates timeout/abort error without retrying", async () => {
		const timeoutError = new DOMException(
			"The operation timed out.",
			"TimeoutError",
		);
		const fetchMock = vi.fn().mockRejectedValue(timeoutError);
		vi.stubGlobal("fetch", fetchMock);

		const mailer = createResendMailer({
			apiKey: "test-api-key",
			from: "TeacherOS <onboarding@resend.dev>",
		});

		await expect(
			mailer.send({
				to: "student@example.com",
				subject: "Verify Email",
				html: "<p>Hello</p>",
				text: "Hello",
			}),
		).rejects.toThrow("The operation timed out.");

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe("createLogMailer", () => {
	test("logs email details to console.info", async () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

		const mailer = createLogMailer();
		await mailer.send({
			to: "student@example.com",
			subject: "Verify Email",
			html: "<p>Hello</p>",
			text: "https://example.com/verify-email?token=123",
		});

		expect(infoSpy).toHaveBeenCalledTimes(1);
		expect(infoSpy).toHaveBeenCalledWith(
			"[mail:log] to=%s subject=%s replyTo=%s fromName=%s\n%s",
			"student@example.com",
			"Verify Email",
			"",
			"",
			"https://example.com/verify-email?token=123",
		);

		infoSpy.mockRestore();
	});
});

describe("replyTo + fromName (plan TOS-21 D5)", () => {
	test("Resend body có reply_to và from có tên", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ id: "email-789" }),
		});
		vi.stubGlobal("fetch", fetchMock);

		const mailer = createResendMailer({
			apiKey: "test-api-key",
			from: "noreply@teacheros.vn",
		});
		await mailer.send({
			to: "student@example.com",
			subject: "Bài tập mới",
			html: "<p>Bài tập mới</p>",
			text: "Bài tập mới",
			replyTo: "teacher@example.com",
			fromName: 'Trung tâm "ABC" qua Teacher OS',
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
		expect(body.from).toBe(
			'"Trung tâm \\"ABC\\" qua Teacher OS" <noreply@teacheros.vn>',
		);
		expect(body.reply_to).toBe("teacher@example.com");
	});

	test("không có replyTo/fromName → không thêm reply_to, from là địa chỉ trần", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ id: "email-1" }),
		});
		vi.stubGlobal("fetch", fetchMock);

		const mailer = createResendMailer({
			apiKey: "test-api-key",
			from: "noreply@teacheros.vn",
		});
		await mailer.send({
			to: "student@example.com",
			subject: "Hello",
			html: "<p>Hello</p>",
			text: "Hello",
		});

		const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
		expect(body.from).toBe("noreply@teacheros.vn");
		expect(body.reply_to).toBeUndefined();
	});

	test("log mailer in thêm replyTo/fromName", async () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const mailer = createLogMailer();
		await mailer.send({
			to: "student@example.com",
			subject: "Hello",
			html: "<p>Hello</p>",
			text: "Hello",
			replyTo: "teacher@example.com",
			fromName: "Academy qua Teacher OS",
		});
		expect(infoSpy).toHaveBeenCalledWith(
			"[mail:log] to=%s subject=%s replyTo=%s fromName=%s\n%s",
			"student@example.com",
			"Hello",
			"teacher@example.com",
			"Academy qua Teacher OS",
			"Hello",
		);
		infoSpy.mockRestore();
	});

	test("composeFrom tách địa chỉ trần từ Display <addr> và lọc ký tự điều khiển (#570)", () => {
		expect(
			composeFrom(
				"TeacherOS <no-reply@teacheros.io.vn>",
				"Alpha Academy qua Teacher OS",
			),
		).toBe('"Alpha Academy qua Teacher OS" <no-reply@teacheros.io.vn>');
		expect(
			composeFrom("no-reply@teacheros.io.vn", "Evil\\\r\nBcc: x@y.z"),
		).toBe('"Evil\\\\Bcc: x@y.z" <no-reply@teacheros.io.vn>');
	});

	test("createResendMailer gắn Idempotency-Key và không treo khi Retry-After > 2s (#570)", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify({ id: "email-idem-1" }),
			})
			.mockResolvedValueOnce({
				ok: false,
				status: 429,
				headers: new Headers({ "Retry-After": "60" }),
				text: async () => "rate limited",
			});
		vi.stubGlobal("fetch", fetchMock);

		const mailer = createResendMailer({
			apiKey: "test-api-key",
			from: "TeacherOS <no-reply@teacheros.io.vn>",
		});

		await mailer.send({
			to: "student@example.com",
			subject: "Lời mời\r\nInjected",
			html: "<p>Hello</p>",
			text: "Hello",
			fromName: "Alpha Academy qua Teacher OS",
			idempotencyKey: "student_invite:inv-1",
			timeoutMs: 5_000,
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, firstInit] = fetchMock.mock.calls[0];
		expect(firstInit.headers).toEqual({
			Authorization: "Bearer test-api-key",
			"Content-Type": "application/json",
			"Idempotency-Key": "student_invite:inv-1",
		});
		const firstBody = JSON.parse(String(firstInit.body));
		expect(firstBody.from).toBe(
			'"Alpha Academy qua Teacher OS" <no-reply@teacheros.io.vn>',
		);
		expect(firstBody.subject).toBe("Lời mờiInjected");

		await expect(
			mailer.send({
				to: "student@example.com",
				subject: "Retry cap",
				html: "<p>Hi</p>",
				text: "Hi",
				idempotencyKey: "student_invite:inv-2",
				timeoutMs: 5_000,
			}),
		).rejects.toThrow("resend send failed: 429 rate limited");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
