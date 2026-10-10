import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/use-theme";
import { cn } from "../lib/utils";

/**
 * Switch between the dark (default) and light themes. Visually a sliding
 * knob carrying the CURRENT theme's icon (moon on the right when dark, sun
 * on the left when light); the semantic state is `aria-checked` = dark is
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
				"neu-sm relative inline-flex h-8 w-14 shrink-0 rounded-full text-meta focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
				className,
			)}
		>
			<Sun
				aria-hidden="true"
				className="absolute top-1/2 left-[8px] size-3.5 -translate-y-1/2"
			/>
			<Moon
				aria-hidden="true"
				className="absolute top-1/2 right-[8px] size-3.5 -translate-y-1/2"
			/>
			<span
				aria-hidden="true"
				className={cn(
					"absolute inset-y-0 left-[3px] my-auto grid size-6 place-items-center rounded-full bg-fg text-bg transition-transform duration-[150ms] ease-[var(--ease-standard)] motion-reduce:transition-none",
					dark ? "translate-x-6" : "translate-x-0",
				)}
			>
				{dark ? (
					<Moon aria-hidden="true" className="size-3.5" />
				) : (
					<Sun aria-hidden="true" className="size-3.5" />
				)}
			</span>
		</button>
	);
}
