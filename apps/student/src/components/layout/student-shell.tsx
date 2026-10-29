import { useRouterState } from "@tanstack/react-router";
import { AppShell as Shell } from "@teacher-os/ui/components/app-shell/app-shell";
import { ThemeToggle } from "@teacher-os/ui/components/theme-toggle";
import { GraduationCap } from "lucide-react";
import type { ReactNode } from "react";
import { AvatarMenuContent } from "@/components/layout/avatar-menu";
import { NotificationBell } from "@/components/layout/notification-bell";
import { useStudentTeam } from "@/components/layout/org-switcher";
import {
	STUDENT_NAV,
	STUDENT_PAGE_LABEL,
	StudentShellLink,
	useStudentActiveKey,
} from "@/components/layout/student-nav";

interface StudentShellProps {
	userName?: string;
	userEmail?: string;
	children: ReactNode;
}

/**
 * Khung portal học viên trên shell chung (design v2): sidebar với org
 * switcher (TeamSwitcher), nav nhóm "Học tập" và user footer (menu Đăng
 * xuất); header h-14 chứa breadcrumb "tổ chức › mục" + chuông + ThemeToggle.
 * e2e account-role-separation: tên rơi về nhãn chung khi chưa load.
 */
export function StudentShell({
	userName,
	userEmail,
	children,
}: StudentShellProps) {
	const team = useStudentTeam();
	const activeKey = useStudentActiveKey();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const displayName = userName || "Học viên";
	const initials = displayName.trim().charAt(0).toUpperCase() || "H";
	const crumbs = [team?.name, STUDENT_PAGE_LABEL[activeKey]].filter(
		(crumb): crumb is string => Boolean(crumb),
	);

	return (
		<Shell
			nav={STUDENT_NAV}
			activeKey={activeKey}
			team={team ?? undefined}
			user={{
				name: displayName,
				email: userEmail,
				initials,
				label: "Tài khoản học viên",
				menu: <AvatarMenuContent name={userName} email={userEmail} />,
			}}
			crumbs={crumbs}
			actions={
				<>
					<NotificationBell />
					<ThemeToggle />
				</>
			}
			linkComponent={StudentShellLink}
			navLabel="Điều hướng học viên"
			logo={
				<span
					aria-hidden="true"
					className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
				>
					<GraduationCap className="size-4" />
				</span>
			}
			dismissOnKeyChange={pathname}
		>
			{children}
		</Shell>
	);
}
