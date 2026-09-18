import {
	Link,
	redirect,
	useNavigate,
	useRouteContext,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { initialsFromName } from "@/lib/initials";
import { VersionBadge } from "./version-badge";

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

export function Sidebar({
	open,
	onNavigate,
	collapsed,
}: {
	open: boolean;
	onNavigate: () => void;
	collapsed: boolean;
}) {
	const { session } = useRouteContext({ from: "/_auth" });
	const navigate = useNavigate();

	// Hard invariant: inside _auth a session must exist; a missing session means
	// the guard chain is broken — fail loudly back to login instead of faking UI.
	if (!session?.data?.user) {
		throw redirect({ to: "/login" });
	}

	const user = session.data.user;
	const displayName = user.name || "Giáo viên";
	const initials = initialsFromName(displayName);
	const plan = extractUserPlan(user);
	return (
		<aside
			className={cn(
				// Desktop: fill the grid track (app:w-full); the base w-[280px] is the mobile drawer width.
				// Base px-4 serves the mobile drawer; when collapsed we only append app:px-2 to override
				// horizontal padding on desktop. Geometry invariant (D2): rail_width - 2*aside_px >= 48px
				// for the Avatar md (40px) plus focus-ring room -> 64 - 2*8 = 48.
				// cn() joins fragments with explicit spaces — biome --write trims edge
				// whitespace inside JSX className literals, so string concat is unsafe here.
				"sidebar app:sticky app:top-0 flex app:h-svh app:w-full flex-col overflow-y-auto border-line app:border-r app:border-solid bg-surface px-4 pt-8 pb-5",
				collapsed && "app:px-2",
				open
					? "fixed top-0 left-0 z-100 w-[280px] translate-x-0 border-r border-solid shadow-[var(--elev-raised)] transition-transform duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)]"
					: "fixed top-0 left-0 z-100 w-[280px] -translate-x-full app:translate-x-0 app:border-none app:shadow-none transition-transform duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)]",
			)}
		>
			{/* -mt-2 offsets p-2 so the logo row still sits at the pt-8 baseline; keep them in sync. */}
			<Link
				to="/"
				onClick={onNavigate}
				title="Về trang chủ"
				className="-mt-2 mb-3 flex items-center gap-2 self-start rounded-sm p-2 transition-colors duration-[150ms] hover:bg-line-soft focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
			>
				<div className="grid h-8 w-8 place-items-center rounded-sm bg-fg font-display font-semibold text-[15px] text-bg tracking-[-0.02em]">
					T
				</div>
				<div
					className={cn(
						"flex items-center gap-2 font-display font-semibold text-base tracking-[-0.01em]",
						// Collapsed-branch classes are always app:-prefixed (D10) so they cannot leak into the mobile drawer.
						collapsed && "app:hidden",
					)}
				>
					<span>Teacher OS</span>
					<VersionBadge />
				</div>
			</Link>
			<nav className="flex flex-1 flex-col gap-0.5">
				{navSections.map((section) => (
					<div key={section.label ?? "main"}>
						{section.label && (
							// Both section-label and divider stay in the DOM; visibility is decided purely
							// by app:-variants (D11) so the mobile drawer keeps full labels even when collapsed.
							<div
								className={cn(
									"px-3 pt-4 pb-2 font-mono text-[10px] text-meta uppercase tracking-[0.08em]",
									collapsed && "app:hidden",
								)}
							>
								{section.label}
							</div>
						)}
						{section.label && (
							<hr
								className={cn(
									// Base "hidden" gates every viewport; only the display switch is
									// collapsed-conditional and app:-prefixed (D10) — the decorative
									// styling stays unconditional, safely dead while hidden.
									"hidden",
									collapsed &&
										"mx-auto my-2 app:block w-6 border-line-soft border-t",
								)}
							/>
						)}
						{section.items.map((item) => (
							<Link
								key={item.to}
								to={item.to}
								onClick={onNavigate}
								title={item.label}
								className={cn(
									"flex items-center gap-3 rounded-sm px-3 py-2 font-medium text-fg-2 text-sm transition-colors duration-[150ms] hover:bg-line-soft hover:text-fg focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:bg-accent-soft active:text-accent-blue aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-blue [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:shrink-0 [&>svg]:opacity-70 aria-[current=page]:[&>svg]:opacity-100",
									// Collapsed-branch classes are always app:-prefixed (D10).
									collapsed && "app:justify-center app:px-0",
								)}
							>
								{item.icon}
								<span className={collapsed ? "app:sr-only" : undefined}>
									{item.label}
								</span>
							</Link>
						))}
					</div>
				))}
			</nav>
			<div className="mt-auto border-line-soft border-t border-solid pt-4">
				<div
					className={cn(
						"flex items-center gap-3 p-2",
						// Vertical rail footer (D7): flex-col lives on the row that actually
						// contains the avatar link and the logout button.
						collapsed && "app:flex-col app:items-center app:gap-2 app:p-0",
					)}
				>
					<Link
						to="/profile"
						title={
							displayName ? `${displayName} (${user.email})` : "Hồ sơ cá nhân"
						}
						aria-label="Hồ sơ cá nhân"
						className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left hover:bg-line-soft focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
					>
						<Avatar
							text={initials}
							src={user.image}
							size="md"
							imgProps={{ "data-testid": "sidebar-avatar" }}
						/>
						<div className="min-w-0 flex-1 leading-[1.3]">
							<div
								className={cn(
									"flex items-center font-semibold text-sm",
									// Collapsed-branch classes are always app:-prefixed (D10).
									collapsed && "app:hidden",
								)}
							>
								<span className="truncate" title={displayName}>
									{displayName}
								</span>
								{plan && (
									<span
										className="ml-1 shrink-0 rounded-full bg-accent-soft px-[7px] py-px font-mono font-semibold text-[10px] text-accent-blue tracking-[0.04em]"
										data-testid="sidebar-user-plan"
									>
										{plan}
									</span>
								)}
							</div>
							<div
								className={cn(
									"truncate text-muted-fg text-xs",
									// Kept visible for screen readers when collapsed (phase-02 M1)
									// so the testid and accessible email survive in the rail too.
									collapsed && "app:sr-only",
								)}
								data-testid="sidebar-user-email"
								title={user.email}
							>
								{user.email}
							</div>
						</div>
					</Link>
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
						className={cn(
							"ml-auto grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-sm border border-line-soft border-solid bg-bg text-fg-2 transition-colors duration-[150ms] hover:border-line hover:bg-surface hover:text-fg focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
							collapsed && "app:ml-0",
						)}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.6"
							className="h-[17px] w-[17px]"
						>
							<path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
							<path d="M16 17l5-5-5-5" />
							<path d="M21 12H9" />
						</svg>
					</button>
				</div>
			</div>
		</aside>
	);
}
