import {
	PLACEMENT_AI_ERROR_CODES,
	type PlacementSubmissionDetail,
} from "@teacher-os/api/placement-test-contracts";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Thông báo tiếng Việt theo mã lỗi pipeline chấm AI. */
export function placementAiErrorMessage(code: string | null): string {
	switch (code) {
		case PLACEMENT_AI_ERROR_CODES.DISABLED:
			return "Chấm AI đang tắt trên máy chủ — vui lòng chấm tay.";
		case PLACEMENT_AI_ERROR_CODES.TIMEOUT:
			return "AI chấm quá thời gian chờ. Thử chấm lại hoặc chấm tay.";
		case PLACEMENT_AI_ERROR_CODES.NO_TRANSCRIPT:
			return "AI không chuyển được bài nói thành văn bản. Hãy nghe file và chấm Speaking tay.";
		case PLACEMENT_AI_ERROR_CODES.FAILED:
			return "AI chấm thất bại. Thử chấm lại hoặc chấm tay.";
		default:
			return "AI chấm gặp lỗi không xác định. Thử chấm lại hoặc chấm tay.";
	}
}

function formatDraftedAt(iso: string | null): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleString("vi-VN", {
		hour: "2-digit",
		minute: "2-digit",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
}

/**
 * Trạng thái chấm nháp AI trên panel chấm bài test đầu vào (#730).
 * - `none`: chỉ hiện nút "Chấm bằng AI" khi có bài để chấm (`hasAiSource`)
 *   và kết quả chưa chốt (bài upload bỏ ngang); còn lại giữ UI chấm tay.
 * - Kết quả đã chốt (`locked`) → ẩn nút chấm lại (server trả 409).
 * - `onApplyDraft`: nháp AI mới về khi giáo viên đã sửa form → nút áp dụng.
 */
export function PlacementAiStatusBanner({
	submission,
	retrying,
	onRetry,
	locked = false,
	hasAiSource = false,
	onApplyDraft,
}: {
	submission: Pick<
		PlacementSubmissionDetail,
		"aiStatus" | "aiErrorCode" | "aiDraftedAt"
	>;
	retrying: boolean;
	onRetry: () => void;
	locked?: boolean;
	hasAiSource?: boolean;
	onApplyDraft?: () => void;
}) {
	const retryButton = locked ? null : (
		<Button
			variant="outline"
			size="sm"
			disabled={retrying}
			aria-busy={retrying}
			onClick={onRetry}
			data-testid="placement-ai-retry-btn"
		>
			<RefreshCw className="size-3.5" />
			{retrying
				? "Đang gửi yêu cầu..."
				: submission.aiStatus === "none"
					? "Chấm bằng AI"
					: "Chấm lại bằng AI"}
		</Button>
	);
	const applyButton = onApplyDraft ? (
		<Button
			variant="primary"
			size="sm"
			onClick={onApplyDraft}
			data-testid="placement-ai-apply-draft-btn"
		>
			<Sparkles className="size-3.5" />
			Áp dụng nháp AI
		</Button>
	) : null;

	if (submission.aiStatus === "processing") {
		return (
			<div
				role="status"
				data-testid="placement-ai-status"
				data-ai-status="processing"
				className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-foreground text-xs"
			>
				<Loader2
					className="size-3.5 shrink-0 animate-spin"
					aria-hidden="true"
				/>
				AI đang chấm… Kết quả nháp sẽ tự hiện khi xong, bạn vẫn có thể chấm tay.
			</div>
		);
	}

	if (submission.aiStatus === "failed") {
		return (
			<div
				role="alert"
				data-testid="placement-ai-status"
				data-ai-status="failed"
				className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs"
			>
				<span className="min-w-0 flex-1">
					{placementAiErrorMessage(submission.aiErrorCode)}
				</span>
				{applyButton}
				{retryButton}
			</div>
		);
	}

	if (submission.aiStatus === "drafted") {
		const draftedAt = formatDraftedAt(submission.aiDraftedAt);
		return (
			<div
				data-testid="placement-ai-status"
				data-ai-status="drafted"
				className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-foreground text-xs"
			>
				<span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
					<Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
					<span>
						<strong className="font-semibold">
							Bản nháp AI — chưa gửi học viên
						</strong>
						{draftedAt && (
							<span className="text-muted-foreground"> · {draftedAt}</span>
						)}
						<span className="block text-muted-foreground">
							{applyButton
								? "Nháp AI mới đã về nhưng bạn đang sửa — bấm áp dụng để thay điểm và lỗi bằng nháp (giữ nhận xét của bạn)."
								: "Kiểm tra lại điểm và lỗi trước khi chốt kết quả."}
						</span>
					</span>
				</span>
				<span className="flex flex-wrap items-center gap-2">
					{applyButton}
					{retryButton}
				</span>
			</div>
		);
	}

	if (submission.aiStatus === "none" && hasAiSource && retryButton) {
		return (
			<div
				data-testid="placement-ai-status"
				data-ai-status="none"
				className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-xs"
			>
				<span className="min-w-0 flex-1">
					Bài chưa được AI chấm nháp. Bạn có thể chấm tay hoặc nhờ AI chấm.
				</span>
				{retryButton}
			</div>
		);
	}

	return null;
}
