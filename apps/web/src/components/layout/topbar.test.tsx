// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Notif } from "@/lib/mock-data";
import { Topbar } from "./topbar";

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useRouteContext: () => ({ session: { data: { user: { name: "Cô Lan" } } } }),
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

const store: { notifs: Notif[] } = { notifs: [] };

vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		data: { notifs: store.notifs, students: [], classes: [] },
	}),
}));

afterEach(() => {
	cleanup();
	store.notifs = [];
});

function renderTopbar() {
	return render(
		<Topbar
			title="Tổng quan"
			onMenuClick={() => {}}
			collapsed={false}
			onToggleCollapse={() => {}}
		/>,
	);
}

describe("Topbar notifications", () => {
	it("shows no unread badge when there are no notifications", () => {
		renderTopbar();
		expect(screen.queryByTestId("notif-badge")).toBeNull();
	});

	it("shows the unread badge inside the bell once a notification exists", () => {
		store.notifs = [
			{
				id: "n-1",
				text: "Có học phí mới",
				time: "10:30",
				channel: "Học phí",
				dot: "accent",
			},
		];
		renderTopbar();
		const bell = screen.getByRole("button", { name: "Thông báo" });
		expect(bell.contains(screen.getByTestId("notif-badge"))).toBe(true);
	});

	it("toggles the panel listing the notifications from the bell", () => {
		store.notifs = [
			{
				id: "n-1",
				text: "Có học phí mới",
				time: "10:30",
				channel: "Học phí",
				dot: "accent",
			},
		];
		renderTopbar();
		expect(screen.queryByText("Có học phí mới")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Thông báo" }));
		expect(screen.getByText("Có học phí mới")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Thông báo" }));
		expect(screen.queryByText("Có học phí mới")).toBeNull();
	});

	it("pushes the bell to the right edge on mobile, where search is hidden", () => {
		renderTopbar();
		const bellWrap = screen.getByRole("button", { name: "Thông báo" })
			.parentElement as HTMLElement;
		expect(bellWrap.className).toContain("max-app:ml-auto");
	});
});
