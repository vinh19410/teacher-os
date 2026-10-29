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
	// Đủ 4 collection kernel — CommandSearch kiểm tra snapshot đã tải qua
	// các mảng này (isSnapshotLoaded trong search-index).
	useData: () => ({
		data: {
			notifs: store.notifs,
			students: [],
			classes: [],
			assignments: [],
			invoices: [],
		},
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

describe("TopbarActions layout v2 (phase 8 — trigger ⌘K)", () => {
	it("renders the desktop trigger hidden below md with the Kbd badge", () => {
		renderActions();
		const trigger = screen.getByTestId("command-search-trigger");
		expect(trigger.textContent).toContain("Tìm kiếm…");
		expect(trigger.textContent).toContain("⌘K");
		expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
		// Theo design v2: khung w-56 ẩn dưới md.
		expect(trigger.className).toContain("hidden");
		expect(trigger.className).toContain("md:inline-flex");
	});

	it("renders the icon-only trigger below md with an accessible name", () => {
		renderActions();
		const iconTrigger = screen.getByTestId("command-search-trigger-icon");
		expect(iconTrigger.getAttribute("aria-label")).toBe("Tìm kiếm");
		expect(iconTrigger.getAttribute("aria-haspopup")).toBe("dialog");
		expect(iconTrigger.className).toContain("md:hidden");
	});
});
