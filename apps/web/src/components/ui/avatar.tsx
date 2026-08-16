import { cn } from "@/lib/cn";

type Size = "sm" | "md" | "lg";

const sizeClasses: Record<Size, string> = {
	sm: "w-8 h-8 text-[12px]",
	md: "w-10 h-10 text-[14px]",
	lg: "w-14 h-14 text-[18px]",
};

export function Avatar({
	text,
	size = "md",
	className,
}: {
	text: string;
	size?: Size;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-grid shrink-0 place-items-center rounded-full border border-line-soft bg-surface font-display font-semibold text-fg",
				sizeClasses[size],
				className,
			)}
		>
			{text}
		</span>
	);
}
