import { describe, expect, test } from "vitest";
import {
	assignmentPublishedEvents,
	classEnrolledEvent,
	classOpeningConfirmedEvents,
	eventGroupOf,
	gradeReturnedEvent,
	holidayCreatedEvents,
	invoiceIssuedEvent,
	placementSubmittedEvent,
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

	test("classOpeningConfirmedEvents — sinh email HTML cá nhân hóa, khóa theo (classId, version, studentId)", () => {
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
			level: "Band 6.5",
			version: 1,
			isUpdate: false,
			teacherNote: "Mang theo <b>vở ghi</b>\nVào phòng sớm 10 phút",
			orgName: "Trung tâm Anh ngữ Minh Anh",
			studentOrigin: "https://student.teacheros.example///",
			students: [
				{ id: "s-1", name: "Nguyễn Văn An" },
				{ id: "s-2", name: "Trần Thu Hà" },
			],
		});

		expect(events).toHaveLength(2);
		expect(events.map((e) => e.idempotencyKey)).toEqual([
			"class_opening_confirmed:cls-1:v1:s-1",
			"class_opening_confirmed:cls-1:v1:s-2",
		]);

		const first = events[0];
		const second = events[1];
		if (!first || !second) throw new Error("expected 2 events");

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
		expect(first.htmlBody).toContain("24 buổi");
		expect(first.htmlBody).toContain("Band 6.5");
		expect(first.htmlBody).toContain("Trung tâm Anh ngữ Minh Anh");
		expect(first.htmlBody).toContain(
			"Mang theo &lt;b&gt;vở ghi&lt;/b&gt;<br>Vào phòng sớm 10 phút",
		);
		expect(first.htmlBody).not.toContain("<b>vở ghi</b>");
		expect(first.htmlBody).toContain(
			'href="https://student.teacheros.example/classes"',
		);
		expect(second.htmlBody).toContain("Chào Trần Thu Hà,");
	});

	test("classOpeningConfirmedEvents — chế độ cập nhật dùng tiêu đề cập nhật và fallback portalUrl an toàn", () => {
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
			students: [{ id: "s-3", name: "Lê Minh" }],
		});

		expect(updateEvents).toHaveLength(1);
		const ev = updateEvents[0];
		if (!ev) throw new Error("expected 1 event");
		expect(ev.idempotencyKey).toBe("class_opening_confirmed:cls-2:v2:s-3");
		expect(ev.title).toContain("Cập nhật lịch khai giảng lớp Giao tiếp cơ bản");
		expect(ev.htmlBody).toContain("Cập nhật lịch khai giảng");
		expect(ev.htmlBody).toContain('href="/classes"');

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
			students: [{ id: "s-3", name: "Lê Minh" }],
		});
		expect(unsafeOriginEvents[0]?.htmlBody).not.toContain("javascript:");
	});
});
