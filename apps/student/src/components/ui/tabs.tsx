import { cn } from "@/lib/cn";

export interface TabsProps {
	tabs: readonly { id: string; label: string }[];
	active: string;
	onChange: (id: string) => void;
	ariaLabel?: string;
	testIdPrefix?: string;
	className?: string;
}

/**
 * Tabs segmented v2 (design `Tabs`): track `bg-muted`, item active nổi
 * `bg-background shadow-sm`. Giữ `role="tablist"` / `role="tab"` + `aria-selected`.
 */
export function Tabs({
	tabs,
	active,
	onChange,
	ariaLabel,
	testIdPrefix,
	className,
}: TabsProps) {
	return (
		<div
			role="tablist"
			aria-label={ariaLabel}
			className={cn(
				"no-scrollbar mb-6 inline-flex h-9 max-w-full items-center overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground",
				className,
			)}
		>
			{tabs.map((t) => (
				<button
					type="button"
					role="tab"
					key={t.id}
					aria-selected={t.id === active}
					data-testid={testIdPrefix ? `${testIdPrefix}-${t.id}` : undefined}
					onClick={() => onChange(t.id)}
					className={cn(
						"inline-flex h-full items-center justify-center whitespace-nowrap rounded-md border border-transparent px-3 font-medium text-sm outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50",
						t.id === active
							? "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30"
							: "hover:text-foreground",
					)}
				>
					{t.label}
				</button>
			))}
		</div>
	);
}
