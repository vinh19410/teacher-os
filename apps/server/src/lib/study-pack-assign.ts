import {
	type ClassStudyPackAssignmentView,
	type ClassStudyPacksResponse,
	type ClassStudyPackView,
	MAX_PACK_DAYS,
} from "@teacher-os/api/contracts";
import { addDaysISO, vietnamDateTimeMs } from "@teacher-os/api/vietnam-date";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import { classTable } from "@teacher-os/db/schema/class";
import {
	classAssignment,
	classAssignmentTarget,
} from "@teacher-os/db/schema/class-assignment";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import { quizAttempt } from "@teacher-os/db/schema/quiz-attempt";
import {
	classStudyPack,
	studyPack,
	studyPackItem,
} from "@teacher-os/db/schema/study-pack";
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../app";
import { loadExistingHolidayDates } from "../routes/holidays";
import {
	D1_IN_ARRAY_CHUNK,
	materializePrompts,
	studyPackSourceKey,
} from "./study-pack-clone";

/** 10 columns × 8 rows = 80 binds <= 100 D1 bind limit. */
export const D1_ASSIGNMENT_INSERT_CHUNK = 8;
/** 5 columns × 15 rows = 75 binds <= 100 D1 bind limit. */
export const D1_TARGET_INSERT_CHUNK = 15;
/** Maximum statements per db.batch call. */
export const D1_BATCH_STATEMENT_LIMIT = 50;

export interface StudyPackScheduleResult {
	dateByDayIndex: Map<number, string>;
	skippedHolidays: Array<{ date: string; name: string }>;
}

/**
 * Pure schedule calculator: starts at `startDate`, advances day-by-day for
 * `dayIndex = 1..maxDayIndex`, skipping any date in `holidayDates`.
 */
export function computeStudyPackSchedule(
	startDate: string,
	maxDayIndex: number,
	holidayDates: ReadonlySet<string> | ReadonlyMap<string, string>,
): StudyPackScheduleResult {
	const dateByDayIndex = new Map<number, string>();
	const skippedHolidays: Array<{ date: string; name: string }> = [];
	if (maxDayIndex < 1) {
		return { dateByDayIndex, skippedHolidays };
	}

	const getHolidayName = (dateISO: string): string => {
		if ("get" in holidayDates && typeof holidayDates.get === "function") {
			return holidayDates.get(dateISO) ?? "";
		}
		return "";
	};

	let cursor = startDate;
	for (let dayIndex = 1; dayIndex <= maxDayIndex; dayIndex += 1) {
		while (holidayDates.has(cursor)) {
			skippedHolidays.push({
				date: cursor,
				name: getHolidayName(cursor),
			});
			cursor = addDaysISO(cursor, 1);
		}
		dateByDayIndex.set(dayIndex, cursor);
		cursor = addDaysISO(cursor, 1);
	}

	return { dateByDayIndex, skippedHolidays };
}

export function buildPackAssignmentId(
	classPackId: string,
	itemId: string,
): string {
	return `ca_pk_${classPackId}_${itemId}`;
}

export function extractPackItemIdFromAssignmentId(
	classPackId: string,
	assignmentId: string,
): string | null {
	const prefix = `ca_pk_${classPackId}_`;
	if (!assignmentId.startsWith(prefix)) return null;
	const itemId = assignmentId.slice(prefix.length);
	return itemId.length > 0 ? itemId : null;
}

export function buildPackTargetId(
	assignmentId: string,
	studentId: string,
): string {
	return `cat_pk_${assignmentId}_${studentId}`;
}

async function executeBatchedStatements(
	db: Db,
	statements: BatchItem<"sqlite">[],
): Promise<void> {
	for (let i = 0; i < statements.length; i += D1_BATCH_STATEMENT_LIMIT) {
		const slice = statements.slice(i, i + D1_BATCH_STATEMENT_LIMIT);
		const first = slice[0];
		if (!first) continue;
		await db.batch([first, ...slice.slice(1)]);
	}
}

export interface AssignStudyPackParams {
	orgId: string;
	classId: string;
	packId: string;
	startDate: string;
	releaseTime: string;
	dueTime: string;
	createdBy?: string | null;
}

export type AssignStudyPackResult =
	| {
			ok: true;
			classPackId: string;
			reused: boolean;
	  }
	| {
			ok: false;
			status: 404 | 409 | 422;
			error: string;
	  };

export async function assignStudyPackToClass(
	db: Db,
	params: AssignStudyPackParams,
): Promise<AssignStudyPackResult> {
	const { orgId, classId, packId, startDate, releaseTime, dueTime } = params;

	const [cls] = await db
		.select({ id: classTable.id })
		.from(classTable)
		.where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)));
	if (!cls) {
		return { ok: false, status: 404, error: "class not found" };
	}

	const [pack] = await db
		.select()
		.from(studyPack)
		.where(eq(studyPack.id, packId));
	if (
		!pack ||
		(pack.orgId !== null && pack.orgId !== orgId) ||
		(pack.orgId === null && pack.status !== "ready")
	) {
		return { ok: false, status: 404, error: "study pack not found" };
	}
	if (pack.status !== "ready") {
		return { ok: false, status: 422, error: "study pack is not ready" };
	}

	const itemRows = await db
		.select()
		.from(studyPackItem)
		.where(eq(studyPackItem.packId, pack.id))
		.orderBy(
			asc(studyPackItem.dayIndex),
			asc(studyPackItem.position),
			asc(studyPackItem.id),
		);
	if (itemRows.length === 0) {
		return { ok: false, status: 422, error: "study pack has no items" };
	}

	const [existingActive] = await db
		.select()
		.from(classStudyPack)
		.where(
			and(
				eq(classStudyPack.orgId, orgId),
				eq(classStudyPack.classId, classId),
				eq(classStudyPack.packId, packId),
				eq(classStudyPack.status, "active"),
			),
		);

	let classPackId: string;
	let reused = false;

	if (existingActive) {
		if (
			existingActive.startDate === startDate &&
			existingActive.releaseTime === releaseTime &&
			existingActive.dueTime === dueTime
		) {
			classPackId = existingActive.id;
			reused = true;
		} else {
			return {
				ok: false,
				status: 409,
				error: "study pack already active on class",
			};
		}
	} else {
		classPackId = crypto.randomUUID();
	}

	const materialized = await materializePrompts(db, orgId, itemRows);
	if (!materialized.ok) {
		return materialized;
	}

	const holidaysByClass = await loadExistingHolidayDates(db, orgId, [classId]);
	const classHolidayMap =
		holidaysByClass.get(classId) ?? new Map<string, string>();
	const maxDayIndex = Math.max(...itemRows.map((item) => item.dayIndex));
	const schedule = computeStudyPackSchedule(
		startDate,
		maxDayIndex,
		classHolidayMap,
	);

	const activeEnrollments = await db
		.select({ studentId: enrollment.studentId })
		.from(enrollment)
		.where(
			and(
				eq(enrollment.orgId, orgId),
				eq(enrollment.classId, classId),
				eq(enrollment.status, "active"),
			),
		);
	const activeStudentIds = [
		...new Set(activeEnrollments.map((row) => row.studentId)),
	];

	if (!reused) {
		const inserted = await db
			.insert(classStudyPack)
			.values({
				id: classPackId,
				orgId,
				classId,
				packId: pack.id,
				title: pack.title,
				startDate,
				releaseTime,
				dueTime,
				status: "active",
				createdBy: params.createdBy ?? null,
			})
			.onConflictDoNothing()
			.returning({ id: classStudyPack.id });

		if (inserted.length === 0) {
			const [raced] = await db
				.select()
				.from(classStudyPack)
				.where(
					and(
						eq(classStudyPack.orgId, orgId),
						eq(classStudyPack.classId, classId),
						eq(classStudyPack.packId, packId),
						eq(classStudyPack.status, "active"),
					),
				);
			if (
				raced &&
				raced.startDate === startDate &&
				raced.releaseTime === releaseTime &&
				raced.dueTime === dueTime
			) {
				classPackId = raced.id;
				reused = true;
			} else {
				return {
					ok: false,
					status: 409,
					error: "study pack already active on class",
				};
			}
		}
	}

	const assignmentValues: Array<typeof classAssignment.$inferInsert> = [];
	const targetValues: Array<typeof classAssignmentTarget.$inferInsert> = [];

	for (const item of itemRows) {
		const key = studyPackSourceKey(item.sourceKind, item.sourceId);
		const promptId = materialized.promptIdBySourceKey.get(key);
		const meta = materialized.metadataByKey.get(key);
		if (!promptId || !meta) {
			return {
				ok: false,
				status: 422,
				error: "missing materialized prompt for study pack item",
			};
		}
		const dateISO = schedule.dateByDayIndex.get(item.dayIndex) ?? startDate;
		const availableAt = new Date(vietnamDateTimeMs(dateISO, releaseTime));
		const dueAt = new Date(vietnamDateTimeMs(dateISO, dueTime));
		const assignmentId = buildPackAssignmentId(classPackId, item.id);

		assignmentValues.push({
			id: assignmentId,
			orgId,
			classId,
			promptId,
			title: meta.title,
			due: dateISO,
			note: item.note,
			dueAt,
			availableAt,
			classStudyPackId: classPackId,
		});

		for (const studentId of activeStudentIds) {
			targetValues.push({
				id: buildPackTargetId(assignmentId, studentId),
				orgId,
				assignmentId,
				studentId,
				submittedAt: null,
			});
		}
	}

	const statements: BatchItem<"sqlite">[] = [];
	for (
		let i = 0;
		i < assignmentValues.length;
		i += D1_ASSIGNMENT_INSERT_CHUNK
	) {
		const chunk = assignmentValues.slice(i, i + D1_ASSIGNMENT_INSERT_CHUNK);
		statements.push(
			db.insert(classAssignment).values(chunk).onConflictDoNothing(),
		);
	}
	for (let i = 0; i < targetValues.length; i += D1_TARGET_INSERT_CHUNK) {
		const chunk = targetValues.slice(i, i + D1_TARGET_INSERT_CHUNK);
		statements.push(
			db.insert(classAssignmentTarget).values(chunk).onConflictDoNothing(),
		);
	}

	await executeBatchedStatements(db, statements);

	return {
		ok: true,
		classPackId,
		reused,
	};
}

export type CancelClassStudyPackResult =
	| { ok: true }
	| { ok: false; status: 404; error: string };

/**
 * Cancel a `class_study_pack`: deletes unreleased `class_assignment` rows
 * (`available_at > now` and no `quiz_attempt`) along with their targets, while
 * keeping any already-released or attempted assignments intact.
 */
export async function cancelClassStudyPack(
	db: Db,
	orgId: string,
	classId: string,
	classPackId: string,
	now: Date = new Date(),
): Promise<CancelClassStudyPackResult> {
	const [packRow] = await db
		.select()
		.from(classStudyPack)
		.where(
			and(
				eq(classStudyPack.id, classPackId),
				eq(classStudyPack.orgId, orgId),
				eq(classStudyPack.classId, classId),
			),
		);
	if (!packRow) {
		return { ok: false, status: 404, error: "class study pack not found" };
	}
	if (packRow.status === "cancelled") {
		return { ok: true };
	}

	const assignments = await db
		.select({
			id: classAssignment.id,
			availableAt: classAssignment.availableAt,
		})
		.from(classAssignment)
		.where(
			and(
				eq(classAssignment.orgId, orgId),
				eq(classAssignment.classId, classId),
				eq(classAssignment.classStudyPackId, classPackId),
			),
		);

	const unreleasedIds = assignments
		.filter(
			(row) =>
				row.availableAt !== null && row.availableAt.getTime() > now.getTime(),
		)
		.map((row) => row.id);

	const attemptedIds = new Set<string>();
	for (let i = 0; i < unreleasedIds.length; i += D1_IN_ARRAY_CHUNK) {
		const slice = unreleasedIds.slice(i, i + D1_IN_ARRAY_CHUNK);
		const rows = await db
			.select({ assignmentId: quizAttempt.assignmentId })
			.from(quizAttempt)
			.where(
				and(
					eq(quizAttempt.orgId, orgId),
					inArray(quizAttempt.assignmentId, slice),
				),
			);
		for (const row of rows) {
			if (row.assignmentId) attemptedIds.add(row.assignmentId);
		}
	}

	const deletableIds = unreleasedIds.filter((id) => !attemptedIds.has(id));
	const statements: BatchItem<"sqlite">[] = [];

	for (let i = 0; i < deletableIds.length; i += D1_IN_ARRAY_CHUNK) {
		const slice = deletableIds.slice(i, i + D1_IN_ARRAY_CHUNK);
		statements.push(
			db
				.delete(classAssignmentTarget)
				.where(
					and(
						eq(classAssignmentTarget.orgId, orgId),
						inArray(classAssignmentTarget.assignmentId, slice),
					),
				),
		);
	}
	for (let i = 0; i < deletableIds.length; i += D1_IN_ARRAY_CHUNK) {
		const slice = deletableIds.slice(i, i + D1_IN_ARRAY_CHUNK);
		statements.push(
			db
				.delete(classAssignment)
				.where(
					and(
						eq(classAssignment.orgId, orgId),
						inArray(classAssignment.id, slice),
					),
				),
		);
	}

	statements.push(
		db
			.update(classStudyPack)
			.set({
				status: "cancelled",
				cancelledAt: now,
			})
			.where(
				and(
					eq(classStudyPack.id, classPackId),
					eq(classStudyPack.orgId, orgId),
					eq(classStudyPack.classId, classId),
				),
			),
	);

	await executeBatchedStatements(db, statements);
	return { ok: true };
}

/**
 * Backfill `class_assignment_target` rows for a student who activates their
 * enrollment after a study pack was assigned to the class. Only assignments
 * belonging to an `active` `class_study_pack` with `due_at > now` are assigned.
 */
export async function backfillStudyPackTargetsForStudent(
	db: Db,
	orgId: string,
	classId: string,
	studentId: string,
	now: Date = new Date(),
): Promise<number> {
	const eligibleAssignments = await db
		.select({ id: classAssignment.id })
		.from(classAssignment)
		.innerJoin(
			classStudyPack,
			and(
				eq(classStudyPack.id, classAssignment.classStudyPackId),
				eq(classStudyPack.orgId, orgId),
				eq(classStudyPack.classId, classId),
				eq(classStudyPack.status, "active"),
			),
		)
		.where(
			and(
				eq(classAssignment.orgId, orgId),
				eq(classAssignment.classId, classId),
				gt(classAssignment.dueAt, now),
			),
		);

	if (eligibleAssignments.length === 0) {
		return 0;
	}

	const targetValues: Array<typeof classAssignmentTarget.$inferInsert> =
		eligibleAssignments.map((assignment) => ({
			id: buildPackTargetId(assignment.id, studentId),
			orgId,
			assignmentId: assignment.id,
			studentId,
			submittedAt: null,
		}));

	const statements: BatchItem<"sqlite">[] = [];
	for (let i = 0; i < targetValues.length; i += D1_TARGET_INSERT_CHUNK) {
		const chunk = targetValues.slice(i, i + D1_TARGET_INSERT_CHUNK);
		statements.push(
			db.insert(classAssignmentTarget).values(chunk).onConflictDoNothing(),
		);
	}

	await executeBatchedStatements(db, statements);
	return targetValues.length;
}

/**
 * Load all `class_study_pack` views and applicable holidays for `classId`.
 */
export async function loadClassStudyPacks(
	db: Db,
	orgId: string,
	classId: string,
	now: Date = new Date(),
): Promise<ClassStudyPacksResponse> {
	const holidaysByClass = await loadExistingHolidayDates(db, orgId, [classId]);
	const classHolidayMap =
		holidaysByClass.get(classId) ?? new Map<string, string>();
	const holidays = [...classHolidayMap.entries()]
		.map(([date, name]) => ({ date, name }))
		.sort((a, b) => a.date.localeCompare(b.date));

	const packRows = await db
		.select()
		.from(classStudyPack)
		.where(
			and(eq(classStudyPack.orgId, orgId), eq(classStudyPack.classId, classId)),
		)
		.orderBy(desc(classStudyPack.createdAt), desc(classStudyPack.id));

	if (packRows.length === 0) {
		return { packs: [], holidays };
	}

	const classPackIds = packRows.map((row) => row.id);
	const assignmentRows: Array<{
		id: string;
		classStudyPackId: string | null;
		promptId: string;
		title: string;
		due: string;
		availableAt: Date | null;
		dueAt: Date | null;
		skill: string;
	}> = [];

	for (let i = 0; i < classPackIds.length; i += D1_IN_ARRAY_CHUNK) {
		const slice = classPackIds.slice(i, i + D1_IN_ARRAY_CHUNK);
		const rows = await db
			.select({
				id: classAssignment.id,
				classStudyPackId: classAssignment.classStudyPackId,
				promptId: classAssignment.promptId,
				title: classAssignment.title,
				due: classAssignment.due,
				availableAt: classAssignment.availableAt,
				dueAt: classAssignment.dueAt,
				skill: assignmentPrompt.skill,
			})
			.from(classAssignment)
			.innerJoin(
				assignmentPrompt,
				and(
					eq(assignmentPrompt.id, classAssignment.promptId),
					eq(assignmentPrompt.orgId, orgId),
				),
			)
			.where(
				and(
					eq(classAssignment.orgId, orgId),
					eq(classAssignment.classId, classId),
					inArray(classAssignment.classStudyPackId, slice),
				),
			);
		assignmentRows.push(...rows);
	}

	const itemIds: string[] = [];
	for (const row of assignmentRows) {
		if (!row.classStudyPackId) continue;
		const itemId = extractPackItemIdFromAssignmentId(
			row.classStudyPackId,
			row.id,
		);
		if (itemId) itemIds.push(itemId);
	}
	const uniqueItemIds = [...new Set(itemIds)];
	const itemMetaById = new Map<
		string,
		{ dayIndex: number; position: number }
	>();
	for (let i = 0; i < uniqueItemIds.length; i += D1_IN_ARRAY_CHUNK) {
		const slice = uniqueItemIds.slice(i, i + D1_IN_ARRAY_CHUNK);
		const rows = await db
			.select({
				id: studyPackItem.id,
				dayIndex: studyPackItem.dayIndex,
				position: studyPackItem.position,
			})
			.from(studyPackItem)
			.where(inArray(studyPackItem.id, slice));
		for (const row of rows) {
			itemMetaById.set(row.id, {
				dayIndex: row.dayIndex,
				position: row.position,
			});
		}
	}

	const assignmentIds = assignmentRows.map((row) => row.id);
	const targetRows: Array<{
		assignmentId: string;
		studentId: string;
		submittedAt: string | null;
	}> = [];
	const submittedAttemptRows: Array<{
		assignmentId: string | null;
		studentId: string;
		submittedAt: Date | null;
	}> = [];

	for (let i = 0; i < assignmentIds.length; i += D1_IN_ARRAY_CHUNK) {
		const slice = assignmentIds.slice(i, i + D1_IN_ARRAY_CHUNK);
		const [tRows, aRows] = await Promise.all([
			db
				.select({
					assignmentId: classAssignmentTarget.assignmentId,
					studentId: classAssignmentTarget.studentId,
					submittedAt: classAssignmentTarget.submittedAt,
				})
				.from(classAssignmentTarget)
				.where(
					and(
						eq(classAssignmentTarget.orgId, orgId),
						inArray(classAssignmentTarget.assignmentId, slice),
					),
				),
			db
				.select({
					assignmentId: quizAttempt.assignmentId,
					studentId: quizAttempt.studentId,
					submittedAt: quizAttempt.submittedAt,
				})
				.from(quizAttempt)
				.where(
					and(
						eq(quizAttempt.orgId, orgId),
						eq(quizAttempt.status, "submitted"),
						inArray(quizAttempt.assignmentId, slice),
					),
				),
		]);
		targetRows.push(...tRows);
		submittedAttemptRows.push(...aRows);
	}

	const attemptSubmittedAtByTarget = new Map<string, string>();
	for (const row of submittedAttemptRows) {
		if (!row.assignmentId || !row.submittedAt) continue;
		attemptSubmittedAtByTarget.set(
			`${row.assignmentId}:${row.studentId}`,
			row.submittedAt.toISOString(),
		);
	}

	const targetsByAssignment = new Map<
		string,
		Array<{ studentId: string; submittedAt: string | null }>
	>();
	for (const row of targetRows) {
		const list = targetsByAssignment.get(row.assignmentId) ?? [];
		const effectiveSubmittedAt =
			attemptSubmittedAtByTarget.get(`${row.assignmentId}:${row.studentId}`) ??
			row.submittedAt;
		list.push({
			studentId: row.studentId,
			submittedAt: effectiveSubmittedAt,
		});
		targetsByAssignment.set(row.assignmentId, list);
	}

	const assignmentsByPack = new Map<string, typeof assignmentRows>();
	for (const row of assignmentRows) {
		if (!row.classStudyPackId) continue;
		const list = assignmentsByPack.get(row.classStudyPackId) ?? [];
		list.push(row);
		assignmentsByPack.set(row.classStudyPackId, list);
	}

	const nowMs = now.getTime();
	const packs: ClassStudyPackView[] = packRows.map((packRow) => {
		const packAssignments = assignmentsByPack.get(packRow.id) ?? [];
		const fallbackSchedule = computeStudyPackSchedule(
			packRow.startDate,
			MAX_PACK_DAYS,
			classHolidayMap,
		);
		const dayIndexByDate = new Map<string, number>();
		for (const [dayIndex, dateISO] of fallbackSchedule.dateByDayIndex) {
			dayIndexByDate.set(dateISO, dayIndex);
		}

		const enriched = packAssignments.map((row) => {
			const itemId = extractPackItemIdFromAssignmentId(packRow.id, row.id);
			const itemMeta = itemId ? itemMetaById.get(itemId) : undefined;
			const dayIndex = itemMeta?.dayIndex ?? dayIndexByDate.get(row.due) ?? 1;
			const position = itemMeta?.position ?? 0;

			const availableAtDate =
				row.availableAt ??
				new Date(vietnamDateTimeMs(row.due, packRow.releaseTime));
			const dueAtDate =
				row.dueAt ?? new Date(vietnamDateTimeMs(row.due, packRow.dueTime));
			const dueAtMs = dueAtDate.getTime();
			const isReleased = availableAtDate.getTime() <= nowMs;

			const targets = targetsByAssignment.get(row.id) ?? [];
			const targetsTotal = targets.length;
			let submittedCount = 0;
			let submittedLateCount = 0;
			let overdueCount = 0;
			let pendingCount = 0;

			for (const target of targets) {
				if (target.submittedAt !== null) {
					submittedCount += 1;
					const submittedMs = Date.parse(target.submittedAt);
					if (!Number.isNaN(submittedMs) && submittedMs > dueAtMs) {
						submittedLateCount += 1;
					}
				} else if (nowMs > dueAtMs) {
					overdueCount += 1;
				} else {
					pendingCount += 1;
				}
			}

			const view: ClassStudyPackAssignmentView & { _position: number } = {
				assignmentId: row.id,
				promptId: row.promptId,
				title: row.title,
				skill: row.skill,
				dayIndex,
				date: row.due,
				availableAt: availableAtDate.toISOString(),
				dueAt: dueAtDate.toISOString(),
				isReleased,
				targetsTotal,
				submittedCount,
				submittedLateCount,
				overdueCount,
				pendingCount,
				_position: position,
			};
			return view;
		});

		enriched.sort(
			(a, b) =>
				a.dayIndex - b.dayIndex ||
				a._position - b._position ||
				a.assignmentId.localeCompare(b.assignmentId),
		);

		const assignments: ClassStudyPackAssignmentView[] = enriched.map(
			({ _position, ...rest }) => rest,
		);

		return {
			id: packRow.id,
			classId: packRow.classId,
			packId: packRow.packId,
			title: packRow.title,
			startDate: packRow.startDate,
			releaseTime: packRow.releaseTime,
			dueTime: packRow.dueTime,
			status: packRow.status === "cancelled" ? "cancelled" : "active",
			createdAt: packRow.createdAt.toISOString(),
			cancelledAt: packRow.cancelledAt
				? packRow.cancelledAt.toISOString()
				: null,
			assignments,
		};
	});

	return {
		packs,
		holidays,
	};
}
