import { cn } from "@/lib/cn";

export interface TabsProps {
	tabs: { id: string; label: string }[];
	active: string;
	onChange: (id: string) => void;
	className?: string;
}

/** Tabs segmented v2 (design `Tabs`): track bg-muted, item active nổi
 * bg-background + shadow-sm. Giữ role tablist/tab + aria-selected. */
export function Tabs({ tabs, active, onChange, className }: TabsProps) {
	return (
		<div
			role="tablist"
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
