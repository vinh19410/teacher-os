import type { ExtractedExamDraft } from "@teacher-os/api/contracts";
import { Badge } from "@/components/ui/badge";
import { EXAM_IMPORT_SKILL_LABELS } from "@/lib/repos/exam-imports";
import { QuestionReviewCard } from "./question-review-card";

/**
 * Panel kết quả bóc tách (phase-03, cột phải — READ-ONLY): tên đề, kỹ năng,
 * thời gian, passage từng part và danh sách câu qua QuestionReviewCard.
 * Sửa/lưu đề thuộc TOS-26 — panel này không nhận onChange.
 */
export function ExtractedExamPanel({ draft }: { draft: ExtractedExamDraft }) {
	return (
		<div data-testid="extracted-exam-panel" className="space-y-4">
			<div className="space-y-1">
				<h2 className="font-semibold text-lg tracking-tight">{draft.title}</h2>
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="secondary">
						{EXAM_IMPORT_SKILL_LABELS[draft.skill]}
					</Badge>
					{draft.timeLimitMinutes != null && (
						<Badge variant="outline" className="tabular-nums">
							{draft.timeLimitMinutes} phút
						</Badge>
					)}
				</div>
			</div>
			{draft.parts.map((part, partIndex) => (
				<section
					key={partIndex}
					className="space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
				>
					<p className="text-muted-foreground text-xs">Part {partIndex + 1}</p>
					{part.passage && (
						<div className="whitespace-pre-wrap text-sm leading-[1.85]">
							{part.passage}
						</div>
					)}
					<div className="space-y-3">
						{part.questions.map((question, qIndex) => (
							<QuestionReviewCard
								key={qIndex}
								question={question}
								index={qIndex}
							/>
						))}
					</div>
				</section>
			))}
		</div>
	);
}
