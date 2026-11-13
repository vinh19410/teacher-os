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
import { classSession } from "@teacher-os/db/schema/class-session";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import { lesson } from "@teacher-os/db/schema/lesson";
import { lessonMaterial } from "@teacher-os/db/schema/material";
import {
	holidaySessionCancel,
	holidaySessionShift,
	organizationHoliday,
	organizationHolidayClass,
} from "@teacher-os/db/schema/organization-holiday";
import { sessionPackage } from "@teacher-os/db/schema/session-package";
import { syllabus } from "@teacher-os/db/schema/syllabus";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../app";
import { isManualClass } from "../lib/class-mode";
import { backfillStudyPackTargetsForStudent } from "../lib/study-pack-assign";
import { findClassCurriculum } from "../lib/syllabus-curriculum";
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
	const slots: Array<{ day: number; date: string | null }> = skeleton
		? [...skeleton]
				.flatMap(([day, dates]) => dates.map((date) => ({ day, date })))
				.sort((a, b) => a.date.localeCompare(b.date))
		: Array.from({ length: input.sessionsTotal }, (_, i) => ({
				// days is non-empty; ?? only satisfies noUncheckedIndexedAccess.
				day: (parsed.days[i % parsed.days.length] ?? 0) + 1,
				date: null,
			}));
	return slots.map(({ day, date }) => {
		return {
			orgId: input.orgId,
			classId: input.classId,
			enrollmentId: input.enrollmentId,
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

export type MaterializeScheduleResult =
	| { ok: true }
	| { ok: false; error: "class" };

export type ActivateEnrollmentResult =
	| { ok: true }
	| { ok: false; error: "enrollment" | "class" };

/**
 * Sinh hoặc bù lịch học + gói buổi cho một enrollment đang ở trạng thái `active`
 * (dùng chung cho `activateEnrollment` và `backfillStuckEnrollments` khi lớp
 * chuyển `manual -> auto` ở `curriculum/import`, issue #670).
 *
 * - Đọc tươi `classTable`, `findClassCurriculum` và `isManualClass` bên trong
 *   vòng retry `attempt = 1..3` để khóa kín cửa sổ TOCTOU sau CAS.
 * - Statement 0 guard trên `enrollment.status` kiểm tra nguyên tử: enrollment
 *   vẫn `active`, chưa có dòng `lesson` nào, và trạng thái lớp (`scheduling_mode`,
 *   `sessions_total`, sự tồn tại bản sao `syllabus`, số dòng `class_session` nếu
 *   manual) không thay đổi kể từ lúc đọc.
 */
export async function materializeScheduleForEnrollment(
	db: Db,
	input: {
		orgId: string;
		enrollmentId: string;
		studentId: string;
		classId: string;
		mode: "activate" | "backfill";
	},
): Promise<MaterializeScheduleResult> {
	const { orgId, enrollmentId, studentId, classId } = input;

	for (let attempt = 1; attempt <= 3; attempt += 1) {
		const [cls] = await db
			.select({
				id: classTable.id,
				name: classTable.name,
				schedule: classTable.schedule,
				sessionsTotal: classTable.sessionsTotal,
				startDate: classTable.startDate,
				mode: classTable.mode,
				tuitionFee: classTable.tuitionFee,
				syllabusId: classTable.syllabusId,
				schedulingMode: classTable.schedulingMode,
			})
			.from(classTable)
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)));
		if (!cls) {
			return { ok: false, error: "class" };
		}

		const hasCurriculum = Boolean(await findClassCurriculum(db, cls.id, orgId));
		const isManual = await isManualClass(
			db,
			orgId,
			cls.id,
			cls.syllabusId,
			cls.schedulingMode,
		);

		if (input.mode === "backfill" && (isManual || cls.sessionsTotal <= 0)) {
			return { ok: true };
		}

		const classSessionRows = isManual
			? await db
					.select()
					.from(classSession)
					.where(
						and(
							eq(classSession.orgId, orgId),
							eq(classSession.classId, cls.id),
						),
					)
					.orderBy(classSession.date)
			: [];

		const packageValues = {
			orgId,
			studentId,
			total: isManual ? classSessionRows.length : cls.sessionsTotal,
			price: cls.tuitionFee ?? 0,
			mode: cls.mode,
			start: formatDayMonth(new Date()),
			expiry: "",
			status: "active",
			enrollmentId,
		};

		const generated: GeneratorRow[] = isManual
			? classSessionRows.map((cs) => ({
					orgId,
					classId: cls.id,
					enrollmentId,
					day: isoToLessonWeekday(cs.date),
					time: cs.time,
					dur: cs.dur,
					date: cs.date,
					type: "1:1",
					status: "upcoming" as const,
					topic: cs.topic,
					zoom: cs.zoom,
				}))
			: generateScheduleLessons({
					schedule: cls.schedule,
					startDate: cls.startDate,
					sessionsTotal: cls.sessionsTotal,
					orgId,
					classId: cls.id,
					enrollmentId,
				});
		const parsedSchedule = parseStoredSchedule(cls.schedule);
		let scheduleShifted = false;

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
			scheduleShifted = true;

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

			if (
				shifts.length === 0 &&
				cancels.length === 0 &&
				existingClassLessons.length === 0
			) {
				const holidays = await loadClassHolidays(db, orgId, cls.id);
				if (holidays.length > 0) {
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

		const syllabusStateSql = hasCurriculum
			? sql`EXISTS (SELECT 1 FROM ${syllabus} WHERE ${syllabus.classId} = ${cls.id} AND ${syllabus.orgId} = ${orgId})`
			: sql`NOT EXISTS (SELECT 1 FROM ${syllabus} WHERE ${syllabus.classId} = ${cls.id} AND ${syllabus.orgId} = ${orgId})`;
		const manualCountGuardSql = isManual
			? sql` AND (SELECT count(*) FROM ${classSession} WHERE ${classSession.classId} = ${cls.id} AND ${classSession.orgId} = ${orgId}) = ${classSessionRows.length}`
			: sql``;

		// Statement 0: khóa nguyên tử trạng thái enrollment + 0 lesson + trạng thái lớp
		// trước mọi câu INSERT/UPSERT tiếp theo trong cùng batch.
		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db
				.update(enrollment)
				.set({
					status: sql`CASE WHEN ${enrollment.status} = 'active' AND NOT EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.enrollmentId} = ${enrollmentId} AND ${lesson.orgId} = ${orgId}) AND EXISTS (SELECT 1 FROM ${classTable} WHERE ${classTable.id} = ${cls.id} AND ${classTable.orgId} = ${orgId} AND ${classTable.schedulingMode} = ${cls.schedulingMode} AND ${classTable.sessionsTotal} = ${cls.sessionsTotal} AND ${classTable.schedule} = ${cls.schedule} AND ${classTable.startDate} = ${cls.startDate}) AND ${syllabusStateSql}${manualCountGuardSql} THEN 'active' ELSE NULL END`,
				})
				.where(
					and(eq(enrollment.id, enrollmentId), eq(enrollment.orgId, orgId)),
				),
			input.mode === "backfill"
				? db
						.insert(sessionPackage)
						.values({
							id: crypto.randomUUID(),
							...packageValues,
						})
						.onConflictDoUpdate({
							target: sessionPackage.enrollmentId,
							set: {
								total: sql`CASE WHEN ${sessionPackage.orgId} = ${orgId} THEN ${packageValues.total} ELSE NULL END`,
							},
						})
				: db.insert(sessionPackage).values({
						id: crypto.randomUUID(),
						...packageValues,
					}),
		];

		const materialMoveStatements = (shift: {
			originalDate: string;
			makeupDate: string;
		}): [BatchItem<"sqlite">, BatchItem<"sqlite">] => [
			db.delete(lessonMaterial).where(
				and(
					eq(lessonMaterial.orgId, orgId),
					eq(lessonMaterial.classId, cls.id),
					eq(lessonMaterial.date, shift.makeupDate),
					inArray(
						lessonMaterial.materialId,
						db
							.select({ mid: lessonMaterial.materialId })
							.from(lessonMaterial)
							.where(
								and(
									eq(lessonMaterial.orgId, orgId),
									eq(lessonMaterial.classId, cls.id),
									eq(lessonMaterial.date, shift.originalDate),
								),
							),
					),
				),
			),
			db
				.update(lessonMaterial)
				.set({ date: shift.makeupDate })
				.where(
					and(
						eq(lessonMaterial.orgId, orgId),
						eq(lessonMaterial.classId, cls.id),
						eq(lessonMaterial.date, shift.originalDate),
					),
				),
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
			statements.push(...materialMoveStatements(shift));
		}
		if (scheduleShifted) {
			for (const shift of shifts) {
				statements.push(...materialMoveStatements(shift));
			}
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
					status: sql`CASE WHEN (SELECT count(*) FROM ${holidaySessionShift} WHERE ${holidaySessionShift.orgId} = ${orgId} AND ${holidaySessionShift.classId} = ${cls.id}) = ${shifts.length + newShifts.length} AND (SELECT count(*) FROM ${holidaySessionCancel} WHERE ${holidaySessionCancel.orgId} = ${orgId} AND ${holidaySessionCancel.classId} = ${cls.id}) = ${cancels.length + newCancels.length}${holidayExistsGuard} THEN ${row.status} ELSE NULL END`,
				}),
			);
		}
		try {
			await db.batch(statements);
			return { ok: true };
		} catch (err: unknown) {
			if (!isRollbackableConstraintError(err)) {
				throw err;
			}
			const [enrAfter, existingLesson, existingPkg] = await Promise.all([
				db
					.select({ status: enrollment.status })
					.from(enrollment)
					.where(
						and(eq(enrollment.id, enrollmentId), eq(enrollment.orgId, orgId)),
					),
				db
					.select({ id: lesson.id })
					.from(lesson)
					.where(
						and(eq(lesson.orgId, orgId), eq(lesson.enrollmentId, enrollmentId)),
					)
					.limit(1),
				db
					.select({ total: sessionPackage.total })
					.from(sessionPackage)
					.where(
						and(
							eq(sessionPackage.orgId, orgId),
							eq(sessionPackage.enrollmentId, enrollmentId),
						),
					)
					.limit(1),
			]);
			if (enrAfter[0]?.status !== "active") {
				return { ok: true };
			}
			if (
				existingLesson.length > 0 ||
				(input.mode === "activate" && (existingPkg[0]?.total ?? 0) > 0)
			) {
				return { ok: true };
			}
			if (attempt >= 3) {
				throw err;
			}
		}
	}
	throw new Error("materializeScheduleForEnrollment: guard retry exhausted");
}

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
		await backfillStudyPackTargetsForStudent(
			db,
			orgId,
			existingEnrollment.classId,
			existingEnrollment.studentId,
		);
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
			syllabusId: classTable.syllabusId,
			schedulingMode: classTable.schedulingMode,
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
			await backfillStudyPackTargetsForStudent(
				db,
				orgId,
				existingEnrollment.classId,
				existingEnrollment.studentId,
			);
			return { ok: true };
		}
		return { ok: false, error: "enrollment" };
	}

	const materialized = await materializeScheduleForEnrollment(db, {
		orgId,
		enrollmentId,
		studentId: existingEnrollment.studentId,
		classId: existingEnrollment.classId,
		mode: "activate",
	});
	if (!materialized.ok) {
		return materialized;
	}
	await backfillStudyPackTargetsForStudent(
		db,
		orgId,
		existingEnrollment.classId,
		existingEnrollment.studentId,
	);
	return { ok: true };
}
