import type { HolidayMode } from "@teacher-os/api/contracts";
import { planHolidayShift } from "@teacher-os/api/holiday-plan";
import {
	isoToLessonWeekday,
	parseStartDateStrict,
	parseStoredSchedule,
	scheduleDurationMinutes,
	skeletonOf,
} from "@teacher-os/api/skeleton";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { classTable } from "@teacher-os/db/schema/class";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import { lesson } from "@teacher-os/db/schema/lesson";
import {
	holidaySessionCancel,
	holidaySessionShift,
	organizationHoliday,
	organizationHolidayClass,
} from "@teacher-os/db/schema/organization-holiday";
import { sessionPackage } from "@teacher-os/db/schema/session-package";
import { and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../app";
import { isRollbackableConstraintError } from "./holidays";

type GeneratorRow = Omit<typeof lesson.$inferInsert, "id" | "createdAt">;

/** Một cặp buổi gốc → buổi bù đã chuẩn hóa khung giờ của lớp. */
interface EffectiveShift {
	originalDate: string;
	makeupDate: string;
	time: string;
	dur: number;
}

/**
 * Áp các shift theo thứ tự `createdAt ASC` lên tập dòng CỘNG DỒN (I3):
 * buổi bù của kỳ trước có thể là buổi gốc của kỳ sau — mỗi shift biến dòng
 * rơi vào `originalDate` thành `holiday` và thêm dòng `upcoming` tại
 * `makeupDate` cho cùng enrollment.
 */
function applyShiftsToRows(
	rows: GeneratorRow[],
	shifts: EffectiveShift[],
): GeneratorRow[] {
	const acc = rows.map((row) => ({ ...row }));
	for (const shift of shifts) {
		const makeups: GeneratorRow[] = [];
		for (const row of acc) {
			if (row.date !== shift.originalDate) continue;
			row.status = "holiday";
			makeups.push({
				orgId: row.orgId,
				classId: row.classId,
				enrollmentId: row.enrollmentId,
				day: isoToLessonWeekday(shift.makeupDate),
				time: shift.time,
				dur: shift.dur,
				date: shift.makeupDate,
				type: row.type,
				status: "upcoming",
				topic: "",
				zoom: "",
			});
		}
		acc.push(...makeups);
	}
	return acc;
}

/** Kỳ nghỉ có hiệu lực với một lớp: scope org của tổ chức + scope classes
 * có dòng organization_holiday_class trỏ tới lớp. Sắp createdAt ASC, id —
 * kỳ khai báo trước thắng khi chồng ngày (đồng bộ loader route, red-team I2). */
async function loadClassHolidays(
	db: Db,
	orgId: string,
	classId: string,
): Promise<
	Array<{
		id: string;
		name: string;
		fromDate: string;
		toDate: string;
		mode: HolidayMode;
	}>
> {
	const orgHolidays = await db
		.select({
			id: organizationHoliday.id,
			name: organizationHoliday.name,
			fromDate: organizationHoliday.fromDate,
			toDate: organizationHoliday.toDate,
			mode: organizationHoliday.mode,
			createdAt: organizationHoliday.createdAt,
		})
		.from(organizationHoliday)
		.where(
			and(
				eq(organizationHoliday.orgId, orgId),
				eq(organizationHoliday.scope, "org"),
			),
		);
	const classScoped = await db
		.select({
			id: organizationHoliday.id,
			name: organizationHoliday.name,
			fromDate: organizationHoliday.fromDate,
			toDate: organizationHoliday.toDate,
			mode: organizationHoliday.mode,
			createdAt: organizationHoliday.createdAt,
		})
		.from(organizationHoliday)
		.innerJoin(
			organizationHolidayClass,
			eq(organizationHolidayClass.holidayId, organizationHoliday.id),
		)
		.where(
			and(
				eq(organizationHoliday.orgId, orgId),
				eq(organizationHolidayClass.classId, classId),
			),
		);
	return [...orgHolidays, ...classScoped]
		.sort(
			(a, b) =>
				a.createdAt.getTime() - b.createdAt.getTime() ||
				a.id.localeCompare(b.id),
		)
		.map(({ id, name, fromDate, toDate, mode }) => ({
			id,
			name,
			fromDate,
			toDate,
			mode: mode === "cancel" ? "cancel" : "shift",
		}));
}

async function loadClassShifts(
	db: Db,
	orgId: string,
	classId: string,
): Promise<
	Array<{
		id: string;
		originalDate: string;
		makeupDate: string;
	}>
> {
	return db
		.select({
			id: holidaySessionShift.id,
			originalDate: holidaySessionShift.originalDate,
			makeupDate: holidaySessionShift.makeupDate,
		})
		.from(holidaySessionShift)
		.where(
			and(
				eq(holidaySessionShift.orgId, orgId),
				eq(holidaySessionShift.classId, classId),
			),
		)
		.orderBy(holidaySessionShift.createdAt, holidaySessionShift.id);
}

async function loadClassCancels(
	db: Db,
	orgId: string,
	classId: string,
): Promise<
	Array<{
		id: string;
		date: string;
	}>
> {
	return db
		.select({
			id: holidaySessionCancel.id,
			date: holidaySessionCancel.date,
		})
		.from(holidaySessionCancel)
		.where(
			and(
				eq(holidaySessionCancel.orgId, orgId),
				eq(holidaySessionCancel.classId, classId),
			),
		)
		.orderBy(holidaySessionCancel.createdAt, holidaySessionCancel.id);
}

/**
 * Expand a class's structured schedule into `sessionsTotal` upcoming lesson
 * rows for one enrollment (issue #55). Schedule/date parsing lives in
 * @teacher-os/api/skeleton — the same helpers the backfill uses, so a
 * generated row's date always matches what the backfill would have stamped.
 * Fails closed for legacy/invalid schedules (no rows at all, unchanged from
 * before #98). Rows carry weekday plus the occurrence identity `date`
 * (yyyy-mm-dd of the k-th occurrence of that weekday from startDate) so every
 * row is born dated when the class inputs are truthful; an invalid startDate
 * yields date:null rows and the class stays on the frozen legacy path. day is
 * 1-7 with 1 = Monday, the schedule JSON is 0-6 with 0 = Monday, hence the +1
 * — never JS getDay() (0 = Sunday). dur wraps midnight (23:00→00:30 = 90).
 */
export function generateScheduleLessons(input: {
	schedule: string;
	startDate: string;
	sessionsTotal: number;
	orgId: string;
	classId: string;
	enrollmentId: string;
}): Array<Omit<typeof lesson.$inferInsert, "id" | "createdAt">> {
	const parsed = parseStoredSchedule(input.schedule);
	if (!parsed || input.sessionsTotal <= 0) return [];
	const startISO = parseStartDateStrict(input.startDate);
	// Skeleton keys are lesson weekdays 1-7; parsed.days are 0-6 Mon-first.
	const skeleton = startISO
		? skeletonOf(parsed, startISO, input.sessionsTotal)
		: null;
	const dur = scheduleDurationMinutes(parsed);
	const ordinalByDay = new Map<number, number>();
	return Array.from({ length: input.sessionsTotal }, (_, i) => {
		const day = (parsed.days[i % parsed.days.length] ?? 0) + 1;
		let date: string | null = null;
		if (skeleton) {
			const ordinal = ordinalByDay.get(day) ?? 0;
			date = skeleton.get(day)?.[ordinal] ?? null;
			ordinalByDay.set(day, ordinal + 1);
		}
		return {
			orgId: input.orgId,
			classId: input.classId,
			enrollmentId: input.enrollmentId,
			// days is non-empty; ?? only satisfies noUncheckedIndexedAccess.
			day,
			time: parsed.start,
			dur,
			type: "1:1",
			status: "upcoming",
			topic: "",
			zoom: "",
			date,
		};
	});
}

// dd/MM in Vietnam time — Workers run in UTC, so local getters drift a day
// before 07:00 Asia/Ho_Chi_Minh.
function formatDayMonth(date: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: "Asia/Ho_Chi_Minh",
		day: "2-digit",
		month: "2-digit",
	}).format(date);
}

export type ActivateEnrollmentResult =
	| { ok: true }
	| { ok: false; error: "enrollment" | "class" };

/**
 * Kích hoạt enrollment: chuyển 'invited' -> 'active' và sinh sessionPackage +
 * lessons trong một atomic batch. Caller: nút "Kích hoạt" của teacher
 * (kernel.ts) và nút "Tham gia lớp" của student portal (student.ts) — caller
 * tự chịu trách nhiệm scoping (org của teacher / enrollment của chính student).
 *
 * Idempotent qua CAS UPDATE:
 * - Nếu status đã là 'active', trả ok không tạo thêm package/lessons.
 * - Hai request song song: chỉ một request UPDATE thành công (rows affected = 1)
 *   và insert; request còn lại rows affected = 0 -> re-read thấy 'active' -> trả ok.
 * - Bắt unique-violation của session_package_enrollment_uq phòng ngừa race
 *   condition -> trả ok nếu active.
 */
export async function activateEnrollment(
	db: Db,
	orgId: string,
	enrollmentId: string,
): Promise<ActivateEnrollmentResult> {
	// Re-read sau race: request đồng thời khác có thể đã kích hoạt enrollment.
	async function isAlreadyActive(): Promise<boolean> {
		const [row] = await db
			.select({ status: enrollment.status })
			.from(enrollment)
			.where(and(eq(enrollment.id, enrollmentId), eq(enrollment.orgId, orgId)));
		return row?.status === "active";
	}

	// Pre-read: kiểm tra tồn tại và org-scoping
	const [existingEnrollment] = await db
		.select({
			id: enrollment.id,
			classId: enrollment.classId,
			studentId: enrollment.studentId,
			status: enrollment.status,
		})
		.from(enrollment)
		.where(and(eq(enrollment.id, enrollmentId), eq(enrollment.orgId, orgId)));
	if (!existingEnrollment) {
		return { ok: false, error: "enrollment" };
	}
	if (existingEnrollment.status === "active") {
		return { ok: true };
	}

	const [cls] = await db
		.select({
			id: classTable.id,
			name: classTable.name,
			schedule: classTable.schedule,
			sessionsTotal: classTable.sessionsTotal,
			startDate: classTable.startDate,
			mode: classTable.mode,
			tuitionFee: classTable.tuitionFee,
		})
		.from(classTable)
		.where(
			and(
				eq(classTable.id, existingEnrollment.classId),
				eq(classTable.orgId, orgId),
			),
		);
	if (!cls) {
		return { ok: false, error: "class" };
	}

	// CAS update: chỉ flip nếu status vẫn là 'invited'. Không bọc try-catch
	// nuốt lỗi: sau khi CAS commit, mọi lỗi batch là lỗi thật phải ném ra —
	// `isAlreadyActive()` sẽ luôn true ở điểm này và không được dùng để trả
	// `{ ok: true }` ảo khi package/lesson chưa được ghi.
	const updated = await db
		.update(enrollment)
		.set({ status: "active" })
		.where(
			and(
				eq(enrollment.id, enrollmentId),
				eq(enrollment.orgId, orgId),
				eq(enrollment.status, "invited"),
			),
		)
		.returning({ id: enrollment.id });

	if (updated.length === 0) {
		// Đã bị kích hoạt bởi request đồng thời khác
		if (await isAlreadyActive()) {
			return { ok: true };
		}
		return { ok: false, error: "enrollment" };
	}

	const packageValues = {
		orgId,
		studentId: existingEnrollment.studentId,
		total: cls.sessionsTotal,
		price: cls.tuitionFee ?? 0,
		mode: cls.mode,
		start: formatDayMonth(new Date()),
		expiry: "",
		status: "active",
		enrollmentId,
	};

	const generated = generateScheduleLessons({
		schedule: cls.schedule,
		startDate: cls.startDate,
		sessionsTotal: cls.sessionsTotal,
		orgId,
		classId: cls.id,
		enrollmentId,
	});
	const parsedSchedule = parseStoredSchedule(cls.schedule);

	// D6 (I2b/I3/I6): dựng batch từ state đã đọc (shifts + rows đã áp
	// shift); mọi insert lesson mang guard CASE đếm `holiday_session_shift`
	// — một apply commit giữa lúc đọc và ghi làm guard lệch → batch fail
	// (NOT NULL) → đọc lại và dựng lại, tối đa 3 lần.
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		const [shifts, cancels, existingClassLessons] = await Promise.all([
			loadClassShifts(db, orgId, cls.id),
			loadClassCancels(db, orgId, cls.id),
			db
				.select({ id: lesson.id })
				.from(lesson)
				.where(and(eq(lesson.orgId, orgId), eq(lesson.classId, cls.id)))
				.limit(1),
		]);
		let rows: GeneratorRow[] = generated.map((row) => ({ ...row }));
		const newShifts: Array<{
			holidayId: string;
			originalDate: string;
			makeupDate: string;
		}> = [];
		const newCancels: Array<{
			holidayId: string;
			date: string;
		}> = [];

		if (parsedSchedule && rows.length > 0) {
			const effective: EffectiveShift[] = shifts.map((shift) => ({
				originalDate: shift.originalDate,
				makeupDate: shift.makeupDate,
				time: parsedSchedule.start,
				dur: scheduleDurationMinutes(parsedSchedule),
			}));
			rows = applyShiftsToRows(rows, effective);

			// TOS-13 D7: dòng sinh ra rơi vào ngày trong `holiday_session_cancel`
			// của lớp → `cancelled` (không sinh buổi bù).
			const cancelDates = new Set(cancels.map((c) => c.date));
			for (const row of rows) {
				if (
					row.date !== null &&
					row.date !== undefined &&
					cancelDates.has(row.date) &&
					row.status === "upcoming"
				) {
					row.status = "cancelled";
				}
			}

			// I6 (+ TOS-13): lớp chưa có dòng shift/cancel nào nhưng có kỳ nghỉ
			// hiệu lực (chưa từng có học viên lúc apply, hoặc lớp tạo sau) — chạy
			// planner trên tập dòng vừa sinh và tự sinh shift/cancel trong batch.
			if (
				shifts.length === 0 &&
				cancels.length === 0 &&
				existingClassLessons.length === 0
			) {
				const holidays = await loadClassHolidays(db, orgId, cls.id);
				if (holidays.length > 0) {
					// date → tên kỳ nghỉ; `holidays` đã sắp createdAt ASC nên kỳ
					// khai báo trước thắng khi chồng ngày (đồng bộ loader route).
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
					for (const holiday of holidays) {
						const planned = planHolidayShift({
							range: {
								fromDate: holiday.fromDate,
								toDate: holiday.toDate,
							},
							classes: [
								{
									id: cls.id,
									name: cls.name ?? cls.id,
									schedule: cls.schedule,
									lessons: rows.map((row) => ({
										date: row.date ?? null,
										status: row.status ?? "upcoming",
										enrollmentId: row.enrollmentId,
									})),
								},
							],
							existingHolidayDates: new Map([[cls.id, datesByName]]),
							todayISO: vietnamTodayISO(),
							mode: holiday.mode,
						});
						for (const shift of planned.shifts) {
							newShifts.push({
								holidayId: holiday.id,
								originalDate: shift.originalDate,
								makeupDate: shift.makeupDate,
							});
							rows = applyShiftsToRows(rows, [
								{
									originalDate: shift.originalDate,
									makeupDate: shift.makeupDate,
									time: parsedSchedule.start,
									dur: scheduleDurationMinutes(parsedSchedule),
								},
							]);
						}
						for (const cancel of planned.cancellations) {
							newCancels.push({
								holidayId: holiday.id,
								date: cancel.date,
							});
							for (const row of rows) {
								if (row.date === cancel.date && row.status === "upcoming") {
									row.status = "cancelled";
								}
							}
						}
					}
				}
			}
		}

		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db.insert(sessionPackage).values({
				id: crypto.randomUUID(),
				...packageValues,
			}),
		];
		for (const shift of newShifts) {
			statements.push(
				db.insert(holidaySessionShift).values({
					id: crypto.randomUUID(),
					orgId,
					classId: cls.id,
					...shift,
				}),
			);
		}
		for (const cancel of newCancels) {
			statements.push(
				db.insert(holidaySessionCancel).values({
					id: crypto.randomUUID(),
					orgId,
					classId: cls.id,
					...cancel,
				}),
			);
		}
		const referencedHolidayIds = [
			...new Set([
				...newShifts.map((s) => s.holidayId),
				...newCancels.map((c) => c.holidayId),
			]),
		];
		const holidayExistsGuard =
			referencedHolidayIds.length > 0
				? sql` AND (SELECT count(*) FROM ${organizationHoliday} WHERE ${organizationHoliday.orgId} = ${orgId} AND ${organizationHoliday.id} IN (${sql.join(
						referencedHolidayIds.map((id) => sql`${id}`),
						sql`, `,
					)})) = ${referencedHolidayIds.length}`
				: sql``;
		for (const row of rows) {
			statements.push(
				db.insert(lesson).values({
					id: crypto.randomUUID(),
					...row,
					/**
					 * Guard chống lệch đọc (I2b + TOS-13): count shift và cancel
					 * trong DB phải vẫn bằng số đã đọc CỘNG với số batch này tự sinh,
					 * và các kỳ nghỉ vừa tham chiếu vẫn còn tồn tại.
					 */
					status: sql`CASE WHEN (SELECT count(*) FROM ${holidaySessionShift} WHERE ${holidaySessionShift.classId} = ${cls.id}) = ${shifts.length + newShifts.length} AND (SELECT count(*) FROM ${holidaySessionCancel} WHERE ${holidaySessionCancel.classId} = ${cls.id}) = ${cancels.length + newCancels.length}${holidayExistsGuard} THEN ${row.status} ELSE NULL END`,
				}),
			);
		}
		try {
			await db.batch(statements);
			return { ok: true };
		} catch (err: unknown) {
			if (attempt >= 3 || !isRollbackableConstraintError(err)) {
				throw err;
			}
			// Vòng sau đọc lại shifts/rows và dựng batch mới.
		}
	}
	throw new Error("activateEnrollment: shift guard retry exhausted");
}
