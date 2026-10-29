import { cn } from "@/lib/cn";

export interface StatProps {
	label: string;
	value: string;
	/** Dòng phụ dưới giá trị. */
	sub?: string;
	/** Giá trị cần chú ý → số đỏ text-destructive (design `Stat hot`). */
	hot?: boolean;
	className?: string;
}

/** Thẻ KPI v2 (design `Stat`): nhãn muted trên, số tabular-nums đậm dưới. */
export function Stat({ label, value, sub, hot, className }: StatProps) {
	return (
		<div
			className={cn(
				"rounded-xl border bg-card p-5 text-card-foreground shadow-sm",
				className,
			)}
		>
			{/* Thứ tự DOM: nhãn trước, số sau — khớp design `Stat`. */}
			<div className="text-muted-foreground text-sm">{label}</div>
			<div
				className={cn(
					"mt-1.5 break-words font-semibold text-2xl tabular-nums tracking-tight",
					hot && "text-destructive",
				)}
			>
				{value}
			</div>
			{sub && <div className="mt-1 text-muted-foreground text-xs">{sub}</div>}
		</div>
	);
}
