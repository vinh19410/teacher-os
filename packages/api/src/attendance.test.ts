/**
 * TOS-7 (issue #440) phase 1 — trạng thái điểm danh chi tiết trên dòng
 * `lesson`: bảng ánh xạ D2 sang `lesson.status`, schema lưu cả ca, và
 * schema response danh sách ca theo ngày. Quy ước lỗi malformed nằm ở
 * 400 `invalid-date` / `invalid body` (kernel), riêng nghiệp vụ roster là 422.
 */
import { describe, expect, test } from "vitest";
import type { AttendanceStatus } from "./contracts";
import {
	ATTENDANCE_STATUSES,
	dailyAttendanceResponseSchema,
	dashboardRemindersResponseSchema,
	lessonStatusForAttendance,
	overdueAttendanceResponseSchema,
	sessionAttendanceSaveSchema,
	UNEXCUSED_CONSUMES_SESSION,
} from "./contracts";

describe("lessonStatusForAttendance — ánh xạ D2", () => {
	test("present và late trừ buổi (status completed)", () => {
		expect(lessonStatusForAttendance("present")).toBe("completed");
		expect(lessonStatusForAttendance("late")).toBe("completed");
	});

	test("excused không trừ buổi (status absent)", () => {
		expect(lessonStatusForAttendance("excused")).toBe("absent");
	});

	test("unexcused trừ buổi khi UNEXCUSED_CONSUMES_SESSION = true", () => {
		expect(UNEXCUSED_CONSUMES_SESSION).toBe(true);
		expect(lessonStatusForAttendance("unexcused")).toBe("completed");
	});

	test("bảng ánh xạ đầy đủ 4 trạng thái", () => {
		expect(ATTENDANCE_STATUSES).toEqual([
			"present",
			"late",
			"excused",
			"unexcused",
		]);
	});
});

function entry(
	overrides: Partial<{
		lessonId: string;
		attendance: AttendanceStatus;
		note: string;
	}> = {},
) {
	return {
		lessonId: "l-1",
		attendance: "present" as AttendanceStatus,
		note: "",
		...overrides,
	};
}

describe("sessionAttendanceSaveSchema", () => {
	test("nhận payload hợp lệ tối thiểu", () => {
		const parsed = sessionAttendanceSaveSchema.parse({
			entries: [entry()],
		});
		expect(parsed.entries).toHaveLength(1);
	});

	test("từ chối entries rỗng", () => {
		expect(sessionAttendanceSaveSchema.safeParse({ entries: [] }).success).toBe(
			false,
		);
	});

	test("từ chối note 256 ký tự", () => {
		const parsed = sessionAttendanceSaveSchema.safeParse({
			entries: [entry({ note: "a".repeat(256) })],
		});
		expect(parsed.success).toBe(false);
	});

	test("note 255 ký tự hợp lệ sau trim", () => {
		const parsed = sessionAttendanceSaveSchema.parse({
			entries: [entry({ note: `  ${"a".repeat(255)}  ` })],
		});
		expect(parsed.entries[0]?.note).toBe("a".repeat(255));
	});

	test("note toàn khoảng trắng được trim thành chuỗi rỗng", () => {
		const parsed = sessionAttendanceSaveSchema.parse({
			entries: [entry({ note: "   " })],
		});
		expect(parsed.entries[0]?.note).toBe("");
	});

	test("từ chối attendance lạ", () => {
		const parsed = sessionAttendanceSaveSchema.safeParse({
			entries: [{ ...entry(), attendance: "sick" }],
		});
		expect(parsed.success).toBe(false);
	});

	test("từ chối lessonId trùng", () => {
		const parsed = sessionAttendanceSaveSchema.safeParse({
			entries: [entry(), entry({ attendance: "late" })],
		});
		expect(parsed.success).toBe(false);
	});

	test("từ chối field lạ (strict)", () => {
		const parsed = sessionAttendanceSaveSchema.safeParse({
			entries: [entry()],
			extra: true,
		});
		expect(parsed.success).toBe(false);
	});
});

describe("dailyAttendanceResponseSchema", () => {
	test("parse payload dated đầy đủ", () => {
		const parsed = dailyAttendanceResponseSchema.parse({
			date: "2026-10-26",
			sessions: [
				{
					classId: "c-1",
					className: "IELTS 5.0",
					time: "17:00",
					dur: 120,
					mode: "dated",
					recorded: false,
					students: [
						{
							lessonId: "l-1",
							studentId: "s-1",
							studentName: "Nguyễn Văn A",
							attendance: null,
							note: "",
						},
						{
							lessonId: "l-2",
							studentId: "s-2",
							studentName: "Trần Thị B",
							attendance: "late",
							note: "Đi muộn 10 phút",
						},
					],
				},
			],
			counts: { all: 1, pending: 1, completed: 0 },
		});
		expect(parsed.sessions[0]?.mode).toBe("dated");
		expect(parsed.sessions[0]?.students[0]?.attendance).toBeNull();
	});

	test("parse payload legacy không có lessonId", () => {
		const parsed = dailyAttendanceResponseSchema.parse({
			date: "2026-10-26",
			sessions: [
				{
					classId: "c-2",
					className: "Lớp cũ",
					time: "08:00",
					dur: 90,
					mode: "legacy",
					recorded: true,
					students: [
						{
							lessonId: null,
							studentId: "s-3",
							studentName: "Lê Văn C",
							attendance: null,
							note: "",
						},
					],
				},
			],
			counts: { all: 1, pending: 0, completed: 1 },
		});
		expect(parsed.sessions[0]?.students[0]?.lessonId).toBeNull();
	});

	test("từ chối date sai định dạng và mode lạ", () => {
		expect(
			dailyAttendanceResponseSchema.safeParse({
				date: "26-10-2026",
				sessions: [],
				counts: { all: 0, pending: 0, completed: 0 },
			}).success,
		).toBe(false);
		expect(
			dailyAttendanceResponseSchema.safeParse({
				date: "2026-10-26",
				sessions: [
					{
						classId: "c-1",
						className: "X",
						time: "17:00",
						dur: 60,
						mode: "hybrid",
						recorded: false,
						students: [],
					},
				],
				counts: { all: 1, pending: 1, completed: 0 },
			}).success,
		).toBe(false);
	});
});

describe("dashboardRemindersResponseSchema — today & overdue fields", () => {
	test("chấp nhận payload v2 có today, overdue và items[].date", () => {
		const parsed = dashboardRemindersResponseSchema.parse({
			date: "2026-10-26",
			attendance: {
				pending: 6,
				today: 1,
				overdue: 5,
				items: [
					{
						classId: "c-1",
						className: "IELTS 5.5",
						time: "18:00",
						dur: 90,
						date: "2026-10-26",
					},
					{
						classId: "c-1",
						className: "IELTS 5.5",
						time: "18:00",
						dur: 90,
						date: "2026-10-24",
					},
					{
						classId: "c-legacy",
						className: "Lớp cũ",
						time: "07:00",
						dur: 60,
					},
				],
			},
			overdueGrading: { count: 0, writing: 0, speaking: 0 },
		});
		expect(parsed.attendance.today).toBe(1);
		expect(parsed.attendance.overdue).toBe(5);
		expect(parsed.attendance.items[1]?.date).toBe("2026-10-24");
		expect(parsed.attendance.items[2]?.date).toBeUndefined();
	});

	test("tương thích ngược payload v1 không có today, overdue và items[].date", () => {
		const parsed = dashboardRemindersResponseSchema.parse({
			date: "2026-10-26",
			attendance: {
				pending: 2,
				items: [{ classId: "c-1", className: "Lớp A", time: "18:00", dur: 90 }],
			},
			overdueGrading: { count: 1, writing: 1, speaking: 0 },
		});
		expect(parsed.attendance.pending).toBe(2);
		expect(parsed.attendance.today).toBeUndefined();
		expect(parsed.attendance.overdue).toBeUndefined();
	});

	test("từ chối items[].date sai định dạng, overdue âm, hoặc field lạ (strict)", () => {
		expect(
			dashboardRemindersResponseSchema.safeParse({
				date: "2026-10-26",
				attendance: {
					pending: 1,
					today: 0,
					overdue: 1,
					items: [
						{
							classId: "c-1",
							className: "Lớp A",
							time: "18:00",
							dur: 90,
							date: "20-10-2026",
						},
					],
				},
				overdueGrading: { count: 0, writing: 0, speaking: 0 },
			}).success,
		).toBe(false);

		expect(
			dashboardRemindersResponseSchema.safeParse({
				date: "2026-10-26",
				attendance: {
					pending: 1,
					overdue: -1,
					items: [],
				},
				overdueGrading: { count: 0, writing: 0, speaking: 0 },
			}).success,
		).toBe(false);

		expect(
			dashboardRemindersResponseSchema.safeParse({
				date: "2026-10-26",
				attendance: {
					pending: 0,
					extra: 1,
					items: [],
				},
				overdueGrading: { count: 0, writing: 0, speaking: 0 },
			}).success,
		).toBe(false);
	});
});

describe("overdueAttendanceResponseSchema", () => {
	const validSession = {
		date: "2026-10-24",
		classId: "c-1",
		className: "IELTS Foundation 5.5",
		time: "19:00",
		dur: 90,
		mode: "dated" as const,
		recorded: false as const,
		students: [
			{
				lessonId: "l-1",
				studentId: "s-1",
				studentName: "Nguyễn Văn A",
				attendance: null,
				note: "",
			},
		],
	};

	test("parse payload hợp lệ với mode dated, recorded false và students >= 1", () => {
		const parsed = overdueAttendanceResponseSchema.parse({
			today: "2026-10-26",
			totalCount: 2,
			hasMore: false,
			sessions: [validSession],
		});
		expect(parsed.today).toBe("2026-10-26");
		expect(parsed.totalCount).toBe(2);
		expect(parsed.hasMore).toBe(false);
		expect(parsed.sessions[0]?.date).toBe("2026-10-24");
	});

	test("từ chối students rỗng, mode legacy, recorded true, lessonId null, date sai định dạng và field lạ", () => {
		expect(
			overdueAttendanceResponseSchema.safeParse({
				today: "2026-10-26",
				totalCount: 1,
				hasMore: false,
				sessions: [{ ...validSession, students: [] }],
			}).success,
		).toBe(false);

		expect(
			overdueAttendanceResponseSchema.safeParse({
				today: "2026-10-26",
				totalCount: 1,
				hasMore: false,
				sessions: [{ ...validSession, mode: "legacy" }],
			}).success,
		).toBe(false);

		expect(
			overdueAttendanceResponseSchema.safeParse({
				today: "2026-10-26",
				totalCount: 1,
				hasMore: false,
				sessions: [{ ...validSession, recorded: true }],
			}).success,
		).toBe(false);

		expect(
			overdueAttendanceResponseSchema.safeParse({
				today: "2026-10-26",
				totalCount: 1,
				hasMore: false,
				sessions: [
					{
						...validSession,
						students: [{ ...validSession.students[0], lessonId: null }],
					},
				],
			}).success,
		).toBe(false);

		expect(
			overdueAttendanceResponseSchema.safeParse({
				today: "2026-10-26",
				totalCount: 1,
				hasMore: false,
				sessions: [{ ...validSession, date: "24-10-2026" }],
			}).success,
		).toBe(false);

		expect(
			overdueAttendanceResponseSchema.safeParse({
				today: "2026-10-26",
				totalCount: 1,
				hasMore: false,
				extra: true,
				sessions: [validSession],
			}).success,
		).toBe(false);
	});
});
