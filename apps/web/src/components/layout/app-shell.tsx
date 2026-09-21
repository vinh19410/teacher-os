import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { DataProvider } from "@/lib/data-store";
import { PARENT_REPORTS_ENABLED } from "@/lib/features";
import { readCollapsedPref, writeCollapsedPref } from "@/lib/sidebar-prefs";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export const routeTitles: Record<string, string> = {
	"/_auth": "Tổng quan",
	"/_auth/dashboard": "Tổng quan",
	"/_auth/students": "Học viên",
	"/_auth/students/$studentId": "Học viên",
	"/_auth/schedule": "Lịch dạy",
	"/_auth/tuition": "Học phí",
	"/_auth/assignments": "Bài tập",
	"/_auth/assignments/$assignmentId": "Bài tập",
	"/_auth/assignments/new": "Tạo bài tập",
	"/_auth/assignments/bank": "Ngân hàng bài tập",
	"/_auth/classes": "Lớp học",
	"/_auth/classes/$classId": "Lớp học",
	"/_auth/syllabus": "Giáo trình",
	"/_auth/syllabus/$syllabusId": "Giáo trình",
	...(PARENT_REPORTS_ENABLED ? { "/_auth/reports": "Báo cáo phụ huynh" } : {}),
	"/_auth/profile": "Hồ sơ",
	"/_auth/settings": "Cài đặt",
};

function useCurrentTitle(): string {
	return useRouterState({
		select: (s) => {
			const last = s.matches.at(-1);
			return last ? (routeTitles[last.routeId] ?? "") : "";
		},
	});
}

function ShellBody({
	onMenuClick,
	collapsed,
	onToggleCollapse,
}: {
	onMenuClick: () => void;
	collapsed: boolean;
	onToggleCollapse: () => void;
}) {
	const title = useCurrentTitle();
	return (
		<div className="main flex min-w-0 flex-col">
			<Topbar
				title={title}
				onMenuClick={onMenuClick}
				collapsed={collapsed}
				onToggleCollapse={onToggleCollapse}
			/>
			<main className="content max-w-full flex-1 overflow-x-hidden p-6 max-app:p-4">
				<Outlet />
			</main>
		</div>
	);
}

export function AppShell() {
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [collapsed, setCollapsed] = useState(readCollapsedPref);
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	useEffect(() => {
		writeCollapsedPref(collapsed);
	}, [collapsed]);

	// Close the drawer whenever the route changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the route-change trigger; body only closes the drawer
	useEffect(() => {
		setSidebarOpen(false);
	}, [pathname]);

	// Escape closes the drawer
	useEffect(() => {
		if (!sidebarOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setSidebarOpen(false);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [sidebarOpen]);

	return (
		<DataProvider>
			<div
				className={cn(
					"app grid min-h-svh grid-cols-1 transition-[grid-template-columns] duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] motion-reduce:transition-none",
					collapsed ? "app:grid-cols-[64px_1fr]" : "app:grid-cols-[248px_1fr]",
				)}
			>
				<Sidebar
					open={sidebarOpen}
					onNavigate={() => setSidebarOpen(false)}
					collapsed={collapsed}
				/>
				{sidebarOpen && (
					// biome-ignore lint/a11y/noStaticElementInteractions: scrim exists only on mobile; Escape handler + click both close it
					<div
						role="presentation"
						className="scrim fixed inset-0 z-90 app:hidden bg-[color-mix(in_oklab,var(--fg),transparent_60%)]"
						onClick={() => setSidebarOpen(false)}
					/>
				)}
				<ShellBody
					onMenuClick={() => setSidebarOpen(true)}
					collapsed={collapsed}
					onToggleCollapse={() => setCollapsed((v) => !v)}
				/>
			</div>
		</DataProvider>
	);
}
