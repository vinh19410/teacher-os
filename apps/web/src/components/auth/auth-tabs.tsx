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
			className="neu-in mb-7 grid grid-cols-2 rounded-lg p-1.5"
		>
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
					"h-10 whitespace-nowrap rounded-md border-none bg-transparent text-sm transition-all duration-[150ms] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none",
					mode === "signin"
						? "neu-sm font-medium text-hot"
						: "text-muted-fg hover:text-fg",
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
					"h-10 whitespace-nowrap rounded-md border-none bg-transparent text-sm transition-all duration-[150ms] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none",
					mode === "signup"
						? "neu-sm font-medium text-hot"
						: "text-muted-fg hover:text-fg",
				)}
			>
				Create account
			</button>
		</div>
	);
}
