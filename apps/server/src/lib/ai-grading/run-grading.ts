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
	claimQuickGradeSlot,
	ensureWallet,
	InsufficientCreditsError,
	readOrgPlan,
	releaseCredits,
	reserveCredits,
	revertQuickGradeSlot,
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
	/** TOS-31 gắn STT thật; TOS-30 không wire → transcript rỗng. */
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

/** Nhánh thất bại cho chế độ Chấm nhanh (TOS-32 D3): TUYỆT ĐỐI không gọi
 * `releaseCredits` (không có held nào của job này — gọi sẽ ăn nhầm held của
 * job khác hoặc ném InsufficientCreditsError); hoàn lượt Chấm nhanh qua
 * `revertQuickGradeSlot` idempotent. */
async function failQuickDraft(
	db: Db,
	orgId: string,
	attemptId: string,
	errorCode: AiGradingErrorCode | null,
): Promise<void> {
	await casDraftFromProcessing(db, attemptId, {
		status: "manual_pending",
		errorCode,
	});
	await revertQuickGradeSlot(db, {
		orgId,
		attemptId,
		actorUserId: AI_GRADING_ACTOR,
	});
}

/**
 * Pipeline chấm nháp một attempt (TOS-30 D3): tạo draft `ai_processing`
 * (idempotent — đã có draft thì thoát) → Speaking thiếu transcript thoát
 * không tốn Credit (TOS-31 thay) → reserve → grade (≤ timeout) →
 * **CAS `ai_drafted` trước, settle sau**; thua CAS / lỗi AI → release.
 * Mọi lỗi ném về caller (schedule bọc log) — draft kẹt `ai_processing`
 * được `releaseStaleGradings` dọn.
 */
export async function runAiGrading(
	deps: AiGradingDeps,
	attemptId: string,
): Promise<void> {
	const db = deps.getDb();
	const attempt = await loadAttemptForGrading(db, attemptId);
	if (!attempt) return;

	const cost = AI_GRADING_COST[attempt.skill];

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

	const settle = {
		orgId: attempt.orgId,
		actorUserId: AI_GRADING_ACTOR,
		amount: cost,
		refId: attemptId,
		actionType: "ai_grading" as const,
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

	let quickMode = false;
	try {
		// Org chưa từng tiêu Credit thì chưa có dòng `credit_wallet` —
		// reserve UPDATE trượt 0 dòng thành `InsufficientCreditsError` cho
		// mọi bài nộp của org mới (precedent exam-imports: ensure trước reserve).
		await ensureWallet(db, attempt.orgId);
		await reserveCredits(db, settle);
	} catch (error) {
		if (error instanceof InsufficientCreditsError) {
			// TOS-32 (D3): Writing + gói tháng còn hiệu lực (active / grace_period)
			// → hạ cấp mềm sang "Chấm nhanh" (0 Credit, tối đa 30 lượt/tháng).
			if (attempt.skill === "writing") {
				const plan = await readOrgPlan(db, attempt.orgId);
				if (
					plan.planKind === "monthly" &&
					(plan.planStatus === "active" || plan.planStatus === "grace_period")
				) {
					const claimed = await claimQuickGradeSlot(db, {
						orgId: attempt.orgId,
						attemptId,
						actorUserId: AI_GRADING_ACTOR,
					});
					if (!claimed) {
						await casDraftFromProcessing(db, attemptId, {
							status: "manual_pending",
							errorCode: AI_GRADING_ERROR_CODES.QUOTA_EXHAUSTED,
						});
						return;
					}
					quickMode = true;
					await db
						.update(aiGradingDraft)
						.set({ gradingMode: "quick", creditCost: 0 })
						.where(eq(aiGradingDraft.attemptId, attemptId));
				}
			}
			if (!quickMode) {
				await casDraftFromProcessing(db, attemptId, {
					status: "manual_pending",
					errorCode: AI_GRADING_ERROR_CODES.INSUFFICIENT_CREDITS,
				});
				return;
			}
		} else {
			throw error;
		}
	}

	const grader = deps.getAiGrader?.();
	if (!grader) {
		// Fail-closed như extractor (binding AI thiếu) — hoàn Credit hoặc lượt quick.
		if (quickMode) {
			await failQuickDraft(
				db,
				attempt.orgId,
				attemptId,
				AI_GRADING_ERROR_CODES.DISABLED,
			);
		} else {
			await failDraft(db, settle, attemptId, AI_GRADING_ERROR_CODES.DISABLED);
		}
		return;
	}

	try {
		// Pipeline TỰ áp hạn chót (kongming #478 follow-up): grader/AI treo
		// cứng có thể bỏ qua `signal` — race ở đây cắt đúng deadline bất kể.
		// Listener đăng ký TRƯỚC khi gọi grade; `signal.reason` là
		// DOMException "TimeoutError" → catch map thành AI_GRADING_TIMEOUT.
		const signal = AbortSignal.timeout(
			deps.aiGradingTimeoutMs ?? AI_GRADING_TIMEOUT_MS,
		);
		const result = await new Promise<AiGradingResult>((resolve, reject) => {
			const onAbort = () => reject(signal.reason);
			signal.addEventListener("abort", onAbort, { once: true });
			grader
				.grade(
					{
						skill: attempt.skill,
						prompt: attempt.prompt,
						part: attempt.part,
						essay:
							attempt.skill === "writing"
								? essayToPlain(attempt.essay).text
								: undefined,
						transcript,
						mode: quickMode ? "quick" : "standard",
					},
					signal,
				)
				.then(resolve, reject)
				.finally(() => signal.removeEventListener("abort", onAbort));
		});
		const scores = Object.fromEntries(
			Object.entries(result.scores).map(([key, value]) => [
				key,
				roundBandStep(value),
			]),
		);
		// Chuẩn hoá về ĐÚNG 4 key của skill — dư/thiếu key coi grader hỏng;
		// shape chấm tay (`parseGradeScores` ở publish) là nguồn chuẩn.
		const keys = criteriaForSkill(attempt.skill);
		const validScores: Record<string, number> = {};
		for (const key of keys) {
			const value = scores[key];
			if (value === undefined || !Number.isFinite(value)) {
				throw new AiGradingFailedError(
					AI_GRADING_ERROR_CODES.FAILED,
					"grader returned incomplete scores",
				);
			}
			validScores[key] = value;
		}

		// CAS draft TRƯỚC, ví SAU (kongming red-team điều kiện 2): thua CAS
		// (teacher đã publish / sweep đã manual_pending) → hoàn Credit, tuyệt
		// đối không settle bằng `held` của job khác.
		const won = await casDraftFromProcessing(db, attemptId, {
			status: "ai_drafted",
			aiScores: validScores,
			aiFeedback: result.feedback,
			draftedAt: new Date(),
		});
		if (won) {
			if (!quickMode) {
				await settleCredits(db, settle);
			}
		} else if (quickMode) {
			await revertQuickGradeSlot(db, {
				orgId: attempt.orgId,
				attemptId,
				actorUserId: AI_GRADING_ACTOR,
			});
		} else {
			await releaseCredits(db, settle);
		}
	} catch (error) {
		const code: AiGradingErrorCode =
			error instanceof DOMException && error.name === "TimeoutError"
				? AI_GRADING_ERROR_CODES.TIMEOUT
				: error instanceof Error && error.name === "AbortError"
					? AI_GRADING_ERROR_CODES.TIMEOUT
					: AI_GRADING_ERROR_CODES.FAILED;
		if (quickMode) {
			await failQuickDraft(db, attempt.orgId, attemptId, code);
		} else {
			await failDraft(db, settle, attemptId, code);
		}
	}
}

/**
 * Hẹn pipeline chạy nền sau khi response nộp bài đã trả (D3): có
 * `runInBackground` (waitUntil) → wrap; không có (test node) →
 * fire-and-forget với log lỗi — KHÔNG bỏ lặng lẽ (kongming điều kiện 4).
 * Trả promise để test await trực tiếp.
 */
export function scheduleAiGrading(
	deps: AiGradingDeps,
	attemptId: string,
): Promise<void> {
	const promise = runAiGrading(deps, attemptId).catch((error: unknown) => {
		console.error(`[ai-grading] pipeline ${attemptId} thất bại:`, error);
	});
	if (deps.runInBackground) {
		deps.runInBackground(promise);
	}
	return promise;
}
