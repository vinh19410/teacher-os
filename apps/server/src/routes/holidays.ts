import {
	HOLIDAY_ERROR_CODES,
	type HolidayDraft,
	type HolidayPreview,
	holidayApplySchema,
	holidayDraftSchema,
} from "@teacher-os/api/contracts";
import {
	type PlannedShift,
	planHolidayShift,
} from "@teacher-os/api/holiday-plan";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { classTable } from "@teacher-os/db/schema/class";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import { lesson } from "@teacher-os/db/schema/lesson";
import { notif } from "@teacher-os/db/schema/notif";
import {
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

/** Hash ổn định của danh sách shift (I7) — preview trả, apply gửi lại. */
async function planHashOf(shifts: PlannedShift[]): Promise<string> {
	const payload = shifts
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
	});
	return {
		ok: true,
		shifts: planned.shifts,
		preview: {
			shifts: planned.shifts.map(({ enrollmentIds, ...shift }) => {
				void enrollmentIds;
				return shift;
			}),
			keptCompleted: planned.keptCompleted,
			unsupported: planned.unsupported,
			affectedClassCount: new Set(planned.shifts.map((s) => s.classId)).size,
			planHash: await planHashOf(planned.shifts),
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

/** Lỗi constraint (UNIQUE/NOT NULL) từ guard CASE — batch đã rollback sạch,
 * caller xử lý 409 hoặc retry đọc lại. Lỗi khác là sự cố thật, phải ném. */
export function isRollbackableConstraintError(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err);
	return /UNIQUE|NOT NULL/i.test(message);
}

export function holidayRoutes(deps: {
	getDb(): Db;
	/** #454 D9: phát holiday_created sau khi apply thành công. */
	mailer?: Parameters<typeof emitNotifications>[0]["mailer"];
	runInBackground?: Parameters<typeof emitNotifications>[0]["runInBackground"];
	/** #454: origin cổng học viên cho link tuyệt đối trong thư. */
	studentOrigin?: Parameters<typeof emitNotifications>[0]["studentOrigin"];
	/** #463: khoảng chờ giữa các lượt retry email thông báo (test/E2E truyền [0, 0]). */
	notificationRetryDelaysMs?: number[];
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
		if (plan.shifts.length === 0) {
			return c.json(
				{
					error: HOLIDAY_ERROR_CODES.NO_SESSIONS,
					reason: HOLIDAY_ERROR_CODES.NO_SESSIONS,
				},
				422,
			);
		}
		if ((await planHashOf(plan.shifts)) !== input.planHash) {
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
		for (const shift of plan.shifts) {
			statements.push(...shiftStatements(db, ctx.orgId, holidayId, shift));
		}
		if (input.notify) {
			statements.push(
				db.insert(notif).values({
					id: crypto.randomUUID(),
					orgId: ctx.orgId,
					text: `Lịch nghỉ «${input.name}»: dời ${plan.shifts.length} buổi của ${plan.preview.affectedClassCount} lớp`,
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
			classCount: plan.preview.affectedClassCount,
		};
		// #454 D9: notify=true → holiday_created cho học viên ACTIVE của các
		// lớp bị ảnh hưởng; emit tự fail-open nên không đổi response 200.
		if (input.notify) {
			const affectedClassIds = [
				...new Set(plan.shifts.map((shift) => shift.classId)),
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

	return holiday;
}
