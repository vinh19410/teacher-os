import { Button } from "@teacher-os/ui/components/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Phân trang catalog luyện tập theo design-v2 (`Pager`): ẩn khi chỉ có 1
 * trang, Previous/Next disable ở biên. Điều hướng do caller quản URL.
 */
export function Pager({
	page,
	pages,
	onPage,
}: {
	page: number;
	pages: number;
	onPage: (page: number) => void;
}) {
	if (pages <= 1) return null;
	return (
		<nav
			aria-label="Phân trang đề luyện tập"
			className="mt-8 flex items-center justify-center gap-3 text-sm"
		>
			<Button
				variant="outline"
				size="sm"
				disabled={page <= 1}
				onClick={() => onPage(page - 1)}
			>
				<ChevronLeft />
				Trước
			</Button>
			<span className="text-muted-foreground tabular-nums">
				Trang {page} / {pages}
			</span>
			<Button
				variant="outline"
				size="sm"
				disabled={page >= pages}
				onClick={() => onPage(page + 1)}
			>
				Sau
				<ChevronRight />
			</Button>
		</nav>
	);
}
