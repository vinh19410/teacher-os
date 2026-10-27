import {
	EXAM_IMPORT_SKILLS,
	type ExamImportSkill,
	type ExtractedExamDraft,
	type ReviewedQuestion,
} from "@teacher-os/api/contracts";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { EXAM_IMPORT_SKILL_LABELS } from "@/lib/repos/exam-imports";
import { normalizeLegacyRichText } from "@/lib/rich-text-legacy";
import { ExamImportActions } from "./exam-import-actions";
import { QuestionReviewCard } from "./question-review-card";
import { ReviewConfirmation } from "./review-confirmation";

// jsdom không có layout — ProseMirror gọi getClientRects khi mount/focus;
// polyfill an toàn để unit test không ném TypeError.
const emptyRectList = (): DOMRectList =>
	({
		length: 0,
		item: () => null,
		[Symbol.iterator]: [][Symbol.iterator],
	}) as DOMRectList;
if (typeof Element !== "undefined") {
	Element.prototype.getClientRects ??= emptyRectList;
}
if (typeof Range !== "undefined") {
	Range.prototype.getClientRects ??= emptyRectList;
	Range.prototype.getBoundingClientRect ??= () => new DOMRect(0, 0, 0, 0);
}

/** Chuẩn hóa newline plain text của `passage` trước khi đưa vào Tiptap. */
function normalizeDraftForEditor(
	draft: ExtractedExamDraft,
): ExtractedExamDraft {
	return {
		...draft,
		parts: draft.parts.map((part) => ({
			...part,
			passage: part.passage ? normalizeLegacyRichText(part.passage) : "",
		})),
	};
}

export interface ExtractedExamPanelProps {
	draft: ExtractedExamDraft;
	onDraftChange?: (draft: ExtractedExamDraft) => void;
	onSaveDraft?: (draft: ExtractedExamDraft) => void | Promise<void>;
	onPublish?: (
		draft: ExtractedExamDraft,
		reviewConfirmed: boolean,
	) => void | Promise<void>;
	savingDraft?: boolean;
	publishing?: boolean;
	statusMessage?: string | null;
	errorMessage?: string | null;
}

/**
 * Cột phải màn Nhập đề AI [6] (TOS-26 #472, wireframe mục [6]–[14]):
 * - Sửa tay tên đề, kỹ năng, thời gian (phút), đoạn văn (RichTextEditor Tiptap),
 *   và từng câu hỏi/đáp án/giải thích với chi phí 0 Credit.
 * - Hộp kiểm xác nhận [11] hiển thị khi `reviewCount > 0`; khóa nút
 *   "Lưu vào Ngân hàng đề" tới khi tích xác nhận.
 */
export function ExtractedExamPanel({
	draft,
	onDraftChange,
	onSaveDraft,
	onPublish,
	savingDraft = false,
	publishing = false,
	statusMessage = null,
	errorMessage = null,
}: ExtractedExamPanelProps) {
	const [localDraft, setLocalDraft] = useState<ExtractedExamDraft>(() =>
		normalizeDraftForEditor(draft),
	);
	const [confirmed, setConfirmed] = useState(false);

	useEffect(() => {
		setLocalDraft(normalizeDraftForEditor(draft));
		setConfirmed(false);
	}, [draft]);

	const reviewCount = useMemo(
		() =>
			localDraft.parts.reduce(
				(sum, part) => sum + part.questions.filter((q) => q.needsReview).length,
				0,
			),
		[localDraft],
	);

	function updateDraft(next: ExtractedExamDraft) {
		setLocalDraft(next);
		onDraftChange?.(next);
	}

	function updatePartPassage(partIndex: number, nextPassage: string) {
		updateDraft({
			...localDraft,
			parts: localDraft.parts.map((part, idx) =>
				idx === partIndex ? { ...part, passage: nextPassage } : part,
			),
		});
	}

	function updateQuestion(
		partIndex: number,
		qIndex: number,
		nextQuestion: ReviewedQuestion,
	) {
		updateDraft({
			...localDraft,
			parts: localDraft.parts.map((part, idx) =>
				idx === partIndex
					? {
							...part,
							questions: part.questions.map((q, i) =>
								i === qIndex ? nextQuestion : q,
							),
						}
					: part,
			),
		});
	}

	return (
		<div data-testid="extracted-exam-panel" className="space-y-4">
			<div className="space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
				<div className="space-y-1">
					<h2 className="font-semibold text-lg tracking-tight">
						{localDraft.title}
					</h2>
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="secondary">
							{EXAM_IMPORT_SKILL_LABELS[localDraft.skill]}
						</Badge>
						{localDraft.timeLimitMinutes != null && (
							<Badge variant="outline" className="tabular-nums">
								{localDraft.timeLimitMinutes} phút
							</Badge>
						)}
					</div>
				</div>

				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<div className="sm:col-span-2">
						<Field label="Tên đề thi *" htmlFor="exam-import-title">
							<Input
								id="exam-import-title"
								data-testid="exam-title-input"
								value={localDraft.title}
								maxLength={200}
								onChange={(e) =>
									updateDraft({ ...localDraft, title: e.target.value })
								}
							/>
						</Field>
					</div>
					<div>
						<Field label="Kỹ năng *" htmlFor="exam-import-skill">
							<Select
								id="exam-import-skill"
								data-testid="exam-skill-select"
								value={localDraft.skill}
								onChange={(e) =>
									updateDraft({
										...localDraft,
										skill: e.target.value as ExamImportSkill,
									})
								}
							>
								{EXAM_IMPORT_SKILLS.map((skill) => (
									<option key={skill} value={skill}>
										{EXAM_IMPORT_SKILL_LABELS[skill]}
									</option>
								))}
							</Select>
						</Field>
					</div>
				</div>

				<div className="max-w-xs">
					<Field
						label="Thời gian làm bài (phút)"
						htmlFor="exam-import-time-limit"
					>
						<Input
							id="exam-import-time-limit"
							data-testid="exam-time-limit-input"
							type="number"
							min={1}
							max={300}
							value={localDraft.timeLimitMinutes ?? ""}
							onChange={(e) => {
								const raw = e.target.value.trim();
								const parsed = raw ? Number.parseInt(raw, 10) : null;
								updateDraft({
									...localDraft,
									timeLimitMinutes:
										parsed != null && Number.isFinite(parsed) && parsed > 0
											? Math.min(300, Math.max(1, parsed))
											: null,
								});
							}}
						/>
					</Field>
				</div>
			</div>

			{localDraft.parts.map((part, partIndex) => (
				<section
					key={partIndex}
					className="space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
				>
					<p className="font-medium text-muted-foreground text-xs">
						Part {partIndex + 1}
					</p>
					<Field
						label={`Đoạn văn (Part ${partIndex + 1})`}
						htmlFor={`exam-part-passage-${partIndex}`}
					>
						<RichTextEditor
							id={`exam-part-passage-${partIndex}`}
							ariaLabel={`Đoạn văn Part ${partIndex + 1}`}
							value={part.passage ?? ""}
							onChange={(nextHtml) => updatePartPassage(partIndex, nextHtml)}
						/>
					</Field>
					<div className="space-y-3">
						{part.questions.map((question, qIndex) => (
							<QuestionReviewCard
								key={qIndex}
								question={question}
								index={qIndex}
								partIndex={partIndex}
								onChange={(nextQ) => updateQuestion(partIndex, qIndex, nextQ)}
							/>
						))}
					</div>
				</section>
			))}

			{statusMessage && (
				<div
					role="status"
					aria-live="polite"
					data-testid="exam-import-status-notice"
					className="rounded-lg border border-border bg-muted/40 p-3 text-sm"
				>
					{statusMessage}
				</div>
			)}

			{errorMessage && (
				<div
					role="alert"
					data-testid="exam-import-publish-error"
					className="rounded-lg border border-warn bg-warn/10 p-3 text-sm"
				>
					{errorMessage}
				</div>
			)}

			<ReviewConfirmation
				reviewCount={reviewCount}
				confirmed={confirmed}
				onConfirmedChange={setConfirmed}
				disabled={savingDraft || publishing}
			/>

			<ExamImportActions
				reviewCount={reviewCount}
				confirmed={confirmed}
				savingDraft={savingDraft}
				publishing={publishing}
				onSaveDraft={() => void onSaveDraft?.(localDraft)}
				onPublish={() =>
					void onPublish?.(localDraft, reviewCount === 0 ? true : confirmed)
				}
			/>
		</div>
	);
}
