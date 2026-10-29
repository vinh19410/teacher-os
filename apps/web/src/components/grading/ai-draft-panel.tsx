import {
	AI_GRADING_E004_MESSAGE,
	AI_GRADING_ERROR_CODES,
	AI_GRADING_ERROR_MESSAGES,
	type AiGradingDraftView,
	isAiGradingRetryableError,
} from "@teacher-os/api/contracts";
import {
	criteriaForSkill,
	criterionLabel,
	type GradableSkill,
} from "@teacher-os/api/lib/ielts-band";
import { useState } from "react";
import { fmtWhen } from "@/components/assignments/assignment-status";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
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

/** Nhãn chế độ "Bản nháp chấm nhanh" (TOS-32 D5) — tái dùng ở panel [7] và hàng chờ /grading. */
export const AI_QUICK_GRADE_LABEL = "Bản nháp chấm nhanh";

export function AiQuickGradeBadge({ className }: { className?: string }) {
	return (
		<Badge
			variant="secondary"
			data-testid="ai-quick-grade-badge"
			className={className}
		>
			{AI_QUICK_GRADE_LABEL}
		</Badge>
	);
}

/** Nhãn lỗi pipeline (error_code → chữ cho giáo viên). */
export function aiDraftErrorLabel(errorCode: string | null): string | null {
	switch (errorCode) {
		case AI_GRADING_ERROR_CODES.INSUFFICIENT_CREDITS:
			return AI_GRADING_ERROR_MESSAGES[
				AI_GRADING_ERROR_CODES.INSUFFICIENT_CREDITS
			];
		case AI_GRADING_ERROR_CODES.QUOTA_EXHAUSTED:
			return AI_GRADING_ERROR_MESSAGES[AI_GRADING_ERROR_CODES.QUOTA_EXHAUSTED];
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
export const AI_RETRY_FORBIDDEN_TOOLTIP =
	"Chỉ Giáo viên đứng lớp được chấm lại AI";

export function AiDraftPanel({
	draft,
	skill,
	part,
	canRetry = true,
	retrying = false,
	onRetry,
	topUpHref,
}: {
	draft: AiGradingDraftView;
	skill: GradableSkill;
	part: string;
	/** TOS-33 D3: chỉ vai `canPublishGrade` được bấm retry (tiêu Credit);
	 * TA vẫn thấy panel E-004 nhưng nút disabled kèm tooltip. */
	canRetry?: boolean;
	retrying?: boolean;
	onRetry?(): void;
	/** Cấu hình link màn Top-up [10] khi TOS-43 hoàn tất; mặc định mở hộp thoại hướng dẫn. */
	topUpHref?: string;
}) {
	const [topUpOpen, setTopUpOpen] = useState(false);
	const keys = criteriaForSkill(skill);
	const scores = draft.reviewedScores ?? draft.aiScores;
	const hasScores = keys.every((key) => scores?.[key] !== undefined);
	const errorLabel =
		draft.status === "manual_pending"
			? aiDraftErrorLabel(draft.errorCode)
			: null;
	// TOS-33 D2/D3: `manual_pending` với TIMEOUT/FAILED (đã hoàn 100% Credit
	// sau 2 lần tự thử lại) → thông điệp E-004 + nút "Thử chấm lại AI".
	// Giữ nút ở trạng thái disabled khi đang `ai_processing` sau khi bấm.
	const showE004Retry =
		(draft.status === "manual_pending" &&
			isAiGradingRetryableError(draft.errorCode)) ||
		(draft.status === "ai_processing" && retrying);
	const retryDisabled =
		!canRetry || retrying || draft.status === "ai_processing";
	const isCreditExhausted =
		draft.status === "manual_pending" &&
		(draft.errorCode === AI_GRADING_ERROR_CODES.INSUFFICIENT_CREDITS ||
			draft.errorCode === AI_GRADING_ERROR_CODES.QUOTA_EXHAUSTED);
	// Nháp rà của giáo viên ưu tiên; chưa có thì hiển thị nhận xét AI (italic).
	const reviewed = draft.reviewedFeedback.length > 0;
	const shownFeedback = reviewed ? draft.reviewedFeedback : draft.aiFeedback;

	return (
		<Card
			data-testid="ai-draft-panel"
			className="flex flex-col gap-4 self-start p-6"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<SectionLabel>Gợi ý từ AI</SectionLabel>
				<div className="flex flex-wrap items-center gap-1.5">
					{draft.gradingMode === "quick" && <AiQuickGradeBadge />}
					<AiDraftStatusBadge status={draft.status} />
				</div>
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
				<div
					data-testid={
						isCreditExhausted ? "ai-credit-exhausted-banner" : undefined
					}
					className="flex flex-col items-start gap-2"
				>
					<p className="text-sm text-warn" role="status">
						{errorLabel}
					</p>
					{isCreditExhausted &&
						(topUpHref ? (
							<a
								href={topUpHref}
								data-testid="ai-topup-credit-action"
								className={buttonVariants({ variant: "outline", size: "sm" })}
							>
								Nạp thêm Credit
							</a>
						) : (
							<Button
								type="button"
								variant="outline"
								size="sm"
								data-testid="ai-topup-credit-action"
								onClick={() => setTopUpOpen(true)}
							>
								Nạp thêm Credit
							</Button>
						))}
				</div>
			)}
			{isCreditExhausted && !topUpHref && (
				<Modal
					open={topUpOpen}
					onClose={() => setTopUpOpen(false)}
					title="Nạp thêm Credit AI"
					footer={
						<Button
							type="button"
							variant="outline"
							onClick={() => setTopUpOpen(false)}
							data-testid="ai-topup-modal-close"
						>
							Đóng
						</Button>
					}
				>
					<p className="text-sm">
						Vui lòng liên hệ Chủ trung tâm hoặc bộ phận quản trị để nạp thêm gói
						100 Credit (149.000đ) hoặc gia hạn gói thuê bao tháng. Trong lúc chờ
						nạp thêm Credit, bạn vẫn có thể chấm bài thủ công bình thường ở
						khung bên phải.
					</p>
				</Modal>
			)}
			{showE004Retry && (
				<div
					data-testid="ai-draft-e004"
					role="alert"
					className="flex flex-col gap-3 rounded-md border border-warn/40 bg-warn/5 p-3 text-sm"
				>
					<p className="text-foreground">
						<span className="font-mono font-semibold text-warn text-xs">
							E-selfomy-alignment-004
						</span>{" "}
						· {AI_GRADING_E004_MESSAGE}
					</p>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							data-testid="ai-retry-button"
							disabled={retryDisabled}
							title={!canRetry ? AI_RETRY_FORBIDDEN_TOOLTIP : undefined}
							onClick={() => {
								if (retryDisabled) return;
								onRetry?.();
							}}
						>
							{retrying || draft.status === "ai_processing"
								? "Đang chấm lại AI…"
								: "Thử chấm lại AI"}
						</Button>
						{!canRetry && (
							<span className="text-muted-foreground text-xs">
								{AI_RETRY_FORBIDDEN_TOOLTIP}
							</span>
						)}
					</div>
				</div>
			)}
			{draft.publishedAt !== null && (
				<p className="text-muted-foreground text-xs">
					Đã trả bài {fmtWhen(draft.publishedAt)}
				</p>
			)}
		</Card>
	);
}
