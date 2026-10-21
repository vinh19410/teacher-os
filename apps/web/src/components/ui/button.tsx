import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";

/**
 * Variant v2 (design `Btn`): default|outline|secondary|ghost|destructive|link.
 * Alias v1 giữ nguyên call site cũ: primary→default, secondary→outline,
 * danger→destructive.
 */
type Variant =
	| "default"
	| "outline"
	| "secondary"
	| "ghost"
	| "destructive"
	| "link"
	// Alias v1
	| "primary"
	| "danger";
type Size = "default" | "sm" | "icon" | "icon-sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: Size;
	children?: ReactNode;
	/** React 19 ref-as-prop (imperative focus, e.g. modal focus traps). */
	ref?: Ref<HTMLButtonElement>;
}

const variantClasses: Record<Variant, string> = {
	default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
	primary: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
	destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90",
	danger: "bg-destructive text-white shadow-xs hover:bg-destructive/90",
	outline:
		"border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
	secondary:
		"bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
	ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
	link: "text-primary underline-offset-4 hover:underline",
};

const sizeClasses: Record<Size, string> = {
	default: "h-9 px-4 py-2",
	sm: "h-8 gap-1.5 px-3",
	icon: "size-9",
	"icon-sm": "size-8",
};

export function Button({
	variant = "default",
	size = "default",
	className,
	type = "button",
	ref,
	...props
}: ButtonProps) {
	return (
		<button
			type={type}
			ref={ref}
			className={buttonVariants({ variant, size, className })}
			{...props}
		/>
	);
}

/** Lớp nút dùng ngoài `<button>` (vd: `Link` ghost back-link, #391). */
export function buttonVariants({
	variant = "default",
	size = "default",
	className,
}: {
	variant?: Variant;
	size?: Size;
	className?: string;
} = {}) {
	return cn(
		"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
		variantClasses[variant],
		sizeClasses[size],
		className,
	);
}
