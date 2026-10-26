import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export interface FillMissingConfirmProps {
	open: boolean;
	/** Số học viên chưa chọn trạng thái, hiển thị trong tiêu đề và mô tả. */
	count: number;
	/** Đang lưu: disable cả hai nút để chặn double-submit (red-team #6). */
	saving: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

/** Hộp xác nhận TOS-8 D2: bấm "Lưu điểm danh ca học" khi còn học viên trống
 * (ca chưa recorded). "Gán Có mặt và lưu" điền `present` cho các ô trống rồi
 * lưu; "Quay lại chỉnh" / Esc / đóng = giữ hành vi TOS-7 (viền vàng + focus
 * dòng thiếu đầu tiên — do caller xử lý sau khi modal đóng, vì cleanup focus
 * của `Modal` trả focus về nút lưu). */
export function FillMissingConfirm({
	open,
	count,
	saving,
	onConfirm,
	onCancel,
}: FillMissingConfirmProps) {
	return (
		<Modal
			open={open}
			onClose={onCancel}
			title={`Còn ${count} học viên chưa chọn trạng thái`}
			footer={
				<div className="flex flex-col gap-2 lg:flex-row lg:justify-end">
					<Button
						type="button"
						variant="outline"
						disabled={saving}
						onClick={onCancel}
						className="min-h-11 w-full lg:min-h-9 lg:w-auto"
					>
						Quay lại chỉnh
					</Button>
					<Button
						type="button"
						disabled={saving}
						onClick={onConfirm}
						className="min-h-11 w-full lg:min-h-9 lg:w-auto"
					>
						{saving ? "Đang lưu…" : "Gán Có mặt và lưu"}
					</Button>
				</div>
			}
		>
			<p className="text-muted-foreground text-sm">
				Gán Có mặt cho {count} học viên này rồi lưu điểm danh ca học?
			</p>
		</Modal>
	);
}
