import { FileText } from "lucide-react";

/**
 * Badge đếm tài liệu ngân hàng của một bài học (#655), đặt cạnh dòng
 * materials tự do trên cây giáo trình. `aria-hidden` theo convention
 * chip-filter: số đếm không vào accessible name/e2e lookup — dữ liệu thật
 * xem được qua nút Sửa của bài.
 */
export function LessonBankMaterialsBadge({ count }: { count: number }) {
	if (count <= 0) return null;
	return (
		<span
			aria-hidden="true"
			className="ml-1.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full bg-muted px-2 py-0.5 align-middle text-[11px] text-muted-foreground tabular-nums"
		>
			<FileText aria-hidden="true" className="size-3" />
			{count}
		</span>
	);
}
