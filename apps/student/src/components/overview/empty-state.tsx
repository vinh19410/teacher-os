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
		<div className="neu flex flex-col items-center justify-center rounded-lg py-10 text-center">
			<div className="neu-in mb-3 flex h-10 w-10 items-center justify-center rounded-full text-meta">
				{icon === "calendar" ? (
					<CalendarX className="h-5 w-5" />
				) : (
					<BookOpen className="h-5 w-5" />
				)}
			</div>
			<p className="font-medium text-[15px] text-fg">{title}</p>
			{description && (
				<p className="mt-1 max-w-[40ch] text-[13px] text-meta">{description}</p>
			)}
		</div>
	);
}
