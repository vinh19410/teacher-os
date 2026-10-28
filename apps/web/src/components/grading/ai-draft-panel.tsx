import {
	AI_GRADING_ERROR_CODES,
	type AiGradingDraftView,
} from "@teacher-os/api/contracts";
import {
	criteriaForSkill,
	criterionLabel,
	type GradableSkill,
} from "@teacher-os/api/lib/ielts-band";
import { fmtWhen } from "@/components/assignments/assignment-status";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionLabel } from "@/components/ui/section-label";
import { cn } from "@/lib/cn";

/** Nhãn badge trạng thái draft — dùng chung hàng chờ (/grading index). */
export const AI_DRAFT_STATUS_LABELS: Record<
	AiGradingDraftView["status"],
	string
> = {
	ai_processing: "AI đang chấm…",
	ai_drafted: "AI đã chấm nháp",
	teacher_reviewing: "Đang rà soát",
	manual_pending: "Chờ chấm tay",
	published: "Đã trả kết quả",
};

/** Badge trạng thái draft — tái dùng ở panel và hàng chờ. */
export function AiDraftStatusBadge({
	status,
	className,
}: {
	status: AiGradingDraftView["status"];
	className?: string;
}) {
	const variant =
		status === "ai_drafted"
			? "default"
			: status === "published"
				? "success"
				: status === "manual_pending"
					? "warn"
					: "secondary";
	return (
		<Badge variant={variant} className={className}>
			{AI_DRAFT_STATUS_LABELS[status]}
		</Badge>
	);
}

/** Nhãn lỗi pipeline (error_code → chữ cho giáo viên). */
export function aiDraftErrorLabel(errorCode: string | null): string | null {
	switch (errorCode) {
		case AI_GRADING_ERROR_CODES.TIMEOUT:
			return "AI quá hạn — bạn vẫn chấm tay bình thường.";
		case AI_GRADING_ERROR_CODES.DISABLED:
			return "Chấm AI chưa cấu hình cho tổ chức.";
		case AI_GRADING_ERROR_CODES.NO_TRANSCRIPT:
			return "Chưa có lời thoại chuyển văn bản (Speaking).";
		case AI_GRADING_ERROR_CODES.FAILED:
			return "AI chấm lỗi — bạn vẫn chấm tay bình thường.";
		default:
			return errorCode ? "AI chấm lỗi." : null;
	}
}

/**
 * Panel "Gợi ý từ AI" (TOS-30, màn Rà soát [7]) — CHỈ ĐỌC: 4 điểm gợi ý
 * theo tiêu chí + nhận xét AI. Giáo viên chỉnh ở GradeForm (điền sẵn từ
 * nháp rà → điểm AI); nút hành động nằm ở form, không ở panel này.
 */
export function AiDraftPanel({
	draft,
	skill,
	part,
}: {
	draft: AiGradingDraftView;
	skill: GradableSkill;
	part: string;
}) {
	const keys = criteriaForSkill(skill);
	const scores = draft.reviewedScores ?? draft.aiScores;
	const hasScores = keys.every((key) => scores?.[key] !== undefined);
	const errorLabel =
		draft.status === "manual_pending"
			? aiDraftErrorLabel(draft.errorCode)
			: null;
	// Nháp rà của giáo viên ưu tiên; chưa có thì hiển thị nhận xét AI (italic).
	const reviewed = draft.reviewedFeedback.length > 0;
	const shownFeedback = reviewed ? draft.reviewedFeedback : draft.aiFeedback;

	return (
		<Card
			data-testid="ai-draft-panel"
			className="flex flex-col gap-4 self-start p-6"
		>
			<div className="flex items-center justify-between gap-2">
				<SectionLabel>Gợi ý từ AI</SectionLabel>
				<AiDraftStatusBadge status={draft.status} />
			</div>
			{hasScores ? (
				<dl className="grid grid-cols-2 gap-x-4 gap-y-2">
					{keys.map((key) => (
						<div
							key={key}
							className="flex items-baseline justify-between gap-2"
						>
							<dt className="text-muted-foreground text-xs">
								{criterionLabel(skill, key, part)}
							</dt>
							<dd className="font-semibold text-sm tabular-nums">
								{(scores?.[key] ?? 0).toFixed(1)}
							</dd>
						</div>
					))}
				</dl>
			) : (
				<p className="text-muted-foreground text-sm">
					AI chưa có điểm gợi ý cho bài này.
				</p>
			)}
			{shownFeedback.length > 0 && (
				<blockquote
					className={cn(
						"border-l-2 pl-3 text-sm",
						reviewed
							? "border-foreground/30 text-foreground"
							: "border-muted-foreground/30 text-muted-foreground italic",
					)}
				>
					{shownFeedback}
				</blockquote>
			)}
			{errorLabel !== null && (
				<p className="text-sm text-warn" role="status">
					{errorLabel}
				</p>
			)}
			{draft.publishedAt !== null && (
				<p className="text-muted-foreground text-xs">
					Đã trả bài {fmtWhen(draft.publishedAt)}
				</p>
			)}
		</Card>
	);
}
