import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
	variant?: "default" | "white";
	children: ReactNode;
}

export function Card({
	variant = "default",
	className,
	children,
	...props
}: CardProps) {
	return (
		<div
			className={cn(
				"neu rounded-lg p-6",
				// "white" sits directly on the page background: bg + border only,
				// one tier below the raised default card.
				variant === "white" && "bg-bg",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export interface StatCardProps {
	num: string;
	label: string;
	/** Supporting line under the number (design `Stat sub`). */
	sub?: string;
	/** Highlight tile: ink background, orange number (design `Stat hot`). */
	hot?: boolean;
	className?: string;
}

export function StatCard({ num, label, sub, hot, className }: StatCardProps) {
	return (
		<Card className={cn("p-5", hot && "border-fg bg-fg", className)}>
			{/* DOM order (number, then label) is kept from the previous design —
			unit tests and e2e depend on it. */}
			<div
				className={cn(
					"break-words font-display font-extrabold text-[clamp(1.75rem,2.6vw,3rem)] leading-[1.1] tracking-[-0.045em]",
					hot ? "text-hot" : "text-fg",
				)}
			>
				{num}
			</div>
			<div
				className={cn(
					"mt-1 font-mono text-[11px] uppercase tracking-[0.18em]",
					hot ? "text-fg" : "text-meta",
				)}
			>
				{label}
			</div>
			{sub && (
				<div className={cn("mt-1 text-xs", hot ? "text-fg" : "text-muted-fg")}>
					{sub}
				</div>
			)}
		</Card>
	);
}
