import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
} from "@tanstack/react-router";
import { Toaster } from "@teacher-os/ui/components/sonner";
import { NotFoundPage } from "@/components/not-found";

import "../index.css";

export type RouterAppContext = Record<string, never>;

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	notFoundComponent: NotFoundPage,
	head: () => ({
		meta: [
			{
				title: "Teacher OS · Quản lý lớp gia sư 1:1",
			},
			{
				name: "description",
				content:
					"Teacher OS — quản lý lớp gia sư 1:1: học viên, lịch dạy, học phí, bài tập.",
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
			<Toaster richColors theme="light" />
		</>
	);
}
