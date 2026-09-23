import { LogOut } from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AvatarMenu({ name, email }: { name?: string; email?: string }) {
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

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				aria-expanded={isOpen}
				aria-haspopup="menu"
				className="flex items-center gap-2 rounded-full p-1 text-left transition-colors hover:bg-surface focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
			>
				<span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-blue font-[590] text-accent-on text-xs">
					{initial}
				</span>
				{name && (
					<span className="max-w-[120px] truncate font-[510] text-[13px] text-fg max-[640px]:hidden">
						{name}
					</span>
				)}
			</button>

			{isOpen && (
				<>
					<div
						className="fixed inset-0 z-40"
						onClick={() => setIsOpen(false)}
						aria-hidden="true"
					/>
					<div
						role="menu"
						className="absolute right-0 z-50 mt-2 w-56 rounded-[var(--radius-md)] border border-line bg-bg p-1 shadow-[var(--elev-raised)]"
					>
						<div className="border-line-soft border-b px-3 py-2">
							<p className="truncate font-[590] text-[13px] text-fg">
								{name || "Học viên"}
							</p>
							{email && (
								<p className="truncate text-[11px] text-muted-fg">{email}</p>
							)}
						</div>
						<button
							type="button"
							role="menuitem"
							disabled={isSigningOut}
							onClick={handleSignOut}
							className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-left font-[510] text-[13px] text-danger transition-colors hover:bg-danger-soft focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-50"
						>
							<LogOut className="h-4 w-4" />
							<span>{isSigningOut ? "Đang đăng xuất…" : "Đăng xuất"}</span>
						</button>
					</div>
				</>
			)}
		</div>
	);
}
