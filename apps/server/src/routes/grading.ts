import {
	quizGradeInputSchema,
	type TeacherSubmission,
} from "@teacher-os/api/contracts";
import {
	type GradableSkill,
	isGradableSkill,
} from "@teacher-os/api/lib/ielts-band";
import {
	assignmentPrompt,
	classAssignment,
	classTable,
	quizAttempt,
	student,
} from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Db, KernelCtx } from "../app";
import { mediaObjectResponse, toQuizAttemptMedia } from "../lib/media-response";
import type { MediaStore } from "../lib/media-store";
import { parseGradeScores, toQuizAttemptGrade } from "../lib/quiz-grade";

type Env = { Variables: { kernelCtx: KernelCtx } };
type GradingContext = Context<Env>;

type GradableAttemptRow = {
	id: string;
	status: string;
	assignmentId: string;
	essay: string;
	mediaKey: string | null;
	mediaName: string | null;
	mediaType: string | null;
	mediaSize: number | null;
	mediaUploadedAt: Date | null;
	startedAt: Date;
	submittedAt: Date | null;
	gradeScores: Record<string, number> | null;
	gradeFeedback: string;
	gradedAt: Date | null;
	caId: string;
	classId: string;
	title: string;
	due: string;
	className: string;
	studentId: string;
	studentName: string;
	skill: string;
	part: string;
	prompt: string;
	imageUrl: string;
	cueTopic: string;
	cuePoints: string;
	note: string;
};

/**
 * Router chấm bài Writing/Speaking (#319). Mount TRONG kernelRoutes
 * (`kernel.route("/grading", …)`) để thừa hưởng Origin guard + guard JSON
 * POST + role gate teacher — không mount standalone.
 */
export function gradingRoutes(deps: {
	getDb(): Db;
	getMediaStore?(): MediaStore | undefined;
}) {
	const routes = new Hono<Env>();

	function unauthorized(c: GradingContext) {
		return c.json({ error: "unauthorized" }, 401);
	}

	/** Attempt + đề + học viên theo org — mọi join có predicate orgId
	 * (cùng chuẩn IDOR với `loadAttemptForReview` ở student.ts). */
	async function loadGradableAttempt(
		db: Db,
		attemptId: string,
		orgId: string,
	): Promise<
		| { error: 404 | 409 | 400 }
		| { row: GradableAttemptRow; skill: GradableSkill }
	> {
		const [row] = await db
			.select({
				id: quizAttempt.id,
				status: quizAttempt.status,
				assignmentId: quizAttempt.assignmentId,
				essay: quizAttempt.essay,
				mediaKey: quizAttempt.mediaKey,
				mediaName: quizAttempt.mediaName,
				mediaType: quizAttempt.mediaType,
				mediaSize: quizAttempt.mediaSize,
				mediaUploadedAt: quizAttempt.mediaUploadedAt,
				startedAt: quizAttempt.startedAt,
				submittedAt: quizAttempt.submittedAt,
				gradeScores: quizAttempt.gradeScores,
				gradeFeedback: quizAttempt.gradeFeedback,
				gradedAt: quizAttempt.gradedAt,
				caId: classAssignment.id,
				classId: classAssignment.classId,
				title: classAssignment.title,
				due: classAssignment.due,
				className: classTable.name,
				studentId: student.id,
				studentName: student.name,
				skill: assignmentPrompt.skill,
				part: assignmentPrompt.part,
				prompt: assignmentPrompt.prompt,
				imageUrl: assignmentPrompt.imageUrl,
				cueTopic: assignmentPrompt.cueTopic,
				cuePoints: assignmentPrompt.cuePoints,
				note: assignmentPrompt.note,
			})
			.from(quizAttempt)
			.innerJoin(
				classAssignment,
				and(
					eq(classAssignment.id, quizAttempt.assignmentId),
					eq(classAssignment.orgId, orgId),
				),
			)
			.innerJoin(
				assignmentPrompt,
				and(
					eq(assignmentPrompt.id, classAssignment.promptId),
					eq(assignmentPrompt.orgId, orgId),
				),
			)
			.innerJoin(
				classTable,
				and(
					eq(classTable.id, classAssignment.classId),
					eq(classTable.orgId, orgId),
				),
			)
			.innerJoin(
				student,
				and(eq(student.id, quizAttempt.studentId), eq(student.orgId, orgId)),
			)
			.where(and(eq(quizAttempt.id, attemptId), eq(quizAttempt.orgId, orgId)));
		if (!row) return { error: 404 };
		if (row.status !== "submitted") return { error: 409 };
		if (!isGradableSkill(row.skill)) return { error: 400 };
		return { row, skill: row.skill };
	}

	function errorResponse(c: GradingContext, code: 404 | 409 | 400) {
		if (code === 404) {
			return c.json({ error: "attempt not found" }, 404);
		}
		if (code === 409) {
			return c.json(
				{ error: "attempt not yet submitted", code: "NOT_SUBMITTED" },
				409,
			);
		}
		return c.json(
			{ error: "skill not gradable", code: "SKILL_NOT_GRADABLE" },
			400,
		);
	}

	/** Cột prompt có thể rỗng ở dữ liệu cũ — bọc `?? ""` cho từng field. */
	function toSubmission(
		row: GradableAttemptRow,
		skill: GradableSkill,
	): TeacherSubmission {
		return {
			attemptId: row.id,
			classAssignmentId: row.caId,
			classId: row.classId,
			className: row.className,
			title: row.title,
			due: row.due,
			student: { id: row.studentId, name: row.studentName },
			skill,
			part: row.part,
			prompt: {
				prompt: row.prompt ?? "",
				imageUrl: row.imageUrl ?? "",
				cueTopic: row.cueTopic ?? "",
				cuePoints: row.cuePoints ?? "",
				note: row.note ?? "",
			},
			startedAt: row.startedAt.toISOString(),
			submittedAt: row.submittedAt ? row.submittedAt.toISOString() : "",
			essay: skill === "writing" ? row.essay : null,
			media: skill === "speaking" ? toQuizAttemptMedia(row) : null,
			grade: toQuizAttemptGrade(row),
		};
	}

	routes.get("/:attemptId", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const loaded = await loadGradableAttempt(
			deps.getDb(),
			c.req.param("attemptId"),
			ctx.orgId,
		);
		if ("error" in loaded) return errorResponse(c, loaded.error);
		return c.json(toSubmission(loaded.row, loaded.skill));
	});

	/**
	 * GET /api/grading/:attemptId/media — phát lại file bài nói cho giáo viên
	 * chấm. Header dựng từ cùng helper với route học viên; CORP `same-site`
	 * được set ở app.ts (secureHeaders global ghi đè header của handler).
	 */
	routes.get("/:attemptId/media", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const store = deps.getMediaStore?.();
		if (!store) {
			return c.json({ error: "media storage unavailable" }, 503);
		}
		const loaded = await loadGradableAttempt(
			deps.getDb(),
			c.req.param("attemptId"),
			ctx.orgId,
		);
		if ("error" in loaded) return errorResponse(c, loaded.error);
		if (loaded.skill !== "speaking" || loaded.row.mediaKey === null) {
			return c.json({ error: "media not found" }, 404);
		}
		const object = await store.get(loaded.row.mediaKey);
		if (!object) {
			return c.json({ error: "media not found" }, 404);
		}
		return mediaObjectResponse(object, loaded.row);
	});

	routes.post("/:attemptId/grade", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		// Parse body inline — cùng pattern try/catch + safeParse với student.ts.
		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		const body = quizGradeInputSchema.safeParse(raw);
		if (!body.success) {
			return c.json({ error: "invalid body" }, 400);
		}
		const loaded = await loadGradableAttempt(
			deps.getDb(),
			c.req.param("attemptId"),
			ctx.orgId,
		);
		if ("error" in loaded) return errorResponse(c, loaded.error);
		const scores = parseGradeScores(loaded.skill, body.data.scores);
		if (!scores) {
			return c.json({ error: "invalid scores" }, 400);
		}
		const now = new Date();
		const updated = await deps
			.getDb()
			.update(quizAttempt)
			.set({
				gradeScores: scores,
				gradeFeedback: body.data.feedback,
				gradedAt: now,
			})
			.where(
				and(
					eq(quizAttempt.id, loaded.row.id),
					eq(quizAttempt.orgId, ctx.orgId),
					eq(quizAttempt.status, "submitted"),
				),
			)
			.returning({ id: quizAttempt.id });
		if (updated.length === 0) {
			return c.json(
				{ error: "attempt not yet submitted", code: "NOT_SUBMITTED" },
				409,
			);
		}
		const grade = toQuizAttemptGrade({
			gradeScores: scores,
			gradeFeedback: body.data.feedback,
			gradedAt: now,
		});
		if (!grade) {
			return c.json({ error: "grade persistence failed" }, 500);
		}
		return c.json(grade);
	});

	return routes;
}
