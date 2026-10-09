import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "accent" | "success" | "warn" | "danger" | "muted";

// Status language is monochrome + orange (design TuitionBadge):
// success = filled chip, accent = solid ink outline, warn = dashed mute
// outline, danger (overdue/error) = filled hot, muted = sunk fill.
const variantClasses: Record<Variant, string> = {
	success: "bg-chip text-fg",
	accent: "border border-fg text-fg",
	warn: "border border-dashed border-meta text-meta",
	danger: "bg-hot font-bold text-accent-on",
	muted: "neu-in text-fg",
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
				"inline-flex items-center gap-[5px] rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest",
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
