import {
	isoToLessonWeekday,
	type ParsedSchedule,
	parseStartDateStrict,
	parseStoredSchedule,
	skeletonOf,
} from "./skeleton";

/**
 * Tiền tố tạm thời cho cơ chế dời ngày hai pha (collision-safe trên SQLite/D1).
 * Độ dài cố định 10 ký tự: SQLite dùng `substr(date, 1, 10) = '__shift__:'` và
 * `substr(date, 11)` để tránh ngữ nghĩa wildcard `_` của `LIKE`.
 */
export const SHIFT_DATE_PREFIX = "__shift__:";

/**
 * Trần số cặp ngày mỗi câu `UPDATE lesson` (`CASE date` + `CASE day` + `IN`):
 * 18 × 5 + 2 = 92 <= 100 bound parameters của Cloudflare D1.
 */
export const LESSON_REMAP_CHUNK = 18;

/**
 * Trần số cặp ngày mỗi câu `UPDATE` 1 cột `date` (`lesson_material`, `class_session_meeting`):
 * 30 × 3 + 2 = 92 <= 100 bound parameters của Cloudflare D1.
 */
export const DATE_ONLY_REMAP_CHUNK = 30;

/** Trần số buổi học hỗ trợ tự động tính lại lịch (khớp `classCreateSchema`). */
export const MAX_RESCHEDULE_SESSIONS = 52;

export type StartDateLockReason =
	| "class-started"
	| "legacy-undated"
	| "invalid-schedule";

export interface HolidayShiftPair {
	originalDate: string;
	makeupDate: string;
}

export interface ClassStartDateLessonInput {
	date: string | null;
	status: string;
	/** Định danh ghi danh/học viên trong lớp (`enrollmentId` ở server, `sid` ở web snapshot). */
	enrollmentKey?: string;
	attendance?: string | null;
	attendanceNote?: string | null;
}

export type ClassStartDateEditability =
	| { editable: true; reason: null }
	| { editable: false; reason: StartDateLockReason };

export interface DateMapping {
	oldDate: string;
	newDate: string;
	/** Thứ theo quy ước `lesson.day`: 1 = Thứ 2 .. 7 = Chủ nhật. */
	newDay: number;
}

/**
 * Sắp xếp thứ tự hoàn tác các cặp `holiday_session_shift` bằng topological sort
 * trên đồ thị có hướng `originalDate -> makeupDate` (bóc dần các đỉnh ngọn
 * không làm `originalDate` cho shift khác). Không phụ thuộc `createdAt`/`id`
 * để tránh thứ tự UUID ngẫu nhiên khi nhiều shift được ghi trong cùng một batch.
 */
export function topologicalUnwindShifts<T extends HolidayShiftPair>(
	shifts: ReadonlyArray<T>,
): { ok: true; orderedDesc: T[] } | { ok: false } {
	if (shifts.length === 0) {
		return { ok: true, orderedDesc: [] };
	}

	const remaining = [...shifts];
	const orderedDesc: T[] = [];

	while (remaining.length > 0) {
		const originalDates = new Set(remaining.map((s) => s.originalDate));
		const tips: T[] = [];
		const nextRemaining: T[] = [];

		for (const shift of remaining) {
			if (!originalDates.has(shift.makeupDate)) {
				tips.push(shift);
			} else {
				nextRemaining.push(shift);
			}
		}

		if (tips.length === 0) {
			return { ok: false };
		}

		tips.sort(
			(a, b) =>
				b.makeupDate.localeCompare(a.makeupDate) ||
				b.originalDate.localeCompare(a.originalDate),
		);
		orderedDesc.push(...tips);
		remaining.length = 0;
		remaining.push(...nextRemaining);
	}

	return { ok: true, orderedDesc };
}

function toStringSet(
	input?: ReadonlySet<string> | ReadonlyArray<string>,
): ReadonlySet<string> {
	if (!input) return new Set();
	return input instanceof Set ? input : new Set(input);
}

function sortedSkeletonDates(
	parsed: ParsedSchedule,
	startISO: string,
	sessionsTotal: number,
): string[] | null {
	const skeleton = skeletonOf(parsed, startISO, sessionsTotal);
	if (!skeleton) return null;
	const dates: string[] = [];
	for (const list of skeleton.values()) {
		for (const date of list) {
			dates.push(date);
		}
	}
	dates.sort((a, b) => a.localeCompare(b));
	return dates;
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
	if (a.size !== b.size) return false;
	for (const item of a) {
		if (!b.has(item)) return false;
	}
	return true;
}

/**
 * Nguồn chân lý dùng chung cho server và web: quyết định lớp có thể đổi
 * `startDate` hay không.
 *
 * - Lớp chưa có dòng `lesson` nào luôn cho phép sửa.
 * - Lớp đã có bất kỳ buổi `completed`, `absent`, có `attendance`/`attendanceNote`,
 *   hoặc `cancelled` không thuộc `holiday_session_cancel` bị khóa (`class-started`).
 * - Lớp `manual` chưa bắt đầu được phép sửa metadata `startDate` (giữ nguyên buổi thủ công).
 * - Lớp `auto` đã có `lesson` chỉ cho phép sửa khi tất cả buổi đều có ngày,
 *   lịch cấu trúc hợp lệ (`1 <= sessionsTotal <= 52`), đồ thị kỳ nghỉ nhất quán
 *   và tập ngày gốc sau hoàn tác khớp `sessionsTotal` trên mọi ghi danh.
 */
export function evaluateClassStartDateEditability(input: {
	schedule: string;
	sessionsTotal: number;
	isManual: boolean;
	lessons: ReadonlyArray<ClassStartDateLessonInput>;
	holidayCancelDates?: ReadonlySet<string> | ReadonlyArray<string>;
	holidayShifts?: ReadonlyArray<HolidayShiftPair>;
}): ClassStartDateEditability {
	if (input.lessons.length === 0) {
		return { editable: true, reason: null };
	}

	const cancelSet = toStringSet(input.holidayCancelDates);

	for (const row of input.lessons) {
		if (
			row.status === "completed" ||
			row.status === "absent" ||
			row.attendance != null ||
			(row.attendanceNote != null && row.attendanceNote !== "")
		) {
			return { editable: false, reason: "class-started" };
		}
		if (row.status === "cancelled" && (!row.date || !cancelSet.has(row.date))) {
			return { editable: false, reason: "class-started" };
		}
	}

	if (input.isManual) {
		return { editable: true, reason: null };
	}

	for (const row of input.lessons) {
		if (!row.date || row.date.trim() === "") {
			return { editable: false, reason: "legacy-undated" };
		}
	}

	if (
		parseStoredSchedule(input.schedule) === null ||
		!Number.isInteger(input.sessionsTotal) ||
		input.sessionsTotal <= 0 ||
		input.sessionsTotal > MAX_RESCHEDULE_SESSIONS
	) {
		return { editable: false, reason: "invalid-schedule" };
	}

	const shifts = input.holidayShifts ?? [];
	const topo = topologicalUnwindShifts(shifts);
	if (!topo.ok) {
		return { editable: false, reason: "invalid-schedule" };
	}

	const shiftOrigSet = new Set(shifts.map((s) => s.originalDate));
	const allDates = new Set<string>();
	const statusesByDate = new Map<string, Set<string>>();
	const datesByEnrollment = new Map<string, Set<string>>();
	let hasEnrollmentKeys = false;

	for (const row of input.lessons) {
		const date = row.date as string;
		allDates.add(date);
		let statusSet = statusesByDate.get(date);
		if (!statusSet) {
			statusSet = new Set();
			statusesByDate.set(date, statusSet);
		}
		statusSet.add(row.status);

		if (row.status === "holiday" && !shiftOrigSet.has(date)) {
			return { editable: false, reason: "invalid-schedule" };
		}

		if (row.enrollmentKey) {
			hasEnrollmentKeys = true;
			let enrDates = datesByEnrollment.get(row.enrollmentKey);
			if (!enrDates) {
				enrDates = new Set();
				datesByEnrollment.set(row.enrollmentKey, enrDates);
			}
			// Trùng 2 dòng lesson cùng ngày trong 1 ghi danh -> dữ liệu đã lệch.
			if (enrDates.has(date)) {
				return { editable: false, reason: "invalid-schedule" };
			}
			enrDates.add(date);
		}
	}

	for (const shift of shifts) {
		const origStatuses = statusesByDate.get(shift.originalDate);
		const makeupStatuses = statusesByDate.get(shift.makeupDate);
		if (!origStatuses || !makeupStatuses) {
			return { editable: false, reason: "invalid-schedule" };
		}
		for (const st of origStatuses) {
			if (st !== "holiday") {
				return { editable: false, reason: "invalid-schedule" };
			}
		}
		for (const st of makeupStatuses) {
			if (
				st !== "upcoming" &&
				!(st === "holiday" && shiftOrigSet.has(shift.makeupDate)) &&
				!(st === "cancelled" && cancelSet.has(shift.makeupDate))
			) {
				return { editable: false, reason: "invalid-schedule" };
			}
		}
	}

	const baseDateSet = new Set(allDates);
	for (const shift of topo.orderedDesc) {
		baseDateSet.delete(shift.makeupDate);
		baseDateSet.add(shift.originalDate);
	}

	if (baseDateSet.size !== input.sessionsTotal) {
		return { editable: false, reason: "invalid-schedule" };
	}

	if (hasEnrollmentKeys) {
		for (const enrDates of datesByEnrollment.values()) {
			const enrBase = new Set(enrDates);
			for (const shift of topo.orderedDesc) {
				if (
					!enrBase.has(shift.makeupDate) ||
					!enrBase.has(shift.originalDate)
				) {
					return { editable: false, reason: "invalid-schedule" };
				}
				enrBase.delete(shift.makeupDate);
			}
			if (!setsEqual(enrBase, baseDateSet)) {
				return { editable: false, reason: "invalid-schedule" };
			}
		}
	}

	return { editable: true, reason: null };
}

export type StartDateShiftPlanResult<TShift extends HolidayShiftPair> =
	| {
			ok: true;
			mode: "projected" | "materialized";
			unwindShiftsDesc: TShift[];
			oldBaseDates: string[];
			newBaseDates: string[];
			mappings: DateMapping[];
			surplusOldDates: string[];
			newScheduleParsed: ParsedSchedule | null;
	  }
	| { ok: false; reason: "invalid-schedule" | "invalid-start-date" };

/**
 * Lập kế hoạch ánh xạ ngày 1-1 cho lớp `auto`:
 * - `projected` (0 dòng `lesson`): ánh xạ các ngày dự kiến cũ sang lịch mới để dời/dọn
 *   Zoom meetings hoặc tài liệu gắn trước; hỗ trợ đổi đồng thời `schedule`,
 *   `sessionsTotal`, hoặc xóa rỗng `newStartDate: ""`.
 * - `materialized` (đã có `lesson`): hoàn tác `existingShifts` theo thứ tự topological,
 *   xác minh số ngày gốc khớp `newSessionsTotal`, rồi tạo song ánh 1-1 sang `skeletonOf`.
 */
export function planUnstartedStartDateShift<
	TShift extends HolidayShiftPair,
>(input: {
	oldSchedule: string;
	newSchedule: string;
	oldStartDate: string;
	newStartDate: string;
	oldSessionsTotal: number;
	newSessionsTotal: number;
	existingLessonDates: ReadonlyArray<{ date: string; status: string }>;
	existingShifts: ReadonlyArray<TShift>;
}): StartDateShiftPlanResult<TShift> {
	if (input.existingLessonDates.length === 0) {
		const oldParsed = parseStoredSchedule(input.oldSchedule);
		const oldStartISO = parseStartDateStrict(input.oldStartDate);
		const oldProjected =
			oldParsed &&
			oldStartISO &&
			Number.isInteger(input.oldSessionsTotal) &&
			input.oldSessionsTotal > 0 &&
			input.oldSessionsTotal <= MAX_RESCHEDULE_SESSIONS
				? (sortedSkeletonDates(
						oldParsed,
						oldStartISO,
						input.oldSessionsTotal,
					) ?? [])
				: [];

		const newParsed = parseStoredSchedule(input.newSchedule);
		const newStartISO = parseStartDateStrict(input.newStartDate);
		const newProjected =
			newParsed &&
			newStartISO &&
			Number.isInteger(input.newSessionsTotal) &&
			input.newSessionsTotal > 0 &&
			input.newSessionsTotal <= MAX_RESCHEDULE_SESSIONS
				? (sortedSkeletonDates(
						newParsed,
						newStartISO,
						input.newSessionsTotal,
					) ?? [])
				: [];

		const pairCount = Math.min(oldProjected.length, newProjected.length);
		const mappings: DateMapping[] = [];
		for (let i = 0; i < pairCount; i += 1) {
			const oldDate = oldProjected[i];
			const newDate = newProjected[i];
			if (!oldDate || !newDate) continue;
			mappings.push({
				oldDate,
				newDate,
				newDay: isoToLessonWeekday(newDate),
			});
		}

		return {
			ok: true,
			mode: "projected",
			unwindShiftsDesc: [],
			oldBaseDates: oldProjected,
			newBaseDates: newProjected,
			mappings,
			surplusOldDates: oldProjected.slice(pairCount),
			newScheduleParsed: newParsed,
		};
	}

	const newParsed = parseStoredSchedule(input.newSchedule);
	if (
		!newParsed ||
		!Number.isInteger(input.newSessionsTotal) ||
		input.newSessionsTotal <= 0 ||
		input.newSessionsTotal > MAX_RESCHEDULE_SESSIONS
	) {
		return { ok: false, reason: "invalid-schedule" };
	}

	const newStartISO = parseStartDateStrict(input.newStartDate);
	if (!newStartISO) {
		return { ok: false, reason: "invalid-start-date" };
	}

	const topo = topologicalUnwindShifts(input.existingShifts);
	if (!topo.ok) {
		return { ok: false, reason: "invalid-schedule" };
	}

	const baseDateSet = new Set<string>();
	for (const item of input.existingLessonDates) {
		baseDateSet.add(item.date);
	}
	for (const shift of topo.orderedDesc) {
		baseDateSet.delete(shift.makeupDate);
		baseDateSet.add(shift.originalDate);
	}

	if (baseDateSet.size !== input.newSessionsTotal) {
		return { ok: false, reason: "invalid-schedule" };
	}

	const oldBaseDates = [...baseDateSet].sort((a, b) => a.localeCompare(b));
	const newBaseDates = sortedSkeletonDates(
		newParsed,
		newStartISO,
		input.newSessionsTotal,
	);
	if (!newBaseDates || newBaseDates.length !== oldBaseDates.length) {
		return { ok: false, reason: "invalid-schedule" };
	}

	const mappings: DateMapping[] = [];
	for (let i = 0; i < oldBaseDates.length; i += 1) {
		const oldDate = oldBaseDates[i];
		const newDate = newBaseDates[i];
		if (!oldDate || !newDate) continue;
		mappings.push({
			oldDate,
			newDate,
			newDay: isoToLessonWeekday(newDate),
		});
	}

	return {
		ok: true,
		mode: "materialized",
		unwindShiftsDesc: topo.orderedDesc,
		oldBaseDates,
		newBaseDates,
		mappings,
		surplusOldDates: [],
		newScheduleParsed: newParsed,
	};
}

/** Chia mảng ánh xạ/ngày thành các nhóm nhỏ nằm trong trần bind parameter của D1. */
export function chunkDateMappings<T>(
	items: ReadonlyArray<T>,
	chunkSize: number,
): T[][] {
	if (chunkSize <= 0) {
		throw new RangeError("chunkSize must be a positive integer");
	}
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += chunkSize) {
		chunks.push(items.slice(i, i + chunkSize));
	}
	return chunks;
}
