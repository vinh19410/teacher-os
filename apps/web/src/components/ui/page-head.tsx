import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHead({
	kicker,
	title,
	lead,
	action,
	className,
}: {
	/** Mô tả muted bên dưới title (prop `kicker` cũ map vào đây; `lead` là
	 * dòng phụ dài hơn — có thể cùng tồn tại). */
	kicker?: ReactNode;
	title: ReactNode;
	lead?: ReactNode;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"mb-6 flex flex-wrap items-end justify-between gap-4",
				className,
			)}
		>
			<div className="min-w-0 space-y-1">
				<h1 className="font-semibold text-2xl tracking-tight md:text-3xl">
					{title}
				</h1>
				{kicker && <p className="text-muted-foreground">{kicker}</p>}
				{lead && lead !== kicker && (
					<p className="max-w-[60ch] text-muted-foreground text-sm">{lead}</p>
				)}
			</div>
			{action && (
				<div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
					{action}
				</div>
			)}
		</div>
	);
}
