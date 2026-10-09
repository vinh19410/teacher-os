import { useTheme } from "../hooks/use-theme";
import { cn } from "../lib/utils";

/**
 * Pill toggle between the dark (default) and light themes. Label and dot
 * color follow the CURRENT theme; the aria-label names the action, so it
 * announces the destination theme (not aria-pressed — this is an action
 * button, not a switch).
 */
export function ThemeToggle({ className }: { className?: string }) {
	const { theme, toggle } = useTheme();
	const dark = theme === "dark";

	return (
		<button
			type="button"
			onClick={toggle}
			aria-label={
				dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"
			}
			className={cn(
				"neu-sm flex h-8 items-center gap-2 rounded-full pr-3 pl-2 text-fg",
				className,
			)}
		>
			<span
				aria-hidden="true"
				className={cn("size-3.5 rounded-full", dark ? "bg-hot" : "bg-fg")}
			/>
			<span className="font-mono text-[10px] uppercase tracking-[0.18em]">
				{dark ? "Tối" : "Sáng"}
			</span>
		</button>
	);
}
