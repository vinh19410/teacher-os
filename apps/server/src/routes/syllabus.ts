import {
	chunkDateMappings,
	DATE_ONLY_REMAP_CHUNK,
} from "@teacher-os/api/class-start-date";
import type { CreatedResponse } from "@teacher-os/api/contracts";
import {
	CURRICULUM_IMPORT_ERROR_CODES,
	deleteSyllabusSchema,
	importSyllabusSchema,
	removeCurriculumSchema,
	syllabusCreateSchema,
	syllabusReplaceContentSchema,
	syncCurriculumSchema,
} from "@teacher-os/api/contracts";
import {
	classifyManualSessionDates,
	isManualLessonSettled,
	projectCurriculumDates,
} from "@teacher-os/api/curriculum-overwrite";
import {
	parseStoredSchedule,
	scheduleDurationMinutes,
} from "@teacher-os/api/skeleton";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { canManageClassStatus } from "@teacher-os/auth/role";
import { classTable } from "@teacher-os/db/schema/class";
import { classSession } from "@teacher-os/db/schema/class-session";
import { classSessionMeeting } from "@teacher-os/db/schema/class-session-meeting";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import { lesson } from "@teacher-os/db/schema/lesson";
import { lessonMaterial } from "@teacher-os/db/schema/material";
import {
	holidaySessionCancel,
	holidaySessionShift,
} from "@teacher-os/db/schema/organization-holiday";
import { sessionPackage } from "@teacher-os/db/schema/session-package";
import {
	syllabus,
	syllabusLesson,
	syllabusModule,
} from "@teacher-os/db/schema/syllabus";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { z } from "zod";

import type { Db, KernelCtx } from "../app";
import {
	buildImportBatch,
	buildSyncBatch,
	clearPointersTo,
	findClassCurriculum,
	findExistingMaterialIds,
	findTemplate,
	flattenSyllabusLessons,
	MAX_IMPORT_NODES,
	selectTemplateTree,
	setClassCurriculumPointer,
} from "../lib/syllabus-curriculum";
import {
	syncZoomMeetingsAfterReschedule,
	type ZoomRescheduleSyncPlan,
} from "../lib/zoom/session-zoom-service";
import {
	loadClassHolidays,
	materializeScheduleForEnrollment,
} from "./enrollment-activation";
import { isRollbackableConstraintError } from "./holidays";
import { mountContentRoutes } from "./syllabus-content-routes";
import {
	runZoomSyncTask,
	type ZoomRouteDeps,
	zoomDepsFrom,
} from "./zoom-meeting";

type Env = { Variables: { kernelCtx: KernelCtx } };
type SyllabusContext = Context<Env>;

const MANUAL_DATE_CAS_CHUNK = 50;

function canManageClassStatusInKernel(role: string | undefined): boolean {
	return role === undefined ? true : canManageClassStatus(role);
}

async function computeOverwriteHash(input: {
	classId: string;
	templateId: string;
	startDate: string;
	schedule: string;
	status: string;
	lessonCount: number;
	manualDates: readonly string[];
	activeDates: readonly string[];
}): Promise<string> {
	const sortedManualDates = [...new Set(input.manualDates)].sort((a, b) =>
		a.localeCompare(b),
	);
	const sortedActiveDates = [...new Set(input.activeDates)].sort((a, b) =>
		a.localeCompare(b),
	);
	const payload = JSON.stringify({
		classId: input.classId,
		templateId: input.templateId,
		startDate: input.startDate,
		schedule: input.schedule,
		status: input.status,
		lessonCount: input.lessonCount,
		manualDates: sortedManualDates,
		activeDates: sortedActiveDates,
	});
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(payload),
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Sinh bù lịch học + gói buổi cho các active enrollment đang kẹt ở 0 dòng lesson
 * và package.total = 0 (hoặc chưa có package) sau khi lớp chuyển sang `auto` (#670).
 * Chạy tuần tự từng học viên để không vượt trần một `db.batch` của D1 và để học viên
 * thứ 2 nhìn thấy dòng shift I6 vừa sinh bởi học viên thứ 1.
 */
export async function backfillStuckEnrollments(
	db: Db,
	orgId: string,
	classId: string,
): Promise<number> {
	const stuck = await db
		.select({
			id: enrollment.id,
			studentId: enrollment.studentId,
		})
		.from(enrollment)
		.leftJoin(
			sessionPackage,
			and(
				eq(sessionPackage.enrollmentId, enrollment.id),
				eq(sessionPackage.orgId, enrollment.orgId),
			),
		)
		.where(
			and(
				eq(enrollment.orgId, orgId),
				eq(enrollment.classId, classId),
				eq(enrollment.status, "active"),
				sql`NOT EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${orgId} AND ${lesson.enrollmentId} = ${enrollment.id})`,
				sql`(${sessionPackage.id} IS NULL OR ${sessionPackage.total} = 0)`,
				sql`NOT EXISTS (
					SELECT 1 FROM ${sessionPackage} sp
					INNER JOIN ${lesson} l2 ON l2.org_id = ${orgId} AND l2.class_id = ${classId}
					INNER JOIN ${enrollment} e2 ON l2.enrollment_id = e2.id
						AND e2.org_id = ${orgId}
						AND e2.class_id = ${classId}
						AND e2.student_id = ${enrollment.studentId}
						AND e2.status = 'removed'
					WHERE sp.enrollment_id = ${enrollment.id} AND sp.org_id = ${orgId}
				)`,
			),
		);
	let healed = 0;
	for (const row of stuck) {
		for (let attempt = 1; attempt <= 2; attempt += 1) {
			try {
				const materialized = await materializeScheduleForEnrollment(db, {
					orgId,
					enrollmentId: row.id,
					studentId: row.studentId,
					classId,
					mode: "backfill",
				});
				if (materialized.ok) {
					healed += 1;
				} else if (materialized.error === "class-paused") {
					return healed;
				}
				break;
			} catch (err) {
				if (attempt >= 2) {
					console.warn(
						"[syllabus] backfillStuckEnrollments enrollment failed",
						{
							classId,
							enrollmentId: row.id,
							err,
						},
					);
				}
			}
		}
	}
	return healed;
}

/**
 * Syllabus + curriculum router. Mounted INSIDE kernelRoutes via
 * kernel.route("/", ...) so the kernel router's Origin + JSON content-type
 * CSRF guard covers these routes too — never mount this standalone.
 */
export function syllabusRoutes(deps: ZoomRouteDeps) {
	const routes = new Hono<Env>();

	function unauthorized(c: SyllabusContext) {
		return c.json({ error: "unauthorized" }, 401);
	}

	async function readBody<S extends z.ZodType>(
		c: SyllabusContext,
		schema: S,
	): Promise<
		{ ok: true; data: z.infer<S> } | { ok: false; response: Response }
	> {
		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return { ok: false, response: c.json({ error: "invalid json" }, 400) };
		}
		const parsed = schema.safeParse(raw);
		if (!parsed.success) {
			return { ok: false, response: c.json({ error: "invalid body" }, 400) };
		}
		return { ok: true, data: parsed.data };
	}

	/** Class row for curriculum write paths (#670 includes schedulingMode + sessionsTotal). */
	async function findClassRow(db: Db, classId: string, orgId: string) {
		const [row] = await db
			.select({
				id: classTable.id,
				name: classTable.name,
				schedule: classTable.schedule,
				startDate: classTable.startDate,
				syllabusId: classTable.syllabusId,
				schedulingMode: classTable.schedulingMode,
				sessionsTotal: classTable.sessionsTotal,
				status: classTable.status,
			})
			.from(classTable)
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)));
		return row;
	}

	type ManualConflictAnalysis =
		| { kind: "completed"; completedDates: string[] }
		| { kind: "holiday-scan-cap" }
		| { kind: "invalid-schedule" }
		| {
				kind: "conflict";
				activeDates: string[];
				nonHolidayDates: string[];
				conflictingDates: string[];
				otherManualDates: string[];
				manualSessionCount: number;
				overwriteHash: string;
		  };

	async function analyzeManualSessionsConflict(
		db: Db,
		orgId: string,
		cls: {
			id: string;
			schedule: string;
			startDate: string;
			status: string;
		},
		templateId: string,
		lessonCount: number,
		csRows: ReadonlyArray<{ date: string }>,
		lessonRows: ReadonlyArray<{
			date: string | null;
			status: string;
			attendance: string | null;
			attendanceNote: string | null;
		}>,
	): Promise<ManualConflictAnalysis> {
		const settledLessons = lessonRows.filter(isManualLessonSettled);
		if (settledLessons.length > 0) {
			const completedDates = [
				...new Set(
					settledLessons
						.map((row) => row.date)
						.filter((d): d is string => typeof d === "string" && d !== ""),
				),
			].sort((a, b) => a.localeCompare(b));
			return { kind: "completed", completedDates };
		}

		// Ghi đè xóa sạch lesson + holiday_session_shift/cancel nên khi backfill chạy
		// (ngay lập tức nếu active, hoặc khi mở lại nếu đang paused),
		// materializeScheduleForEnrollment luôn áp dụng đầy đủ loadClassHolidays.
		const holidays = await loadClassHolidays(db, orgId, cls.id);
		const projection = projectCurriculumDates({
			schedule: cls.schedule,
			startDate: cls.startDate,
			lessonCount,
			holidays,
			todayISO: vietnamTodayISO(),
		});
		if (!projection.ok) {
			return projection.reason === "holiday-scan-cap"
				? { kind: "holiday-scan-cap" }
				: { kind: "invalid-schedule" };
		}

		const manualDates = csRows.map((cs) => cs.date);
		const { conflictingDates, otherManualDates } = classifyManualSessionDates(
			manualDates,
			projection.activeDates,
		);
		const overwriteHash = await computeOverwriteHash({
			classId: cls.id,
			templateId,
			startDate: cls.startDate,
			schedule: cls.schedule,
			status: cls.status,
			lessonCount,
			manualDates,
			activeDates: projection.activeDates,
		});
		return {
			kind: "conflict",
			activeDates: projection.activeDates,
			nonHolidayDates: projection.nonHolidayDates,
			conflictingDates,
			otherManualDates,
			manualSessionCount: csRows.length,
			overwriteHash,
		};
	}

	function manualConflictResponse(
		c: SyllabusContext,
		analysis: ManualConflictAnalysis,
	) {
		switch (analysis.kind) {
			case "completed":
				return c.json(
					{
						error:
							"Lớp đã có buổi học thủ công được điểm danh hoặc hoàn thành nên không thể ghi đè bằng giáo trình.",
						reason: "has-completed-manual-sessions",
						code: CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_COMPLETED,
						completedDates: analysis.completedDates,
					},
					409,
				);
			case "holiday-scan-cap":
				return c.json(
					{
						error:
							"Kỳ nghỉ lễ hiện tại phủ kín lịch học nên không thể tự động tính ngày giáo trình. Vui lòng kiểm tra lại lịch nghỉ lễ trước khi nhập giáo trình.",
						reason: "holiday-scan-cap",
						code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_HOLIDAY_SCAN_CAP,
					},
					422,
				);
			case "invalid-schedule":
				return c.json(
					{
						error:
							"Lớp cần có lịch học trong tuần và ngày khai giảng hợp lệ trước khi ghi đè buổi học thủ công bằng giáo trình.",
						reason: "invalid-class-schedule",
						code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_INVALID_CLASS_SCHEDULE,
					},
					422,
				);
			case "conflict":
				return c.json(
					{
						error:
							analysis.conflictingDates.length > 0
								? "Lớp đã có buổi học thủ công trùng ngày với giáo trình. Xác nhận ghi đè để chuyển lớp sang lịch giáo trình."
								: "Lớp đã có buổi học thủ công. Xác nhận ghi đè để thay thế bằng lịch giáo trình.",
						reason: "has-manual-sessions",
						code: CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_EXIST,
						conflictingDates: analysis.conflictingDates,
						otherManualDates: analysis.otherManualDates,
						manualSessionCount: analysis.manualSessionCount,
						overwriteHash: analysis.overwriteHash,
					},
					409,
				);
		}
	}

	async function findMissingLinkedMaterial(
		db: Db,
		orgId: string,
		links: readonly { materialId: string }[],
	): Promise<string | undefined> {
		if (links.length === 0) return undefined;
		const materialIds = [...new Set(links.map((l) => l.materialId))];
		const existingMats = await findExistingMaterialIds(db, orgId, materialIds);
		return materialIds.find((id) => !existingMats.has(id));
	}

	//
	// Shared operation handlers (design D6, issue #394): one implementation
	// per operation, registered on the single context path (legacy aliases
	// removed in phase 8, issue #401). replace-content and remove always
	// resolve via findTemplate — a class copy is never editable/deletable
	// through them (404).
	//
	const createTemplateHandler = async (c: SyllabusContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, syllabusCreateSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();

		const syllabusId = crypto.randomUUID();
		// One atomic batch: syllabus + imported modules/lessons (issue #144).
		// Tuple type is required by db.batch (drizzle); same shape as
		// buildImportBatch (issue #79).
		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db.insert(syllabus).values({
				id: syllabusId,
				orgId: ctx.orgId,
				name: input.name,
				level: input.level,
				type: input.type,
				skills: JSON.stringify(input.skills),
				description: input.description,
				totalLessons: input.totalLessons,
			}),
		];
		for (const [mi, m] of (input.modules ?? []).entries()) {
			const moduleId = crypto.randomUUID();
			statements.push(
				db.insert(syllabusModule).values({
					id: moduleId,
					orgId: ctx.orgId,
					syllabusId,
					title: m.title,
					description: m.description,
					position: mi,
				}),
			);
			for (const [li, l] of m.lessons.entries()) {
				statements.push(
					db.insert(syllabusLesson).values({
						id: crypto.randomUUID(),
						orgId: ctx.orgId,
						moduleId,
						title: l.title,
						objectives: l.objectives,
						materials: l.materials,
						kind: l.kind,
						status: l.status,
						position: li,
					}),
				);
			}
		}
		await db.batch(statements);
		return c.json({ id: syllabusId } satisfies CreatedResponse, 201);
	};

	// Replace toàn bộ cây module/lesson của một template (import ghi đè ở màn
	// hình detail, issue #152). Delete explicit qua subquery — không dựa FK
	// cascade (same rule as module-remove). One atomic batch.
	const replaceContentHandler = async (c: SyllabusContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, syllabusReplaceContentSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();
		const id = c.req.param("id");
		if (id === undefined) return c.json({ error: "syllabus not found" }, 404);
		const sy = await findTemplate(db, id, ctx.orgId);
		if (!sy) return c.json({ error: "syllabus not found" }, 404);
		const lessonCount = input.modules.reduce(
			(sum, m) => sum + m.lessons.length,
			0,
		);
		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db.delete(syllabusLesson).where(
				and(
					eq(syllabusLesson.orgId, ctx.orgId),
					inArray(
						syllabusLesson.moduleId,
						db
							.select({ id: syllabusModule.id })
							.from(syllabusModule)
							.where(
								and(
									eq(syllabusModule.syllabusId, sy.id),
									eq(syllabusModule.orgId, ctx.orgId),
								),
							),
					),
				),
			),
			db
				.delete(syllabusModule)
				.where(
					and(
						eq(syllabusModule.syllabusId, sy.id),
						eq(syllabusModule.orgId, ctx.orgId),
					),
				),
			db
				.update(syllabus)
				.set({ totalLessons: lessonCount })
				.where(and(eq(syllabus.id, sy.id), eq(syllabus.orgId, ctx.orgId))),
		];
		for (const [mi, m] of input.modules.entries()) {
			const moduleId = crypto.randomUUID();
			statements.push(
				db.insert(syllabusModule).values({
					id: moduleId,
					orgId: ctx.orgId,
					syllabusId: sy.id,
					title: m.title,
					description: m.description,
					position: mi,
				}),
			);
			for (const [li, l] of m.lessons.entries()) {
				statements.push(
					db.insert(syllabusLesson).values({
						id: crypto.randomUUID(),
						orgId: ctx.orgId,
						moduleId,
						title: l.title,
						objectives: l.objectives,
						materials: l.materials,
						kind: l.kind,
						status: l.status,
						position: li,
					}),
				);
			}
		}
		await db.batch(statements);
		return c.json({ ok: true });
	};

	// Xóa template giáo trình (hard delete cả cây module/lesson). Bản copy của
	// các lớp đã import là deep-copy độc lập (buildImportBatch, issue #79) nên
	// không bị ảnh hưởng; chỉ cần detach provenance vì source_template_id là
	// logical FK only (SQLite không có FK thật để tự set null).
	const removeTemplateHandler = async (c: SyllabusContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, deleteSyllabusSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const id = c.req.param("id");
		if (id === undefined) return c.json({ error: "syllabus not found" }, 404);

		// findTemplate: bản copy của lớp chỉ được xóa qua remove-curriculum
		// phía lớp; 404 che tồn tại (consistent với guard template của import).
		const sy = await findTemplate(db, id, ctx.orgId);
		if (!sy) return c.json({ error: "syllabus not found" }, 404);

		// FK order (NO ACTION trên class.syllabus_id): null pointer trước, rồi
		// detach provenance, rồi delete explicit child-first qua subquery —
		// không dựa FK cascade (same rule as remove-curriculum). Mọi statement
		// org-scoped.
		await db.batch([
			clearPointersTo(db, id, ctx.orgId),
			db
				.update(syllabus)
				.set({ sourceTemplateId: null })
				.where(
					and(eq(syllabus.sourceTemplateId, id), eq(syllabus.orgId, ctx.orgId)),
				),
			db.delete(syllabusLesson).where(
				and(
					eq(syllabusLesson.orgId, ctx.orgId),
					inArray(
						syllabusLesson.moduleId,
						db
							.select({ id: syllabusModule.id })
							.from(syllabusModule)
							.where(
								and(
									eq(syllabusModule.syllabusId, id),
									eq(syllabusModule.orgId, ctx.orgId),
								),
							),
					),
				),
			),
			db
				.delete(syllabusModule)
				.where(
					and(
						eq(syllabusModule.syllabusId, id),
						eq(syllabusModule.orgId, ctx.orgId),
					),
				),
			db
				.delete(syllabus)
				.where(and(eq(syllabus.id, id), eq(syllabus.orgId, ctx.orgId))),
		]);
		return c.json({ ok: true });
	};

	const importCurriculumHandler = async (c: SyllabusContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, importSyllabusSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const classId = c.req.param("id");
		if (classId === undefined) {
			return c.json({ error: "class not found" }, 404);
		}

		const cls = await findClassRow(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found" }, 404);
		}
		// Validate template existence + org ownership BEFORE `existing` self-heal
		// so foreign/deleted templateIds always 404 without side effects.
		const tpl = await findTemplate(db, body.data.templateId, ctx.orgId);
		if (!tpl) {
			return c.json({ error: "syllabus not found" }, 404);
		}

		// Deterministic duplicate check — the copy (via class_id) is source of truth.
		// #670 self-heal: if a previous import committed the copy tree then timed out
		// mid-backfill (or left a pre-#670 manual/0-session class with a copy), heal
		// the stuck state idempotently and return 201; otherwise return 409.
		const existing = await findClassCurriculum(db, classId, ctx.orgId);
		if (existing) {
			if (cls.schedulingMode === "manual" && cls.sessionsTotal === 0) {
				const [existingCs, existingLesson] = await Promise.all([
					db
						.select({ id: classSession.id })
						.from(classSession)
						.where(
							and(
								eq(classSession.orgId, ctx.orgId),
								eq(classSession.classId, classId),
							),
						)
						.limit(1),
					db
						.select({ id: lesson.id })
						.from(lesson)
						.where(
							and(eq(lesson.orgId, ctx.orgId), eq(lesson.classId, classId)),
						)
						.limit(1),
				]);
				if (existingCs.length === 0 && existingLesson.length === 0) {
					const existingTree = await selectTemplateTree(
						db,
						existing.id,
						ctx.orgId,
					);
					const existingCount = existingTree.lessons.length;
					if (existingCount >= 1 && existingCount <= 52) {
						try {
							await db
								.update(classTable)
								.set({
									syllabusId: existing.id,
									sessionsTotal: existingCount,
									schedulingMode: sql`CASE WHEN EXISTS (SELECT 1 FROM ${classSession} WHERE ${classSession.classId} = ${classId} AND ${classSession.orgId} = ${ctx.orgId}) THEN ${classTable.schedulingMode} ELSE 'auto' END`,
								})
								.where(
									and(
										eq(classTable.id, classId),
										eq(classTable.orgId, ctx.orgId),
									),
								);
						} catch (healErr: unknown) {
							// FK race với `curriculum/remove` đồng thời (syllabus vừa bị
							// xóa giữa lúc đọc và lúc UPDATE): rollback-able → trả đúng
							// nghĩa 409 thay vì 500; client retry tự đi lại nhánh hợp lệ.
							if (isRollbackableConstraintError(healErr)) {
								return c.json(
									{
										error: "Lớp đã có giáo trình",
										code: "CURRICULUM_ALREADY_EXISTS",
									},
									409,
								);
							}
							throw healErr;
						}
						if (cls.status === "active") {
							await backfillStuckEnrollments(db, ctx.orgId, classId);
						}
						return c.json({ id: existing.id } satisfies CreatedResponse, 201);
					}
				}
			}
			if (
				cls.status === "active" &&
				cls.schedulingMode === "auto" &&
				cls.sessionsTotal > 0
			) {
				const healed = await backfillStuckEnrollments(db, ctx.orgId, classId);
				if (healed > 0) {
					return c.json({ id: existing.id } satisfies CreatedResponse, 201);
				}
			}
			return c.json(
				{
					error: "Lớp đã có giáo trình",
					code: "CURRICULUM_ALREADY_EXISTS",
				},
				409,
			);
		}

		const tree = await selectTemplateTree(db, tpl.id, ctx.orgId);
		if (
			tree.modules.length + tree.lessons.length + tree.links.length >
			MAX_IMPORT_NODES
		) {
			return c.json(
				{
					error: "Template quá lớn để import",
					code: "CURRICULUM_TEMPLATE_TOO_LARGE",
				},
				422,
			);
		}

		const [existingCs, existingLessons] = await Promise.all([
			db
				.select({
					id: classSession.id,
					date: classSession.date,
					time: classSession.time,
					dur: classSession.dur,
					topic: classSession.topic,
					zoom: classSession.zoom,
				})
				.from(classSession)
				.where(
					and(
						eq(classSession.orgId, ctx.orgId),
						eq(classSession.classId, classId),
					),
				),
			db
				.select({
					id: lesson.id,
					date: lesson.date,
					status: lesson.status,
					attendance: lesson.attendance,
					attendanceNote: lesson.attendanceNote,
				})
				.from(lesson)
				.where(and(eq(lesson.orgId, ctx.orgId), eq(lesson.classId, classId))),
		]);

		const lessonCount = tree.lessons.length;

		if (existingCs.length > 0) {
			if (
				body.data.overwriteManualSessions === true &&
				!canManageClassStatusInKernel(ctx.role)
			) {
				return c.json(
					{
						error:
							"Chỉ giáo viên phụ trách hoặc quản trị viên mới có quyền ghi đè buổi học thủ công.",
						code: "FORBIDDEN",
					},
					403,
				);
			}
			if (lessonCount > 52) {
				return c.json(
					{
						error: "Template vượt quá giới hạn 52 buổi học của lớp.",
						reason: "too-many-lessons",
						code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_TOO_MANY_LESSONS,
					},
					422,
				);
			}
			if (lessonCount === 0) {
				return c.json(
					{
						error:
							"Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi nhập vào lớp trống.",
						reason: "empty-template",
						code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_EMPTY_TEMPLATE,
					},
					422,
				);
			}
			const missingMaterial = await findMissingLinkedMaterial(
				db,
				ctx.orgId,
				tree.links,
			);
			if (missingMaterial !== undefined) {
				return c.json(
					{
						error: "material-not-found",
						materialId: missingMaterial,
						code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_MATERIAL_NOT_FOUND,
					},
					422,
				);
			}

			const analysis = await analyzeManualSessionsConflict(
				db,
				ctx.orgId,
				cls,
				tpl.id,
				lessonCount,
				existingCs,
				existingLessons,
			);
			if (analysis.kind !== "conflict") {
				return manualConflictResponse(c, analysis);
			}
			if (
				body.data.overwriteManualSessions !== true ||
				body.data.overwriteHash !== analysis.overwriteHash
			) {
				return manualConflictResponse(c, analysis);
			}

			const parsedSchedule = parseStoredSchedule(cls.schedule);
			if (!parsedSchedule) {
				return manualConflictResponse(c, { kind: "invalid-schedule" });
			}
			const scheduleDur = scheduleDurationMinutes(parsedSchedule);
			const orderedLessons = flattenSyllabusLessons(tree.modules, tree.lessons);
			const activeDateSet = new Set(analysis.activeDates);
			const topicByActiveDate = new Map<string, string>();
			analysis.nonHolidayDates.forEach((dateISO, idx) => {
				if (activeDateSet.has(dateISO)) {
					topicByActiveDate.set(dateISO, orderedLessons[idx]?.title ?? "");
				}
			});

			const existingMeetings = await db
				.select({
					id: classSessionMeeting.id,
					date: classSessionMeeting.date,
					zoomMeetingId: classSessionMeeting.zoomMeetingId,
					joinUrl: classSessionMeeting.joinUrl,
					recordingUrl: classSessionMeeting.recordingUrl,
					recordingStorageKey: classSessionMeeting.recordingStorageKey,
					recordingStatus: classSessionMeeting.recordingStatus,
				})
				.from(classSessionMeeting)
				.where(
					and(
						eq(classSessionMeeting.orgId, ctx.orgId),
						eq(classSessionMeeting.classId, classId),
					),
				);
			const hasPreservedRecording = (meeting: {
				recordingUrl: string;
				recordingStorageKey: string | null;
				recordingStatus: string;
			}) =>
				meeting.recordingUrl.trim() !== "" ||
				meeting.recordingStorageKey !== null ||
				meeting.recordingStatus === "expired";
			const existingRecordingCount = existingMeetings.filter(
				hasPreservedRecording,
			).length;

			const zoomSyncPlan: ZoomRescheduleSyncPlan = {
				movedMeetings: [],
				deletedZoomMeetingIds: [],
			};
			const meetingDatesToDelete: string[] = [];
			const meetingDatesToClearJoin: string[] = [];

			for (const meeting of existingMeetings) {
				if (activeDateSet.has(meeting.date)) {
					if (meeting.zoomMeetingId) {
						zoomSyncPlan.movedMeetings.push({
							zoomMeetingId: meeting.zoomMeetingId,
							newDateISO: meeting.date,
							time: parsedSchedule.start,
							dur: scheduleDur,
							topic: topicByActiveDate.get(meeting.date) ?? "",
						});
					}
					continue;
				}
				if (meeting.zoomMeetingId) {
					zoomSyncPlan.deletedZoomMeetingIds.push({
						zoomMeetingId: meeting.zoomMeetingId,
						dateISO: meeting.date,
					});
				}
				if (hasPreservedRecording(meeting)) {
					meetingDatesToClearJoin.push(meeting.date);
				} else {
					meetingDatesToDelete.push(meeting.date);
				}
			}

			const manualDates = [...new Set(existingCs.map((cs) => cs.date))].sort(
				(a, b) => a.localeCompare(b),
			);
			const manualDateChunks = chunkDateMappings(
				manualDates,
				MANUAL_DATE_CAS_CHUNK,
			);
			const firstManualChunk = manualDateChunks[0] ?? [];
			const firstChunkExactMatchSql =
				firstManualChunk.length > 0
					? sql` AND (SELECT count(*) FROM ${classSession} WHERE ${classSession.orgId} = ${ctx.orgId} AND ${classSession.classId} = ${classId} AND ${classSession.date} IN (${sql.join(
							firstManualChunk.map((d) => sql`${d}`),
							sql`, `,
						)})) = ${firstManualChunk.length}`
					: sql``;

			const { copyId, statements } = buildImportBatch(db, {
				template: tpl,
				...tree,
				classId,
				orgId: ctx.orgId,
			});

			// CAS nguyên tử chạy TRƯỚC mọi câu DELETE để chống race điểm danh,
			// moveDate, thêm/xóa buổi thủ công, đổi startDate/schedule/status,
			// đổi số bài template, đồng bộ recording (URL ngoài, R2 hoặc expired) hoặc tạo phòng Zoom mới đồng thời.
			statements.push(
				db
					.update(classTable)
					.set({
						syllabusId: copyId,
						sessionsTotal: lessonCount,
						schedulingMode: sql`CASE WHEN ${classTable.startDate} = ${cls.startDate} AND ${classTable.schedule} = ${cls.schedule} AND ${classTable.status} = ${cls.status} AND NOT EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${ctx.orgId} AND ${lesson.classId} = ${classId} AND (${lesson.status} IN ('completed', 'absent') OR ${lesson.attendance} IS NOT NULL OR (${lesson.attendanceNote} IS NOT NULL AND ${lesson.attendanceNote} != ''))) AND (SELECT count(*) FROM ${classSession} WHERE ${classSession.orgId} = ${ctx.orgId} AND ${classSession.classId} = ${classId}) = ${existingCs.length}${firstChunkExactMatchSql} AND (SELECT count(*) FROM ${classSessionMeeting} WHERE ${classSessionMeeting.orgId} = ${ctx.orgId} AND ${classSessionMeeting.classId} = ${classId}) = ${existingMeetings.length} AND (SELECT count(*) FROM ${classSessionMeeting} WHERE ${classSessionMeeting.orgId} = ${ctx.orgId} AND ${classSessionMeeting.classId} = ${classId} AND (trim(${classSessionMeeting.recordingUrl}) != '' OR ${classSessionMeeting.recordingStorageKey} IS NOT NULL OR ${classSessionMeeting.recordingStatus} = 'expired')) = ${existingRecordingCount} AND (SELECT count(*) FROM ${syllabusLesson} INNER JOIN ${syllabusModule} ON ${syllabusModule.id} = ${syllabusLesson.moduleId} WHERE ${syllabusLesson.orgId} = ${ctx.orgId} AND ${syllabusModule.orgId} = ${ctx.orgId} AND ${syllabusModule.syllabusId} = ${tpl.id}) = ${lessonCount} THEN 'auto' ELSE NULL END`,
					})
					.where(
						and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)),
					),
			);
			for (const extraChunk of manualDateChunks.slice(1)) {
				statements.push(
					db
						.update(classTable)
						.set({
							schedulingMode: sql`CASE WHEN (SELECT count(*) FROM ${classSession} WHERE ${classSession.orgId} = ${ctx.orgId} AND ${classSession.classId} = ${classId} AND ${classSession.date} IN (${sql.join(
								extraChunk.map((d) => sql`${d}`),
								sql`, `,
							)})) = ${extraChunk.length} THEN 'auto' ELSE NULL END`,
						})
						.where(
							and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)),
						),
				);
			}

			statements.push(
				db
					.delete(lesson)
					.where(
						and(
							eq(lesson.orgId, ctx.orgId),
							eq(lesson.classId, classId),
							sql`EXISTS (SELECT 1 FROM ${enrollment} e WHERE e.id = ${lesson.enrollmentId} AND e.status = 'active')`,
						),
					),
				db
					.delete(classSession)
					.where(
						and(
							eq(classSession.orgId, ctx.orgId),
							eq(classSession.classId, classId),
						),
					),
				db
					.delete(lessonMaterial)
					.where(
						and(
							eq(lessonMaterial.orgId, ctx.orgId),
							eq(lessonMaterial.classId, classId),
						),
					),
				db
					.delete(holidaySessionShift)
					.where(
						and(
							eq(holidaySessionShift.orgId, ctx.orgId),
							eq(holidaySessionShift.classId, classId),
						),
					),
				db
					.delete(holidaySessionCancel)
					.where(
						and(
							eq(holidaySessionCancel.orgId, ctx.orgId),
							eq(holidaySessionCancel.classId, classId),
						),
					),
			);

			for (const chunk of chunkDateMappings(
				meetingDatesToDelete,
				DATE_ONLY_REMAP_CHUNK,
			)) {
				statements.push(
					db
						.delete(classSessionMeeting)
						.where(
							and(
								eq(classSessionMeeting.orgId, ctx.orgId),
								eq(classSessionMeeting.classId, classId),
								inArray(classSessionMeeting.date, chunk),
								sql`trim(${classSessionMeeting.recordingUrl}) = '' AND ${classSessionMeeting.recordingStorageKey} IS NULL AND ${classSessionMeeting.recordingStatus} != 'expired'`,
							),
						),
				);
			}
			for (const chunk of chunkDateMappings(
				meetingDatesToClearJoin,
				DATE_ONLY_REMAP_CHUNK,
			)) {
				statements.push(
					db
						.update(classSessionMeeting)
						.set({
							zoomMeetingId: null,
							joinUrl: "",
							recordingStatus: sql`CASE WHEN ${classSessionMeeting.recordingStatus} = 'expired' THEN 'expired' ELSE 'ready' END`,
						})
						.where(
							and(
								eq(classSessionMeeting.orgId, ctx.orgId),
								eq(classSessionMeeting.classId, classId),
								inArray(classSessionMeeting.date, chunk),
							),
						),
				);
			}

			// Persist link Zoom dán thủ công (class_session.zoom) ở các ngày dạy hiệu lực
			// trùng lịch vào class_session_meeting ngay trong cùng batch nguyên tử để mọi
			// nhánh (0 HV, paused->resume, self-heal, HV vào sau) đều đọc nhất quán.
			for (const cs of existingCs) {
				const trimmedZoom = cs.zoom.trim();
				if (!activeDateSet.has(cs.date) || trimmedZoom === "") continue;
				statements.push(
					db
						.insert(classSessionMeeting)
						.values({
							id: crypto.randomUUID(),
							orgId: ctx.orgId,
							classId,
							date: cs.date,
							joinUrl: trimmedZoom,
							zoomMeetingId: null,
							recordingUrl: "",
							recordingStatus: "none",
						})
						.onConflictDoUpdate({
							target: [classSessionMeeting.classId, classSessionMeeting.date],
							set: {
								joinUrl: sql`CASE WHEN ${classSessionMeeting.orgId} = ${ctx.orgId} THEN CASE WHEN ${classSessionMeeting.joinUrl} = '' THEN excluded.join_url ELSE ${classSessionMeeting.joinUrl} END ELSE NULL END`,
							},
						}),
				);
			}

			statements.push(
				db
					.update(sessionPackage)
					.set({ total: 0 })
					.where(
						and(
							eq(sessionPackage.orgId, ctx.orgId),
							inArray(
								sessionPackage.enrollmentId,
								db
									.select({ id: enrollment.id })
									.from(enrollment)
									.where(
										and(
											eq(enrollment.orgId, ctx.orgId),
											eq(enrollment.classId, classId),
										),
									),
							),
						),
					),
			);

			try {
				await db.batch(statements);
			} catch (err: unknown) {
				const after = await findClassCurriculum(db, classId, ctx.orgId);
				// Lost ACK after D1 committed our own copy: proceed to Zoom sync + backfill + 201.
				if (!after || after.id !== copyId) {
					if (!isRollbackableConstraintError(err)) {
						throw err;
					}
					const message = err instanceof Error ? err.message : String(err);
					if (/FOREIGN KEY/i.test(message) && tree.links.length > 0) {
						const missing = await findMissingLinkedMaterial(
							db,
							ctx.orgId,
							tree.links,
						);
						if (missing !== undefined) {
							return c.json(
								{
									error: "material-not-found",
									materialId: missing,
									code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_MATERIAL_NOT_FOUND,
								},
								422,
							);
						}
					}
					if (after) {
						return c.json(
							{
								error: "Lớp đã có giáo trình",
								code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_ALREADY_EXISTS,
							},
							409,
						);
					}
					const [foreign] = await db
						.select({ id: syllabus.id })
						.from(syllabus)
						.where(eq(syllabus.classId, classId));
					if (foreign) {
						return c.json(
							{
								error: "Lớp đã có giáo trình",
								code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_ALREADY_EXISTS,
							},
							409,
						);
					}
					if (!(await findTemplate(db, tpl.id, ctx.orgId))) {
						return c.json({ error: "syllabus not found" }, 404);
					}

					const [latestCls, latestCs, latestLessons, latestTree] =
						await Promise.all([
							findClassRow(db, classId, ctx.orgId),
							db
								.select({ date: classSession.date })
								.from(classSession)
								.where(
									and(
										eq(classSession.orgId, ctx.orgId),
										eq(classSession.classId, classId),
									),
								),
							db
								.select({
									date: lesson.date,
									status: lesson.status,
									attendance: lesson.attendance,
									attendanceNote: lesson.attendanceNote,
								})
								.from(lesson)
								.where(
									and(eq(lesson.orgId, ctx.orgId), eq(lesson.classId, classId)),
								),
							selectTemplateTree(db, tpl.id, ctx.orgId),
						]);
					if (!latestCls) {
						return c.json({ error: "class not found" }, 404);
					}
					if (latestLessons.some(isManualLessonSettled)) {
						const completedDates = [
							...new Set(
								latestLessons
									.filter(isManualLessonSettled)
									.map((row) => row.date)
									.filter(
										(d): d is string => typeof d === "string" && d !== "",
									),
							),
						].sort((a, b) => a.localeCompare(b));
						return manualConflictResponse(c, {
							kind: "completed",
							completedDates,
						});
					}
					if (latestCs.length > 0) {
						const latestLessonCount = latestTree.lessons.length;
						if (latestLessonCount === 0) {
							return c.json(
								{
									error:
										"Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi nhập vào lớp trống.",
									reason: "empty-template",
									code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_EMPTY_TEMPLATE,
								},
								422,
							);
						}
						if (latestLessonCount > 52) {
							return c.json(
								{
									error: "Template vượt quá giới hạn 52 buổi học của lớp.",
									reason: "too-many-lessons",
									code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_TOO_MANY_LESSONS,
								},
								422,
							);
						}
						const freshAnalysis = await analyzeManualSessionsConflict(
							db,
							ctx.orgId,
							latestCls,
							tpl.id,
							latestLessonCount,
							latestCs,
							latestLessons,
						);
						return manualConflictResponse(c, freshAnalysis);
					}
					return c.json(
						{
							error:
								"Trạng thái buổi học của lớp vừa thay đổi. Vui lòng thử nhập giáo trình lại.",
							reason: "class-state-changed",
							code: CURRICULUM_IMPORT_ERROR_CODES.CLASS_STATE_CHANGED,
						},
						409,
					);
				}
			}

			if (
				zoomSyncPlan.deletedZoomMeetingIds.length > 0 ||
				zoomSyncPlan.movedMeetings.length > 0
			) {
				await runZoomSyncTask(deps, () =>
					syncZoomMeetingsAfterReschedule(zoomDepsFrom(deps), {
						orgId: ctx.orgId,
						classId,
						className: cls.name,
						plan: zoomSyncPlan,
					}),
				);
			}

			const clsAfter = await findClassRow(db, classId, ctx.orgId);
			if (clsAfter?.status === "active" && lessonCount > 0) {
				await backfillStuckEnrollments(db, ctx.orgId, classId);
			}
			return c.json({ id: copyId } satisfies CreatedResponse, 201);
		}

		const hasLesson = existingLessons.length > 0;
		if (!hasLesson) {
			if (lessonCount > 52) {
				return c.json(
					{
						error: "Template vượt quá giới hạn 52 buổi học của lớp.",
						reason: "too-many-lessons",
						code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_TOO_MANY_LESSONS,
					},
					422,
				);
			}
			if (
				cls.schedulingMode === "manual" &&
				cls.sessionsTotal === 0 &&
				lessonCount === 0
			) {
				return c.json(
					{
						error:
							"Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi nhập vào lớp trống.",
						reason: "empty-template",
						code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_EMPTY_TEMPLATE,
					},
					422,
				);
			}
		}
		const candidateSessionsTotal =
			lessonCount > 0 ? lessonCount : cls.sessionsTotal;

		const { copyId, statements } = buildImportBatch(db, {
			template: tpl,
			...tree,
			classId,
			orgId: ctx.orgId,
		});
		statements.push(
			db
				.update(classTable)
				.set({
					syllabusId: copyId,
					sessionsTotal: sql`CASE WHEN EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${ctx.orgId} AND ${lesson.classId} = ${classId}) THEN ${classTable.sessionsTotal} ELSE ${candidateSessionsTotal} END`,
					schedulingMode: sql`CASE WHEN EXISTS (SELECT 1 FROM ${classSession} WHERE ${classSession.classId} = ${classId} AND ${classSession.orgId} = ${ctx.orgId}) THEN NULL ELSE 'auto' END`,
				})
				.where(
					and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)),
				),
		);
		try {
			await db.batch(statements);
		} catch (err: unknown) {
			const after = await findClassCurriculum(db, classId, ctx.orgId);
			// Lost ACK after D1 committed our own copy: proceed to backfill + 201.
			if (!after || after.id !== copyId) {
				if (!isRollbackableConstraintError(err)) {
					throw err;
				}
				const message = err instanceof Error ? err.message : String(err);
				if (/FOREIGN KEY/i.test(message)) {
					if (tree.links.length > 0) {
						const missing = await findMissingLinkedMaterial(
							db,
							ctx.orgId,
							tree.links,
						);
						if (missing !== undefined) {
							return c.json(
								{
									error: "material-not-found",
									materialId: missing,
									code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_MATERIAL_NOT_FOUND,
								},
								422,
							);
						}
					}
					if (!(await findTemplate(db, tpl.id, ctx.orgId))) {
						return c.json({ error: "syllabus not found" }, 404);
					}
				}
				if (after) {
					return c.json(
						{
							error: "Lớp đã có giáo trình",
							code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_ALREADY_EXISTS,
						},
						409,
					);
				}
				const [foreign] = await db
					.select({ id: syllabus.id })
					.from(syllabus)
					.where(eq(syllabus.classId, classId));
				if (foreign) {
					return c.json(
						{
							error: "Lớp đã có giáo trình",
							code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_ALREADY_EXISTS,
						},
						409,
					);
				}
				const [raceCls, raceCsRows, raceLessonRows] = await Promise.all([
					findClassRow(db, classId, ctx.orgId),
					db
						.select({ date: classSession.date })
						.from(classSession)
						.where(
							and(
								eq(classSession.orgId, ctx.orgId),
								eq(classSession.classId, classId),
							),
						),
					db
						.select({
							date: lesson.date,
							status: lesson.status,
							attendance: lesson.attendance,
							attendanceNote: lesson.attendanceNote,
						})
						.from(lesson)
						.where(
							and(eq(lesson.orgId, ctx.orgId), eq(lesson.classId, classId)),
						),
				]);
				if (raceCls && raceCsRows.length > 0) {
					const raceAnalysis = await analyzeManualSessionsConflict(
						db,
						ctx.orgId,
						raceCls,
						tpl.id,
						lessonCount,
						raceCsRows,
						raceLessonRows,
					);
					return manualConflictResponse(c, raceAnalysis);
				}
				throw new Error("import-syllabus batch failed");
			}
		}

		const effectiveTotal = hasLesson
			? cls.sessionsTotal
			: candidateSessionsTotal;
		const clsAfter = await findClassRow(db, classId, ctx.orgId);
		if (clsAfter?.status === "active" && effectiveTotal > 0) {
			await backfillStuckEnrollments(db, ctx.orgId, classId);
		}
		return c.json({ id: copyId } satisfies CreatedResponse, 201);
	};

	const removeCurriculumHandler = async (c: SyllabusContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, removeCurriculumSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const classId = c.req.param("id");
		if (classId === undefined) {
			return c.json({ error: "class not found" }, 404);
		}

		const cls = await findClassRow(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found" }, 404);
		}
		// The copy decides (class_id is the source of truth), not the pointer:
		// no branch on `cls.syllabusId` — a stale/template/cross-org pointer
		// means "no curriculum" for this class.
		const copy = await findClassCurriculum(db, classId, ctx.orgId);
		if (!copy) {
			// Nothing to remove; heal any stale pointer to null (idempotent).
			// The pointed row (templates included) is never deleted here.
			await db.batch([setClassCurriculumPointer(db, classId, ctx.orgId, null)]);
			return c.json({ ok: true });
		}

		const hasRealSessionsSql = sql`EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${ctx.orgId} AND ${lesson.classId} = ${classId}) OR EXISTS (SELECT 1 FROM ${classSession} WHERE ${classSession.orgId} = ${ctx.orgId} AND ${classSession.classId} = ${classId})`;

		// FK order (NO ACTION): null the pointer (and reset manual/0 when the class
		// has 0 real sessions) FIRST, sync session_package.total to 0 when 0 real
		// sessions, then delete child-first (lessons → modules → syllabus).
		await db.batch([
			db
				.update(classTable)
				.set({
					syllabusId: null,
					schedulingMode: sql`CASE WHEN ${hasRealSessionsSql} THEN ${classTable.schedulingMode} ELSE 'manual' END`,
					sessionsTotal: sql`CASE WHEN ${hasRealSessionsSql} THEN ${classTable.sessionsTotal} ELSE 0 END`,
				})
				.where(
					and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)),
				),
			db
				.update(sessionPackage)
				.set({
					total: sql`CASE WHEN ${hasRealSessionsSql} THEN ${sessionPackage.total} ELSE 0 END`,
				})
				.where(
					and(
						eq(sessionPackage.orgId, ctx.orgId),
						inArray(
							sessionPackage.enrollmentId,
							db
								.select({ id: enrollment.id })
								.from(enrollment)
								.where(
									and(
										eq(enrollment.orgId, ctx.orgId),
										eq(enrollment.classId, classId),
										eq(enrollment.status, "active"),
									),
								),
						),
					),
				),
			db.delete(syllabusLesson).where(
				and(
					eq(syllabusLesson.orgId, ctx.orgId),
					inArray(
						syllabusLesson.moduleId,
						db
							.select({ id: syllabusModule.id })
							.from(syllabusModule)
							.where(
								and(
									eq(syllabusModule.syllabusId, copy.id),
									eq(syllabusModule.orgId, ctx.orgId),
								),
							),
					),
				),
			),
			db
				.delete(syllabusModule)
				.where(
					and(
						eq(syllabusModule.syllabusId, copy.id),
						eq(syllabusModule.orgId, ctx.orgId),
					),
				),
			db
				.delete(syllabus)
				.where(and(eq(syllabus.id, copy.id), eq(syllabus.orgId, ctx.orgId))),
		]);
		return c.json({ ok: true });
	};

	const syncCurriculumHandler = async (c: SyllabusContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, syncCurriculumSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const classId = c.req.param("id");
		if (classId === undefined) {
			return c.json({ error: "class not found" }, 404);
		}

		const cls = await findClassRow(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found" }, 404);
		}
		const copy = await findClassCurriculum(db, classId, ctx.orgId);
		if (!copy) {
			return c.json(
				{
					error: "Lớp chưa có giáo trình để đồng bộ.",
					code: "CURRICULUM_NOT_FOUND",
				},
				409,
			);
		}

		let tpl: typeof syllabus.$inferSelect | undefined;
		if (body.data.templateId !== undefined) {
			tpl = await findTemplate(db, body.data.templateId, ctx.orgId);
			if (!tpl) {
				return c.json({ error: "syllabus not found" }, 404);
			}
		} else {
			if (!copy.sourceTemplateId) {
				return c.json(
					{
						error:
							"Template gốc đã bị xóa. Vui lòng chọn một template khác để đồng bộ.",
						code: "CURRICULUM_SOURCE_TEMPLATE_MISSING",
					},
					422,
				);
			}
			tpl = await findTemplate(db, copy.sourceTemplateId, ctx.orgId);
			if (!tpl) {
				return c.json(
					{
						error:
							"Template gốc đã bị xóa. Vui lòng chọn một template khác để đồng bộ.",
						code: "CURRICULUM_SOURCE_TEMPLATE_MISSING",
					},
					422,
				);
			}
		}

		const [tree, existingCopyTree, existingCs, existingLesson] =
			await Promise.all([
				selectTemplateTree(db, tpl.id, ctx.orgId),
				selectTemplateTree(db, copy.id, ctx.orgId),
				db
					.select({ id: classSession.id })
					.from(classSession)
					.where(
						and(
							eq(classSession.orgId, ctx.orgId),
							eq(classSession.classId, classId),
						),
					)
					.limit(1),
				db
					.select({ id: lesson.id })
					.from(lesson)
					.where(and(eq(lesson.orgId, ctx.orgId), eq(lesson.classId, classId)))
					.limit(1),
			]);

		if (
			tree.modules.length + tree.lessons.length + tree.links.length >
			MAX_IMPORT_NODES
		) {
			return c.json(
				{
					error: "Template quá lớn để đồng bộ.",
					code: "CURRICULUM_TEMPLATE_TOO_LARGE",
				},
				422,
			);
		}

		const missingMaterial = await findMissingLinkedMaterial(
			db,
			ctx.orgId,
			tree.links,
		);
		if (missingMaterial !== undefined) {
			return c.json(
				{
					error: "material-not-found",
					materialId: missingMaterial,
					code: "CURRICULUM_MATERIAL_NOT_FOUND",
				},
				422,
			);
		}

		if (existingCs.length > 0) {
			return c.json(
				{
					error:
						"Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi đồng bộ giáo trình.",
					reason: "has-manual-sessions",
					code: "MANUAL_SESSIONS_EXIST",
				},
				409,
			);
		}

		const lessonCount = tree.lessons.length;
		if (lessonCount === 0) {
			return c.json(
				{
					error:
						"Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi đồng bộ.",
					reason: "empty-template",
					code: "CURRICULUM_EMPTY_TEMPLATE",
				},
				422,
			);
		}
		const hasLesson = existingLesson.length > 0;
		if (lessonCount > 52) {
			return c.json(
				{
					error: "Template vượt quá giới hạn 52 buổi học của lớp.",
					reason: "too-many-lessons",
					code: "CURRICULUM_TOO_MANY_LESSONS",
				},
				422,
			);
		}

		const previousStatuses = flattenSyllabusLessons(
			existingCopyTree.modules,
			existingCopyTree.lessons,
		).map((l) => l.status);
		const { statements } = buildSyncBatch(db, {
			copyId: copy.id,
			template: tpl,
			...tree,
			previousStatuses,
			orgId: ctx.orgId,
		});

		const candidateSessionsTotal = lessonCount;
		statements.push(
			db
				.update(classTable)
				.set({
					syllabusId: copy.id,
					sessionsTotal: sql`CASE WHEN EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${ctx.orgId} AND ${lesson.classId} = ${classId}) OR EXISTS (SELECT 1 FROM ${classSession} WHERE ${classSession.orgId} = ${ctx.orgId} AND ${classSession.classId} = ${classId}) THEN ${classTable.sessionsTotal} ELSE ${candidateSessionsTotal} END`,
					schedulingMode: sql`CASE WHEN EXISTS (SELECT 1 FROM ${classSession} WHERE ${classSession.classId} = ${classId} AND ${classSession.orgId} = ${ctx.orgId}) THEN NULL ELSE 'auto' END`,
				})
				.where(
					and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)),
				),
		);

		try {
			await db.batch(statements);
		} catch (err: unknown) {
			if (!isRollbackableConstraintError(err)) {
				throw err;
			}
			const message = err instanceof Error ? err.message : String(err);
			if (/FOREIGN KEY/i.test(message)) {
				if (tree.links.length > 0) {
					const missing = await findMissingLinkedMaterial(
						db,
						ctx.orgId,
						tree.links,
					);
					if (missing !== undefined) {
						return c.json(
							{
								error: "material-not-found",
								materialId: missing,
								code: "CURRICULUM_MATERIAL_NOT_FOUND",
							},
							422,
						);
					}
				}
				const afterCopy = await findClassCurriculum(db, classId, ctx.orgId);
				if (!afterCopy || afterCopy.id !== copy.id) {
					return c.json(
						{
							error: "Lớp chưa có giáo trình để đồng bộ.",
							code: "CURRICULUM_NOT_FOUND",
						},
						409,
					);
				}
				const afterTpl = await findTemplate(db, tpl.id, ctx.orgId);
				if (!afterTpl) {
					if (body.data.templateId !== undefined) {
						return c.json({ error: "syllabus not found" }, 404);
					}
					return c.json(
						{
							error:
								"Template gốc đã bị xóa. Vui lòng chọn một template khác để đồng bộ.",
							code: "CURRICULUM_SOURCE_TEMPLATE_MISSING",
						},
						422,
					);
				}
			}
			const [raceCs] = await db
				.select({ id: classSession.id })
				.from(classSession)
				.where(
					and(
						eq(classSession.orgId, ctx.orgId),
						eq(classSession.classId, classId),
					),
				)
				.limit(1);
			if (raceCs) {
				return c.json(
					{
						error:
							"Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi đồng bộ giáo trình.",
						reason: "has-manual-sessions",
						code: "MANUAL_SESSIONS_EXIST",
					},
					409,
				);
			}
			throw err;
		}

		const clsAfter = await findClassRow(db, classId, ctx.orgId);
		if (
			clsAfter?.status === "active" &&
			!hasLesson &&
			candidateSessionsTotal > 0
		) {
			await backfillStuckEnrollments(db, ctx.orgId, classId);
		}
		return c.json({ ok: true, id: copy.id }, 200);
	};

	//
	// Registration: mỗi operation một path ngữ cảnh duy nhất — alias cũ
	// (/syllabi, import-syllabus, remove-curriculum) đã gỡ ở phase 8 (#401).
	//
	routes.post(
		"/syllabus-templates",
		async (c, next) => {
			if (!c.get("kernelCtx")) return unauthorized(c);
			return next();
		},
		bodyLimit({
			maxSize: 2 * 1024 * 1024,
			onError: (c) =>
				c.json({ error: "Dữ liệu syllabus vượt giới hạn 2 MiB." }, 413),
		}),
	);
	routes.post("/syllabus-templates", (c) => createTemplateHandler(c));

	routes.post("/syllabus-templates/:id/replace-content", (c) =>
		replaceContentHandler(c),
	);
	routes.post("/syllabus-templates/:id/remove", (c) =>
		removeTemplateHandler(c),
	);
	routes.post("/classes/:id/curriculum/import", (c) =>
		importCurriculumHandler(c),
	);
	routes.post("/classes/:id/curriculum/sync", (c) => syncCurriculumHandler(c));
	routes.post("/classes/:id/curriculum/remove", (c) =>
		removeCurriculumHandler(c),
	);

	// Content routes (module/lesson) mounted once per scope (design D5):
	// template scope and class-curriculum scope. Handlers only use the
	// resolved syllabus id — never the raw :id param.
	mountContentRoutes(routes, {
		basePath: "/syllabus-templates/:id",
		resolve: async (c, db, orgId) => {
			const id = c.req.param("id");
			if (id === undefined) return undefined;
			return findTemplate(db, id, orgId);
		},
		deps,
		readBody,
		unauthorized,
	});
	mountContentRoutes(routes, {
		basePath: "/classes/:id/curriculum",
		resolve: async (c, db, orgId) => {
			const id = c.req.param("id");
			if (id === undefined) return undefined;
			const cls = await findClassRow(db, id, orgId);
			if (!cls) return undefined;
			return findClassCurriculum(db, cls.id, orgId);
		},
		deps,
		readBody,
		unauthorized,
	});

	return routes;
}
