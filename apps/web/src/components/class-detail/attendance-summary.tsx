import type { SessionAttendanceTally } from "@/lib/class-sessions";
import { cn } from "@/lib/cn";

/** Thanh điểm danh của card buổi học (#391): 3 phân đoạn — "đã điểm danh"
 * (success) / "vắng" (destructive, chỉ khi có absent) / "chưa điểm danh"
 * (muted). Thiết kế gốc 3 màu present/late/absent; kernel không có trạng
 * thái "đi muộn" nên phân đoạn late không dựng (lệch có chủ đích, ghi
 * `DESIGN.md`). `absent` là dữ liệu thật (row dated v2) nên đếm là ĐÃ điểm
 * danh, không ghép vào "chưa". */
export function AttendanceSummary({
	tally,
	total,
}: {
	tally: SessionAttendanceTally;
	total: number;
}) {
	const { marked, absent, unmarked } = tally;
	const done = marked + absent;
	const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
	const complete = total > 0 && unmarked === 0;
	return (
		<div className="w-28 shrink-0 text-right">
			<div
				className="flex h-1.5 overflow-hidden rounded-full bg-muted"
				title={`${marked}/${total} đã điểm danh${absent > 0 ? ` · ${absent} vắng` : ""}`}
			>
				<span
					className="h-full bg-success"
					style={{ width: `${pct(marked)}%` }}
				/>
				{absent > 0 && (
					<span
						className="h-full bg-destructive"
						style={{ width: `${pct(absent)}%` }}
					/>
				)}
			</div>
			<div className="mt-1 font-medium text-muted-foreground text-xs tabular-nums">
				<span className={cn(complete ? "text-success" : "text-foreground")}>
					{done}/{total}
				</span>{" "}
				đã điểm danh
				{absent > 0 && (
					<span className="text-destructive"> · {absent} vắng</span>
				)}
			</div>
		</div>
	);
}
