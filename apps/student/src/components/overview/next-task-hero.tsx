import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { ArrowRight, Check, Layers, School } from "lucide-react";
import { cn } from "@/lib/cn";
import type { NextTaskHeroData } from "@/lib/student-overview-selectors";

export interface NextTaskHeroProps {
	data: NextTaskHeroData;
	vocabDueCount: number;
}

export function NextTaskHero({ data, vocabDueCount }: NextTaskHeroProps) {
	const { primary, queue, totalPending } = data;

	if (!primary) {
		return (
			<section
				aria-labelledby="next-task-heading"
				className="flex flex-col justify-between gap-5 rounded-xl border bg-card p-5 shadow-sm md:p-6"
			>
				<div className="space-y-3">
					<div
						aria-hidden="true"
						className="flex size-10 items-center justify-center rounded-full bg-muted text-success"
					>
						<Check className="size-5" />
					</div>
					<div className="space-y-1.5">
						<h2
							id="next-task-heading"
							className="font-semibold text-foreground text-xl tracking-tight"
						>
							Hoàn thành bài giao
						</h2>
						<p className="max-w-[54ch] text-muted-foreground text-sm leading-relaxed">
							{vocabDueCount > 0 ? (
								<>
									Bạn đã nộp hết bài giáo viên giao. Hiện có{" "}
									<strong className="font-semibold text-foreground">
										{vocabDueCount} từ vựng đến hạn ôn
									</strong>{" "}
									— tranh thủ ôn nhanh vài phút nhé.
								</>
							) : (
								"Bạn đã nộp hết bài giáo viên giao. Có thể tranh thủ ôn thêm từ vựng hoặc xem lại kết quả các bài đã chấm."
							)}
						</p>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<Link
						to="/practice/vocabulary"
						className={cn(
							buttonVariants({ variant: "outline", size: "default" }),
							"min-h-10 w-full focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0 sm:w-auto",
						)}
					>
						<span>Ôn từ vựng</span>
						<ArrowRight aria-hidden="true" className="size-4" />
					</Link>
				</div>
			</section>
		);
	}

	const statusFlag =
		primary.derived.status === "overdue"
			? { label: "Quá hạn", toneClass: "text-destructive" }
			: primary.derived.status === "due-soon"
				? { label: "Sắp đến hạn", toneClass: "text-warn" }
				: null;

	const remainingToneClass =
		primary.remaining?.tone === "destructive"
			? "font-medium text-destructive"
			: primary.remaining?.tone === "warn"
				? "font-medium text-warn"
				: "text-muted-foreground";

	return (
		<section
			aria-labelledby="next-task-heading"
			className="flex flex-col justify-between gap-5 rounded-xl border bg-card p-5 shadow-sm md:p-6"
		>
			<div className="space-y-5">
				<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
					<div className="flex flex-wrap items-center gap-2.5">
						<h2
							id="next-task-heading"
							className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.04em]"
						>
							Việc tiếp theo
						</h2>
						{statusFlag ? (
							<span
								className={cn(
									"inline-flex items-center gap-1.5 font-semibold text-xs uppercase tracking-[0.04em]",
									statusFlag.toneClass,
								)}
							>
								<span
									aria-hidden="true"
									className="size-2 shrink-0 rounded-full bg-current"
								/>
								{statusFlag.label}
							</span>
						) : null}
					</div>
					<span className="font-mono text-muted-foreground text-sm tabular-nums">
						{totalPending} bài cần làm
					</span>
				</div>

				<div className="space-y-2.5">
					<p className="break-words font-semibold text-foreground text-xl leading-snug tracking-tight">
						{primary.assignment.title}
					</p>

					{(primary.assignment.className || primary.skillLabel) && (
						<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-sm">
							{primary.assignment.className ? (
								<span className="inline-flex min-w-0 items-center gap-1.5">
									<School aria-hidden="true" className="size-4 shrink-0" />
									<span className="truncate">
										{primary.assignment.className}
									</span>
								</span>
							) : null}
							{primary.skillLabel ? (
								<span className="inline-flex items-center gap-1.5">
									<Layers aria-hidden="true" className="size-4 shrink-0" />
									<span>{primary.skillLabel}</span>
								</span>
							) : null}
						</div>
					)}

					<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
						<span className="font-semibold text-foreground text-sm">
							{primary.dueLabel}
						</span>
						{primary.remaining ? (
							<span className={cn("text-sm", remainingToneClass)}>
								{primary.remaining.label}
							</span>
						) : null}
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<Link
						to="/learn/quizzes/$assignmentId"
						params={{ assignmentId: primary.assignment.id }}
						className={cn(
							buttonVariants({ variant: "default", size: "lg" }),
							"min-h-11 w-full text-base focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0 sm:w-auto",
						)}
					>
						<span>Làm bài</span>
						<ArrowRight aria-hidden="true" className="size-4" />
					</Link>
					<a
						href="#assignments"
						className="inline-flex min-h-9 items-center rounded-md px-1 font-medium text-foreground text-sm underline-offset-4 hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
					>
						Xem tất cả bài tập
					</a>
				</div>
			</div>

			{queue.length > 0 ? (
				<div className="space-y-2 border-border border-t pt-4">
					<p className="font-medium text-muted-foreground text-xs">Tiếp theo</p>
					<ul className="space-y-1.5">
						{queue.map((item) => (
							<li key={item.assignment.id}>
								<p className="flex items-baseline justify-between gap-4 text-sm">
									<span className="min-w-0 flex-1 truncate text-foreground">
										{item.assignment.title}
									</span>
									<span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
										{item.queueDueLabel}
									</span>
								</p>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</section>
	);
}
