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
	/** View-only: khóa toàn bộ chip, giữ giá trị hiển thị (aria-pressed nguyên vẹn). */
	disabled?: boolean;
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
	disabled,
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
					disabled={disabled}
					onClick={() => toggle(option)}
					className={cn(
						"inline-flex items-center rounded-md border bg-background px-3 py-1.5 font-medium text-xs outline-none transition-[color,box-shadow] dark:bg-input/30",
						"focus-visible:ring-[3px] focus-visible:ring-ring/50",
						"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60",
						value.includes(option.value)
							? "border-transparent bg-secondary text-secondary-foreground"
							: "hover:bg-accent hover:text-accent-foreground",
					)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}
