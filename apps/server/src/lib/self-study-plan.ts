import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import { classTable } from "@teacher-os/db/schema/class";
import {
	classAssignment,
	classAssignmentTarget,
} from "@teacher-os/db/schema/class-assignment";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import { notificationRecord } from "@teacher-os/db/schema/notification-record";
import {
	selfStudyPlan,
	selfStudyPlanDay,
	selfStudyPlanItem,
} from "@teacher-os/db/schema/self-study-plan";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../app";
import { loadExistingHolidayDates } from "../routes/holidays";
import { deliverNotifications } from "./notifications/deliver";
import { enqueueNotifications } from "./notifications/enqueue";
import { selfStudyReleasedEvents } from "./notifications/templates";

/** Trần số biến bind mỗi câu lệnh trên D1 (< 100). */
export const D1_IN_ARRAY_CHUNK = 50;
export const D1_ASSIGNMENT_INSERT_CHUNK = 8;
export const D1_TARGET_INSERT_CHUNK = 15;
export const STALE_QUEUED_THRESHOLD_MS = 5 * 60 * 1000;
export const DEFAULT_MAX_DAYS_PER_TICK = 50;

/**
 * ID tất định của `class_assignment` sinh từ `self_study_plan_item` (#526).
 * Tuyệt đối không dùng `randomUUID` ở bước tạo bài của job để chạy lại hoặc
 * chạy chồng luôn idempotent.
 */
export function sspAssignmentId(itemId: string): string {
	return `ca_ssp_${itemId}`;
}

/**
 * ID tất định của `class_assignment_target` sinh từ `self_study_plan_item` +
 * `studentId` (#526).
 */
export function sspTargetId(itemId: string, studentId: string): string {
	return `cat_ssp_${itemId}_${studentId}`;
}

/**
 * Tự động chuyển plan từ `'published'` sang `'completed'` khi không còn ngày
 * `'pending'` VÀ `vietnamTodayISO(now) >= plan.endDate` (#526 RT-5).
 */
export async function checkAndCompletePlan(
	db: Db,
	planId: string,
	orgId: string,
	now: Date,
): Promise<boolean> {
	const [plan] = await db
		.select({
			id: selfStudyPlan.id,
			status: selfStudyPlan.status,
			endDate: selfStudyPlan.endDate,
		})
		.from(selfStudyPlan)
		.where(and(eq(selfStudyPlan.id, planId), eq(selfStudyPlan.orgId, orgId)))
		.limit(1);
	if (plan?.status !== "published") return false;

	const todayVN = vietnamTodayISO(now);
	if (todayVN < plan.endDate) return false;

	const pendingRows = await db
		.select({ id: selfStudyPlanDay.id })
		.from(selfStudyPlanDay)
		.where(
			and(
				eq(selfStudyPlanDay.planId, planId),
				eq(selfStudyPlanDay.orgId, orgId),
				eq(selfStudyPlanDay.status, "pending"),
			),
		)
		.limit(1);
	if (pendingRows.length > 0) return false;

	await db
		.update(selfStudyPlan)
		.set({
			status: "completed",
			completedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(selfStudyPlan.id, planId),
				eq(selfStudyPlan.orgId, orgId),
				eq(selfStudyPlan.status, "published"),
			),
		);
	return true;
}

export interface SelfStudyTickDeps {
	db: Db;
	now?: Date;
	mailer?: Mailer;
	studentOrigin?: string;
	retryDelaysMs?: number[];
	maxDaysPerTick?: number;
}

export interface SelfStudyTickResult {
	processedPendingDays: number;
	releasedDays: number;
	skippedDays: number;
	missedDays: number;
	backfilledTargets: number;
	enqueuedNotifications: number;
	retriedQueuedNotifications: number;
}

export async function runSelfStudyPlanTick(
	deps: SelfStudyTickDeps,
): Promise<SelfStudyTickResult> {
	const {
		db,
		now = new Date(),
		mailer,
		studentOrigin = "",
		retryDelaysMs,
		maxDaysPerTick = DEFAULT_MAX_DAYS_PER_TICK,
	} = deps;

	const result: SelfStudyTickResult = {
		processedPendingDays: 0,
		releasedDays: 0,
		skippedDays: 0,
		missedDays: 0,
		backfilledTargets: 0,
		enqueuedNotifications: 0,
		retriedQueuedNotifications: 0,
	};

	const processedNotificationIds = new Set<string>();

	// -------------------------------------------------------------------------
	// Bước 1: Quét các ngày `pending` có `releaseAt <= now` của plan `published`
	// -------------------------------------------------------------------------
	const duePendingDays = await db
		.select({
			dayId: selfStudyPlanDay.id,
			orgId: selfStudyPlanDay.orgId,
			planId: selfStudyPlanDay.planId,
			date: selfStudyPlanDay.date,
			releaseAt: selfStudyPlanDay.releaseAt,
			dueAt: selfStudyPlanDay.dueAt,
			holidayOverride: selfStudyPlanDay.holidayOverride,
			classId: selfStudyPlan.classId,
			dueTime: selfStudyPlan.dueTime,
			className: classTable.name,
		})
		.from(selfStudyPlanDay)
		.innerJoin(
			selfStudyPlan,
			and(
				eq(selfStudyPlan.id, selfStudyPlanDay.planId),
				eq(selfStudyPlan.orgId, selfStudyPlanDay.orgId),
				eq(selfStudyPlan.status, "published"),
			),
		)
		.innerJoin(
			classTable,
			and(
				eq(classTable.id, selfStudyPlan.classId),
				eq(classTable.orgId, selfStudyPlanDay.orgId),
			),
		)
		.where(
			and(
				eq(selfStudyPlanDay.status, "pending"),
				lte(selfStudyPlanDay.releaseAt, now),
			),
		)
		.orderBy(
			asc(selfStudyPlanDay.releaseAt),
			asc(selfStudyPlanDay.date),
			asc(selfStudyPlanDay.id),
		)
		.limit(maxDaysPerTick);

	for (const day of duePendingDays) {
		try {
			result.processedPendingDays += 1;

			// 1.1: Quá `dueAt` -> không tự giao trễ, đánh dấu `missed`
			if (now.getTime() > day.dueAt.getTime()) {
				await db
					.update(selfStudyPlanDay)
					.set({
						status: "missed",
						warning: "Quá hạn nộp trước khi hệ thống kịp giao bài.",
					})
					.where(
						and(
							eq(selfStudyPlanDay.id, day.dayId),
							eq(selfStudyPlanDay.orgId, day.orgId),
							eq(selfStudyPlanDay.status, "pending"),
						),
					);
				result.missedDays += 1;
				await checkAndCompletePlan(db, day.planId, day.orgId, now);
				continue;
			}

			// 1.2: Kiểm tra ngày nghỉ lúc giao (trừ khi `holidayOverride = true`)
			if (!day.holidayOverride) {
				const holidayMap = await loadExistingHolidayDates(db, day.orgId, [
					day.classId,
				]);
				const holidayName = holidayMap.get(day.classId)?.get(day.date);
				if (holidayName) {
					await db
						.update(selfStudyPlanDay)
						.set({
							status: "skipped",
							warning: `Nghỉ lễ: ${holidayName}`,
						})
						.where(
							and(
								eq(selfStudyPlanDay.id, day.dayId),
								eq(selfStudyPlanDay.orgId, day.orgId),
								eq(selfStudyPlanDay.status, "pending"),
							),
						);
					result.skippedDays += 1;
					await checkAndCompletePlan(db, day.planId, day.orgId, now);
					continue;
				}
			}

			// 1.3: Tải danh sách đề của ngày và kiểm tra trạng thái `ready`
			const itemRows = await db
				.select({
					id: selfStudyPlanItem.id,
					promptId: selfStudyPlanItem.promptId,
					position: selfStudyPlanItem.position,
					note: selfStudyPlanItem.note,
					promptTitle: assignmentPrompt.title,
					promptStatus: assignmentPrompt.status,
				})
				.from(selfStudyPlanItem)
				.innerJoin(
					assignmentPrompt,
					and(
						eq(assignmentPrompt.id, selfStudyPlanItem.promptId),
						eq(assignmentPrompt.orgId, day.orgId),
					),
				)
				.where(
					and(
						eq(selfStudyPlanItem.planId, day.planId),
						eq(selfStudyPlanItem.orgId, day.orgId),
						eq(selfStudyPlanItem.date, day.date),
					),
				)
				.orderBy(asc(selfStudyPlanItem.position), asc(selfStudyPlanItem.id));

			if (itemRows.length === 0) {
				await db
					.update(selfStudyPlanDay)
					.set({
						status: "skipped",
						warning: "Không có đề trong ngày.",
					})
					.where(
						and(
							eq(selfStudyPlanDay.id, day.dayId),
							eq(selfStudyPlanDay.orgId, day.orgId),
							eq(selfStudyPlanDay.status, "pending"),
						),
					);
				result.skippedDays += 1;
				await checkAndCompletePlan(db, day.planId, day.orgId, now);
				continue;
			}

			const readyItems = itemRows.filter((it) => it.promptStatus === "ready");
			const nonReadyTitles = itemRows
				.filter((it) => it.promptStatus !== "ready")
				.map((it) => it.promptTitle);
			const warningText =
				nonReadyTitles.length > 0
					? `Bỏ qua đề không còn ở trạng thái sẵn sàng: ${nonReadyTitles.join(", ")}`
					: "";

			if (readyItems.length === 0) {
				await db
					.update(selfStudyPlanDay)
					.set({
						status: "skipped",
						warning: warningText || "Không có đề sẵn sàng trong ngày.",
					})
					.where(
						and(
							eq(selfStudyPlanDay.id, day.dayId),
							eq(selfStudyPlanDay.orgId, day.orgId),
							eq(selfStudyPlanDay.status, "pending"),
						),
					);
				result.skippedDays += 1;
				await checkAndCompletePlan(db, day.planId, day.orgId, now);
				continue;
			}

			// 1.4: Tải roster `active` của lớp
			const rosterRows = await db
				.select({ studentId: enrollment.studentId })
				.from(enrollment)
				.where(
					and(
						eq(enrollment.orgId, day.orgId),
						eq(enrollment.classId, day.classId),
						eq(enrollment.status, "active"),
					),
				);
			const activeStudentIds = rosterRows.map((r) => r.studentId);
			if (activeStudentIds.length === 0) {
				const emptyRosterWarn = warningText
					? `${warningText}; Lớp chưa có học viên đang học.`
					: "Lớp chưa có học viên đang học.";
				await db
					.update(selfStudyPlanDay)
					.set({
						status: "skipped",
						warning: emptyRosterWarn,
					})
					.where(
						and(
							eq(selfStudyPlanDay.id, day.dayId),
							eq(selfStudyPlanDay.orgId, day.orgId),
							eq(selfStudyPlanDay.status, "pending"),
						),
					);
				result.skippedDays += 1;
				await checkAndCompletePlan(db, day.planId, day.orgId, now);
				continue;
			}

			// 1.5: Tạo `class_assignment` + `class_assignment_target` + cập nhật ngày sang `released` trong một `db.batch`
			const assignmentValues = readyItems.map((item) => ({
				id: sspAssignmentId(item.id),
				orgId: day.orgId,
				classId: day.classId,
				promptId: item.promptId,
				title: item.promptTitle,
				due: day.date,
				dueAt: day.dueAt,
				planItemId: item.id,
				note: item.note,
				createdAt: now,
			}));

			const targetValues: Array<{
				id: string;
				orgId: string;
				assignmentId: string;
				studentId: string;
				submittedAt: null;
			}> = [];
			for (const item of readyItems) {
				const assignmentId = sspAssignmentId(item.id);
				for (const studentId of activeStudentIds) {
					targetValues.push({
						id: sspTargetId(item.id, studentId),
						orgId: day.orgId,
						assignmentId,
						studentId,
						submittedAt: null,
					});
				}
			}

			const batchStatements: BatchItem<"sqlite">[] = [];
			for (
				let i = 0;
				i < assignmentValues.length;
				i += D1_ASSIGNMENT_INSERT_CHUNK
			) {
				const slice = assignmentValues.slice(i, i + D1_ASSIGNMENT_INSERT_CHUNK);
				batchStatements.push(
					db.insert(classAssignment).values(slice).onConflictDoNothing(),
				);
			}
			for (let i = 0; i < targetValues.length; i += D1_TARGET_INSERT_CHUNK) {
				const slice = targetValues.slice(i, i + D1_TARGET_INSERT_CHUNK);
				batchStatements.push(
					db.insert(classAssignmentTarget).values(slice).onConflictDoNothing(),
				);
			}
			batchStatements.push(
				db
					.update(selfStudyPlanDay)
					.set({
						status: "released",
						releasedAt: now,
						warning: warningText,
					})
					.where(
						and(
							eq(selfStudyPlanDay.id, day.dayId),
							eq(selfStudyPlanDay.orgId, day.orgId),
							eq(selfStudyPlanDay.status, "pending"),
						),
					),
			);

			const [firstStmt, ...restStmts] = batchStatements;
			if (firstStmt) {
				await db.batch([firstStmt, ...restStmts]);
			}
			result.releasedDays += 1;

			// 1.6: Enqueue & deliver thông báo `self_study_released`
			const firstAssignmentId = sspAssignmentId(readyItems[0]?.id ?? "");
			const events = selfStudyReleasedEvents({
				dayId: day.dayId,
				className: day.className,
				date: day.date,
				dueTime: day.dueTime,
				itemCount: readyItems.length,
				firstAssignmentId,
				studentIds: activeStudentIds,
			});

			const { createdIds } = await enqueueNotifications(db, day.orgId, events);
			await db
				.update(selfStudyPlanDay)
				.set({ notifiedAt: now })
				.where(
					and(
						eq(selfStudyPlanDay.id, day.dayId),
						eq(selfStudyPlanDay.orgId, day.orgId),
						isNull(selfStudyPlanDay.notifiedAt),
					),
				);

			if (createdIds.length > 0) {
				result.enqueuedNotifications += createdIds.length;
				for (const id of createdIds) processedNotificationIds.add(id);
				await deliverNotifications(
					db,
					mailer,
					createdIds,
					studentOrigin,
					retryDelaysMs ? { retryDelaysMs } : undefined,
				);
			}

			await checkAndCompletePlan(db, day.planId, day.orgId, now);
		} catch (err) {
			console.error(
				"[self-study-plan] failed to process pending day",
				{ dayId: day.dayId, planId: day.planId, date: day.date },
				err,
			);
		}
	}

	// -------------------------------------------------------------------------
	// Bước 2: Bù học viên mới `active` giữa ngày trên các ngày đang mở
	// (`status = 'released' AND dueAt >= now`) và phục hồi `notifiedAt IS NULL`
	// -------------------------------------------------------------------------
	const openOrUnnotifiedDays = await db
		.select({
			dayId: selfStudyPlanDay.id,
			orgId: selfStudyPlanDay.orgId,
			planId: selfStudyPlanDay.planId,
			date: selfStudyPlanDay.date,
			dueAt: selfStudyPlanDay.dueAt,
			notifiedAt: selfStudyPlanDay.notifiedAt,
			classId: selfStudyPlan.classId,
			dueTime: selfStudyPlan.dueTime,
			className: classTable.name,
		})
		.from(selfStudyPlanDay)
		.innerJoin(
			selfStudyPlan,
			and(
				eq(selfStudyPlan.id, selfStudyPlanDay.planId),
				eq(selfStudyPlan.orgId, selfStudyPlanDay.orgId),
				inArray(selfStudyPlan.status, ["published", "completed"]),
			),
		)
		.innerJoin(
			classTable,
			and(
				eq(classTable.id, selfStudyPlan.classId),
				eq(classTable.orgId, selfStudyPlanDay.orgId),
			),
		)
		.where(
			and(
				eq(selfStudyPlanDay.status, "released"),
				sql`(${selfStudyPlanDay.dueAt} >= ${now.getTime()} OR ${selfStudyPlanDay.notifiedAt} IS NULL)`,
			),
		)
		.orderBy(
			sql`${selfStudyPlanDay.notifiedAt} IS NOT NULL ASC`,
			asc(selfStudyPlanDay.dueAt),
			asc(selfStudyPlanDay.id),
		)
		.limit(maxDaysPerTick);

	for (const day of openOrUnnotifiedDays) {
		try {
			// Lấy danh sách `class_assignment` thực tế đã được tạo cho ngày này (#526 RT-2)
			const releasedAssignments = await db
				.select({
					assignmentId: classAssignment.id,
					itemId: selfStudyPlanItem.id,
					position: selfStudyPlanItem.position,
				})
				.from(selfStudyPlanItem)
				.innerJoin(
					classAssignment,
					and(
						eq(classAssignment.planItemId, selfStudyPlanItem.id),
						eq(classAssignment.orgId, day.orgId),
					),
				)
				.where(
					and(
						eq(selfStudyPlanItem.planId, day.planId),
						eq(selfStudyPlanItem.orgId, day.orgId),
						eq(selfStudyPlanItem.date, day.date),
					),
				)
				.orderBy(asc(selfStudyPlanItem.position), asc(selfStudyPlanItem.id));

			if (releasedAssignments.length === 0) continue;

			const rosterRows = await db
				.select({ studentId: enrollment.studentId })
				.from(enrollment)
				.where(
					and(
						eq(enrollment.orgId, day.orgId),
						eq(enrollment.classId, day.classId),
						eq(enrollment.status, "active"),
					),
				);
			const activeStudentIds = rosterRows.map((r) => r.studentId);
			if (activeStudentIds.length === 0) continue;

			const assignmentIds = releasedAssignments.map((a) => a.assignmentId);
			const existingTargets: Array<{
				assignmentId: string;
				studentId: string;
			}> = [];
			for (let i = 0; i < assignmentIds.length; i += D1_IN_ARRAY_CHUNK) {
				const slice = assignmentIds.slice(i, i + D1_IN_ARRAY_CHUNK);
				const rows = await db
					.select({
						assignmentId: classAssignmentTarget.assignmentId,
						studentId: classAssignmentTarget.studentId,
					})
					.from(classAssignmentTarget)
					.where(
						and(
							eq(classAssignmentTarget.orgId, day.orgId),
							inArray(classAssignmentTarget.assignmentId, slice),
						),
					);
				existingTargets.push(...rows);
			}
			const existingTargetKeys = new Set(
				existingTargets.map((t) => `${t.assignmentId}:${t.studentId}`),
			);

			const isDayStillOpen = day.dueAt.getTime() >= now.getTime();
			const missingTargets: Array<{
				id: string;
				orgId: string;
				assignmentId: string;
				studentId: string;
				submittedAt: null;
			}> = [];
			const newlyBackfilledStudents = new Set<string>();

			if (isDayStillOpen) {
				for (const a of releasedAssignments) {
					for (const studentId of activeStudentIds) {
						if (!existingTargetKeys.has(`${a.assignmentId}:${studentId}`)) {
							missingTargets.push({
								id: sspTargetId(a.itemId, studentId),
								orgId: day.orgId,
								assignmentId: a.assignmentId,
								studentId,
								submittedAt: null,
							});
							newlyBackfilledStudents.add(studentId);
						}
					}
				}
			}

			if (missingTargets.length > 0) {
				const targetBatches: BatchItem<"sqlite">[] = [];
				for (
					let i = 0;
					i < missingTargets.length;
					i += D1_TARGET_INSERT_CHUNK
				) {
					const slice = missingTargets.slice(i, i + D1_TARGET_INSERT_CHUNK);
					targetBatches.push(
						db
							.insert(classAssignmentTarget)
							.values(slice)
							.onConflictDoNothing(),
					);
				}
				const [firstTargetStmt, ...restTargetStmts] = targetBatches;
				if (firstTargetStmt) {
					await db.batch([firstTargetStmt, ...restTargetStmts]);
				}
				result.backfilledTargets += missingTargets.length;
			}

			const studentsToNotify =
				day.notifiedAt === null
					? activeStudentIds
					: Array.from(newlyBackfilledStudents);

			if (studentsToNotify.length > 0) {
				const firstAssignmentId = releasedAssignments[0]?.assignmentId ?? "";
				const events = selfStudyReleasedEvents({
					dayId: day.dayId,
					className: day.className,
					date: day.date,
					dueTime: day.dueTime,
					itemCount: releasedAssignments.length,
					firstAssignmentId,
					studentIds: studentsToNotify,
				});
				const { createdIds } = await enqueueNotifications(
					db,
					day.orgId,
					events,
				);
				if (day.notifiedAt === null) {
					await db
						.update(selfStudyPlanDay)
						.set({ notifiedAt: now })
						.where(
							and(
								eq(selfStudyPlanDay.id, day.dayId),
								eq(selfStudyPlanDay.orgId, day.orgId),
								isNull(selfStudyPlanDay.notifiedAt),
							),
						);
				}
				if (createdIds.length > 0) {
					result.enqueuedNotifications += createdIds.length;
					for (const id of createdIds) processedNotificationIds.add(id);
					await deliverNotifications(
						db,
						mailer,
						createdIds,
						studentOrigin,
						retryDelaysMs ? { retryDelaysMs } : undefined,
					);
				}
			}
		} catch (err) {
			console.error(
				"[self-study-plan] failed to backfill open released day",
				{ dayId: day.dayId, planId: day.planId },
				err,
			);
		}
	}

	// -------------------------------------------------------------------------
	// Bước 3: Quét lại tối đa 50 thông báo `queued` quá hạn (> 5 phút) của
	// `self_study_released` để gửi bù (#526 RT-2, RT-3)
	// -------------------------------------------------------------------------
	const staleCutoff = new Date(now.getTime() - STALE_QUEUED_THRESHOLD_MS);
	const staleQueuedRows = await db
		.select({ id: notificationRecord.id })
		.from(notificationRecord)
		.where(
			and(
				eq(notificationRecord.eventType, "self_study_released"),
				eq(notificationRecord.status, "queued"),
				lte(notificationRecord.createdAt, staleCutoff),
			),
		)
		.orderBy(asc(notificationRecord.createdAt), asc(notificationRecord.id))
		.limit(D1_IN_ARRAY_CHUNK);

	const staleIds = staleQueuedRows
		.map((r) => r.id)
		.filter((id) => !processedNotificationIds.has(id));

	if (staleIds.length > 0) {
		result.retriedQueuedNotifications += staleIds.length;
		await deliverNotifications(
			db,
			mailer,
			staleIds,
			studentOrigin,
			retryDelaysMs ? { retryDelaysMs } : undefined,
		);
	}

	return result;
}
