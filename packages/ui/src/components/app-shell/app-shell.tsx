import { cn } from "@teacher-os/ui/lib/utils";
import { Menu, PanelLeft } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Breadcrumbs } from "./breadcrumbs";
import {
	type NavGroup,
	type ShellLinkComponent,
	ShellLinkProvider,
} from "./nav-group";
import { Sidebar } from "./sidebar";
import type { ShellTeam } from "./team-switcher";
import type { ShellUser } from "./user-footer";

/** Thời gian chuyển drawer/collapse — khớp motion token (ease v2). */
const SHELL_EASE = "ease-[cubic-bezier(0.28,0,0.22,1)]";

/** Khớp chính xác breakpoint `lg:` của Tailwind v4 (`@media (width >= 64rem)`). */
const DESKTOP_MEDIA_QUERY = "(min-width: 64rem)";

/**
 * App shell dùng chung web + student (shadcn sidebar-07 theo design v2):
 * sidebar 16rem trên lg, drawer w-72 với overlay bên dưới lg, header h-14
 * (nút menu + breadcrumb + actions), nội dung trong card bo góc. Không phụ
 * thuộc router — điều hướng qua `linkComponent` và callback `onSelect`.
 */
export function AppShell({
	nav,
	activeKey,
	onSelect,
	team,
	user,
	crumbs = [],
	actions,
	linkComponent,
	navLabel,
	logo,
	footerSlot,
	collapsed = false,
	onToggleCollapse,
	dismissOnKeyChange,
	className,
	children,
}: {
	nav: NavGroup[];
	activeKey: string;
	onSelect?: (key: string) => void;
	team?: ShellTeam;
	user?: ShellUser;
	crumbs?: string[];
	actions?: ReactNode;
	/** Render link nav — web/student bọc TanStack `<Link>` của app. */
	linkComponent?: ShellLinkComponent;
	navLabel?: string;
	logo?: ReactNode;
	footerSlot?: ReactNode;
	/** Thu gọn desktop thành rail (web) — student không truyền. */
	collapsed?: boolean;
	onToggleCollapse?: () => void;
	/** Đổi giá trị này (vd. pathname) sẽ đóng drawer mobile. */
	dismissOnKeyChange?: string;
	className?: string;
	children: ReactNode;
}) {
	const [mobileOpen, setMobileOpen] = useState(false);
	const asideRef = useRef<HTMLElement>(null);
	const menuButtonRef = useRef<HTMLButtonElement>(null);
	const wasOpenRef = useRef(false);
	const dismissKeyRef = useRef(dismissOnKeyChange);

	// Esc đóng drawer trên window bubble để popover con trên document đóng trước.
	useEffect(() => {
		if (!mobileOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !event.defaultPrevented) {
				setMobileOpen(false);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [mobileOpen]);

	// Khi viewport nới rộng sang desktop (>= lg = 64rem) → tự đóng drawer mobile
	// để giải phóng trạng thái inert trên nội dung chính.
	useEffect(() => {
		if (
			!mobileOpen ||
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function"
		) {
			return;
		}
		const mql = window.matchMedia(DESKTOP_MEDIA_QUERY);
		if (mql.matches) {
			setMobileOpen(false);
			return;
		}
		const onChange = (event: MediaQueryListEvent) => {
			if (event.matches) setMobileOpen(false);
		};
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, [mobileOpen]);

	// Route đổi (kể cả back/forward) → đóng drawer như shell v1.
	useEffect(() => {
		if (dismissKeyRef.current !== dismissOnKeyChange) {
			dismissKeyRef.current = dismissOnKeyChange;
			setMobileOpen(false);
		}
	}, [dismissOnKeyChange]);

	// Mở drawer → chuyển focus vào aside; đóng drawer dưới lg → trả focus về nút mở.
	useEffect(() => {
		if (!wasOpenRef.current && mobileOpen) {
			asideRef.current?.focus();
		} else if (wasOpenRef.current && !mobileOpen) {
			const isDesktop =
				typeof window !== "undefined" &&
				typeof window.matchMedia === "function" &&
				window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
			if (isDesktop) {
				if (document.activeElement === asideRef.current) {
					asideRef.current?.blur();
				}
			} else {
				menuButtonRef.current?.focus();
			}
		}
		wasOpenRef.current = mobileOpen;
	}, [mobileOpen]);

	const closeDrawer = () => setMobileOpen(false);

	const shell = (
		<div
			className={cn(
				"min-h-svh bg-sidebar transition-[grid-template-columns] duration-200 motion-reduce:transition-none lg:grid",
				SHELL_EASE,
				collapsed ? "lg:grid-cols-[4rem_1fr]" : "lg:grid-cols-[16rem_1fr]",
				className,
			)}
		>
			{/* Hook e2e: `aside.sidebar` duy nhất — cột desktop trên lg, drawer
				w-72 trượt bên dưới lg. */}
			<aside
				ref={asideRef}
				tabIndex={-1}
				className={cn(
					"sidebar fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col overflow-hidden border-sidebar-border border-r bg-sidebar text-sidebar-foreground duration-200 focus:outline-none motion-reduce:transition-none",
					"lg:pointer-events-auto lg:visible lg:sticky lg:top-0 lg:z-auto lg:h-svh lg:w-auto lg:translate-x-0 lg:border-r-0 lg:shadow-none",
					SHELL_EASE,
					mobileOpen
						? "visible translate-x-0 shadow-lg transition-[transform,translate]"
						: "pointer-events-none invisible -translate-x-full shadow-none transition-[transform,translate,visibility]",
				)}
			>
				<Sidebar
					nav={nav}
					activeKey={activeKey}
					onSelect={(key) => {
						onSelect?.(key);
						closeDrawer();
					}}
					team={team}
					user={
						user
							? user.menu
								? user
								: {
										...user,
										onClick: () => {
											user.onClick?.();
											closeDrawer();
										},
									}
							: undefined
					}
					collapsed={collapsed}
					navLabel={navLabel}
					logo={logo}
					footerSlot={footerSlot}
					className="h-full"
				/>
			</aside>
			{mobileOpen && (
				// biome-ignore lint/a11y/noStaticElementInteractions: overlay chỉ tồn tại để bấm đóng drawer
				<div
					role="presentation"
					className="fixed inset-0 z-40 bg-black/50 lg:hidden"
					onClick={closeDrawer}
				/>
			)}
			<div
				inert={mobileOpen}
				className="flex min-w-0 flex-col bg-background lg:m-2 lg:ml-0 lg:rounded-xl lg:border lg:shadow-sm"
			>
				<header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 lg:px-6">
					<button
						ref={menuButtonRef}
						type="button"
						aria-label="Open navigation"
						aria-expanded={mobileOpen}
						onClick={() => setMobileOpen(true)}
						className="-ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden [&_svg]:size-4"
					>
						<Menu aria-hidden="true" />
					</button>
					{onToggleCollapse && (
						<button
							type="button"
							onClick={onToggleCollapse}
							aria-label={
								collapsed
									? "Mở rộng thanh điều hướng"
									: "Thu gọn thanh điều hướng"
							}
							title="Thu gọn/mở rộng thanh điều hướng"
							data-testid="sidebar-toggle"
							className="hidden size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:inline-flex [&_svg]:size-4"
						>
							<PanelLeft aria-hidden="true" />
						</button>
					)}
					<Breadcrumbs crumbs={crumbs} />
					<div className="ml-auto flex items-center gap-2">{actions}</div>
				</header>
				<main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6 lg:p-8">
					{children}
				</main>
			</div>
		</div>
	);

	// Không có linkComponent → nav-group tự dùng <a> dự phòng (context default).
	if (!linkComponent) return shell;
	return (
		<ShellLinkProvider linkComponent={linkComponent}>{shell}</ShellLinkProvider>
	);
}
