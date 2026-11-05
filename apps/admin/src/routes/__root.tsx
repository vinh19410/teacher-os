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
				title: "Cô Mỹ Dạy Tiếng Anh · Quản trị",
			},
			{
				name: "description",
				content: "Cô Mỹ Dạy Tiếng Anh — Cổng quản trị.",
			},
		],
		links: [
			{
				rel: "icon",
				href: "/favicon.ico",
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
