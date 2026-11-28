import { describe, expect, test } from "vitest";
import {
	evaluateSessionLinkReminderWindow,
	renderSessionLinkEmail,
	SESSION_LINK_REMINDER_LEAD_MINUTES,
	SESSION_LINK_REMINDER_LEAD_MS,
} from "./session-link-email";

function vnMs(isoDateTime: string): number {
	return Date.parse(`${isoDateTime}+07:00`);
}

describe("evaluateSessionLinkReminderWindow", () => {
	test("exports 120-minute lead constants", () => {
		expect(SESSION_LINK_REMINDER_LEAD_MINUTES).toBe(120);
		expect(SESSION_LINK_REMINDER_LEAD_MS).toBe(120 * 60_000);
	});

	test("returns exact [startMs - 2h, startMs) boundaries in Asia/Ho_Chi_Minh", () => {
		// Session: 2026-11-28 19:00 VN -> window [17:00, 19:00)
		expect(
			evaluateSessionLinkReminderWindow({
				date: "2026-11-28",
				time: "19:00",
				nowMs: vnMs("2026-11-28T16:59:59.999"),
			}),
		).toMatchObject({ status: "too_early" });

		const exactOpen = evaluateSessionLinkReminderWindow({
			date: "2026-11-28",
			time: "19:00",
			nowMs: vnMs("2026-11-28T17:00:00.000"),
		});
		expect(exactOpen).toEqual({
			status: "due",
			startMs: vnMs("2026-11-28T19:00:00.000"),
			windowStartMs: vnMs("2026-11-28T17:00:00.000"),
		});

		expect(
			evaluateSessionLinkReminderWindow({
				date: "2026-11-28",
				time: "19:00",
				nowMs: vnMs("2026-11-28T18:59:59.999"),
			}).status,
		).toBe("due");

		expect(
			evaluateSessionLinkReminderWindow({
				date: "2026-11-28",
				time: "19:00",
				nowMs: vnMs("2026-11-28T19:00:00.000"),
			}).status,
		).toBe("started");

		expect(
			evaluateSessionLinkReminderWindow({
				date: "2026-11-28",
				time: "19:00",
				nowMs: vnMs("2026-11-28T19:15:00.000"),
			}).status,
		).toBe("started");
	});

	test("handles midnight-crossing sessions accurately", () => {
		// Session at 00:30 VN on 2026-05-16 -> window opens 22:30 VN on 2026-05-15
		expect(
			evaluateSessionLinkReminderWindow({
				date: "2026-05-16",
				time: "00:30",
				nowMs: vnMs("2026-05-15T22:29:59.999"),
			}).status,
		).toBe("too_early");

		expect(
			evaluateSessionLinkReminderWindow({
				date: "2026-05-16",
				time: "00:30",
				nowMs: vnMs("2026-05-15T22:30:00.000"),
			}).status,
		).toBe("due");

		expect(
			evaluateSessionLinkReminderWindow({
				date: "2026-05-16",
				time: "00:30",
				nowMs: vnMs("2026-05-16T00:30:00.000"),
			}).status,
		).toBe("started");
	});

	test("returns invalid for malformed, padded, rollover dates, bad times, or non-finite nowMs", () => {
		for (const badCase of [
			{ date: null, time: "19:00", nowMs: vnMs("2026-11-28T17:30:00") },
			{ date: undefined, time: "19:00", nowMs: vnMs("2026-11-28T17:30:00") },
			{ date: "", time: "19:00", nowMs: vnMs("2026-11-28T17:30:00") },
			{
				date: " 2026-11-28 ",
				time: "19:00",
				nowMs: vnMs("2026-11-28T17:30:00"),
			},
			{ date: "2026-02-31", time: "19:00", nowMs: vnMs("2026-02-28T17:30:00") },
			{ date: "2026-11-28", time: "24:00", nowMs: vnMs("2026-11-28T17:30:00") },
			{ date: "2026-11-28", time: "9:00", nowMs: vnMs("2026-11-28T07:30:00") },
			{ date: "2026-11-28", time: "19:00", nowMs: Number.NaN },
		]) {
			expect(evaluateSessionLinkReminderWindow(badCase)).toEqual({
				status: "invalid",
				startMs: null,
				windowStartMs: null,
			});
		}
	});
});

describe("renderSessionLinkEmail", () => {
	test("renders branded HTML and plain text with Zoom CTA, secondary portal link, topic, and dark mode CSS", () => {
		const rendered = renderSessionLinkEmail({
			className: "IELTS 6.5 — Tối T3/T5",
			dateISO: "2026-11-28",
			time: "19:00",
			dur: 90,
			topic: "Writing Task 2 — Opinion Essay",
			joinUrl: "https://zoom.us/j/987654321?pwd=abc",
			sessionPortalUrl:
				"https://lms.msmy.io.vn/student/classes/cls-1/sessions/2026-11-28",
			studentName: "Nguyễn Minh Anh",
			orgName: "Trung tâm Anh ngữ Minh Anh",
		});

		expect(rendered.subject).toBe(
			"Link buổi học lớp IELTS 6.5 — Tối T3/T5 — 19:00, 28/11/2026",
		);
		expect(rendered.summaryBody).toContain("IELTS 6.5 — Tối T3/T5");
		expect(rendered.summaryBody).toContain("19:00 – 20:30");
		expect(rendered.summaryBody).toContain("Thứ Bảy, 28/11/2026");

		expect(rendered.html).toContain("<!DOCTYPE html>");
		expect(rendered.html).toContain('<html lang="vi">');
		expect(rendered.html).toContain("@media (prefers-color-scheme: dark)");
		expect(rendered.html).toContain("[data-ogsc]");
		expect(rendered.html).toContain("Cô Mỹ Dạy Tiếng Anh");
		expect(rendered.html).toContain("Trung tâm Anh ngữ Minh Anh");
		expect(rendered.html).toContain("Buổi học sắp diễn ra");
		expect(rendered.html).toContain("Chào Nguyễn Minh Anh,");
		expect(rendered.html).toContain("Thứ Bảy, 28/11/2026");
		expect(rendered.html).toContain("19:00 – 20:30");
		expect(rendered.html).toContain("Nội dung buổi học");
		expect(rendered.html).toContain("Writing Task 2 — Opinion Essay");
		expect(rendered.html).toContain("Tham gia buổi học");
		expect(rendered.html).toContain(
			'href="https://zoom.us/j/987654321?pwd=abc"',
		);
		expect(rendered.html).toContain("Mở trang chi tiết buổi học");
		expect(rendered.html).toContain(
			'href="https://lms.msmy.io.vn/student/classes/cls-1/sessions/2026-11-28"',
		);

		expect(rendered.text).toContain("Chào Nguyễn Minh Anh,");
		expect(rendered.text).toContain("- Lớp học: IELTS 6.5 — Tối T3/T5");
		expect(rendered.text).toContain("- Ngày học: Thứ Bảy, 28/11/2026");
		expect(rendered.text).toContain("- Giờ học: 19:00 – 20:30");
		expect(rendered.text).toContain(
			"- Nội dung buổi học: Writing Task 2 — Opinion Essay",
		);
		expect(rendered.text).toContain(
			"Tham gia buổi học: https://zoom.us/j/987654321?pwd=abc",
		);
		expect(rendered.text).toContain(
			"Xem chi tiết buổi học trên cổng học viên: https://lms.msmy.io.vn/student/classes/cls-1/sessions/2026-11-28",
		);
	});

	test("handles midnight-crossing duration and omits optional topic, portal link, and duplicate orgName", () => {
		const rendered = renderSessionLinkEmail({
			className: "Speaking Late",
			dateISO: "2026-11-28",
			time: "23:30",
			dur: 90,
			joinUrl: "https://us02web.zoom.us/j/123456",
			orgName: "Cô Mỹ Dạy Tiếng Anh",
		});

		expect(rendered.html).toContain("Chào bạn,");
		expect(rendered.html).toContain("23:30 – 01:00 (29/11/2026)");
		expect(rendered.html).not.toContain("Nội dung buổi học");
		expect(rendered.html).not.toContain("Mở trang chi tiết buổi học");
		expect(rendered.text).toContain("23:30 – 01:00 (29/11/2026)");
		expect(rendered.text).not.toContain("Nội dung buổi học");
		expect(rendered.text).not.toContain("cổng học viên");
	});

	test("escapes XSS payloads and omits unsafe joinUrl or sessionPortalUrl", () => {
		for (const badJoinUrl of [
			"http://zoom.us/j/123456",
			"https://zoom.us/j/123\u0000456",
			"https://zoom.us/j/123\u0007456",
			"https://zoom.us/j/123\u007f456",
		]) {
			const unsafe = renderSessionLinkEmail({
				className: "IELTS <script>alert(1)</script>\r\nSubject: evil",
				dateISO: "2026-11-28",
				time: "19:00",
				topic: '<img src=x onerror="alert(1)">',
				studentName: "<b>An</b>",
				joinUrl: badJoinUrl,
				sessionPortalUrl: "javascript:alert(1)",
			});

			expect(unsafe.subject).not.toContain("\r");
			expect(unsafe.subject).not.toContain("\n");
			expect(unsafe.html).not.toContain("<script>");
			expect(unsafe.html).not.toContain("<img ");
			expect(unsafe.html).not.toContain("<b>An</b>");
			expect(unsafe.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
			expect(unsafe.html).not.toContain("Tham gia buổi học");
			expect(unsafe.html).not.toContain("và đường dẫn tham gia buổi học");
			expect(unsafe.html).not.toContain(badJoinUrl);
			expect(unsafe.html).not.toContain("javascript:alert(1)");
			expect(unsafe.text).not.toContain(badJoinUrl);
			expect(unsafe.text).not.toContain("javascript:alert(1)");
		}
	});
});
