import { BookOpen, Home, User } from "lucide-react";
import type { ReactNode } from "react";
import { AvatarMenu } from "@/components/layout/avatar-menu";
import { NotificationBell } from "@/components/layout/notification-bell";
import { OrgSwitcher } from "@/components/layout/org-switcher";

interface StudentShellProps {
	userName?: string;
	userEmail?: string;
	children: ReactNode;
}

export function StudentShell({
	userName,
	userEmail,
	children,
}: StudentShellProps) {
	return (
		<div className="flex min-h-svh flex-col bg-bg text-fg md:flex-row">
			{/* Mobile Top Header */}
			<header className="sticky top-0 z-30 flex h-14 items-center justify-between border-line border-b bg-bg/95 px-4 backdrop-blur md:hidden">
				<div className="flex items-center gap-2">
					<svg
						viewBox="0 0 34 34"
						aria-hidden="true"
						className="h-7 w-7 flex-none"
					>
						<rect width="34" height="34" rx="8" fill="var(--accent)" />
						<path
							d="M9.5 12.5c3-1.8 5-1.8 7.5 0 2.5-1.8 4.5-1.8 7.5 0M17 12.5V22"
							stroke="#ffffff"
							strokeWidth="1.9"
							strokeLinecap="round"
							fill="none"
						/>
					</svg>
					<span className="font-display font-semibold text-[15px] tracking-tight">
						Teacher OS · Học viên
					</span>
				</div>
				<div className="flex items-center gap-2">
					<OrgSwitcher />
					<NotificationBell />
					<AvatarMenu name={userName} email={userEmail} />
				</div>
			</header>

			{/* Desktop Left Sidebar */}
			<aside className="sticky top-0 hidden h-svh w-64 flex-none flex-col justify-between border-line border-r bg-surface/30 p-5 md:flex">
				<div>
					<div className="mb-8 flex items-center gap-2.5">
						<svg
							viewBox="0 0 34 34"
							aria-hidden="true"
							className="h-8 w-8 flex-none"
						>
							<rect width="34" height="34" rx="9" fill="var(--accent)" />
							<path
								d="M9.5 12.5c3-1.8 5-1.8 7.5 0 2.5-1.8 4.5-1.8 7.5 0M17 12.5V22"
								stroke="#ffffff"
								strokeWidth="1.9"
								strokeLinecap="round"
								fill="none"
							/>
						</svg>
						<span className="font-display font-semibold text-[16px] text-fg tracking-tight">
							Teacher OS · Học viên
						</span>
					</div>

					<div className="mb-5">
						<OrgSwitcher />
					</div>

					<nav className="space-y-1">
						<div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-surface px-3 py-2.5 font-[590] text-[14px] text-fg shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
							<Home className="h-4 w-4 text-accent-blue" />
							<span>Trang chủ</span>
						</div>
						<div
							className="flex items-center justify-between rounded-[var(--radius-md)] px-3 py-2.5 font-[510] text-[14px] text-muted-fg opacity-60"
							aria-disabled="true"
						>
							<div className="flex items-center gap-3">
								<BookOpen className="h-4 w-4" />
								<span>Bài tập</span>
							</div>
							<span className="rounded-full bg-surface-warm px-2 py-0.5 text-[10px] text-muted-fg">
								Sắp có
							</span>
						</div>
						<div
							className="flex items-center justify-between rounded-[var(--radius-md)] px-3 py-2.5 font-[510] text-[14px] text-muted-fg opacity-60"
							aria-disabled="true"
						>
							<div className="flex items-center gap-3">
								<User className="h-4 w-4" />
								<span>Hồ sơ</span>
							</div>
							<span className="rounded-full bg-surface-warm px-2 py-0.5 text-[10px] text-muted-fg">
								Sắp có
							</span>
						</div>
					</nav>
				</div>

				<div className="flex items-center justify-between border-line-soft border-t pt-4">
					<AvatarMenu name={userName} email={userEmail} />
					<NotificationBell />
				</div>
			</aside>

			{/* Main Content Area */}
			<main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
				<div className="mx-auto max-w-[1080px]">{children}</div>
			</main>
		</div>
	);
}
