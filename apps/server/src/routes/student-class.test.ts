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
		expect(res.recordingSource).toBe("external");
		expect(res.hasRecordingVideo).toBeUndefined();
	});

	test("recording nguồn R2: bật hasRecordingVideo + recordingSource r2, ẩn recordingUrl/password và không lộ storageKey", () => {
		const now = new Date("2026-11-26T10:00:00.000Z");
		const expiresAt = new Date("2027-02-24T10:00:00.000Z");
		const res = toStudentClassLessonWithMeeting(
			baseRow,
			{
				classId: "cls-1",
				date: "2026-11-25",
				joinUrl: "https://zoom.us/j/222",
				recordingUrl: "https://zoom.us/rec/share/legacy-ignored",
				recordingPassword: "secret",
				recordingStatus: "ready",
				recordingStorageKey: "org-1/cls-1/2026-11-25/abc.mp4",
				recordingExpiresAt: expiresAt,
			},
			now,
		);
		expect(res.hasRecordingVideo).toBe(true);
		expect(res.recordingSource).toBe("r2");
		expect(res.recordingStatus).toBe("ready");
		expect(res.recordingExpiresAt).toBe(expiresAt.toISOString());
		expect(res.recordingUrl).toBeUndefined();
		expect(res.recordingPassword).toBeUndefined();
		expect("recordingStorageKey" in res).toBe(false);
		expect("recordingError" in res).toBe(false);
		expect("recordingZoomTrashStatus" in res).toBe(false);
	});

	test("recording R2 quá hạn 90 ngày (chưa kịp sweep hoặc đã sweep) map sang expired và ẩn video", () => {
		const now = new Date("2027-03-01T10:00:00.000Z");
		const expiresAt = new Date("2027-02-24T10:00:00.000Z");
		const unswept = toStudentClassLessonWithMeeting(
			baseRow,
			{
				classId: "cls-1",
				date: "2026-11-25",
				joinUrl: "https://zoom.us/j/222",
				recordingUrl: "",
				recordingPassword: null,
				recordingStatus: "ready",
				recordingStorageKey: "org-1/cls-1/2026-11-25/abc.mp4",
				recordingExpiresAt: expiresAt,
			},
			now,
		);
		expect(unswept.recordingStatus).toBe("expired");
		expect(unswept.recordingExpiresAt).toBe(expiresAt.toISOString());
		expect(unswept.hasRecordingVideo).toBeUndefined();
		expect(unswept.recordingSource).toBeUndefined();
		expect(unswept.recordingUrl).toBeUndefined();

		const swept = toStudentClassLessonWithMeeting(
			baseRow,
			{
				classId: "cls-1",
				date: "2026-11-25",
				joinUrl: "https://zoom.us/j/222",
				recordingUrl: "",
				recordingPassword: null,
				recordingStatus: "expired",
				recordingStorageKey: null,
				recordingExpiresAt: expiresAt,
			},
			now,
		);
		expect(swept.recordingStatus).toBe("expired");
		expect(swept.recordingExpiresAt).toBe(expiresAt.toISOString());
		expect(swept.hasRecordingVideo).toBeUndefined();
		expect(swept.recordingSource).toBeUndefined();
	});

	test("buổi cancelled hoặc holiday ẩn toàn bộ metadata recording R2", () => {
		const now = new Date("2026-11-26T10:00:00.000Z");
		const expiresAt = new Date("2027-02-24T10:00:00.000Z");
		const res = toStudentClassLessonWithMeeting(
			{ ...baseRow, status: "cancelled" },
			{
				classId: "cls-1",
				date: "2026-11-25",
				joinUrl: "https://zoom.us/j/222",
				recordingUrl: "",
				recordingPassword: null,
				recordingStatus: "ready",
				recordingStorageKey: "org-1/cls-1/2026-11-25/abc.mp4",
				recordingExpiresAt: expiresAt,
			},
			now,
		);
		expect(res.hasRecordingVideo).toBeUndefined();
		expect(res.recordingSource).toBeUndefined();
		expect(res.recordingStatus).toBeUndefined();
		expect(res.recordingExpiresAt).toBeUndefined();
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
