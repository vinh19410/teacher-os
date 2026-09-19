import { cn } from "@/lib/cn";

export interface ChipFilterProps {
	options: string[];
	value: string;
	onChange: (value: string) => void;
	className?: string;
}

export function ChipFilter({
	options,
	value,
	onChange,
	className,
}: ChipFilterProps) {
	return (
		<div className={cn("flex flex-wrap gap-2", className)}>
			{options.map((opt) => (
				<button
					type="button"
					key={opt}
					aria-pressed={opt === value}
					onClick={() => onChange(opt)}
					className={cn(
						"rounded-full border px-[14px] py-[6px] font-medium text-xs transition-all duration-[150ms] ease-[cubic-bezier(0.28,0,0.22,1)]",
						"focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
						opt === value
							? "border-fg bg-fg text-bg"
							: "border-line bg-bg text-fg-2 hover:border-fg",
					)}
				>
					{opt}
				</button>
			))}
		</div>
	);
}
