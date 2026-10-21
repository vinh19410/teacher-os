import type { ReactNode } from "react";

/** Kbd v2 (design `Kbd`): phím tắt mono nhỏ trên nền muted. */
export function Kbd({ children }: { children: ReactNode }) {
	return (
		<kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-[10px] text-muted-foreground">
			{children}
		</kbd>
	);
}
