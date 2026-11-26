import { AlertTriangle } from "lucide-react";
import type { RefObject } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type {
	DashboardRiskReason,
	DashboardRiskRow,
} from "@/lib/dashboard-from-kernel";

const RISK_LABEL: Record<DashboardRiskReason, string> = {
	"missed-check-in": "Chưa điểm danh",
	"overdue-assignment": "Bài tập trễ hạn",
};

/**
 * Danh sách học viên "Cần kiểm tra" (cột phải trên):
 * - Root `<section>` luôn mount `<h2>` (làm fallback focus khi hàng học viên
 *   biến mất sau refresh và giữ nguyên helper test `section("Cần kiểm tra")`).
 * - Responsive chống tràn 320px: hàng 1 hiển thị Avatar + Tên + Còn buổi;
 *   hàng 2 hiển thị dải badge cảnh báo full-width trên `< sm`, và ghép gọn vào
 *   cột giữa từ `sm:` trở lên.
 */
export function RiskStudentsSection({
	rows,
	onSelectStudent,
	headingRef,
}: {
	rows: readonly DashboardRiskRow[];
	onSelectStudent: (row: DashboardRiskRow, trigger: HTMLButtonElement) => void;
	headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
	return (
		<section aria-labelledby="dashboard-risk-title" className="min-w-0">
			<div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
				<h2
					id="dashboard-risk-title"
					ref={headingRef}
					tabIndex={-1}
					className="font-semibold text-lg tracking-tight outline-none"
				>
					Cần kiểm tra
				</h2>
				{rows.length > 0 && (
					<span className="text-muted-foreground text-sm tabular-nums">
						{`${rows.length} học viên`}
					</span>
				)}
			</div>

			{rows.length === 0 ? (
				<div className="rounded-xl border border-border border-dashed px-5 py-6 text-center text-muted-foreground text-sm">
					<strong className="mb-1 block font-medium text-foreground">
						Không có học viên cần kiểm tra.
					</strong>
					Học viên chưa điểm danh hoặc trễ bài sẽ hiện ở đây.
				</div>
			) : (
				<Card data-testid="dashboard-risk-card" className="min-w-0 p-2">
					<ul className="divide-y divide-border">
						{rows.map((row) => {
							const isLow =
								row.student.hasPackage && row.student.pkg.remaining <= 2;
							return (
								<li key={row.student.id}>
									<button
										type="button"
										aria-haspopup="dialog"
										onClick={(e) => onSelectStudent(row, e.currentTarget)}
										className="grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-lg p-3 text-left transition-colors hover:bg-muted focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
									>
										<Avatar
											text={row.student.avatar}
											size="sm"
											className="col-start-1 row-start-1 self-center sm:row-span-2"
										/>
										<span className="col-start-2 row-start-1 min-w-0 break-words font-medium text-sm [overflow-wrap:anywhere]">
											{row.student.name}
										</span>
										<span className="col-start-3 row-start-1 grid shrink-0 justify-items-end gap-0.5 text-right sm:row-span-2">
											{row.student.hasPackage ? (
												<>
													<span
														className={cn(
															"whitespace-nowrap font-medium text-sm tabular-nums",
															isLow && "text-warn",
														)}
													>
														{`còn ${row.student.pkg.remaining} buổi`}
													</span>
													{isLow && (
														<span className="whitespace-nowrap text-muted-foreground text-xs">
															sắp hết gói
														</span>
													)}
												</>
											) : (
												<span className="whitespace-nowrap font-normal text-muted-foreground text-sm">
													Chưa có gói
												</span>
											)}
										</span>
										<span className="col-span-3 row-start-2 flex flex-wrap gap-1 pt-0.5 sm:col-span-1 sm:col-start-2 sm:pt-0">
											{row.reasons.map((reason) => (
												<span
													key={reason}
													className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full border border-warn/35 px-2 font-medium text-warn text-xs"
												>
													<AlertTriangle
														className="size-3 shrink-0"
														aria-hidden="true"
													/>
													{RISK_LABEL[reason]}
												</span>
											))}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				</Card>
			)}
		</section>
	);
}
