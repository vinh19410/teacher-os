import {
	AI_GRADING_COST,
	AI_GRADING_ERROR_CODES,
	type AiGradingErrorCode,
} from "@teacher-os/api/contracts";
import { essayToPlain } from "@teacher-os/api/lib/essay-plain";
import {
	criteriaForSkill,
	type GradableSkill,
	isGradableSkill,
} from "@teacher-os/api/lib/ielts-band";
import {
	aiGradingDraft,
	assignmentPrompt,
	assignmentTest,
	assignmentTestPart,
	classAssignment,
	quizAttempt,
} from "@teacher-os/db/schema/index";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../../app";
import {
	ensureWallet,
	InsufficientCreditsError,
	releaseCredits,
	reserveCredits,
	settleCredits,
} from "../credits/wallet";
import {
	type AiGrader,
	AiGradingFailedError,
	type AiGradingResult,
	roundBandStep,
} from "./grader";

/**
 * Hạn gọi AI của một lượt chấm nháp (TOS-30): tổng thời gian pipeline nằm
 * trong `waitUntil` (reserve → grade → settle/release + ghi draft) phải
 * dưới trần hậu-response của Workers (~30s) — timeout AI 20s chừa 10s biên
 * cho DB + sweep (kongming red-team #478 điều kiện 1).
 */
export const AI_GRADING_TIMEOUT_MS = 20_000;

/**
 * TOS-33 D2: ngân sách TỔNG của toàn vòng chấm (tối đa 3 lượt gọi grader
 * + backoff) — đo từ TRƯỚC reserve, nằm trong trần hậu-response ~30s của
 * Workers. Bất biến test: `STALE_GRADING_AFTER_MS` (60s) > budget + biên —
 * sweep không được đuổi kịp runner còn sống.
 */
export const AI_GRADING_BUDGET_MS = 30_000;

/** Ngưỡng còn lại tối thiểu để mở thêm một lượt gọi grader. */
const MIN_REMAINING_FOR_ATTEMPT_MS = 1_000;

/** Tùy chọn lượt chấm lại (TOS-33 D3): route ai-retry CAS draft về
 * `ai_processing` rồi gọi entry này — KHÔNG tạo draft mới. */
export interface AiGradingOptions {
	retryCount?: number;
}

/** Actor sổ cái cho pipeline hệ thống (không phải user nào cả). */
const AI_GRADING_ACTOR = "system";

export interface AiGradingDeps {
	getDb(): Db;
	/** Vắng mặt / binding thiếu → `AI_GRADING_DISABLED` (fail-closed). */
	getAiGrader?(): AiGrader | undefined;
	/** Xem `AppDeps.runInBackground` — vắng mặt thì fire-and-forget. */
	runInBackground?(promise: Promise<unknown>): void;
	/** Chỉ test đụng: hạ timeout AI cho nhanh (mặc định 20s). */
	aiGradingTimeoutMs?: number;
	/** Chỉ test đụng: hạ ngân sách tổng vòng retry (mặc định 30s). */
	aiGradingBudgetMs?: number;
	/** TOS-33 D2: khoảng chờ giữa các lượt retry (mặc định [1s, 2s]);
	 * test/E2E truyền [0, 0] để chạy nhanh (mẫu `notificationRetryDelaysMs`). */
	retryDelaysMs?: number[];
	aiRetryDelaysMs?: number[];
	getTranscriber?():
		| { transcribe(mediaKey: string): Promise<string> }
		| undefined;
}

/** Dữ liệu attempt pipeline cần — skill/prompt từ đề (join theo mode). */
interface AttemptForGrading {
	orgId: string;
	skill: GradableSkill;
	part: string;
	prompt: string;
	essay: string;
	mediaKey: string | null;
}

/**
 * Attempt đã nộp + đề của nó (chuẩn IDOR như `loadGradableAttempt`): skill
 * từ `assignment_prompt` (assignment) hoặc `assignment_test` (practice —
 * prompt của part position thấp nhất). Attempt chưa nộp / đề đã xoá → null
 * (không tạo draft, không tiêu Credit).
 */
async function loadAttemptForGrading(
	db: Db,
	attemptId: string,
): Promise<AttemptForGrading | null> {
	const [base] = await db
		.select({
			orgId: quizAttempt.orgId,
			status: quizAttempt.status,
			mode: quizAttempt.mode,
			testId: quizAttempt.testId,
			assignmentId: quizAttempt.assignmentId,
			essay: quizAttempt.essay,
			mediaKey: quizAttempt.mediaKey,
		})
		.from(quizAttempt)
		.where(eq(quizAttempt.id, attemptId));
	if (base?.status !== "submitted") return null;

	type PromptHeader = {
		skill: string | null;
		part: string | null;
		prompt: string | null;
	};
	const practice = base.mode === "practice";
	const [header]: PromptHeader[] = practice
		? await db
				.select({
					skill: assignmentTest.skill,
					part: assignmentPrompt.part,
					prompt: assignmentPrompt.prompt,
				})
				.from(assignmentTest)
				.leftJoin(
					assignmentTestPart,
					eq(assignmentTestPart.testId, assignmentTest.id),
				)
				.leftJoin(
					assignmentPrompt,
					and(
						eq(assignmentPrompt.id, assignmentTestPart.promptId),
						eq(assignmentPrompt.orgId, base.orgId),
					),
				)
				.where(
					and(
						// CHECK DB ép practice ⇒ test_id NOT NULL — `?? ""` chỉ thu hẹp kiểu.
						eq(assignmentTest.id, base.testId ?? ""),
						eq(assignmentTest.orgId, base.orgId),
					),
				)
				.orderBy(asc(assignmentTestPart.position))
				.limit(1)
		: await db
				.select({
					skill: assignmentPrompt.skill,
					part: assignmentPrompt.part,
					prompt: assignmentPrompt.prompt,
				})
				.from(classAssignment)
				.innerJoin(
					assignmentPrompt,
					and(
						eq(assignmentPrompt.id, classAssignment.promptId),
						eq(assignmentPrompt.orgId, base.orgId),
					),
				)
				.where(
					and(
						// Attempt assignment luôn có lượt giao (CHECK DB).
						eq(classAssignment.id, base.assignmentId ?? ""),
						eq(classAssignment.orgId, base.orgId),
					),
				)
				.limit(1);

	const skill = header?.skill ?? "";
	if (!isGradableSkill(skill)) return null;
	return {
		orgId: base.orgId,
		skill,
		part: header?.part ?? "",
		prompt: header?.prompt ?? "",
		essay: base.essay,
		mediaKey: base.mediaKey,
	};
}

/**
 * CAS từ `ai_processing` sang trạng thái khác — 3 luồng tranh cùng dòng
 * (runner / sweep / teacher publish) dùng điều kiện `status = 'ai_processing'`
 * làm khóa loại trừ; ai thắng mới được biến đổi ví (kongming red-team
 * điều kiện 2: draft trước, ví sau).
 */
async function casDraftFromProcessing(
	db: Db,
	attemptId: string,
	patch: {
		status: string;
		errorCode?: string | null;
		aiScores?: Record<string, number>;
		aiFeedback?: string;
		draftedAt?: Date;
		publishedAt?: Date;
	},
): Promise<boolean> {
	const updated = await db
		.update(aiGradingDraft)
		.set(patch)
		.where(
			and(
				eq(aiGradingDraft.attemptId, attemptId),
				eq(aiGradingDraft.status, "ai_processing"),
			),
		)
		.returning({ attemptId: aiGradingDraft.attemptId });
	return updated.length > 0;
}

/** Nhánh thất bại chung: CAS `manual_pending` (thắng hay thua cũng release —
 * key idempotent `ai_grading:<id>:release` biến lần 2 thành no-op). */
async function failDraft(
	db: Db,
	settle: Parameters<typeof releaseCredits>[1],
	attemptId: string,
	errorCode: AiGradingErrorCode | null,
): Promise<void> {
	await casDraftFromProcessing(db, attemptId, {
		status: "manual_pending",
		errorCode,
	});
	await releaseCredits(db, settle);
}

/** Gọi grader 1 lượt với timeout per-call — map DOMException TimeoutError /
 * AbortError cho catch bên ngoài phân loại. */
async function gradeOnce(
	grader: AiGrader,
	input: Parameters<AiGrader["grade"]>[0],
	timeoutMs: number,
): Promise<AiGradingResult> {
	const signal = AbortSignal.timeout(timeoutMs);
	const { promise, resolve, reject } = Promise.withResolvers<AiGradingResult>();
	const onAbort = () => reject(signal.reason);
	signal.addEventListener("abort", onAbort, { once: true });
	grader
		.grade(input, signal)
		.then(resolve, reject)
		.finally(() => signal.removeEventListener("abort", onAbort));
	return promise;
}

/** Đợi giữa 2 lượt — delay inject (test/E2E dùng [0, 0]). */
function waitBackoff(ms: number): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

/**
 * Pipeline chấm nháp một attempt (TOS-30 D3; vòng retry TOS-33 D2):
 *
 * - Luồng thường: tạo draft `ai_processing` (idempotent — đã có draft thì
 *   thoát) → Speaking thiếu transcript thoát không tốn Credit (TOS-31 thay)
 *   → reserve → gọi grader TỐI ĐA 3 LƯỢT (1 + 2 retry, backoff 1s/2s,
 *   ngân sách tổng 30s — per-call = min(20s, còn lại), còn <1s dừng) →
 *   **CAS `ai_drafted` trước, settle sau**; thua CAS / lỗi AI → release.
 * - Entry retry (TOS-33 D3, `options.retryCount ≥ 1`): BỎ bước tạo draft —
 *   route ai-retry đã CAS draft về `ai_processing`; reserve/settle/release
 *   dùng bộ key riêng `ai_grading:<attemptId>:r<n>:<op>`.
 *
 * Mọi lỗi ném về caller (schedule bọc log) — draft kẹt `ai_processing`
 * được `releaseStaleGradings` dọn.
 */
export async function runAiGrading(
	deps: AiGradingDeps,
	attemptId: string,
	options: AiGradingOptions = {},
): Promise<void> {
	const db = deps.getDb();
	const retryCount = options.retryCount ?? 0;
	const attempt = await loadAttemptForGrading(db, attemptId);
	if (!attempt) return;

	const cost = AI_GRADING_COST[attempt.skill];

	if (retryCount < 1) {
		// Chống gọi trùng (nộp lại / request chạy lại): 1 dòng draft / attempt.
		const inserted = await db
			.insert(aiGradingDraft)
			.values({
				attemptId,
				orgId: attempt.orgId,
				skill: attempt.skill,
				creditCost: cost,
			})
			.onConflictDoNothing()
			.returning({ attemptId: aiGradingDraft.attemptId });
		if (inserted.length === 0) return;
	}

	const settle = {
		orgId: attempt.orgId,
		actorUserId: AI_GRADING_ACTOR,
		amount: cost,
		refId: attemptId,
		actionType: "ai_grading" as const,
		...(retryCount >= 1 ? { retryCount } : {}),
	};

	// Speaking TOS-30 (D4): chưa có STT → manual_pending, không reserve.
	// Transcript giữ lại — TOS-31 cắm Transcriber thật thì grader chấm trên
	// nội dung thật, không phải chuỗi rỗng (code review #478).
	let transcript: string | undefined;
	if (attempt.skill === "speaking") {
		const text = attempt.mediaKey
			? ((await deps.getTranscriber?.()?.transcribe(attempt.mediaKey)) ?? "")
			: "";
		if (text.length === 0) {
			await casDraftFromProcessing(db, attemptId, {
				status: "manual_pending",
				errorCode: AI_GRADING_ERROR_CODES.NO_TRANSCRIPT,
			});
			return;
		}
		transcript = text;
	}

	try {
		// Org chưa từng tiêu Credit thì chưa có dòng `credit_wallet` —
		// reserve UPDATE trượt 0 dòng thành `InsufficientCreditsError` cho
		// mọi bài nộp của org mới (precedent exam-imports: ensure trước reserve).
		await ensureWallet(db, attempt.orgId);
		await reserveCredits(db, settle);
	} catch (error) {
		if (error instanceof InsufficientCreditsError) {
			// Thiếu Credit (E-001): `error_code` null — TOS-32 thay nhánh này
			// (Chấm nhanh E-002) nên không đánh dấu là lỗi pipeline.
			await casDraftFromProcessing(db, attemptId, {
				status: "manual_pending",
				errorCode: null,
			});
			return;
		}
		throw error;
	}

	const grader = deps.getAiGrader?.();
	if (!grader) {
		// Fail-closed như extractor (binding AI thiếu) — Credit đã hoàn.
		// KHÔNG retry: lỗi cấu hình, gọi lại vô ích.
		await failDraft(db, settle, attemptId, AI_GRADING_ERROR_CODES.DISABLED);
		return;
	}

	// Ngân sách TỔNG đo từ TRƯỚC lượt gọi đầu (kongming advisory #481 R3):
	// per-call = min(per-call cap, còn lại); còn < 1s thì dừng, không gọi
	// thêm lượt. Hết ngân sách giữa chừng xếp `AI_GRADING_TIMEOUT`.
	const budgetMs = deps.aiGradingBudgetMs ?? AI_GRADING_BUDGET_MS;
	const perCallCapMs = deps.aiGradingTimeoutMs ?? AI_GRADING_TIMEOUT_MS;
	const delays = deps.retryDelaysMs ?? deps.aiRetryDelaysMs ?? [1_000, 2_000];
	const deadlineAt = Date.now() + budgetMs;
	const graderInput = {
		skill: attempt.skill,
		prompt: attempt.prompt,
		part: attempt.part,
		essay:
			attempt.skill === "writing"
				? essayToPlain(attempt.essay).text
				: undefined,
		transcript,
	};

	const MAX_GRADER_ATTEMPTS = 3;
	let validScores: Record<string, number> | null = null;
	let feedback = "";
	let failedByTimeout = false;
	// Chuẩn hoá về ĐÚNG 4 key của skill nằm TRONG vòng retry — grader trả
	// thiếu/dư key coi là 1 lượt hỏng (hành vi TOS-30: `failDraft` FAILED,
	// không kẹt `ai_processing`); shape chấm tay (`parseGradeScores` ở
	// publish) là nguồn chuẩn.
	const keys = criteriaForSkill(attempt.skill);
	for (let call = 1; call <= MAX_GRADER_ATTEMPTS; call++) {
		const remaining = deadlineAt - Date.now();
		if (call > 1 && remaining < MIN_REMAINING_FOR_ATTEMPT_MS) {
			failedByTimeout = true;
			break;
		}
		try {
			const result = await gradeOnce(
				grader,
				graderInput,
				Math.max(1, Math.min(perCallCapMs, remaining)),
			);
			const scores = Object.fromEntries(
				Object.entries(result.scores).map(([key, value]) => [
					key,
					roundBandStep(value),
				]),
			);
			const checked: Record<string, number> = {};
			for (const key of keys) {
				const value = scores[key];
				if (value === undefined || !Number.isFinite(value)) {
					throw new AiGradingFailedError(
						AI_GRADING_ERROR_CODES.FAILED,
						"grader returned incomplete scores",
					);
				}
				checked[key] = value;
			}
			validScores = checked;
			feedback = result.feedback;
			break;
		} catch (error) {
			failedByTimeout =
				// grader/AI treo cứng có thể bỏ qua `signal` — deadline ở trên
				// cắt đúng hạn bất kể; map TimeoutError/AbortError.
				(error instanceof DOMException && error.name === "TimeoutError") ||
				(error instanceof Error && error.name === "AbortError");
			if (call < MAX_GRADER_ATTEMPTS) {
				await waitBackoff(delays[Math.min(call, delays.length) - 1] ?? 0);
			}
		}
	}

	if (validScores === null) {
		// Đã đủ lượt retry / hết ngân sách → hoàn TOÀN bộ số đã giữ.
		await failDraft(
			db,
			settle,
			attemptId,
			failedByTimeout
				? AI_GRADING_ERROR_CODES.TIMEOUT
				: AI_GRADING_ERROR_CODES.FAILED,
		);
		return;
	}

	// CAS draft TRƯỚC, ví SAU (kongming red-team điều kiện 2): thua CAS
	// (teacher đã publish / sweep đã manual_pending) → hoàn Credit, tuyệt
	// đối không settle bằng `held` của job khác.
	const won = await casDraftFromProcessing(db, attemptId, {
		status: "ai_drafted",
		aiScores: validScores,
		aiFeedback: feedback,
		draftedAt: new Date(),
	});
	if (won) {
		await settleCredits(db, settle);
	} else {
		await releaseCredits(db, settle);
	}
}

/**
 * Hẹn pipeline chạy nền sau khi response nộp bài đã trả (D3) hoặc sau khi
 * route ai-retry CAS xong (TOS-33 D3): có `runInBackground` (waitUntil) →
 * wrap; không có (test node) → fire-and-forget với log lỗi — KHÔNG bỏ
 * lặng lẽ (kongming điều kiện 4). Trả promise để test await trực tiếp.
 */
export function scheduleAiGrading(
	deps: AiGradingDeps,
	attemptId: string,
	options: AiGradingOptions = {},
): Promise<void> {
	const promise = runAiGrading(deps, attemptId, options).catch(
		(error: unknown) => {
			console.error(`[ai-grading] pipeline ${attemptId} thất bại:`, error);
		},
	);
	if (deps.runInBackground) {
		deps.runInBackground(promise);
	}
	return promise;
}
