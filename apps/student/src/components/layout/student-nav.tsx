import { Link, useRouterState } from "@tanstack/react-router";
import { env } from "@teacher-os/env/web";
import type {
	NavGroup,
	NavItem,
	ShellLinkProps,
} from "@teacher-os/ui/components/app-shell/nav-group";
import {
	BookA,
	BookOpenCheck,
	CalendarDays,
	ClipboardList,
	History,
	LayoutDashboard,
	School,
	Wallet,
} from "lucide-react";

/**
 * Cờ build-time `VITE_STUDENT_PRACTICE_ENABLED`:
 * - `true` (Staging / E2E): hiển thị đầy đủ "Luyện tập" (5 skill con, không
 *   Dictation) và "Lịch sử".
 * - `false` / chưa đặt (mặc định trên PROD): ẩn nhóm "Luyện tập" + "Lịch sử",
 *   chỉ hiển thị mục cấp 1 "Từ vựng" (/practice/vocabulary) và chặn các path
 *   tự luyện còn lại tại router.
 */
export const PRACTICE_ROUTES_LIVE =
	env.VITE_STUDENT_PRACTICE_ENABLED === "true";
export const HISTORY_ROUTES_LIVE = PRACTICE_ROUTES_LIVE;

export const VOCABULARY_NAV_ITEM: NavItem = {
	key: "vocabulary",
	label: "Từ vựng",
	icon: BookA,
	href: "/practice/vocabulary",
};

/** 5 skill luyện tập — thứ tự hiển thị ở nav và redirect trang chủ mục. */
export const PRACTICE_NAV_SKILLS = [
	{ slug: "reading", label: "Reading" },
	{ slug: "listening", label: "Listening" },
	{ slug: "writing", label: "Writing" },
	{ slug: "speaking", label: "Speaking" },
	{ slug: "vocabulary", label: "Vocabulary" },
] as const;

export const PRACTICE_HISTORY_ITEMS: NavItem[] = [
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
			...(PRACTICE_ROUTES_LIVE
				? PRACTICE_HISTORY_ITEMS
				: [VOCABULARY_NAV_ITEM]),
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
	"aria-label": ariaLabel,
	title,
	onClick,
	children,
}: ShellLinkProps) {
	return (
		<Link
			to={href}
			onClick={onClick}
			className={className}
			aria-current={ariaCurrent}
			aria-label={ariaLabel}
			title={title}
			activeOptions={href === "/" ? { exact: true } : undefined}
		>
			{children}
		</Link>
	);
}

export const ACTIVE_KEY_BY_PREFIX: Record<string, string> = {
	"/placement-test": "placement-test",
	"/classes": "classes",
	"/schedule": "schedule",
	"/assignments": "assignments",
	"/practice": "practice",
	"/history": "history",
	"/tuition": "tuition",
};

/** activeKey cho shell — "/" hoặc "/student" là Tổng quan (exact), còn lại khớp prefix. */
export function resolveStudentActiveKey(pathname: string): string {
	const normalized = pathname.replace(/^\/student(?=\/|$)/, "") || "/";
	if (normalized === "/") return "overview";
	if (
		!PRACTICE_ROUTES_LIVE &&
		(normalized === "/practice/vocabulary" ||
			normalized.startsWith("/practice/vocabulary/"))
	) {
		return "vocabulary";
	}
	for (const [prefix, key] of Object.entries(ACTIVE_KEY_BY_PREFIX)) {
		if (normalized.startsWith(prefix)) return key;
	}
	return "";
}

export function useStudentActiveKey(): string {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	return resolveStudentActiveKey(pathname);
}

/** Nhãn crumb theo activeKey ("tổ chức › mục"). */
export const STUDENT_PAGE_LABEL: Record<string, string> = {
	overview: "Tổng quan",
	"placement-test": "Kiểm tra đầu vào",
	classes: "Lớp học",
	schedule: "Lịch học",
	assignments: "Bài tập",
	vocabulary: "Từ vựng",
	practice: "Luyện tập",
	history: "Lịch sử",
	tuition: "Học phí",
};
