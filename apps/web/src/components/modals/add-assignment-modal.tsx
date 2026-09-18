import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export interface AddAssignmentModalProps {
	open: boolean;
	onClose: () => void;
	onNavigateClasses?: () => void;
	onNavigateStudents?: () => void;
}

export function AddAssignmentModal({
	open,
	onClose,
	onNavigateClasses,
	onNavigateStudents,
}: AddAssignmentModalProps) {
	const navigate = useNavigate();

	const handleNavigateClasses = () => {
		onClose();
		if (onNavigateClasses) {
			onNavigateClasses();
		} else {
			navigate({ to: "/classes" });
		}
	};

	const handleNavigateStudents = () => {
		onClose();
		if (onNavigateStudents) {
			onNavigateStudents();
		} else {
			navigate({ to: "/students" });
		}
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Tạo bài tập"
			footer={
				<>
					<Button variant="secondary" onClick={onClose}>
						Đóng
					</Button>
					<Button onClick={handleNavigateClasses}>Đến trang Lớp học</Button>
				</>
			}
		>
			<div className="space-y-3 text-sm">
				<p className="text-fg">
					Tính năng giao bài tập trực tiếp đang được hoàn thiện. Bài tập hiện
					được quản lý và đồng bộ thông qua các buổi học của Lớp học hoặc gắn
					với từng Học viên.
				</p>
				<p className="text-muted-fg">
					Bạn có thể chuyển tới trang Lớp học hoặc Học viên để chuẩn bị
					workspace:
				</p>
				<div className="flex flex-col gap-2 pt-1">
					<Button
						variant="secondary"
						onClick={handleNavigateStudents}
						className="justify-start text-left"
					>
						→ Quản lý danh sách học viên
					</Button>
					<Button
						variant="secondary"
						onClick={handleNavigateClasses}
						className="justify-start text-left"
					>
						→ Quản lý danh sách lớp học
					</Button>
				</div>
			</div>
		</Modal>
	);
}
