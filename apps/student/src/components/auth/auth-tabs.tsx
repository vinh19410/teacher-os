import { useRef } from "react";

import { cn } from "@/lib/cn";

export type AuthMode = "otp" | "signin" | "signup";

interface AuthTabsProps {
	mode: AuthMode;
	onChange: (mode: AuthMode) => void;
	disabled?: boolean;
}

/** Tabs segmented v2 (pattern `Tabs` v2): track bg-muted, item active nổi
 * bg-background + shadow-sm. role/id giữ nguyên cho e2e (`#tab-signin`). */
export function AuthTabs({ mode, onChange, disabled }: AuthTabsProps) {
	const otpTabRef = useRef<HTMLButtonElement>(null);
	const signInTabRef = useRef<HTMLButtonElement>(null);
	const signUpTabRef = useRef<HTMLButtonElement>(null);

	const TAB_ORDER: AuthMode[] = ["otp", "signin", "signup"];

	function onKeyDown(event: React.KeyboardEvent) {
		if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
		event.preventDefault();
		const currentIdx = TAB_ORDER.indexOf(mode);
		const delta = event.key === "ArrowRight" ? 1 : -1;
		const nextIdx = (currentIdx + delta + TAB_ORDER.length) % TAB_ORDER.length;
		const next = TAB_ORDER[nextIdx] ?? "otp";
		onChange(next);
		const refMap: Record<
			AuthMode,
			React.RefObject<HTMLButtonElement | null>
		> = {
			otp: otpTabRef,
			signin: signInTabRef,
			signup: signUpTabRef,
		};
		refMap[next]?.current?.focus();
	}

	const TABS: Array<{
		id: AuthMode;
		label: string;
		ref: React.RefObject<HTMLButtonElement | null>;
	}> = [
		{ id: "otp", label: "Mã email", ref: otpTabRef },
		{ id: "signin", label: "Mật khẩu", ref: signInTabRef },
		{ id: "signup", label: "Đăng ký", ref: signUpTabRef },
	];

	return (
		<div
			role="tablist"
			aria-label="Đăng nhập hoặc tạo tài khoản"
			onKeyDown={onKeyDown}
			className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground"
		>
			{TABS.map((tab) => (
				<button
					type="button"
					role="tab"
					key={tab.id}
					id={`tab-${tab.id}`}
					ref={tab.ref}
					disabled={disabled}
					aria-selected={mode === tab.id}
					aria-controls={`panel-${tab.id}`}
					tabIndex={mode === tab.id ? 0 : -1}
					onClick={() => onChange(tab.id)}
					className={cn(
						"inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md border border-transparent px-3 text-sm outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
						mode === tab.id
							? "bg-background font-medium text-foreground shadow-sm dark:border-input dark:bg-input/30"
							: "hover:text-foreground",
					)}
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}
