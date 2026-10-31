import { LogOut, ShieldAlert } from "lucide-react";
import { authClient } from "@/lib/auth-client";

/**
 * Full-screen view for a student-role session opening the teacher app
 * (plan #260): the account carries no teacher workspace, so the only action
 * is signing out. No cross-link to the student portal (user decision,
 * 2026-09-24) — that would need new env plumbing to build the portal URL.
 */
export default function AccountBlockedView() {
	const handleSignOut = async () => {
		try {
			await authClient.signOut();
		} catch {
			// Best-effort sign-out
		} finally {
			window.location.assign("/login");
		}
	};

	return (
		<div className="flex min-h-[100svh] items-center justify-center p-4">
			<div className="w-full max-w-sm rounded-xl border bg-card p-8 text-center text-card-foreground shadow-sm">
				<div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
					<ShieldAlert className="size-8 text-destructive" aria-hidden="true" />
				</div>
				<h2 className="font-semibold text-lg tracking-tight">
					Đây là tài khoản học viên
				</h2>
				<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
					Tài khoản này không có quyền dùng ứng dụng giáo viên (thuộc cổng học
					viên hoặc email chưa nằm trong danh sách được phép). Vui lòng đăng
					xuất để tiếp tục.
				</p>
				<div className="mt-6 flex justify-center">
					<button
						type="button"
						onClick={handleSignOut}
						className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background px-4 py-2 font-medium text-sm shadow-xs outline-none transition-all hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
					>
						<LogOut className="h-4 w-4" />
						<span>Đăng xuất</span>
					</button>
				</div>
			</div>
		</div>
	);
}
