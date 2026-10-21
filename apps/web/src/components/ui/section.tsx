import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SectionProps {
	title: ReactNode;
	/** Badge đếm cạnh tiêu đề (design `Section count`). */
	count?: number;
	/** Action góc phải header (nút phụ). */
	action?: ReactNode;
	children: ReactNode;
	className?: string;
}

/** Section v2 (design `Section`): card `rounded-xl border bg-card p-5
 * shadow-sm` với header tiêu đề + badge đếm + action (#391). */
export function Section({
	title,
	count,
	action,
	children,
	className,
}: SectionProps) {
	return (
		<section
			className={cn(
				"rounded-xl border bg-card p-5 text-card-foreground shadow-sm",
				className,
			)}
		>
			<div className="mb-4 flex items-center justify-between gap-4">
				<h2 className="flex items-center gap-2 font-semibold">
					{title}
					{count !== undefined && (
						<span className="rounded-full bg-muted px-2 font-medium text-muted-foreground text-xs tabular-nums">
							{count}
						</span>
					)}
				</h2>
				{action}
			</div>
			{children}
		</section>
	);
}
