import { cn } from "@/lib/cn";

export type PromptStatusBadgeTone =
	| "draft"
	| "ready"
	| "used"
	| "open"
	| "closed"
	| "late";

const DOT_CLASSES: Record<PromptStatusBadgeTone, string> = {
	draft: "border-[1.5px] border-dashed border-muted-foreground bg-transparent",
	ready: "bg-success",
	used: "bg-foreground",
	open: "bg-success",
	closed: "bg-muted-foreground",
	late: "bg-destructive",
};

const TEXT_CLASSES: Record<PromptStatusBadgeTone, string> = {
	draft: "text-muted-foreground",
	ready: "text-foreground",
	used: "text-foreground",
	open: "text-foreground",
	closed: "text-foreground",
	late: "text-destructive",
};

export function PromptStatusBadge({
	tone,
	label,
	className,
}: {
	tone: PromptStatusBadgeTone;
	label: string;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-xs",
				TEXT_CLASSES[tone],
				className,
			)}
		>
			<span
				aria-hidden="true"
				className={cn("size-2 shrink-0 rounded-full", DOT_CLASSES[tone])}
			/>
			{label}
		</span>
	);
}
