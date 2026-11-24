import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
} from "@tanstack/react-router";
import { Toaster } from "@teacher-os/ui/components/sonner";

import "../index.css";

export type RouterAppContext = Record<string, never>;

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		meta: [
			{
				title: "Cô Mỹ Dạy Tiếng Anh · Hệ thống học tập",
			},
			{
				name: "description",
				content:
					"Cô Mỹ Dạy Tiếng Anh — Cổng đăng nhập và học tập thống nhất cho giáo viên, học viên và quản trị.",
			},
		],
		links: [
			{
				rel: "icon",
				href: "/logo.png",
			},
		],
	}),
});

function RootComponent() {
	return (
		<>
			<HeadContent />
			<div className="min-h-svh">
				<Outlet />
			</div>
			<Toaster />
		</>
	);
}
