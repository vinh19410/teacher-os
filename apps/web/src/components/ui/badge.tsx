import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Badge v2 (design `Badge`): default|secondary|outline|destructive.
 * Variant cũ giữ làm alias để không phải sửa call site một lúc:
 * accent→outline, success/warn→soft token (--success/--warn),
 * danger→destructive, muted→secondary nhạt.
 */
type Variant =
	| "default"
	| "secondary"
	| "outline"
	| "destructive"
	// Alias v1
	| "accent"
	| "success"
	| "warn"
	| "danger"
	| "muted";

const variantClasses: Record<Variant, string> = {
	default: "border-transparent bg-primary text-primary-foreground",
	secondary: "border-transparent bg-secondary text-secondary-foreground",
	outline: "text-foreground",
	destructive: "border-transparent bg-destructive text-white",
	accent: "text-foreground",
	success: "border-transparent bg-success/10 text-success",
	warn: "border-transparent bg-warn/10 text-warn",
	danger: "border-transparent bg-destructive text-white",
	muted: "border-transparent bg-muted text-muted-foreground",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
	variant?: Variant;
	dot?: boolean;
	className?: string;
	children: ReactNode;
}

export function Badge({
	variant = "secondary",
	dot = false,
	className,
	children,
	...rest
}: BadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 font-medium text-xs",
				variantClasses[variant],
				className,
			)}
			{...rest}
		>
			{dot && (
				<span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
			)}
			{children}
		</span>
	);
}

/** Trạng thái học phí (design `TuitionBadge`): chấm emerald/amber/muted,
 * quá hạn là badge destructive đặc. */
export type TuitionStatus = "paid" | "partial" | "unpaid" | "overdue";

const tuitionLabel: Record<TuitionStatus, string> = {
	paid: "Đã thu",
	partial: "Thu một phần",
	unpaid: "Chưa thu",
	overdue: "Quá hạn",
};

const tuitionDot: Record<Exclude<TuitionStatus, "overdue">, string> = {
	paid: "bg-success",
	partial: "bg-warn",
	unpaid: "bg-muted-foreground",
};

export function TuitionBadge({
	s,
	children,
	className,
}: {
	s: TuitionStatus;
	/** Ghi đè nhãn (mặc định theo trạng thái). */
	children?: ReactNode;
	className?: string;
}) {
	if (s === "overdue") {
		return (
			<Badge variant="destructive" className={className}>
				{children ?? tuitionLabel[s]}
			</Badge>
		);
	}
	return (
		<Badge variant="outline" className={className}>
			<span
				aria-hidden="true"
				className={cn("size-1.5 rounded-full", tuitionDot[s])}
			/>
			{children ?? tuitionLabel[s]}
		</Badge>
	);
}
