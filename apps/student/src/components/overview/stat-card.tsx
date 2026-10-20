import { cn } from "@/lib/cn";

/**
 * Stat card của design-v2 (Dashboard học viên): nhãn mono uppercase, số lớn
 * extrabold, dòng chú thích nhỏ. `hot` = nền mực đảo, số cam (số cần chú ý
 * như còn nợ học phí).
 */
export function StatCard({
	label,
	value,
	sub,
	hot = false,
	className,
}: {
	label: string;
	value: string;
	sub?: string;
	hot?: boolean;
	className?: string;
}) {
	return (
		<div className={cn("rounded-lg p-4", hot ? "bg-fg" : "neu", className)}>
			<div className="font-mono text-[10px] text-meta uppercase tracking-[0.18em]">
				{label}
			</div>
			<div
				className={cn(
					"mt-2 font-display font-extrabold text-2xl leading-none tracking-[-0.02em]",
					hot ? "text-hot" : "text-fg",
				)}
			>
				{value}
			</div>
			{sub && (
				<div
					className={cn(
						"mt-1.5 text-[12px]",
						hot ? "text-accent-on/80" : "text-meta",
					)}
				>
					{sub}
				</div>
			)}
		</div>
	);
}
