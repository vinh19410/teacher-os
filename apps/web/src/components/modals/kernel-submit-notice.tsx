import { Button } from "@/components/ui/button";
import type { KernelFormNotice } from "@/lib/use-kernel-form-submit";

/**
 * Truthful submit outcome for kernel form modals: never a bare close.
 * `committed`/`unknown` keep the modal open with a reconcile affordance so a
 * possibly-saved write is never blindly replayed.
 */
export function KernelSubmitNotice({
	notice,
	onReconcile,
	disabled,
}: {
	notice: KernelFormNotice;
	onReconcile: () => void;
	disabled: boolean;
}) {
	if (notice.kind === "committed") {
		return (
			<div role="status" className="mb-3 flex items-center gap-3">
				<p className="flex-1 text-muted-foreground text-xs">
					Đã lưu trên máy chủ nhưng chưa tải lại được dữ liệu.
				</p>
				<Button
					variant="ghost"
					size="sm"
					onClick={onReconcile}
					disabled={disabled}
				>
					Tải lại
				</Button>
			</div>
		);
	}
	if (notice.kind === "unknown") {
		return (
			<div role="alert" className="mb-3 flex items-center gap-3">
				<p className="flex-1 text-danger text-xs">
					Không xác định được kết quả — dữ liệu có thể đã lưu. Tải lại để kiểm
					tra trước khi thử lại, tránh tạo trùng.
				</p>
				<Button
					variant="ghost"
					size="sm"
					onClick={onReconcile}
					disabled={disabled}
				>
					Tải lại &amp; kiểm tra
				</Button>
			</div>
		);
	}
	return (
		<div role="alert" className="mb-3 flex items-center gap-3">
			<p className="flex-1 text-danger text-xs">
				Không tải lại được dữ liệu — kiểm tra kết nối rồi tải lại.
			</p>
			<Button
				variant="ghost"
				size="sm"
				onClick={onReconcile}
				disabled={disabled}
			>
				Thử tải lại
			</Button>
		</div>
	);
}
