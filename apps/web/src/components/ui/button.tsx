import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "default" | "sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: Size;
	children?: ReactNode;
	/** React 19 ref-as-prop (imperative focus, e.g. modal focus traps). */
	ref?: Ref<HTMLButtonElement>;
}

const variantClasses: Record<Variant, string> = {
	// Primary is ink, not accent: hover flips to hot (design `Btn solid`).
	primary:
		"bg-fg text-bg hover:bg-hot hover:text-accent-on active:bg-accent-active",
	secondary: "neu-sm text-fg",
	ghost: "bg-transparent text-fg hover:text-hot px-2",
	// Red is reserved for destructive actions (delete/cancel permanently).
	danger:
		"bg-transparent text-destructive border border-destructive/40 hover:bg-destructive/10",
};

export function Button({
	variant = "primary",
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
			className={cn(
				"inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-transparent px-[18px] py-[9px] font-medium text-sm tracking-[-0.003em] transition-[transform,background-color,border-color,color] duration-[150ms] ease-[cubic-bezier(0.28,0,0.22,1)]",
				"focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.97]",
				"disabled:pointer-events-none disabled:opacity-40",
				size === "sm" && "px-[14px] py-[6px] text-xs",
				variantClasses[variant],
				className,
			)}
			{...props}
		/>
	);
}
