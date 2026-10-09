import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

interface AvatarMenuProps {
	name?: string;
	email?: string;
}

/**
 * Menu tài khoản học viên ở header portal: avatar chữ cái đầu `neu-sm`
 * (tên đầy đủ đã nằm bên trái header), menu `neu rounded-lg` với xuất
 * hiện ở góc trên phải + nút Đăng xuất.
 */
export function AvatarMenu({ name, email }: AvatarMenuProps) {
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
		<div className="relative">
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				aria-expanded={isOpen}
				aria-haspopup="menu"
				aria-label="Tài khoản học viên"
				className="rounded-full focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
			>
				<span className="neu-sm flex size-8 items-center justify-center rounded-full font-medium text-hot text-sm">
					{initial}
				</span>
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
						className="neu absolute top-full right-0 z-50 mt-2 w-56 rounded-lg p-1"
					>
						<div className="border-line-soft border-b px-3 py-2.5">
							<div className="flex items-center justify-between gap-2">
								<p className="truncate font-[590] text-[13px] text-fg">
									{name || "Học viên"}
								</p>
								<span className="neu-in shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] text-meta uppercase">
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
								className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left font-[510] text-[13px] text-danger transition-colors hover:text-hot focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-50"
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
