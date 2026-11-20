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
	type PlacementPublicResultView,
	type PlacementPublicSubmit,
	type PlacementSnapshot,
	parseStoredSpeakingCriterionComments,
	parseStoredSpeakingRubric,
	parseStoredWritingCriterionComments,
	parseStoredWritingRubric,
	placementPublicSubmitSchema,
} from "@teacher-os/api/placement-test-contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { lead } from "@teacher-os/db/schema/lead";
import {
	placementTestAudio,
	placementTestSubmission,
} from "@teacher-os/db/schema/placement-test";
import { student } from "@teacher-os/db/schema/student";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Db } from "../app";
import { parseByteRange } from "../lib/byte-range";
import { MediaSizeMismatchError, type MediaStore } from "../lib/media-store";
import { type PeekedStream, peekStream } from "../lib/peek-stream";
import type { PlacementAiGrader } from "../lib/placement-ai/grader";
import {
	PLACEMENT_RESULT_TOKEN_RE,
	parseStoredErrors,
} from "../lib/placement-ai/placement-result";
import {
	runPlacementAiGrading,
	schedulePlacementAiTask,
} from "../lib/placement-ai/run-placement-grading";
import { validatePlacementSpeakingModeForSnapshot } from "../lib/placement-submission-service";
import {
	loadPublishedPlacementSnapshot,
	resolveLeadTargetOrg,
} from "../lib/resolve-lead-org";

export const PLACEMENT_SUBMISSION_IP_WINDOW_MS = 15 * 60 * 1000;
export const PLACEMENT_SUBMISSION_IP_MAX = 5;
export const PLACEMENT_SUBMISSION_DAILY_CAP = 50;
const PLACEMENT_SUBMIT_BODY_MAX_BYTES = 128 * 1024;
const LEAD_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface PublicPlacementTestRouteDeps {
	getDb(): Db;
	leadOrgId?: string;
	teacherEmails?: string[];
	leadOrigins?: string[];
	leadIpSecret?: string;
	getLibraryAudioStore?(): MediaStore | undefined;
	getMediaStore?(): MediaStore | undefined;
	runInBackground?(promise: Promise<unknown>): void;
	/** #730: grader nháp AI Writing/Speaking (chạy nền sau nộp/upload). */
	getPlacementAiGrader?(): PlacementAiGrader | undefined;
}

function parseJsonOr<T>(raw: string | null, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

async function hmacIpHash(secret: string, ip: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(`placement-sub-ip:${ip}`),
	);
	return [...new Uint8Array(sig)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

async function sha256Hex(raw: string): Promise<string> {
	const data = new TextEncoder().encode(raw);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function randomTokenHex(bytes = 32): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqualHex(a: string, b: string): boolean {
	if (a.length !== b.length || a.length === 0) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i += 1) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

function safeExtension(fileName: string, mime: string): string {
	const clean = sanitizeMediaFileName(fileName);
	if (clean) {
		const dot = clean.lastIndexOf(".");
		if (dot > 0 && dot < clean.length - 1) {
			return clean.slice(dot + 1).toLowerCase();
		}
	}
	if (mime.includes("mp4")) return "m4a";
	if (mime.includes("mpeg")) return "mp3";
	if (mime.includes("ogg")) return "ogg";
	if (mime.includes("wav")) return "wav";
	if (mime.includes("aac")) return "aac";
	if (mime.includes("flac")) return "flac";
	return "webm";
}

async function readRateLimitCounts(
	db: Db,
	leadOrgId: string,
	ipHash: string,
	ipWindowStartMs: number,
	dayStartMs: number,
): Promise<{ ipCount: number; dayCount: number }> {
	const skipIpCheck = ipHash.length === 0 ? 1 : 0;
	const [countsRow] = (await db.all(sql`
		SELECT
			CASE
				WHEN ${skipIpCheck} = 1 THEN 0
				ELSE (
					SELECT count(*) FROM placement_test_submission
					WHERE ip_hash = ${ipHash} AND submitted_at >= ${ipWindowStartMs}
				)
			END AS ip_count,
			(
				SELECT count(*) FROM placement_test_submission
				WHERE org_id = ${leadOrgId} AND submitted_at >= ${dayStartMs}
			) AS day_count
	`)) as Array<{ ip_count: number; day_count: number }>;
	return {
		ipCount: Number(countsRow?.ip_count ?? 0),
		dayCount: Number(countsRow?.day_count ?? 0),
	};
}

async function tryInsertSubmissionAtomic(params: {
	db: Db;
	submissionId: string;
	leadOrgId: string;
	targetLeadId: string;
	testVersion: number;
	snapshotJson: string;
	answersJson: string;
	objective: PlacementObjectiveResult;
	objectiveBreakdownJson: string;
	submit: PlacementPublicSubmit;
	wordCount: number;
	speakingStatus: "none" | "pending_upload";
	uploadTokenHash: string | null;
	uploadTokenExpiresAtMs: number | null;
	ipHash: string;
	nowMs: number;
	ipWindowStartMs: number;
	dayStartMs: number;
	requireUngradedLead: boolean;
}): Promise<boolean> {
	const skipIpCheck = params.ipHash.length === 0 ? 1 : 0;
	const ungradedGuard = params.requireUngradedLead ? 1 : 0;
	const inserted = (await params.db.all(sql`
		INSERT INTO placement_test_submission (
			id, org_id, lead_id, test_version, snapshot_json, answers_json,
			listening_correct, listening_total, gv_correct, gv_total,
			reading_correct, reading_total, objective_breakdown_json,
			writing_text, writing_word_count, speaking_status,
			speaking_duration_sec, upload_token_hash, upload_token_expires_at,
			status, teacher_feedback, final_note, ip_hash, submitted_at, updated_at
		)
		SELECT
			${params.submissionId},
			${params.leadOrgId},
			${params.targetLeadId},
			${params.testVersion},
			${params.snapshotJson},
			${params.answersJson},
			${params.objective.listening.correct},
			${params.objective.listening.total},
			${params.objective.vocabGrammar.correct},
			${params.objective.vocabGrammar.total},
			${params.objective.reading.correct},
			${params.objective.reading.total},
			${params.objectiveBreakdownJson},
			${params.submit.writingText},
			${params.wordCount},
			${params.speakingStatus},
			${params.submit.speakingDurationSec},
			${params.uploadTokenHash},
			${params.uploadTokenExpiresAtMs},
			'pending_grading',
			'',
			'',
			${params.ipHash},
			${params.nowMs},
			${params.nowMs}
		WHERE
			(${skipIpCheck} = 1 OR (
				SELECT count(*) FROM placement_test_submission
				WHERE ip_hash = ${params.ipHash} AND submitted_at >= ${params.ipWindowStartMs}
			) < ${PLACEMENT_SUBMISSION_IP_MAX})
			AND (
				SELECT count(*) FROM placement_test_submission
				WHERE org_id = ${params.leadOrgId} AND submitted_at >= ${params.dayStartMs}
			) < ${PLACEMENT_SUBMISSION_DAILY_CAP}
			AND (${ungradedGuard} = 0 OR NOT EXISTS (
				SELECT 1 FROM placement_test_submission AS pts
				WHERE pts.org_id = ${params.leadOrgId}
					AND pts.lead_id = ${params.targetLeadId}
					AND pts.status = 'graded'
			))
		RETURNING id
	`)) as Array<{ id: string }>;
	return inserted.length > 0;
}

/**
 * Route công khai cho `/kiem-tra-dau-vao/` trên `apps/profile` (#515, #721).
 * Mount ngoài `/api/*` để không qua bootstrap/session; CORS theo `leadOrigins`
 * (không credentials). Hỗ trợ phát audio Range, nộp bài 5 kỹ năng, và tải
 * audio Speaking bằng upload token dùng một lần.
 */
export function publicPlacementTestRoutes(deps: PublicPlacementTestRouteDeps) {
	const router = new Hono();

	router.use(
		"*",
		cors({
			origin: deps.leadOrigins ?? [],
			allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
			allowHeaders: [
				"Range",
				"Content-Type",
				"X-Upload-Token",
				"X-Media-Filename",
				"X-Speaking-Duration",
			],
			exposeHeaders: ["Accept-Ranges", "Content-Range", "Content-Length"],
			maxAge: 600,
		}),
	);

	router.get("/", async (c) => {
		const configuredLeadOrgId = deps.leadOrgId?.trim() ?? "";
		if (!configuredLeadOrgId) {
			return c.json(
				{ error: "PLACEMENT_DISABLED", code: "PLACEMENT_DISABLED" },
				503,
			);
		}

		const db = deps.getDb();
		const targetOrgId =
			(await resolveLeadTargetOrg(db, deps)) ?? configuredLeadOrgId;
		const loaded = await loadPublishedPlacementSnapshot(
			db,
			targetOrgId,
			configuredLeadOrgId,
		);

		if (!loaded) {
			return c.json(
				{ error: "PLACEMENT_NOT_PUBLISHED", code: "PLACEMENT_NOT_PUBLISHED" },
				404,
			);
		}

		return new Response(JSON.stringify(loaded.snapshot), {
			status: 200,
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				"Cache-Control": "no-cache",
			},
		});
	});

	router.get("/audio/:id", async (c) => {
		const configuredLeadOrgId = deps.leadOrgId?.trim() ?? "";
		if (!configuredLeadOrgId) {
			return c.json(
				{ error: "PLACEMENT_DISABLED", code: "PLACEMENT_DISABLED" },
				503,
			);
		}

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

		const db = deps.getDb();
		const targetOrgId =
			(await resolveLeadTargetOrg(db, deps)) ?? configuredLeadOrgId;

		let [row] = await db
			.select()
			.from(placementTestAudio)
			.where(
				and(
					eq(placementTestAudio.id, audioId),
					eq(placementTestAudio.orgId, targetOrgId),
				),
			);

		if (!row && configuredLeadOrgId !== targetOrgId) {
			const activeTest = await loadPublishedPlacementSnapshot(
				db,
				targetOrgId,
				configuredLeadOrgId,
			);
			if (activeTest?.sourceOrgId === configuredLeadOrgId) {
				[row] = await db
					.select()
					.from(placementTestAudio)
					.where(
						and(
							eq(placementTestAudio.id, audioId),
							eq(placementTestAudio.orgId, configuredLeadOrgId),
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
			"Cache-Control": "public, max-age=31536000, immutable",
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

	router.post("/submissions", async (c) => {
		c.header("Cache-Control", "no-store");
		const configuredLeadOrgId = deps.leadOrgId?.trim() ?? "";
		if (!configuredLeadOrgId) {
			return c.json(
				{ error: "PLACEMENT_DISABLED", code: "PLACEMENT_DISABLED" },
				503,
			);
		}

		const origin = c.req.header("Origin") ?? "";
		if (!(deps.leadOrigins ?? []).includes(origin)) {
			return c.json(
				{ error: "LEAD_ORIGIN_FORBIDDEN", code: "LEAD_ORIGIN_FORBIDDEN" },
				403,
			);
		}

		const contentLength = Number(c.req.header("Content-Length") ?? "0");
		if (
			Number.isFinite(contentLength) &&
			contentLength > PLACEMENT_SUBMIT_BODY_MAX_BYTES
		) {
			return c.json({ error: "payload too large" }, 413);
		}
		const rawBody = await c.req.raw.text();
		if (
			new TextEncoder().encode(rawBody).byteLength >
			PLACEMENT_SUBMIT_BODY_MAX_BYTES
		) {
			return c.json({ error: "payload too large" }, 413);
		}

		let rawJson: unknown;
		try {
			rawJson = JSON.parse(rawBody);
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

		const parsed = placementPublicSubmitSchema.safeParse(rawJson);
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

		const db = deps.getDb();
		const leadOrgId =
			(await resolveLeadTargetOrg(db, deps)) ?? configuredLeadOrgId;
		const now = new Date();
		const nowMs = now.getTime();
		const ipWindowStartMs = nowMs - PLACEMENT_SUBMISSION_IP_WINDOW_MS;
		const dayStartMs = Date.parse(`${vietnamTodayISO()}T00:00:00+07:00`);
		const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
		const ipHash = deps.leadIpSecret
			? await hmacIpHash(deps.leadIpSecret, ip)
			: "";

		const rateLimitResponse = (counts: {
			ipCount: number;
			dayCount: number;
		}) => {
			if (ipHash.length > 0 && counts.ipCount >= PLACEMENT_SUBMISSION_IP_MAX) {
				return c.json(
					{ error: "PLACEMENT_RATE_LIMITED", code: "PLACEMENT_RATE_LIMITED" },
					429,
				);
			}
			return c.json(
				{ error: "PLACEMENT_DAILY_CAP", code: "PLACEMENT_DAILY_CAP" },
				429,
			);
		};

		const preCounts = await readRateLimitCounts(
			db,
			leadOrgId,
			ipHash,
			ipWindowStartMs,
			dayStartMs,
		);
		if (
			(ipHash.length > 0 && preCounts.ipCount >= PLACEMENT_SUBMISSION_IP_MAX) ||
			preCounts.dayCount >= PLACEMENT_SUBMISSION_DAILY_CAP
		) {
			return rateLimitResponse(preCounts);
		}

		const loadedTest = await loadPublishedPlacementSnapshot(
			db,
			leadOrgId,
			configuredLeadOrgId,
		);

		if (!loadedTest) {
			return c.json(
				{ error: "PLACEMENT_NOT_PUBLISHED", code: "PLACEMENT_NOT_PUBLISHED" },
				404,
			);
		}

		const snapshot = loadedTest.snapshot;
		const submit = parsed.data;
		const speakingCheck = validatePlacementSpeakingModeForSnapshot(
			snapshot,
			submit.speakingMode,
		);
		if (!speakingCheck.ok) {
			return c.json(speakingCheck.body, 400);
		}
		const objective = gradePlacementObjective(snapshot, submit.answers);
		const normalizedSnapshotJson = JSON.stringify(snapshot);
		const answersJson = JSON.stringify(submit.answers);
		const objectiveBreakdownJson = JSON.stringify(objective);

		const submissionId = crypto.randomUUID();
		const speakingStatus = speakingCheck.speakingStatus;

		const uploadToken =
			speakingStatus === "pending_upload" ? randomTokenHex(32) : null;
		const uploadTokenHash = uploadToken ? await sha256Hex(uploadToken) : null;
		const uploadTokenExpiresAtMs = uploadToken
			? nowMs + PLACEMENT_UPLOAD_TOKEN_TTL_MS
			: null;
		const wordCount = countPlacementWords(submit.writingText);

		// Liên kết Lead cùng org trong cửa sổ dedupe 24h theo SĐT chuẩn hóa khi Lead chưa
		// có bài chấm chính thức (`status = 'graded'`), tránh ghi đè kết quả đã chấm của Cô Mỹ.
		const dedupeCutoff = new Date(nowMs - LEAD_DEDUPE_WINDOW_MS);
		const [mergeCandidate] = await db
			.select()
			.from(lead)
			.where(
				and(
					eq(lead.orgId, leadOrgId),
					eq(lead.phone, submit.lead.phone),
					gte(lead.createdAt, dedupeCutoff),
					sql`NOT EXISTS (
						SELECT 1 FROM placement_test_submission AS pts
						WHERE pts.org_id = ${leadOrgId}
							AND pts.lead_id = ${lead.id}
							AND pts.status = 'graded'
					)`,
				),
			)
			.orderBy(desc(lead.createdAt), desc(lead.id))
			.limit(1);

		let leadId = "";
		if (mergeCandidate) {
			const mergedOk = await tryInsertSubmissionAtomic({
				db,
				submissionId,
				leadOrgId,
				targetLeadId: mergeCandidate.id,
				testVersion: loadedTest.publishedVersion,
				snapshotJson: normalizedSnapshotJson,
				answersJson,
				objective,
				objectiveBreakdownJson,
				submit,
				wordCount,
				speakingStatus,
				uploadTokenHash,
				uploadTokenExpiresAtMs,
				ipHash,
				nowMs,
				ipWindowStartMs,
				dayStartMs,
				requireUngradedLead: true,
			});

			if (mergedOk) {
				leadId = mergeCandidate.id;
				await db
					.update(lead)
					.set({
						name: mergeCandidate.name || submit.lead.name,
						email: mergeCandidate.email || submit.lead.email,
						birthDate: mergeCandidate.birthDate || submit.lead.birthDate,
						note: mergeCandidate.note || submit.lead.note,
						placement: objective.provisionalSummary,
						course: objective.provisionalBand.course,
						submitCount: sql`${lead.submitCount} + 1`,
						updatedAt: now,
					})
					.where(
						and(eq(lead.id, mergeCandidate.id), eq(lead.orgId, leadOrgId)),
					);
			} else {
				const postCounts = await readRateLimitCounts(
					db,
					leadOrgId,
					ipHash,
					ipWindowStartMs,
					dayStartMs,
				);
				if (
					(ipHash.length > 0 &&
						postCounts.ipCount >= PLACEMENT_SUBMISSION_IP_MAX) ||
					postCounts.dayCount >= PLACEMENT_SUBMISSION_DAILY_CAP
				) {
					return rateLimitResponse(postCounts);
				}
			}
		}

		if (!leadId) {
			const newLeadId = crypto.randomUUID();
			await db.insert(lead).values({
				id: newLeadId,
				orgId: leadOrgId,
				name: submit.lead.name,
				phone: submit.lead.phone,
				email: submit.lead.email,
				birthDate: submit.lead.birthDate,
				course: objective.provisionalBand.course,
				studyMode: "",
				studyDays: "",
				timeSlot: "",
				note: submit.lead.note,
				placement: objective.provisionalSummary,
				teacherNote: "",
				source: "placement-test",
				status: "new",
				ipHash,
				submitCount: 1,
				createdAt: now,
				updatedAt: now,
			});

			let freshOk = false;
			try {
				freshOk = await tryInsertSubmissionAtomic({
					db,
					submissionId,
					leadOrgId,
					targetLeadId: newLeadId,
					testVersion: loadedTest.publishedVersion,
					snapshotJson: normalizedSnapshotJson,
					answersJson,
					objective,
					objectiveBreakdownJson,
					submit,
					wordCount,
					speakingStatus,
					uploadTokenHash,
					uploadTokenExpiresAtMs,
					ipHash,
					nowMs,
					ipWindowStartMs,
					dayStartMs,
					requireUngradedLead: false,
				});
			} catch (err) {
				await db
					.delete(lead)
					.where(eq(lead.id, newLeadId))
					.catch(() => {});
				throw err;
			}

			if (!freshOk) {
				await db
					.delete(lead)
					.where(eq(lead.id, newLeadId))
					.catch(() => {});
				const postCounts = await readRateLimitCounts(
					db,
					leadOrgId,
					ipHash,
					ipWindowStartMs,
					dayStartMs,
				);
				return rateLimitResponse(postCounts);
			}
			leadId = newLeadId;
		}

		// #730: chấm nháp AI nền. Chế độ upload chờ file Speaking rồi chấm
		// Writing + Speaking cùng lượt ở PUT speaking-media.
		if (submit.speakingMode !== "upload") {
			schedulePlacementAiTask(deps, runPlacementAiGrading(deps, submissionId));
		}

		return c.json(
			{
				submissionId,
				leadId,
				uploadToken,
				speakingStatus,
				objective: {
					listening: objective.listening,
					vocabGrammar: objective.vocabGrammar,
					reading: objective.reading,
					totalCorrect: objective.totalCorrect,
					totalQuestions: objective.totalQuestions,
					averagePct: objective.averagePct,
					byLevel: objective.byLevel,
					provisionalBand: objective.provisionalBand,
					provisionalSummary: objective.provisionalSummary,
				},
			},
			201,
		);
	});

	router.put("/submissions/:id/speaking-media", async (c) => {
		c.header("Cache-Control", "no-store");
		const configuredLeadOrgId = deps.leadOrgId?.trim() ?? "";
		if (!configuredLeadOrgId) {
			return c.json(
				{ error: "PLACEMENT_DISABLED", code: "PLACEMENT_DISABLED" },
				503,
			);
		}

		const origin = c.req.header("Origin") ?? "";
		if (!(deps.leadOrigins ?? []).includes(origin)) {
			return c.json(
				{ error: "LEAD_ORIGIN_FORBIDDEN", code: "LEAD_ORIGIN_FORBIDDEN" },
				403,
			);
		}

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

		const db = deps.getDb();
		const targetOrgId =
			(await resolveLeadTargetOrg(db, deps)) ?? configuredLeadOrgId;
		const allowedOrgIds =
			configuredLeadOrgId !== targetOrgId
				? [targetOrgId, configuredLeadOrgId]
				: [targetOrgId];

		const [sub] = await db
			.select()
			.from(placementTestSubmission)
			.where(
				and(
					eq(placementTestSubmission.id, submissionId),
					inArray(placementTestSubmission.orgId, allowedOrgIds),
				),
			);

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

		const ext = safeExtension(fileName, contentType);
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
						eq(placementTestSubmission.orgId, sub.orgId),
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

		// #730: chấm nháp AI Writing + Speaking cùng lượt sau upload.
		schedulePlacementAiTask(deps, runPlacementAiGrading(deps, sub.id));

		return c.json({
			ok: true,
			speakingStatus: "uploaded",
			size,
			mime: contentType,
		});
	});

	/**
	 * #730: kết quả công khai cho học viên theo token link (sau khi giáo viên
	 * chốt). Không trả nháp AI, đáp án đúng hay PII ngoài tên học viên.
	 */
	router.get("/results/:token", async (c) => {
		c.header("Cache-Control", "no-store");
		const notFound = () =>
			c.json(
				{
					error: "PLACEMENT_RESULT_NOT_FOUND",
					code: "PLACEMENT_RESULT_NOT_FOUND",
				},
				404,
			);
		const configuredLeadOrgId = deps.leadOrgId?.trim() ?? "";
		if (!configuredLeadOrgId) {
			return c.json(
				{ error: "PLACEMENT_DISABLED", code: "PLACEMENT_DISABLED" },
				503,
			);
		}
		const token = (c.req.param("token") ?? "").trim().toLowerCase();
		if (!PLACEMENT_RESULT_TOKEN_RE.test(token)) return notFound();

		const db = deps.getDb();
		const targetOrgId =
			(await resolveLeadTargetOrg(db, deps)) ?? configuredLeadOrgId;
		const allowedOrgIds =
			configuredLeadOrgId !== targetOrgId
				? [targetOrgId, configuredLeadOrgId]
				: [targetOrgId];

		const [row] = await db
			.select({
				sub: placementTestSubmission,
				leadName: lead.name,
				studentName: student.name,
			})
			.from(placementTestSubmission)
			.leftJoin(lead, eq(lead.id, placementTestSubmission.leadId))
			.leftJoin(student, eq(student.id, placementTestSubmission.studentId))
			.where(
				and(
					eq(placementTestSubmission.resultToken, token),
					inArray(placementTestSubmission.orgId, allowedOrgIds),
				),
			)
			.limit(1);
		const sub = row?.sub;
		if (
			!row ||
			!sub?.resultToken ||
			!constantTimeEqualHex(sub.resultToken, token) ||
			sub.status !== "graded" ||
			!sub.resultPublishedAt ||
			!sub.gradedAt
		) {
			return notFound();
		}

		const objective = parseJsonOr<Partial<PlacementObjectiveResult>>(
			sub.objectiveBreakdownJson,
			{},
		);
		const snapshot = parseJsonOr<Partial<PlacementSnapshot>>(
			sub.snapshotJson,
			{},
		);
		const emptySection = { correct: 0, total: 0, pct: 0 };
		const bandAdvice =
			(Array.isArray(snapshot.bands) ? snapshot.bands : []).find(
				(b) => b.cefr === sub.finalBandLevel,
			)?.advice ?? "";

		const view: PlacementPublicResultView = {
			studentName: row.leadName ?? row.studentName ?? "Học viên",
			submittedAt: sub.submittedAt.toISOString(),
			gradedAt: sub.gradedAt.toISOString(),
			objective: {
				listening: objective.listening ?? emptySection,
				vocabGrammar: objective.vocabGrammar ?? emptySection,
				reading: objective.reading ?? emptySection,
			},
			writingText: sub.writingText,
			writingRubric: parseStoredWritingRubric(sub.writingRubricJson),
			writingScore: sub.writingBand ?? sub.writingScore,
			writingCriterionComments: parseStoredWritingCriterionComments(
				sub.writingCriterionCommentsJson,
			),
			writingErrors:
				parseStoredErrors(sub.writingErrorsJson, sub.writingText, "writing") ??
				[],
			speakingStatus: sub.speakingStatus,
			speakingTranscript: sub.speakingTranscript,
			speakingRubric: parseStoredSpeakingRubric(sub.speakingRubricJson),
			speakingScore: sub.speakingBand ?? sub.speakingScore,
			speakingCriterionComments: parseStoredSpeakingCriterionComments(
				sub.speakingCriterionCommentsJson,
			),
			speakingErrors:
				parseStoredErrors(
					sub.speakingErrorsJson,
					sub.speakingTranscript,
					"speaking",
				) ?? [],
			finalBandLevel: sub.finalBandLevel,
			finalDisplayCourse: sub.finalDisplayCourse,
			finalScorePct: sub.finalScorePct,
			finalNote: sub.finalNote,
			bandAdvice,
			teacherFeedback: sub.teacherFeedback,
		};
		return c.json(view);
	});

	return router;
}
