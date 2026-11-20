import type { StudentClassLesson } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import {
	isValidZoomJoinUrl,
	orderStudentLessons,
	toStudentClassLessonWithMeeting,
} from "./student-class";

function lesson(
	id: string,
	day: number,
	status: string,
	date: string | null = null,
): StudentClassLesson {
	return { id, date, day, time: "18:30", dur: 90, status, topic: "" };
}

const ids = (lessons: StudentClassLesson[]) => lessons.map((l) => l.id);

describe("orderStudentLessons", () => {
	test("returns an empty list unchanged", () => {
		expect(orderStudentLessons([])).toEqual([]);
	});

	test("keeps the query order when every lesson is dated", () => {
		const dated = [
			lesson("b", 3, "upcoming", "2099-01-07"),
			lesson("a", 1, "completed", "2099-01-05"),
		];
		expect(ids(orderStudentLessons(dated))).toEqual(["b", "a"]);
	});

	test("interleaves uneven legacy slots without dropping lessons", () => {
		const legacy = [
			lesson("a1", 1, "upcoming"),
			lesson("a2", 1, "upcoming"),
			lesson("a3", 1, "completed"),
			lesson("b1", 3, "upcoming"),
		];
		expect(ids(orderStudentLessons(legacy))).toEqual(["a3", "b1", "a1", "a2"]);
	});

	test("one undated row puts the whole list on the legacy path; unknown statuses rank as upcoming", () => {
		const mixed = [
			lesson("a1", 1, "rescheduled"),
			lesson("a2", 1, "cancelled", "2099-01-05"),
			lesson("a3", 1, "absent"),
		];
		expect(ids(orderStudentLessons(mixed))).toEqual(["a3", "a2", "a1"]);
	});
});

describe("isValidZoomJoinUrl", () => {
	test("chấp nhận URL https:// hợp lệ và loại bỏ scheme/format sai", () => {
		expect(isValidZoomJoinUrl("https://zoom.us/j/123456")).toBe(true);
		expect(isValidZoomJoinUrl("  HTTPS://zoom.us/j/123  ")).toBe(true);
		expect(isValidZoomJoinUrl("")).toBe(false);
		expect(isValidZoomJoinUrl("   ")).toBe(false);
		expect(isValidZoomJoinUrl("https://")).toBe(false);
		expect(isValidZoomJoinUrl("http://zoom.us/j/123")).toBe(false);
		expect(isValidZoomJoinUrl("javascript:alert(1)")).toBe(false);
		expect(isValidZoomJoinUrl("https://zoom.us/j/123 extra")).toBe(false);
	});
});

describe("toStudentClassLessonWithMeeting", () => {
	const baseRow = {
		id: "les-1",
		date: "2026-11-25",
		day: 3,
		time: "19:00",
		dur: 90,
		status: "upcoming",
		topic: "Speaking",
	};

	test("gắn hasZoom: true và không bao giờ trả raw joinUrl khi có link hợp lệ", () => {
		const res = toStudentClassLessonWithMeeting(
			{ ...baseRow, zoom: "https://zoom.us/j/111" },
			{
				classId: "cls-1",
				date: "2026-11-25",
				joinUrl: "https://zoom.us/j/222",
				recordingUrl: "https://zoom.us/rec/share/1",
				recordingPassword: "pw",
				recordingStatus: "ready",
			},
		);
		expect(res.hasZoom).toBe(true);
		expect("joinUrl" in res).toBe(false);
		expect(res.recordingUrl).toBe("https://zoom.us/rec/share/1");
		expect(res.recordingPassword).toBe("pw");
	});

	test("buổi legacy không có date hoặc buổi cancelled/holiday không gắn hasZoom", () => {
		const undated = toStudentClassLessonWithMeeting({
			...baseRow,
			date: null,
			zoom: "https://zoom.us/j/111",
		});
		expect(undated.hasZoom).toBeUndefined();
		expect("joinUrl" in undated).toBe(false);

		const cancelled = toStudentClassLessonWithMeeting({
			...baseRow,
			status: "cancelled",
			zoom: "https://zoom.us/j/111",
		});
		expect(cancelled.hasZoom).toBeUndefined();

		const holiday = toStudentClassLessonWithMeeting({
			...baseRow,
			status: "holiday",
			zoom: "https://zoom.us/j/111",
		});
		expect(holiday.hasZoom).toBeUndefined();
	});
});
