import { Link } from "@tanstack/react-router";
import type {
	NavGroup,
	ShellLinkProps,
} from "@teacher-os/ui/components/app-shell/nav-group";
import {
	BarChart3,
	Bell,
	BookA,
	BookMarked,
	CalendarCheck,
	CalendarDays,
	ClipboardList,
	LayoutDashboard,
	PenLine,
	ReceiptText,
	School,
	UserRound,
	Users,
	Wallet,
} from "lucide-react";
import { PARENT_REPORTS_ENABLED } from "@/lib/features";

/**
 * Nav giáo viên theo nhóm design v2 — nhãn tiếng Việt. Nhãn giữ nguyên tên
 * app đang có (accessible name e2e): /syllabus là "Syllabus", /tuition là
 * "Doanh thu". Mục "Chấm bài" dẫn tới hàng chờ chấm /grading (#383).
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
			// TOS-6 (#439): đích thẻ "Ca học hôm nay chưa điểm danh" + mục
			// wireframe [2] — nội dung điểm danh thuộc TOS-7/TOS-8.
			{
				key: "attendance",
				label: "Điểm danh ngày",
				icon: CalendarCheck,
				href: "/attendance",
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
			// TOS-21 (#454): nhật ký gửi thông báo Email & In-app — màn [5].
			{
				key: "notifications",
				label: "Nhật ký thông báo",
				icon: Bell,
				href: "/notifications",
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
			{
				key: "grading",
				label: "Chấm bài",
				icon: PenLine,
				href: "/grading",
			},
			{ key: "vocab", label: "Từ vựng", icon: BookA, href: "/vocab" },
		],
	},
	{
		group: "Kinh doanh",
		items: [
			{ key: "tuition", label: "Doanh thu", icon: Wallet, href: "/tuition" },
			{
				key: "debts",
				label: "Công nợ",
				icon: ReceiptText,
				href: "/debts",
			},
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
 * phải exact). Route ngoài bảng (vd. /login) → không mục nào active.
 */
const ACTIVE_KEY_BY_PREFIX: Record<string, string> = {
	"/dashboard": "dashboard",
	"/attendance": "attendance",
	"/classes": "classes",
	"/students": "students",
	"/schedule": "schedule",
	"/syllabus": "syllabus",
	"/notifications": "notifications",
	"/assignments": "assignments",
	"/grading": "grading",
	"/vocab": "vocab",
	"/tuition": "tuition",
	"/debts": "debts",
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
