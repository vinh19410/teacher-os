import type { StatusTone } from "./assignment-status";

interface StatusTagProps {
	children: string;
	tone?: StatusTone;
	className?: string;
}

const TONE_CLASSES: Record<StatusTone, string> = {
	ok: "border border-success/30 bg-success-soft text-success",
	warn: "border border-warn/40 bg-warn-soft text-fg-2",
	danger: "border border-danger/30 bg-danger-soft text-danger",
	neutral: "border border-line bg-transparent text-muted-fg",
	draft: "border border-line/60 bg-surface text-fg-2",
	used: "border border-line bg-transparent text-fg-2",
};

export function StatusTag({
	children,
	tone = "neutral",
	className = "",
}: StatusTagProps) {
	const toneClass = TONE_CLASSES[tone] ?? TONE_CLASSES.neutral;
	return (
		<span
			className={`inline-flex items-center rounded-full px-[9px] py-[2px] font-medium text-[11px] leading-normal ${toneClass} ${className}`.trim()}
		>
			{children}
		</span>
	);
}
