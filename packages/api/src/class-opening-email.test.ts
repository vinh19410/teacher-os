import { describe, expect, test } from "vitest";
import {
	escapeEmailHtml,
	isSafeEmailUrl,
	renderClassOpeningEmail,
} from "./class-opening-email";
import {
	CLASS_ERROR_CODES,
	CLASS_OPENING_NOTE_MAX_LENGTH,
	CLASS_OPENING_SEND_MODES,
	classConfirmOpeningResponseSchema,
	classConfirmOpeningSchema,
	type KernelClassRow,
	NOTIFICATION_EVENT_GROUP_BY_TYPE,
	NOTIFICATION_EVENT_TYPES,
} from "./contracts";

const STRUCTURED_SCHEDULE = JSON.stringify({
	days: [1, 3],
	start: "19:00",
	end: "20:30",
});

describe("escapeEmailHtml", () => {
	test("escapes all five HTML-significant characters without double-escaping", () => {
		expect(escapeEmailHtml(`<a href="x" title='y'>&test</a>`)).toBe(
			"&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;test&lt;/a&gt;",
		);
	});
});

describe("isSafeEmailUrl", () => {
	test("allows https, http, and single-slash relative URLs", () => {
		expect(isSafeEmailUrl("https://student.comy.edu.vn/classes/c1")).toBe(true);
		expect(
			isSafeEmailUrl("http://localhost:8003/classes/c1?tab=overview"),
		).toBe(true);
		expect(isSafeEmailUrl("/classes/c1")).toBe(true);
		expect(isSafeEmailUrl("/")).toBe(true);
		expect(isSafeEmailUrl("  https://student.comy.edu.vn/classes/c1  ")).toBe(
			true,
		);
	});

	test("rejects javascript, data, protocol-relative, control-char, and malformed URLs", () => {
		for (const unsafe of [
			"",
			"   ",
			"javascript:alert(1)",
			"JAVASCRIPT:alert(1)",
			"data:text/html,<script>alert(1)</script>",
			"vbscript:msgbox(1)",
			"mailto:student@example.com",
			"//evil.com/phish",
			"/\\evil.com/phish",
			"relative/without-leading-slash",
			"https://",
			"https://example.com/a\nb",
			"https://example.com/a b",
		]) {
			expect(
				isSafeEmailUrl(unsafe),
				`expected ${JSON.stringify(unsafe)} to be rejected`,
			).toBe(false);
		}
	});
});

describe("renderClassOpeningEmail", () => {
	test("renders initial announcement with subject, heading, inbox fields, weekday date, and email shell", () => {
		const rendered = renderClassOpeningEmail({
			className: "IELTS 6.5 — Tối T3/T5",
			startDate: "2026-09-15",
			scheduleRaw: STRUCTURED_SCHEDULE,
			mode: "Online",
			sessionsTotal: 24,
			level: "IELTS 6.5",
			studentName: "Nguyễn Minh Anh",
			orgName: "Trung tâm Anh ngữ Minh Anh",
			portalUrl: "https://student.comy.edu.vn/classes/cls-1",
		});

		expect(rendered.subject).toBe(
			"Thông báo khai giảng lớp IELTS 6.5 — Tối T3/T5 — 15/09/2026",
		);
		expect(rendered.inboxTitle).toBe("Thông báo khai giảng");
		expect(rendered.inboxBody).toContain("IELTS 6.5 — Tối T3/T5");
		expect(rendered.inboxBody).toContain("Thứ Ba, 15/09/2026");
		expect(rendered.inboxBody).toContain("T3 & T5 · 19:00–20:30");

		expect(rendered.html).toContain("<!DOCTYPE html>");
		expect(rendered.html).toContain('<html lang="vi">');
		expect(rendered.html).toContain('role="presentation"');
		expect(rendered.html).toContain("max-width:580px");
		expect(rendered.html).toContain("@media (prefers-color-scheme: dark)");
		expect(rendered.html).toContain("[data-ogsc]");
		expect(rendered.html).toContain("Cô Mỹ Dạy Tiếng Anh");
		expect(rendered.html).toContain("Trung tâm Anh ngữ Minh Anh");
		expect(rendered.html).toContain("Thông báo khai giảng");
		expect(rendered.html).toContain(
			"Lịch khai giảng lớp IELTS 6.5 — Tối T3/T5",
		);
		expect(rendered.html).toContain("Chào Nguyễn Minh Anh,");
		expect(rendered.html).toContain("Thứ Ba, 15/09/2026");
		expect(rendered.html).toContain("Giờ học");
		expect(rendered.html).toContain("19:00 – 20:30");
		expect(rendered.html).toContain("Lịch học định kỳ");
		expect(rendered.html).toContain("T3 &amp; T5 · 19:00–20:30");
		expect(rendered.html).toContain("Hình thức");
		expect(rendered.html).toContain("Online");
		expect(rendered.html).toContain("Trình độ");
		expect(rendered.html).toContain("Thời lượng");
		expect(rendered.html).toContain("24 buổi");
		expect(rendered.html).toContain("Mở cổng học viên");
		expect(rendered.html).toContain(
			'href="https://student.comy.edu.vn/classes/cls-1"',
		);

		expect(rendered.text).toContain("Chào Nguyễn Minh Anh,");
		expect(rendered.text).toContain("- Lớp học: IELTS 6.5 — Tối T3/T5");
		expect(rendered.text).toContain("- Ngày khai giảng: Thứ Ba, 15/09/2026");
		expect(rendered.text).toContain("- Giờ học: 19:00 – 20:30");
		expect(rendered.text).toContain(
			"- Lịch học định kỳ: T3 & T5 · 19:00–20:30",
		);
		expect(rendered.text).toContain("- Hình thức: Online");
		expect(rendered.text).toContain("- Trình độ: IELTS 6.5");
		expect(rendered.text).toContain("- Thời lượng: 24 buổi");
		expect(rendered.text).toContain(
			"https://student.comy.edu.vn/classes/cls-1",
		);
	});

	test("renders update announcement with updated subject, badge, heading, and inbox copy", () => {
		const rendered = renderClassOpeningEmail({
			className: "IELTS 7.0",
			startDate: "2026-11-08",
			scheduleRaw: STRUCTURED_SCHEDULE,
			mode: "Offline",
			isUpdate: true,
		});

		expect(rendered.subject).toBe(
			"Cập nhật lịch khai giảng lớp IELTS 7.0 — 08/11/2026",
		);
		expect(rendered.inboxTitle).toBe("Cập nhật lịch khai giảng");
		expect(rendered.inboxBody).toContain(
			"Cập nhật lịch khai giảng lớp IELTS 7.0",
		);
		expect(rendered.inboxBody).toContain("Chủ Nhật, 08/11/2026");

		expect(rendered.html).toContain("badge-update");
		expect(rendered.html).toContain("Cập nhật lịch khai giảng lớp IELTS 7.0");
		expect(rendered.html).toContain("Chào bạn,");
		expect(rendered.html).toContain("Chủ Nhật, 08/11/2026");
	});

	test("supports legacy free-text schedule and empty schedule", () => {
		const legacy = renderClassOpeningEmail({
			className: "Giao tiếp B1",
			startDate: "15/09/2026",
			scheduleRaw: "Tối T2 & T4 (19h - 20h30)",
			mode: "Offline",
		});

		expect(legacy.subject).toBe(
			"Thông báo khai giảng lớp Giao tiếp B1 — 15/09/2026",
		);
		expect(legacy.html).toContain("Lịch học");
		expect(legacy.html).toContain("Tối T2 &amp; T4 (19h - 20h30)");
		expect(legacy.html).not.toContain("Giờ học");
		expect(legacy.html).not.toContain("Lịch học định kỳ");
		expect(legacy.text).toContain("- Lịch học: Tối T2 & T4 (19h - 20h30)");

		const emptySchedule = renderClassOpeningEmail({
			className: "Giao tiếp A2",
			startDate: "",
			scheduleRaw: "   ",
			mode: "",
			sessionsTotal: 0,
			level: "   ",
		});

		expect(emptySchedule.subject).toBe("Thông báo khai giảng lớp Giao tiếp A2");
		expect(emptySchedule.html).not.toContain("Ngày khai giảng");
		expect(emptySchedule.html).not.toContain("Giờ học");
		expect(emptySchedule.html).not.toContain("Lịch học định kỳ");
		expect(emptySchedule.html).not.toContain(">Lịch học<");
		expect(emptySchedule.html).not.toContain("Hình thức");
		expect(emptySchedule.html).not.toContain("Trình độ");
		expect(emptySchedule.html).not.toContain("Thời lượng");
	});

	test("handles optional sessionsTotal > 0 vs 0/negative and avoids duplicating matching orgName", () => {
		const withZero = renderClassOpeningEmail({
			className: "IELTS Foundation",
			startDate: "2026-10-01",
			scheduleRaw: "",
			mode: "Online",
			sessionsTotal: 0,
			brandName: "Cô Mỹ Dạy Tiếng Anh",
			orgName: "Cô Mỹ Dạy Tiếng Anh",
		});
		expect(withZero.html).not.toContain("Thời lượng");
		expect(withZero.html).not.toContain(
			"Cô Mỹ Dạy Tiếng Anh · Cô Mỹ Dạy Tiếng Anh",
		);

		const withPositive = renderClassOpeningEmail({
			className: "IELTS Foundation",
			startDate: "2026-10-01",
			scheduleRaw: "",
			mode: "Online",
			sessionsTotal: 16,
		});
		expect(withPositive.html).toContain("16 buổi");
	});

	test("renders multiline teacherNote with <br> and omits callout when blank", () => {
		const withNote = renderClassOpeningEmail({
			className: "IELTS 6.0",
			startDate: "2026-10-05",
			scheduleRaw: STRUCTURED_SCHEDULE,
			mode: "Online",
			teacherNote:
				"Vui lòng kiểm tra mic trước buổi học.\r\nĐăng nhập sớm 10 phút nhé!",
		});

		expect(withNote.html).toContain("Lời nhắn từ giáo viên");
		expect(withNote.html).toContain(
			"Vui lòng kiểm tra mic trước buổi học.<br>Đăng nhập sớm 10 phút nhé!",
		);
		expect(withNote.text).toContain("Lời nhắn từ giáo viên:");
		expect(withNote.text).toContain(
			"Vui lòng kiểm tra mic trước buổi học.\nĐăng nhập sớm 10 phút nhé!",
		);
		expect(withNote.inboxBody).toContain(
			"Lời nhắn: Vui lòng kiểm tra mic trước buổi học. Đăng nhập sớm 10 phút nhé!",
		);

		const withoutNote = renderClassOpeningEmail({
			className: "IELTS 6.0",
			startDate: "2026-10-05",
			scheduleRaw: STRUCTURED_SCHEDULE,
			mode: "Online",
			teacherNote: "   \n\t  ",
		});

		expect(withoutNote.html).not.toContain("Lời nhắn từ giáo viên");
		expect(withoutNote.text).not.toContain("Lời nhắn từ giáo viên:");
		expect(withoutNote.inboxBody).not.toContain("Lời nhắn:");
	});

	test("strips control characters from subject and inboxTitle", () => {
		const rendered = renderClassOpeningEmail({
			className: "IELTS 6.5\r\nBcc: attacker@evil.com\0",
			startDate: "2026-10-05",
			scheduleRaw: "",
			mode: "Online",
		});

		expect(rendered.subject).not.toMatch(/[\r\n]/);
		expect(rendered.subject.includes("\0")).toBe(false);
		expect(rendered.inboxTitle).not.toMatch(/[\r\n]/);
		expect(rendered.inboxTitle.includes("\0")).toBe(false);
	});

	test("strictly escapes XSS payloads across all text fields", () => {
		const xss = `<script>alert("xss")</script><img src=x onerror='evil()'>`;
		const rendered = renderClassOpeningEmail({
			className: `Lớp ${xss}`,
			startDate: "2026-10-05",
			scheduleRaw: `Lịch ${xss}`,
			mode: `Online ${xss}`,
			level: `Band ${xss}`,
			studentName: `Học viên ${xss}`,
			orgName: `Org ${xss}`,
			brandName: `Brand ${xss}`,
			teacherNote: `Dòng 1 ${xss}\nDòng 2`,
		});

		expect(rendered.html).not.toContain("<script>");
		expect(rendered.html).not.toContain("<img");
		expect(rendered.html).not.toContain("onerror='evil()'");
		expect(rendered.html).toContain(
			"&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&lt;img src=x onerror=&#39;evil()&#39;&gt;",
		);
		expect(rendered.html).toContain("<br>Dòng 2");
	});

	test("strips unsafe portalUrl and renders CTA + fallback link only for safe URLs", () => {
		for (const unsafeUrl of [
			"javascript:alert(1)",
			"data:text/html,<script>alert(1)</script>",
			"//evil.com/steal",
		]) {
			const rendered = renderClassOpeningEmail({
				className: "IELTS 6.5",
				startDate: "2026-10-05",
				scheduleRaw: STRUCTURED_SCHEDULE,
				mode: "Online",
				portalUrl: unsafeUrl,
			});

			expect(rendered.html).not.toContain("Mở cổng học viên");
			expect(rendered.html).not.toContain(unsafeUrl);
			expect(rendered.text).not.toContain(unsafeUrl);
		}

		const safe = renderClassOpeningEmail({
			className: "IELTS 6.5",
			startDate: "2026-10-05",
			scheduleRaw: STRUCTURED_SCHEDULE,
			mode: "Online",
			portalUrl: "https://student.comy.edu.vn/classes/c1?from=email&v=1",
		});

		expect(safe.html).toContain("Mở cổng học viên");
		expect(safe.html).toContain(
			'href="https://student.comy.edu.vn/classes/c1?from=email&amp;v=1"',
		);
		expect(safe.html).toContain("Nếu nút không hoạt động");
		expect(safe.text).toContain(
			"https://student.comy.edu.vn/classes/c1?from=email&v=1",
		);
	});

	test("contains zero external network assets (no external img, link, or @import)", () => {
		const rendered = renderClassOpeningEmail({
			className: "IELTS 6.5",
			startDate: "2026-10-05",
			scheduleRaw: STRUCTURED_SCHEDULE,
			mode: "Online",
			teacherNote: "Hẹn gặp các bạn tối thứ 3!",
			portalUrl: "https://student.comy.edu.vn/classes/c1",
		});

		expect(rendered.html).not.toMatch(/<img\b[^>]*src=["']?https?:/i);
		expect(rendered.html).not.toMatch(/<link\b[^>]*href=["']?https?:/i);
		expect(rendered.html).not.toMatch(/@import/i);
	});
});

describe("class opening confirmation contracts", () => {
	test("registers notification event type, group mapping, and error code", () => {
		expect(NOTIFICATION_EVENT_TYPES).toContain("class_opening_confirmed");
		expect(NOTIFICATION_EVENT_GROUP_BY_TYPE.class_opening_confirmed).toBe(
			"schedule",
		);
		expect(CLASS_ERROR_CODES.OPENING_VERSION_CONFLICT).toBe(
			"CLASS_OPENING_VERSION_CONFLICT",
		);
		expect(CLASS_OPENING_SEND_MODES).toEqual(["initial", "new_only", "all"]);
		expect(CLASS_OPENING_NOTE_MAX_LENGTH).toBe(1000);
	});

	test("classConfirmOpeningSchema accepts valid payloads and defaults note", () => {
		const minimal = classConfirmOpeningSchema.safeParse({
			mode: "initial",
			expectedVersion: 0,
		});
		expect(minimal.success).toBe(true);
		if (minimal.success) {
			expect(minimal.data).toEqual({
				mode: "initial",
				note: "",
				expectedVersion: 0,
			});
		}

		const full = classConfirmOpeningSchema.safeParse({
			mode: "all",
			startDate: " 2026-09-15 ",
			note: `  ${"a".repeat(CLASS_OPENING_NOTE_MAX_LENGTH)}  `,
			expectedVersion: 2,
		});
		expect(full.success).toBe(true);
		if (full.success) {
			expect(full.data.startDate).toBe("2026-09-15");
			expect(full.data.note.length).toBe(CLASS_OPENING_NOTE_MAX_LENGTH);
		}
	});

	test("classConfirmOpeningSchema rejects invalid dates, overlong notes, bad versions, and unknown keys", () => {
		for (const badDate of [
			"",
			"   ",
			"2026-02-30",
			"15/09/2026",
			"1999-12-31",
			"2101-01-01",
		]) {
			const res = classConfirmOpeningSchema.safeParse({
				mode: "initial",
				startDate: badDate,
				expectedVersion: 0,
			});
			expect(
				res.success,
				`expected startDate ${JSON.stringify(badDate)} to fail`,
			).toBe(false);
		}

		expect(
			classConfirmOpeningSchema.safeParse({
				mode: "new_only",
				note: "x".repeat(CLASS_OPENING_NOTE_MAX_LENGTH + 1),
				expectedVersion: 1,
			}).success,
		).toBe(false);

		expect(
			classConfirmOpeningSchema.safeParse({
				mode: "initial",
				expectedVersion: -1,
			}).success,
		).toBe(false);

		expect(
			classConfirmOpeningSchema.safeParse({
				mode: "initial",
				expectedVersion: 1.5,
			}).success,
		).toBe(false);

		expect(
			classConfirmOpeningSchema.safeParse({
				mode: "invalid_mode",
				expectedVersion: 0,
			}).success,
		).toBe(false);

		expect(
			classConfirmOpeningSchema.safeParse({
				mode: "initial",
				expectedVersion: 0,
				extraField: true,
			}).success,
		).toBe(false);
	});

	test("classConfirmOpeningResponseSchema validates shape and rejects extra keys", () => {
		const validPayload = {
			ok: true as const,
			openingConfirmedAt: "2026-09-01T10:00:00.000Z",
			openingAnnouncementVersion: 1,
			startDate: "2026-09-15",
			openingNote: "Hẹn gặp lớp vào tối thứ 3",
			queuedEmailCount: 8,
			inAppOnlyCount: 2,
			skippedNoEmail: [{ studentId: "st-1", studentName: "Trần Bình" }],
			skippedAlreadySentCount: 0,
			notifiedStudentIds: ["st-1", "st-2"],
		};

		expect(
			classConfirmOpeningResponseSchema.safeParse(validPayload).success,
		).toBe(true);

		expect(
			classConfirmOpeningResponseSchema.safeParse({
				...validPayload,
				openingAnnouncementVersion: 0,
			}).success,
		).toBe(false);

		expect(
			classConfirmOpeningResponseSchema.safeParse({
				...validPayload,
				queuedEmailCount: -1,
			}).success,
		).toBe(false);

		expect(
			classConfirmOpeningResponseSchema.safeParse({
				...validPayload,
				extra: "nope",
			}).success,
		).toBe(false);

		expect(
			classConfirmOpeningResponseSchema.safeParse({
				...validPayload,
				skippedNoEmail: [
					{ studentId: "st-1", studentName: "Trần Bình", extra: 1 },
				],
			}).success,
		).toBe(false);
	});

	test("KernelClassRow keeps opening fields optional for backward compatibility", () => {
		const legacyRow: KernelClassRow = {
			id: "c-1",
			name: "IELTS 6.5",
			level: "6.5",
			type: "ielts",
			skills: ["Writing"],
			mode: "Online",
			syllabusId: null,
			schedule: STRUCTURED_SCHEDULE,
			sessionsTotal: 20,
			sessionsDone: 0,
			status: "active",
			startDate: "2026-09-15",
			tuitionFee: 3_500_000,
			notes: "",
		};

		const enrichedRow: KernelClassRow = {
			...legacyRow,
			openingConfirmedAt: "2026-09-01T10:00:00.000Z",
			openingNote: "Chào mừng cả lớp",
			openingAnnouncementVersion: 1,
			openingNotifiedStudentIds: ["st-1"],
		};

		expect(legacyRow.openingConfirmedAt).toBeUndefined();
		expect(enrichedRow.openingAnnouncementVersion).toBe(1);
	});
});
