// @vitest-environment jsdom

import type { StudyPackSummaryView } from "@teacher-os/api/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRouterState, routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

const mockFetchStudyPacks =
	vi.fn<() => Promise<{ packs: StudyPackSummaryView[] }>>();

vi.mock("@/lib/repos/study-pack", () => ({
	fetchStudyPacks: () => mockFetchStudyPacks(),
	fetchStudyPackDetail: vi.fn(),
	createStudyPack: vi.fn(),
	updateStudyPack: vi.fn(),
	deleteStudyPack: vi.fn(),
	cloneStudyPack: vi.fn(),
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
	mockFetchStudyPacks.mockReset();
	mockFetchStudyPacks.mockResolvedValue({
		packs: [orgPackSummary, systemPackSummary],
	});
});

afterEach(() => {
	cleanup();
});

describe("StudyPacksRoute (/assignments/packs/)", () => {
	it("links org pack cards to /assignments/packs/$packId via Xem chi tiết and title link", async () => {
		routerState.search = {};
		render(<StudyPacksRoute />);

		const detailLink = (await screen.findByRole("link", {
			name: "Xem chi tiết",
		})) as HTMLAnchorElement;
		expect(detailLink.getAttribute("href")).toBe("/assignments/packs/org-1");

		const titleLink = screen.getByRole("link", {
			name: "Bộ đề Trung tâm B1",
		}) as HTMLAnchorElement;
		expect(titleLink.getAttribute("href")).toBe("/assignments/packs/org-1");
	});

	it("links system pack cards to /assignments/packs/$packId instead of opening legacy modal", async () => {
		routerState.search = { scope: "system" };
		render(<StudyPacksRoute />);

		const detailLink = (await screen.findByRole("link", {
			name: "Xem chi tiết",
		})) as HTMLAnchorElement;
		expect(detailLink.getAttribute("href")).toBe("/assignments/packs/sys-1");
		expect(screen.queryByRole("button", { name: "Xem chi tiết" })).toBeNull();
	});
});
