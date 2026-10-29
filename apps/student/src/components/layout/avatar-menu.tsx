import { LogOut } from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * Nội dung menu tài khoản học viên — mở từ user footer của shell chung
 * (trigger + trạng thái mở do UserFooter quản); giữ luồng đăng xuất v1:
 * best-effort signOut rồi chuyển về trang login cổng học viên.
 */
export function AvatarMenuContent({
	name,
	email,
}: {
	name?: string;
	email?: string;
}) {
	const [isSigningOut, setIsSigningOut] = useState(false);

	async function handleSignOut() {
		setIsSigningOut(true);
		try {
			await authClient.signOut();
		} catch {
			// Best-effort sign-out
		} finally {
			window.location.assign("/login");
		}
	}

	return (
		<div
			role="menu"
			aria-label="Menu tài khoản"
			className="w-56 rounded-md border bg-popover text-popover-foreground shadow-md"
		>
			<div className="border-b px-3 py-2.5">
				<div className="flex items-center justify-between gap-2">
					<p className="truncate font-medium text-[13px]">
						{name || "Học viên"}
					</p>
					<span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
						Học viên
					</span>
				</div>
				{email && (
					<p className="mt-0.5 truncate text-[11px] text-muted-foreground">
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
					className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-destructive transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50"
				>
					<LogOut aria-hidden="true" className="size-4" />
					<span>{isSigningOut ? "Đang đăng xuất…" : "Đăng xuất"}</span>
				</button>
			</div>
		</div>
	);
}
