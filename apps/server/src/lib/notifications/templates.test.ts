import { describe, expect, test } from "vitest";
import {
	assignmentPublishedEvents,
	classEnrolledEvent,
	eventGroupOf,
	gradeReturnedEvent,
	holidayCreatedEvents,
	invoiceIssuedEvent,
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
});
