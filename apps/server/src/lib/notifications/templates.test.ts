import { describe, expect, test } from "vitest";
import {
	assignmentPublishedEvents,
	classEnrolledEvent,
	classOpeningConfirmedEvents,
	dailyDeadlineReminderEvent,
	eventGroupOf,
	gradeReturnedEvent,
	holidayCreatedEvents,
	invoiceIssuedEvent,
	isOpeningStudentNotified,
	placementSubmittedEvent,
	renderDailyDeadlineReminderHtml,
	renderDailyDeadlineReminderText,
	scheduleChangedEvents,
} from "./templates";

describe("notification template builders (phase 3 #454)", () => {
	test("classEnrolledEvent — khóa theo enrollment, nhóm class_invite", () => {
		const e = classEnrolledEvent({
			enrollmentId: "enr-1",
			studentId: "s-1",
			className: "IELTS A",
		});
		expect(e.eventType).toBe("class_enrolled");
		expect(e.idempotencyKey).toBe("class_enrolled:enr-1");
		expect(e.studentId).toBe("s-1");
		expect(e.linkPath).toBe("/classes");
		expect(e.refType).toBe("enrollment");
		expect(e.refId).toBe("enr-1");
		expect(eventGroupOf(e.eventType)).toBe("class_invite");
		expect(e.body).toContain("IELTS A");
	});

	test("assignmentPublishedEvents — 1 sự kiện mỗi học viên, khóa theo cặp", () => {
		const events = assignmentPublishedEvents({
			classAssignmentId: "ca-1",
			title: "Writing Task 2",
			due: "2026-11-01",
			studentIds: ["s-1", "s-2"],
		});
		expect(events).toHaveLength(2);
		expect(events.map((e) => e.idempotencyKey)).toEqual([
			"assignment_published:ca-1:s-1",
			"assignment_published:ca-1:s-2",
		]);
		for (const e of events) {
			expect(e.eventType).toBe("assignment_published");
			expect(eventGroupOf(e.eventType)).toBe("assignment");
			expect(e.linkPath).toBe("/learn/quizzes/ca-1");
			expect(e.refId).toBe("ca-1");
			expect(e.body).toContain("Writing Task 2");
			expect(e.body).toContain("01/11/2026");
			expect(e.body).not.toContain("2026-11-01");
		}
	});

	test("assignmentPublishedEvents — định dạng giờ + ngày VN từ dueAt khi có (#572)", () => {
		const events = assignmentPublishedEvents({
			classAssignmentId: "ca-2",
			title: "Reading Part 1",
			due: "2026-11-06",
			dueAt: new Date(Date.parse("2026-11-06T17:30:00+07:00")).toISOString(),
			studentIds: ["s-1"],
		});
		expect(events).toHaveLength(1);
		expect(events[0]?.body).toContain("17:30 06/11/2026");
	});

	test("gradeReturnedEvent — khóa canonical theo attempt", () => {
		const e = gradeReturnedEvent({
			attemptId: "att-1",
			studentId: "s-1",
			title: "Speaking Part 2",
			// Giá trị route thật truyền vào (CR I1): attempt gắn lượt giao →
			// trang xem bài đã chấm trên cổng học viên.
			linkPath: "/learn/quizzes/attempt/att-1",
		});
		expect(e.eventType).toBe("grade_returned");
		expect(e.idempotencyKey).toBe("grade_returned:att-1");
		expect(e.studentId).toBe("s-1");
		expect(e.linkPath).toBe("/learn/quizzes/attempt/att-1");
		expect(eventGroupOf(e.eventType)).toBe("assignment");
	});

	test("invoiceIssuedEvent — khóa theo hóa đơn, định dạng VND", () => {
		const e = invoiceIssuedEvent({
			id: "inv-1",
			studentId: "s-1",
			amount: 2500000,
			due: "2026-11-15",
		});
		expect(e.eventType).toBe("invoice_issued");
		expect(e.idempotencyKey).toBe("invoice_issued:inv-1");
		expect(e.linkPath).toBe("/tuition");
		expect(e.body).toContain("2.500.000đ");
		expect(e.body).toContain("2026-11-15");
		expect(eventGroupOf(e.eventType)).toBe("tuition");
	});

	test("scheduleChangedEvents — khóa gồm classId:date:editedAtMs:studentId", () => {
		const events = scheduleChangedEvents({
			classId: "c-1",
			date: "2026-10-27",
			editedAtMs: 1760000000000,
			studentIds: ["s-1", "s-2"],
		});
		expect(events.map((e) => e.idempotencyKey)).toEqual([
			"schedule_changed:c-1:2026-10-27:1760000000000:s-1",
			"schedule_changed:c-1:2026-10-27:1760000000000:s-2",
		]);
		for (const e of events) {
			expect(e.eventType).toBe("schedule_changed");
			expect(eventGroupOf(e.eventType)).toBe("schedule");
			expect(e.linkPath).toBe("/classes");
			expect(e.studentId === "s-1" || e.studentId === "s-2").toBe(true);
		}
	});

	test("holidayCreatedEvents — builder sẵn có của phase 2 giữ nguyên hợp đồng", () => {
		const events = holidayCreatedEvents({
			holidayId: "h-1",
			title: "Tết dương lịch",
			date: "2027-01-01",
			studentIds: ["s-1"],
		});
		expect(events[0]?.idempotencyKey).toBe("holiday_created:h-1:s-1");
	});

	test("placementSubmittedEvent — in-app only, khóa theo submissionId, nhóm assignment", () => {
		const e = placementSubmittedEvent({
			submissionId: "sub-1",
			studentId: "s-1",
		});
		expect(e).toEqual({
			studentId: "s-1",
			eventType: "placement_submitted",
			idempotencyKey: "placement_submitted:sub-1",
			title: "Nộp bài kiểm tra đầu vào thành công",
			body: "Bài làm của bạn đã được ghi nhận và đang chờ giáo viên chấm điểm. Bấm để xem trạng thái và kết quả.",
			linkPath: "/placement-test",
			refType: "placement_submission",
			refId: "sub-1",
			channels: "in_app",
		});
		expect(eventGroupOf(e.eventType)).toBe("assignment");
	});

	test("classOpeningConfirmedEvents — sinh email HTML và textBody cá nhân hóa, khóa theo (classId, version, studentId, channel)", () => {
		const events = classOpeningConfirmedEvents({
			classId: "cls-1",
			className: "IELTS 6.5 Intensive",
			startDate: "2026-06-15",
			scheduleRaw: JSON.stringify({
				days: [0, 2, 4],
				start: "19:00",
				end: "20:30",
			}),
			mode: "Online",
			sessionsTotal: 24,
			version: 1,
			isUpdate: false,
			teacherNote: "Mang theo <b>vở ghi</b>\nVào phòng sớm 10 phút",
			orgName: "Trung tâm Anh ngữ Minh Anh",
			studentOrigin: "https://student.teacheros.example///",
			students: [
				{ id: "s-1", name: "Nguyễn Văn An", hasEmail: true },
				{ id: "s-2", name: "Trần Thu Hà", hasEmail: false },
				{ id: "s-3", name: "Phạm Minh Đức" },
			],
		});

		expect(events).toHaveLength(3);
		expect(events.map((e) => e.idempotencyKey)).toEqual([
			"class_opening_confirmed:cls-1:v1:s-1:email",
			"class_opening_confirmed:cls-1:v1:s-2:in_app",
			"class_opening_confirmed:cls-1:v1:s-3:email",
		]);

		const first = events[0];
		const second = events[1];
		if (!first || !second) throw new Error("expected events");

		expect(first.eventType).toBe("class_opening_confirmed");
		expect(eventGroupOf(first.eventType)).toBe("schedule");
		expect(first.linkPath).toBe("/classes");
		expect(first.refType).toBe("class");
		expect(first.refId).toBe("cls-1");
		expect(first.title).toContain(
			"Thông báo khai giảng lớp IELTS 6.5 Intensive",
		);
		expect(first.title).toContain("15/06/2026");
		expect(first.body).toContain("IELTS 6.5 Intensive");
		expect(first.htmlBody).toBeTruthy();
		expect(first.htmlBody).toContain("<!DOCTYPE html>");
		expect(first.htmlBody).toContain("Chào Nguyễn Văn An,");
		expect(first.htmlBody).toContain("IELTS 6.5 Intensive");
		expect(first.htmlBody).toContain("19:00 – 20:30");
		expect(first.htmlBody).toContain("Ngày kết thúc khóa học dự kiến");
		expect(first.htmlBody).toContain("Thứ Sáu, 07/08/2026");
		expect(first.htmlBody).not.toContain("Trình độ");
		expect(first.htmlBody).not.toContain("Thời lượng");
		expect(first.htmlBody).not.toContain("24 buổi");
		expect(first.htmlBody).not.toContain("Band 6.5");
		expect(first.htmlBody).toContain("Trung tâm Anh ngữ Minh Anh");
		expect(first.htmlBody).toContain(
			"Mang theo &lt;b&gt;vở ghi&lt;/b&gt;<br>Vào phòng sớm 10 phút",
		);
		expect(first.htmlBody).not.toContain("<b>vở ghi</b>");
		expect(first.htmlBody).toContain(
			'href="https://student.teacheros.example/classes"',
		);
		expect(first.textBody).toBeTruthy();
		expect(first.textBody).toContain("Chào Nguyễn Văn An,");
		expect(first.textBody).toContain("19:00 – 20:30");
		expect(first.textBody).toContain(
			"- Ngày kết thúc khóa học dự kiến: Thứ Sáu, 07/08/2026",
		);
		expect(first.textBody).not.toContain("Trình độ");
		expect(first.textBody).not.toContain("Thời lượng");
		expect(first.textBody).not.toContain("24 buổi");
		expect(first.textBody).toContain(
			"Mang theo <b>vở ghi</b>\nVào phòng sớm 10 phút",
		);
		expect(first.textBody).toContain(
			"https://student.teacheros.example/classes",
		);
		expect(second.htmlBody).toContain("Chào Trần Thu Hà,");
		expect(second.textBody).toContain("Chào Trần Thu Hà,");
	});

	test("classOpeningConfirmedEvents — truyền explicit expectedEndDate và null để ẩn dòng", () => {
		const overridden = classOpeningConfirmedEvents({
			classId: "cls-override",
			className: "IELTS 7.0",
			startDate: "2026-06-15",
			scheduleRaw: JSON.stringify({
				days: [0, 2, 4],
				start: "19:00",
				end: "20:30",
			}),
			mode: "Online",
			sessionsTotal: 24,
			expectedEndDate: "2026-08-14",
			version: 1,
			isUpdate: false,
			teacherNote: "",
			orgName: "Trung tâm Anh ngữ",
			students: [{ id: "s-1", name: "An", hasEmail: true }],
		});
		expect(overridden[0]?.htmlBody).toContain("Thứ Sáu, 14/08/2026");
		expect(overridden[0]?.textBody).toContain(
			"- Ngày kết thúc khóa học dự kiến: Thứ Sáu, 14/08/2026",
		);

		const suppressed = classOpeningConfirmedEvents({
			classId: "cls-null",
			className: "IELTS 7.0",
			startDate: "2026-06-15",
			scheduleRaw: JSON.stringify({
				days: [0, 2, 4],
				start: "19:00",
				end: "20:30",
			}),
			mode: "Online",
			sessionsTotal: 24,
			expectedEndDate: null,
			version: 1,
			isUpdate: false,
			teacherNote: "",
			orgName: "Trung tâm Anh ngữ",
			students: [{ id: "s-1", name: "An", hasEmail: true }],
		});
		expect(suppressed[0]?.htmlBody).not.toContain(
			"Ngày kết thúc khóa học dự kiến",
		);
		expect(suppressed[0]?.textBody).not.toContain(
			"Ngày kết thúc khóa học dự kiến",
		);
	});

	test("classOpeningConfirmedEvents — chế độ cập nhật bỏ CTA khi thiếu studentOrigin và chặn scheme lạ", () => {
		const updateEvents = classOpeningConfirmedEvents({
			classId: "cls-2",
			className: "Giao tiếp cơ bản",
			startDate: "2026-07-01",
			scheduleRaw: "T3 & T5 · 18:30",
			mode: "Offline",
			version: 2,
			isUpdate: true,
			teacherNote: "",
			orgName: "",
			studentOrigin: "   ",
			students: [{ id: "s-3", name: "Lê Minh", hasEmail: true }],
		});

		expect(updateEvents).toHaveLength(1);
		const ev = updateEvents[0];
		if (!ev) throw new Error("expected 1 event");
		expect(ev.idempotencyKey).toBe(
			"class_opening_confirmed:cls-2:v2:s-3:email",
		);
		expect(ev.title).toContain("Cập nhật lịch khai giảng lớp Giao tiếp cơ bản");
		expect(ev.htmlBody).toContain("Cập nhật lịch khai giảng");
		expect(ev.htmlBody).not.toContain('href="/classes"');
		expect(ev.htmlBody).not.toContain("Mở cổng học viên");
		expect(ev.textBody).toBeTruthy();
		expect(ev.textBody).not.toContain("/classes");
		expect(ev.textBody).not.toContain("Mở cổng học viên");

		const unsafeOriginEvents = classOpeningConfirmedEvents({
			classId: "cls-2",
			className: "Giao tiếp cơ bản",
			startDate: "2026-07-01",
			scheduleRaw: "",
			mode: "Online",
			version: 3,
			isUpdate: false,
			teacherNote: "",
			orgName: "",
			studentOrigin: "javascript:alert(1)",
			students: [{ id: "s-3", name: "Lê Minh", hasEmail: false }],
		});
		expect(unsafeOriginEvents[0]?.idempotencyKey).toBe(
			"class_opening_confirmed:cls-2:v3:s-3:in_app",
		);
		expect(unsafeOriginEvents[0]?.htmlBody).not.toContain("javascript:");
		expect(unsafeOriginEvents[0]?.htmlBody).not.toContain("Mở cổng học viên");
		expect(unsafeOriginEvents[0]?.textBody).not.toContain("javascript:");
	});

	test("isOpeningStudentNotified — phân biệt chưa gửi, đã gửi in_app cần nâng cấp email, và đã gửi đủ", () => {
		expect(isOpeningStudentNotified("an@example.com", undefined)).toBe(false);
		expect(isOpeningStudentNotified("", undefined)).toBe(false);
		expect(isOpeningStudentNotified("an@example.com", new Set())).toBe(false);
		expect(isOpeningStudentNotified("", new Set())).toBe(false);

		// Học viên đã có email nhưng trước đó chỉ nhận in_app → cần gửi bổ sung email
		expect(
			isOpeningStudentNotified("an@example.com", new Set(["in_app"])),
		).toBe(false);
		expect(
			isOpeningStudentNotified("  an@example.com  ", new Set(["in_app"])),
		).toBe(false);

		// Học viên đã có email và từng nhận bản ghi có kênh email → đã thông báo
		expect(
			isOpeningStudentNotified("an@example.com", new Set(["email,in_app"])),
		).toBe(true);
		expect(
			isOpeningStudentNotified(
				"an@example.com",
				new Set(["in_app", "email,in_app"]),
			),
		).toBe(true);

		// Học viên không có email và đã có in_app → coi như đã thông báo để không lặp vô hạn
		expect(isOpeningStudentNotified("", new Set(["in_app"]))).toBe(true);
		expect(isOpeningStudentNotified("   ", new Set(["in_app"]))).toBe(true);
		expect(isOpeningStudentNotified("", new Set(["email,in_app"]))).toBe(true);
	});
});

describe("dailyDeadlineReminderEvent & digest renderers", () => {
	test("builds email-only digest event with homework and self-study sections in body, htmlBody, and textBody", () => {
		const event = dailyDeadlineReminderEvent({
			studentId: "stu-1",
			studentName: "Minh Anh",
			dateISO: "2026-05-15",
			studentOrigin: "https://lms.msmy.io.vn/student/",
			homework: [
				{
					assignmentId: "hw-1",
					title: "Writing Task 2",
					className: "IELTS 6.5",
					dueTimeLabel: "23:59",
				},
			],
			selfStudy: [
				{
					assignmentId: "ss-1",
					title: "Reading Day 3",
					className: "IELTS 6.5",
					dueTimeLabel: "17:00",
					opensAtLabel: "08:00",
				},
			],
		});

		expect(event.studentId).toBe("stu-1");
		expect(event.eventType).toBe("daily_deadline_reminder");
		expect(eventGroupOf(event.eventType)).toBe("assignment");
		expect(event.idempotencyKey).toBe(
			"daily_deadline_reminder:stu-1:2026-05-15",
		);
		expect(event.title).toBe("Nhắc bài tập đến hạn hôm nay (15/05/2026)");
		expect(event.linkPath).toBe("/assignments");
		expect(event.refType).toBe("daily_deadline_reminder");
		expect(event.refId).toBe("2026-05-15");
		expect(event.channels).toBe("email");

		expect(event.body).toContain("Chào Minh Anh,");
		expect(event.body).toContain(
			"Bạn có 2 bài tập cần hoàn thành trong hôm nay (15/05/2026):",
		);
		expect(event.body).toContain("Bài tập về nhà (1):");
		expect(event.body).toContain("- Writing Task 2 (IELTS 6.5) — Hạn 23:59");
		expect(event.body).toContain("Bộ đề tự học (1):");
		expect(event.body).toContain(
			"- Reading Day 3 (IELTS 6.5) — Hạn 17:00 (mở lúc 08:00)",
		);
		expect(event.body).not.toContain("<");
		expect(event.body).not.toContain(">");

		expect(event.htmlBody).toContain("Bài tập về nhà (1)");
		expect(event.htmlBody).toContain("Bộ đề tự học (1)");
		expect(event.htmlBody).toContain(
			'href="https://lms.msmy.io.vn/student/learn/quizzes/hw-1"',
		);
		expect(event.htmlBody).toContain(
			'href="https://lms.msmy.io.vn/student/learn/quizzes/ss-1"',
		);
		expect(event.htmlBody).toContain(
			'href="https://lms.msmy.io.vn/student/assignments"',
		);
		expect(event.textBody).toContain(
			"https://lms.msmy.io.vn/student/learn/quizzes/hw-1",
		);
		expect(event.textBody).toContain(
			"https://lms.msmy.io.vn/student/learn/quizzes/ss-1",
		);
		expect(event.textBody).toContain(
			"https://lms.msmy.io.vn/student/assignments",
		);
	});

	test("falls back greeting name to 'bạn' and omits empty sections and blank metadata", () => {
		const hwOnly = dailyDeadlineReminderEvent({
			studentId: "stu-2",
			studentName: "   ",
			dateISO: "2026-05-15",
			homework: [
				{
					assignmentId: "hw-2",
					title: "Grammar Review",
					className: "",
					dueTimeLabel: "Trong ngày",
				},
			],
			selfStudy: [],
		});
		expect(hwOnly.body).toContain("Chào bạn,");
		expect(hwOnly.body).toContain("Bài tập về nhà (1):");
		expect(hwOnly.body).toContain("- Grammar Review — Hạn Trong ngày");
		expect(hwOnly.body).not.toContain("Bộ đề tự học");
		expect(hwOnly.htmlBody).not.toContain("Bộ đề tự học");

		const ssOnly = dailyDeadlineReminderEvent({
			studentId: "stu-3",
			studentName: "Lan",
			dateISO: "2026-05-15",
			homework: [],
			selfStudy: [
				{
					assignmentId: "ss-2",
					title: "Listening Day 1",
					className: "IELTS Foundation",
					dueTimeLabel: "17:00",
					opensAtLabel: null,
				},
			],
		});
		expect(ssOnly.body).not.toContain("Bài tập về nhà");
		expect(ssOnly.htmlBody).not.toContain("Bài tập về nhà");
		expect(ssOnly.body).toContain("Bộ đề tự học (1):");
		expect(ssOnly.body).toContain(
			"- Listening Day 1 (IELTS Foundation) — Hạn 17:00",
		);
		expect(ssOnly.body).not.toContain("mở lúc");
	});

	test("renderDailyDeadlineReminderHtml and Text escape HTML, encode IDs, and reject unsafe origins", () => {
		const xssDigest = {
			dateISO: "2026-05-15",
			studentName: '<img src=x onerror="alert(1)">',
			homework: [
				{
					assignmentId: "a/b?c=1",
					title: '<script>alert("hw")</script>',
					className: 'IELTS "Pro" & <A>',
					dueTimeLabel: "23:59",
				},
			],
			selfStudy: [],
		};
		const html = renderDailyDeadlineReminderHtml(
			xssDigest,
			"https://lms.msmy.io.vn/student/",
		);
		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<img ");
		expect(html).toContain(
			"&lt;script&gt;alert(&quot;hw&quot;)&lt;/script&gt;",
		);
		expect(html).toContain(
			'href="https://lms.msmy.io.vn/student/learn/quizzes/a%2Fb%3Fc%3D1"',
		);

		const unsafeHtml = renderDailyDeadlineReminderHtml(
			xssDigest,
			"javascript:alert(1)",
		);
		expect(unsafeHtml).not.toContain("javascript:");
		expect(unsafeHtml).not.toContain("<a ");

		const unsafeText = renderDailyDeadlineReminderText(
			xssDigest,
			"javascript:alert(1)",
		);
		expect(unsafeText).not.toContain("javascript:");
	});
});
