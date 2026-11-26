import { fmtVND } from "@/lib/mock-data";

/**
 * Khối tổng quan "Toàn trung tâm" (cột phải dưới):
 * - Thống nhất phạm vi toàn org cho cả 3 chỉ số.
 * - Dòng "Còn phải thu" ẩn fail-closed khi `canAccessFinance !== true`.
 * - Chỉ hiển thị ghi chú "trong đó N học viên đến hạn" khi cả `outstanding > 0`
 *   lẫn `dueStudentsCount > 0` để tránh mâu thuẫn phạm vi (0đ + N học viên).
 */
export function OrgStatsSection({
	studentCount,
	ungradedCount,
	canAccessFinance,
	outstanding,
	dueStudentsCount,
}: {
	studentCount: number;
	ungradedCount: number;
	canAccessFinance: boolean;
	outstanding: number;
	dueStudentsCount?: number;
}) {
	const showDueHint =
		outstanding > 0 && dueStudentsCount !== undefined && dueStudentsCount > 0;

	return (
		<section aria-labelledby="dashboard-stats-title" className="min-w-0">
			<div className="mb-4 flex items-center justify-between gap-3">
				<h2
					id="dashboard-stats-title"
					className="font-semibold text-lg tracking-tight"
				>
					Toàn trung tâm
				</h2>
			</div>
			<dl className="divide-y divide-border rounded-xl border bg-card px-5 py-2 text-card-foreground shadow-sm">
				<div className="flex items-center justify-between gap-4 py-4">
					<dt className="text-muted-foreground text-sm">Tổng học viên</dt>
					<dd className="whitespace-nowrap font-mono font-semibold text-xl tabular-nums tracking-tight">
						{studentCount}
					</dd>
				</div>
				<div className="flex items-center justify-between gap-4 py-4">
					<dt className="text-muted-foreground text-sm">
						Bài tập chưa có điểm
					</dt>
					<dd className="whitespace-nowrap font-mono font-semibold text-xl tabular-nums tracking-tight">
						{ungradedCount}
					</dd>
				</div>
				{canAccessFinance && (
					<div className="flex items-center justify-between gap-4 py-4">
						<dt className="text-muted-foreground text-sm">
							Còn phải thu
							{showDueHint && (
								<span className="mt-0.5 block text-muted-foreground text-xs">
									{`trong đó ${dueStudentsCount} học viên đến hạn`}
								</span>
							)}
						</dt>
						<dd className="whitespace-nowrap font-mono font-semibold text-xl tabular-nums tracking-tight">
							{fmtVND(outstanding)}
						</dd>
					</div>
				)}
			</dl>
		</section>
	);
}
