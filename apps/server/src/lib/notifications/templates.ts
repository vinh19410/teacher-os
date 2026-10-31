import {
	NOTIFICATION_EVENT_GROUP_BY_TYPE,
	type NotificationEventGroup,
	type NotificationEventType,
} from "@teacher-os/api/contracts";

/** 1 sự kiện phát ra từ route nghiệp vụ, chưa resolve người nhận (D4). */
export interface NotificationEvent {
	studentId: string;
	eventType: NotificationEventType;
	/** Khóa chống trùng theo D3, vd "grade_returned:<attemptId>". */
	idempotencyKey: string;
	title: string;
	body: string;
	/** Đường dẫn trên cổng học viên, vd "/assignments/a-1". */
	linkPath: string;
	refType: string;
	refId: string;
}

export function eventGroupOf(
	eventType: NotificationEventType,
): NotificationEventGroup {
	return NOTIFICATION_EVENT_GROUP_BY_TYPE[eventType];
}

export function formatVnd(amount: number): string {
	return `${amount.toLocaleString("vi-VN")}đ`;
}

/**
 * Sự kiện "nhắc hạn hóa đơn học phí" cho TOS-18 (#452) — builder thuần,
 * khóa chống trùng gồm ngày VN nên mỗi ngày nhắc 1 lần (D3).
 */
export function tuitionReminderEvent(
	invoice: { id: string; studentId: string; amount: number; due: string },
	vnDate: string,
): NotificationEvent {
	return {
		studentId: invoice.studentId,
		eventType: "tuition_reminder",
		idempotencyKey: `tuition_reminder:${invoice.id}:${vnDate}`,
		title: "Nhắc học phí",
		body: `Hóa đơn học phí ${formatVnd(invoice.amount)} đến hạn ngày ${invoice.due || vnDate}. Vui lòng thanh toán đúng hạn.`,
		linkPath: "/tuition",
		refType: "invoice",
		refId: invoice.id,
	};
}

/**
 * Sự kiện "học viên được mời vào lớp" (#454 phase 3) — builder thuần,
 * khóa chống trùng theo enrollment (mời lại sau khi hủy = enrollment mới).
 */
export function classEnrolledEvent(input: {
	enrollmentId: string;
	studentId: string;
	className: string;
}): NotificationEvent {
	return {
		studentId: input.studentId,
		eventType: "class_enrolled",
		idempotencyKey: `class_enrolled:${input.enrollmentId}`,
		title: "Được mời vào lớp",
		body: `Bạn được mời tham gia lớp ${input.className}. Vào cổng học viên để kích hoạt và xem lịch học.`,
		linkPath: "/classes",
		refType: "enrollment",
		refId: input.enrollmentId,
	};
}

/**
 * Sự kiện "giao bài cho học viên" (#454 phase 3) — 1 sự kiện mỗi học viên
 * đích (danh sách classAssignmentTarget, hoặc cả lớp đang active).
 */
export function assignmentPublishedEvents(input: {
	classAssignmentId: string;
	title: string;
	due: string;
	studentIds: string[];
}): NotificationEvent[] {
	return input.studentIds.map((studentId) => ({
		studentId,
		eventType: "assignment_published",
		idempotencyKey: `assignment_published:${input.classAssignmentId}:${studentId}`,
		title: "Bài tập mới",
		body: `Có bài tập mới: ${input.title}, hạn nộp ${input.due}.`,
		// Cổng học viên xem bài qua /learn/quizzes/$assignmentId (CR I1 —
		// không có route /assignments/$id trên portal).
		linkPath: `/learn/quizzes/${input.classAssignmentId}`,
		refType: "class_assignment",
		refId: input.classAssignmentId,
	}));
}

/**
 * Sự kiện "bài đã được chấm" (#454 phase 3) — khóa canonical theo attempt:
 * cả route /api/grading/:attemptId/grade lẫn route fan-out đều phát theo
 * attempt nên enqueue không nhân đôi.
 */
export function gradeReturnedEvent(input: {
	attemptId: string;
	studentId: string;
	title: string;
	linkPath: string;
}): NotificationEvent {
	return {
		studentId: input.studentId,
		eventType: "grade_returned",
		idempotencyKey: `grade_returned:${input.attemptId}`,
		title: "Bài đã được chấm",
		body: `Bài "${input.title}" của bạn đã có điểm và nhận xét của giáo viên.`,
		linkPath: input.linkPath,
		refType: "quiz_attempt",
		refId: input.attemptId,
	};
}

/** Sự kiện "hóa đơn học phí được tạo" (#454 phase 3). */
export function invoiceIssuedEvent(invoice: {
	id: string;
	studentId: string;
	amount: number;
	due: string;
}): NotificationEvent {
	return {
		studentId: invoice.studentId,
		eventType: "invoice_issued",
		idempotencyKey: `invoice_issued:${invoice.id}`,
		title: "Hóa đơn học phí",
		body: `Hóa đơn học phí ${formatVnd(invoice.amount)} đã được tạo, hạn thanh toán ${invoice.due}.`,
		linkPath: "/tuition",
		refType: "invoice",
		refId: invoice.id,
	};
}

/**
 * Sự kiện "đổi lịch/hủy buổi học" (#454 phase 3) — 1 sự kiện mỗi học viên có
 * dòng lesson bị đổi. `date` là ngày bị tác động, `editedAtMs` là thời điểm
 * route ghi thay đổi (mỗi lần đổi thật sự là 1 khóa mới).
 */
export function scheduleChangedEvents(input: {
	classId: string;
	date: string;
	editedAtMs: number;
	studentIds: string[];
}): NotificationEvent[] {
	return input.studentIds.map((studentId) => ({
		studentId,
		eventType: "schedule_changed",
		idempotencyKey: `schedule_changed:${input.classId}:${input.date}:${input.editedAtMs}:${studentId}`,
		title: "Lịch học thay đổi",
		body: `Lịch học ngày ${input.date} vừa được giáo viên thay đổi hoặc hủy. Vui lòng kiểm tra lại lịch học.`,
		// Cổng học viên chưa có trang lịch — hạ cánh về danh sách lớp (CR I1).
		linkPath: "/classes",
		refType: "lesson",
		refId: `${input.classId}:${input.date}`,
	}));
}

/**
 * Sự kiện "tạo lịch nghỉ chung" cho #445 (TOS-11) — builder thuần, route
 * phát sự kiện sẽ nối sau khi #445 merge (D9). Trả 1 sự kiện mỗi học viên.
 */
export function holidayCreatedEvents(input: {
	holidayId: string;
	title: string;
	date: string;
	studentIds: string[];
}): NotificationEvent[] {
	return input.studentIds.map((studentId) => ({
		studentId,
		eventType: "holiday_created",
		idempotencyKey: `holiday_created:${input.holidayId}:${studentId}`,
		title: "Thông báo lịch nghỉ",
		body: `Trung tâm nghỉ ngày ${input.date}: ${input.title}.`,
		// Cổng học viên chưa có trang lịch — hạ cánh về danh sách lớp (CR I1).
		linkPath: "/classes",
		refType: "holiday",
		refId: input.holidayId,
	}));
}

/**
 * Sự kiện "giao bài tự học hằng ngày" (#526) — mỗi học viên 1 thông báo mỗi
 * ngày (`idempotencyKey = self_study_released:<dayId>:<studentId>`).
 */
export function selfStudyReleasedEvents(input: {
	dayId: string;
	className: string;
	date: string;
	dueTime: string;
	itemCount: number;
	firstAssignmentId: string;
	studentIds: string[];
}): NotificationEvent[] {
	const linkPath = input.firstAssignmentId
		? `/learn/quizzes/${input.firstAssignmentId}`
		: "/assignments";
	return input.studentIds.map((studentId) => ({
		studentId,
		eventType: "self_study_released",
		idempotencyKey: `self_study_released:${input.dayId}:${studentId}`,
		title: "Bài tự học hôm nay",
		body: `Lớp ${input.className} có ${input.itemCount} bài tự học ngày ${input.date}, hạn nộp ${input.dueTime}.`,
		linkPath,
		refType: "self_study_plan_day",
		refId: input.dayId,
	}));
}
