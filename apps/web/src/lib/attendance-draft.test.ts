import { describe, expect, test } from "vitest";
import {
	attendanceDraftReducer,
	createAttendanceDraft,
	missingAttendanceLessonIds,
	setDraftAttendance,
	setDraftNote,
	toSaveEntries,
} from "./attendance-draft";

const SERVER_STUDENTS = [
	{
		lessonId: "l-1",
		studentId: "s-1",
		studentName: "An Nguyễn",
		attendance: "present" as const,
		note: "Đúng giờ",
	},
	{
		lessonId: "l-2",
		studentId: "s-2",
		studentName: "Bình Trần",
		attendance: null,
		note: "",
	},
	{
		lessonId: "l-3",
		studentId: "s-3",
		studentName: "Cường Lê",
		attendance: null,
		note: "Ghi chú cũ",
	},
];

describe("attendance-draft", () => {
	test("khởi tạo từ server và missing() trả đúng các lessonId có attendance = null theo thứ tự", () => {
		const draft = createAttendanceDraft(SERVER_STUDENTS);
		expect(missingAttendanceLessonIds(draft)).toEqual(["l-2", "l-3"]);
		expect(draft.entries["l-1"]).toEqual({
			attendance: "present",
			note: "Đúng giờ",
		});
	});

	test("set chọn trạng thái và setNote cập nhật ghi chú", () => {
		let draft = createAttendanceDraft(SERVER_STUDENTS);
		draft = attendanceDraftReducer(draft, {
			type: "set",
			lessonId: "l-2",
			attendance: "late",
		});
		draft = attendanceDraftReducer(draft, {
			type: "setNote",
			lessonId: "l-2",
			note: "  Đi muộn 10 phút  ",
		});

		expect(missingAttendanceLessonIds(draft)).toEqual(["l-3"]);
		expect(draft.entries["l-2"]).toEqual({
			attendance: "late",
			note: "  Đi muộn 10 phút  ",
		});

		draft = setDraftAttendance(draft, "l-3", "excused");
		draft = setDraftNote(draft, "l-3", "  Xin nghỉ ốm ");
		expect(missingAttendanceLessonIds(draft)).toEqual([]);

		expect(toSaveEntries(draft)).toEqual([
			{ lessonId: "l-1", attendance: "present", note: "Đúng giờ" },
			{ lessonId: "l-2", attendance: "late", note: "Đi muộn 10 phút" },
			{ lessonId: "l-3", attendance: "excused", note: "Xin nghỉ ốm" },
		]);
	});

	test("reset lấy lại nguyên giá trị từ server", () => {
		let draft = createAttendanceDraft(SERVER_STUDENTS);
		draft = setDraftAttendance(draft, "l-1", "unexcused");
		draft = setDraftNote(draft, "l-1", "Đã sửa nháp");

		draft = attendanceDraftReducer(draft, {
			type: "reset",
			students: SERVER_STUDENTS,
		});
		expect(draft.entries["l-1"]).toEqual({
			attendance: "present",
			note: "Đúng giờ",
		});
		expect(missingAttendanceLessonIds(draft)).toEqual(["l-2", "l-3"]);
	});

	test("bỏ qua dòng legacy có lessonId = null", () => {
		const draft = createAttendanceDraft([
			{
				lessonId: null,
				studentId: "s-leg",
				studentName: "HV Legacy",
				attendance: null,
				note: "",
			},
		]);
		expect(draft.order).toEqual([]);
		expect(missingAttendanceLessonIds(draft)).toEqual([]);
	});
});
