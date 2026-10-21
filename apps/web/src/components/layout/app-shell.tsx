import {
	Outlet,
	redirect,
	useNavigate,
	useRouteContext,
	useRouterState,
} from "@tanstack/react-router";
import { AppShell as Shell } from "@teacher-os/ui/components/app-shell/app-shell";
import type { ShellUser } from "@teacher-os/ui/components/app-shell/user-footer";
import { GraduationCap, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { authClient } from "@/lib/auth-client";
import { DataProvider } from "@/lib/data-store";
import { initialsFromName } from "@/lib/initials";
import { readCollapsedPref, writeCollapsedPref } from "@/lib/sidebar-prefs";
import {
	extractUserPlan,
	TEACHER_NAV,
	TeacherShellLink,
	teacherActiveKey,
} from "./sidebar";
import { TopbarActions } from "./topbar";
import { VersionBadge } from "./version-badge";

/**
 * Crumb theo route match (tổ chức › mục › chi tiết): segment đầu là tên tổ
 * chức, phần sau tra cứu tĩnh từ routeId lá. Route không có trong bảng
 * → chỉ hiện tổ chức.
 */
const ROUTE_CRUMBS: Record<string, string[]> = {
	"/_auth": ["Tổng quan"],
	"/_auth/dashboard": ["Tổng quan"],
	"/_auth/students": ["Học viên"],
	"/_auth/students/$studentId": ["Học viên"],
	"/_auth/schedule": ["Lịch dạy"],
	"/_auth/tuition/": ["Doanh thu"],
	"/_auth/tuition/$invoiceId": ["Doanh thu"],
	"/_auth/assignments": ["Bài tập"],
	"/_auth/assignments/$assignmentId": ["Bài tập"],
	"/_auth/assignments/new": ["Bài tập", "Tạo bài tập"],
	"/_auth/assignments/preview": ["Bài tập", "Xem trước bài tập"],
	"/_auth/grading": ["Chấm bài"],
	"/_auth/grading/": ["Chấm bài"],
	"/_auth/grading/$attemptId": ["Chấm bài"],
	"/_auth/classes": ["Lớp học"],
	"/_auth/classes/$classId": ["Lớp học"],
	"/_auth/syllabus": ["Syllabus"],
	"/_auth/syllabus/$syllabusId": ["Syllabus"],
	"/_auth/reports": ["Báo cáo phụ huynh"],
	"/_auth/profile": ["Hồ sơ"],
};

const ORG_NAME = "Teacher/OS";

export function AppShell() {
	const { session } = useRouteContext({ from: "/_auth" });
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const lastRouteId = useRouterState({
		select: (s) => s.matches.at(-1)?.routeId,
	});
	const [collapsed, setCollapsed] = useState(readCollapsedPref);

	useEffect(() => {
		writeCollapsedPref(collapsed);
	}, [collapsed]);

	// Hard invariant: inside _auth a session must exist; a missing session means
	// the guard chain is broken — fail loudly back to login instead of faking UI.
	if (!session?.data?.user) {
		throw redirect({ to: "/login" });
	}

	const user = session.data.user;
	const displayName = user.name || "Giáo viên";
	const initials = initialsFromName(displayName);
	const plan = extractUserPlan(user);

	const shellUser: ShellUser = {
		name: displayName,
		email: user.email,
		initials,
		href: "/profile",
		label: "Hồ sơ cá nhân",
		title: `${displayName} (${user.email})`,
		emailTestId: "sidebar-user-email",
		avatar: (
			<Avatar
				text={initials}
				src={user.image}
				size="md"
				className="rounded-lg"
				imgProps={{ "data-testid": "sidebar-avatar" }}
			/>
		),
		badge: plan ? (
			<span
				data-testid="sidebar-user-plan"
				className="ml-1 shrink-0 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]"
			>
				{plan}
			</span>
		) : undefined,
		trailing: (
			<button
				type="button"
				aria-label="Đăng xuất"
				title="Đăng xuất"
				onClick={() => {
					authClient.signOut({
						fetchOptions: {
							onSuccess: () => {
								navigate({ to: "/login" });
							},
						},
					});
				}}
				className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4"
			>
				<LogOut aria-hidden="true" />
			</button>
		),
	};

	return (
		<DataProvider>
			<Shell
				nav={TEACHER_NAV}
				activeKey={teacherActiveKey(pathname)}
				crumbs={[ORG_NAME, ...(ROUTE_CRUMBS[lastRouteId ?? ""] ?? [])]}
				team={{ name: ORG_NAME, sub: "Bảng điều khiển giáo viên" }}
				user={shellUser}
				actions={<TopbarActions />}
				linkComponent={TeacherShellLink}
				navLabel="Điều hướng chính"
				logo={
					<span
						aria-hidden="true"
						className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
					>
						<GraduationCap className="size-4" />
					</span>
				}
				footerSlot={
					<div className="px-2 pt-1">
						<VersionBadge />
					</div>
				}
				collapsed={collapsed}
				onToggleCollapse={() => setCollapsed((v) => !v)}
				dismissOnKeyChange={pathname}
			>
				<Outlet />
			</Shell>
		</DataProvider>
	);
}
