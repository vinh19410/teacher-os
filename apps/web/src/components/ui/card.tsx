import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Card v2 (design `Card`): khối phẳng border + shadow nhẹ trên nền card.
 * `variant` giữ lại cho call site cũ ("white" từng là card nền trang) —
 * ở v2 mọi card cùng một lớp nền nên variant không còn khác biệt.
 */
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
				"flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm",
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
	/** Dòng phụ dưới số (design `Stat sub`). */
	sub?: string;
	/** Thẻ cần chú ý: số đỏ text-destructive (design `Stat hot`). */
	hot?: boolean;
	className?: string;
}

export function StatCard({ num, label, sub, hot, className }: StatCardProps) {
	return (
		<div
			className={cn(
				"rounded-xl border bg-card p-5 text-card-foreground shadow-sm",
				className,
			)}
		>
			{/* Thứ tự DOM (số trước, nhãn sau) giữ từ design cũ — unit test
			và e2e phụ thuộc. */}
			<div
				className={cn(
					"break-words font-semibold text-2xl tabular-nums tracking-tight",
					hot && "text-destructive",
				)}
			>
				{num}
			</div>
			<div className="text-muted-foreground text-sm">{label}</div>
			{sub && <div className="mt-1 text-muted-foreground text-xs">{sub}</div>}
		</div>
	);
}
