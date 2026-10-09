import { cn } from "@/lib/cn";

type FillVariant = "default" | "low" | "warn";

export function Progress({
	value,
	variant = "default",
	className,
}: {
	value: number; // 0..100
	variant?: FillVariant;
	className?: string;
}) {
	const fillClass =
		variant === "low" ? "bg-danger" : variant === "warn" ? "bg-warn" : "bg-hot";
	return (
		<div
			className={cn("h-1.5 overflow-hidden rounded-full bg-surface", className)}
		>
			<div
				className={cn(
					"h-full rounded-full transition-[width] duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)]",
					fillClass,
				)}
				style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
			/>
		</div>
	);
}
