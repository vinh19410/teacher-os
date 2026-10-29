import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

const variantClasses: Record<BadgeVariant, string> = {
	default: "border-transparent bg-primary text-primary-foreground",
	secondary: "border-transparent bg-secondary text-secondary-foreground",
	outline: "text-foreground",
	destructive: "border-transparent bg-destructive text-white",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
	variant?: BadgeVariant;
	dot?: boolean;
	className?: string;
	children: ReactNode;
}

/**
 * Badge v2 (design `Badge`): `default | secondary | outline | destructive`.
 */
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
