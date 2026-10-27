import { useId } from "react";

export interface ReviewConfirmationProps {
	reviewCount: number;
	confirmed: boolean;
	onConfirmedChange: (confirmed: boolean) => void;
	disabled?: boolean;
}

/**
 * Hộp kiểm xác nhận các câu gắn nhãn vàng "(!) Cần rà soát lại" (TOS-26 #472,
 * wireframe mục [11]). Chỉ hiển thị khi `reviewCount > 0`.
 */
export function ReviewConfirmation({
	reviewCount,
	confirmed,
	onConfirmedChange,
	disabled = false,
}: ReviewConfirmationProps) {
	const checkboxId = useId();
	if (reviewCount <= 0) return null;

	return (
		<div
			data-testid="review-confirmation"
			className="rounded-lg border border-warn bg-warn/10 p-3 text-sm"
		>
			<label
				htmlFor={checkboxId}
				className="flex cursor-pointer select-none items-start gap-2.5"
			>
				<input
					id={checkboxId}
					type="checkbox"
					data-testid="review-confirmation-checkbox"
					checked={confirmed}
					disabled={disabled}
					onChange={(e) => onConfirmedChange(e.target.checked)}
					className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
				/>
				<span className="leading-snug">
					Tôi đã kiểm tra và xác nhận các câu gắn nhãn Cần rà soát lại{" "}
					<span className="font-medium">({reviewCount} câu)</span>
				</span>
			</label>
		</div>
	);
}
