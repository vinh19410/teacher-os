import { Link, useRouterState } from "@tanstack/react-router";
import type {
	NavGroup,
	NavItem,
	ShellLinkProps,
} from "@teacher-os/ui/components/app-shell/nav-group";
import {
	BookOpenCheck,
	CalendarDays,
	ClipboardList,
	History,
	LayoutDashboard,
	School,
	Wallet,
} from "lucide-react";

/**
 * "Luyện tập" (phase 10) + "Lịch sử" (phase 11, #378) đã có route — mục
 * Luyện tập gồm 5 skill con (KHÔNG có Dictation: chưa có đề trong thư viện).
 */
const PRACTICE_ROUTES_LIVE = true;
const HISTORY_ROUTES_LIVE = true;

/** 5 skill luyện tập — thứ tự hiển thị ở nav và redirect trang chủ mục. */
export const PRACTICE_NAV_SKILLS = [
	{ slug: "reading", label: "Reading" },
	{ slug: "listening", label: "Listening" },
	{ slug: "writing", label: "Writing" },
	{ slug: "speaking", label: "Speaking" },
	{ slug: "vocabulary", label: "Vocabulary" },
] as const;

const PRACTICE_HISTORY_ITEMS: NavItem[] = [
	{
		key: "practice",
		label: "Luyện tập",
		icon: BookOpenCheck,
		href: "/practice",
		children: PRACTICE_NAV_SKILLS.map((skill) => ({
			key: `practice-${skill.slug}`,
			label: skill.label,
			href: `/practice/${skill.slug}`,
		})),
	},
	{
		key: "history",
		label: "Lịch sử",
		icon: History,
		href: "/history",
		enabled: HISTORY_ROUTES_LIVE,
	},
];

/** Nav học viên theo design v2 — một nhóm "Học tập", nhãn giữ nguyên v1. */
export const STUDENT_NAV: NavGroup[] = [
	{
		group: "Học tập",
		items: [
			{ key: "overview", label: "Tổng quan", icon: LayoutDashboard, href: "/" },
			{ key: "classes", label: "Lớp học", icon: School, href: "/classes" },
			{
				key: "schedule",
				label: "Lịch học",
				icon: CalendarDays,
				href: "/schedule",
			},
			{
				key: "assignments",
				label: "Bài tập",
				icon: ClipboardList,
				href: "/assignments",
			},
			...(PRACTICE_ROUTES_LIVE ? PRACTICE_HISTORY_ITEMS : []),
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

export const ACTIVE_KEY_BY_PREFIX: Record<string, string> = {
	"/classes": "classes",
	"/schedule": "schedule",
	"/assignments": "assignments",
	"/practice": "practice",
	"/history": "history",
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
	schedule: "Lịch học",
	assignments: "Bài tập",
	practice: "Luyện tập",
	history: "Lịch sử",
	tuition: "Học phí",
};
