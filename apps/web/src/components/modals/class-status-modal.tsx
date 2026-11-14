import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { ClassGroup } from "@/lib/mock-data";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

export interface ClassStatusModalProps {
	open: boolean;
	onClose: () => void;
	cls: ClassGroup;
}

export function ClassStatusModal({
	open,
	onClose,
	cls,
}: ClassStatusModalProps) {
	const submit = useKernelFormSubmit();
	const { reset } = submit;
	const isPaused = cls.status === "paused";
	const nextStatus = isPaused ? "active" : "paused";

	useEffect(() => {
		if (!open) reset();
	}, [open, reset]);

	function handleClose() {
		if (submit.saving) return;
		reset();
		onClose();
	}

	async function handleConfirm() {
		const res = await submit.run({
			type: "update-class-status",
			classId: cls.id,
			status: nextStatus,
		});
		if (res?.kind === "refreshed") {
			toast.success(isPaused ? "Đã mở lại lớp." : "Đã tạm dừng lớp.");
			reset();
			onClose();
		}
	}

	async function handleReconcile() {
		const ok = await submit.reconcile();
		if (ok) {
			reset();
			onClose();
		}
	}

	return (
		<Modal
			open={open}
			onClose={handleClose}
			title={isPaused ? `Mở lại lớp ${cls.name}` : `Tạm dừng lớp ${cls.name}`}
			footer={
				<>
					<Button
						type="button"
						variant="outline"
						onClick={handleClose}
						disabled={submit.saving}
					>
						Hủy
					</Button>
					<Button
						type="button"
						variant="default"
						onClick={() => {
							void handleConfirm();
						}}
						disabled={submit.saving || submit.submitBlocked}
					>
						{submit.saving
							? "Đang lưu…"
							: isPaused
								? "Xác nhận mở lại"
								: "Xác nhận tạm dừng"}
					</Button>
				</>
			}
		>
			<div className="space-y-3">
				<p className="text-muted-foreground text-sm leading-relaxed">
					{isPaused
						? "Lớp sẽ hoạt động trở lại bình thường trên lịch dạy, điểm danh và tuyển sinh."
						: "Lớp sẽ chuyển sang trạng thái Tạm dừng: học viên và lịch sử buổi học, điểm danh, học phí được giữ nguyên. Khi tạm dừng, lớp sẽ ẩn khỏi lịch dạy sắp tới và tạm khóa điểm danh, thêm học viên hoặc gửi lời mời mới. Bạn có thể mở lại lớp bất cứ lúc nào."}
				</p>
				{submit.error && (
					<p role="alert" className="text-danger text-sm">
						{submit.error}
					</p>
				)}
				{submit.notice && (
					<KernelSubmitNotice
						notice={submit.notice}
						onReconcile={() => {
							void handleReconcile();
						}}
						disabled={submit.saving}
					/>
				)}
			</div>
		</Modal>
	);
}
