import { Button } from "@teacher-os/ui/components/web-kit/button";
import {
	ArrowDown,
	ArrowUp,
	ChevronDown,
	ChevronUp,
	Trash2,
} from "lucide-react";

/**
 * Bộ nút điều khiển dùng chung cho các thẻ (nhóm câu / hàng câu thu gọn) —
 * #424 phase-01 Task 1.4. Chỉ render nút có callback; caller quyết định có
 * hỏi xác nhận trước khi xóa hay không (nút ở đây KHÔNG tự confirm).
 */
export function CardControls({
	label,
	open = false,
	onToggle,
	onMoveUp,
	onMoveDown,
	onRemove,
	canMoveUp = true,
	canMoveDown = true,
}: {
	/** Nhãn lowercase của đối tượng ("câu 4", "nhóm câu 2") dùng trong aria-label. */
	label: string;
	open?: boolean;
	onToggle?: () => void;
	onMoveUp?: () => void;
	onMoveDown?: () => void;
	onRemove?: () => void;
	canMoveUp?: boolean;
	canMoveDown?: boolean;
}) {
	return (
		<div className="flex items-center gap-1">
			{onToggle && (
				<Button
					type="button"
					size="icon-sm"
					variant="ghost"
					aria-expanded={open}
					aria-label={open ? `Thu gọn ${label}` : `Mở ${label}`}
					onClick={onToggle}
				>
					{open ? (
						<ChevronUp size={16} aria-hidden="true" />
					) : (
						<ChevronDown size={16} aria-hidden="true" />
					)}
				</Button>
			)}
			{onMoveUp && canMoveUp && (
				<Button
					type="button"
					size="icon-sm"
					variant="ghost"
					aria-label={`Đưa ${label} lên`}
					onClick={onMoveUp}
				>
					<ArrowUp size={16} aria-hidden="true" />
				</Button>
			)}
			{onMoveDown && canMoveDown && (
				<Button
					type="button"
					size="icon-sm"
					variant="ghost"
					aria-label={`Đưa ${label} xuống`}
					onClick={onMoveDown}
				>
					<ArrowDown size={16} aria-hidden="true" />
				</Button>
			)}
			{onRemove && (
				<Button
					type="button"
					size="icon-sm"
					variant="ghost"
					aria-label={`Xóa ${label}`}
					className="text-destructive hover:text-destructive"
					onClick={onRemove}
				>
					<Trash2 size={16} aria-hidden="true" />
				</Button>
			)}
		</div>
	);
}
