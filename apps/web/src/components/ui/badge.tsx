import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "accent" | "success" | "warn" | "danger" | "muted";

const variantClasses: Record<Variant, string> = {
	accent: "bg-accent-soft text-accent-blue",
	success: "bg-success-soft text-success",
	warn: "bg-warn-soft text-warn",
	danger: "bg-danger-soft text-danger",
	muted: "bg-line-soft text-muted-fg",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
	variant?: Variant;
	dot?: boolean;
	className?: string;
	children: ReactNode;
}

export function Badge({
	variant = "accent",
	dot = false,
	className,
	children,
	...rest
}: BadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-[5px] rounded-full px-[10px] py-[3px] font-semibold text-[11px] tracking-[0.01em]",
				dot &&
					"before:h-1.5 before:w-1.5 before:rounded-full before:bg-current before:content-['']",
				variantClasses[variant],
				className,
			)}
			{...rest}
		>
			{children}
		</span>
	);
}
