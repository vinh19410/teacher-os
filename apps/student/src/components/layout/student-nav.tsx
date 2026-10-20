import { Link, useRouterState } from "@tanstack/react-router";
import type {
	NavGroup,
	NavItem,
	ShellLinkProps,
} from "@teacher-os/ui/components/app-shell/nav-group";
import {
	BookA,
	BookOpenCheck,
	ClipboardList,
	History,
	LayoutDashboard,
	School,
	Wallet,
} from "lucide-react";

/**
 * Route "Luyện tập" (phase 10) và "Lịch sử" (phase 11) chưa tồn tại —
 * flag ẩn 2 mục này khỏi nav; mở flag cùng commit thêm route.
 */
const PRACTICE_HISTORY_ROUTES_LIVE = false;

const PRACTICE_HISTORY_ITEMS: NavItem[] = [
	{
		key: "practice",
		label: "Luyện tập",
		icon: BookOpenCheck,
		href: "/practice",
	},
	{ key: "history", label: "Lịch sử", icon: History, href: "/history" },
];

/** Nav học viên theo design v2 — một nhóm "Học tập", nhãn giữ nguyên v1. */
export const STUDENT_NAV: NavGroup[] = [
	{
		group: "Học tập",
		items: [
			{ key: "overview", label: "Tổng quan", icon: LayoutDashboard, href: "/" },
			{ key: "classes", label: "Lớp học", icon: School, href: "/classes" },
			{
				key: "assignments",
				label: "Bài tập",
				icon: ClipboardList,
				href: "/assignments",
			},
			...(PRACTICE_HISTORY_ROUTES_LIVE ? PRACTICE_HISTORY_ITEMS : []),
			{ key: "vocab", label: "Từ vựng", icon: BookA, href: "/vocab" },
			{ key: "tuition", label: "Học phí", icon: Wallet, href: "/tuition" },
		],
	},
];

/**
 * Adapter TanStack `<Link>` cho shell học viên — "/ Overview" cần match
 * exact, các trang con (/classes/$classId…) vẫn giữ mục cha active.
 */
export function StudentShellLink({
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

const ACTIVE_KEY_BY_PREFIX: Record<string, string> = {
	"/classes": "classes",
	"/assignments": "assignments",
	"/practice": "practice",
	"/history": "history",
	"/vocab": "vocab",
	"/tuition": "tuition",
};

/** activeKey cho shell — "/" là Tổng quan (exact), còn lại khớp prefix. */
export function useStudentActiveKey(): string {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	if (pathname === "/") return "overview";
	for (const [prefix, key] of Object.entries(ACTIVE_KEY_BY_PREFIX)) {
		if (pathname.startsWith(prefix)) return key;
	}
	return "";
}

/** Nhãn crumb theo activeKey ("tổ chức › mục"). */
export const STUDENT_PAGE_LABEL: Record<string, string> = {
	overview: "Tổng quan",
	classes: "Lớp học",
	assignments: "Bài tập",
	practice: "Luyện tập",
	history: "Lịch sử",
	vocab: "Từ vựng",
	tuition: "Học phí",
};
