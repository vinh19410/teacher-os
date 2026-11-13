import { describe, expect, test } from "vitest";
import type { ClassGroup } from "@/lib/mock-data";
import { findScheduleConflicts } from "./schedule-conflicts";

function cls(partial: Partial<ClassGroup>): ClassGroup {
	return {
		id: "c-test",
		name: "[TEST] Foundation",
		level: "Band 5.5",
		type: "ielts",
		skills: ["Writing"],
		mode: "Online",
		syllabusId: "",
		studentIds: [],
		invitedStudentIds: [],
		schedule: '{"days":[0,2],"start":"19:00","end":"20:30"}',
		sessionsDone: 0,
		sessionsTotal: 12,
		status: "active",
		startDate: "2026-09-01",
		tuitionFee: null,
		notes: "",
		...partial,
	};
}
/**
 * Draft T2 (0 = Monday-first) 19:00–20:30 bắt đầu Tue 2026-10-06, 12 buổi.
 * Thứ 2 đầu tiên ≥ 10-06 là 10-12 → 12 buổi chạy tới Mon 2026-12-28.
 */
const draft = {
	days: [0],
	start: "19:00",
	end: "20:30",
	startDate: "2026-10-06",
	sessionsTotal: 12,
};

/**
 * Draft T3 (1) từ Tue 2026-10-06 × 12 → chạy tới Tue 2026-12-22 — dùng cho
 * các test equality edge của run window.
 */
const tueDraft = { ...draft, days: [1] };

describe("findScheduleConflicts — draft guards", () => {
	const classes = [cls({})];

	test("empty draft days → []", () => {
		expect(findScheduleConflicts({ ...draft, days: [] }, classes)).toEqual([]);
	});

	test('cleared time input ("") → []', () => {
		expect(findScheduleConflicts({ ...draft, start: "" }, classes)).toEqual([]);
		expect(findScheduleConflicts({ ...draft, end: "" }, classes)).toEqual([]);
	});

	test("malformed time → []", () => {
		expect(findScheduleConflicts({ ...draft, start: "9:00" }, classes)).toEqual(
			[],
		);
	});

	test("end <= start → [] (schema rejects anyway)", () => {
		expect(
			findScheduleConflicts(
				{ ...draft, start: "20:30", end: "19:00" },
				classes,
			),
		).toEqual([]);
		expect(
			findScheduleConflicts(
				{ ...draft, start: "19:00", end: "19:00" },
				classes,
			),
		).toEqual([]);
	});
});

describe("findScheduleConflicts — rule boundaries", () => {
	test("shared weekday + overlapping time + overlapping run windows → conflict", () => {
		const hit = findScheduleConflicts(draft, [cls({})]);
		expect(hit).toHaveLength(1);
		expect(hit[0].cls.id).toBe("c-test");
		expect(hit[0].sharedDays).toEqual([0]);
		expect(hit[0].schedule).toEqual({
			days: [0, 2],
			start: "19:00",
			end: "20:30",
		});
	});

	test("partial time overlap (19:30–21:00 vs 19:00–20:30) → conflict", () => {
		expect(
			findScheduleConflicts({ ...draft, start: "19:30", end: "21:00" }, [
				cls({}),
			]),
		).toHaveLength(1);
	});

	test("touching time edge (20:30–22:00 vs 19:00–20:30) → no conflict", () => {
		expect(
			findScheduleConflicts({ ...draft, start: "20:30", end: "22:00" }, [
				cls({}),
			]),
		).toEqual([]);
	});

	test("no shared weekday → no conflict", () => {
		expect(
			findScheduleConflicts(draft, [
				cls({ schedule: '{"days":[1],"start":"19:00","end":"20:30"}' }),
			]),
		).toEqual([]);
	});

	test("finished run (last occurrence 2026-08-17 < draft start) → no conflict", () => {
		// [0,2] × 4 buổi từ Tue 2026-08-04: T2 08-10,08-17; T4 08-05,08-12.
		expect(
			findScheduleConflicts(draft, [
				cls({ startDate: "2026-08-04", sessionsTotal: 4 }),
			]),
		).toEqual([]);
	});

	test("partially overlapping run (draft starts before the class ends) → conflict", () => {
		// [0,2] × 4 buổi từ Tue 2026-09-29: T2 10-05,10-12; T4 09-30,10-07.
		expect(
			findScheduleConflicts(draft, [
				cls({ startDate: "2026-09-29", sessionsTotal: 4 }),
			]),
		).toHaveLength(1);
	});

	test("run starting after the draft window (2027-01-05 > 2026-12-28) → no conflict", () => {
		expect(
			findScheduleConflicts(draft, [cls({ startDate: "2027-01-05" })]),
		).toEqual([]);
	});

	test("empty class startDate (legacy) → still eligible", () => {
		expect(findScheduleConflicts(draft, [cls({ startDate: "" })])).toHaveLength(
			1,
		);
	});

	test("legacy free-text schedule → skipped", () => {
		expect(
			findScheduleConflicts(draft, [cls({ schedule: "Tối thứ 3 & 5" })]),
		).toEqual([]);
	});

	test("legacy overnight schedule (end <= start after parse) → skipped", () => {
		expect(
			findScheduleConflicts(draft, [
				cls({ schedule: '{"days":[0],"start":"22:00","end":"01:00"}' }),
			]),
		).toEqual([]);
	});

	test("unparseable draft startDate → date window skipped, time rule still applies", () => {
		expect(
			findScheduleConflicts({ ...draft, startDate: "01/09/2026" }, [cls({})]),
		).toHaveLength(1);
	});

	test("draft sessionsTotal 0 → unknown draft end, but a finished class still never warns", () => {
		// draftStart 2026-10-06 > classEnd 2026-08-17: half inequality vẫn
		// loại được lớp đã hết buổi dù draft chưa có mốc kết thúc.
		expect(
			findScheduleConflicts({ ...draft, sessionsTotal: 0 }, [
				cls({ startDate: "2026-08-04", sessionsTotal: 4 }),
			]),
		).toEqual([]);
		// Lớp còn chạy thì vẫn cảnh báo (unknown draft end = vô cực).
		expect(
			findScheduleConflicts({ ...draft, sessionsTotal: 0 }, [cls({})]),
		).toHaveLength(1);
	});

	test("stored legacy sessionsTotal ngoài cap (1e6) không walk skeleton — unknown end vẫn conflict nếu đang chạy", () => {
		// Legacy row pre-cap (schema cũ min(0) không max): total lớn phải được
		// coi như unknown end (∞) thay vì freeze O(total) trên render path.
		const hit = findScheduleConflicts(draft, [
			cls({ startDate: "2026-09-01", sessionsTotal: 1_000_000 }),
		]);
		expect(hit).toHaveLength(1);
	});

	test("sharedDays are deduped, ascending, and sharedDays-only (draft [2,0] vs class [0,2,4])", () => {
		const hit = findScheduleConflicts({ ...draft, days: [2, 0, 2] }, [
			// [0,2,4] × 12 buổi từ 2026-09-15 → buổi cuối 2026-10-12, còn
			// chạy khi draft bắt đầu 2026-10-06.
			cls({
				startDate: "2026-09-15",
				schedule: '{"days":[4,2,0],"start":"19:00","end":"20:30"}',
			}),
		]);
		expect(hit[0].sharedDays).toEqual([0, 2]);
	});

	test("run-window equality edges: classEnd === draftStart và classStart === draftEnd vẫn conflict", () => {
		// tueDraft [1] × 12 từ Tue 2026-10-06 → draftEnd 2026-12-22.
		const tue = (start: string) =>
			cls({
				schedule: '{"days":[1],"start":"19:00","end":"20:30"}',
				startDate: start,
				sessionsTotal: 1,
			});
		// Lớp 1 buổi Tue 10-06: classEnd === draftStart → conflict.
		expect(findScheduleConflicts(tueDraft, [tue("2026-10-06")])).toHaveLength(
			1,
		);
		// Tuần trước: classEnd 09-29 < draftStart → không.
		expect(findScheduleConflicts(tueDraft, [tue("2026-09-29")])).toEqual([]);
		// Lớp 1 buổi Tue 12-22: classStart === draftEnd → conflict.
		expect(findScheduleConflicts(tueDraft, [tue("2026-12-22")])).toHaveLength(
			1,
		);
		// Tuần sau: classStart 12-29 > draftEnd → không.
		expect(findScheduleConflicts(tueDraft, [tue("2026-12-29")])).toEqual([]);
	});

	test("excludeClassId skips the edited class while still warning on another conflicting class (#693)", () => {
		const self = cls({
			id: "c-self",
			name: "Lớp đang sửa",
			schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
		});
		const other = cls({
			id: "c-other",
			name: "Lớp khác cùng giờ",
			schedule: '{"days":[0],"start":"19:30","end":"21:00"}',
		});

		expect(
			findScheduleConflicts({ ...draft, excludeClassId: "c-self" }, [self]),
		).toEqual([]);

		const hits = findScheduleConflicts({ ...draft, excludeClassId: "c-self" }, [
			self,
			other,
		]);
		expect(hits).toHaveLength(1);
		expect(hits[0].cls.id).toBe("c-other");
	});
});
