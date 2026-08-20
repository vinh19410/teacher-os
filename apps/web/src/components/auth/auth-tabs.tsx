import { useRef } from "react";

import { cn } from "@/lib/cn";

export type AuthMode = "signin" | "signup";

interface AuthTabsProps {
	mode: AuthMode;
	onChange: (mode: AuthMode) => void;
	disabled?: boolean;
}

export function AuthTabs({ mode, onChange, disabled }: AuthTabsProps) {
	const signInTabRef = useRef<HTMLButtonElement>(null);
	const signUpTabRef = useRef<HTMLButtonElement>(null);

	function onKeyDown(event: React.KeyboardEvent) {
		if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
		event.preventDefault();
		const next: AuthMode = event.key === "ArrowRight" ? "signup" : "signin";
		onChange(next);
		(next === "signin" ? signInTabRef.current : signUpTabRef.current)?.focus();
	}

	return (
		<div
			role="tablist"
			aria-label="Sign in or create account"
			onKeyDown={onKeyDown}
			className="relative mb-7 grid grid-cols-2 rounded-[var(--radius-pill)] bg-surface p-1"
		>
			<span
				aria-hidden="true"
				className={cn(
					"absolute top-1 left-1 h-[calc(100%-8px)] w-[calc(50%-4px)] rounded-[var(--radius-pill)] bg-bg",
					"shadow-[0_1px_4px_rgba(0,0,0,0.12),inset_0_0_0_1px_var(--border-soft)]",
					"transition-transform duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] motion-reduce:transition-none",
					mode === "signup" ? "translate-x-full" : "translate-x-0",
				)}
			/>
			<button
				type="button"
				role="tab"
				id="tab-signin"
				ref={signInTabRef}
				disabled={disabled}
				aria-selected={mode === "signin"}
				aria-controls="panel-signin"
				tabIndex={mode === "signin" ? 0 : -1}
				onClick={() => onChange("signin")}
				className={cn(
					"relative z-[1] h-10 whitespace-nowrap rounded-[var(--radius-pill)] text-muted-fg text-sm transition-colors duration-[150ms] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none",
					mode === "signin" && "font-[590] text-fg",
				)}
			>
				Sign in
			</button>
			<button
				type="button"
				role="tab"
				id="tab-signup"
				ref={signUpTabRef}
				disabled={disabled}
				aria-selected={mode === "signup"}
				aria-controls="panel-signup"
				tabIndex={mode === "signup" ? 0 : -1}
				onClick={() => onChange("signup")}
				className={cn(
					"relative z-[1] h-10 whitespace-nowrap rounded-[var(--radius-pill)] text-muted-fg text-sm transition-colors duration-[150ms] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none",
					mode === "signup" && "font-[590] text-fg",
				)}
			>
				Create account
			</button>
		</div>
	);
}
