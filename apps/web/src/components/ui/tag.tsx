import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Tag({
	children,
	hot,
}: {
	children: ReactNode;
	/** Hot tag: filled orange (final-exam, invited, attention states). */
	hot?: boolean;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest",
				hot ? "bg-hot text-accent-on" : "neu-in text-fg",
			)}
		>
			{children}
		</span>
	);
}
