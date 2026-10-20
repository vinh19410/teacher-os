import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Alert v2 (design `Alert`): khối border nhẹ, body muted. */
export function Alert({
	children,
	title,
	className,
}: {
	children: ReactNode;
	title?: string;
	className?: string;
}) {
	return (
		<div
			role="status"
			className={cn(
				"w-full rounded-lg border bg-card px-4 py-3 text-sm",
				className,
			)}
		>
			{title && <div className="mb-0.5 font-medium">{title}</div>}
			<div className="text-muted-foreground">{children}</div>
		</div>
	);
}
