import {
	normalizeMediaType,
	sanitizeMediaFileName,
} from "@teacher-os/api/lib/quiz-media";
import {
	buildPlacementZaloText,
	computePlacementFinal,
	locatePlacementErrors,
	PLACEMENT_AI_ERROR_CODES,
	type PlacementObjectiveResult,
	type PlacementSnapshot,
	type PlacementSpeakingRubric,
	type PlacementSubmissionDetail,
	type PlacementWritingRubric,
	type placementTeacherGradeSchema,
} from "@teacher-os/api/placement-test-contracts";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import { user } from "@teacher-os/db/schema/auth";
import { lead } from "@teacher-os/db/schema/lead";
import { placementTestSubmission } from "@teacher-os/db/schema/placement-test";
import { student } from "@teacher-os/db/schema/student";
import { and, asc, desc, eq, inArray, isNull, notLike, sql } from "drizzle-orm";
import type { Context } from "hono";
import type { Db, KernelCtx } from "../app";
import { parseByteRange } from "./byte-range";
import { mediaObjectResponse } from "./media-response";
import type { MediaStore } from "./media-store";
import type { PlacementAiGrader } from "./placement-ai/grader";
import {
	buildPlacementResultUrl,
	type PlacementResultEmailStatus,
	type PlacementResultEmailSummary,
	parseAiSpeakingDraft,
	parseAiWritingDraft,
	parseStoredErrors,
	randomResultToken,
	sendPlacementResultEmail,
} from "./placement-ai/placement-result";
import {
	claimPlacementAiGrading,
	finalizePlacementAiGrading,
	hasPlacementAiWork,
	runClaimedPlacementAiGrading,
	schedulePlacementAiTask,
} from "./placement-ai/run-placement-grading";

export type PlacementSubmissionSubject =
	| { kind: "lead"; row: typeof lead.$inferSelect }
	| { kind: "student"; row: typeof student.$inferSelect };

export interface PlacementSubmissionServiceDeps {
	getDb(): Db;
	getMediaStore?(): MediaStore | undefined;
	/** #730: grader nháp AI placement (vắng → retry trả 503). */
	getPlacementAiGrader?(): PlacementAiGrader | undefined;
	runInBackground?(promise: Promise<unknown>): void;
	/** #730: gửi link kết quả cho học viên khi chốt (vắng → `skipped`). */
	mailer?: Mailer;
	/** #730: origin profile đầu tiên dựng link kết quả tuyệt đối. */
	leadOrigins?: string[];
	/** Origin portal học viên — có thì email trỏ về `/placement-test` khi người nhận đã có tài khoản học viên. */
	studentOrigin?: string;
}

type KernelContext = Context<{ Variables: { kernelCtx: KernelCtx } }>;

const RESULT_EMAIL_STATUSES = new Set(["sent", "failed", "skipped"]);

/**
 * Link nút "Xem chi tiết kết quả". Chỉ trỏ trang `/placement-test` của portal
 * khi chắc chắn portal hiển thị ĐÚNG bài vừa chốt: có `studentOrigin`, có dòng
 * học viên trong org khớp email người nhận (không phân biệt hoa/thường), có
 * tài khoản auth role `student` cùng email đã xác minh, và bài mới nhất portal chọn cho
 * học viên đó chính là `submissionId`. Ngược lại (hoặc truy vấn lỗi) → link
 * kết quả công khai.
 */
export async function resolvePlacementResultLink(
	db: Db,
	params: {
		orgId: string;
		submissionId: string;
		recipientEmail: string;
		studentOrigin: string | undefined;
		publicUrl: string;
	},
): Promise<string> {
	const email = params.recipientEmail.trim().toLowerCase();
	const origin = (params.studentOrigin ?? "").trim().replace(/\/+$/, "");
	if (!email || !origin) return params.publicUrl;
	try {
		const [account] = await db
			.select({ id: user.id })
			.from(user)
			.where(
				and(
					eq(user.role, "student"),
					eq(user.emailVerified, true),
					sql`lower(trim(${user.email})) = ${email}`,
				),
			)
			.limit(1);
		if (!account) return params.publicUrl;
		// Cùng thứ tự chọn dòng học viên với guard portal.
		const [studentRow] = await db
			.select()
			.from(student)
			.where(
				and(
					eq(student.orgId, params.orgId),
					sql`lower(trim(${student.email})) = ${email}`,
					notLike(student.id, "demo-student:%"),
				),
			)
			.orderBy(desc(student.createdAt), asc(student.id))
			.limit(1);
		if (!studentRow) return params.publicUrl;
		const latest = await findLatestSubmissionForStudent(
			db,
			params.orgId,
			studentRow,
		);
		return latest?.id === params.submissionId
			? `${origin}/placement-test`
			: params.publicUrl;
	} catch (error) {
		console.error(
			"[placement-ai] portal account lookup failed",
			error instanceof Error ? error.name : "unknown",
		);
		return params.publicUrl;
	}
}

export function parseJsonOr<T>(raw: string | null, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

export async function sha256Hex(raw: string): Promise<string> {
	const data = new TextEncoder().encode(raw);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export function randomTokenHex(bytes = 32): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqualHex(a: string, b: string): boolean {
	if (a.length !== b.length || a.length === 0) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i += 1) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

export function safeSpeakingExtension(fileName: string, mime: string): string {
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

export async function findLatestSubmissionForLead(
	db: Db,
	orgId: string,
	leadId: string,
): Promise<typeof placementTestSubmission.$inferSelect | null> {
	const [sub] = await db
		.select()
		.from(placementTestSubmission)
		.where(
			and(
				eq(placementTestSubmission.orgId, orgId),
				eq(placementTestSubmission.leadId, leadId),
			),
		)
		.orderBy(
			desc(placementTestSubmission.submittedAt),
			desc(placementTestSubmission.id),
		)
		.limit(1);
	return sub ?? null;
}

/**
 * Tìm bài làm kiểm tra đầu vào mới nhất của học viên trong org: khớp
 * `studentId = studentRow.id` hoặc bài làm công khai trước đó qua lead có cùng
 * email chuẩn hoá trong cùng org.
 */
export async function findLatestSubmissionForStudent(
	db: Db,
	orgId: string,
	studentRow: typeof student.$inferSelect,
): Promise<typeof placementTestSubmission.$inferSelect | null> {
	// Ưu tiên bài nộp đã gắn trực tiếp `studentId` trước — tránh bài lead công
	// khai mới hơn (email chưa xác thực) che khuất bài làm thật của học viên.
	const [directSub] = await db
		.select()
		.from(placementTestSubmission)
		.where(
			and(
				eq(placementTestSubmission.orgId, orgId),
				eq(placementTestSubmission.studentId, studentRow.id),
			),
		)
		.orderBy(
			desc(placementTestSubmission.submittedAt),
			desc(placementTestSubmission.id),
		)
		.limit(1);
	if (directSub) {
		return directSub;
	}

	const normalizedEmail = studentRow.email.trim().toLowerCase();
	if (normalizedEmail.length === 0) {
		return null;
	}

	const [leadSub] = await db
		.select()
		.from(placementTestSubmission)
		.where(
			and(
				eq(placementTestSubmission.orgId, orgId),
				isNull(placementTestSubmission.studentId),
				inArray(
					placementTestSubmission.leadId,
					db
						.select({ id: lead.id })
						.from(lead)
						.where(
							and(
								eq(lead.orgId, orgId),
								sql`lower(trim(${lead.email})) = ${normalizedEmail}`,
							),
						),
				),
			),
		)
		.orderBy(
			desc(placementTestSubmission.submittedAt),
			desc(placementTestSubmission.id),
		)
		.limit(1);
	return leadSub ?? null;
}

export function buildPlacementSubmissionDetail(
	sub: typeof placementTestSubmission.$inferSelect,
	subject: PlacementSubmissionSubject,
	resultOrigin: string | undefined,
): PlacementSubmissionDetail {
	const snapshot = JSON.parse(sub.snapshotJson) as PlacementSnapshot;
	const answers = JSON.parse(sub.answersJson) as {
		listening: Record<string, string | number | null>;
		vocabGrammar: Record<string, number | null>;
		reading: Record<string, number | null>;
	};
	const objective = JSON.parse(
		sub.objectiveBreakdownJson,
	) as PlacementObjectiveResult;
	const writingRubric = sub.writingRubricJson
		? (JSON.parse(sub.writingRubricJson) as PlacementWritingRubric)
		: null;
	const speakingRubric = sub.speakingRubricJson
		? (JSON.parse(sub.speakingRubricJson) as PlacementSpeakingRubric)
		: null;

	const activeBand =
		sub.finalBandLevel && sub.finalCourse
			? {
					min: objective.provisionalBand.min,
					max: objective.provisionalBand.max,
					cefr: sub.finalBandLevel,
					course: sub.finalCourse as typeof objective.provisionalBand.course,
					courseLabel: sub.finalDisplayCourse ?? sub.finalCourse,
					displayCourse: sub.finalDisplayCourse ?? sub.finalCourse,
					advice:
						snapshot.bands.find((b) => b.cefr === sub.finalBandLevel)?.advice ??
						objective.provisionalBand.advice,
				}
			: objective.provisionalBand;

	const activePct = sub.finalScorePct ?? objective.averagePct;
	const zaloText = buildPlacementZaloText({
		studentName: subject.row.name,
		phone: subject.row.phone,
		objective,
		writingScore: sub.writingScore,
		speakingScore: sub.speakingScore,
		speakingStatus: sub.speakingStatus,
		band: activeBand,
		averagePct: activePct,
		note: sub.finalNote,
		teacherFeedback: sub.teacherFeedback,
	});

	const speakingMediaUrl = sub.speakingMediaKey
		? subject.kind === "lead"
			? `/api/leads/${subject.row.id}/placement-submission/media`
			: `/api/students/${subject.row.id}/placement-submission/media`
		: null;

	return {
		id: sub.id,
		leadId: sub.leadId ?? (subject.kind === "lead" ? subject.row.id : null),
		studentId: sub.studentId ?? null,
		studentName: subject.row.name,
		studentPhone: subject.row.phone,
		testVersion: sub.testVersion,
		status: sub.status,
		submittedAt: sub.submittedAt.toISOString(),
		snapshot,
		answers,
		objective,
		writingText: sub.writingText,
		writingWordCount: sub.writingWordCount,
		speakingStatus: sub.speakingStatus,
		speakingMediaUrl,
		speakingMediaMime: sub.speakingMediaMime,
		speakingMediaSize: sub.speakingMediaSize,
		speakingDurationSec: sub.speakingDurationSec,
		writingRubric,
		writingScore: sub.writingScore,
		speakingRubric,
		speakingScore: sub.speakingScore,
		teacherFeedback: sub.teacherFeedback,
		finalBandLevel: sub.finalBandLevel,
		finalCourse: sub.finalCourse,
		finalDisplayCourse: sub.finalDisplayCourse,
		finalScorePct: sub.finalScorePct,
		finalNote: sub.finalNote,
		gradedAt: sub.gradedAt ? sub.gradedAt.toISOString() : null,
		zaloText,
		aiStatus: sub.aiStatus,
		aiErrorCode: sub.aiErrorCode,
		aiDraftedAt: sub.aiDraftedAt ? sub.aiDraftedAt.toISOString() : null,
		aiWriting: parseAiWritingDraft(sub.aiWritingJson, sub.writingText),
		aiSpeaking: parseAiSpeakingDraft(
			sub.aiSpeakingJson,
			sub.speakingTranscript,
		),
		speakingTranscript: sub.speakingTranscript,
		writingErrors: parseStoredErrors(sub.writingErrorsJson, sub.writingText),
		speakingErrors: parseStoredErrors(
			sub.speakingErrorsJson,
			sub.speakingTranscript,
		),
		resultUrl: sub.resultToken
			? buildPlacementResultUrl(resultOrigin, sub.resultToken)
			: null,
		resultEmailStatus:
			sub.resultEmailStatus && RESULT_EMAIL_STATUSES.has(sub.resultEmailStatus)
				? (sub.resultEmailStatus as PlacementResultEmailStatus)
				: null,
	};
}

export async function getPlacementSubmissionDetailResponse(
	c: KernelContext,
	deps: PlacementSubmissionServiceDeps,
	subject: PlacementSubmissionSubject,
	sub: typeof placementTestSubmission.$inferSelect,
): Promise<Response> {
	const resultOrigin = deps.leadOrigins?.[0];
	// Job chấm nền xong thì lưu nháp ngay lúc giáo viên mở bài; lượt treo
	// quá hạn của chính bài này được đánh TIMEOUT tại đây.
	const finalized = await finalizePlacementAiGrading(deps, sub);
	c.header("Cache-Control", "no-store");
	return c.json(
		buildPlacementSubmissionDetail(finalized, subject, resultOrigin),
	);
}

export async function retryPlacementSubmissionAiResponse(
	c: KernelContext,
	deps: PlacementSubmissionServiceDeps,
	subject: PlacementSubmissionSubject,
	sub: typeof placementTestSubmission.$inferSelect,
): Promise<Response> {
	const resultOrigin = deps.leadOrigins?.[0];
	const retryConflict = () =>
		c.json(
			{
				error: "PLACEMENT_AI_RETRY_CONFLICT",
				code: "PLACEMENT_AI_RETRY_CONFLICT",
			},
			409,
		);
	if (sub.status === "graded") return retryConflict();
	if (!deps.getPlacementAiGrader?.()) {
		return c.json(
			{
				error: PLACEMENT_AI_ERROR_CODES.DISABLED,
				code: PLACEMENT_AI_ERROR_CODES.DISABLED,
			},
			503,
		);
	}
	if (!hasPlacementAiWork(sub)) return retryConflict();

	const db = deps.getDb();
	// Lượt cũ có thể đã xong ở OpenAI nhưng chưa được lưu → chốt trước.
	await finalizePlacementAiGrading(deps, sub);
	const startedAt = await claimPlacementAiGrading(
		db,
		sub.id,
		["none", "failed", "drafted"],
		new Date(),
		{ notGraded: true },
	);
	if (!startedAt) {
		return retryConflict();
	}
	schedulePlacementAiTask(
		deps,
		runClaimedPlacementAiGrading(deps, sub.id, startedAt),
	);

	const [fresh] = await db
		.select()
		.from(placementTestSubmission)
		.where(eq(placementTestSubmission.id, sub.id))
		.limit(1);
	c.header("Cache-Control", "no-store");
	return c.json(
		buildPlacementSubmissionDetail(fresh ?? sub, subject, resultOrigin),
	);
}

export async function getPlacementSubmissionMediaResponse(
	c: KernelContext,
	deps: PlacementSubmissionServiceDeps,
	sub: typeof placementTestSubmission.$inferSelect,
): Promise<Response> {
	if (!sub.speakingMediaKey) {
		return c.json({ error: "not found" }, 404);
	}

	const store = deps.getMediaStore?.();
	if (!store) {
		return c.json({ error: "media storage unavailable" }, 503);
	}

	const total = sub.speakingMediaSize ?? 0;
	const rangeHeader = c.req.header("Range");
	let requestedRange: { start: number; end: number } | null = null;
	if (
		total > 0 &&
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
		sub.speakingMediaKey,
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

	if (requestedRange && object.range) {
		const normalized = normalizeMediaType(
			sub.speakingMediaMime ?? object.contentType ?? "",
		);
		const safeType =
			normalized.startsWith("audio/") || normalized.startsWith("video/")
				? normalized
				: "application/octet-stream";
		return new Response(object.body, {
			status: 206,
			headers: {
				"Content-Type": safeType,
				"Content-Range": `bytes ${requestedRange.start}-${requestedRange.end}/${total}`,
				"Content-Length": String(object.range.length),
				"Accept-Ranges": "bytes",
				"X-Content-Type-Options": "nosniff",
				"Cross-Origin-Opener-Policy": "same-origin",
				"Content-Security-Policy": "default-src 'none'; sandbox",
				"Cache-Control": "private, no-store",
			},
		});
	}

	const res = mediaObjectResponse(object, {
		mediaType: sub.speakingMediaMime,
		mediaName: `speaking-${sub.id}`,
	});
	res.headers.set("Accept-Ranges", "bytes");
	return res;
}

export async function gradePlacementSubmissionResponse(
	c: KernelContext,
	deps: PlacementSubmissionServiceDeps,
	ctx: KernelCtx,
	subject: PlacementSubmissionSubject,
	sub: typeof placementTestSubmission.$inferSelect,
	parsedBody: ReturnType<typeof placementTeacherGradeSchema.parse>,
): Promise<Response> {
	const db = deps.getDb();
	const resultOrigin = deps.leadOrigins?.[0];

	const snapshot = JSON.parse(sub.snapshotJson) as PlacementSnapshot;
	const objective = JSON.parse(
		sub.objectiveBreakdownJson,
	) as PlacementObjectiveResult;

	const final = computePlacementFinal({
		objective,
		bands: snapshot.bands,
		writingRubric: parsedBody.writingRubric,
		speakingRubric: parsedBody.speakingRubric,
	});

	// #730: lỗi giáo viên chốt — server luôn định vị lại offset.
	const writingErrors = locatePlacementErrors(
		sub.writingText,
		parsedBody.writingErrors,
	);
	const speakingErrors = locatePlacementErrors(
		sub.speakingTranscript,
		parsedBody.speakingErrors,
	);

	const now = new Date();
	const [updatedSub] = await db
		.update(placementTestSubmission)
		.set({
			status: "graded",
			writingRubricJson: JSON.stringify(parsedBody.writingRubric),
			writingScore: final.writingScore,
			speakingRubricJson: parsedBody.speakingRubric
				? JSON.stringify(parsedBody.speakingRubric)
				: null,
			speakingScore: final.speakingScore,
			teacherFeedback: parsedBody.teacherFeedback,
			finalBandLevel: final.band.cefr,
			finalCourse: final.band.course,
			finalDisplayCourse: final.band.displayCourse || final.band.courseLabel,
			finalScorePct: final.averagePct,
			finalNote: final.note,
			writingErrorsJson: JSON.stringify(writingErrors),
			speakingErrorsJson: JSON.stringify(speakingErrors),
			// Token sinh một lần ở lần chốt đầu, giữ nguyên khi chốt lại —
			// coalesce trong UPDATE để hai lượt chốt đồng thời dùng chung token.
			resultToken: sql`coalesce(${placementTestSubmission.resultToken}, ${randomResultToken()})`,
			gradedBy: ctx.userId,
			gradedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(placementTestSubmission.id, sub.id),
				eq(placementTestSubmission.orgId, ctx.orgId),
			),
		)
		.returning();

	if (!updatedSub) {
		return c.json({ error: "not found" }, 404);
	}

	const targetLeadId =
		updatedSub.leadId ?? (subject.kind === "lead" ? subject.row.id : null);
	let leadEmail = subject.kind === "lead" ? subject.row.email : "";
	if (targetLeadId) {
		const [updatedLead] = await db
			.update(lead)
			.set({
				placement: final.finalSummary,
				course: final.band.course,
				updatedAt: now,
			})
			.where(and(eq(lead.id, targetLeadId), eq(lead.orgId, ctx.orgId)))
			.returning({ email: lead.email });
		if (updatedLead) {
			leadEmail = updatedLead.email;
		}
	}

	const targetStudentId =
		updatedSub.studentId ??
		(subject.kind === "student" ? subject.row.id : null);
	let studentEmail = subject.kind === "student" ? subject.row.email : "";
	if (targetStudentId) {
		const [updatedStudent] = await db
			.update(student)
			.set({
				entryScore: final.band.cefr,
			})
			.where(and(eq(student.id, targetStudentId), eq(student.orgId, ctx.orgId)))
			.returning({ email: student.email });
		if (updatedStudent) {
			studentEmail = updatedStudent.email;
		}
	}

	const resultToken = updatedSub.resultToken;
	if (!resultToken) {
		return c.json({ error: "not found" }, 404);
	}

	// Lần chốt đầu = lượt thắng CAS đặt `result_published_at`; chỉ lần đó
	// gửi email. Chốt lại giữ nguyên trạng thái email cũ.
	const [firstPublish] = await db
		.update(placementTestSubmission)
		.set({ resultPublishedAt: now })
		.where(
			and(
				eq(placementTestSubmission.id, updatedSub.id),
				eq(placementTestSubmission.orgId, ctx.orgId),
				isNull(placementTestSubmission.resultPublishedAt),
			),
		)
		.returning({ id: placementTestSubmission.id });

	let resultEmailStatus = updatedSub.resultEmailStatus;
	if (firstPublish) {
		// Gửi link kết quả đồng bộ (timeout ngắn trong mailer) để response
		// phản ánh đúng trạng thái; lỗi gửi không làm hỏng lượt chốt.
		const recipient = leadEmail.trim() || studentEmail.trim();
		const resultUrl = await resolvePlacementResultLink(db, {
			orgId: ctx.orgId,
			submissionId: updatedSub.id,
			recipientEmail: recipient,
			studentOrigin: deps.studentOrigin,
			publicUrl: buildPlacementResultUrl(resultOrigin, resultToken),
		});
		// Lượt chốt đồng thời của giáo viên khác có thể ghi sau lượt này —
		// tóm tắt lấy từ cột đã lưu; đọc lỗi → dùng giá trị vừa tính.
		let stored: typeof placementTestSubmission.$inferSelect | undefined;
		try {
			[stored] = await db
				.select()
				.from(placementTestSubmission)
				.where(
					and(
						eq(placementTestSubmission.id, updatedSub.id),
						eq(placementTestSubmission.orgId, ctx.orgId),
					),
				)
				.limit(1);
		} catch (error) {
			console.error(
				"[placement-ai] result summary reload failed",
				updatedSub.id,
				error instanceof Error ? error.name : "unknown",
			);
		}
		const summary: PlacementResultEmailSummary = {
			cefr: final.band.cefr,
			displayCourse: final.band.displayCourse || final.band.courseLabel,
			scorePct: final.averagePct,
			listening: objective.listening,
			vocabGrammar: objective.vocabGrammar,
			reading: objective.reading,
			writingScore: final.writingScore,
			speakingScore: final.speakingScore,
		};
		if (stored) {
			summary.cefr = stored.finalBandLevel ?? summary.cefr;
			summary.displayCourse =
				stored.finalDisplayCourse ??
				stored.finalCourse ??
				summary.displayCourse;
			summary.scorePct = stored.finalScorePct ?? summary.scorePct;
			summary.writingScore = stored.writingScore;
			summary.speakingScore = stored.speakingScore;
		}
		resultEmailStatus = await sendPlacementResultEmail({
			getMailer: () => deps.mailer,
			to: recipient,
			studentName: subject.row.name,
			summary,
			resultUrl,
			submissionId: updatedSub.id,
		});
		await db
			.update(placementTestSubmission)
			.set({ resultEmailStatus })
			.where(
				and(
					eq(placementTestSubmission.id, updatedSub.id),
					eq(placementTestSubmission.orgId, ctx.orgId),
				),
			);
	}

	c.header("Cache-Control", "no-store");
	return c.json(
		buildPlacementSubmissionDetail(
			{ ...updatedSub, resultEmailStatus },
			subject,
			resultOrigin,
		),
	);
}
