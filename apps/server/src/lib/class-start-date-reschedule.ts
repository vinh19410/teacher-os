import {
	chunkDateMappings,
	DATE_ONLY_REMAP_CHUNK,
	evaluateClassStartDateEditability,
	LESSON_REMAP_CHUNK,
	planUnstartedStartDateShift,
	SHIFT_DATE_PREFIX,
	type StartDateLockReason,
} from "@teacher-os/api/class-start-date";
import { planHolidayShift } from "@teacher-os/api/holiday-plan";
import {
	isoToLessonWeekday,
	scheduleDurationMinutes,
} from "@teacher-os/api/skeleton";
import { addDaysISO } from "@teacher-os/api/vietnam-date";
import { classTable } from "@teacher-os/db/schema/class";
import { classAssignment } from "@teacher-os/db/schema/class-assignment";
import { classSession } from "@teacher-os/db/schema/class-session";
import { classSessionMeeting } from "@teacher-os/db/schema/class-session-meeting";
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
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../app";
import {
	loadClassCancels,
	loadClassHolidays,
	loadClassShifts,
} from "../routes/enrollment-activation";
import { isRollbackableConstraintError } from "../routes/holidays";
import { isManualClass } from "./class-mode";
import { findClassCurriculum } from "./syllabus-curriculum";
import {
	hasLiveR2Recording,
	liveR2RecordingSql,
	nonLiveR2RecordingSql,
	type ZoomRescheduleDeletedMeeting,
	type ZoomRescheduleMovedMeeting,
	type ZoomRescheduleSyncPlan,
} from "./zoom/session-zoom-service";

const SHIFT_PREFIX_LEN = SHIFT_DATE_PREFIX.length;
const SHIFT_SUBSTR_START = SHIFT_PREFIX_LEN + 1;
const MAX_BATCH_STATEMENTS = 500;
const DATE_SET_GUARD_CHUNK = 40;

export interface ClassStartDateUpdatedRow {
	id: string;
	name: string;
	level: string;
	schedule: string;
	sessionsTotal: number;
	startDate: string;
	mode: string;
	openingConfirmedAt: Date | null;
	openingNote: string;
	openingAnnouncementVersion: number;
}

export interface ApplyClassStartDateChangeInput {
	db: Db;
	orgId: string;
	classId: string;
	nextStartDate: string;
	todayVN: string;
	now?: Date;
	/** Các cột cập nhật bổ sung trên `class` trong cùng Statement 0 CAS. */
	classFieldPatch: Partial<typeof classTable.$inferInsert>;
	/** Giá trị schedule/sessionsTotal sau ghi (khi đổi đồng thời trên lớp 0 buổi). */
	nextSchedule?: string;
	nextSessionsTotal?: number;
	/** Yêu cầu lớp ở trạng thái `active` (true cho confirm-opening, false cho PATCH). */
	requireActiveStatus?: boolean;
	/** Yêu cầu phiên bản thông báo khai giảng khớp CAS (cho confirm-opening). */
	expectedOpeningVersion?: number;
	/** Khi PATCH đồng thời sửa `schedule` hoặc `sessionsTotal`, buộc lớp phải 0 buổi thực tế. */
	requireNoRealSessionsForOtherFields?: boolean;
	/** Đồng bộ `session_package.total` khi đổi `sessionsTotal` trên lớp 0 buổi. */
	syncPackageTotal?: number;
	/** Ràng buộc bổ sung ở caller cho PATCH (schedulingMode / syllabusId đọc trước). */
	expectedSchedulingMode?: string;
	expectedSyllabusId?: string | null;
}

export type ApplyClassStartDateResult =
	| {
			ok: true;
			updatedRow: ClassStartDateUpdatedRow;
			zoomSyncPlan: ZoomRescheduleSyncPlan;
	  }
	| {
			ok: false;
			error:
				| "not-found"
				| "class-paused"
				| "opening-version-conflict"
				| "schedule-locked"
				| "start-date-locked"
				| "empty-start-date"
				| "holiday-scan-cap"
				| "recording-locked"
				| "conflict";
			reason?: StartDateLockReason;
	  };

interface PlannedNewShift {
	holidayId: string;
	originalDate: string;
	makeupDate: string;
	weekday: number;
	time: string;
	dur: number;
}

interface PlannedNewCancel {
	holidayId: string;
	date: string;
}

const EMPTY_ZOOM_PLAN: ZoomRescheduleSyncPlan = {
	movedMeetings: [],
	deletedZoomMeetingIds: [],
	deletedRecordingKeys: [],
};

function buildMaterialMovePair(
	db: Db,
	orgId: string,
	classId: string,
	fromDate: string,
	toDate: string,
): [BatchItem<"sqlite">, BatchItem<"sqlite">] {
	return [
		db.delete(lessonMaterial).where(
			and(
				eq(lessonMaterial.orgId, orgId),
				eq(lessonMaterial.classId, classId),
				eq(lessonMaterial.date, toDate),
				inArray(
					lessonMaterial.materialId,
					db
						.select({ mid: lessonMaterial.materialId })
						.from(lessonMaterial)
						.where(
							and(
								eq(lessonMaterial.orgId, orgId),
								eq(lessonMaterial.classId, classId),
								eq(lessonMaterial.date, fromDate),
							),
						),
				),
			),
		),
		db
			.update(lessonMaterial)
			.set({ date: toDate })
			.where(
				and(
					eq(lessonMaterial.orgId, orgId),
					eq(lessonMaterial.classId, classId),
					eq(lessonMaterial.date, fromDate),
				),
			),
	];
}

function buildMeetingMovePair(
	db: Db,
	orgId: string,
	classId: string,
	fromDate: string,
	toDate: string,
	nowMs: number,
): [BatchItem<"sqlite">, BatchItem<"sqlite">] {
	return [
		db
			.delete(classSessionMeeting)
			.where(
				and(
					eq(classSessionMeeting.orgId, orgId),
					eq(classSessionMeeting.classId, classId),
					eq(classSessionMeeting.date, toDate),
					nonLiveR2RecordingSql(nowMs),
					sql`EXISTS (SELECT 1 FROM ${classSessionMeeting} src WHERE src.org_id = ${orgId} AND src.class_id = ${classId} AND src.date = ${fromDate})`,
				),
			),
		db
			.update(classSessionMeeting)
			.set({ date: toDate })
			.where(
				and(
					eq(classSessionMeeting.orgId, orgId),
					eq(classSessionMeeting.classId, classId),
					eq(classSessionMeeting.date, fromDate),
				),
			),
	];
}

function computeMaterializedHolidayChanges(params: {
	classId: string;
	className: string;
	effectiveNewSchedule: string;
	newScheduleParsed: { days: number[]; start: string; end: string };
	newBaseDates: ReadonlyArray<string>;
	applicableHolidays: ReadonlyArray<
		Awaited<ReturnType<typeof loadClassHolidays>>[number]
	>;
	todayVN: string;
}):
	| { ok: true; newShifts: PlannedNewShift[]; newCancels: PlannedNewCancel[] }
	| { ok: false; error: "holiday-scan-cap" } {
	const newShifts: PlannedNewShift[] = [];
	const newCancels: PlannedNewCancel[] = [];
	const dur = scheduleDurationMinutes(params.newScheduleParsed);
	const datesByName = new Map<string, string>();
	for (const holiday of params.applicableHolidays) {
		for (let d = holiday.fromDate; d <= holiday.toDate; d = addDaysISO(d, 1)) {
			if (!datesByName.has(d)) datesByName.set(d, holiday.name);
		}
	}
	let virtualRows: Array<{
		date: string | null;
		status: string;
		enrollmentId: string;
	}> = params.newBaseDates.map((date) => ({
		date,
		status: "upcoming",
		enrollmentId: "__virtual__",
	}));

	try {
		for (const holiday of params.applicableHolidays) {
			const planned = planHolidayShift({
				range: {
					fromDate: holiday.fromDate,
					toDate: holiday.toDate,
				},
				classes: [
					{
						id: params.classId,
						name: params.className,
						schedule: params.effectiveNewSchedule,
						lessons: virtualRows,
					},
				],
				existingHolidayDates: new Map([[params.classId, datesByName]]),
				todayISO: params.todayVN,
				mode: holiday.mode,
			});
			for (const shift of planned.shifts) {
				newShifts.push({
					holidayId: holiday.id,
					originalDate: shift.originalDate,
					makeupDate: shift.makeupDate,
					weekday: isoToLessonWeekday(shift.makeupDate),
					time: params.newScheduleParsed.start,
					dur,
				});
				const nextVirtual = virtualRows.map((row) => ({ ...row }));
				const makeups: typeof virtualRows = [];
				for (const row of nextVirtual) {
					if (row.date !== shift.originalDate) continue;
					row.status = "holiday";
					makeups.push({
						date: shift.makeupDate,
						status: "upcoming",
						enrollmentId: row.enrollmentId,
					});
				}
				virtualRows = [...nextVirtual, ...makeups];
			}
			for (const cancel of planned.cancellations) {
				newCancels.push({
					holidayId: holiday.id,
					date: cancel.date,
				});
				for (const row of virtualRows) {
					if (row.date === cancel.date && row.status === "upcoming") {
						row.status = "cancelled";
					}
				}
			}
		}
	} catch {
		return { ok: false, error: "holiday-scan-cap" };
	}

	return { ok: true, newShifts, newCancels };
}

function buildSyncPackageStatement(
	db: Db,
	orgId: string,
	classId: string,
	nextSessionsTotal: number,
): BatchItem<"sqlite"> {
	return db
		.update(sessionPackage)
		.set({ total: nextSessionsTotal })
		.where(
			and(
				eq(sessionPackage.orgId, orgId),
				inArray(
					sessionPackage.enrollmentId,
					db
						.select({ id: enrollment.id })
						.from(enrollment)
						.where(
							and(
								eq(enrollment.orgId, orgId),
								eq(enrollment.classId, classId),
								ne(enrollment.status, "removed"),
							),
						),
				),
				sql`EXISTS (
					SELECT 1 FROM ${classTable}
					WHERE ${classTable.id} = ${classId}
						AND ${classTable.orgId} = ${orgId}
						AND ${classTable.sessionsTotal} = ${nextSessionsTotal}
						AND NOT EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.classId} = ${classId} AND ${lesson.orgId} = ${orgId})
						AND NOT EXISTS (SELECT 1 FROM ${classSession} WHERE ${classSession.classId} = ${classId} AND ${classSession.orgId} = ${orgId})
				)`,
			),
		);
}

/**
 * Thay đổi ngày khai giảng (`startDate`) nguyên tử cho lớp chưa bắt đầu — dùng chung
 * cho `PATCH /api/classes/:id` và `POST /api/classes/:id/confirm-opening`.
 *
 * Bảo vệ bằng CAS ở Statement 0 (+ Statement 0b cho tập ngày `lesson.date`) và vòng
 * retry tối đa 3 lần khi gặp race tạm thời với `activateEnrollment`, `holidays`,
 * `moveDate`, hoặc `lesson_material`.
 */
export async function applyClassStartDateChange(
	input: ApplyClassStartDateChangeInput,
): Promise<ApplyClassStartDateResult> {
	const { db, orgId, classId, nextStartDate, todayVN } = input;
	const now = input.now ?? new Date();
	const nowMs = now.getTime();

	for (let attempt = 1; attempt <= 3; attempt += 1) {
		const [cls] = await db
			.select({
				id: classTable.id,
				name: classTable.name,
				level: classTable.level,
				schedule: classTable.schedule,
				sessionsTotal: classTable.sessionsTotal,
				startDate: classTable.startDate,
				syllabusId: classTable.syllabusId,
				mode: classTable.mode,
				tuitionFee: classTable.tuitionFee,
				schedulingMode: classTable.schedulingMode,
				status: classTable.status,
				openingConfirmedAt: classTable.openingConfirmedAt,
				openingNote: classTable.openingNote,
				openingAnnouncementVersion: classTable.openingAnnouncementVersion,
			})
			.from(classTable)
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)))
			.limit(1);

		if (!cls) {
			return { ok: false, error: "not-found" };
		}
		if (input.requireActiveStatus && cls.status !== "active") {
			return { ok: false, error: "class-paused" };
		}
		if (
			input.expectedOpeningVersion !== undefined &&
			(cls.openingAnnouncementVersion ?? 0) !== input.expectedOpeningVersion
		) {
			return { ok: false, error: "opening-version-conflict" };
		}
		if (
			input.expectedSchedulingMode !== undefined &&
			cls.schedulingMode !== input.expectedSchedulingMode
		) {
			return { ok: false, error: "conflict" };
		}
		if (
			input.expectedSyllabusId !== undefined &&
			cls.syllabusId !== input.expectedSyllabusId
		) {
			return { ok: false, error: "conflict" };
		}

		const [
			curriculumCopy,
			lessonRows,
			csCountRows,
			shifts,
			cancels,
			allHolidays,
			meetingRows,
			materialCountRows,
			sessionAssignmentCountRows,
		] = await Promise.all([
			findClassCurriculum(db, classId, orgId),
			db
				.select({
					date: lesson.date,
					status: lesson.status,
					enrollmentId: lesson.enrollmentId,
					attendance: lesson.attendance,
					attendanceNote: lesson.attendanceNote,
					time: lesson.time,
					dur: lesson.dur,
					topic: lesson.topic,
					zoom: lesson.zoom,
				})
				.from(lesson)
				.where(and(eq(lesson.orgId, orgId), eq(lesson.classId, classId))),
			db
				.select({ count: sql<number>`count(*)` })
				.from(classSession)
				.where(
					and(eq(classSession.orgId, orgId), eq(classSession.classId, classId)),
				),
			loadClassShifts(db, orgId, classId),
			loadClassCancels(db, orgId, classId),
			loadClassHolidays(db, orgId, classId),
			db
				.select({
					id: classSessionMeeting.id,
					date: classSessionMeeting.date,
					joinUrl: classSessionMeeting.joinUrl,
					zoomMeetingId: classSessionMeeting.zoomMeetingId,
					recordingUrl: classSessionMeeting.recordingUrl,
					recordingStorageKey: classSessionMeeting.recordingStorageKey,
					recordingExpiresAt: classSessionMeeting.recordingExpiresAt,
				})
				.from(classSessionMeeting)
				.where(
					and(
						eq(classSessionMeeting.orgId, orgId),
						eq(classSessionMeeting.classId, classId),
					),
				),
			db
				.select({ count: sql<number>`count(*)` })
				.from(lessonMaterial)
				.where(
					and(
						eq(lessonMaterial.orgId, orgId),
						eq(lessonMaterial.classId, classId),
					),
				),
			db
				.select({ count: sql<number>`count(*)` })
				.from(classAssignment)
				.where(
					and(
						eq(classAssignment.orgId, orgId),
						eq(classAssignment.classId, classId),
						isNotNull(classAssignment.sessionDate),
					),
				),
		]);

		const hasCurriculum = Boolean(curriculumCopy);
		const classSessionCount = Number(csCountRows[0]?.count ?? 0);
		const materialCount = Number(materialCountRows[0]?.count ?? 0);
		const sessionLinkedAssignmentCount = Number(
			sessionAssignmentCountRows[0]?.count ?? 0,
		);
		const isManual =
			!hasCurriculum &&
			(cls.schedulingMode === "manual" || classSessionCount > 0);
		const hasRealSessions = lessonRows.length > 0 || classSessionCount > 0;

		if (input.requireNoRealSessionsForOtherFields && hasRealSessions) {
			return { ok: false, error: "schedule-locked" };
		}

		const editability = evaluateClassStartDateEditability({
			schedule: cls.schedule,
			sessionsTotal: cls.sessionsTotal,
			isManual,
			lessons: lessonRows.map((row) => ({
				date: row.date,
				status: row.status,
				enrollmentKey: row.enrollmentId,
				attendance: row.attendance,
				attendanceNote: row.attendanceNote,
			})),
			holidayCancelDates: cancels.map((c) => c.date),
			holidayShifts: shifts,
		});
		if (!editability.editable) {
			return {
				ok: false,
				error: "start-date-locked",
				reason: editability.reason,
			};
		}

		if (lessonRows.length > 0 && !isManual && nextStartDate === "") {
			return { ok: false, error: "empty-start-date" };
		}

		// Lớp tạm dừng chỉ tái đánh giá các kỳ nghỉ đã từng gắn lên lớp trước đó,
		// không tự áp mới kỳ nghỉ `scope = 'org'` tạo trong thời gian lớp đang paused.
		const applicableHolidays =
			cls.status === "active"
				? allHolidays
				: (() => {
						const existingHolidayIds = new Set([
							...shifts.map((s) => s.holidayId),
							...cancels.map((c) => c.holidayId),
						]);
						return allHolidays.filter((h) => existingHolidayIds.has(h.id));
					})();

		const syllabusStateSql = hasCurriculum
			? sql`EXISTS (SELECT 1 FROM ${syllabus} WHERE ${syllabus.classId} = ${classId} AND ${syllabus.orgId} = ${orgId})`
			: sql`NOT EXISTS (SELECT 1 FROM ${syllabus} WHERE ${syllabus.classId} = ${classId} AND ${syllabus.orgId} = ${orgId})`;

		const undatedCheckSql =
			!isManual && lessonRows.length > 0
				? sql` OR ${lesson.date} IS NULL OR trim(${lesson.date}) = ''`
				: sql``;

		const noStartedLessonsSql = sql`NOT EXISTS (
			SELECT 1 FROM ${lesson}
			WHERE ${lesson.orgId} = ${orgId}
				AND ${lesson.classId} = ${classId}
				AND (
					${lesson.status} IN ('completed', 'absent')
					OR ${lesson.attendance} IS NOT NULL
					OR (${lesson.attendanceNote} IS NOT NULL AND ${lesson.attendanceNote} != '')
					OR (
						${lesson.status} = 'cancelled'
						AND (
							${lesson.date} IS NULL
							OR NOT EXISTS (
								SELECT 1 FROM ${holidaySessionCancel} hsc
								WHERE hsc.org_id = ${lesson.orgId}
									AND hsc.class_id = ${lesson.classId}
									AND hsc.date = ${lesson.date}
							)
						)
					)${undatedCheckSql}
				)
		)`;

		const syllabusColGuard =
			cls.syllabusId === null
				? isNull(classTable.syllabusId)
				: eq(classTable.syllabusId, cls.syllabusId);

		const openingVersionGuard =
			input.expectedOpeningVersion !== undefined
				? sql` AND ${classTable.openingAnnouncementVersion} = ${input.expectedOpeningVersion}`
				: sql``;

		const initialRecordingKeyCount = meetingRows.filter(
			(m) => m.recordingStorageKey !== null,
		).length;
		const initialLiveRecordingCount = meetingRows.filter((m) =>
			hasLiveR2Recording(m, now),
		).length;

		const casGuardSql = sql`(
			${classTable.startDate} = ${cls.startDate}
			AND ${classTable.schedule} = ${cls.schedule}
			AND ${classTable.sessionsTotal} = ${cls.sessionsTotal}
			AND ${classTable.schedulingMode} = ${cls.schedulingMode}
			AND ${classTable.status} = ${cls.status}
			AND ${syllabusColGuard}${openingVersionGuard}
			AND ${syllabusStateSql}
			AND (SELECT count(*) FROM ${lesson} WHERE ${lesson.orgId} = ${orgId} AND ${lesson.classId} = ${classId}) = ${lessonRows.length}
			AND (SELECT count(*) FROM ${classSession} WHERE ${classSession.orgId} = ${orgId} AND ${classSession.classId} = ${classId}) = ${classSessionCount}
			AND (SELECT count(*) FROM ${holidaySessionShift} WHERE ${holidaySessionShift.orgId} = ${orgId} AND ${holidaySessionShift.classId} = ${classId}) = ${shifts.length}
			AND (SELECT count(*) FROM ${holidaySessionCancel} WHERE ${holidaySessionCancel.orgId} = ${orgId} AND ${holidaySessionCancel.classId} = ${classId}) = ${cancels.length}
			AND (SELECT count(*) FROM ${classSessionMeeting} WHERE ${classSessionMeeting.orgId} = ${orgId} AND ${classSessionMeeting.classId} = ${classId}) = ${meetingRows.length}
			AND (SELECT count(*) FROM ${classSessionMeeting} WHERE ${classSessionMeeting.orgId} = ${orgId} AND ${classSessionMeeting.classId} = ${classId} AND ${classSessionMeeting.recordingStorageKey} IS NOT NULL) = ${initialRecordingKeyCount}
			AND (SELECT count(*) FROM ${classSessionMeeting} WHERE ${classSessionMeeting.orgId} = ${orgId} AND ${classSessionMeeting.classId} = ${classId} AND ${liveR2RecordingSql(nowMs)}) = ${initialLiveRecordingCount}
			AND (SELECT count(*) FROM ${lessonMaterial} WHERE ${lessonMaterial.orgId} = ${orgId} AND ${lessonMaterial.classId} = ${classId}) = ${materialCount}
			AND (SELECT count(*) FROM ${classAssignment} WHERE ${classAssignment.orgId} = ${orgId} AND ${classAssignment.classId} = ${classId} AND ${classAssignment.sessionDate} IS NOT NULL) = ${sessionLinkedAssignmentCount}
			AND (
				(SELECT count(*) FROM ${organizationHoliday} WHERE ${organizationHoliday.orgId} = ${orgId} AND ${organizationHoliday.scope} = 'org')
				+ (
					SELECT count(*) FROM ${organizationHolidayClass} hc
					INNER JOIN ${organizationHoliday} h ON h.id = hc.holiday_id
					WHERE h.org_id = ${orgId} AND hc.class_id = ${classId}
				)
			) = ${allHolidays.length}
			AND ${noStartedLessonsSql}
		)`;

		const returningSelection = {
			id: classTable.id,
			name: classTable.name,
			level: classTable.level,
			schedule: classTable.schedule,
			sessionsTotal: classTable.sessionsTotal,
			startDate: classTable.startDate,
			mode: classTable.mode,
			openingConfirmedAt: classTable.openingConfirmedAt,
			openingNote: classTable.openingNote,
			openingAnnouncementVersion: classTable.openingAnnouncementVersion,
		};

		const statement0 = db
			.update(classTable)
			.set({
				...input.classFieldPatch,
				startDate: sql`CASE WHEN ${casGuardSql} THEN ${nextStartDate} ELSE NULL END`,
			})
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)))
			.returning(returningSelection);

		const needsRescheduleBatch =
			!isManual &&
			(lessonRows.length > 0 ||
				meetingRows.length > 0 ||
				materialCount > 0 ||
				sessionLinkedAssignmentCount > 0);

		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			statement0,
		];
		let zoomSyncPlan: ZoomRescheduleSyncPlan = EMPTY_ZOOM_PLAN;

		if (!needsRescheduleBatch) {
			if (input.syncPackageTotal !== undefined) {
				statements.push(
					buildSyncPackageStatement(db, orgId, classId, input.syncPackageTotal),
				);
			}
		} else {
			const effectiveNewSchedule = input.nextSchedule ?? cls.schedule;
			const effectiveNewSessionsTotal =
				input.nextSessionsTotal ?? cls.sessionsTotal;
			const plan = planUnstartedStartDateShift({
				oldSchedule: cls.schedule,
				newSchedule: effectiveNewSchedule,
				oldStartDate: cls.startDate,
				newStartDate: nextStartDate,
				oldSessionsTotal: cls.sessionsTotal,
				newSessionsTotal: effectiveNewSessionsTotal,
				existingLessonDates: lessonRows
					.filter((row): row is typeof row & { date: string } =>
						Boolean(row.date),
					)
					.map((row) => ({ date: row.date, status: row.status })),
				existingShifts: shifts,
			});

			if (!plan.ok) {
				return {
					ok: false,
					error: "start-date-locked",
					reason: "invalid-schedule",
				};
			}

			// Statement 0b: khóa tập ngày `lesson.date` hiện có chống race `moveDate`
			// (tách theo từng chunk 40 ngày thành câu UPDATE riêng để mỗi câu <= 46 binds
			// trên D1 và không bị trần cứng số ngày khi lớp có nhiều kỳ nghỉ shift).
			if (plan.mode === "materialized") {
				const rowCountByDate = new Map<string, number>();
				for (const row of lessonRows) {
					if (!row.date) continue;
					rowCountByDate.set(row.date, (rowCountByDate.get(row.date) ?? 0) + 1);
				}
				const expectedLessonDates = [...rowCountByDate.keys()].sort((a, b) =>
					a.localeCompare(b),
				);
				for (const chunk of chunkDateMappings(
					expectedLessonDates,
					DATE_SET_GUARD_CHUNK,
				)) {
					const expectedChunkRows = chunk.reduce(
						(sum, d) => sum + (rowCountByDate.get(d) ?? 0),
						0,
					);
					statements.push(
						db
							.update(classTable)
							.set({
								startDate: sql`CASE WHEN (SELECT count(*) FROM ${lesson} WHERE ${lesson.orgId} = ${orgId} AND ${lesson.classId} = ${classId} AND ${inArray(lesson.date, chunk)}) = ${expectedChunkRows} THEN ${nextStartDate} ELSE NULL END`,
							})
							.where(
								and(eq(classTable.id, classId), eq(classTable.orgId, orgId)),
							),
					);
				}
			}

			if (input.syncPackageTotal !== undefined) {
				statements.push(
					buildSyncPackageStatement(db, orgId, classId, input.syncPackageTotal),
				);
			}

			// Tính trước kỳ nghỉ mới cho chế độ materialized
			const newShifts: PlannedNewShift[] = [];
			const newCancels: PlannedNewCancel[] = [];
			if (
				plan.mode === "materialized" &&
				applicableHolidays.length > 0 &&
				plan.newScheduleParsed
			) {
				const holidayPlanResult = computeMaterializedHolidayChanges({
					classId,
					className: input.classFieldPatch.name ?? cls.name,
					effectiveNewSchedule,
					newScheduleParsed: plan.newScheduleParsed,
					newBaseDates: plan.newBaseDates,
					applicableHolidays,
					todayVN,
				});
				if (!holidayPlanResult.ok) {
					return holidayPlanResult;
				}
				newShifts.push(...holidayPlanResult.newShifts);
				newCancels.push(...holidayPlanResult.newCancels);
			}

			// Mô phỏng chính xác hành trình Zoom meeting & kiểm tra khóa ghi hình R2 TRƯỚC khi dựng/chạy batch
			if (meetingRows.length > 0) {
				const simResult = simulateZoomSyncPlan({
					meetings: meetingRows,
					now,
					planMode: plan.mode,
					unwindShiftsDesc: plan.unwindShiftsDesc,
					mappings: plan.mappings,
					surplusOldDates: plan.surplusOldDates,
					newShifts,
					newCancels,
					lessonRows,
					newScheduleParsed: plan.newScheduleParsed,
					scheduleChanged: effectiveNewSchedule !== cls.schedule,
				});
				if (!simResult.ok) {
					return simResult;
				}
				zoomSyncPlan = simResult.zoomSyncPlan;
			}

			// Step A (materialized): hoàn tác `cancels` TRƯỚC, rồi hoàn tác `shifts` theo thứ tự topological
			if (
				plan.mode === "materialized" &&
				(cancels.length > 0 || plan.unwindShiftsDesc.length > 0)
			) {
				for (const cancel of cancels) {
					statements.push(
						db
							.update(lesson)
							.set({ status: "upcoming" })
							.where(
								and(
									eq(lesson.orgId, orgId),
									eq(lesson.classId, classId),
									eq(lesson.date, cancel.date),
									eq(lesson.status, "cancelled"),
									sql`EXISTS (SELECT 1 FROM ${enrollment} e WHERE e.id = ${lesson.enrollmentId} AND e.status = 'active')`,
								),
							),
					);
				}

				for (const shift of plan.unwindShiftsDesc) {
					if (materialCount > 0) {
						statements.push(
							...buildMaterialMovePair(
								db,
								orgId,
								classId,
								shift.makeupDate,
								shift.originalDate,
							),
						);
					}
					if (meetingRows.length > 0) {
						statements.push(
							...buildMeetingMovePair(
								db,
								orgId,
								classId,
								shift.makeupDate,
								shift.originalDate,
								nowMs,
							),
						);
					}
					if (sessionLinkedAssignmentCount > 0) {
						statements.push(
							db
								.update(classAssignment)
								.set({ sessionDate: shift.originalDate })
								.where(
									and(
										eq(classAssignment.orgId, orgId),
										eq(classAssignment.classId, classId),
										eq(classAssignment.sessionDate, shift.makeupDate),
									),
								),
						);
					}
					statements.push(
						db
							.delete(lesson)
							.where(
								and(
									eq(lesson.orgId, orgId),
									eq(lesson.classId, classId),
									eq(lesson.date, shift.makeupDate),
									eq(lesson.status, "upcoming"),
									sql`EXISTS (SELECT 1 FROM ${enrollment} e WHERE e.id = ${lesson.enrollmentId} AND e.status = 'active')`,
								),
							),
						db
							.update(lesson)
							.set({ status: "upcoming" })
							.where(
								and(
									eq(lesson.orgId, orgId),
									eq(lesson.classId, classId),
									eq(lesson.date, shift.originalDate),
									eq(lesson.status, "holiday"),
									sql`EXISTS (SELECT 1 FROM ${enrollment} e WHERE e.id = ${lesson.enrollmentId} AND e.status = 'active')`,
								),
							),
					);
				}

				if (shifts.length > 0) {
					statements.push(
						db
							.delete(holidaySessionShift)
							.where(
								and(
									eq(holidaySessionShift.orgId, orgId),
									eq(holidaySessionShift.classId, classId),
								),
							),
					);
				}
				if (cancels.length > 0) {
					statements.push(
						db
							.delete(holidaySessionCancel)
							.where(
								and(
									eq(holidaySessionCancel.orgId, orgId),
									eq(holidaySessionCancel.classId, classId),
								),
							),
					);
				}
			}

			// Step B: dọn buổi dự kiến thừa (projected) + dời ngày hai pha collision-safe
			if (
				plan.mode === "projected" &&
				plan.surplusOldDates.length > 0 &&
				(meetingRows.length > 0 || sessionLinkedAssignmentCount > 0)
			) {
				for (const chunk of chunkDateMappings(
					plan.surplusOldDates,
					DATE_SET_GUARD_CHUNK,
				)) {
					if (meetingRows.length > 0) {
						statements.push(
							db
								.update(classTable)
								.set({
									startDate: sql`CASE WHEN NOT EXISTS (SELECT 1 FROM ${classSessionMeeting} WHERE ${classSessionMeeting.orgId} = ${orgId} AND ${classSessionMeeting.classId} = ${classId} AND ${inArray(classSessionMeeting.date, chunk)} AND ${liveR2RecordingSql(nowMs)}) THEN ${nextStartDate} ELSE NULL END`,
								})
								.where(
									and(eq(classTable.id, classId), eq(classTable.orgId, orgId)),
								),
							db
								.delete(classSessionMeeting)
								.where(
									and(
										eq(classSessionMeeting.orgId, orgId),
										eq(classSessionMeeting.classId, classId),
										inArray(classSessionMeeting.date, chunk),
										nonLiveR2RecordingSql(nowMs),
									),
								),
						);
					}
					if (sessionLinkedAssignmentCount > 0) {
						statements.push(
							db
								.update(classAssignment)
								.set({ sessionDate: null })
								.where(
									and(
										eq(classAssignment.orgId, orgId),
										eq(classAssignment.classId, classId),
										inArray(classAssignment.sessionDate, chunk),
									),
								),
						);
					}
				}
			}

			if (plan.mappings.length > 0) {
				if (plan.mode === "materialized") {
					for (const chunk of chunkDateMappings(
						plan.mappings,
						LESSON_REMAP_CHUNK,
					)) {
						const dateCases = sql.join(
							chunk.map(
								(m) =>
									sql`WHEN ${m.oldDate} THEN ${SHIFT_DATE_PREFIX + m.newDate}`,
							),
							sql` `,
						);
						const dayCases = sql.join(
							chunk.map((m) => sql`WHEN ${m.oldDate} THEN ${m.newDay}`),
							sql` `,
						);
						statements.push(
							db
								.update(lesson)
								.set({
									date: sql`CASE ${lesson.date} ${dateCases} ELSE ${lesson.date} END`,
									day: sql`CASE ${lesson.date} ${dayCases} ELSE ${lesson.day} END`,
								})
								.where(
									and(
										eq(lesson.orgId, orgId),
										eq(lesson.classId, classId),
										inArray(
											lesson.date,
											chunk.map((m) => m.oldDate),
										),
										sql`EXISTS (SELECT 1 FROM ${enrollment} e WHERE e.id = ${lesson.enrollmentId} AND e.status = 'active')`,
									),
								),
						);
					}
				}

				if (materialCount > 0) {
					for (const chunk of chunkDateMappings(
						plan.mappings,
						DATE_ONLY_REMAP_CHUNK,
					)) {
						const dateCases = sql.join(
							chunk.map(
								(m) =>
									sql`WHEN ${m.oldDate} THEN ${SHIFT_DATE_PREFIX + m.newDate}`,
							),
							sql` `,
						);
						statements.push(
							db
								.update(lessonMaterial)
								.set({
									date: sql`CASE ${lessonMaterial.date} ${dateCases} ELSE ${lessonMaterial.date} END`,
								})
								.where(
									and(
										eq(lessonMaterial.orgId, orgId),
										eq(lessonMaterial.classId, classId),
										inArray(
											lessonMaterial.date,
											chunk.map((m) => m.oldDate),
										),
									),
								),
						);
					}
					// Pass 1.5: dọn đụng PK ở ngày đích trùng materialId với dòng đang dời vào
					statements.push(
						db.delete(lessonMaterial).where(
							and(
								eq(lessonMaterial.orgId, orgId),
								eq(lessonMaterial.classId, classId),
								sql`substr(${lessonMaterial.date}, 1, ${SHIFT_PREFIX_LEN}) != ${SHIFT_DATE_PREFIX}`,
								sql`EXISTS (
									SELECT 1 FROM ${lessonMaterial} src
									WHERE src.org_id = ${lessonMaterial.orgId}
										AND src.class_id = ${lessonMaterial.classId}
										AND substr(src.date, 1, ${SHIFT_PREFIX_LEN}) = ${SHIFT_DATE_PREFIX}
										AND substr(src.date, ${SHIFT_SUBSTR_START}) = ${lessonMaterial.date}
										AND src.material_id = ${lessonMaterial.materialId}
								)`,
							),
						),
					);
				}

				if (meetingRows.length > 0) {
					for (const chunk of chunkDateMappings(
						plan.mappings,
						DATE_ONLY_REMAP_CHUNK,
					)) {
						const dateCases = sql.join(
							chunk.map(
								(m) =>
									sql`WHEN ${m.oldDate} THEN ${SHIFT_DATE_PREFIX + m.newDate}`,
							),
							sql` `,
						);
						statements.push(
							db
								.update(classSessionMeeting)
								.set({
									date: sql`CASE ${classSessionMeeting.date} ${dateCases} ELSE ${classSessionMeeting.date} END`,
								})
								.where(
									and(
										eq(classSessionMeeting.orgId, orgId),
										eq(classSessionMeeting.classId, classId),
										inArray(
											classSessionMeeting.date,
											chunk.map((m) => m.oldDate),
										),
									),
								),
						);
					}
					// Pass 1.5: dọn meeting mồ côi ở đích trùng ngày với meeting đang dời vào
					statements.push(
						db.delete(classSessionMeeting).where(
							and(
								eq(classSessionMeeting.orgId, orgId),
								eq(classSessionMeeting.classId, classId),
								nonLiveR2RecordingSql(nowMs),
								sql`substr(${classSessionMeeting.date}, 1, ${SHIFT_PREFIX_LEN}) != ${SHIFT_DATE_PREFIX}`,
								sql`EXISTS (
									SELECT 1 FROM ${classSessionMeeting} src
									WHERE src.org_id = ${classSessionMeeting.orgId}
										AND src.class_id = ${classSessionMeeting.classId}
										AND substr(src.date, 1, ${SHIFT_PREFIX_LEN}) = ${SHIFT_DATE_PREFIX}
										AND substr(src.date, ${SHIFT_SUBSTR_START}) = ${classSessionMeeting.date}
								)`,
							),
						),
					);
				}

				if (sessionLinkedAssignmentCount > 0) {
					for (const chunk of chunkDateMappings(
						plan.mappings,
						DATE_ONLY_REMAP_CHUNK,
					)) {
						const dateCases = sql.join(
							chunk.map(
								(m) =>
									sql`WHEN ${m.oldDate} THEN ${SHIFT_DATE_PREFIX + m.newDate}`,
							),
							sql` `,
						);
						statements.push(
							db
								.update(classAssignment)
								.set({
									sessionDate: sql`CASE ${classAssignment.sessionDate} ${dateCases} ELSE ${classAssignment.sessionDate} END`,
								})
								.where(
									and(
										eq(classAssignment.orgId, orgId),
										eq(classAssignment.classId, classId),
										inArray(
											classAssignment.sessionDate,
											chunk.map((m) => m.oldDate),
										),
									),
								),
						);
					}
				}

				// Pass 2: gỡ tiền tố tạm bằng `substr` chính xác (không dùng `LIKE`)
				if (plan.mode === "materialized") {
					statements.push(
						db
							.update(lesson)
							.set({
								date: sql`substr(${lesson.date}, ${SHIFT_SUBSTR_START})`,
							})
							.where(
								and(
									eq(lesson.orgId, orgId),
									eq(lesson.classId, classId),
									sql`substr(${lesson.date}, 1, ${SHIFT_PREFIX_LEN}) = ${SHIFT_DATE_PREFIX}`,
								),
							),
					);
				}
				if (materialCount > 0) {
					statements.push(
						db
							.update(lessonMaterial)
							.set({
								date: sql`substr(${lessonMaterial.date}, ${SHIFT_SUBSTR_START})`,
							})
							.where(
								and(
									eq(lessonMaterial.orgId, orgId),
									eq(lessonMaterial.classId, classId),
									sql`substr(${lessonMaterial.date}, 1, ${SHIFT_PREFIX_LEN}) = ${SHIFT_DATE_PREFIX}`,
								),
							),
					);
				}
				if (meetingRows.length > 0) {
					statements.push(
						db
							.update(classSessionMeeting)
							.set({
								date: sql`substr(${classSessionMeeting.date}, ${SHIFT_SUBSTR_START})`,
							})
							.where(
								and(
									eq(classSessionMeeting.orgId, orgId),
									eq(classSessionMeeting.classId, classId),
									sql`substr(${classSessionMeeting.date}, 1, ${SHIFT_PREFIX_LEN}) = ${SHIFT_DATE_PREFIX}`,
								),
							),
					);
				}
				if (sessionLinkedAssignmentCount > 0) {
					statements.push(
						db
							.update(classAssignment)
							.set({
								sessionDate: sql`substr(${classAssignment.sessionDate}, ${SHIFT_SUBSTR_START})`,
							})
							.where(
								and(
									eq(classAssignment.orgId, orgId),
									eq(classAssignment.classId, classId),
									sql`substr(${classAssignment.sessionDate}, 1, ${SHIFT_PREFIX_LEN}) = ${SHIFT_DATE_PREFIX}`,
								),
							),
					);
				}
			}

			// Step C (materialized): tái áp kỳ nghỉ hiện hành lên tập ngày mới
			if (plan.mode === "materialized") {
				for (const shift of newShifts) {
					const origGuard = sql`CASE WHEN EXISTS (SELECT 1 FROM ${classTable} WHERE ${classTable.id} = ${classId} AND ${classTable.orgId} = ${orgId}) AND EXISTS (SELECT 1 FROM ${organizationHoliday} WHERE ${organizationHoliday.id} = ${shift.holidayId} AND ${organizationHoliday.orgId} = ${orgId}) THEN ${shift.originalDate} ELSE NULL END`;
					statements.push(
						db.insert(holidaySessionShift).values({
							id: crypto.randomUUID(),
							orgId,
							holidayId: shift.holidayId,
							classId,
							originalDate: origGuard,
							makeupDate: shift.makeupDate,
						}),
						db
							.update(lesson)
							.set({ status: "holiday" })
							.where(
								and(
									eq(lesson.orgId, orgId),
									eq(lesson.classId, classId),
									eq(lesson.date, shift.originalDate),
									eq(lesson.status, "upcoming"),
								),
							),
						db.insert(lesson).select(
							db
								.select({
									id: sql<string>`'holmk-' || lower(hex(randomblob(12)))`.as(
										"id",
									),
									orgId: lesson.orgId,
									classId: lesson.classId,
									enrollmentId: lesson.enrollmentId,
									day: sql<number>`${shift.weekday}`.as("day"),
									time: sql<string>`${shift.time}`.as("time"),
									dur: sql<number>`${shift.dur}`.as("dur"),
									date: sql<string>`${shift.makeupDate}`.as("date"),
									type: lesson.type,
									status: sql<string>`'upcoming'`.as("status"),
									attendance: sql`null`.as("attendance"),
									attendanceNote: sql`null`.as("attendance_note"),
									topic: sql<string>`''`.as("topic"),
									zoom: lesson.zoom,
									createdAt:
										sql`(cast(unixepoch('subsecond') * 1000 as integer))`.as(
											"created_at",
										),
								})
								.from(lesson)
								.where(
									and(
										eq(lesson.orgId, orgId),
										eq(lesson.classId, classId),
										eq(lesson.date, shift.originalDate),
										eq(lesson.status, "holiday"),
									),
								),
						),
					);
					if (materialCount > 0) {
						statements.push(
							...buildMaterialMovePair(
								db,
								orgId,
								classId,
								shift.originalDate,
								shift.makeupDate,
							),
						);
					}
					if (meetingRows.length > 0) {
						statements.push(
							...buildMeetingMovePair(
								db,
								orgId,
								classId,
								shift.originalDate,
								shift.makeupDate,
								nowMs,
							),
						);
					}
					if (sessionLinkedAssignmentCount > 0) {
						statements.push(
							db
								.update(classAssignment)
								.set({ sessionDate: shift.makeupDate })
								.where(
									and(
										eq(classAssignment.orgId, orgId),
										eq(classAssignment.classId, classId),
										eq(classAssignment.sessionDate, shift.originalDate),
									),
								),
						);
					}
				}

				for (const cancel of newCancels) {
					const cancelGuard = sql`CASE WHEN EXISTS (SELECT 1 FROM ${classTable} WHERE ${classTable.id} = ${classId} AND ${classTable.orgId} = ${orgId}) AND EXISTS (SELECT 1 FROM ${organizationHoliday} WHERE ${organizationHoliday.id} = ${cancel.holidayId} AND ${organizationHoliday.orgId} = ${orgId}) THEN ${cancel.date} ELSE NULL END`;
					statements.push(
						db.insert(holidaySessionCancel).values({
							id: crypto.randomUUID(),
							orgId,
							holidayId: cancel.holidayId,
							classId,
							date: cancelGuard,
						}),
						db
							.update(lesson)
							.set({ status: "cancelled", zoom: "" })
							.where(
								and(
									eq(lesson.orgId, orgId),
									eq(lesson.classId, classId),
									eq(lesson.date, cancel.date),
									eq(lesson.status, "upcoming"),
								),
							),
					);
					if (meetingRows.length > 0) {
						statements.push(
							db
								.update(classSessionMeeting)
								.set({
									zoomMeetingId: null,
									joinUrl: "",
									recordingStatus: sql`CASE WHEN ${classSessionMeeting.recordingStorageKey} IS NOT NULL OR ${classSessionMeeting.recordingStatus} = 'expired' THEN ${classSessionMeeting.recordingStatus} WHEN ${classSessionMeeting.recordingUrl} != '' THEN 'ready' ELSE 'none' END`,
								})
								.where(
									and(
										eq(classSessionMeeting.orgId, orgId),
										eq(classSessionMeeting.classId, classId),
										eq(classSessionMeeting.date, cancel.date),
									),
								),
						);
					}
				}

				// Step D: đồng bộ lại `lesson.zoom` từ nguồn sự thật `class_session_meeting.join_url`
				// cho các buổi `upcoming` (kể cả khi `join_url = ''` sau khi hủy/xóa Zoom ở buổi bù,
				// tránh hồi sinh link cũ từ dòng `holiday`; buổi không có dòng `class_session_meeting`
				// vẫn giữ nguyên link thủ công vì `EXISTS` trả false).
				if (meetingRows.length > 0) {
					statements.push(
						db
							.update(lesson)
							.set({
								zoom: sql`COALESCE((SELECT m.join_url FROM ${classSessionMeeting} m WHERE m.org_id = ${lesson.orgId} AND m.class_id = ${lesson.classId} AND m.date = ${lesson.date} LIMIT 1), ${lesson.zoom})`,
							})
							.where(
								and(
									eq(lesson.orgId, orgId),
									eq(lesson.classId, classId),
									eq(lesson.status, "upcoming"),
									sql`EXISTS (SELECT 1 FROM ${classSessionMeeting} m WHERE m.org_id = ${lesson.orgId} AND m.class_id = ${lesson.classId} AND m.date = ${lesson.date} AND m.join_url != ${lesson.zoom})`,
								),
							),
					);
				}
			}

			// Step D: `simulateZoomSyncPlan` đã chạy sớm ở trên trước khi dựng batch.
		}

		if (statements.length > MAX_BATCH_STATEMENTS) {
			return { ok: false, error: "conflict" };
		}

		try {
			const results = await db.batch(statements);
			const updatedRows = results[0] as ClassStartDateUpdatedRow[] | undefined;
			const updatedRow = updatedRows?.[0];
			if (!updatedRow) {
				return { ok: false, error: "not-found" };
			}
			return { ok: true, updatedRow, zoomSyncPlan };
		} catch (err: unknown) {
			const isConstraintErr =
				isRollbackableConstraintError(err) ||
				(err instanceof Error && isRollbackableConstraintError(err.cause));
			if (!isConstraintErr) {
				throw err;
			}

			const [clsAfter, lessonAfter, csAfter, shiftsAfter, cancelsAfter] =
				await Promise.all([
					db
						.select({
							id: classTable.id,
							name: classTable.name,
							status: classTable.status,
							schedule: classTable.schedule,
							sessionsTotal: classTable.sessionsTotal,
							startDate: classTable.startDate,
							schedulingMode: classTable.schedulingMode,
							syllabusId: classTable.syllabusId,
							openingAnnouncementVersion: classTable.openingAnnouncementVersion,
						})
						.from(classTable)
						.where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)))
						.limit(1),
					db
						.select({
							date: lesson.date,
							status: lesson.status,
							enrollmentId: lesson.enrollmentId,
							attendance: lesson.attendance,
							attendanceNote: lesson.attendanceNote,
						})
						.from(lesson)
						.where(and(eq(lesson.orgId, orgId), eq(lesson.classId, classId))),
					db
						.select({ count: sql<number>`count(*)` })
						.from(classSession)
						.where(
							and(
								eq(classSession.orgId, orgId),
								eq(classSession.classId, classId),
							),
						),
					loadClassShifts(db, orgId, classId),
					loadClassCancels(db, orgId, classId),
				]);

			const latestCls = clsAfter[0];
			if (!latestCls) {
				return { ok: false, error: "not-found" };
			}
			if (input.requireActiveStatus && latestCls.status !== "active") {
				return { ok: false, error: "class-paused" };
			}
			if (
				input.expectedOpeningVersion !== undefined &&
				(latestCls.openingAnnouncementVersion ?? 0) !==
					input.expectedOpeningVersion
			) {
				return { ok: false, error: "opening-version-conflict" };
			}
			const hasRealAfter =
				lessonAfter.length > 0 || Number(csAfter[0]?.count ?? 0) > 0;
			if (input.requireNoRealSessionsForOtherFields && hasRealAfter) {
				return { ok: false, error: "schedule-locked" };
			}
			const manualAfter = await isManualClass(
				db,
				orgId,
				classId,
				latestCls.syllabusId,
				latestCls.schedulingMode,
			);
			const editabilityAfter = evaluateClassStartDateEditability({
				schedule: latestCls.schedule,
				sessionsTotal: latestCls.sessionsTotal,
				isManual: manualAfter,
				lessons: lessonAfter.map((r) => ({
					date: r.date,
					status: r.status,
					enrollmentKey: r.enrollmentId,
					attendance: r.attendance,
					attendanceNote: r.attendanceNote,
				})),
				holidayCancelDates: cancelsAfter.map((c) => c.date),
				holidayShifts: shiftsAfter,
			});
			if (!editabilityAfter.editable) {
				return {
					ok: false,
					error: "start-date-locked",
					reason: editabilityAfter.reason,
				};
			}
			if (attempt >= 3) {
				if (!manualAfter) {
					const [meetingsAfter, allHolidaysAfter] = await Promise.all([
						db
							.select({
								date: classSessionMeeting.date,
								zoomMeetingId: classSessionMeeting.zoomMeetingId,
								recordingStorageKey: classSessionMeeting.recordingStorageKey,
								recordingExpiresAt: classSessionMeeting.recordingExpiresAt,
							})
							.from(classSessionMeeting)
							.where(
								and(
									eq(classSessionMeeting.orgId, orgId),
									eq(classSessionMeeting.classId, classId),
								),
							),
						loadClassHolidays(db, orgId, classId),
					]);
					if (meetingsAfter.length > 0) {
						const effectiveNewScheduleAfter =
							input.nextSchedule ?? latestCls.schedule;
						const effectiveNewSessionsTotalAfter =
							input.nextSessionsTotal ?? latestCls.sessionsTotal;
						const planAfter = planUnstartedStartDateShift({
							oldSchedule: latestCls.schedule,
							newSchedule: effectiveNewScheduleAfter,
							oldStartDate: latestCls.startDate,
							newStartDate: nextStartDate,
							oldSessionsTotal: latestCls.sessionsTotal,
							newSessionsTotal: effectiveNewSessionsTotalAfter,
							existingLessonDates: lessonAfter
								.filter((row): row is typeof row & { date: string } =>
									Boolean(row.date),
								)
								.map((row) => ({ date: row.date, status: row.status })),
							existingShifts: shiftsAfter,
						});
						if (planAfter.ok) {
							const applicableHolidaysAfter =
								latestCls.status === "active"
									? allHolidaysAfter
									: (() => {
											const existingIds = new Set([
												...shiftsAfter.map((s) => s.holidayId),
												...cancelsAfter.map((c) => c.holidayId),
											]);
											return allHolidaysAfter.filter((h) =>
												existingIds.has(h.id),
											);
										})();
							let newShiftsAfter: PlannedNewShift[] = [];
							let newCancelsAfter: PlannedNewCancel[] = [];
							if (
								planAfter.mode === "materialized" &&
								applicableHolidaysAfter.length > 0 &&
								planAfter.newScheduleParsed
							) {
								const holidayAfterResult = computeMaterializedHolidayChanges({
									classId,
									className: String(
										input.classFieldPatch.name ?? latestCls.name,
									),
									effectiveNewSchedule: effectiveNewScheduleAfter,
									newScheduleParsed: planAfter.newScheduleParsed,
									newBaseDates: planAfter.newBaseDates,
									applicableHolidays: applicableHolidaysAfter,
									todayVN,
								});
								if (holidayAfterResult.ok) {
									newShiftsAfter = holidayAfterResult.newShifts;
									newCancelsAfter = holidayAfterResult.newCancels;
								}
							}
							const simAfter = simulateZoomSyncPlan({
								meetings: meetingsAfter,
								now,
								planMode: planAfter.mode,
								unwindShiftsDesc: planAfter.unwindShiftsDesc,
								mappings: planAfter.mappings,
								surplusOldDates: planAfter.surplusOldDates,
								newShifts: newShiftsAfter,
								newCancels: newCancelsAfter,
								lessonRows: [],
								newScheduleParsed: planAfter.newScheduleParsed,
								scheduleChanged:
									effectiveNewScheduleAfter !== latestCls.schedule,
							});
							if (!simAfter.ok) {
								return simAfter;
							}
						}
					}
				}
				return { ok: false, error: "conflict" };
			}
		}
	}

	return { ok: false, error: "conflict" };
}

function simulateZoomSyncPlan(input: {
	meetings: ReadonlyArray<{
		date: string;
		zoomMeetingId: string | null;
		recordingStorageKey: string | null;
		recordingExpiresAt: Date | null;
	}>;
	now: Date;
	planMode: "projected" | "materialized";
	unwindShiftsDesc: ReadonlyArray<{
		originalDate: string;
		makeupDate: string;
	}>;
	mappings: ReadonlyArray<{ oldDate: string; newDate: string }>;
	surplusOldDates: ReadonlyArray<string>;
	newShifts: ReadonlyArray<PlannedNewShift>;
	newCancels: ReadonlyArray<PlannedNewCancel>;
	lessonRows: ReadonlyArray<{
		date: string | null;
		time: string;
		dur: number;
		topic: string;
	}>;
	newScheduleParsed: { start: string; end: string } | null;
	scheduleChanged: boolean;
}):
	| { ok: true; zoomSyncPlan: ZoomRescheduleSyncPlan }
	| { ok: false; error: "recording-locked" } {
	type SimEntry = {
		zoomMeetingId: string | null;
		recordingStorageKey: string | null;
		recordingExpiresAt: Date | null;
		initialDate: string;
		time: string;
		dur: number;
		topic: string;
	};

	const metaByInitialDate = new Map<
		string,
		{ time: string; dur: number; topic: string }
	>();
	for (const row of input.lessonRows) {
		if (!row.date) continue;
		const existing = metaByInitialDate.get(row.date);
		if (!existing) {
			metaByInitialDate.set(row.date, {
				time: row.time,
				dur: row.dur,
				topic: row.topic,
			});
		} else if (!existing.topic && row.topic) {
			existing.topic = row.topic;
		}
	}

	const fallbackTime = input.newScheduleParsed?.start ?? "19:00";
	const fallbackDur = input.newScheduleParsed
		? scheduleDurationMinutes({
				days: [0],
				start: input.newScheduleParsed.start,
				end: input.newScheduleParsed.end,
			}) || 60
		: 60;

	const sim = new Map<string, SimEntry>();
	for (const m of input.meetings) {
		const lessonMeta = metaByInitialDate.get(m.date);
		sim.set(m.date, {
			zoomMeetingId: m.zoomMeetingId,
			recordingStorageKey: m.recordingStorageKey,
			recordingExpiresAt: m.recordingExpiresAt,
			initialDate: m.date,
			time:
				input.planMode === "projected"
					? fallbackTime
					: (lessonMeta?.time ?? fallbackTime),
			dur:
				input.planMode === "projected"
					? fallbackDur
					: (lessonMeta?.dur ?? fallbackDur),
			topic: lessonMeta?.topic ?? "",
		});
	}

	const deletedZoomMeetingIds: ZoomRescheduleDeletedMeeting[] = [];
	const deletedRecordingKeys: string[] = [];
	let blockedByLiveRecording = false;

	const recordDestroyed = (entry: SimEntry | undefined, dateISO: string) => {
		if (!entry) return;
		if (hasLiveR2Recording(entry, input.now)) {
			blockedByLiveRecording = true;
			return;
		}
		if (entry.zoomMeetingId) {
			deletedZoomMeetingIds.push({
				zoomMeetingId: entry.zoomMeetingId,
				dateISO,
			});
		}
		if (entry.recordingStorageKey) {
			deletedRecordingKeys.push(entry.recordingStorageKey);
		}
	};

	const recordCancelled = (entry: SimEntry | undefined, dateISO: string) => {
		if (!entry) return;
		if (entry.zoomMeetingId) {
			deletedZoomMeetingIds.push({
				zoomMeetingId: entry.zoomMeetingId,
				dateISO,
			});
			entry.zoomMeetingId = null;
		}
	};

	// Step A: nguồn (`makeupDate`) đè đích (`originalDate`)
	if (input.planMode === "materialized") {
		for (const shift of input.unwindShiftsDesc) {
			const src = sim.get(shift.makeupDate);
			if (!src) continue;
			recordDestroyed(sim.get(shift.originalDate), shift.originalDate);
			sim.delete(shift.makeupDate);
			sim.set(shift.originalDate, src);
		}
	}

	// Step B: xóa phần dư projected
	if (input.planMode === "projected") {
		for (const oldDate of input.surplusOldDates) {
			recordDestroyed(sim.get(oldDate), oldDate);
			sim.delete(oldDate);
		}
	}

	// Step B: bijection hai pha (dọn đích mồ côi nếu bị Pass 1.5 ghi đè)
	if (input.mappings.length > 0) {
		const moving: Array<{ newDate: string; entry: SimEntry }> = [];
		for (const mapping of input.mappings) {
			const entry = sim.get(mapping.oldDate);
			if (!entry) continue;
			sim.delete(mapping.oldDate);
			moving.push({ newDate: mapping.newDate, entry });
		}
		for (const { newDate, entry } of moving) {
			recordDestroyed(sim.get(newDate), newDate);
			sim.set(newDate, entry);
		}
	}

	// Step C: re-apply shifts và cancels
	if (input.planMode === "materialized") {
		for (const shift of input.newShifts) {
			const src = sim.get(shift.originalDate);
			if (!src) continue;
			recordDestroyed(sim.get(shift.makeupDate), shift.makeupDate);
			sim.delete(shift.originalDate);
			sim.set(shift.makeupDate, {
				...src,
				time: shift.time,
				dur: shift.dur,
			});
		}
		for (const cancel of input.newCancels) {
			recordCancelled(sim.get(cancel.date), cancel.date);
		}
	}

	if (blockedByLiveRecording) {
		return { ok: false, error: "recording-locked" };
	}

	const movedMeetings: ZoomRescheduleMovedMeeting[] = [];
	for (const [finalDate, entry] of sim) {
		if (!entry.zoomMeetingId) continue;
		if (finalDate !== entry.initialDate || input.scheduleChanged) {
			movedMeetings.push({
				zoomMeetingId: entry.zoomMeetingId,
				newDateISO: finalDate,
				time: entry.time,
				dur: entry.dur,
				topic: entry.topic,
			});
		}
	}

	return {
		ok: true,
		zoomSyncPlan: {
			movedMeetings,
			deletedZoomMeetingIds,
			deletedRecordingKeys: [...new Set(deletedRecordingKeys)],
		},
	};
}
