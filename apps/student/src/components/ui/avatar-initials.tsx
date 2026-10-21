import { cn } from "@/lib/cn";

export interface AvatarInitialsProps {
	initials: string;
	className?: string;
}

/**
 * Avatar chữ tắt tròn theo design v2 (`size-8 rounded-full bg-muted text-xs font-medium`).
 */
export function AvatarInitials({ initials, className }: AvatarInitialsProps) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-foreground text-xs",
				className,
			)}
		>
			{initials}
		</span>
	);
}
