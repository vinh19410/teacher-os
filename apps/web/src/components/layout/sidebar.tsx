import { Link } from "@tanstack/react-router";
import type {
	NavGroup,
	ShellLinkProps,
} from "@teacher-os/ui/components/app-shell/nav-group";
import {
	BarChart3,
	BookA,
	BookMarked,
	CalendarDays,
	ClipboardList,
	LayoutDashboard,
	School,
	UserRound,
	Users,
	Wallet,
} from "lucide-react";
import { PARENT_REPORTS_ENABLED } from "@/lib/features";

/**
 * Nav giáo viên theo nhóm design v2 — nhãn tiếng Việt. Nhãn giữ nguyên tên
 * app đang có (accessible name e2e): /syllabus là "Syllabus", /tuition là
 * "Doanh thu". Route "Chấm bài" không có trang đích riêng (chỉ
 * /grading/$attemptId từ trang lớp) nên không đặt nav.
 */
export const TEACHER_NAV: NavGroup[] = [
	{
		group: "Giảng dạy",
		items: [
			{
				key: "dashboard",
				label: "Tổng quan",
				icon: LayoutDashboard,
				href: "/dashboard",
			},
			{ key: "classes", label: "Lớp học", icon: School, href: "/classes" },
			{ key: "students", label: "Học viên", icon: Users, href: "/students" },
			{
				key: "schedule",
				label: "Lịch dạy",
				icon: CalendarDays,
				href: "/schedule",
			},
			{
				key: "syllabus",
				label: "Syllabus",
				icon: BookMarked,
				href: "/syllabus",
			},
		],
	},
	{
		group: "IELTS",
		items: [
			{
				key: "assignments",
				label: "Bài tập",
				icon: ClipboardList,
				href: "/assignments",
			},
			{ key: "vocab", label: "Từ vựng", icon: BookA, href: "/vocab" },
		],
	},
	{
		group: "Kinh doanh",
		items: [
			{ key: "tuition", label: "Doanh thu", icon: Wallet, href: "/tuition" },
			{
				key: "reports",
				label: "Báo cáo",
				icon: BarChart3,
				href: "/reports",
				enabled: PARENT_REPORTS_ENABLED,
			},
			{ key: "profile", label: "Hồ sơ", icon: UserRound, href: "/profile" },
		],
	},
];

/**
 * Adapter TanStack `<Link>` cho shell — nav vẫn điều hướng bằng router thật
 * (không window.location) và TanStack tự đặt `aria-current="page"`; `/` cần
 * match exact nên shell web không dùng (dashboard là /dashboard).
 */
export function TeacherShellLink({
	href,
	className,
	"aria-current": ariaCurrent,
	onClick,
	children,
}: ShellLinkProps) {
	return (
		<Link
			to={href}
			onClick={onClick}
			className={className}
			aria-current={ariaCurrent}
			activeOptions={href === "/" ? { exact: true } : undefined}
		>
			{children}
		</Link>
	);
}

export function extractUserPlan(user: unknown): string | null {
	if (!user || typeof user !== "object") return null;
	if ("plan" in user && typeof user.plan === "string" && user.plan.trim()) {
		return user.plan.trim();
	}
	if ("tier" in user && typeof user.tier === "string" && user.tier.trim()) {
		return user.tier.trim();
	}
	return null;
}

/**
 * activeKey của nav từ pathname — khớp prefix như TanStack match (trừ "/"
 * phải exact). Route ngoài bảng (vd. /grading/$attemptId) → không mục nào
 * active, đúng như shell v1.
 */
const ACTIVE_KEY_BY_PREFIX: Record<string, string> = {
	"/dashboard": "dashboard",
	"/classes": "classes",
	"/students": "students",
	"/schedule": "schedule",
	"/syllabus": "syllabus",
	"/assignments": "assignments",
	"/vocab": "vocab",
	"/tuition": "tuition",
	"/reports": "reports",
	"/profile": "profile",
};

export function teacherActiveKey(pathname: string): string {
	if (pathname === "/") return "dashboard";
	for (const [prefix, key] of Object.entries(ACTIVE_KEY_BY_PREFIX)) {
		if (pathname.startsWith(prefix)) return key;
	}
	return "";
}
