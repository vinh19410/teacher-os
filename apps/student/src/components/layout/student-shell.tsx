import { ThemeToggle } from "@teacher-os/ui/components/theme-toggle";
import type { ReactNode } from "react";
import { AvatarMenu } from "@/components/layout/avatar-menu";
import { NotificationBell } from "@/components/layout/notification-bell";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { StudentNav } from "@/components/layout/student-nav";

interface StudentShellProps {
	userName?: string;
	userEmail?: string;
	children: ReactNode;
}

/**
 * Khung portal học viên theo design `StudentPortal`: một hàng header trong
 * container `max-w-6xl` — tên học viên extrabold bên trái, bên phải là org
 * switcher + ThemeToggle + chuông thông báo + menu tài khoản. Không còn
 * sidebar (design home chỉ có 1 cột nội dung).
 */
export function StudentShell({
	userName,
	userEmail,
	children,
}: StudentShellProps) {
	return (
		<div className="flex min-h-svh flex-col bg-bg text-fg">
			<header className="border-line border-b">
				<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4 md:px-10 lg:flex-nowrap">
					{/* e2e account-role-separation: "Đây là tài khoản học viên" chỉ
					 * xuất hiện trên màn lỗi — tên rơi về nhãn chung khi chưa load. */}
					<span className="truncate font-display font-extrabold text-xl tracking-[-0.01em]">
						{userName || "Học viên"}
					</span>
					<StudentNav className="order-3 flex w-full flex-wrap items-center gap-1 border-line border-t pt-2.5 lg:order-none lg:w-auto lg:flex-nowrap lg:border-t-0 lg:pt-0" />
					<div className="flex flex-none items-center gap-2.5">
						<OrgSwitcher />
						<ThemeToggle />
						<NotificationBell />
						<AvatarMenu name={userName} email={userEmail} />
					</div>
				</div>
			</header>

			<main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 md:px-10">
				{children}
			</main>
		</div>
	);
}
