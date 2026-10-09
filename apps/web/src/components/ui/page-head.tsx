import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHead({
	kicker,
	title,
	lead,
	action,
	className,
}: {
	/** Short mono eyebrow above the title — a number or context, not prose. */
	kicker?: ReactNode;
	title: ReactNode;
	lead?: ReactNode;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"mb-6 flex flex-wrap items-end justify-between gap-4",
				className,
			)}
		>
			<div className="min-w-0">
				{kicker && (
					<div className="font-mono text-[11px] text-hot uppercase tracking-[0.2em]">
						{kicker}
					</div>
				)}
				<h1 className="mt-1 text-balance font-display font-extrabold text-[clamp(40px,6vw,72px)] leading-[0.95] tracking-[-0.045em]">
					{title}
				</h1>
				{lead && (
					<p className="mt-3 max-w-[60ch] text-base text-muted-fg">{lead}</p>
				)}
			</div>
			{action && (
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					{action}
				</div>
			)}
		</div>
	);
}
