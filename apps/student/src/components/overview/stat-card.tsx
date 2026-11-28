import { cn } from "@/lib/cn";

/**
 * Stat card của design-v2 (Dashboard học viên): thẻ sáng `bg-card` + `border`,
 * nhãn mono uppercase, số lớn extrabold. `hot` = số màu `--destructive`
 * (số cần chú ý như còn nợ học phí).
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
		<div
			className={cn(
				"rounded-xl border bg-card p-4 text-card-foreground shadow-sm",
				className,
			)}
		>
			<div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
				{label}
			</div>
			<div
				className={cn(
					"mt-2 font-extrabold text-2xl tabular-nums leading-none tracking-[-0.02em]",
					hot ? "text-destructive" : "text-foreground",
				)}
			>
				{value}
			</div>
			{sub && (
				<div className="mt-1.5 text-[12px] text-muted-foreground">{sub}</div>
			)}
		</div>
	);
}
