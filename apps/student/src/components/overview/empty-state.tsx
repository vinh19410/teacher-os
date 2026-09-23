import { BookOpen, CalendarX } from "lucide-react";
import type { ReactNode } from "react";

export function OverviewEmptyState({
	icon = "calendar",
	title,
	description,
}: {
	icon?: "calendar" | "book";
	title: string;
	description?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-line-soft bg-surface/20 py-10 text-center">
			<div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted-fg">
				{icon === "calendar" ? (
					<CalendarX className="h-5 w-5" />
				) : (
					<BookOpen className="h-5 w-5" />
				)}
			</div>
			<p className="font-[590] text-[15px] text-fg">{title}</p>
			{description && (
				<p className="mt-1 max-w-[40ch] text-[13px] text-muted-fg">
					{description}
				</p>
			)}
		</div>
	);
}
