// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Notif } from "@/lib/mock-data";
import { TopbarActions } from "./topbar";

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
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

function renderActions() {
	return render(<TopbarActions />);
}

describe("TopbarActions notifications", () => {
	it("shows no unread badge when there are no notifications", () => {
		renderActions();
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
		renderActions();
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
		renderActions();
		expect(screen.queryByText("Có học phí mới")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Thông báo" }));
		expect(screen.getByText("Có học phí mới")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Thông báo" }));
		expect(screen.queryByText("Có học phí mới")).toBeNull();
	});
});

describe("TopbarActions layout v2", () => {
	it("keeps the global search contract for the e2e spec, hidden below md", () => {
		renderActions();
		const input = screen.getByRole("combobox");
		expect(input.getAttribute("placeholder")).toBe("Tìm học viên, lớp học…");
		expect(input.getAttribute("aria-controls")).toBe("global-search-listbox");
		// Trigger ⌘K (phase 8) cũng ẩn dưới md — giữ sẵn hành vi.
		const wrapper = input.closest("div") as HTMLElement;
		expect(wrapper.className).toContain("hidden");
		expect(wrapper.className).toContain("md:flex");
	});
});
