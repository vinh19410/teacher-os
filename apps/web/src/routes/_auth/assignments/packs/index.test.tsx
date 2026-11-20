// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StudyPackSummaryView } from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRouterState, routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

const mockFetchStudyPacks =
	vi.fn<() => Promise<{ packs: StudyPackSummaryView[] }>>();
const mockDeleteStudyPack = vi.fn<(id: string) => Promise<{ ok: true }>>();

vi.mock("@/lib/repos/study-pack", () => ({
	fetchStudyPacks: () => mockFetchStudyPacks(),
	fetchStudyPackDetail: vi.fn(),
	createStudyPack: vi.fn(),
	updateStudyPack: vi.fn(),
	deleteStudyPack: (id: string) => mockDeleteStudyPack(id),
}));

const mockStore = vi.hoisted(() => ({
	data: {
		viewer: { role: "teacher" },
		assignmentPrompts: [],
	},
}));

vi.mock("@/lib/data-store", () => ({
	useData: () => mockStore,
}));

import { StudyPacksRoute } from "./index";

function renderPacksRoute() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<StudyPacksRoute />
		</QueryClientProvider>,
	);
}

const orgPackSummary: StudyPackSummaryView = {
	id: "org-1",
	orgId: "org-a",
	scope: "org",
	sourcePackId: null,
	title: "Bộ đề Trung tâm B1",
	description: "Ôn tập Reading",
	level: "B1",
	status: "ready",
	dayCount: 5,
	itemCount: 5,
	createdAt: "2026-11-01T00:00:00.000Z",
	updatedAt: "2026-11-01T00:00:00.000Z",
};

const systemPackSummary: StudyPackSummaryView = {
	...orgPackSummary,
	id: "sys-1",
	orgId: null,
	scope: "system",
	title: "Bộ đề Hệ thống IELTS",
	level: "B2",
};

beforeEach(() => {
	resetRouterState();
	mockStore.data.viewer = { role: "teacher" };
	mockFetchStudyPacks.mockReset();
	mockDeleteStudyPack.mockReset();
	mockFetchStudyPacks.mockResolvedValue({
		packs: [orgPackSummary, systemPackSummary],
	});
});

afterEach(() => {
	cleanup();
});

describe("StudyPacksRoute (/assignments/packs/)", () => {
	it("renders both org and system packs in unified list with badges and action buttons", async () => {
		routerState.search = {};
		renderPacksRoute();

		// Both cards are present
		expect(
			await screen.findByRole("heading", { name: "Bộ đề Trung tâm B1" }),
		).toBeTruthy();
		expect(
			screen.getByRole("heading", { name: "Bộ đề Hệ thống IELTS" }),
		).toBeTruthy();

		// Scope filter chips & card badges
		expect(screen.getByRole("button", { name: "Trung tâm" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Hệ thống" })).toBeTruthy();
		expect(screen.getAllByText("Trung tâm")).toHaveLength(2);
		expect(screen.getAllByText("Hệ thống")).toHaveLength(2);

		// Detail links
		const detailLinks = screen.getAllByRole("link", {
			name: "Xem chi tiết",
		}) as HTMLAnchorElement[];
		expect(detailLinks).toHaveLength(2);
		expect(detailLinks[0]?.getAttribute("href")).toBe(
			"/assignments/packs/org-1",
		);
		expect(detailLinks[1]?.getAttribute("href")).toBe(
			"/assignments/packs/sys-1",
		);

		// Both cards have Edit and Delete buttons (no Clone button)
		const editButtons = screen.getAllByRole("button", { name: "Chỉnh sửa" });
		expect(editButtons).toHaveLength(2);
		const deleteButtons = screen.getAllByRole("button", { name: "Xoá" });
		expect(deleteButtons).toHaveLength(2);
		expect(
			screen.queryByRole("button", { name: "Nhân bản về trung tâm" }),
		).toBeNull();
	});

	it("filters by scope using ChipFilter", async () => {
		routerState.search = {};
		renderPacksRoute();

		await screen.findByText("Bộ đề Trung tâm B1");

		// Click "Hệ thống" chip in Nguồn bộ đề group
		const systemChip = screen.getByRole("button", {
			name: "Hệ thống",
		});
		fireEvent.click(systemChip);

		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/assignments/packs",
			search: { scope: "system" },
			replace: true,
		});
	});

	it("requires delete confirmation modal and surfaces 409 error on assigned pack", async () => {
		mockDeleteStudyPack.mockRejectedValueOnce(
			Object.assign(new Error("conflict"), { status: 409 }),
		);
		routerState.search = {};
		renderPacksRoute();

		const deleteButtons = await screen.findAllByRole("button", { name: "Xoá" });
		const firstDeleteBtn = deleteButtons[0];
		expect(firstDeleteBtn).toBeDefined();
		if (firstDeleteBtn) fireEvent.click(firstDeleteBtn);

		expect(
			await screen.findByText(
				/Bạn có chắc muốn xoá bộ đề "Bộ đề Trung tâm B1"/,
			),
		).toBeTruthy();
		expect(mockDeleteStudyPack).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "Xác nhận xoá" }));
		expect(
			await screen.findByText("Không thể xoá bộ đề đã gán cho lớp học."),
		).toBeTruthy();
		await waitFor(() => {
			expect(mockDeleteStudyPack).toHaveBeenCalledWith("org-1");
		});
	});
});
