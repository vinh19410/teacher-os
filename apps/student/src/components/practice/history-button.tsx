import { Button } from "@teacher-os/ui/components/button";
import { History as HistoryIcon } from "lucide-react";

/**
 * Nút "Lịch sử" ở header mỗi skill luyện tập theo design-v2
 * (`HistoryButton`): đếm số lượt đã làm. Phase 10 CHỈ giao component —
 * trang Lịch sử + query đếm thuộc phase 11 nên caller chưa mount.
 */
export function HistoryButton({
	count,
	onClick,
}: {
	count: number;
	onClick: () => void;
}) {
	return (
		<Button variant="outline" onClick={onClick} data-testid="history-button">
			<HistoryIcon />
			Lịch sử
			{count > 0 && (
				<span className="text-muted-foreground tabular-nums">({count})</span>
			)}
		</Button>
	);
}
