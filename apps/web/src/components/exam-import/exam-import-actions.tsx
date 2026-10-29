import { useId } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface ExamImportActionsProps {
	reviewCount: number;
	confirmed: boolean;
	savingDraft?: boolean;
	publishing?: boolean;
	onSaveDraft?: () => void;
	onPublish?: () => void;
	className?: string;
}

/**
 * Cụm 2 nút hành động của màn Nhập đề AI [6] (TOS-26 #472, wireframe [13] &
 * [14]):
 * - [13] "Lưu bản nháp" (0 Credit): luôn được phép khi không bận.
 * - [14] "Lưu vào Ngân hàng đề": bị khóa khi `reviewCount > 0 && !confirmed`,
 *   kèm `aria-describedby` giải thích lý do khóa.
 */
export function ExamImportActions({
	reviewCount,
	confirmed,
	savingDraft = false,
	publishing = false,
	onSaveDraft,
	onPublish,
	className,
}: ExamImportActionsProps) {
	const reasonId = useId();
	const needsConfirmation = reviewCount > 0 && !confirmed;
	const busy = savingDraft || publishing;
	const publishDisabled = needsConfirmation || busy;
	const lockReason = `Cần tích xác nhận ${reviewCount} câu gắn nhãn "(!) Cần rà soát lại" trước khi lưu vào Ngân hàng đề.`;

	return (
		<div
			data-testid="exam-import-actions"
			className={cn("space-y-2", className)}
		>
			<div className="flex flex-wrap items-center justify-end gap-2.5">
				<Button
					type="button"
					variant="outline"
					data-testid="save-draft-button"
					disabled={busy}
					onClick={onSaveDraft}
				>
					{savingDraft ? "Đang lưu nháp…" : "Lưu bản nháp"}
				</Button>
				<Button
					type="button"
					variant="primary"
					data-testid="publish-exam-button"
					disabled={publishDisabled}
					aria-describedby={needsConfirmation ? reasonId : undefined}
					title={needsConfirmation ? lockReason : undefined}
					onClick={onPublish}
				>
					{publishing ? "Đang xuất bản…" : "Lưu vào Ngân hàng đề"}
				</Button>
			</div>
			{needsConfirmation && (
				<p
					id={reasonId}
					data-testid="publish-disabled-reason"
					className="text-right text-muted-foreground text-xs"
				>
					{lockReason}
				</p>
			)}
		</div>
	);
}
