import { cn } from "@/lib/cn";

export interface TabsProps {
	tabs: { id: string; label: string }[];
	active: string;
	onChange: (id: string) => void;
	className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
	return (
		<div
			role="tablist"
			className={cn(
				"mb-5 flex gap-1 overflow-x-auto border-line border-b",
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
						"whitespace-nowrap border-b-2 border-b-transparent border-none bg-transparent px-4 py-3 font-medium text-sm transition-colors duration-[150ms]",
						"focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
						t.id === active
							? "border-b-accent-blue text-accent-blue"
							: "text-muted-fg hover:text-fg",
					)}
				>
					{t.label}
				</button>
			))}
		</div>
	);
}
