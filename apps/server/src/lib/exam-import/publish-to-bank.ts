import {
	ASSIGNMENT_PART_TYPES,
	ASSIGNMENT_TEST_PRESETS,
	type AssignmentQuestion,
	type AssignmentSkill,
	assignmentQuestionSchema,
	EXAM_IMPORT_ERROR_CODES,
	EXAM_IMPORT_LIMITS,
	type ExtractedExamDraft,
	extractedExamDraftSchema,
	type ReviewedQuestion,
} from "@teacher-os/api/contracts";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import {
	assignmentTest,
	assignmentTestPart,
} from "@teacher-os/db/schema/assignment-test";
import { examImportJob } from "@teacher-os/db/schema/exam-import-job";
import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../../app";

/**
 * Tính cờ `needsReview` cho một câu hỏi theo ngưỡng độ tin cậy và tính đầy đủ
 * của đáp án/lựa chọn (TOS-24/TOS-26).
 */
export function computeQuestionNeedsReview(question: {
	confidence: number;
	opts?: string[] | null;
	answer?: string | null;
}): boolean {
	const opts = question.opts ?? undefined;
	const answer =
		question.answer !== undefined &&
		question.answer !== null &&
		question.answer.trim().length > 0
			? question.answer.trim()
			: undefined;
	return (
		question.confidence < EXAM_IMPORT_LIMITS.reviewConfidence ||
		answer === undefined ||
		(opts !== undefined && opts.length < 2) ||
		(opts !== undefined && answer !== undefined && !opts.includes(answer))
	);
}

/**
 * Đếm tổng số câu gắn nhãn `needsReview` trong một bản nháp đề.
 */
export function countNeedsReviewQuestions(
	draft: ExtractedExamDraft | null | undefined,
): number {
	if (!draft) return 0;
	let total = 0;
	for (const part of draft.parts) {
		for (const q of part.questions) {
			if (q.needsReview) total += 1;
		}
	}
	return total;
}

/**
 * Hợp nhất bản nháp do client gửi lên với `existingDraft` đang lưu trong DB:
 * - Giữ nguyên `confidence` gốc của câu hỏi cùng vị trí `(partIndex, qIndex)`.
 * - Câu đã từng gắn `needsReview === true` trong DB KHÔNG BAO GIỜ tự gỡ cờ
 *   khi sửa tay (Plan D2 & Red-Team Finding #2: chống client tự hạ
 *   `needsReview: false` để vượt cổng xác nhận).
 */
const QUESTION_TYPE_ALIASES: Record<string, string> = {
	short_answer: "shortans",
	gap_fill: "sent",
	true_false_not_given: "tfng",
	yes_no_not_given: "ynng",
};

export function mergeReviewedDraft(
	existingDraft: ExtractedExamDraft | null,
	incomingDraft: ExtractedExamDraft,
): ExtractedExamDraft {
	const merged = extractedExamDraftSchema.parse({
		...incomingDraft,
		parts: incomingDraft.parts.map((part, partIndex) => {
			const existingPart = existingDraft?.parts[partIndex];
			return {
				...part,
				questions: part.questions.map((question, qIndex): ReviewedQuestion => {
					const existingQ = existingPart?.questions[qIndex];
					const confidence = existingQ?.confidence ?? question.confidence;
					const needsReview = Boolean(
						existingQ?.needsReview ||
							question.needsReview ||
							(!existingQ &&
								computeQuestionNeedsReview({
									confidence,
									opts: question.opts,
									answer: question.answer,
								})),
					);
					return {
						...question,
						confidence,
						needsReview,
					};
				}),
			};
		}),
	});

	// Nếu existingDraft từng có ít nhất 1 câu needsReview=true nhưng incomingDraft
	// xoá bớt câu để hạ tổng số needsReview về 0, gán lại needsReview=true lên câu
	// đầu tiên để không thể lách cổng qua chuỗi PATCH /draft → POST /publish.
	if (
		countNeedsReviewQuestions(existingDraft) > 0 &&
		countNeedsReviewQuestions(merged) === 0
	) {
		const firstQ = merged.parts[0]?.questions[0];
		if (firstQ) {
			firstQ.needsReview = true;
		}
	}

	return merged;
}

/** Đọc an toàn `draft_json` từ row `exam_import_job`. */
export function parseStoredDraft(
	rawDraftJson: string | null | undefined,
): ExtractedExamDraft | null {
	if (!rawDraftJson) return null;
	try {
		const parsed = extractedExamDraftSchema.safeParse(JSON.parse(rawDraftJson));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

export type PublishToBankResult =
	| {
			ok: true;
			testId: string;
			status: "ready" | "draft";
	  }
	| {
			ok: false;
			status: 422;
			code:
				| typeof EXAM_IMPORT_ERROR_CODES.REVIEW_CONFIRMATION_REQUIRED
				| typeof EXAM_IMPORT_ERROR_CODES.SKILL_MIXED_NOT_ALLOWED
				| typeof EXAM_IMPORT_ERROR_CODES.TOO_MANY_PARTS
				| typeof EXAM_IMPORT_ERROR_CODES.INVALID_DRAFT;
			error: string;
			partIndex?: number;
			questionIndex?: number;
			maxParts?: number;
	  };

/**
 * Xuất bản bản nháp `ExtractedExamDraft` của một job nhập đề vào Ngân hàng đề
 * (`assignment_prompt[]` + `assignment_test` + `assignment_test_part[]`) trong
 * 1 `db.batch` nguyên tử (TOS-26 #472).
 */
export async function publishExamImportToBank(
	db: Db,
	input: {
		job: typeof examImportJob.$inferSelect;
		orgId: string;
		draft: ExtractedExamDraft;
		reviewConfirmed: boolean;
	},
): Promise<PublishToBankResult> {
	const { job, orgId, reviewConfirmed } = input;
	const existingDraft = parseStoredDraft(job.draftJson);
	const mergedDraft = mergeReviewedDraft(existingDraft, input.draft);

	// 1. Cổng xác nhận 2 lớp (D3): nếu bản nháp hiện tại HOẶC bản nháp gốc trong
	// DB có câu `needsReview` mà client chưa tích `reviewConfirmed` → chặn 422.
	const reviewCount = Math.max(
		countNeedsReviewQuestions(mergedDraft),
		countNeedsReviewQuestions(existingDraft),
	);
	if (reviewCount > 0 && !reviewConfirmed) {
		return {
			ok: false,
			status: 422,
			code: EXAM_IMPORT_ERROR_CODES.REVIEW_CONFIRMATION_REQUIRED,
			error: "review confirmation required before publishing",
		};
	}

	// 2. Kiểm tra kỹ năng & số slot theo ASSIGNMENT_TEST_PRESETS (D5).
	if (mergedDraft.skill === "mixed") {
		return {
			ok: false,
			status: 422,
			code: EXAM_IMPORT_ERROR_CODES.SKILL_MIXED_NOT_ALLOWED,
			error: "skill must be selected before publishing",
		};
	}
	const skill = mergedDraft.skill as AssignmentSkill;
	const preset = ASSIGNMENT_TEST_PRESETS[skill];
	if (mergedDraft.parts.length > preset.slots.length) {
		return {
			ok: false,
			status: 422,
			code: EXAM_IMPORT_ERROR_CODES.TOO_MANY_PARTS,
			error: `skill ${skill} supports at most ${preset.slots.length} parts`,
			maxParts: preset.slots.length,
		};
	}

	// 3. Idempotency check (D6): nếu job đã có `publishedTestId` và bộ đề đó còn
	// tồn tại trong org → trả lại chính `testId` đó, không nhân bản.
	if (job.publishedTestId) {
		const [existingTest] = await db
			.select({
				id: assignmentTest.id,
				status: assignmentTest.status,
			})
			.from(assignmentTest)
			.where(
				and(
					eq(assignmentTest.id, job.publishedTestId),
					eq(assignmentTest.orgId, orgId),
				),
			)
			.limit(1);
		if (existingTest) {
			return {
				ok: true,
				testId: existingTest.id,
				status: existingTest.status === "draft" ? "draft" : "ready",
			};
		}
	}

	// 4. Chuẩn hóa & validate từng câu hỏi qua `assignmentQuestionSchema` (D4).
	const mappedParts: Array<{
		slotPart: string;
		slotLabel: string;
		promptType: string;
		passage: string;
		questions: AssignmentQuestion[];
	}> = [];

	for (const [partIndex, part] of mergedDraft.parts.entries()) {
		const slot = preset.slots[partIndex];
		if (!slot) {
			return {
				ok: false,
				status: 422,
				code: EXAM_IMPORT_ERROR_CODES.TOO_MANY_PARTS,
				error: "part exceeds preset slots",
				partIndex,
			};
		}
		const isWritingOrSpeaking = skill === "writing" || skill === "speaking";
		if (!isWritingOrSpeaking && part.questions.length === 0) {
			return {
				ok: false,
				status: 422,
				code: EXAM_IMPORT_ERROR_CODES.INVALID_DRAFT,
				error: "part must contain at least one question",
				partIndex,
			};
		}
		const allowedTypes = ASSIGNMENT_PART_TYPES[skill]?.types[slot.part] ?? [];
		const firstValidType = part.questions
			.map((q) =>
				q.type ? (QUESTION_TYPE_ALIASES[q.type] ?? q.type) : undefined,
			)
			.find((t): t is string => Boolean(t && allowedTypes.includes(t)));
		const promptType = firstValidType ?? allowedTypes[0] ?? "tfng";

		const mappedQuestions: AssignmentQuestion[] = [];
		for (const [questionIndex, q] of part.questions.entries()) {
			const stem = q.stem.trim();
			const rawAnswer = (q.answer ?? "").trim();
			const rawOpts =
				q.opts && q.opts.length > 0 ? q.opts.map((opt) => opt.trim()) : null;
			if (
				!stem ||
				(!isWritingOrSpeaking && !rawAnswer) ||
				(rawOpts !== null && rawOpts.length < 2)
			) {
				return {
					ok: false,
					status: 422,
					code: EXAM_IMPORT_ERROR_CODES.INVALID_DRAFT,
					error: "invalid question in draft",
					partIndex,
					questionIndex,
				};
			}
			const rawType = q.type?.trim()
				? (QUESTION_TYPE_ALIASES[q.type.trim()] ?? q.type.trim())
				: null;
			const normalizedType =
				rawType && allowedTypes.includes(rawType) ? rawType : null;
			const matchedOptIndex =
				rawOpts !== null
					? rawOpts.findIndex(
							(opt) => opt.toLowerCase() === rawAnswer.toLowerCase(),
						)
					: -1;
			const isMcqLike =
				rawType === "mcq" || rawType === "mcq1" || rawType === "mcq3";
			const finalAnswer =
				isMcqLike && matchedOptIndex >= 0 && normalizedType === rawType
					? String.fromCharCode(65 + matchedOptIndex)
					: rawAnswer;
			const alts =
				matchedOptIndex >= 0
					? finalAnswer === rawAnswer
						? String.fromCharCode(65 + matchedOptIndex)
						: rawAnswer
					: "";

			const candidate = {
				stem,
				opts: rawOpts,
				answer: finalAnswer,
				alts,
				type: normalizedType,
				...(q.explanation !== undefined &&
				q.explanation !== null &&
				q.explanation.trim().length > 0
					? { explanation: q.explanation.trim() }
					: {}),
			};
			const parsedQ = assignmentQuestionSchema.safeParse(candidate);
			if (!parsedQ.success) {
				return {
					ok: false,
					status: 422,
					code: EXAM_IMPORT_ERROR_CODES.INVALID_DRAFT,
					error: "invalid question in draft",
					partIndex,
					questionIndex,
				};
			}
			mappedQuestions.push({
				...parsedQ.data,
				opts: parsedQ.data.opts ?? null,
				type: parsedQ.data.type ?? null,
				pin: parsedQ.data.pin ?? null,
			});
		}

		mappedParts.push({
			slotPart: slot.part,
			slotLabel: slot.label,
			promptType,
			passage: (part.passage ?? "").trim(),
			questions: mappedQuestions,
		});
	}

	// 5. Thực thi batch INSERT prompts + test + test_parts + UPDATE job.
	// Dùng ID tất định theo `job.id` ở lần xuất bản đầu tiên để chống TOCTOU khi
	// 2 request publish chạy song song trên D1/libsql.
	const isFirstPublish = !job.publishedTestId;
	const testId = isFirstPublish ? `test-import-${job.id}` : crypto.randomUUID();
	const targetStatus: "ready" | "draft" =
		skill === "listening" ? "draft" : "ready";
	const sourceLabel = `AI import: ${job.fileName}`.slice(0, 200);
	const timeLimitSeconds =
		mergedDraft.timeLimitMinutes != null
			? mergedDraft.timeLimitMinutes * 60
			: null;

	const statements: BatchItem<"sqlite">[] = [];
	const promptIds: string[] = [];

	for (const mappedPart of mappedParts) {
		const promptId = isFirstPublish
			? `prompt-import-${job.id}-${mappedPart.slotPart}`
			: crypto.randomUUID();
		promptIds.push(promptId);

		const partTitle =
			mappedParts.length === 1
				? mergedDraft.title
				: `${mergedDraft.title} — ${mappedPart.slotLabel}`.slice(0, 200);
		const isWritingOrSpeaking = skill === "writing" || skill === "speaking";

		statements.push(
			db.insert(assignmentPrompt).values({
				id: promptId,
				orgId,
				task: skill === "writing" ? mappedPart.slotPart : "task2",
				genre: skill === "writing" ? mappedPart.promptType : "",
				skill,
				part: mappedPart.slotPart,
				type: mappedPart.promptType,
				title: partTitle,
				band: "7.0",
				source: sourceLabel,
				prompt: isWritingOrSpeaking ? mappedPart.passage : "",
				intro: "",
				passage: isWritingOrSpeaking ? "" : mappedPart.passage,
				transcript: "",
				cueTopic:
					skill === "speaking" && mappedPart.slotPart === "part2"
						? mergedDraft.title
						: "",
				cuePoints: "",
				audioName: "",
				imageUrl: "",
				questions: JSON.stringify(
					isWritingOrSpeaking ? [] : mappedPart.questions,
				),
				optionBank: "[]",
				note: "",
				status: targetStatus,
			}),
		);
	}

	statements.push(
		db.insert(assignmentTest).values({
			id: testId,
			orgId,
			title: mergedDraft.title,
			description: null,
			skill,
			timeLimitSeconds,
			collection: null,
			testGroup: null,
			status: targetStatus,
		}),
	);

	for (const [idx, mappedPart] of mappedParts.entries()) {
		const partId = isFirstPublish
			? `test-part-import-${job.id}-${mappedPart.slotPart}`
			: crypto.randomUUID();
		statements.push(
			db.insert(assignmentTestPart).values({
				id: partId,
				testId,
				promptId: promptIds[idx] as string,
				part: mappedPart.slotPart,
				position: idx,
				qStartOverride: null,
			}),
		);
	}

	statements.push(
		db
			.update(examImportJob)
			.set({
				draftJson: JSON.stringify(mergedDraft),
				publishedTestId: testId,
				updatedAt: new Date(),
			})
			.where(and(eq(examImportJob.id, job.id), eq(examImportJob.orgId, orgId))),
	);

	try {
		const [first, ...rest] = statements;
		if (first) {
			await db.batch([first, ...rest]);
		}
	} catch (error) {
		// Nếu 2 request publish song song đụng PK/unique constraint, đọc lại
		// `publishedTestId` của request thắng cuộc để trả idempotent.
		const [refreshed] = await db
			.select({ publishedTestId: examImportJob.publishedTestId })
			.from(examImportJob)
			.where(and(eq(examImportJob.id, job.id), eq(examImportJob.orgId, orgId)))
			.limit(1);
		if (refreshed?.publishedTestId) {
			const [winnerTest] = await db
				.select({
					id: assignmentTest.id,
					status: assignmentTest.status,
				})
				.from(assignmentTest)
				.where(
					and(
						eq(assignmentTest.id, refreshed.publishedTestId),
						eq(assignmentTest.orgId, orgId),
					),
				)
				.limit(1);
			if (winnerTest) {
				return {
					ok: true,
					testId: winnerTest.id,
					status: winnerTest.status === "draft" ? "draft" : "ready",
				};
			}
		}
		throw error;
	}

	return {
		ok: true,
		testId,
		status: targetStatus,
	};
}
