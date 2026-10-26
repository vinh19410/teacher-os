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
	lessonStatusForAttendance,
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
