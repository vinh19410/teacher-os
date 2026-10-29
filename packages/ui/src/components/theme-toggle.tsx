import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/use-theme";
import { cn } from "../lib/utils";

/**
 * Switch between the light (default) and dark themes (design v2): a ghost
 * icon button showing the icon of the theme it will switch TO (sun while
 * dark, moon while light). The semantic state is `aria-checked` = dark is
 * on, with a fixed label — screen readers announce the switch state rather
 * than an action destination.
 */
export function ThemeToggle({ className }: { className?: string }) {
	const { theme, toggle } = useTheme();
	const dark = theme === "dark";

	return (
		<button
			type="button"
			role="switch"
			aria-checked={dark}
			aria-label="Giao diện tối"
			onClick={toggle}
			className={cn(
				"inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
				className,
			)}
		>
			{dark ? (
				<Sun aria-hidden="true" className="size-4" />
			) : (
				<Moon aria-hidden="true" className="size-4" />
			)}
		</button>
	);
}
