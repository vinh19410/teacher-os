import {
	HOLIDAY_ERROR_CODES,
	type HolidayDraft,
	type HolidayMode,
	type HolidayPreview,
	holidayApplySchema,
	holidayDraftSchema,
} from "@teacher-os/api/contracts";
import {
	type PlannedCancellation,
	type PlannedShift,
	planHolidayShift,
} from "@teacher-os/api/holiday-plan";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { classTable } from "@teacher-os/db/schema/class";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import { lesson } from "@teacher-os/db/schema/lesson";
import { notif } from "@teacher-os/db/schema/notif";
import {
	holidaySessionCancel,
	holidaySessionShift,
	organizationHoliday,
	organizationHolidayClass,
} from "@teacher-os/db/schema/organization-holiday";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../app";
import {
	emitNotifications,
	notificationDepsFrom,
} from "../lib/notifications/emit";
import { holidayCreatedEvents } from "../lib/notifications/templates";

/** Chia nhỏ inArray theo ngưỡng 50 để tránh trần bind parameter của D1 (#366 RT-F2). */
const D1_IN_ARRAY_CHUNK = 50;

/** Trần số câu lệnh trong một batch apply (I5) — vượt thì 422, không cắt âm thầm. */
const MAX_APPLY_STATEMENTS = 500;

type Env = { Variables: { kernelCtx: KernelCtx } };
type HolidayContext = Context<Env>;

interface ApplicableClass {
	id: string;
	name: string;
	schedule: string;
}

interface PlanClassLessonRow {
	classId: string;
	date: string | null;
	status: string;
	enrollmentId: string;
}

/** dd/MM HH:mm theo giờ VN — Workers chạy UTC, getter local lệch ngày
 * trước 07:00 Asia/Ho_Chi_Minh (giống formatDayMonth của activation). */
function formatNotifTime(date: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: "Asia/Ho_Chi_Minh",
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);
}

/** Hash ổn định của danh sách shift/cancellation (I7 + TOS-13) — preview trả, apply gửi lại. */
async function planHashOf(
	mode: HolidayMode,
	shifts: PlannedShift[],
	cancellations: PlannedCancellation[],
): Promise<string> {
	const payload =
		mode === "cancel"
			? `cancel\n${cancellations
					.map((c) => `${c.classId}|${c.date}|${c.enrollmentIds.length}`)
					.join("\n")}`
			: shifts
					.map(
						(shift) =>
							`${shift.classId}|${shift.originalDate}|${shift.makeupDate}|${shift.enrollmentIds.length}`,
					)
					.join("\n");
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(payload),
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

/** Lớp áp dụng (loader bước 1): scope org → mọi lớp active; scope classes →
 * đúng các `classIds` thuộc org (lớp lạ/lệch org → 404, NFR-005). */
async function loadApplicableClasses(
	db: Db,
	orgId: string,
	draft: HolidayDraft,
): Promise<ApplicableClass[] | "class-not-found"> {
	if (draft.scope === "org") {
		return db
			.select({
				id: classTable.id,
				name: classTable.name,
				schedule: classTable.schedule,
			})
			.from(classTable)
			.where(and(eq(classTable.orgId, orgId), eq(classTable.status, "active")));
	}
	const wanted = [...new Set(draft.classIds)];
	const found: ApplicableClass[] = [];
	for (let i = 0; i < wanted.length; i += D1_IN_ARRAY_CHUNK) {
		const slice = wanted.slice(i, i + D1_IN_ARRAY_CHUNK);
		const rows = await db
			.select({
				id: classTable.id,
				name: classTable.name,
				schedule: classTable.schedule,
			})
			.from(classTable)
			.where(
				and(
					eq(classTable.orgId, orgId),
					eq(classTable.status, "active"),
					inArray(classTable.id, slice),
				),
			);
		found.push(...rows);
	}
	if (found.length !== wanted.length) return "class-not-found";
	return found;
}

/** Lesson của các lớp (loader bước 2) — chỉ cột planner cần, chunk 50. */
async function loadClassLessons(
	db: Db,
	orgId: string,
	classIds: string[],
): Promise<PlanClassLessonRow[]> {
	const rows: PlanClassLessonRow[] = [];
	for (let i = 0; i < classIds.length; i += D1_IN_ARRAY_CHUNK) {
		const slice = classIds.slice(i, i + D1_IN_ARRAY_CHUNK);
		const chunk = await db
			.select({
				classId: lesson.classId,
				date: lesson.date,
				status: lesson.status,
				enrollmentId: lesson.enrollmentId,
			})
			.from(lesson)
			.where(and(eq(lesson.orgId, orgId), inArray(lesson.classId, slice)));
		rows.push(...chunk);
	}
	return rows;
}

/** Kỳ nghỉ hiện có giao với từng lớp (loader bước 3): scope org hiệu lực
 * với mọi lớp; scope classes chỉ với các lớp trong organization_holiday_class.
 * Trả classId → (date → tên kỳ nghỉ); duyệt theo createdAt ASC, id — kỳ
 * khai báo trước thắng khi hai kỳ chồng ngày (red-team I2). */
async function loadExistingHolidayDates(
	db: Db,
	orgId: string,
	classIds: string[],
): Promise<Map<string, Map<string, string>>> {
	const datesByClass = new Map<string, Map<string, string>>();
	if (classIds.length === 0) return datesByClass;
	const orgHolidays = await db
		.select({
			id: organizationHoliday.id,
			name: organizationHoliday.name,
			fromDate: organizationHoliday.fromDate,
			toDate: organizationHoliday.toDate,
			scope: organizationHoliday.scope,
		})
		.from(organizationHoliday)
		.where(eq(organizationHoliday.orgId, orgId))
		.orderBy(asc(organizationHoliday.createdAt), asc(organizationHoliday.id));
	if (orgHolidays.length === 0) return datesByClass;
	const scopedRows = await db
		.select({
			holidayId: organizationHolidayClass.holidayId,
			classId: organizationHolidayClass.classId,
		})
		.from(organizationHolidayClass)
		.where(
			inArray(
				organizationHolidayClass.holidayId,
				orgHolidays.map((row) => row.id),
			),
		);
	const scopedByHoliday = new Map<string, string[]>();
	for (const row of scopedRows) {
		const list = scopedByHoliday.get(row.holidayId);
		if (list) list.push(row.classId);
		else scopedByHoliday.set(row.holidayId, [row.classId]);
	}
	const addDate = (classId: string, date: string, name: string) => {
		let byDate = datesByClass.get(classId);
		if (!byDate) {
			byDate = new Map<string, string>();
			datesByClass.set(classId, byDate);
		}
		if (!byDate.has(date)) byDate.set(date, name);
	};
	const classIdSet = new Set(classIds);
	for (const holiday of orgHolidays) {
		const targets =
			holiday.scope === "org"
				? classIds
				: (scopedByHoliday.get(holiday.id) ?? []).filter((classId) =>
						classIdSet.has(classId),
					);
		for (let d = holiday.fromDate; d <= holiday.toDate; d = addDaysISO(d, 1)) {
			for (const classId of targets) addDate(classId, d, holiday.name);
		}
	}
	return datesByClass;
}

/** Loader + planner chung cho preview và apply (D7) — apply luôn gọi lại từ
 * DB, không tin bảng preview của client. `shifts` giữ enrollmentIds để
 * guard batch đếm chính xác; response map bỏ chúng trước khi rời server. */
async function buildPlan(
	db: Db,
	orgId: string,
	draft: HolidayDraft,
): Promise<
	| { ok: false; notFound: true }
	| {
			ok: true;
			shifts: PlannedShift[];
			cancellations: PlannedCancellation[];
			preview: HolidayPreview;
	  }
> {
	const classes = await loadApplicableClasses(db, orgId, draft);
	if (classes === "class-not-found") return { ok: false, notFound: true };
	const lessons =
		classes.length > 0
			? await loadClassLessons(
					db,
					orgId,
					classes.map((cls) => cls.id),
				)
			: [];
	const lessonsByClass = new Map<string, PlanClassLessonRow[]>();
	for (const row of lessons) {
		const list = lessonsByClass.get(row.classId);
		if (list) list.push(row);
		else lessonsByClass.set(row.classId, [row]);
	}
	const existingHolidayDates = await loadExistingHolidayDates(
		db,
		orgId,
		classes.map((cls) => cls.id),
	);
	const planned = planHolidayShift({
		range: { fromDate: draft.fromDate, toDate: draft.toDate },
		classes: classes.map((cls) => ({
			id: cls.id,
			name: cls.name,
			schedule: cls.schedule,
			lessons: lessonsByClass.get(cls.id) ?? [],
		})),
		existingHolidayDates,
		todayISO: vietnamTodayISO(),
		mode: draft.mode,
	});
	const affectedClassIds = new Set([
		...planned.shifts.map((s) => s.classId),
		...planned.cancellations.map((c) => c.classId),
	]);
	return {
		ok: true,
		shifts: planned.shifts,
		cancellations: planned.cancellations,
		preview: {
			shifts: planned.shifts.map(({ enrollmentIds, ...shift }) => {
				void enrollmentIds;
				return shift;
			}),
			cancellations: planned.cancellations.map(
				({ enrollmentIds, ...cancel }) => {
					void enrollmentIds;
					return cancel;
				},
			),
			keptCompleted: planned.keptCompleted,
			unsupported: planned.unsupported,
			affectedClassCount: affectedClassIds.size,
			planHash: await planHashOf(
				draft.mode,
				planned.shifts,
				planned.cancellations,
			),
		},
	};
}

/** Áp dụng một shift trong batch (D7 + red-team C1): guard INSERT-CASE biến
 * `originalDate` thành NULL khi trạng thái lệch (buổi vừa bị điểm danh /
 * ngày bù đã có dòng / makeup đã bị chiếm) — cột NOT NULL làm TOÀN batch
 * rollback, vì D1 không rollback UPDATE-khớp-0-dòng. Buổi bù sinh bằng một
 * câu INSERT…SELECT từ các dòng `holiday` vừa tạo (~3 câu/shift, I5). */
function shiftStatements(
	db: Db,
	orgId: string,
	holidayId: string,
	shift: PlannedShift,
) {
	const guard = sql`CASE WHEN (SELECT count(*) FROM ${lesson} WHERE ${lesson.orgId} = ${orgId} AND ${lesson.classId} = ${shift.classId} AND ${lesson.date} = ${shift.originalDate} AND ${lesson.status} = 'upcoming') = ${shift.enrollmentIds.length} AND (SELECT count(*) FROM ${lesson} WHERE ${lesson.orgId} = ${orgId} AND ${lesson.classId} = ${shift.classId} AND ${lesson.date} = ${shift.makeupDate}) = 0 AND (SELECT count(*) FROM ${holidaySessionShift} WHERE ${holidaySessionShift.classId} = ${shift.classId} AND ${holidaySessionShift.makeupDate} = ${shift.makeupDate}) = 0 THEN ${shift.originalDate} ELSE NULL END`;
	return [
		db.insert(holidaySessionShift).values({
			id: crypto.randomUUID(),
			orgId,
			holidayId,
			classId: shift.classId,
			originalDate: guard,
			makeupDate: shift.makeupDate,
		}),
		db
			.update(lesson)
			.set({ status: "holiday" })
			.where(
				and(
					eq(lesson.orgId, orgId),
					eq(lesson.classId, shift.classId),
					eq(lesson.date, shift.originalDate),
					eq(lesson.status, "upcoming"),
				),
			),
		db.insert(lesson).select(
			db
				.select({
					id: sql<string>`'holmk-' || lower(hex(randomblob(12)))`.as("id"),
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
					zoom: sql<string>`''`.as("zoom"),
					createdAt: sql`(cast(unixepoch('subsecond') * 1000 as integer))`.as(
						"created_at",
					),
				})
				.from(lesson)
				.where(
					and(
						eq(lesson.orgId, orgId),
						eq(lesson.classId, shift.classId),
						eq(lesson.date, shift.originalDate),
						eq(lesson.status, "holiday"),
					),
				),
		),
	];
}

/** Áp dụng một cancellation trong batch (TOS-13 D1): guard INSERT-CASE biến
 * `date` thành NULL khi trạng thái lệch (buổi vừa bị điểm danh hoặc ngày đó
 * đã có dòng trong `holiday_session_cancel`) — cột NOT NULL làm toàn batch
 * rollback. Sau đó UPDATE các dòng `upcoming` cùng ngày sang `cancelled`. */
function cancelStatements(
	db: Db,
	orgId: string,
	holidayId: string,
	cancellation: PlannedCancellation,
) {
	const guard = sql`CASE WHEN (SELECT count(*) FROM ${lesson} WHERE ${lesson.orgId} = ${orgId} AND ${lesson.classId} = ${cancellation.classId} AND ${lesson.date} = ${cancellation.date} AND ${lesson.status} = 'upcoming') = ${cancellation.enrollmentIds.length} AND (SELECT count(*) FROM ${lesson} WHERE ${lesson.orgId} = ${orgId} AND ${lesson.classId} = ${cancellation.classId} AND ${lesson.date} = ${cancellation.date} AND ${lesson.status} != 'upcoming') = 0 AND (SELECT count(*) FROM ${holidaySessionCancel} WHERE ${holidaySessionCancel.classId} = ${cancellation.classId} AND ${holidaySessionCancel.date} = ${cancellation.date}) = 0 THEN ${cancellation.date} ELSE NULL END`;
	return [
		db.insert(holidaySessionCancel).values({
			id: crypto.randomUUID(),
			orgId,
			holidayId,
			classId: cancellation.classId,
			date: guard,
		}),
		db
			.update(lesson)
			.set({ status: "cancelled" })
			.where(
				and(
					eq(lesson.orgId, orgId),
					eq(lesson.classId, cancellation.classId),
					eq(lesson.date, cancellation.date),
					eq(lesson.status, "upcoming"),
				),
			),
	];
}

/** Lỗi constraint (UNIQUE/NOT NULL) từ guard CASE — batch đã rollback sạch,
 * caller xử lý 409 hoặc retry đọc lại. Lỗi khác là sự cố thật, phải ném. */
export function isRollbackableConstraintError(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err);
	return /UNIQUE|NOT NULL|FOREIGN KEY/i.test(message);
}

export function holidayRoutes(deps: {
	getDb(): Db;
	/** #454 D9: phát holiday_created sau khi apply thành công. */
	mailer?: Parameters<typeof emitNotifications>[0]["mailer"];
	runInBackground?: Parameters<typeof emitNotifications>[0]["runInBackground"];
	/** #454: origin cổng học viên cho link tuyệt đối trong thư. */
	studentOrigin?: Parameters<typeof emitNotifications>[0]["studentOrigin"];
}) {
	const holiday = new Hono<Env>();

	function unauthorized(c: HolidayContext) {
		return c.json({ error: "unauthorized" }, 401);
	}

	async function readBody<S extends z.ZodType>(
		c: HolidayContext,
		schema: S,
	): Promise<
		{ ok: true; data: z.infer<S> } | { ok: false; response: Response }
	> {
		const contentType = c.req.header("Content-Type") ?? "";
		if (!contentType.toLowerCase().startsWith("application/json")) {
			return {
				ok: false,
				response: c.json(
					{ error: "content-type must be application/json" },
					415,
				),
			};
		}
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

	holiday.post("/preview", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, holidayDraftSchema);
		if (!body.ok) return body.response;
		const plan = await buildPlan(deps.getDb(), ctx.orgId, body.data);
		if (!plan.ok) {
			return c.json({ error: "class not found", reason: "class" }, 404);
		}
		return c.json(plan.preview);
	});

	holiday.post("/", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, holidayApplySchema);
		if (!body.ok) return body.response;
		const input = body.data;
		// I2: chỉ dời buổi chưa diễn ra — khoảng đã qua bị từ chối 422.
		if (input.fromDate < vietnamTodayISO()) {
			return c.json(
				{
					error: HOLIDAY_ERROR_CODES.PAST_RANGE,
					reason: HOLIDAY_ERROR_CODES.PAST_RANGE,
				},
				422,
			);
		}
		const db = deps.getDb();
		// D7: tính lại từ DB — planHash lệch nghĩa là bảng GV đã xem không còn đúng.
		const plan = await buildPlan(db, ctx.orgId, input);
		if (!plan.ok) {
			return c.json({ error: "class not found", reason: "class" }, 404);
		}
		const activeCount =
			input.mode === "cancel" ? plan.cancellations.length : plan.shifts.length;
		if (activeCount === 0) {
			return c.json(
				{
					error: HOLIDAY_ERROR_CODES.NO_SESSIONS,
					reason: HOLIDAY_ERROR_CODES.NO_SESSIONS,
				},
				422,
			);
		}
		if (
			(await planHashOf(input.mode, plan.shifts, plan.cancellations)) !==
			input.planHash
		) {
			return c.json(
				{
					error: HOLIDAY_ERROR_CODES.STALE_PREVIEW,
					reason: HOLIDAY_ERROR_CODES.STALE_PREVIEW,
				},
				409,
			);
		}
		const holidayId = crypto.randomUUID();
		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db.insert(organizationHoliday).values({
				id: holidayId,
				orgId: ctx.orgId,
				name: input.name,
				fromDate: input.fromDate,
				toDate: input.toDate,
				scope: input.scope,
				mode: input.mode,
				notify: input.notify,
				createdByUserId: ctx.userId,
			}),
		];
		if (input.scope === "classes") {
			for (const classId of new Set(input.classIds)) {
				statements.push(
					db.insert(organizationHolidayClass).values({
						id: crypto.randomUUID(),
						holidayId,
						classId,
					}),
				);
			}
		}
		if (input.mode === "cancel") {
			for (const cancellation of plan.cancellations) {
				statements.push(
					...cancelStatements(db, ctx.orgId, holidayId, cancellation),
				);
			}
		} else {
			for (const shift of plan.shifts) {
				statements.push(...shiftStatements(db, ctx.orgId, holidayId, shift));
			}
		}
		if (input.notify) {
			const notifText =
				input.mode === "cancel"
					? `Lịch nghỉ «${input.name}»: hủy ${plan.cancellations.length} buổi của ${plan.preview.affectedClassCount} lớp`
					: `Lịch nghỉ «${input.name}»: dời ${plan.shifts.length} buổi của ${plan.preview.affectedClassCount} lớp`;
			statements.push(
				db.insert(notif).values({
					id: crypto.randomUUID(),
					orgId: ctx.orgId,
					text: notifText,
					time: formatNotifTime(new Date()),
					channel: "schedule",
					dot: "warn",
				}),
			);
		}
		if (statements.length > MAX_APPLY_STATEMENTS) {
			return c.json(
				{
					error: HOLIDAY_ERROR_CODES.TOO_LARGE,
					reason: HOLIDAY_ERROR_CODES.TOO_LARGE,
				},
				422,
			);
		}
		try {
			await db.batch(statements);
		} catch (err: unknown) {
			// Guard CASE (C1) hoặc unique makeup (C3) vi phạm → rollback toàn
			// batch, DB sạch — client phải tải lại preview và thử lại.
			if (isRollbackableConstraintError(err)) {
				return c.json(
					{
						error: HOLIDAY_ERROR_CODES.STALE_PREVIEW,
						reason: HOLIDAY_ERROR_CODES.STALE_PREVIEW,
					},
					409,
				);
			}
			throw err;
		}
		const result = {
			holidayId,
			shiftedCount: plan.shifts.length,
			cancelledCount: plan.cancellations.length,
			classCount: plan.preview.affectedClassCount,
		};
		// #454 D9: notify=true → holiday_created cho học viên ACTIVE của các
		// lớp bị ảnh hưởng; emit tự fail-open nên không đổi response 200.
		if (input.notify) {
			const affectedClassIds = [
				...new Set([
					...plan.shifts.map((shift) => shift.classId),
					...plan.cancellations.map((cancel) => cancel.classId),
				]),
			];
			const studentIds = new Set<string>();
			for (let i = 0; i < affectedClassIds.length; i += D1_IN_ARRAY_CHUNK) {
				const slice = affectedClassIds.slice(i, i + D1_IN_ARRAY_CHUNK);
				const rows = await db
					.select({ studentId: enrollment.studentId })
					.from(enrollment)
					.where(
						and(
							eq(enrollment.orgId, ctx.orgId),
							inArray(enrollment.classId, slice),
							eq(enrollment.status, "active"),
						),
					);
				for (const row of rows) studentIds.add(row.studentId);
			}
			await emitNotifications(
				notificationDepsFrom(deps),
				ctx.orgId,
				holidayCreatedEvents({
					holidayId,
					title: input.name,
					date: input.fromDate,
					studentIds: [...studentIds],
				}),
			);
		}
		return c.json(result);
	});

	holiday.delete("/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const holidayId = c.req.param("id");
		const db = deps.getDb();

		const [existing] = await db
			.select({
				id: organizationHoliday.id,
				name: organizationHoliday.name,
				fromDate: organizationHoliday.fromDate,
			})
			.from(organizationHoliday)
			.where(
				and(
					eq(organizationHoliday.id, holidayId),
					eq(organizationHoliday.orgId, ctx.orgId),
				),
			);
		if (!existing) {
			return c.json({ error: "holiday not found", reason: "holiday" }, 404);
		}
		// D3: chỉ hoàn tác kỳ nghỉ tương lai (fromDate > hôm nay theo giờ VN).
		if (existing.fromDate <= vietnamTodayISO()) {
			return c.json(
				{
					error: HOLIDAY_ERROR_CODES.HOLIDAY_STARTED,
					reason: HOLIDAY_ERROR_CODES.HOLIDAY_STARTED,
				},
				422,
			);
		}

		const shifts = await db
			.select({
				id: holidaySessionShift.id,
				classId: holidaySessionShift.classId,
				originalDate: holidaySessionShift.originalDate,
				makeupDate: holidaySessionShift.makeupDate,
			})
			.from(holidaySessionShift)
			.where(
				and(
					eq(holidaySessionShift.orgId, ctx.orgId),
					eq(holidaySessionShift.holidayId, holidayId),
				),
			)
			.orderBy(
				asc(holidaySessionShift.classId),
				asc(holidaySessionShift.originalDate),
			);
		const cancels = await db
			.select({
				id: holidaySessionCancel.id,
				classId: holidaySessionCancel.classId,
				date: holidaySessionCancel.date,
			})
			.from(holidaySessionCancel)
			.where(
				and(
					eq(holidaySessionCancel.orgId, ctx.orgId),
					eq(holidaySessionCancel.holidayId, holidayId),
				),
			)
			.orderBy(
				asc(holidaySessionCancel.classId),
				asc(holidaySessionCancel.date),
			);

		// D4: tải lesson của các lớp liên quan theo chunk 50 (không N+1), kiểm tra
		// mọi buổi bù còn nguyên `upcoming` và mọi buổi cancel còn nguyên `cancelled`.
		const affectedClassIds = [
			...new Set([
				...shifts.map((s) => s.classId),
				...cancels.map((cancel) => cancel.classId),
			]),
		];
		const allLessons =
			affectedClassIds.length > 0
				? await loadClassLessons(db, ctx.orgId, affectedClassIds)
				: [];
		const lessonsByClassDate = new Map<string, PlanClassLessonRow[]>();
		for (const row of allLessons) {
			if (!row.date) continue;
			const key = `${row.classId}|${row.date}`;
			const list = lessonsByClassDate.get(key);
			if (list) list.push(row);
			else lessonsByClassDate.set(key, [row]);
		}

		const touched: Array<{ classId: string; makeupDate: string }> = [];
		const shiftCounts: Array<{
			shift: (typeof shifts)[number];
			origCount: number;
			makeupCount: number;
		}> = [];
		for (const shift of shifts) {
			const makeupRows =
				lessonsByClassDate.get(`${shift.classId}|${shift.makeupDate}`) ?? [];
			const origRows =
				lessonsByClassDate.get(`${shift.classId}|${shift.originalDate}`) ?? [];
			const origHolidayRows = origRows.filter(
				(row) => row.status === "holiday",
			);
			if (
				origHolidayRows.length === 0 ||
				makeupRows.some((row) => row.status !== "upcoming") ||
				makeupRows.length !== origHolidayRows.length
			) {
				touched.push({
					classId: shift.classId,
					makeupDate: shift.makeupDate,
				});
				continue;
			}
			shiftCounts.push({
				shift,
				origCount: origHolidayRows.length,
				makeupCount: makeupRows.length,
			});
		}

		const cancelCounts: Array<{
			cancel: (typeof cancels)[number];
			cancelledCount: number;
		}> = [];
		for (const cancel of cancels) {
			const bucketRows =
				lessonsByClassDate.get(`${cancel.classId}|${cancel.date}`) ?? [];
			const cancelledRows = bucketRows.filter(
				(row) => row.status === "cancelled",
			);
			if (
				cancelledRows.length === 0 ||
				cancelledRows.length !== bucketRows.length
			) {
				touched.push({
					classId: cancel.classId,
					makeupDate: cancel.date,
				});
				continue;
			}
			cancelCounts.push({
				cancel,
				cancelledCount: cancelledRows.length,
			});
		}

		if (touched.length > 0) {
			return c.json(
				{
					error: HOLIDAY_ERROR_CODES.MAKEUP_TOUCHED,
					reason: HOLIDAY_ERROR_CODES.MAKEUP_TOUCHED,
					touched,
				},
				409,
			);
		}

		// D5: 1 batch nguyên tử — gộp toàn bộ điều kiện guard vào 1 câu UPDATE
		// trên `organization_holiday` ở đầu batch (nếu lệch biến `name` NOT NULL
		// thành NULL → rollback toàn batch).
		const guardParts = [
			sql`(SELECT count(*) FROM ${holidaySessionShift} WHERE ${holidaySessionShift.holidayId} = ${holidayId}) = ${shifts.length}`,
			sql`(SELECT count(*) FROM ${holidaySessionCancel} WHERE ${holidaySessionCancel.holidayId} = ${holidayId}) = ${cancels.length}`,
			...shiftCounts.map(
				({ shift, origCount, makeupCount }) =>
					sql`(SELECT count(*) FROM ${lesson} WHERE ${lesson.orgId} = ${ctx.orgId} AND ${lesson.classId} = ${shift.classId} AND ${lesson.date} = ${shift.makeupDate} AND ${lesson.status} = 'upcoming') = ${makeupCount} AND (SELECT count(*) FROM ${lesson} WHERE ${lesson.orgId} = ${ctx.orgId} AND ${lesson.classId} = ${shift.classId} AND ${lesson.date} = ${shift.makeupDate} AND ${lesson.status} != 'upcoming') = 0 AND (SELECT count(*) FROM ${lesson} WHERE ${lesson.orgId} = ${ctx.orgId} AND ${lesson.classId} = ${shift.classId} AND ${lesson.date} = ${shift.originalDate} AND ${lesson.status} = 'holiday') = ${origCount}`,
			),
			...cancelCounts.map(
				({ cancel, cancelledCount }) =>
					sql`(SELECT count(*) FROM ${lesson} WHERE ${lesson.orgId} = ${ctx.orgId} AND ${lesson.classId} = ${cancel.classId} AND ${lesson.date} = ${cancel.date} AND ${lesson.status} = 'cancelled') = ${cancelledCount} AND (SELECT count(*) FROM ${lesson} WHERE ${lesson.orgId} = ${ctx.orgId} AND ${lesson.classId} = ${cancel.classId} AND ${lesson.date} = ${cancel.date} AND ${lesson.status} != 'cancelled') = 0`,
			),
		];
		const combinedGuard = sql.join(guardParts, sql` AND `);

		const undoStatements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db
				.update(organizationHoliday)
				.set({
					name: sql`CASE WHEN ${combinedGuard} THEN ${organizationHoliday.name} ELSE NULL END`,
				})
				.where(
					and(
						eq(organizationHoliday.id, holidayId),
						eq(organizationHoliday.orgId, ctx.orgId),
					),
				),
		];
		for (const { shift } of shiftCounts) {
			undoStatements.push(
				db
					.delete(lesson)
					.where(
						and(
							eq(lesson.orgId, ctx.orgId),
							eq(lesson.classId, shift.classId),
							eq(lesson.date, shift.makeupDate),
							eq(lesson.status, "upcoming"),
						),
					),
				db
					.update(lesson)
					.set({ status: "upcoming" })
					.where(
						and(
							eq(lesson.orgId, ctx.orgId),
							eq(lesson.classId, shift.classId),
							eq(lesson.date, shift.originalDate),
							eq(lesson.status, "holiday"),
						),
					),
			);
		}
		for (const { cancel } of cancelCounts) {
			undoStatements.push(
				db
					.update(lesson)
					.set({ status: "upcoming" })
					.where(
						and(
							eq(lesson.orgId, ctx.orgId),
							eq(lesson.classId, cancel.classId),
							eq(lesson.date, cancel.date),
							eq(lesson.status, "cancelled"),
						),
					),
			);
		}
		// Xóa tường minh các bảng con + bảng chính (không phụ thuộc PRAGMA foreign_keys).
		undoStatements.push(
			db
				.delete(holidaySessionShift)
				.where(
					and(
						eq(holidaySessionShift.orgId, ctx.orgId),
						eq(holidaySessionShift.holidayId, holidayId),
					),
				),
			db
				.delete(holidaySessionCancel)
				.where(
					and(
						eq(holidaySessionCancel.orgId, ctx.orgId),
						eq(holidaySessionCancel.holidayId, holidayId),
					),
				),
			db
				.delete(organizationHolidayClass)
				.where(eq(organizationHolidayClass.holidayId, holidayId)),
			db
				.delete(organizationHoliday)
				.where(
					and(
						eq(organizationHoliday.id, holidayId),
						eq(organizationHoliday.orgId, ctx.orgId),
					),
				),
		);
		const restoredCount = shifts.length + cancels.length;
		const removedMakeupCount = shifts.length;
		undoStatements.push(
			db.insert(notif).values({
				id: crypto.randomUUID(),
				orgId: ctx.orgId,
				text: `Đã xóa kỳ nghỉ «${existing.name}»: khôi phục ${restoredCount} buổi`,
				time: formatNotifTime(new Date()),
				channel: "schedule",
				dot: "warn",
			}),
		);

		if (undoStatements.length > MAX_APPLY_STATEMENTS) {
			return c.json(
				{
					error: HOLIDAY_ERROR_CODES.TOO_LARGE,
					reason: HOLIDAY_ERROR_CODES.TOO_LARGE,
				},
				422,
			);
		}
		try {
			await db.batch(undoStatements);
		} catch (err: unknown) {
			if (isRollbackableConstraintError(err)) {
				return c.json(
					{
						error: HOLIDAY_ERROR_CODES.MAKEUP_TOUCHED,
						reason: HOLIDAY_ERROR_CODES.MAKEUP_TOUCHED,
						touched: [],
					},
					409,
				);
			}
			throw err;
		}

		return c.json({
			restoredCount,
			removedMakeupCount,
		});
	});

	return holiday;
}
