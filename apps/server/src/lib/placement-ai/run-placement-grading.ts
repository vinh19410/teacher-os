import { normalizeMediaType } from "@teacher-os/api/lib/quiz-media";
import {
	PLACEMENT_AI_ERROR_CODES,
	type PlacementAiStatus,
	type PlacementSnapshot,
} from "@teacher-os/api/placement-test-contracts";
import { placementTestSubmission } from "@teacher-os/db/schema/placement-test";
import { and, eq, inArray, isNull, lt, ne } from "drizzle-orm";
import type { Db } from "../../app";
import type { MediaStore } from "../media-store";
import {
	type PlacementAiErrorCode,
	type PlacementAiGrader,
	PlacementAiGradingError,
	type PlacementAiPollResult,
	type PlacementAiSkillKind,
} from "./grader";

/**
 * Lượt `processing` quá ngưỡng này → TIMEOUT: chưa tạo được job nào (isolate
 * chết giữa `waitUntil`) hoặc job OpenAI vẫn chưa xong khi poll.
 */
export const PLACEMENT_AI_STALE_AFTER_MS = 15 * 60 * 1000;
/** Giới hạn file audio gửi transcribe (giới hạn upload của OpenAI). */
export const PLACEMENT_AI_AUDIO_MAX_BYTES = 25 * 1024 * 1024;

export interface PlacementAiPipelineDeps {
	getDb(): Db;
	getMediaStore?(): MediaStore | undefined;
	getPlacementAiGrader?(): PlacementAiGrader | undefined;
	runInBackground?(promise: Promise<unknown>): void;
}

export type SubmissionRow = typeof placementTestSubmission.$inferSelect;

function hasWriting(sub: SubmissionRow): boolean {
	return sub.writingText.trim().length > 0;
}

function hasSpeaking(sub: SubmissionRow): boolean {
	return sub.speakingStatus === "uploaded" && Boolean(sub.speakingMediaKey);
}

/** Bài có gì để AI chấm không (Writing có chữ hoặc Speaking đã upload). */
export function hasPlacementAiWork(sub: SubmissionRow): boolean {
	return hasWriting(sub) || hasSpeaking(sub);
}

/**
 * CAS sang `processing` khi `ai_status` thuộc `from` (và bài chưa chốt nếu
 * `notGraded`) — trả mốc `ai_started_at`
 * của lượt thắng (dùng làm khoá cho lần ghi kết quả), null nếu thua.
 */
export async function claimPlacementAiGrading(
	db: Db,
	submissionId: string,
	from: PlacementAiStatus[],
	now = new Date(),
	options: { notGraded?: boolean } = {},
): Promise<Date | null> {
	const won = await db
		.update(placementTestSubmission)
		.set({
			aiStatus: "processing",
			aiStartedAt: now,
			aiErrorCode: null,
			aiWritingResponseId: null,
			aiSpeakingResponseId: null,
		})
		.where(
			and(
				eq(placementTestSubmission.id, submissionId),
				inArray(placementTestSubmission.aiStatus, from),
				options.notGraded
					? ne(placementTestSubmission.status, "graded")
					: undefined,
			),
		)
		.returning({ id: placementTestSubmission.id });
	return won.length > 0 ? now : null;
}

/**
 * Dọn lười lượt treo (isolate chết giữa `waitUntil` trước khi lưu id job):
 * `processing` quá `PLACEMENT_AI_STALE_AFTER_MS` và KHÔNG có id job nào →
 * `failed` TIMEOUT. Lượt đã có id job do `finalizePlacementAiGrading` xử lý
 * (kết quả có thể đã sẵn sàng dù giáo viên mở bài muộn). Gọi khi giáo viên mở bài.
 */
export async function sweepStalePlacementAiGrading(
	db: Db,
	orgId: string,
	now = new Date(),
): Promise<void> {
	await db
		.update(placementTestSubmission)
		.set({
			aiStatus: "failed",
			aiErrorCode: PLACEMENT_AI_ERROR_CODES.TIMEOUT,
		})
		.where(
			and(
				eq(placementTestSubmission.orgId, orgId),
				eq(placementTestSubmission.aiStatus, "processing"),
				lt(
					placementTestSubmission.aiStartedAt,
					new Date(now.getTime() - PLACEMENT_AI_STALE_AFTER_MS),
				),
				isNull(placementTestSubmission.aiWritingResponseId),
				isNull(placementTestSubmission.aiSpeakingResponseId),
			),
		);
}

function errorCodeOf(error: unknown): PlacementAiErrorCode {
	if (error instanceof PlacementAiGradingError) return error.code;
	if (
		error instanceof Error &&
		(error.name === "TimeoutError" || error.name === "AbortError")
	) {
		return PLACEMENT_AI_ERROR_CODES.TIMEOUT;
	}
	return PLACEMENT_AI_ERROR_CODES.FAILED;
}

function audioFilename(mime: string): string {
	const ext = mime.includes("webm")
		? "webm"
		: mime === "video/mp4"
			? "mp4"
			: mime.includes("mp4") || mime.includes("m4a")
				? "m4a"
				: mime.includes("mpeg") || mime.includes("mp3")
					? "mp3"
					: mime.includes("ogg")
						? "ogg"
						: mime.includes("wav")
							? "wav"
							: "webm";
	return `speaking.${ext}`;
}

function isTranscribableMime(mime: string): boolean {
	return (
		mime.startsWith("audio/") || mime === "video/webm" || mime === "video/mp4"
	);
}

/** Đọc audio Speaking từ media store; null khi không chuyển giọng nói được. */
async function loadSpeakingAudio(
	store: MediaStore | undefined,
	sub: SubmissionRow,
): Promise<{ bytes: ArrayBuffer; mime: string; filename: string } | null> {
	if (!store || !sub.speakingMediaKey) return null;
	if ((sub.speakingMediaSize ?? 0) > PLACEMENT_AI_AUDIO_MAX_BYTES) return null;
	const object = await store.get(sub.speakingMediaKey);
	if (!object) return null;
	const mime = normalizeMediaType(
		sub.speakingMediaMime ?? object.contentType ?? "",
	);
	if (
		!isTranscribableMime(mime) ||
		object.size > PLACEMENT_AI_AUDIO_MAX_BYTES
	) {
		await object.body.cancel().catch(() => {});
		return null;
	}
	const bytes = await new Response(object.body).arrayBuffer();
	return { bytes, mime, filename: audioFilename(mime) };
}

function promptsOf(sub: SubmissionRow): {
	writingPrompt: string;
	speakingPrompts: string[];
} {
	try {
		const snapshot = JSON.parse(sub.snapshotJson) as PlacementSnapshot;
		const parts = Array.isArray(snapshot.parts) ? snapshot.parts : [];
		const writing = parts.find((p) => p.id === "writing") as
			| PlacementSnapshot["parts"][3]
			| undefined;
		const speaking = parts.find((p) => p.id === "speaking") as
			| PlacementSnapshot["parts"][4]
			| undefined;
		return {
			writingPrompt: [writing?.promptTitle, writing?.promptBody]
				.filter((s): s is string => Boolean(s?.trim()))
				.join("\n"),
			speakingPrompts: (speaking?.tasks ?? [])
				.map((t) => t.prompt)
				.filter((p) => p.trim().length > 0),
		};
	} catch {
		return { writingPrompt: "", speakingPrompts: [] };
	}
}

/**
 * Pha khởi tạo cho lượt ĐÃ claim (`processing`, `ai_started_at = startedAt`),
 * chạy trong `waitUntil` nên mỗi bước ngắn: tạo job Writing → transcribe →
 * lưu transcript (bài chưa chốt) → tạo job Speaking → lưu id job. Không job
 * nào tạo được → `failed` ngay; còn lại giữ `processing` (kèm mã lỗi phần hỏng,
 * nếu có) để `finalizePlacementAiGrading` poll kết quả. Mọi lần ghi CAS trên
 * (`processing`, `startedAt`) để không đè lượt mới hơn.
 */
export async function runClaimedPlacementAiGrading(
	deps: PlacementAiPipelineDeps,
	submissionId: string,
	startedAt: Date,
): Promise<void> {
	const db = deps.getDb();
	const casWhere = and(
		eq(placementTestSubmission.id, submissionId),
		eq(placementTestSubmission.aiStatus, "processing"),
		eq(placementTestSubmission.aiStartedAt, startedAt),
	);

	let firstError: PlacementAiErrorCode | null = null;
	let writingId: string | null = null;
	let speakingId: string | null = null;

	try {
		const [sub] = await db
			.select()
			.from(placementTestSubmission)
			.where(eq(placementTestSubmission.id, submissionId))
			.limit(1);
		if (!sub) return;
		const grader = deps.getPlacementAiGrader?.();
		if (!grader) {
			firstError = PLACEMENT_AI_ERROR_CODES.DISABLED;
		} else {
			const { writingPrompt, speakingPrompts } = promptsOf(sub);
			if (hasWriting(sub)) {
				try {
					writingId = await grader.startWriting({
						prompt: writingPrompt,
						text: sub.writingText,
					});
				} catch (error) {
					firstError ??= errorCodeOf(error);
				}
			}
			if (hasSpeaking(sub)) {
				try {
					const audio = await loadSpeakingAudio(deps.getMediaStore?.(), sub);
					const text = audio ? (await grader.transcribe(audio)).trim() : "";
					if (!text) {
						firstError ??= PLACEMENT_AI_ERROR_CODES.NO_TRANSCRIPT;
					} else {
						// Kết quả đã chốt là thứ học viên thấy — không đổi transcript.
						await db
							.update(placementTestSubmission)
							.set({ speakingTranscript: text })
							.where(
								and(casWhere, ne(placementTestSubmission.status, "graded")),
							);
						speakingId = await grader.startSpeaking({
							prompts: speakingPrompts,
							transcript: text,
						});
					}
				} catch (error) {
					firstError ??= errorCodeOf(error);
				}
			}
		}
	} catch (error) {
		firstError ??= errorCodeOf(error);
	}

	const hasJob = writingId !== null || speakingId !== null;
	await db
		.update(placementTestSubmission)
		.set({
			aiWritingResponseId: writingId,
			aiSpeakingResponseId: speakingId,
			aiErrorCode: hasJob
				? firstError
				: (firstError ?? PLACEMENT_AI_ERROR_CODES.FAILED),
			...(hasJob ? {} : { aiStatus: "failed" as const }),
		})
		.where(casWhere);
	if (firstError) {
		// Không log nội dung bài — chỉ id + mã lỗi.
		console.warn("[placement-ai] grading failed", submissionId, firstError);
	}
}

async function pollJob(
	grader: PlacementAiGrader | undefined,
	id: string,
	kind: PlacementAiSkillKind,
	sourceText: string,
): Promise<PlacementAiPollResult> {
	if (!grader) return { state: "pending" };
	try {
		return await grader.poll(id, kind, sourceText);
	} catch {
		return { state: "pending", transient: true };
	}
}

/**
 * Finalize lười (gọi khi giáo viên mở bài / bấm chấm lại): lượt `processing`
 * có id job → poll các job chưa có kết quả, lưu nháp từng phần. Mọi job xong
 * → `drafted` (hoặc `failed` nếu có phần hỏng, vẫn giữ phần thành công). Job
 * còn chạy quá `PLACEMENT_AI_STALE_AFTER_MS` → TIMEOUT; poll lỗi mạng tạm
 * thời → giữ nguyên. Ghi CAS trên (`processing`, `ai_started_at`, id job đã
 * đọc) để hai lượt mở bài song song không ghi chồng. Trả row mới nhất.
 */
export async function finalizePlacementAiGrading(
	deps: PlacementAiPipelineDeps,
	sub: SubmissionRow,
	now = new Date(),
): Promise<SubmissionRow> {
	const writingId = sub.aiWritingResponseId;
	const speakingId = sub.aiSpeakingResponseId;
	if (
		sub.aiStatus !== "processing" ||
		!sub.aiStartedAt ||
		(writingId === null && speakingId === null)
	) {
		return sub;
	}
	const grader = deps.getPlacementAiGrader?.();
	const stale =
		now.getTime() - sub.aiStartedAt.getTime() > PLACEMENT_AI_STALE_AFTER_MS;

	let errorCode = sub.aiErrorCode as PlacementAiErrorCode | null;
	let nextWriting = writingId;
	let nextSpeaking = speakingId;
	const drafts: { aiWritingJson?: string; aiSpeakingJson?: string } = {};

	const settle = (
		result: PlacementAiPollResult,
		kind: PlacementAiSkillKind,
	): boolean => {
		if (result.state === "draft") {
			drafts[kind === "writing" ? "aiWritingJson" : "aiSpeakingJson"] =
				JSON.stringify(result.draft);
			return true;
		}
		if (result.state === "error") {
			errorCode ??= result.code;
			return true;
		}
		if (stale && !result.transient) {
			errorCode ??= PLACEMENT_AI_ERROR_CODES.TIMEOUT;
			return true;
		}
		return false;
	};

	const [writingResult, speakingResult] = await Promise.all([
		writingId === null
			? null
			: pollJob(grader, writingId, "writing", sub.writingText),
		speakingId === null
			? null
			: pollJob(grader, speakingId, "speaking", sub.speakingTranscript),
	]);
	if (writingResult && settle(writingResult, "writing")) nextWriting = null;
	if (speakingResult && settle(speakingResult, "speaking")) {
		nextSpeaking = null;
	}
	if (nextWriting === writingId && nextSpeaking === speakingId) return sub;

	const done = nextWriting === null && nextSpeaking === null;
	const hasDraft = Object.keys(drafts).length > 0;
	const db = deps.getDb();
	const [updated] = await db
		.update(placementTestSubmission)
		.set({
			...drafts,
			aiWritingResponseId: nextWriting,
			aiSpeakingResponseId: nextSpeaking,
			aiErrorCode: errorCode,
			...(hasDraft ? { aiDraftedAt: now } : {}),
			...(done
				? { aiStatus: errorCode ? ("failed" as const) : ("drafted" as const) }
				: {}),
		})
		.where(
			and(
				eq(placementTestSubmission.id, sub.id),
				eq(placementTestSubmission.aiStatus, "processing"),
				eq(placementTestSubmission.aiStartedAt, sub.aiStartedAt),
				writingId === null
					? isNull(placementTestSubmission.aiWritingResponseId)
					: eq(placementTestSubmission.aiWritingResponseId, writingId),
				speakingId === null
					? isNull(placementTestSubmission.aiSpeakingResponseId)
					: eq(placementTestSubmission.aiSpeakingResponseId, speakingId),
			),
		)
		.returning();
	if (updated) {
		if (done && errorCode) {
			console.warn("[placement-ai] grading failed", sub.id, errorCode);
		}
		return updated;
	}
	// Thua CAS (lượt khác vừa ghi) → đọc lại bản mới nhất.
	const [fresh] = await db
		.select()
		.from(placementTestSubmission)
		.where(eq(placementTestSubmission.id, sub.id))
		.limit(1);
	return fresh ?? sub;
}

/**
 * Điểm vào sau nộp bài / upload Speaking: không có gì để chấm → giữ `none`;
 * grader vắng → `failed` DISABLED; còn lại CAS `none|failed` → `processing`
 * rồi chấm. Thua CAS (đang chạy/đã nháp) → bỏ qua, không chạy trùng.
 */
export async function runPlacementAiGrading(
	deps: PlacementAiPipelineDeps,
	submissionId: string,
): Promise<void> {
	const db = deps.getDb();
	const [sub] = await db
		.select()
		.from(placementTestSubmission)
		.where(eq(placementTestSubmission.id, submissionId))
		.limit(1);
	if (!sub || !hasPlacementAiWork(sub)) return;
	if (!deps.getPlacementAiGrader?.()) {
		await db
			.update(placementTestSubmission)
			.set({
				aiStatus: "failed",
				aiErrorCode: PLACEMENT_AI_ERROR_CODES.DISABLED,
			})
			.where(
				and(
					eq(placementTestSubmission.id, submissionId),
					inArray(placementTestSubmission.aiStatus, ["none", "failed"]),
				),
			);
		return;
	}
	const startedAt = await claimPlacementAiGrading(db, submissionId, [
		"none",
		"failed",
	]);
	if (!startedAt) return;
	await runClaimedPlacementAiGrading(deps, submissionId, startedAt);
}

/** Chạy một việc chấm nền qua `waitUntil` (nuốt lỗi — đã log trong pipeline). */
export function schedulePlacementAiTask(
	deps: Pick<PlacementAiPipelineDeps, "runInBackground">,
	task: Promise<void>,
): void {
	const guarded = task.catch((error: unknown) => {
		console.error(
			"[placement-ai] background task crashed",
			error instanceof Error ? error.name : "unknown",
		);
	});
	if (deps.runInBackground) deps.runInBackground(guarded);
	else void guarded;
}
