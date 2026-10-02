import type { StudentClassLesson } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import { orderStudentLessons } from "./student-class";

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
