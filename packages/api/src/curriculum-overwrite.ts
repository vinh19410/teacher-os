import type { HolidayMode } from "./contracts";
import { planHolidayShift } from "./holiday-plan";
import {
	parseStartDateStrict,
	parseStoredSchedule,
	skeletonOf,
} from "./skeleton";
import { addDaysISO, vietnamTodayISO } from "./vietnam-date";

const MAX_CURRICULUM_SESSIONS = 52;

export interface CurriculumOverwriteHoliday {
	id: string;
	name: string;
	fromDate: string;
	toDate: string;
	mode: HolidayMode;
}

export type CurriculumDatesProjectionResult =
	| {
			ok: true;
			/** Ngày dạy hiệu lực (không gồm ngày `holiday` đã dời và ngày `cancelled`). */
			activeDates: string[];
			/** Ngày chiếm slot giáo trình (không gồm ngày `holiday`, vẫn gồm ngày `cancelled` để khớp ordinal bài học). */
			nonHolidayDates: string[];
			/** Ngày bị dời lễ (`holiday`) hoặc hủy do lễ (`cancelled`). */
			inactiveDates: string[];
	  }
	| {
			ok: false;
			reason:
				| "invalid-schedule"
				| "invalid-start-date"
				| "invalid-lesson-count"
				| "holiday-scan-cap";
	  };

/**
 * Xác định một dòng `lesson` của lớp manual đã ghi nhận điểm danh/hoàn thành
 * hay chưa — buổi đã settled luôn bị chặn ghi đè để bảo toàn lịch sử học tập
 * và số buổi còn lại trong gói học phí.
 */
export function isManualLessonSettled(row: {
	status: string;
	attendance?: string | null;
	attendanceNote?: string | null;
}): boolean {
	return (
		row.status === "completed" ||
		row.status === "absent" ||
		row.attendance != null ||
		(row.attendanceNote != null && row.attendanceNote !== "")
	);
}

/**
 * Chiếu tập ngày học của giáo trình từ `schedule` + `startDate` + `lessonCount`
 * và mô phỏng các kỳ nghỉ lễ áp dụng lên lớp theo đúng thuật toán của
 * `materializeScheduleForEnrollment`. Tách rõ ngày dạy hiệu lực (`activeDates`)
 * khỏi ngày nghỉ lễ/bị hủy (`inactiveDates`), và bắt lỗi `SCAN_CAP_DAYS` của
 * `planHolidayShift` thay vì ném exception.
 */
export function projectCurriculumDates(input: {
	schedule: string;
	startDate: string;
	lessonCount: number;
	holidays?: ReadonlyArray<CurriculumOverwriteHoliday>;
	todayISO?: string;
}): CurriculumDatesProjectionResult {
	const parsed = parseStoredSchedule(input.schedule);
	if (!parsed) {
		return { ok: false, reason: "invalid-schedule" };
	}
	const startISO = parseStartDateStrict(input.startDate);
	if (!startISO) {
		return { ok: false, reason: "invalid-start-date" };
	}
	if (
		!Number.isInteger(input.lessonCount) ||
		input.lessonCount < 1 ||
		input.lessonCount > MAX_CURRICULUM_SESSIONS
	) {
		return { ok: false, reason: "invalid-lesson-count" };
	}
	const skeleton = skeletonOf(parsed, startISO, input.lessonCount);
	if (!skeleton) {
		return { ok: false, reason: "invalid-schedule" };
	}

	const initialDates: string[] = [];
	for (const dates of skeleton.values()) {
		for (const date of dates) {
			initialDates.push(date);
		}
	}
	initialDates.sort((a, b) => a.localeCompare(b));

	const rows: Array<{
		date: string;
		status: "upcoming" | "holiday" | "cancelled";
	}> = initialDates.map((date) => ({ date, status: "upcoming" }));

	const holidays = input.holidays ?? [];
	if (holidays.length > 0) {
		const todayISO = input.todayISO ?? vietnamTodayISO();
		const datesByName = new Map<string, string>();
		for (const holiday of holidays) {
			for (
				let d = holiday.fromDate;
				d <= holiday.toDate;
				d = addDaysISO(d, 1)
			) {
				if (!datesByName.has(d)) datesByName.set(d, holiday.name);
			}
		}

		try {
			for (const holiday of holidays) {
				const planned = planHolidayShift({
					range: {
						fromDate: holiday.fromDate,
						toDate: holiday.toDate,
					},
					classes: [
						{
							id: "projection",
							name: "projection",
							schedule: input.schedule,
							lessons: rows.map((row) => ({
								date: row.date,
								status: row.status,
								enrollmentId: "projection-enrollment",
							})),
						},
					],
					existingHolidayDates: new Map([["projection", datesByName]]),
					todayISO,
					mode: holiday.mode,
				});
				for (const shift of planned.shifts) {
					for (const row of rows) {
						if (row.date === shift.originalDate) {
							row.status = "holiday";
						}
					}
					rows.push({ date: shift.makeupDate, status: "upcoming" });
				}
				for (const cancel of planned.cancellations) {
					for (const row of rows) {
						if (row.date === cancel.date && row.status === "upcoming") {
							row.status = "cancelled";
						}
					}
				}
			}
		} catch {
			return { ok: false, reason: "holiday-scan-cap" };
		}
	}

	const activeSet = new Set<string>();
	const nonHolidaySet = new Set<string>();
	for (const row of rows) {
		if (row.status === "upcoming") {
			activeSet.add(row.date);
		}
		if (row.status !== "holiday") {
			nonHolidaySet.add(row.date);
		}
	}
	const inactiveSet = new Set<string>();
	for (const row of rows) {
		if (row.status !== "upcoming" && !activeSet.has(row.date)) {
			inactiveSet.add(row.date);
		}
	}

	return {
		ok: true,
		activeDates: [...activeSet].sort((a, b) => a.localeCompare(b)),
		nonHolidayDates: [...nonHolidaySet].sort((a, b) => a.localeCompare(b)),
		inactiveDates: [...inactiveSet].sort((a, b) => a.localeCompare(b)),
	};
}

/**
 * Phân tách danh sách ngày buổi thủ công thành 2 nhóm duy nhất, tăng dần:
 * - `conflictingDates`: các ngày trùng với lịch dạy hiệu lực của giáo trình.
 * - `otherManualDates`: các buổi thủ công ở ngày khác cũng sẽ bị thay thế.
 */
export function classifyManualSessionDates(
	manualDates: readonly string[],
	activeCurriculumDates: readonly string[],
): {
	conflictingDates: string[];
	otherManualDates: string[];
} {
	const activeSet = new Set(activeCurriculumDates);
	const conflictingSet = new Set<string>();
	const otherSet = new Set<string>();
	for (const date of manualDates) {
		if (activeSet.has(date)) {
			conflictingSet.add(date);
		} else {
			otherSet.add(date);
		}
	}
	return {
		conflictingDates: [...conflictingSet].sort((a, b) => a.localeCompare(b)),
		otherManualDates: [...otherSet].sort((a, b) => a.localeCompare(b)),
	};
}
