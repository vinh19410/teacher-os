import {
	MAX_SELF_STUDY_DAYS,
	SELF_STUDY_DATE_REGEX,
	type SelfStudyPlanDayView,
	type SelfStudyPlanDetailResponse,
	type SelfStudyPlanItemView,
	type SelfStudyPlanStudentProgress,
	type SelfStudyPlanSummaryView,
	selfStudyPlanCreateSchema,
	selfStudyPlanDayPatchSchema,
	selfStudyPlanReleaseMissedSchema,
	selfStudyPlanUpdateHoursSchema,
} from "@teacher-os/api/contracts";
import { parseStartDateStrict } from "@teacher-os/api/skeleton";
import {
	addDaysISO,
	daysBetweenInclusiveISO,
	vietnamDateKeyOf,
	vietnamDateTimeMs,
	vietnamTodayISO,
	vietnamWallClockOffsetMs,
} from "@teacher-os/api/vietnam-date";
import { canPublishGrade, canReviewGrade } from "@teacher-os/auth/role";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import { classTable } from "@teacher-os/db/schema/class";
import {
	classAssignment,
	classAssignmentTarget,
} from "@teacher-os/db/schema/class-assignment";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import { quizAttempt } from "@teacher-os/db/schema/quiz-attempt";
import {
	selfStudyPlan,
	selfStudyPlanDay,
	selfStudyPlanItem,
} from "@teacher-os/db/schema/self-study-plan";
import { student } from "@teacher-os/db/schema/student";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lte,
	ne,
	sql,
} from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../app";
import { deliverNotifications } from "../lib/notifications/deliver";
import {
	type emitNotifications,
	notificationDepsFrom,
} from "../lib/notifications/emit";
import { enqueueNotifications } from "../lib/notifications/enqueue";
import { selfStudyReleasedEvents } from "../lib/notifications/templates";
import { toQuizAttemptGrade } from "../lib/quiz-grade";
import {
	checkAndCompletePlan,
	D1_ASSIGNMENT_INSERT_CHUNK,
	D1_IN_ARRAY_CHUNK,
	D1_TARGET_INSERT_CHUNK,
	sspAssignmentId,
	sspTargetId,
} from "../lib/self-study-plan";
import {
	isRollbackableConstraintError,
	loadExistingHolidayDates,
} from "./holidays";

type Env = { Variables: { kernelCtx: KernelCtx } };
type SelfStudyContext = Context<Env>;

const D1_DAY_INSERT_CHUNK = 8;
const D1_ITEM_INSERT_CHUNK = 10;
const DEFAULT_PAGE_WINDOW_DAYS = 14;

async function readBody<T extends z.ZodTypeAny>(
	c: SelfStudyContext,
	schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
	const ct = c.req.header("content-type") ?? "";
	if (!ct.toLowerCase().startsWith("application/json")) {
		return {
			ok: false,
			response: c.json({ error: "content-type must be application/json" }, 415),
		};
	}
	let raw: unknown;
	try {
		raw = await c.req.json();
	} catch {
		return {
			ok: false,
			response: c.json({ error: "invalid json" }, 400),
		};
	}
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			response: c.json(
				{ error: "invalid body", issues: parsed.error.issues },
				400,
			),
		};
	}
	return { ok: true, data: parsed.data };
}

async function findOrgClass(db: Db, classId: string, orgId: string) {
	const [cls] = await db
		.select({
			id: classTable.id,
			name: classTable.name,
			orgId: classTable.orgId,
		})
		.from(classTable)
		.where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)))
		.limit(1);
	return cls ?? null;
}

async function findClassPlan(
	db: Db,
	planId: string,
	classId: string,
	orgId: string,
) {
	const [plan] = await db
		.select()
		.from(selfStudyPlan)
		.where(
			and(
				eq(selfStudyPlan.id, planId),
				eq(selfStudyPlan.classId, classId),
				eq(selfStudyPlan.orgId, orgId),
			),
		)
		.limit(1);
	return plan ?? null;
}

async function validateReadyOrgPrompts(
	db: Db,
	orgId: string,
	promptIds: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
	const uniqueIds = Array.from(new Set(promptIds));
	if (uniqueIds.length === 0) return { ok: true };

	const found = new Map<string, { status: string }>();
	for (let i = 0; i < uniqueIds.length; i += D1_IN_ARRAY_CHUNK) {
		const slice = uniqueIds.slice(i, i + D1_IN_ARRAY_CHUNK);
		const rows = await db
			.select({
				id: assignmentPrompt.id,
				status: assignmentPrompt.status,
			})
			.from(assignmentPrompt)
			.where(
				and(
					eq(assignmentPrompt.orgId, orgId),
					inArray(assignmentPrompt.id, slice),
				),
			);
		for (const row of rows) {
			found.set(row.id, { status: row.status });
		}
	}

	for (const pid of uniqueIds) {
		const row = found.get(pid);
		if (!row) {
			return { ok: false, message: "prompt not found in organization" };
		}
		if (row.status !== "ready") {
			return { ok: false, message: "only ready bank prompts can be assigned" };
		}
	}
	return { ok: true };
}

function toSummaryView(
	row: typeof selfStudyPlan.$inferSelect,
): SelfStudyPlanSummaryView {
	return {
		id: row.id,
		classId: row.classId,
		title: row.title,
		startDate: row.startDate,
		endDate: row.endDate,
		releaseTime: row.releaseTime,
		dueTime: row.dueTime,
		status: row.status,
		publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
		completedAt: row.completedAt ? row.completedAt.toISOString() : null,
		cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function clampDateRange(
	startDate: string,
	endDate: string,
	rawFrom: string | undefined,
	rawTo: string | undefined,
	todayVN: string,
): {
	from: string;
	to: string;
	prevFrom: string | null;
	prevTo: string | null;
	nextFrom: string | null;
	nextTo: string | null;
	totalDays: number;
} {
	const totalDays = Math.max(1, daysBetweenInclusiveISO(startDate, endDate));
	let from =
		rawFrom && SELF_STUDY_DATE_REGEX.test(rawFrom) ? rawFrom : undefined;
	let to = rawTo && SELF_STUDY_DATE_REGEX.test(rawTo) ? rawTo : undefined;

	if (!from || !to) {
		const anchor =
			todayVN >= startDate && todayVN <= endDate ? todayVN : startDate;
		from = anchor;
		const candidateTo = addDaysISO(from, DEFAULT_PAGE_WINDOW_DAYS - 1);
		to = candidateTo <= endDate ? candidateTo : endDate;
	}
	if (from < startDate) from = startDate;
	if (to > endDate) to = endDate;
	if (from > to) {
		from = startDate;
		const candidateTo = addDaysISO(from, DEFAULT_PAGE_WINDOW_DAYS - 1);
		to = candidateTo <= endDate ? candidateTo : endDate;
	}

	const windowSpan = Math.max(1, daysBetweenInclusiveISO(from, to));
	let prevFrom: string | null = null;
	let prevTo: string | null = null;
	if (from > startDate) {
		prevTo = addDaysISO(from, -1);
		const candidatePrevFrom = addDaysISO(prevTo, -(windowSpan - 1));
		prevFrom = candidatePrevFrom >= startDate ? candidatePrevFrom : startDate;
	}

	let nextFrom: string | null = null;
	let nextTo: string | null = null;
	if (to < endDate) {
		nextFrom = addDaysISO(to, 1);
		const candidateNextTo = addDaysISO(nextFrom, windowSpan - 1);
		nextTo = candidateNextTo <= endDate ? candidateNextTo : endDate;
	}

	return { from, to, prevFrom, prevTo, nextFrom, nextTo, totalDays };
}

async function buildPlanDetailResponse(
	db: Db,
	orgId: string,
	classId: string,
	queryPlanId?: string,
	rawFrom?: string,
	rawTo?: string,
): Promise<SelfStudyPlanDetailResponse> {
	const allPlanRows = await db
		.select()
		.from(selfStudyPlan)
		.where(
			and(eq(selfStudyPlan.orgId, orgId), eq(selfStudyPlan.classId, classId)),
		)
		.orderBy(desc(selfStudyPlan.createdAt), desc(selfStudyPlan.id));

	const plans = allPlanRows.map(toSummaryView);
	const selectedPlan = queryPlanId
		? (allPlanRows.find((p) => p.id === queryPlanId) ?? null)
		: (allPlanRows.find((p) => p.status === "published") ??
			allPlanRows.find((p) => p.status === "draft") ??
			allPlanRows[0] ??
			null);

	const todayVN = vietnamTodayISO();
	if (!selectedPlan) {
		return {
			plan: null,
			plans,
			page: {
				from: todayVN,
				to: todayVN,
				prevFrom: null,
				prevTo: null,
				nextFrom: null,
				nextTo: null,
				totalDays: 0,
			},
			days: [],
		};
	}

	const page = clampDateRange(
		selectedPlan.startDate,
		selectedPlan.endDate,
		rawFrom,
		rawTo,
		todayVN,
	);

	const [dayRows, itemRows, holidayMap, studentRows] = await Promise.all([
		db
			.select()
			.from(selfStudyPlanDay)
			.where(
				and(
					eq(selfStudyPlanDay.orgId, orgId),
					eq(selfStudyPlanDay.planId, selectedPlan.id),
					gte(selfStudyPlanDay.date, page.from),
					lte(selfStudyPlanDay.date, page.to),
				),
			)
			.orderBy(asc(selfStudyPlanDay.date)),
		db
			.select({
				id: selfStudyPlanItem.id,
				date: selfStudyPlanItem.date,
				promptId: selfStudyPlanItem.promptId,
				position: selfStudyPlanItem.position,
				note: selfStudyPlanItem.note,
				promptTitle: assignmentPrompt.title,
				promptSkill: assignmentPrompt.skill,
				promptStatus: assignmentPrompt.status,
			})
			.from(selfStudyPlanItem)
			.innerJoin(
				assignmentPrompt,
				and(
					eq(assignmentPrompt.id, selfStudyPlanItem.promptId),
					eq(assignmentPrompt.orgId, orgId),
				),
			)
			.where(
				and(
					eq(selfStudyPlanItem.orgId, orgId),
					eq(selfStudyPlanItem.planId, selectedPlan.id),
					gte(selfStudyPlanItem.date, page.from),
					lte(selfStudyPlanItem.date, page.to),
				),
			)
			.orderBy(
				asc(selfStudyPlanItem.date),
				asc(selfStudyPlanItem.position),
				asc(selfStudyPlanItem.id),
			),
		loadExistingHolidayDates(db, orgId, [classId]),
		db
			.select({
				id: student.id,
				name: student.name,
			})
			.from(student)
			.where(eq(student.orgId, orgId)),
	]);

	const studentNameById = new Map(studentRows.map((s) => [s.id, s.name]));
	const classHolidayByDate =
		holidayMap.get(classId) ?? new Map<string, string>();
	const dayRowByDate = new Map(dayRows.map((d) => [d.date, d]));

	const itemIds = itemRows.map((it) => it.id);
	const assignmentRows: Array<typeof classAssignment.$inferSelect> = [];
	for (let i = 0; i < itemIds.length; i += D1_IN_ARRAY_CHUNK) {
		const slice = itemIds.slice(i, i + D1_IN_ARRAY_CHUNK);
		const chunk = await db
			.select()
			.from(classAssignment)
			.where(
				and(
					eq(classAssignment.orgId, orgId),
					inArray(classAssignment.planItemId, slice),
				),
			);
		assignmentRows.push(...chunk);
	}
	const assignmentByItemId = new Map(
		assignmentRows
			.filter((a) => a.planItemId !== null)
			.map((a) => [a.planItemId as string, a]),
	);

	const assignmentIds = assignmentRows.map((a) => a.id);
	const targetRows: Array<typeof classAssignmentTarget.$inferSelect> = [];
	const attemptRows: Array<{
		id: string;
		assignmentId: string | null;
		studentId: string;
		status: string;
		submittedAt: Date | null;
		gradeScores: Record<string, number> | null;
		gradedAt: Date | null;
	}> = [];

	for (let i = 0; i < assignmentIds.length; i += D1_IN_ARRAY_CHUNK) {
		const slice = assignmentIds.slice(i, i + D1_IN_ARRAY_CHUNK);
		const [tChunk, aChunk] = await Promise.all([
			db
				.select()
				.from(classAssignmentTarget)
				.where(
					and(
						eq(classAssignmentTarget.orgId, orgId),
						inArray(classAssignmentTarget.assignmentId, slice),
					),
				),
			db
				.select({
					id: quizAttempt.id,
					assignmentId: quizAttempt.assignmentId,
					studentId: quizAttempt.studentId,
					status: quizAttempt.status,
					submittedAt: quizAttempt.submittedAt,
					gradeScores: quizAttempt.gradeScores,
					gradedAt: quizAttempt.gradedAt,
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
		targetRows.push(...tChunk);
		attemptRows.push(...aChunk);
	}

	const targetsByAssignmentId = new Map<
		string,
		Array<typeof classAssignmentTarget.$inferSelect>
	>();
	for (const t of targetRows) {
		const list = targetsByAssignmentId.get(t.assignmentId) ?? [];
		list.push(t);
		targetsByAssignmentId.set(t.assignmentId, list);
	}
	const attemptByKey = new Map(
		attemptRows.map((a) => [`${a.assignmentId}:${a.studentId}`, a]),
	);

	const itemsByDate = new Map<string, typeof itemRows>();
	for (const item of itemRows) {
		const list = itemsByDate.get(item.date) ?? [];
		list.push(item);
		itemsByDate.set(item.date, list);
	}

	const nowMs = Date.now();
	const days: SelfStudyPlanDayView[] = [];
	const spanDays = daysBetweenInclusiveISO(page.from, page.to);
	for (let offset = 0; offset < spanDays; offset++) {
		const date = addDaysISO(page.from, offset);
		const dbDay = dayRowByDate.get(date) ?? null;
		const dateItems = itemsByDate.get(date) ?? [];
		const releaseAtMs = dbDay
			? dbDay.releaseAt.getTime()
			: vietnamDateTimeMs(date, selectedPlan.releaseTime);
		const dueAtMs = dbDay
			? dbDay.dueAt.getTime()
			: vietnamDateTimeMs(date, selectedPlan.dueTime);
		const holidayName = classHolidayByDate.get(date) ?? null;
		const status =
			dbDay?.status ?? (dateItems.length > 0 ? "pending" : "skipped");
		const editable =
			selectedPlan.status === "draft" ||
			(selectedPlan.status === "published" &&
				date > todayVN &&
				(status === "pending" || status === "skipped") &&
				!dbDay?.releasedAt);

		const mappedItems: SelfStudyPlanItemView[] = dateItems.map((it) => {
			const ca = assignmentByItemId.get(it.id) ?? null;
			const targets = ca ? (targetsByAssignmentId.get(ca.id) ?? []) : [];
			const itemDueAtMs = ca?.dueAt ? ca.dueAt.getTime() : dueAtMs;

			let submittedOnTimeCount = 0;
			let submittedLateCount = 0;
			let overdueCount = 0;
			let pendingCount = 0;

			const students: SelfStudyPlanStudentProgress[] = targets.map((t) => {
				const att = ca
					? (attemptByKey.get(`${ca.id}:${t.studentId}`) ?? null)
					: null;
				const submittedMs = att?.submittedAt
					? att.submittedAt.getTime()
					: t.submittedAt
						? Date.parse(t.submittedAt)
						: Number.NaN;
				const hasSubmitted = Number.isFinite(submittedMs);
				const isLate = hasSubmitted ? submittedMs > itemDueAtMs : false;

				let progressStatus: SelfStudyPlanStudentProgress["status"];
				if (hasSubmitted) {
					if (isLate) {
						submittedLateCount += 1;
						progressStatus = "submitted_late";
					} else {
						submittedOnTimeCount += 1;
						progressStatus = "submitted_on_time";
					}
				} else if (nowMs >= itemDueAtMs) {
					overdueCount += 1;
					progressStatus = "overdue";
				} else {
					pendingCount += 1;
					progressStatus = "pending";
				}

				const graded = att
					? toQuizAttemptGrade({
							gradeScores: att.gradeScores,
							gradeFeedback: "",
							gradedAt: att.gradedAt,
						})
					: null;

				return {
					studentId: t.studentId,
					studentName: studentNameById.get(t.studentId) ?? t.studentId,
					submittedAt: hasSubmitted
						? new Date(submittedMs).toISOString()
						: null,
					isLate,
					status: progressStatus,
					attemptId: att?.id ?? null,
					gradedAt: graded?.gradedAt ?? null,
					band: graded?.band ?? null,
				};
			});

			return {
				id: it.id,
				promptId: it.promptId,
				promptTitle: it.promptTitle,
				promptSkill: it.promptSkill,
				promptStatus: it.promptStatus,
				position: it.position,
				note: it.note,
				assignmentId: ca?.id ?? null,
				dueAt: ca?.dueAt ? ca.dueAt.toISOString() : null,
				targetsTotal: targets.length,
				submittedOnTimeCount,
				submittedLateCount,
				overdueCount,
				pendingCount,
				students,
			};
		});

		days.push({
			id: dbDay?.id ?? null,
			date,
			releaseAt: new Date(releaseAtMs).toISOString(),
			dueAt: new Date(dueAtMs).toISOString(),
			status,
			holidayOverride: dbDay?.holidayOverride ?? false,
			isHoliday: holidayName !== null,
			holidayName,
			warning: dbDay?.warning ?? "",
			notifiedAt: dbDay?.notifiedAt ? dbDay.notifiedAt.toISOString() : null,
			releasedAt: dbDay?.releasedAt ? dbDay.releasedAt.toISOString() : null,
			editable,
			items: mappedItems,
		});
	}

	return {
		plan: toSummaryView(selectedPlan),
		plans,
		page,
		days,
	};
}

export function selfStudyPlanRoutes(deps: {
	getDb(): Db;
	mailer?: Parameters<typeof emitNotifications>[0]["mailer"];
	runInBackground?: Parameters<typeof emitNotifications>[0]["runInBackground"];
	studentOrigin?: Parameters<typeof emitNotifications>[0]["studentOrigin"];
	notificationRetryDelaysMs?: number[];
}) {
	const router = new Hono<Env>();

	// -------------------------------------------------------------------------
	// GET /classes/:classId/self-study-plan?planId=&from=&to=
	// -------------------------------------------------------------------------
	router.get("/classes/:classId/self-study-plan", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		if (!canReviewGrade(ctx.role)) return c.json({ error: "forbidden" }, 403);

		const db = deps.getDb();
		const classId = c.req.param("classId");
		const cls = await findOrgClass(db, classId, ctx.orgId);
		if (!cls) return c.json({ error: "class not found" }, 404);

		const planId = c.req.query("planId");
		if (planId) {
			const plan = await findClassPlan(db, planId, classId, ctx.orgId);
			if (!plan) return c.json({ error: "plan not found" }, 404);
		}

		const detail = await buildPlanDetailResponse(
			db,
			ctx.orgId,
			classId,
			planId,
			c.req.query("from"),
			c.req.query("to"),
		);
		return c.json(detail);
	});

	// -------------------------------------------------------------------------
	// POST /classes/:classId/self-study-plan — tạo hoặc cập nhật plan `draft`
	// -------------------------------------------------------------------------
	router.post("/classes/:classId/self-study-plan", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		if (!canPublishGrade(ctx.role)) return c.json({ error: "forbidden" }, 403);

		const parsed = await readBody(c, selfStudyPlanCreateSchema);
		if (!parsed.ok) return parsed.response;
		const input = parsed.data;

		if (
			!parseStartDateStrict(input.startDate) ||
			!parseStartDateStrict(input.endDate)
		) {
			return c.json({ error: "invalid startDate or endDate" }, 400);
		}
		const totalDays = daysBetweenInclusiveISO(input.startDate, input.endDate);
		if (totalDays < 1 || totalDays > MAX_SELF_STUDY_DAYS) {
			return c.json(
				{
					error: `date range must be between 1 and ${MAX_SELF_STUDY_DAYS} days`,
				},
				400,
			);
		}
		if (input.dueTime <= input.releaseTime) {
			return c.json({ error: "dueTime must be after releaseTime" }, 400);
		}

		const seenDates = new Set<string>();
		const allPromptIds: string[] = [];
		for (const d of input.days) {
			if (
				!parseStartDateStrict(d.date) ||
				d.date < input.startDate ||
				d.date > input.endDate
			) {
				return c.json({ error: "day date is outside plan date range" }, 400);
			}
			if (seenDates.has(d.date)) {
				return c.json({ error: "duplicate day date in plan" }, 400);
			}
			seenDates.add(d.date);

			const seenPrompts = new Set<string>();
			for (const it of d.items) {
				if (seenPrompts.has(it.promptId)) {
					return c.json({ error: "duplicate promptId on the same day" }, 400);
				}
				seenPrompts.add(it.promptId);
				allPromptIds.push(it.promptId);
			}
		}

		const db = deps.getDb();
		const classId = c.req.param("classId");
		const cls = await findOrgClass(db, classId, ctx.orgId);
		if (!cls) return c.json({ error: "class not found" }, 404);

		const promptCheck = await validateReadyOrgPrompts(
			db,
			ctx.orgId,
			allPromptIds,
		);
		if (!promptCheck.ok) {
			return c.json({ error: promptCheck.message }, 400);
		}

		const now = new Date();
		let planId = input.planId;
		if (planId) {
			const existingPlan = await findClassPlan(db, planId, classId, ctx.orgId);
			if (!existingPlan) return c.json({ error: "plan not found" }, 404);
			if (existingPlan.status !== "draft") {
				return c.json(
					{ error: "only draft plans can be replaced via POST" },
					400,
				);
			}
		} else {
			planId = crypto.randomUUID();
		}

		const statements: BatchItem<"sqlite">[] = [];
		if (input.planId) {
			statements.push(
				db
					.update(selfStudyPlan)
					.set({
						title: input.title,
						startDate: input.startDate,
						endDate: input.endDate,
						releaseTime: input.releaseTime,
						dueTime: input.dueTime,
						updatedAt: now,
					})
					.where(
						and(
							eq(selfStudyPlan.id, planId),
							eq(selfStudyPlan.orgId, ctx.orgId),
							eq(selfStudyPlan.status, "draft"),
						),
					),
				db
					.delete(selfStudyPlanDay)
					.where(
						and(
							eq(selfStudyPlanDay.planId, planId),
							eq(selfStudyPlanDay.orgId, ctx.orgId),
						),
					),
				db
					.delete(selfStudyPlanItem)
					.where(
						and(
							eq(selfStudyPlanItem.planId, planId),
							eq(selfStudyPlanItem.orgId, ctx.orgId),
						),
					),
			);
		} else {
			statements.push(
				db.insert(selfStudyPlan).values({
					id: planId,
					orgId: ctx.orgId,
					classId,
					title: input.title,
					startDate: input.startDate,
					endDate: input.endDate,
					releaseTime: input.releaseTime,
					dueTime: input.dueTime,
					status: "draft",
					createdAt: now,
					updatedAt: now,
				}),
			);
		}

		const dayValues = input.days.map((d) => ({
			id: crypto.randomUUID(),
			orgId: ctx.orgId,
			planId,
			date: d.date,
			releaseAt: new Date(vietnamDateTimeMs(d.date, input.releaseTime)),
			dueAt: new Date(vietnamDateTimeMs(d.date, input.dueTime)),
			status: d.items.length > 0 ? ("pending" as const) : ("skipped" as const),
			holidayOverride: d.holidayOverride,
			warning: "",
		}));

		const itemValues: Array<typeof selfStudyPlanItem.$inferInsert> = [];
		for (const d of input.days) {
			for (const [idx, it] of d.items.entries()) {
				itemValues.push({
					id: crypto.randomUUID(),
					orgId: ctx.orgId,
					planId,
					date: d.date,
					promptId: it.promptId,
					position: idx,
					note: it.note,
				});
			}
		}

		for (let i = 0; i < dayValues.length; i += D1_DAY_INSERT_CHUNK) {
			const slice = dayValues.slice(i, i + D1_DAY_INSERT_CHUNK);
			statements.push(db.insert(selfStudyPlanDay).values(slice));
		}
		for (let i = 0; i < itemValues.length; i += D1_ITEM_INSERT_CHUNK) {
			const slice = itemValues.slice(i, i + D1_ITEM_INSERT_CHUNK);
			statements.push(db.insert(selfStudyPlanItem).values(slice));
		}

		const [firstStmt, ...restStmts] = statements;
		if (firstStmt) {
			await db.batch([firstStmt, ...restStmts]);
		}

		const detail = await buildPlanDetailResponse(
			db,
			ctx.orgId,
			classId,
			planId,
		);
		return c.json(detail);
	});

	// -------------------------------------------------------------------------
	// POST /classes/:classId/self-study-plan/:planId/publish
	// -------------------------------------------------------------------------
	router.post(
		"/classes/:classId/self-study-plan/:planId/publish",
		async (c) => {
			const ctx = c.get("kernelCtx");
			if (!ctx) return c.json({ error: "unauthorized" }, 401);
			if (!canPublishGrade(ctx.role))
				return c.json({ error: "forbidden" }, 403);

			const db = deps.getDb();
			const classId = c.req.param("classId");
			const planId = c.req.param("planId");

			const cls = await findOrgClass(db, classId, ctx.orgId);
			if (!cls) return c.json({ error: "class not found" }, 404);

			const plan = await findClassPlan(db, planId, classId, ctx.orgId);
			if (!plan) return c.json({ error: "plan not found" }, 404);
			if (plan.status !== "draft") {
				return c.json({ error: "only draft plans can be published" }, 400);
			}

			// Kiểm tra lớp chưa có plan `published` khác
			const existingPublished = await db
				.select({ id: selfStudyPlan.id })
				.from(selfStudyPlan)
				.where(
					and(
						eq(selfStudyPlan.classId, classId),
						eq(selfStudyPlan.orgId, ctx.orgId),
						eq(selfStudyPlan.status, "published"),
						ne(selfStudyPlan.id, planId),
					),
				)
				.limit(1);
			if (existingPublished.length > 0) {
				return c.json(
					{ error: "class already has a published self-study plan" },
					409,
				);
			}

			const [existingDays, existingItems] = await Promise.all([
				db
					.select()
					.from(selfStudyPlanDay)
					.where(
						and(
							eq(selfStudyPlanDay.planId, planId),
							eq(selfStudyPlanDay.orgId, ctx.orgId),
						),
					),
				db
					.select()
					.from(selfStudyPlanItem)
					.where(
						and(
							eq(selfStudyPlanItem.planId, planId),
							eq(selfStudyPlanItem.orgId, ctx.orgId),
						),
					),
			]);

			if (existingItems.length === 0) {
				return c.json(
					{ error: "cannot publish a plan with zero assigned prompts" },
					400,
				);
			}

			const promptCheck = await validateReadyOrgPrompts(
				db,
				ctx.orgId,
				existingItems.map((it) => it.promptId),
			);
			if (!promptCheck.ok) {
				return c.json({ error: promptCheck.message }, 400);
			}

			const overrideByDate = new Map(
				existingDays.map((d) => [d.date, d.holidayOverride]),
			);
			const itemCountByDate = new Map<string, number>();
			for (const it of existingItems) {
				itemCountByDate.set(it.date, (itemCountByDate.get(it.date) ?? 0) + 1);
			}

			const totalDays = daysBetweenInclusiveISO(plan.startDate, plan.endDate);
			const allDayValues: Array<typeof selfStudyPlanDay.$inferInsert> = [];
			for (let offset = 0; offset < totalDays; offset++) {
				const date = addDaysISO(plan.startDate, offset);
				const count = itemCountByDate.get(date) ?? 0;
				allDayValues.push({
					id: crypto.randomUUID(),
					orgId: ctx.orgId,
					planId,
					date,
					releaseAt: new Date(vietnamDateTimeMs(date, plan.releaseTime)),
					dueAt: new Date(vietnamDateTimeMs(date, plan.dueTime)),
					status: count > 0 ? "pending" : "skipped",
					holidayOverride: overrideByDate.get(date) ?? false,
					warning: "",
				});
			}

			const now = new Date();
			const statements: BatchItem<"sqlite">[] = [
				db
					.delete(selfStudyPlanDay)
					.where(
						and(
							eq(selfStudyPlanDay.planId, planId),
							eq(selfStudyPlanDay.orgId, ctx.orgId),
						),
					),
			];
			for (let i = 0; i < allDayValues.length; i += D1_DAY_INSERT_CHUNK) {
				const slice = allDayValues.slice(i, i + D1_DAY_INSERT_CHUNK);
				statements.push(db.insert(selfStudyPlanDay).values(slice));
			}
			statements.push(
				db
					.update(selfStudyPlan)
					.set({
						status: "published",
						publishedAt: now,
						updatedAt: now,
					})
					.where(
						and(
							eq(selfStudyPlan.id, planId),
							eq(selfStudyPlan.orgId, ctx.orgId),
							eq(selfStudyPlan.status, "draft"),
						),
					),
			);

			const [firstStmt, ...restStmts] = statements;
			if (firstStmt) {
				try {
					await db.batch([firstStmt, ...restStmts]);
				} catch (err) {
					if (isRollbackableConstraintError(err)) {
						return c.json(
							{ error: "class already has a published self-study plan" },
							409,
						);
					}
					throw err;
				}
			}

			const detail = await buildPlanDetailResponse(
				db,
				ctx.orgId,
				classId,
				planId,
			);
			return c.json(detail);
		},
	);

	// -------------------------------------------------------------------------
	// PATCH /classes/:classId/self-study-plan/:planId/hours
	// -------------------------------------------------------------------------
	router.patch("/classes/:classId/self-study-plan/:planId/hours", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		if (!canPublishGrade(ctx.role)) return c.json({ error: "forbidden" }, 403);

		const parsed = await readBody(c, selfStudyPlanUpdateHoursSchema);
		if (!parsed.ok) return parsed.response;
		const { releaseTime, dueTime } = parsed.data;

		if (dueTime <= releaseTime) {
			return c.json({ error: "dueTime must be after releaseTime" }, 400);
		}

		const db = deps.getDb();
		const classId = c.req.param("classId");
		const planId = c.req.param("planId");

		const cls = await findOrgClass(db, classId, ctx.orgId);
		if (!cls) return c.json({ error: "class not found" }, 404);

		const plan = await findClassPlan(db, planId, classId, ctx.orgId);
		if (!plan) return c.json({ error: "plan not found" }, 404);
		if (plan.status !== "draft" && plan.status !== "published") {
			return c.json(
				{ error: "cannot update hours on a completed or cancelled plan" },
				400,
			);
		}

		const now = new Date();
		const todayVN = vietnamTodayISO(now);
		const releaseOffsetMs = vietnamWallClockOffsetMs(releaseTime);
		const dueOffsetMs = vietnamWallClockOffsetMs(dueTime);

		const dateCondition =
			plan.status === "published"
				? sql`${selfStudyPlanDay.date} > ${todayVN}`
				: sql`1 = 1`;

		await db.batch([
			db
				.update(selfStudyPlan)
				.set({
					releaseTime,
					dueTime,
					updatedAt: now,
				})
				.where(
					and(eq(selfStudyPlan.id, planId), eq(selfStudyPlan.orgId, ctx.orgId)),
				),
			db
				.update(selfStudyPlanDay)
				.set({
					releaseAt: sql`cast(strftime('%s', ${selfStudyPlanDay.date}) as integer) * 1000 + ${releaseOffsetMs}`,
					dueAt: sql`cast(strftime('%s', ${selfStudyPlanDay.date}) as integer) * 1000 + ${dueOffsetMs}`,
				})
				.where(
					and(
						eq(selfStudyPlanDay.planId, planId),
						eq(selfStudyPlanDay.orgId, ctx.orgId),
						inArray(selfStudyPlanDay.status, ["pending", "skipped"]),
						isNull(selfStudyPlanDay.releasedAt),
						dateCondition,
					),
				),
		]);

		const detail = await buildPlanDetailResponse(
			db,
			ctx.orgId,
			classId,
			planId,
		);
		return c.json(detail);
	});

	// -------------------------------------------------------------------------
	// PUT /classes/:classId/self-study-plan/:planId/days/:date
	// -------------------------------------------------------------------------
	router.put(
		"/classes/:classId/self-study-plan/:planId/days/:date",
		async (c) => {
			const ctx = c.get("kernelCtx");
			if (!ctx) return c.json({ error: "unauthorized" }, 401);
			if (!canPublishGrade(ctx.role))
				return c.json({ error: "forbidden" }, 403);

			const parsed = await readBody(c, selfStudyPlanDayPatchSchema);
			if (!parsed.ok) return parsed.response;
			const input = parsed.data;

			const date = c.req.param("date");
			if (!parseStartDateStrict(date)) {
				return c.json({ error: "invalid date" }, 400);
			}

			const seenPrompts = new Set<string>();
			for (const it of input.items) {
				if (seenPrompts.has(it.promptId)) {
					return c.json({ error: "duplicate promptId on the same day" }, 400);
				}
				seenPrompts.add(it.promptId);
			}

			const db = deps.getDb();
			const classId = c.req.param("classId");
			const planId = c.req.param("planId");

			const cls = await findOrgClass(db, classId, ctx.orgId);
			if (!cls) return c.json({ error: "class not found" }, 404);

			const plan = await findClassPlan(db, planId, classId, ctx.orgId);
			if (!plan) return c.json({ error: "plan not found" }, 404);
			if (plan.status !== "draft" && plan.status !== "published") {
				return c.json(
					{ error: "cannot edit days on a completed or cancelled plan" },
					400,
				);
			}
			if (date < plan.startDate || date > plan.endDate) {
				return c.json({ error: "date is outside plan range" }, 400);
			}

			const now = new Date();
			const todayVN = vietnamTodayISO(now);
			if (plan.status === "published" && date <= todayVN) {
				return c.json(
					{ error: "can only edit future days after today (Vietnam time)" },
					400,
				);
			}

			const [existingDay] = await db
				.select()
				.from(selfStudyPlanDay)
				.where(
					and(
						eq(selfStudyPlanDay.planId, planId),
						eq(selfStudyPlanDay.orgId, ctx.orgId),
						eq(selfStudyPlanDay.date, date),
					),
				)
				.limit(1);

			if (
				existingDay &&
				(existingDay.releasedAt !== null ||
					(existingDay.status !== "pending" &&
						existingDay.status !== "skipped"))
			) {
				return c.json(
					{
						error: "cannot edit a day that has already been released or missed",
					},
					400,
				);
			}

			// Nếu plan đang published và xoá hết đề của ngày này, kiểm tra còn ít nhất 1 ngày pending khác không (#526 RT-5)
			if (plan.status === "published" && input.items.length === 0) {
				const otherPending = await db
					.select({ id: selfStudyPlanDay.id })
					.from(selfStudyPlanDay)
					.where(
						and(
							eq(selfStudyPlanDay.planId, planId),
							eq(selfStudyPlanDay.orgId, ctx.orgId),
							eq(selfStudyPlanDay.status, "pending"),
							ne(selfStudyPlanDay.date, date),
						),
					)
					.limit(1);
				if (otherPending.length === 0) {
					return c.json(
						{
							error:
								"cannot clear the last pending day of a published plan; cancel the plan instead",
						},
						400,
					);
				}
			}

			const promptCheck = await validateReadyOrgPrompts(
				db,
				ctx.orgId,
				input.items.map((it) => it.promptId),
			);
			if (!promptCheck.ok) {
				return c.json({ error: promptCheck.message }, 400);
			}

			const nextStatus = input.items.length > 0 ? "pending" : "skipped";
			const nextOverride =
				input.holidayOverride ?? existingDay?.holidayOverride ?? false;
			const releaseAt = new Date(vietnamDateTimeMs(date, plan.releaseTime));
			const dueAt = new Date(vietnamDateTimeMs(date, plan.dueTime));

			const statements: BatchItem<"sqlite">[] = [
				db
					.delete(selfStudyPlanItem)
					.where(
						and(
							eq(selfStudyPlanItem.planId, planId),
							eq(selfStudyPlanItem.orgId, ctx.orgId),
							eq(selfStudyPlanItem.date, date),
						),
					),
			];

			if (existingDay) {
				statements.push(
					db
						.update(selfStudyPlanDay)
						.set({
							status: nextStatus,
							holidayOverride: nextOverride,
							releaseAt,
							dueAt,
						})
						.where(
							and(
								eq(selfStudyPlanDay.id, existingDay.id),
								eq(selfStudyPlanDay.orgId, ctx.orgId),
							),
						),
				);
			} else {
				statements.push(
					db.insert(selfStudyPlanDay).values({
						id: crypto.randomUUID(),
						orgId: ctx.orgId,
						planId,
						date,
						releaseAt,
						dueAt,
						status: nextStatus,
						holidayOverride: nextOverride,
						warning: "",
					}),
				);
			}

			const itemValues = input.items.map((it, idx) => ({
				id: crypto.randomUUID(),
				orgId: ctx.orgId,
				planId,
				date,
				promptId: it.promptId,
				position: idx,
				note: it.note,
			}));
			for (let i = 0; i < itemValues.length; i += D1_ITEM_INSERT_CHUNK) {
				const slice = itemValues.slice(i, i + D1_ITEM_INSERT_CHUNK);
				statements.push(db.insert(selfStudyPlanItem).values(slice));
			}
			statements.push(
				db
					.update(selfStudyPlan)
					.set({ updatedAt: now })
					.where(
						and(
							eq(selfStudyPlan.id, planId),
							eq(selfStudyPlan.orgId, ctx.orgId),
						),
					),
			);

			const [firstStmt, ...restStmts] = statements;
			if (firstStmt) {
				await db.batch([firstStmt, ...restStmts]);
			}

			await checkAndCompletePlan(db, planId, ctx.orgId, now);
			const detail = await buildPlanDetailResponse(
				db,
				ctx.orgId,
				classId,
				planId,
			);
			return c.json(detail);
		},
	);

	// -------------------------------------------------------------------------
	// POST /classes/:classId/self-study-plan/:planId/days/:date/release-missed
	// -------------------------------------------------------------------------
	router.post(
		"/classes/:classId/self-study-plan/:planId/days/:date/release-missed",
		async (c) => {
			const ctx = c.get("kernelCtx");
			if (!ctx) return c.json({ error: "unauthorized" }, 401);
			if (!canPublishGrade(ctx.role))
				return c.json({ error: "forbidden" }, 403);

			const parsed = await readBody(c, selfStudyPlanReleaseMissedSchema);
			if (!parsed.ok) return parsed.response;

			const date = c.req.param("date");
			if (!parseStartDateStrict(date)) {
				return c.json({ error: "invalid date" }, 400);
			}

			const db = deps.getDb();
			const classId = c.req.param("classId");
			const planId = c.req.param("planId");

			const cls = await findOrgClass(db, classId, ctx.orgId);
			if (!cls) return c.json({ error: "class not found" }, 404);

			const plan = await findClassPlan(db, planId, classId, ctx.orgId);
			if (!plan) return c.json({ error: "plan not found" }, 404);
			if (plan.status !== "published" && plan.status !== "completed") {
				return c.json(
					{
						error:
							"can only release missed days on published or completed plans",
					},
					400,
				);
			}

			const [day] = await db
				.select()
				.from(selfStudyPlanDay)
				.where(
					and(
						eq(selfStudyPlanDay.planId, planId),
						eq(selfStudyPlanDay.orgId, ctx.orgId),
						eq(selfStudyPlanDay.date, date),
					),
				)
				.limit(1);
			if (!day || day.status !== "missed") {
				return c.json({ error: "day is not in missed status" }, 400);
			}

			const now = new Date();
			const todayVN = vietnamTodayISO(now);
			const todayDueMs = vietnamDateTimeMs(todayVN, plan.dueTime);
			const defaultDueMs =
				todayDueMs > now.getTime()
					? todayDueMs
					: vietnamDateTimeMs(addDaysISO(todayVN, 1), plan.dueTime);
			const newDueAtMs = parsed.data.dueAt
				? Date.parse(parsed.data.dueAt)
				: defaultDueMs;

			if (!Number.isFinite(newDueAtMs) || newDueAtMs <= now.getTime()) {
				return c.json({ error: "new dueAt must be in the future" }, 400);
			}

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
						eq(assignmentPrompt.orgId, ctx.orgId),
					),
				)
				.where(
					and(
						eq(selfStudyPlanItem.planId, planId),
						eq(selfStudyPlanItem.orgId, ctx.orgId),
						eq(selfStudyPlanItem.date, date),
					),
				)
				.orderBy(asc(selfStudyPlanItem.position), asc(selfStudyPlanItem.id));

			const readyItems = itemRows.filter((it) => it.promptStatus === "ready");
			if (readyItems.length === 0) {
				return c.json({ error: "no ready prompts available on this day" }, 400);
			}

			const rosterRows = await db
				.select({ studentId: enrollment.studentId })
				.from(enrollment)
				.where(
					and(
						eq(enrollment.orgId, ctx.orgId),
						eq(enrollment.classId, classId),
						eq(enrollment.status, "active"),
					),
				);
			const activeStudentIds = rosterRows.map((r) => r.studentId);
			if (activeStudentIds.length === 0) {
				return c.json({ error: "class has no active students" }, 400);
			}

			const nonReadyTitles = itemRows
				.filter((it) => it.promptStatus !== "ready")
				.map((it) => it.promptTitle);
			const warningText =
				nonReadyTitles.length > 0
					? `Bỏ qua đề không còn ở trạng thái sẵn sàng: ${nonReadyTitles.join(", ")}`
					: "";

			const newDueDate = new Date(newDueAtMs);
			const newDueISO = vietnamDateKeyOf(newDueDate);
			const assignmentValues = readyItems.map((item) => ({
				id: sspAssignmentId(item.id),
				orgId: ctx.orgId,
				classId,
				promptId: item.promptId,
				title: item.promptTitle,
				due: newDueISO,
				dueAt: newDueDate,
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
						orgId: ctx.orgId,
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
						dueAt: newDueDate,
						releasedAt: now,
						warning: warningText,
					})
					.where(
						and(
							eq(selfStudyPlanDay.id, day.id),
							eq(selfStudyPlanDay.orgId, ctx.orgId),
							eq(selfStudyPlanDay.status, "missed"),
						),
					),
			);

			const [firstStmt, ...restStmts] = batchStatements;
			if (firstStmt) {
				await db.batch([firstStmt, ...restStmts]);
			}

			const notifDeps = notificationDepsFrom(deps);
			const events = selfStudyReleasedEvents({
				dayId: day.id,
				className: cls.name,
				date: day.date,
				dueTime: plan.dueTime,
				itemCount: readyItems.length,
				firstAssignmentId: sspAssignmentId(readyItems[0]?.id ?? ""),
				studentIds: activeStudentIds,
			});
			const { createdIds } = await enqueueNotifications(
				notifDeps.db,
				ctx.orgId,
				events,
			);
			await db
				.update(selfStudyPlanDay)
				.set({ notifiedAt: now })
				.where(
					and(
						eq(selfStudyPlanDay.id, day.id),
						eq(selfStudyPlanDay.orgId, ctx.orgId),
						isNull(selfStudyPlanDay.notifiedAt),
					),
				);
			if (createdIds.length > 0) {
				const delivery = deliverNotifications(
					notifDeps.db,
					notifDeps.mailer,
					createdIds,
					notifDeps.studentOrigin,
					notifDeps.retryDelaysMs
						? { retryDelaysMs: notifDeps.retryDelaysMs }
						: undefined,
				);
				if (notifDeps.runInBackground) {
					notifDeps.runInBackground(delivery);
				} else {
					await delivery;
				}
			}

			const detail = await buildPlanDetailResponse(
				db,
				ctx.orgId,
				classId,
				planId,
			);
			return c.json(detail);
		},
	);

	// -------------------------------------------------------------------------
	// POST /classes/:classId/self-study-plan/:planId/cancel
	// -------------------------------------------------------------------------
	router.post("/classes/:classId/self-study-plan/:planId/cancel", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		if (!canPublishGrade(ctx.role)) return c.json({ error: "forbidden" }, 403);

		const db = deps.getDb();
		const classId = c.req.param("classId");
		const planId = c.req.param("planId");

		const cls = await findOrgClass(db, classId, ctx.orgId);
		if (!cls) return c.json({ error: "class not found" }, 404);

		const plan = await findClassPlan(db, planId, classId, ctx.orgId);
		if (!plan) return c.json({ error: "plan not found" }, 404);
		if (plan.status !== "draft" && plan.status !== "published") {
			return c.json(
				{ error: "only draft or published plans can be cancelled" },
				400,
			);
		}

		const now = new Date();
		await db
			.update(selfStudyPlan)
			.set({
				status: "cancelled",
				cancelledAt: now,
				updatedAt: now,
			})
			.where(
				and(eq(selfStudyPlan.id, planId), eq(selfStudyPlan.orgId, ctx.orgId)),
			);

		const detail = await buildPlanDetailResponse(
			db,
			ctx.orgId,
			classId,
			planId,
		);
		return c.json(detail);
	});

	return router;
}
