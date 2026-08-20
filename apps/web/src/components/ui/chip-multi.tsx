import { cn } from "@/lib/cn";

export interface ChipMultiOption<T extends string | number> {
	value: T;
	label: string;
}

export interface ChipMultiProps<T extends string | number> {
	options: ChipMultiOption<T>[];
	value: T[];
	onChange: (next: T[]) => void;
	className?: string;
}

/**
 * Multi-select chips. Unlike ChipFilter (label = value), each option carries
 * a wire value distinct from its display label, so payloads never send the
 * Vietnamese display string where an enum id is expected.
 */
export function ChipMulti<T extends string | number>({
	options,
	value,
	onChange,
	className,
}: ChipMultiProps<T>) {
	function toggle(option: ChipMultiOption<T>) {
		onChange(
			value.includes(option.value)
				? value.filter((v) => v !== option.value)
				: [...value, option.value],
		);
	}

	return (
		<div className={cn("flex flex-wrap gap-2", className)}>
			{options.map((option) => (
				<button
					type="button"
					key={String(option.value)}
					aria-pressed={value.includes(option.value)}
					onClick={() => toggle(option)}
					className={cn(
						"rounded-full border px-[14px] py-[6px] font-medium text-xs transition-all duration-[150ms] ease-[cubic-bezier(0.28,0,0.22,1)]",
						"focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
						value.includes(option.value)
							? "border-fg bg-fg text-bg"
							: "border-line bg-bg text-fg-2 hover:border-fg",
					)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}
