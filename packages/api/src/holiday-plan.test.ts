import { describe, expect, it } from "vitest";
import { type PlanInput, planHolidayShift } from "./holiday-plan";

/** Thứ Sáu = day index 4 (0 = Monday), 19:00–20:30. */
const SCHEDULE_FRIDAY = JSON.stringify({
	days: [4],
	start: "19:00",
	end: "20:30",
});

function lessons(
	classId: string,
	startISO: string,
	count: number,
	enrollmentId = `enr-${classId}`,
	utcDay = 5, // Friday
	utcDay2?: number, // ngày thứ hai trong tuần (ví dụ T3&T7)
): Array<{ date: string; status: string; enrollmentId: string }> {
	const rows: Array<{ date: string; status: string; enrollmentId: string }> =
		[];
	const cursor = new Date(`${startISO}T00:00:00Z`);
	let made = 0;
	while (made < count) {
		if (
			cursor.getUTCDay() === utcDay ||
			(utcDay2 !== undefined && cursor.getUTCDay() === utcDay2)
		) {
			rows.push({
				date: cursor.toISOString().slice(0, 10),
				status: "upcoming",
				enrollmentId,
			});
			made += 1;
		}
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return rows;
}

function input(overrides: Partial<PlanInput>): PlanInput {
	return {
		range: { fromDate: "2026-11-20", toDate: "2026-11-20" },
		classes: [
			{
				id: "cls-t6",
				name: "Lớp T6",
				schedule: SCHEDULE_FRIDAY,
				lessons: lessons("cls-t6", "2026-08-07", 24),
			},
		],
		existingHolidayDates: new Map(),
		todayISO: "2026-10-26",
		...overrides,
	};
}

describe("planHolidayShift (TOS-11 phase 2)", () => {
	it("lớp T6 24 buổi, nghỉ 20/11 trúng buổi 16 → bù vào Thứ Sáu kế tiếp sau buổi cuối", () => {
		const result = planHolidayShift(input({}));

		expect(result.unsupported).toEqual([]);
		expect(result.keptCompleted).toEqual([]);
		expect(result.shifts).toHaveLength(1);
		const shift = result.shifts[0];
		if (!shift) throw new Error("missing shift");
		// 24 buổi T6 từ 07/08/2026 → buổi cuối 15/01/2027; bù = T6 kế 22/01/2027.
		expect(shift.originalDate).toBe("2026-11-20");
		expect(shift.makeupDate).toBe("2027-01-22");
		expect(shift.weekday).toBe(5); // Friday, 1 = Monday
		expect(shift.time).toBe("19:00");
		expect(shift.dur).toBe(90);
		expect(shift.enrollmentIds).toEqual(["enr-cls-t6"]);
		expect(shift.skippedHolidays).toEqual([]);
	});

	it("lớp T3 & T7, nghỉ 2 ngày trúng mỗi lớp 1 buổi → 2 shift nối tiếp đúng thứ (className asc)", () => {
		// days 0-6 Monday-first: Thứ Ba = 1, Thứ Bảy = 5.
		const t3 = JSON.stringify({ days: [1], start: "18:00", end: "19:30" });
		const t7 = JSON.stringify({ days: [5], start: "08:00", end: "09:30" });
		const result = planHolidayShift(
			input({
				range: { fromDate: "2026-11-17", toDate: "2026-11-21" },
				classes: [
					{
						id: "cls-t7",
						name: "Lớp T7",
						schedule: t7,
						lessons: lessons("cls-t7", "2026-08-08", 24, "enr-cls-t7", 6),
					},
					{
						id: "cls-t3",
						name: "Lớp T3",
						schedule: t3,
						lessons: lessons("cls-t3", "2026-08-04", 24, "enr-cls-t3", 2),
					},
				],
			}),
		);

		expect(result.shifts).toHaveLength(2);
		// T3: buổi cuối 12/01/2027 → bù T3 kế 19/01/2027; T7: cuối 16/01 → bù 23/01.
		expect(result.shifts[0]?.className).toBe("Lớp T3");
		expect(result.shifts[0]?.originalDate).toBe("2026-11-17");
		expect(result.shifts[0]?.makeupDate).toBe("2027-01-19");
		expect(result.shifts[0]?.weekday).toBe(2);
		expect(result.shifts[1]?.className).toBe("Lớp T7");
		expect(result.shifts[1]?.originalDate).toBe("2026-11-21");
		expect(result.shifts[1]?.makeupDate).toBe("2027-01-23");
		expect(result.shifts[1]?.weekday).toBe(6);
	});

	it("ngày bù dự kiến thuộc kỳ nghỉ đã khai báo → nhảy qua và ghi skippedHolidays kèm tên (AC-002: 26/12 → 29/12)", () => {
		// Lớp T3 & T7: buổi T3 15/12 bị dời; buổi dạy cuối 22/12 (T3) nên con
		// trỏ chọn T7 26/12/2026 — thuộc kỳ nghỉ «Nghỉ Tết Dương lịch» đã lưu
		// trong DB → nhảy sang T3 29/12/2026. Đúng ví dụ AC-002.
		const result = planHolidayShift(
			input({
				range: { fromDate: "2026-12-15", toDate: "2026-12-15" },
				todayISO: "2026-12-01",
				classes: [
					{
						id: "cls-t3t7",
						name: "IELTS 5.0B",
						schedule: JSON.stringify({
							days: [1, 5],
							start: "18:00",
							end: "19:30",
						}),
						lessons: lessons("cls-t3t7", "2026-11-03", 15, "enr-t3t7", 2, 6),
					},
				],
				existingHolidayDates: new Map([
					["cls-t3t7", new Map([["2026-12-26", "Nghỉ Tết Dương lịch"]])],
				]),
			}),
		);

		const shift = result.shifts[0];
		if (!shift) throw new Error("missing shift");
		expect(shift.originalDate).toBe("2026-12-15");
		expect(shift.makeupDate).toBe("2026-12-29");
		expect(shift.weekday).toBe(2); // Thứ 3
		expect(shift.skippedHolidays).toEqual([
			{ date: "2026-12-26", holidayName: "Nghỉ Tết Dương lịch" },
		]);
	});

	it("ngày bù rơi vào khoảng kỳ nghỉ đang tạo → skippedHolidays với holidayName null (client điền tên draft)", () => {
		// Range kéo dài trúng ngày bù tự nhiên 22/01/2027 — thuộc kỳ nghỉ ĐANG
		// tạo, planner không biết tên → null.
		const result = planHolidayShift(
			input({ range: { fromDate: "2026-11-20", toDate: "2027-01-22" } }),
		);

		const shift = result.shifts[0];
		if (!shift) throw new Error("missing shift");
		expect(shift.makeupDate).toBe("2027-01-29");
		expect(shift.skippedHolidays).toEqual([
			{ date: "2027-01-22", holidayName: null },
		]);
	});

	it("kỳ nghỉ đang tạo chồng ngày kỳ nghỉ đã lưu → tên kỳ đã lưu thắng (khai báo trước ưu tiên)", () => {
		const result = planHolidayShift(
			input({
				range: { fromDate: "2026-11-20", toDate: "2027-01-22" },
				existingHolidayDates: new Map([
					["cls-t6", new Map([["2027-01-22", "Nghỉ Tết Dương lịch"]])],
				]),
			}),
		);

		const shift = result.shifts[0];
		if (!shift) throw new Error("missing shift");
		expect(shift.makeupDate).toBe("2027-01-29");
		expect(shift.skippedHolidays).toEqual([
			{ date: "2027-01-22", holidayName: "Nghỉ Tết Dương lịch" },
		]);
	});

	it("buổi có 1 dòng completed → keptCompleted, không shift", () => {
		const rows = lessons("cls-t6", "2026-08-07", 24);
		const target = rows.find((row) => row.date === "2026-11-20");
		if (target) target.status = "completed";
		const result = planHolidayShift(
			input({
				classes: [
					{
						id: "cls-t6",
						name: "Lớp T6",
						schedule: SCHEDULE_FRIDAY,
						lessons: rows,
					},
				],
			}),
		);

		expect(result.shifts).toEqual([]);
		expect(result.keptCompleted).toHaveLength(1);
		expect(result.keptCompleted[0]?.date).toBe("2026-11-20");
	});

	it("buổi có dòng completed trộn dòng upcoming → vẫn keptCompleted (D1)", () => {
		const rows = lessons("cls-t6", "2026-08-07", 24);
		rows.push({
			date: "2026-11-20",
			status: "upcoming",
			enrollmentId: "enr-extra",
		});
		const target = rows.find(
			(row) => row.date === "2026-11-20" && row.enrollmentId === "enr-cls-t6",
		);
		if (target) target.status = "completed";
		const result = planHolidayShift(
			input({
				classes: [
					{
						id: "cls-t6",
						name: "Lớp T6",
						schedule: SCHEDULE_FRIDAY,
						lessons: rows,
					},
				],
			}),
		);

		expect(result.shifts).toEqual([]);
		expect(result.keptCompleted).toHaveLength(1);
	});

	it("buổi toàn cancelled trong khoảng → bỏ qua", () => {
		const rows = lessons("cls-t6", "2026-08-07", 24);
		for (const row of rows) {
			if (row.date === "2026-11-20") row.status = "cancelled";
		}
		const result = planHolidayShift(
			input({
				classes: [
					{
						id: "cls-t6",
						name: "Lớp T6",
						schedule: SCHEDULE_FRIDAY,
						lessons: rows,
					},
				],
			}),
		);

		expect(result.shifts).toEqual([]);
		expect(result.keptCompleted).toEqual([]);
	});

	it("con trỏ bắt đầu sau buổi cuối + hôm nay, không rơi vào ngày trống do moveDate phía trước", () => {
		// 12 buổi T6 từ 07/08 → buổi cuối 23/10/2026 — chính là buổi bị dời.
		// 30/10/2026 là T6 kế nhưng có dòng holiday cũ (đã có buổi, mọi
		// trạng thái đều chiếm ngày) → ngày bù nhảy sang T6 tiếp theo
		// 06/11/2026 — không rơi vào 30/10, không trước ngày bị dời.
		const result = planHolidayShift(
			input({
				range: { fromDate: "2026-10-23", toDate: "2026-10-23" },
				classes: [
					{
						id: "cls-t6",
						name: "Lớp T6",
						schedule: SCHEDULE_FRIDAY,
						lessons: [
							...lessons("cls-t6", "2026-08-07", 12),
							{
								date: "2026-10-30",
								status: "holiday",
								enrollmentId: "enr-cls-t6",
							},
						],
					},
				],
			}),
		);

		const shift = result.shifts[0];
		if (!shift) throw new Error("missing shift");
		expect(shift.makeupDate).toBe("2026-11-06");
		expect(shift.originalDate).toBe("2026-10-23");
		expect(shift.sessionOrdinal).toBe(12);
	});

	it("max(date) nhỏ hơn hôm nay → bắt đầu từ todayISO + 1, không sinh ngày bù quá khứ", () => {
		const result = planHolidayShift(
			input({
				todayISO: "2027-02-01",
				classes: [
					{
						id: "cls-t6",
						name: "Lớp T6",
						schedule: SCHEDULE_FRIDAY,
						lessons: lessons("cls-t6", "2026-08-07", 24),
					},
				],
			}),
		);

		const shift = result.shifts[0];
		if (!shift) throw new Error("missing shift");
		expect(shift.makeupDate).toBe("2027-02-05");
		expect(shift.weekday).toBe(5);
	});

	it("lớp schedule legacy → unsupported", () => {
		const result = planHolidayShift(
			input({
				classes: [
					{
						id: "cls-legacy",
						name: "Lớp cũ",
						schedule: "T2 19:00",
						lessons: [
							{ date: "2026-11-20", status: "upcoming", enrollmentId: "enr-1" },
						],
					},
				],
			}),
		);

		expect(result.shifts).toEqual([]);
		expect(result.unsupported).toEqual([
			{ classId: "cls-legacy", className: "Lớp cũ", reason: "legacy-schedule" },
		]);
	});

	it("lớp có dòng date = null → unsupported undated", () => {
		const result = planHolidayShift(
			input({
				classes: [
					{
						id: "cls-mixed",
						name: "Lớp lộn xộn",
						schedule: SCHEDULE_FRIDAY,
						lessons: [
							{ date: "2026-11-20", status: "upcoming", enrollmentId: "enr-1" },
							{ date: null, status: "upcoming", enrollmentId: "enr-1" },
						],
					},
				],
			}),
		);

		expect(result.unsupported).toEqual([
			{ classId: "cls-mixed", className: "Lớp lộn xộn", reason: "undated" },
		]);
	});

	it("khoảng không trúng buổi nào → shifts rỗng", () => {
		const result = planHolidayShift(
			input({ range: { fromDate: "2026-12-22", toDate: "2026-12-23" } }),
		);

		expect(result.shifts).toEqual([]);
		expect(result.keptCompleted).toEqual([]);
		expect(result.unsupported).toEqual([]);
	});

	it("sessionOrdinal không đếm nhóm holiday (I4)", () => {
		// 24 buổi T6; 06/11 (buổi 14) biến holiday trước đó → buổi 20/11
		// (buổi 16 thật) là thứ 15 theo định nghĩa tab Lịch học.
		const rows = lessons("cls-t6", "2026-08-07", 24);
		for (const row of rows) {
			if (row.date === "2026-11-06") row.status = "holiday";
		}
		const result = planHolidayShift(
			input({
				classes: [
					{
						id: "cls-t6",
						name: "Lớp T6",
						schedule: SCHEDULE_FRIDAY,
						lessons: rows,
					},
				],
			}),
		);

		expect(result.shifts[0]?.sessionOrdinal).toBe(15);
	});

	it("gọi 2 lần cùng input → output giống hệt (deterministic)", () => {
		const a = planHolidayShift(input({}));
		const b = planHolidayShift(input({}));
		expect(a).toEqual(b);
	});
});
