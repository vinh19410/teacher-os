import { cn } from "@/lib/cn";

export interface ChipFilterProps {
	options: string[];
	value: string;
	onChange: (value: string) => void;
	className?: string;
	/** Nhóm chip liên quan — đọc như "Phần thi Writing" trên screen reader. */
	ariaLabel?: string;
	/**
	 * label → số đề khớp nếu bấm chip đó. Badge là metadata bổ sung nên
	 * aria-hidden: accessible name giữ nguyên label (ổn định cho voice
	 * control và e2e selector `name` exact).
	 */
	counts?: Record<string, number>;
}

export function ChipFilter({
	options,
	value,
	onChange,
	className,
	ariaLabel,
	counts,
}: ChipFilterProps) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: role="group" + aria-label scopes chip sets for SR/e2e; fieldset/legend would force label API churn on all consumers
		<div
			role="group"
			aria-label={ariaLabel}
			className={cn("flex flex-wrap gap-2", className)}
		>
			{options.map((opt) => {
				const count = counts?.[opt];
				return (
					<button
						type="button"
						key={opt}
						aria-pressed={opt === value}
						onClick={() => onChange(opt)}
						className={cn(
							"neu-sm rounded-md px-[14px] py-[6px] font-medium text-xs transition-all duration-[150ms] ease-[cubic-bezier(0.28,0,0.22,1)]",
							"focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
							opt === value &&
								"border-transparent bg-surface font-medium text-hot",
						)}
					>
						{opt}
						{typeof count === "number" && (
							<span
								aria-hidden="true"
								className={cn(
									"ml-1.5 font-mono text-[10px] tabular-nums",
									opt === value ? "text-hot" : "text-meta",
								)}
							>
								{count}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
