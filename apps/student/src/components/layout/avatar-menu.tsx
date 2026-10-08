import { ChevronsUpDown, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";

interface AvatarMenuProps {
	name?: string;
	email?: string;
	variant?: "sidebar" | "compact";
}

export function AvatarMenu({
	name,
	email,
	variant = "compact",
}: AvatarMenuProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [isSigningOut, setIsSigningOut] = useState(false);

	const initial = name?.trim() ? name.trim().charAt(0).toUpperCase() : "H";

	const handleSignOut = async () => {
		setIsSigningOut(true);
		try {
			await authClient.signOut();
		} catch {
			// Best-effort sign-out
		} finally {
			window.location.assign("/login");
		}
	};
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setIsOpen(false);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen]);

	return (
		<div className={cn("relative", variant === "sidebar" && "w-full")}>
			{variant === "sidebar" ? (
				<button
					type="button"
					onClick={() => setIsOpen((prev) => !prev)}
					aria-expanded={isOpen}
					aria-haspopup="menu"
					aria-label="Tài khoản học viên"
					className={cn(
						"flex w-full items-center gap-3 rounded-[var(--radius-md)] p-2 text-left transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
						isOpen
							? "bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
							: "hover:bg-surface/80",
					)}
				>
					<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hot font-[590] text-accent-on text-sm shadow-sm">
						{initial}
					</span>
					<div className="min-w-0 flex-1 leading-[1.3]">
						<div className="truncate font-[590] text-[13px] text-fg">
							{name || "Học viên"}
						</div>
						{email && (
							<div className="truncate text-[11px] text-muted-fg">{email}</div>
						)}
					</div>
					<ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-fg opacity-60" />
				</button>
			) : (
				<button
					type="button"
					onClick={() => setIsOpen((prev) => !prev)}
					aria-expanded={isOpen}
					aria-haspopup="menu"
					aria-label="Tài khoản học viên"
					className="flex items-center gap-2 rounded-full p-1 text-left transition-colors hover:bg-surface focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
				>
					<span className="flex h-8 w-8 items-center justify-center rounded-full bg-hot font-[590] text-accent-on text-xs">
						{initial}
					</span>
					{name && (
						<span className="max-w-[120px] truncate font-[510] text-[13px] text-fg max-[640px]:hidden">
							{name}
						</span>
					)}
				</button>
			)}
			{isOpen && (
				<>
					<div
						className="fixed inset-0 z-40"
						onClick={() => setIsOpen(false)}
						aria-hidden="true"
					/>
					<div
						role="menu"
						className={cn(
							"z-50 rounded-[var(--radius-md)] border border-line bg-bg p-1 shadow-[var(--elev-raised)]",
							variant === "sidebar"
								? "absolute bottom-full left-0 mb-2 w-full min-w-[220px]"
								: "absolute top-full right-0 mt-2 w-56 md:top-auto md:right-auto md:bottom-full md:left-0 md:mt-0 md:mb-2 md:w-full",
						)}
					>
						<div className="border-line-soft border-b px-3 py-2.5">
							<div className="flex items-center justify-between gap-2">
								<p className="truncate font-[590] text-[13px] text-fg">
									{name || "Học viên"}
								</p>
								<span className="shrink-0 rounded-full bg-surface-warm px-1.5 py-0.5 font-medium text-[10px] text-muted-fg">
									Học viên
								</span>
							</div>
							{email && (
								<p className="mt-0.5 truncate text-[11px] text-muted-fg">
									{email}
								</p>
							)}
						</div>
						<div className="pt-1">
							<button
								type="button"
								role="menuitem"
								disabled={isSigningOut}
								onClick={handleSignOut}
								className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left font-[510] text-[13px] text-danger transition-colors hover:bg-danger-soft focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-50"
							>
								<LogOut className="h-4 w-4" />
								<span>{isSigningOut ? "Đang đăng xuất…" : "Đăng xuất"}</span>
							</button>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
