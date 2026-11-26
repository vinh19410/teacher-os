import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { StudentGoalSummary } from "@/lib/student-overview-selectors";

const IELTS_TICKS = ["4.0", "5.0", "6.0", "7.0", "8.0", "9.0"] as const;

export interface GoalProgressCardProps {
	summary: StudentGoalSummary;
	showPlacementHighlight: boolean;
	className?: string;
}

export function GoalProgressCard({
	summary,
	showPlacementHighlight,
	className,
}: GoalProgressCardProps) {
	if (!summary.hasGoalData) {
		return null;
	}

	const scale = summary.ieltsScale;

	return (
		<section
			aria-labelledby="goal-heading"
			className={cn(
				"space-y-6 rounded-xl border bg-card p-5 shadow-sm md:p-6",
				className,
			)}
		>
			<div className="flex flex-wrap items-baseline justify-between gap-3">
				<h2
					id="goal-heading"
					className="font-semibold text-foreground text-lg tracking-tight"
				>
					Tiến độ tới mục tiêu
				</h2>
				<span className="rounded-full bg-muted px-2.5 py-0.5 font-medium text-muted-foreground text-xs">
					{summary.examLabel}
				</span>
			</div>

			<dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
				{summary.stats.map((stat) => (
					<div key={stat.label} className="min-w-0 space-y-1">
						<dt className="text-muted-foreground text-xs">{stat.label}</dt>
						<dd className="min-w-0">
							<span
								className={
									stat.isNumeric
										? "block break-words font-mono font-semibold text-2xl text-foreground tabular-nums leading-tight tracking-tight sm:text-3xl"
										: "block break-words font-semibold text-foreground text-lg leading-snug tracking-tight"
								}
							>
								{stat.value}
							</span>
							<span className="mt-0.5 block text-muted-foreground text-xs">
								{stat.hint}
							</span>
						</dd>
					</div>
				))}
			</dl>

			{scale ? (
				<div className="space-y-2.5" role="img" aria-label={scale.ariaLabel}>
					<div aria-hidden="true" className="px-2">
						<div className="relative h-2 rounded-full bg-muted">
							{scale.currentPointPct != null ? (
								<>
									<div
										className="absolute inset-y-0 left-0 rounded-full bg-foreground"
										style={{ width: `${scale.currentPointPct}%` }}
									/>
									{scale.gapWidthPct > 0 ? (
										<div
											className="absolute inset-y-0 rounded-full bg-foreground/20"
											style={{
												left: `${scale.gapLeftPct}%`,
												width: `${scale.gapWidthPct}%`,
											}}
										/>
									) : null}
									<span
										className="absolute top-1/2 -mt-2 -ml-2 size-4 rounded-full bg-foreground ring-[3px] ring-card"
										style={{ left: `${scale.currentPointPct}%` }}
									/>
								</>
							) : scale.currentRangePct != null ? (
								<>
									<div
										className="absolute inset-y-0 rounded-full bg-foreground"
										style={{
											left: `${scale.currentRangePct[0]}%`,
											width: `${Math.max(4, scale.currentRangePct[1] - scale.currentRangePct[0])}%`,
										}}
									/>
									{scale.gapWidthPct > 0 ? (
										<div
											className="absolute inset-y-0 rounded-full bg-foreground/20"
											style={{
												left: `${scale.gapLeftPct}%`,
												width: `${scale.gapWidthPct}%`,
											}}
										/>
									) : null}
								</>
							) : null}
							<span
								className="absolute top-1/2 -mt-2 -ml-2 size-4 rounded-full border-[3px] border-foreground bg-card"
								style={{ left: `${scale.targetPointPct}%` }}
							/>
						</div>
					</div>

					<div
						aria-hidden="true"
						className="flex justify-between font-mono text-muted-foreground text-xs tabular-nums"
					>
						{IELTS_TICKS.map((tick) => (
							<span key={tick}>{tick}</span>
						))}
					</div>

					<div
						aria-hidden="true"
						className="flex flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground text-xs"
					>
						{scale.hasExactCurrent ? (
							<span className="inline-flex items-center gap-1.5">
								<span className="size-2.5 rounded-full bg-foreground" />
								Hiện tại
							</span>
						) : scale.hasRangeCurrent ? (
							<span className="inline-flex items-center gap-1.5">
								<span className="h-2 w-4 rounded-full bg-foreground" />
								Vùng tự đánh giá
							</span>
						) : null}
						<span className="inline-flex items-center gap-1.5">
							<span className="size-2.5 rounded-full border-2 border-foreground" />
							Mục tiêu
						</span>
					</div>
				</div>
			) : null}

			{showPlacementHighlight ? (
				<div
					data-testid="placement-highlight-banner"
					className="flex flex-col gap-3 rounded-lg bg-muted p-4 sm:flex-row sm:items-center sm:justify-between"
				>
					<p className="max-w-[62ch] text-muted-foreground text-sm leading-relaxed">
						Trình độ hiện tại là bạn tự đánh giá khi đăng ký. Làm{" "}
						<strong className="font-semibold text-foreground">
							bài kiểm tra đầu vào 5 kỹ năng
						</strong>{" "}
						(~40 phút) để giáo viên xếp lộ trình sát hơn.
					</p>
					<Link
						to="/placement-test"
						data-testid="placement-banner-cta"
						className={cn(
							buttonVariants({ variant: "default", size: "sm" }),
							"shrink-0 focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0",
						)}
					>
						<span>Làm bài test đầu vào</span>
						<ArrowRight aria-hidden="true" className="size-4" />
					</Link>
				</div>
			) : null}
		</section>
	);
}
