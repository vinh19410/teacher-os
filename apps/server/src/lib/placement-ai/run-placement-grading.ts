import { normalizeMediaType } from "@teacher-os/api/lib/quiz-media";
import {
	PLACEMENT_AI_ERROR_CODES,
	type PlacementAiSkillDraft,
	type PlacementAiStatus,
	type PlacementSnapshot,
	type PlacementSpeakingRubric,
	type PlacementWritingRubric,
} from "@teacher-os/api/placement-test-contracts";
import { placementTestSubmission } from "@teacher-os/db/schema/placement-test";
import { and, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "../../app";
import type { MediaStore } from "../media-store";
import {
	type PlacementAiErrorCode,
	type PlacementAiGrader,
	PlacementAiGradingError,
} from "./grader";

/** Nháp `processing` quá ngưỡng này coi như isolate đã chết → TIMEOUT. */
export const PLACEMENT_AI_STALE_AFTER_MS = 10 * 60 * 1000;
/** Giới hạn file audio gửi transcribe (giới hạn upload của OpenAI). */
export const PLACEMENT_AI_AUDIO_MAX_BYTES = 25 * 1024 * 1024;

export interface PlacementAiPipelineDeps {
	getDb(): Db;
	getMediaStore?(): MediaStore | undefined;
	getPlacementAiGrader?(): PlacementAiGrader | undefined;
	runInBackground?(promise: Promise<unknown>): void;
}

type SubmissionRow = typeof placementTestSubmission.$inferSelect;

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
 * CAS sang `processing` khi `ai_status` thuộc `from` — trả mốc `ai_started_at`
 * của lượt thắng (dùng làm khoá cho lần ghi kết quả), null nếu thua.
 */
export async function claimPlacementAiGrading(
	db: Db,
	submissionId: string,
	from: PlacementAiStatus[],
	now = new Date(),
): Promise<Date | null> {
	const won = await db
		.update(placementTestSubmission)
		.set({ aiStatus: "processing", aiStartedAt: now, aiErrorCode: null })
		.where(
			and(
				eq(placementTestSubmission.id, submissionId),
				inArray(placementTestSubmission.aiStatus, from),
			),
		)
		.returning({ id: placementTestSubmission.id });
	return won.length > 0 ? now : null;
}

/**
 * Dọn lười nháp treo (isolate chết giữa `waitUntil`): `processing` quá
 * `PLACEMENT_AI_STALE_AFTER_MS` → `failed` TIMEOUT. Gọi khi giáo viên mở bài.
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
 * Chạy chấm cho lượt ĐÃ claim (`processing`, `ai_started_at = startedAt`).
 * Lưu mọi phần chấm được; lỗi đầu tiên (nếu có) quyết định `failed` + mã.
 * Ghi kết quả CAS trên (`processing`, `startedAt`) để không đè lượt mới hơn.
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
	let writingDraft: PlacementAiSkillDraft<PlacementWritingRubric> | null = null;
	let speakingDraft: PlacementAiSkillDraft<PlacementSpeakingRubric> | null =
		null;
	let transcript: string | null = null;

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
					writingDraft = await grader.gradeWriting({
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
					const text = audio ? await grader.transcribe(audio) : "";
					if (!text.trim()) {
						firstError ??= PLACEMENT_AI_ERROR_CODES.NO_TRANSCRIPT;
					} else {
						transcript = text.trim();
						speakingDraft = await grader.gradeSpeaking({
							prompts: speakingPrompts,
							transcript,
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

	const now = new Date();
	await db
		.update(placementTestSubmission)
		.set({
			aiStatus: firstError ? "failed" : "drafted",
			aiErrorCode: firstError,
			...(writingDraft ? { aiWritingJson: JSON.stringify(writingDraft) } : {}),
			...(speakingDraft
				? { aiSpeakingJson: JSON.stringify(speakingDraft) }
				: {}),
			...(transcript !== null ? { speakingTranscript: transcript } : {}),
			...(writingDraft || speakingDraft ? { aiDraftedAt: now } : {}),
		})
		.where(casWhere);
	if (firstError) {
		// Không log nội dung bài — chỉ id + mã lỗi.
		console.warn("[placement-ai] grading failed", submissionId, firstError);
	}
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
