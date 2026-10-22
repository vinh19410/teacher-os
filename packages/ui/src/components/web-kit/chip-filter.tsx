import { cn } from "@teacher-os/ui/lib/utils";

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
							"inline-flex items-center rounded-md border bg-background px-3 py-1.5 font-medium text-xs outline-none transition-[color,box-shadow] dark:bg-input/30",
							"focus-visible:ring-[3px] focus-visible:ring-ring/50",
							opt === value
								? "border-transparent bg-secondary text-secondary-foreground"
								: "hover:bg-accent hover:text-accent-foreground",
						)}
					>
						{opt}
						{typeof count === "number" && (
							<span
								aria-hidden="true"
								className="ml-1.5 text-muted-foreground tabular-nums"
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
