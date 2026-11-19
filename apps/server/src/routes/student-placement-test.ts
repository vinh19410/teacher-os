import {
	ACCOUNT_ERROR_CODES,
	STUDENT_ERROR_CODES,
} from "@teacher-os/api/contracts";
import {
	libraryAudioExtensionMatches,
	matchesLibraryAudioMagic,
	QUIZ_MEDIA_MAGIC_PEEK_BYTES,
	resolveLibraryAudioMimeType,
	sanitizeMediaFileName,
} from "@teacher-os/api/lib/quiz-media";
import {
	countPlacementWords,
	gradePlacementObjective,
	PLACEMENT_SPEAKING_MEDIA_MAX_BYTES,
	PLACEMENT_UPLOAD_TOKEN_TTL_MS,
	type PlacementObjectiveResult,
	type PlacementSnapshot,
	parseStoredSpeakingRubric,
	parseStoredWritingRubric,
	type StudentPlacementStatus,
	type StudentPlacementStatusResponse,
	type StudentPlacementSubmissionView,
	type StudentPlacementSubmitResponse,
	type StudentPlacementViewResponse,
	studentPlacementSubmitSchema,
} from "@teacher-os/api/placement-test-contracts";
import { lead } from "@teacher-os/db/schema/lead";
import {
	placementTestAudio,
	placementTestSubmission,
} from "@teacher-os/db/schema/placement-test";
import { student } from "@teacher-os/db/schema/student";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { parseByteRange } from "../lib/byte-range";
import { MediaSizeMismatchError, type MediaStore } from "../lib/media-store";
import {
	emitNotifications,
	notificationDepsFrom,
} from "../lib/notifications/emit";
import { placementSubmittedEvent } from "../lib/notifications/templates";
import { type PeekedStream, peekStream } from "../lib/peek-stream";
import type { PlacementAiGrader } from "../lib/placement-ai/grader";
import { parseStoredErrors } from "../lib/placement-ai/placement-result";
import {
	runPlacementAiGrading,
	schedulePlacementAiTask,
} from "../lib/placement-ai/run-placement-grading";
import {
	constantTimeEqualHex,
	findLatestSubmissionForStudent,
	parseJsonOr,
	randomTokenHex,
	safeSpeakingExtension,
	sha256Hex,
	validatePlacementSpeakingModeForSnapshot,
} from "../lib/placement-submission-service";
import {
	type LoadedPlacementSnapshot,
	loadPublishedPlacementSnapshot,
} from "../lib/resolve-lead-org";
import {
	createStudentGuard,
	type StudentEnv,
	type StudentRouteDeps,
} from "./student";

const PLACEMENT_SUBMIT_BODY_MAX_BYTES = 128 * 1024;
const PUBLIC_AUDIO_SRC_PREFIX = "/public/placement-test/audio/";
const STUDENT_AUDIO_SRC_PREFIX = "/api/student/placement-test/audio/";

export interface StudentPlacementTestRouteDeps extends StudentRouteDeps {
	leadOrgId?: string;
	getLibraryAudioStore?(): MediaStore | undefined;
	getPlacementAiGrader?(): PlacementAiGrader | undefined;
	mailer?: Parameters<typeof emitNotifications>[0]["mailer"];
	studentOrigin?: Parameters<typeof emitNotifications>[0]["studentOrigin"];
	notificationRetryDelaysMs?: number[];
}

function toIsoTimestamp(
	value: Date | number | null | undefined,
): string | null {
	if (value instanceof Date) {
		return Number.isFinite(value.getTime()) ? value.toISOString() : null;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return new Date(value).toISOString();
	}
	return null;
}

function rewriteStudentAudioSrc(src: string): string {
	if (src.startsWith(PUBLIC_AUDIO_SRC_PREFIX)) {
		const id = src.slice(PUBLIC_AUDIO_SRC_PREFIX.length);
		return `${STUDENT_AUDIO_SRC_PREFIX}${id}`;
	}
	return src;
}

/**
 * Loại bỏ toàn bộ đáp án (`answer`, `accept`) khỏi đề phát cho học viên
 * và chuyển URL audio sang proxy có xác thực `/api/student/placement-test/audio/:id`.
 */
function sanitizeStudentSnapshot(
	snapshot: PlacementSnapshot,
): PlacementSnapshot {
	const [listening, vg, reading, writing, speaking] = snapshot.parts;
	const sanitized = {
		version: snapshot.version,
		bands: snapshot.bands,
		parts: [
			{
				...listening,
				clips: listening.clips.map((clip) => ({
					...clip,
					src: rewriteStudentAudioSrc(clip.src),
					questions: clip.questions.map((q) => {
						if (q.type === "gap") {
							const { accept: _accept, ...rest } = q;
							return rest;
						}
						const { answer: _answer, ...rest } = q;
						return rest;
					}),
				})),
			},
			{
				...vg,
				questions: vg.questions.map(({ answer: _answer, ...rest }) => rest),
			},
			{
				...reading,
				passages: reading.passages.map((p) => ({
					...p,
					questions: p.questions.map(({ answer: _answer, ...rest }) => rest),
				})),
			},
			writing,
			{
				...speaking,
				tasks: speaking.tasks.map((task) => ({
					...task,
					src: task.src ? rewriteStudentAudioSrc(task.src) : task.src,
				})),
			},
		],
	};
	return sanitized as unknown as PlacementSnapshot;
}

function buildStudentPlacementStatus(
	studentRow: typeof student.$inferSelect,
	sub: typeof placementTestSubmission.$inferSelect | null,
	loadedTest: LoadedPlacementSnapshot | null,
): StudentPlacementStatusResponse {
	const trimmedEntryScore = studentRow.entryScore?.trim() ?? "";
	const hasEntryScore = trimmedEntryScore.length > 0;
	const testAvailable = loadedTest !== null;

	let status: StudentPlacementStatus;
	if (sub) {
		status = sub.status === "graded" ? "graded" : "pending_grading";
	} else if (hasEntryScore) {
		status = "exempt";
	} else if (testAvailable) {
		status = "not_started";
	} else {
		status = "unavailable";
	}

	return {
		status,
		hasEntryScore,
		entryScore: hasEntryScore ? (studentRow.entryScore ?? null) : null,
		promptDismissedAt: toIsoTimestamp(studentRow.placementPromptDismissedAt),
		submissionId: sub ? sub.id : null,
		testAvailable,
		testVersion: loadedTest ? loadedTest.publishedVersion : null,
	};
}

function toStudentPlacementSubmissionView(
	sub: typeof placementTestSubmission.$inferSelect,
): StudentPlacementSubmissionView {
	const objective = parseJsonOr<Partial<PlacementObjectiveResult>>(
		sub.objectiveBreakdownJson,
		{},
	);
	const emptySection = { correct: 0, total: 0, pct: 0 };
	const isGraded = sub.status === "graded";
	const snapshot = isGraded
		? parseJsonOr<Partial<PlacementSnapshot>>(sub.snapshotJson, {})
		: {};
	const bandAdvice = isGraded
		? ((Array.isArray(snapshot.bands) ? snapshot.bands : []).find(
				(b) => b.cefr === sub.finalBandLevel,
			)?.advice ?? "")
		: "";

	return {
		id: sub.id,
		testVersion: sub.testVersion,
		status: sub.status,
		submittedAt: sub.submittedAt.toISOString(),
		gradedAt: isGraded && sub.gradedAt ? sub.gradedAt.toISOString() : null,
		objective: {
			listening: objective.listening ?? emptySection,
			vocabGrammar: objective.vocabGrammar ?? emptySection,
			reading: objective.reading ?? emptySection,
		},
		writingText: sub.writingText,
		writingWordCount: sub.writingWordCount,
		writingRubric: isGraded
			? parseStoredWritingRubric(sub.writingRubricJson)
			: null,
		writingScore: isGraded ? (sub.writingBand ?? sub.writingScore) : null,
		writingErrors: isGraded
			? (parseStoredErrors(sub.writingErrorsJson, sub.writingText) ?? [])
			: [],
		speakingStatus: sub.speakingStatus,
		speakingTranscript: isGraded ? sub.speakingTranscript : "",
		speakingRubric: isGraded
			? parseStoredSpeakingRubric(sub.speakingRubricJson)
			: null,
		speakingScore: isGraded ? (sub.speakingBand ?? sub.speakingScore) : null,
		speakingErrors: isGraded
			? (parseStoredErrors(sub.speakingErrorsJson, sub.speakingTranscript) ??
				[])
			: [],
		finalBandLevel: isGraded ? sub.finalBandLevel : null,
		finalDisplayCourse: isGraded ? sub.finalDisplayCourse : null,
		finalScorePct: isGraded ? sub.finalScorePct : null,
		finalNote: isGraded ? sub.finalNote : "",
		bandAdvice,
		teacherFeedback: isGraded ? sub.teacherFeedback : "",
	};
}

/**
 * API kiểm tra đầu vào cho học viên trong Student Portal (#748):
 * - Mount tại `/api/student`, bảo vệ bởi `createStudentGuard` + Origin CSRF trên POST/PUT.
 * - Dùng chung bộ đề đã phát hành với `/public/placement-test`, KHÔNG tạo lead giả.
 */
export function studentPlacementTestRoutes(
	deps: StudentPlacementTestRouteDeps,
) {
	const router = new Hono<StudentEnv>();
	const allowedOrigins = Array.isArray(deps.corsOrigin)
		? deps.corsOrigin
		: typeof deps.corsOrigin === "string"
			? [deps.corsOrigin]
			: [];
	const fallbackLeadOrgId = deps.leadOrgId?.trim() ?? "";

	router.use("/placement-test/*", async (c, next) => {
		const method = c.req.method.toUpperCase();
		if (method === "POST" || method === "PUT") {
			const origin = c.req.header("Origin") ?? "";
			if (!allowedOrigins.includes(origin)) {
				return c.json({ error: "origin not allowed" }, 403);
			}
		}
		return next();
	});

	router.use("/placement-test/submissions", async (c, next) => {
		if (c.req.method.toUpperCase() === "POST") {
			const contentType = c.req.header("Content-Type") ?? "";
			if (!contentType.toLowerCase().startsWith("application/json")) {
				return c.json({ error: "content-type must be application/json" }, 415);
			}
			return bodyLimit({
				maxSize: PLACEMENT_SUBMIT_BODY_MAX_BYTES,
				onError: (bc) => bc.json({ error: "payload too large" }, 413),
			})(c, next);
		}
		return next();
	});

	const ensureStudentSession = async (
		c: Context<StudentEnv>,
		next: () => Promise<void>,
	) => {
		if (c.get("sessionUser")) return next();
		const session = await deps.getSessionUser(c.req.raw.headers);
		if (!session) {
			return c.json({ error: "unauthorized" }, 401);
		}
		if (session.role !== "student") {
			return c.json(
				{
					error: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
					code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
				},
				403,
			);
		}
		const email = session.email?.trim();
		if (!email) {
			return c.json(
				{
					error: STUDENT_ERROR_CODES.NOT_LINKED,
					code: STUDENT_ERROR_CODES.NOT_LINKED,
				},
				403,
			);
		}
		if (session.emailVerified !== true) {
			return c.json(
				{
					error: STUDENT_ERROR_CODES.EMAIL_UNVERIFIED,
					code: STUDENT_ERROR_CODES.EMAIL_UNVERIFIED,
				},
				403,
			);
		}
		c.set("sessionUser", { ...session, email });
		return next();
	};

	const requireStudent = createStudentGuard(deps);
	router.use("/placement-test", ensureStudentSession, requireStudent);
	router.use("/placement-test/*", ensureStudentSession, requireStudent);

	router.get("/placement-test/status", async (c) => {
		c.header("Cache-Control", "no-store");
		const { student: s, orgId } = c.get("studentCtx");
		const db = deps.getDb();

		const [sub, loadedTest] = await Promise.all([
			findLatestSubmissionForStudent(db, orgId, s),
			loadPublishedPlacementSnapshot(db, orgId, fallbackLeadOrgId),
		]);

		return c.json(buildStudentPlacementStatus(s, sub, loadedTest));
	});

	router.get("/placement-test", async (c) => {
		c.header("Cache-Control", "no-store");
		const { student: s, orgId } = c.get("studentCtx");
		const db = deps.getDb();

		const [initialSub, loadedTest] = await Promise.all([
			findLatestSubmissionForStudent(db, orgId, s),
			loadPublishedPlacementSnapshot(db, orgId, fallbackLeadOrgId),
		]);

		let sub = initialSub;
		// Nếu bài được tìm qua email lead và chưa gắn studentId → backfill an toàn bằng CAS.
		if (sub && sub.studentId === null) {
			await db
				.update(placementTestSubmission)
				.set({ studentId: s.id })
				.where(
					and(
						eq(placementTestSubmission.id, sub.id),
						eq(placementTestSubmission.orgId, orgId),
						isNull(placementTestSubmission.studentId),
					),
				);
			sub = { ...sub, studentId: s.id };
		}

		const statusFields = buildStudentPlacementStatus(s, sub, loadedTest);
		const response: StudentPlacementViewResponse = {
			...statusFields,
			snapshot:
				statusFields.testAvailable && loadedTest && !sub
					? sanitizeStudentSnapshot(loadedTest.snapshot)
					: null,
			submission: sub ? toStudentPlacementSubmissionView(sub) : null,
		};

		return c.json(response);
	});

	router.get("/placement-test/audio/:id", async (c) => {
		const store = deps.getLibraryAudioStore?.();
		if (!store) {
			return c.json(
				{ error: "PLACEMENT_AUDIO_DISABLED", code: "PLACEMENT_AUDIO_DISABLED" },
				503,
			);
		}

		const audioId = c.req.param("id") ?? "";
		if (!audioId) {
			return c.json({ error: "not found" }, 404);
		}

		const { orgId } = c.get("studentCtx");
		const db = deps.getDb();

		let [row] = await db
			.select()
			.from(placementTestAudio)
			.where(
				and(
					eq(placementTestAudio.id, audioId),
					eq(placementTestAudio.orgId, orgId),
				),
			);

		if (!row && fallbackLeadOrgId && fallbackLeadOrgId !== orgId) {
			const activeTest = await loadPublishedPlacementSnapshot(
				db,
				orgId,
				fallbackLeadOrgId,
			);
			if (activeTest?.sourceOrgId === fallbackLeadOrgId) {
				[row] = await db
					.select()
					.from(placementTestAudio)
					.where(
						and(
							eq(placementTestAudio.id, audioId),
							eq(placementTestAudio.orgId, fallbackLeadOrgId),
						),
					);
			}
		}

		if (!row) {
			return c.json({ error: "not found" }, 404);
		}

		const total = row.size;
		const rangeHeader = c.req.header("Range");
		let requestedRange: { start: number; end: number } | null = null;

		if (
			typeof rangeHeader === "string" &&
			rangeHeader.trim().startsWith("bytes=") &&
			!rangeHeader.includes(",")
		) {
			requestedRange = parseByteRange(rangeHeader, total);
			if (!requestedRange) {
				return new Response("Range Not Satisfiable", {
					status: 416,
					headers: {
						"Content-Type": "text/plain; charset=utf-8",
						"Content-Range": `bytes */${total}`,
						"Accept-Ranges": "bytes",
						"X-Content-Type-Options": "nosniff",
						"Content-Security-Policy": "default-src 'none'; sandbox",
					},
				});
			}
		}

		const object = await store.get(
			row.objectKey,
			requestedRange
				? {
						offset: requestedRange.start,
						length: requestedRange.end - requestedRange.start + 1,
					}
				: undefined,
		);

		if (!object) {
			return c.json({ error: "not found" }, 404);
		}

		const commonHeaders: Record<string, string> = {
			"Content-Type": row.contentType || object.contentType,
			"Accept-Ranges": "bytes",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "default-src 'none'; sandbox",
			"Cache-Control": "private, max-age=31536000, immutable",
		};

		if (requestedRange && object.range) {
			return new Response(object.body, {
				status: 206,
				headers: {
					...commonHeaders,
					"Content-Range": `bytes ${requestedRange.start}-${requestedRange.end}/${total}`,
					"Content-Length": String(object.range.length),
				},
			});
		}

		return new Response(object.body, {
			status: 200,
			headers: {
				...commonHeaders,
				"Content-Length": String(total),
			},
		});
	});

	router.post("/placement-test/dismiss", async (c) => {
		c.header("Cache-Control", "no-store");
		const { student: s, orgId } = c.get("studentCtx");
		const existing = toIsoTimestamp(s.placementPromptDismissedAt);
		if (existing) {
			return c.json({ ok: true, promptDismissedAt: existing });
		}

		const db = deps.getDb();
		const now = new Date();
		const [updated] = await db
			.update(student)
			.set({ placementPromptDismissedAt: now })
			.where(
				and(
					eq(student.id, s.id),
					eq(student.orgId, orgId),
					isNull(student.placementPromptDismissedAt),
				),
			)
			.returning({
				placementPromptDismissedAt: student.placementPromptDismissedAt,
			});

		let dismissedAt = toIsoTimestamp(updated?.placementPromptDismissedAt);
		if (!dismissedAt) {
			const [fresh] = await db
				.select({
					placementPromptDismissedAt: student.placementPromptDismissedAt,
				})
				.from(student)
				.where(and(eq(student.id, s.id), eq(student.orgId, orgId)))
				.limit(1);
			dismissedAt =
				toIsoTimestamp(fresh?.placementPromptDismissedAt) ?? now.toISOString();
		}

		return c.json({ ok: true, promptDismissedAt: dismissedAt });
	});

	router.post("/placement-test/submissions", async (c) => {
		c.header("Cache-Control", "no-store");
		const { student: s, orgId } = c.get("studentCtx");
		const db = deps.getDb();

		let rawJson: unknown;
		try {
			rawJson = await c.req.json();
		} catch {
			return c.json(
				{
					error: "PLACEMENT_SUBMIT_INVALID",
					code: "PLACEMENT_SUBMIT_INVALID",
					fields: [],
				},
				400,
			);
		}

		const parsed = studentPlacementSubmitSchema.safeParse(rawJson);
		if (!parsed.success) {
			return c.json(
				{
					error: "PLACEMENT_SUBMIT_INVALID",
					code: "PLACEMENT_SUBMIT_INVALID",
					fields: [
						...new Set(parsed.error.issues.map((i) => i.path.join("."))),
					],
				},
				400,
			);
		}

		const existingSub = await findLatestSubmissionForStudent(db, orgId, s);
		if (existingSub) {
			return c.json(
				{
					error: "PLACEMENT_ALREADY_SUBMITTED",
					code: "PLACEMENT_ALREADY_SUBMITTED",
				},
				409,
			);
		}

		const loadedTest = await loadPublishedPlacementSnapshot(
			db,
			orgId,
			fallbackLeadOrgId,
		);
		if (!loadedTest) {
			return c.json(
				{
					error: "PLACEMENT_NOT_PUBLISHED",
					code: "PLACEMENT_NOT_PUBLISHED",
				},
				404,
			);
		}

		const submit = parsed.data;
		const snapshot = loadedTest.snapshot;
		const speakingCheck = validatePlacementSpeakingModeForSnapshot(
			snapshot,
			submit.speakingMode,
		);
		if (!speakingCheck.ok) {
			return c.json(speakingCheck.body, 400);
		}
		const objective = gradePlacementObjective(snapshot, submit.answers);
		const snapshotJson = JSON.stringify(snapshot);
		const answersJson = JSON.stringify(submit.answers);
		const objectiveBreakdownJson = JSON.stringify(objective);
		const wordCount = countPlacementWords(submit.writingText);

		const speakingStatus = speakingCheck.speakingStatus;

		const nowMs = Date.now();
		const uploadToken =
			speakingStatus === "pending_upload" ? randomTokenHex(32) : null;
		const uploadTokenHash = uploadToken ? await sha256Hex(uploadToken) : null;
		const uploadTokenExpiresAtMs = uploadToken
			? nowMs + PLACEMENT_UPLOAD_TOKEN_TTL_MS
			: null;

		let matchedLeadId: string | null = null;
		const normalizedEmail = s.email.trim().toLowerCase();
		if (normalizedEmail.length > 0) {
			const [matchedLead] = await db
				.select({ id: lead.id })
				.from(lead)
				.where(
					and(
						eq(lead.orgId, orgId),
						sql`lower(trim(${lead.email})) = ${normalizedEmail}`,
					),
				)
				.orderBy(desc(lead.createdAt), desc(lead.id))
				.limit(1);
			matchedLeadId = matchedLead?.id ?? null;
		}

		const submissionId = crypto.randomUUID();
		const inserted = (await db.all(sql`
			INSERT INTO placement_test_submission (
				id, org_id, lead_id, student_id, test_version, snapshot_json, answers_json,
				listening_correct, listening_total, gv_correct, gv_total,
				reading_correct, reading_total, objective_breakdown_json,
				writing_text, writing_word_count, speaking_status,
				speaking_duration_sec, upload_token_hash, upload_token_expires_at,
				status, teacher_feedback, final_note, ip_hash, submitted_at, updated_at
			)
			SELECT
				${submissionId},
				${orgId},
				${matchedLeadId},
				${s.id},
				${loadedTest.publishedVersion},
				${snapshotJson},
				${answersJson},
				${objective.listening.correct},
				${objective.listening.total},
				${objective.vocabGrammar.correct},
				${objective.vocabGrammar.total},
				${objective.reading.correct},
				${objective.reading.total},
				${objectiveBreakdownJson},
				${submit.writingText},
				${wordCount},
				${speakingStatus},
				${submit.speakingDurationSec},
				${uploadTokenHash},
				${uploadTokenExpiresAtMs},
				'pending_grading',
				'',
				'',
				'',
				${nowMs},
				${nowMs}
			WHERE NOT EXISTS (
				SELECT 1 FROM placement_test_submission AS pts
				WHERE pts.org_id = ${orgId}
					AND pts.student_id = ${s.id}
			)
			RETURNING id
		`)) as Array<{ id: string }>;

		if (inserted.length === 0) {
			return c.json(
				{
					error: "PLACEMENT_ALREADY_SUBMITTED",
					code: "PLACEMENT_ALREADY_SUBMITTED",
				},
				409,
			);
		}

		await emitNotifications(notificationDepsFrom(deps), orgId, [
			placementSubmittedEvent({ submissionId, studentId: s.id }),
		]);

		if (
			submit.writingText.trim().length > 0 &&
			submit.speakingMode !== "upload"
		) {
			schedulePlacementAiTask(deps, runPlacementAiGrading(deps, submissionId));
		}

		const response: StudentPlacementSubmitResponse = {
			submissionId,
			uploadToken,
			uploadTokenExpiresAt: uploadTokenExpiresAtMs
				? new Date(uploadTokenExpiresAtMs).toISOString()
				: null,
			objective: {
				listening: objective.listening,
				vocabGrammar: objective.vocabGrammar,
				reading: objective.reading,
			},
		};
		return c.json(response, 201);
	});

	router.put("/placement-test/submissions/:id/speaking", async (c) => {
		c.header("Cache-Control", "no-store");
		const store = deps.getMediaStore?.();
		if (!store) {
			return c.json(
				{
					error: "SPEAKING_MEDIA_DISABLED",
					code: "SPEAKING_MEDIA_DISABLED",
				},
				503,
			);
		}

		const uploadToken = (c.req.header("X-Upload-Token") ?? "").trim();
		if (!uploadToken) {
			return c.json({ error: "UPLOAD_TOKEN_REQUIRED" }, 401);
		}

		const submissionId = c.req.param("id") ?? "";
		if (!submissionId) {
			return c.json({ error: "not found" }, 404);
		}

		const { student: s, orgId } = c.get("studentCtx");
		const db = deps.getDb();

		const [sub] = await db
			.select()
			.from(placementTestSubmission)
			.where(
				and(
					eq(placementTestSubmission.id, submissionId),
					eq(placementTestSubmission.orgId, orgId),
					eq(placementTestSubmission.studentId, s.id),
				),
			)
			.limit(1);

		if (!sub) {
			return c.json({ error: "not found" }, 404);
		}

		if (
			!sub.uploadTokenHash ||
			!sub.uploadTokenExpiresAt ||
			sub.uploadTokenExpiresAt.getTime() < Date.now()
		) {
			return c.json({ error: "UPLOAD_TOKEN_EXPIRED" }, 401);
		}

		const providedHash = await sha256Hex(uploadToken);
		if (!constantTimeEqualHex(providedHash, sub.uploadTokenHash)) {
			return c.json({ error: "UPLOAD_TOKEN_INVALID" }, 401);
		}

		const rawFileName = c.req.header("X-Media-Filename") ?? "speaking.webm";
		const fileName = sanitizeMediaFileName(rawFileName);
		if (!fileName) {
			return c.json({ error: "invalid file name" }, 400);
		}
		const browserType = c.req.header("Content-Type") ?? "";
		const contentType = resolveLibraryAudioMimeType(fileName, browserType);
		if (!contentType || !libraryAudioExtensionMatches(fileName, contentType)) {
			return c.json({ error: "unsupported media type" }, 415);
		}

		const size = Number(c.req.header("Content-Length") ?? "0");
		if (!Number.isInteger(size) || size <= 0) {
			return c.json({ error: "invalid Content-Length" }, 400);
		}
		if (size > PLACEMENT_SPEAKING_MEDIA_MAX_BYTES) {
			return c.json({ error: "payload too large" }, 413);
		}

		const body = c.req.raw.body;
		if (body === null) {
			return c.json({ error: "empty file" }, 400);
		}

		let peeked: PeekedStream;
		try {
			peeked = await peekStream(
				body,
				Math.min(QUIZ_MEDIA_MAGIC_PEEK_BYTES, size + 1),
			);
		} catch {
			return c.json({ error: "upload failed" }, 500);
		}

		if (
			(peeked.ended && peeked.readBytes !== size) ||
			peeked.readBytes > size
		) {
			await peeked.abort("size mismatch");
			return c.json({ error: "size mismatch" }, 400);
		}

		if (!matchesLibraryAudioMagic(contentType, peeked.head, size)) {
			await peeked.abort("unsupported media type");
			return c.json({ error: "unsupported media type" }, 415);
		}

		const ext = safeSpeakingExtension(fileName, contentType);
		const objectKey = `placement-submissions/${sub.orgId}/${sub.id}/${crypto.randomUUID()}.${ext}`;
		const discardObject = () => {
			const p = store.delete(objectKey).catch(() => {});
			deps.runInBackground?.(p);
		};

		try {
			await store.put(objectKey, peeked.stream, { contentType, size });
		} catch (error) {
			await peeked.abort("store error");
			discardObject();
			if (error instanceof MediaSizeMismatchError) {
				return c.json({ error: "size mismatch" }, 400);
			}
			throw error;
		}

		const rawDur = c.req.header("X-Speaking-Duration");
		const parsedDur = rawDur ? Number(rawDur) : Number.NaN;
		const speakingDurationSec =
			Number.isInteger(parsedDur) && parsedDur >= 0 && parsedDur <= 3600
				? parsedDur
				: sub.speakingDurationSec;

		let updated: Array<{ id: string }>;
		try {
			updated = await db
				.update(placementTestSubmission)
				.set({
					speakingStatus: "uploaded",
					speakingMediaKey: objectKey,
					speakingMediaMime: contentType,
					speakingMediaSize: size,
					speakingDurationSec,
					uploadTokenHash: null,
					uploadTokenExpiresAt: null,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(placementTestSubmission.id, sub.id),
						eq(placementTestSubmission.orgId, orgId),
						eq(placementTestSubmission.studentId, s.id),
						eq(placementTestSubmission.uploadTokenHash, sub.uploadTokenHash),
					),
				)
				.returning({ id: placementTestSubmission.id });
		} catch (err) {
			discardObject();
			throw err;
		}

		if (updated.length === 0) {
			discardObject();
			return c.json({ error: "UPLOAD_CONFLICT" }, 409);
		}

		schedulePlacementAiTask(deps, runPlacementAiGrading(deps, sub.id));

		return c.json({
			ok: true,
			speakingStatus: "uploaded" as const,
			size,
			mime: contentType,
		});
	});

	return router;
}
