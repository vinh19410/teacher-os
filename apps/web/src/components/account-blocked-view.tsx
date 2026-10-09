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
		<div className="flex min-h-[100svh] items-center justify-center bg-bg p-4">
			<div className="neu fade-in slide-in-from-bottom-2 w-full max-w-[420px] animate-in rounded-md bg-surface-warm p-8 text-center duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] motion-reduce:animate-none">
				<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface">
					<ShieldAlert className="h-8 w-8 text-danger" />
				</div>
				<h2 className="font-display font-extrabold text-[22px] text-fg tracking-[-0.02em]">
					Đây là tài khoản học viên
				</h2>
				<p className="mt-2 text-[14px] text-muted-fg leading-relaxed">
					Tài khoản này thuộc cổng học viên và không thể truy cập trang quản lý
					của giáo viên. Vui lòng đăng xuất để tiếp tục.
				</p>
				<div className="mt-6 flex justify-center">
					<button
						type="button"
						onClick={handleSignOut}
						className="neu-sm flex items-center gap-2 rounded-lg px-5 py-2.5 font-medium text-[14px] text-fg transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
					>
						<LogOut className="h-4 w-4" />
						<span>Đăng xuất</span>
					</button>
				</div>
			</div>
		</div>
	);
}
