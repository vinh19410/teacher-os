import { afterEach, describe, expect, test, vi } from "vitest";
import { createLogMailer, createResendMailer } from "./mailer";
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
			"[mail:log] to=%s subject=%s\n%s",
			"student@example.com",
			"Verify Email",
			"https://example.com/verify-email?token=123",
		);

		infoSpy.mockRestore();
	});
});
