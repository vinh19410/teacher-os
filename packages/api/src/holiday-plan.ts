/**
 * Holiday shift planner (TOS-11) — pure module, cùng quy ước skeleton.ts:
 * không import db/server/web, mọi date là chuỗi `yyyy-mm-dd` neo UTC nên
 * deterministic trong Workers lẫn test. Preview và apply cùng gọi hàm này
 * (D7): apply đọc lại từ DB rồi planner tính — client không được tin preview.
 *
 * Quy tắc đã chốt (plan.md D1/D4 + red-team I1):
 * - Chỉ dời buổi mà MỌI dòng còn `upcoming`; buổi có dòng đã điểm danh
 *   (`completed`/`absent`) giữ nguyên (`keptCompleted`).
 * - Buổi mà mọi dòng là `cancelled`/`holiday` không phải buổi dạy — bỏ qua.
 * - Con trỏ tìm ngày bù bắt đầu từ `max(max(date)` của mọi nhóm buổi dạy
 *   (kể cả buổi sắp bị dời), `todayISO`) + 1 — không rơi vào ngày trống do
 *   `moveDate` cũ phía trước, không rơi vào quá khứ.
 * - "Đã có buổi" = ngày đó có BẤT KỲ dòng lesson nào (`enrollmentId` bất
 *   kỳ, mọi trạng thái) — không trộn buổi bù chung ngày với dòng cũ.
 * - Ngày đúng thứ (`schedule.days`) nhưng thuộc kỳ nghỉ (đã có hoặc kỳ đang
 *   tạo) bị nhảy qua và ghi vào `skippedHolidayDates` (TOS-12 hiển thị "(*)").
 */

import type {
	HolidayKeptCompleted,
	HolidayPlannedShift,
	HolidayUnsupported,
} from "./contracts";
import {
	isoToLessonWeekday,
	parseStoredSchedule,
	scheduleDurationMinutes,
} from "./skeleton";
import { addDaysISO } from "./vietnam-date";

export interface PlanLessonRow {
	date: string | null;
	status: string;
	enrollmentId: string;
}

export interface PlanClassInput {
	id: string;
	name: string;
	/** Raw JSON schedule của lớp. */
	schedule: string;
	lessons: PlanLessonRow[];
}

export interface PlanInput {
	range: { fromDate: string; toDate: string };
	classes: PlanClassInput[];
	/** Kỳ nghỉ đã có hiệu lực với từng lớp (đã lọc theo scope ở server). */
	existingHolidayDates: Map<string, Set<string>>;
	/** Hôm nay theo giờ VN (yyyy-mm-dd) — truyền từ caller để hàm thuần deterministic. */
	todayISO: string;
}

export interface PlanResult {
	shifts: PlannedShift[];
	keptCompleted: HolidayKeptCompleted[];
	unsupported: HolidayUnsupported[];
}

/** Wire shift + roster thật tại buổi gốc: server dùng cho guard batch và
 * INSERT…SELECT; không bao giờ rời server (response map bỏ enrollmentIds). */
export interface PlannedShift extends HolidayPlannedShift {
	enrollmentIds: string[];
}

/** Giới hạn quét ngày cho mỗi buổi bù — vượt nghĩa là lịch vô lý, ném lỗi
 * thay vì bịa ngày. `shifts × 7 × 52` (mỗi tuần 1 ngày đúng thứ). */
const SCAN_CAP_DAYS = 7 * 52;

const TEACHING_SKIP_STATUSES = new Set(["cancelled", "holiday"]);

function compareISO(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

type ShiftSeed = Omit<PlannedShift, "makeupDate" | "weekday" | "time" | "dur">;

export function planHolidayShift(input: PlanInput): PlanResult {
	const shifts: PlannedShift[] = [];
	const keptCompleted: HolidayKeptCompleted[] = [];
	const unsupported: HolidayUnsupported[] = [];
	const { fromDate, toDate } = input.range;

	const classInputs = [...input.classes].sort((a, b) =>
		a.name.localeCompare(b.name, "vi"),
	);

	for (const cls of classInputs) {
		const parsed = parseStoredSchedule(cls.schedule);
		if (!parsed) {
			unsupported.push({
				classId: cls.id,
				className: cls.name,
				reason: "legacy-schedule",
			});
			continue;
		}
		if (cls.lessons.some((row) => row.date === null)) {
			unsupported.push({
				classId: cls.id,
				className: cls.name,
				reason: "undated",
			});
			continue;
		}

		// Gom theo date — occurrence identity: mọi dòng cùng (classId, date)
		// là một buổi vật lý.
		const byDate = new Map<string, PlanLessonRow[]>();
		const occupiedDates = new Set<string>();
		for (const row of cls.lessons) {
			if (row.date === null) continue;
			const bucket = byDate.get(row.date);
			if (bucket) bucket.push(row);
			else byDate.set(row.date, [row]);
			occupiedDates.add(row.date);
		}

		const dates = [...byDate.keys()].sort(compareISO);

		// sessionOrdinal dùng đúng định nghĩa index tab Lịch học sau I4:
		// nhóm `holiday` không chiếm số.
		let teachingOrdinal = 0;
		const ordinalByDate = new Map<string, number>();
		let maxTeachingDate: string | null = null;
		for (const date of dates) {
			const rows = byDate.get(date) ?? [];
			const allHoliday = rows.every((row) => row.status === "holiday");
			if (!allHoliday) {
				teachingOrdinal += 1;
			}
			const allSkipped = rows.every((row) =>
				TEACHING_SKIP_STATUSES.has(row.status),
			);
			if (!allSkipped) {
				ordinalByDate.set(date, teachingOrdinal);
				if (maxTeachingDate === null || date > maxTeachingDate) {
					maxTeachingDate = date;
				}
			}
		}

		// Kỳ nghỉ đang tạo + các kỳ đã có hiệu lực với lớp này.
		const holidayDates = new Set(input.existingHolidayDates.get(cls.id) ?? []);
		for (let d = fromDate; d <= toDate; d = addDaysISO(d, 1)) {
			holidayDates.add(d);
		}

		const dur = scheduleDurationMinutes(parsed);
		const classShifts: ShiftSeed[] = [];
		for (const date of dates) {
			if (date < fromDate || date > toDate) continue;
			const rows = byDate.get(date) ?? [];
			const ordinal = ordinalByDate.get(date);
			if (ordinal === undefined) continue; // mọi dòng cancelled/holiday
			const hasSettled = rows.some(
				(row) => row.status === "completed" || row.status === "absent",
			);
			if (hasSettled) {
				keptCompleted.push({
					classId: cls.id,
					className: cls.name,
					date,
					sessionOrdinal: ordinal,
				});
				continue;
			}
			const upcoming = rows.filter((row) => row.status === "upcoming");
			if (upcoming.length === 0) continue;
			classShifts.push({
				classId: cls.id,
				className: cls.name,
				originalDate: date,
				sessionOrdinal: ordinal,
				enrollmentIds: upcoming.map((row) => row.enrollmentId),
				skippedHolidayDates: [],
			});
		}

		if (classShifts.length === 0) continue;

		// Con trỏ bắt đầu (D4 + I1): sau buổi dạy MUỘN NHẤT (kể cả buổi sắp
		// bị dời) và sau hôm nay.
		let cursor =
			maxTeachingDate !== null && maxTeachingDate > input.todayISO
				? addDaysISO(maxTeachingDate, 1)
				: addDaysISO(input.todayISO, 1);

		for (const shift of classShifts) {
			let scanned = 0;
			for (;;) {
				if (scanned >= SCAN_CAP_DAYS) {
					throw new Error(
						`holiday-shift: no valid makeup date within ${SCAN_CAP_DAYS} days for class ${cls.id}`,
					);
				}
				scanned += 1;
				const weekday = isoToLessonWeekday(cursor);
				const dayIndex = weekday - 1; // parsed.days là 0-6 Monday-first
				if (!parsed.days.includes(dayIndex)) {
					cursor = addDaysISO(cursor, 1);
					continue;
				}
				if (holidayDates.has(cursor)) {
					shift.skippedHolidayDates.push(cursor);
					cursor = addDaysISO(cursor, 1);
					continue;
				}
				if (occupiedDates.has(cursor)) {
					cursor = addDaysISO(cursor, 1);
					continue;
				}
				break;
			}
			shifts.push({
				...shift,
				makeupDate: cursor,
				weekday: isoToLessonWeekday(cursor),
				time: parsed.start,
				dur,
			});
			cursor = addDaysISO(cursor, 1);
		}
	}

	shifts.sort(
		(a, b) =>
			a.className.localeCompare(b.className, "vi") ||
			compareISO(a.originalDate, b.originalDate),
	);
	keptCompleted.sort(
		(a, b) =>
			a.className.localeCompare(b.className, "vi") ||
			compareISO(a.date, b.date),
	);
	unsupported.sort((a, b) => a.className.localeCompare(b.className, "vi"));

	return { shifts, keptCompleted, unsupported };
}
