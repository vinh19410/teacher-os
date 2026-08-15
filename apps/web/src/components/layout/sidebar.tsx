import { Link, redirect, useRouteContext } from "@tanstack/react-router";
import type { ReactNode } from "react";

const navSections: {
	label: string | null;
	items: { to: string; label: string; icon: ReactNode }[];
}[] = [
	{
		label: null,
		items: [
			{
				to: "/dashboard",
				label: "Tổng quan",
				icon: (
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
					>
						<rect x="3" y="3" width="7" height="7" rx="1" />
						<rect x="14" y="3" width="7" height="7" rx="1" />
						<rect x="3" y="14" width="7" height="7" rx="1" />
						<rect x="14" y="14" width="7" height="7" rx="1" />
					</svg>
				),
			},
			{
				to: "/students",
				label: "Học viên",
				icon: (
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
					>
						<circle cx="12" cy="8" r="4" />
						<path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
					</svg>
				),
			},
			{
				to: "/schedule",
				label: "Lịch dạy",
				icon: (
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
					>
						<rect x="3" y="5" width="18" height="16" rx="2" />
						<path d="M3 10h18M8 3v4M16 3v4" />
					</svg>
				),
			},
			{
				to: "/tuition",
				label: "Học phí",
				icon: (
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
					>
						<path d="M3 7c0-1 1-2 2-2h14c1 0 2 1 2 2v2H3V7z" />
						<path d="M3 9h18v8c0 1-1 2-2 2H5c-1 0-2-1-2-2V9z" />
						<path d="M15 13h2" />
					</svg>
				),
			},
			{
				to: "/assignments",
				label: "Bài tập",
				icon: (
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
					>
						<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
						<path d="M14 3v5h5M9 13h6M9 17h4" />
					</svg>
				),
			},
		],
	},
	{
		label: "Giảng dạy",
		items: [
			{
				to: "/classes",
				label: "Lớp học",
				icon: (
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
					>
						<path d="M3 7l9-4 9 4-9 4-9-4z" />
						<path d="M3 7v6l9 4 9-4V7" />
						<path d="M12 11v6" />
					</svg>
				),
			},
			{
				to: "/syllabus",
				label: "Syllabus",
				icon: (
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
					>
						<path d="M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V4z" />
						<path d="M4 4v14a2 2 0 0 0 2 2" />
						<path d="M8 8h8M8 12h8M8 16h5" />
					</svg>
				),
			},
		],
	},
	{
		label: "Phụ huynh",
		items: [
			{
				to: "/reports",
				label: "Báo cáo",
				icon: (
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
					>
						<path d="M3 3v18h18" />
						<rect x="7" y="12" width="3" height="6" />
						<rect x="12" y="8" width="3" height="10" />
						<rect x="17" y="5" width="3" height="13" />
					</svg>
				),
			},
		],
	},
	{
		label: "Hệ thống",
		items: [
			{
				to: "/settings",
				label: "Cài đặt",
				icon: (
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
					>
						<circle cx="12" cy="12" r="3" />
						<path d="M19 12c0 .5 0 1-.1 1.5l2 1.5-2 3.4-2.4-1c-.7.6-1.5 1-2.4 1.3L14 21h-4l-.4-2.3c-.9-.3-1.7-.8-2.4-1.3l-2.4 1-2-3.4 2-1.5c-.1-.5-.1-1-.1-1.5s0-1 .1-1.5l-2-1.5 2-3.4 2.4 1c.7-.6 1.5-1 2.4-1.3L10 3h4l.4 2.3c.9.3 1.7.8 2.4 1.3l2.4-1 2 3.4-2 1.5c.1.5.1 1 .1 1.5z" />
					</svg>
				),
			},
		],
	},
];

export function Sidebar({
	open,
	onNavigate,
}: {
	open: boolean;
	onNavigate: () => void;
}) {
	const { session } = useRouteContext({ from: "/_auth" });

	// Hard invariant: inside _auth a session must exist; a missing session means
	// the guard chain is broken — fail loudly back to login instead of faking UI.
	if (!session?.data?.user) {
		throw redirect({ to: "/login" });
	}

	const user = session.data.user;
	const displayName = user.name || "Giáo viên";
	const initials =
		displayName === "Giáo viên"
			? "GV"
			: displayName
					.trim()
					.split(/\s+/)
					.slice(-2)
					.map((p) => p[0])
					.join("")
					.toUpperCase();

	return (
		<aside
			className={
				"sidebar app:sticky app:top-0 flex app:h-svh flex-col overflow-y-auto border-line app:border-r app:border-solid bg-surface px-4 py-5" +
				(open
					? "fixed top-0 left-0 z-100 w-[280px] translate-x-0 border-r border-solid shadow-[var(--elev-raised)] transition-transform duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)]"
					: "app:static fixed top-0 left-0 z-100 w-[280px] -translate-x-full app:translate-x-0 app:border-none app:shadow-none transition-transform duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)]")
			}
		>
			<div className="flex items-center gap-2 px-2 pb-5">
				<div className="grid h-8 w-8 place-items-center rounded-sm bg-fg font-display font-semibold text-[15px] text-bg tracking-[-0.02em]">
					T
				</div>
				<div className="font-display font-semibold text-base tracking-[-0.01em]">
					Teacher OS
				</div>
			</div>
			<nav className="flex flex-1 flex-col gap-0.5">
				{navSections.map((section) => (
					<div key={section.label ?? "main"}>
						{section.label && (
							<div className="px-3 pt-4 pb-2 font-mono text-[10px] text-meta uppercase tracking-[0.08em]">
								{section.label}
							</div>
						)}
						{section.items.map((item) => (
							<Link
								key={item.to}
								to={item.to}
								onClick={onNavigate}
								className="flex items-center gap-3 rounded-sm px-3 py-2 font-medium text-fg-2 text-sm transition-colors duration-[150ms] hover:bg-line-soft hover:text-fg focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:bg-accent-soft active:text-accent-blue aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-blue [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:shrink-0 [&>svg]:opacity-70 aria-[current=page]:[&>svg]:opacity-100"
							>
								{item.icon}
								{item.label}
							</Link>
						))}
					</div>
				))}
			</nav>
			<div className="mt-auto border-line-soft border-t border-solid pt-4">
				<div className="flex items-center gap-3 p-2">
					<span className="inline-grid h-9 w-9 place-items-center rounded-full border border-line-soft border-solid bg-surface font-display font-semibold text-[13px] text-fg">
						{initials}
					</span>
					<div className="min-w-0 leading-[1.3]">
						<div className="flex items-center font-semibold text-sm">
							<span className="truncate">{displayName}</span>
							<span className="ml-1 rounded-full bg-accent-soft px-[7px] py-px font-mono font-semibold text-[10px] text-accent-blue tracking-[0.04em]">
								PRO
							</span>
						</div>
						<div className="truncate text-muted-fg text-xs">Google</div>
					</div>
				</div>
			</div>
		</aside>
	);
}
