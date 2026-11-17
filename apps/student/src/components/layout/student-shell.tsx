import { useRouterState } from "@tanstack/react-router";
import { AppShell as Shell } from "@teacher-os/ui/components/app-shell/app-shell";
import type { NavGroup } from "@teacher-os/ui/components/app-shell/nav-group";
import { ThemeToggle } from "@teacher-os/ui/components/theme-toggle";
import { GraduationCap } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { AvatarMenuContent } from "@/components/layout/avatar-menu";
import { NotificationBell } from "@/components/layout/notification-bell";
import { useStudentTeam } from "@/components/layout/org-switcher";
import {
	STUDENT_NAV,
	STUDENT_PAGE_LABEL,
	StudentShellLink,
	useStudentActiveKey,
} from "@/components/layout/student-nav";
import { useStudentPlacementStatus } from "@/lib/repos/placement-test";

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
	const placementStatusQuery = useStudentPlacementStatus(Boolean(userName));
	const placementStatus = placementStatusQuery.isError
		? undefined
		: placementStatusQuery.data?.status;

	const nav = useMemo<NavGroup[]>(() => {
		let badge: ReactNode = null;
		if (placementStatus === "not_started") {
			badge = (
				<span
					aria-hidden="true"
					data-testid="nav-placement-badge"
					className="rounded-full bg-primary px-2 py-0.5 font-medium text-[11px] text-primary-foreground leading-none"
				>
					Chưa làm
				</span>
			);
		} else if (placementStatus === "pending_grading") {
			badge = (
				<span
					aria-hidden="true"
					data-testid="nav-placement-badge"
					className="rounded-full border border-border bg-muted px-2 py-0.5 font-medium text-[11px] text-muted-foreground leading-none"
				>
					Chờ chấm
				</span>
			);
		}
		if (!badge) return STUDENT_NAV;
		return STUDENT_NAV.map((group) => ({
			...group,
			items: group.items.map((item) =>
				item.key === "placement-test" ? { ...item, badge } : item,
			),
		}));
	}, [placementStatus]);

	const displayName = userName || "Học viên";
	const initials = displayName.trim().charAt(0).toUpperCase() || "H";
	const crumbs = [team?.name, STUDENT_PAGE_LABEL[activeKey]].filter(
		(crumb): crumb is string => Boolean(crumb),
	);

	return (
		<Shell
			nav={nav}
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
