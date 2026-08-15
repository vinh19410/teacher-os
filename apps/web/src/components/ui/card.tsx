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
				"rounded-lg border p-6",
				variant === "default"
					? "border-line-soft bg-surface-warm"
					: "border-line bg-bg",
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
	className?: string;
}

export function StatCard({ num, label, className }: StatCardProps) {
	return (
		<Card className={cn("p-5", className)}>
			<div className="font-display font-semibold text-[32px] leading-[1.1] tracking-[-0.02em]">
				{num}
			</div>
			<div className="mt-1 text-muted-fg text-xs">{label}</div>
		</Card>
	);
}
