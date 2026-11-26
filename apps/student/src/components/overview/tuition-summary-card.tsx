import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { cn } from "@/lib/cn";
import type { StudentTuitionSummary } from "@/lib/student-overview-selectors";

function fmtVnd(amount: number): string {
	return `${amount.toLocaleString("vi-VN")}đ`;
}

export interface TuitionSummaryCardProps {
	summary: StudentTuitionSummary | null;
	className?: string;
}

export function TuitionSummaryCard({
	summary,
	className,
}: TuitionSummaryCardProps) {
	if (summary === null) {
		return null;
	}

	return (
		<section
			id="tuition"
			aria-labelledby="tuition-heading"
			className={cn(
				"flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5 shadow-sm",
				className,
			)}
		>
			<div className="min-w-0 space-y-1">
				<h2
					id="tuition-heading"
					className="font-medium text-muted-foreground text-xs"
				>
					Học phí
				</h2>
				<p className="font-semibold text-base text-foreground">
					{summary.totalDue > 0 ? (
						<>
							<span className="font-mono tabular-nums">
								{fmtVnd(summary.totalDue)}
							</span>
							{summary.primaryInvoice.due ? (
								<span className="font-normal text-muted-foreground text-sm">
									{" "}
									đến hạn {summary.primaryInvoice.due}
								</span>
							) : null}
						</>
					) : (
						"Đã thanh toán đủ"
					)}
				</p>
				<p className="text-muted-foreground text-sm">{summary.subtitle}</p>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<Link
					to="/tuition/$invoiceId"
					params={{ invoiceId: summary.primaryInvoice.id }}
					aria-label={summary.primaryLinkAriaLabel}
					className={cn(
						buttonVariants({ variant: "outline", size: "sm" }),
						"focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0",
					)}
				>
					Xem hóa đơn
				</Link>
				{summary.totalInvoices > 1 ? (
					<Link
						to="/tuition"
						className={cn(
							buttonVariants({ variant: "ghost", size: "sm" }),
							"focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0",
						)}
					>
						Tất cả ({summary.totalInvoices})
					</Link>
				) : null}
			</div>
		</section>
	);
}
