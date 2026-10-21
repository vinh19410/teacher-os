import type { StatusTone } from "./assignment-status";

interface StatusTagProps {
	children: string;
	tone?: StatusTone;
	className?: string;
}

// Tag trạng thái v2 (khớp Badge v2: rounded-md px-2 py-0.5 text-xs):
// ok = xanh thành công, warn = hổ phách, danger = đỏ, còn lại trung tính
// dựa trên border/muted thay vì nền đặc.
const TONE_CLASSES: Record<StatusTone, string> = {
	ok: "border-transparent bg-success/10 text-success",
	warn: "border-transparent bg-warn/10 text-warn",
	danger: "border-transparent bg-destructive text-white",
	neutral: "border-border bg-transparent text-muted-foreground",
	draft: "border-border bg-muted text-muted-foreground",
	used: "border-border bg-transparent text-foreground",
};

export function StatusTag({
	children,
	tone = "neutral",
	className = "",
}: StatusTagProps) {
	const toneClass = TONE_CLASSES[tone] ?? TONE_CLASSES.neutral;
	return (
		<span
			className={`inline-flex w-fit items-center whitespace-nowrap rounded-md border px-2 py-0.5 font-medium text-xs ${toneClass} ${className}`.trim()}
		>
			{children}
		</span>
	);
}
