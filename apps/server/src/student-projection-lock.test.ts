/**
 * TOS-7 #440 — khoá biên giới dữ liệu: `lesson.attendance` /
 * `lesson.attendance_note` là dữ liệu TEACHER-ONLY (ghi chú học vụ có thể
 * chứa nhận xét nhạy cảm). Student portal không được chiếu 2 cột này.
 *
 * Test đọc nguồn `student.ts` và cấm identifier xuất hiện — nếu một wave
 * sau thêm "học viên xem điểm danh của mình" và copy projection hiện có,
 * test này fail và buộc một quyết định tường minh (mở khoá có chủ ý kèm
 * review, thay vì lộ dữ liệu mặc định).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const STUDENT_ROUTE = fileURLToPath(
	new URL("./routes/student.ts", import.meta.url).href,
);

describe("student portal projection lock (TOS-7 #440)", () => {
	test("student.ts không chiếu attendance/attendanceNote từ bảng lesson", () => {
		const source = readFileSync(STUDENT_ROUTE, "utf8");
		expect(source).not.toMatch(/\battendance\b/);
		expect(source).not.toMatch(/\battendanceNote\b/);
		expect(source).not.toMatch(/attendance_note/);
	});
});
