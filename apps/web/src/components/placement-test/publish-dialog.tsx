import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export interface PublishDialogProps {
	open: boolean;
	totalQuestions: number;
	vgCount: number;
	listeningCount: number;
	clipCount: number;
	nextVersion: number;
	publishing: boolean;
	onClose: () => void;
	onConfirm: () => void;
}

export function PublishDialog({
	open,
	totalQuestions,
	vgCount,
	listeningCount,
	clipCount,
	nextVersion,
	publishing,
	onClose,
	onConfirm,
}: PublishDialogProps) {
	return (
		<Modal
			open={open}
			onClose={onClose}
			title={`Xác nhận phát hành bộ đề (v${nextVersion})`}
			footer={
				<div className="flex justify-end gap-2">
					<Button variant="outline" disabled={publishing} onClick={onClose}>
						Hủy
					</Button>
					<Button
						variant="primary"
						disabled={publishing}
						onClick={onConfirm}
						data-testid="confirm-publish-btn"
					>
						{publishing ? "Đang phát hành..." : "Xác nhận phát hành"}
					</Button>
				</div>
			}
		>
			<div className="space-y-3 text-sm">
				<p className="text-foreground">
					Bộ đề mới sẽ có hiệu lực ngay lập tức trên trang{" "}
					<code className="font-mono text-xs">/kiem-tra-dau-vao/</code> mà không
					cần deploy lại:
				</p>
				<ul className="list-disc space-y-1 pl-5 text-muted-foreground">
					<li>
						Tổng cộng{" "}
						<strong className="text-foreground">
							{totalQuestions} câu hỏi
						</strong>{" "}
						(Phần 1: {vgCount} câu, Phần 2: {clipCount} đoạn nghe •{" "}
						{listeningCount} câu).
					</li>
					<li>
						Học viên đang làm dở phiên bản cũ khi tải lại trang sẽ được chuyển
						sang đề mới và phải làm lại từ đầu.
					</li>
				</ul>
			</div>
		</Modal>
	);
}
