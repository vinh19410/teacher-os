import { cn } from "@/lib/cn";

/** Thanh điểm danh 2 phân đoạn của card buổi học (#391): "đã điểm danh"
 * (success) / "chưa điểm danh" (muted). Thiết kế gốc 3 màu present/late/
 * absent — app không có data "đi muộn" tin được nên gộp còn 2 (lệch có chủ
 * đích, ghi `DESIGN.md`). Nhãn phản ánh đúng hành vi ghi dữ liệu: trạng thái
 * đối tượng là "đã điểm danh", không suy ra vắng mặt. */
export function AttendanceSummary({
	marked,
	total,
}: {
	marked: number;
	total: number;
}) {
	const pct = total > 0 ? Math.round((marked / total) * 100) : 0;
	const complete = total > 0 && marked >= total;
	return (
		<div className="w-28 shrink-0 text-right">
			<div
				className="flex h-1.5 overflow-hidden rounded-full bg-muted"
				title={`${marked}/${total} đã điểm danh`}
			>
				<span
					className={cn("h-full", complete ? "bg-success" : "bg-warn")}
					style={{ width: `${pct}%` }}
				/>
			</div>
			<div className="mt-1 font-medium text-muted-foreground text-xs tabular-nums">
				<span className={cn(complete ? "text-success" : "text-foreground")}>
					{marked}/{total}
				</span>{" "}
				đã điểm danh
			</div>
		</div>
	);
}
