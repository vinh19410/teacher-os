// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
	StudyPackDetailView,
	StudyPackItemDetailView,
} from "@teacher-os/api/contracts";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRouterState, routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

const mockFetchStudyPackDetail =
	vi.fn<(packId: string) => Promise<{ pack: StudyPackDetailView }>>();
const mockGetStudyPackItemDetail =
	vi.fn<(packId: string, itemId: string) => Promise<StudyPackItemDetailView>>();
const mockFetchStudyPackItemAudio = vi.fn<() => Promise<string>>();
const mockCloneStudyPack =
	vi.fn<(packId: string) => Promise<{ pack: StudyPackDetailView }>>();
const mockDeleteStudyPack = vi.fn<(packId: string) => Promise<{ ok: true }>>();
const mockUpdateStudyPack =
	vi.fn<() => Promise<{ pack: StudyPackDetailView }>>();
const mockCreateStudyPack =
	vi.fn<() => Promise<{ pack: StudyPackDetailView }>>();
const mockFetchClassStudyPacks = vi.fn(async () => ({
	packs: [],
	holidays: [],
}));
const mockAssignStudyPackToClass = vi.fn();

vi.mock("@/lib/repos/study-pack", () => ({
	fetchStudyPackDetail: (packId: string) => mockFetchStudyPackDetail(packId),
	getStudyPackItemDetail: (packId: string, itemId: string) =>
		mockGetStudyPackItemDetail(packId, itemId),
	fetchStudyPackItemAudio: () => mockFetchStudyPackItemAudio(),
	cloneStudyPack: (packId: string) => mockCloneStudyPack(packId),
	deleteStudyPack: (packId: string) => mockDeleteStudyPack(packId),
	updateStudyPack: () => mockUpdateStudyPack(),
	createStudyPack: () => mockCreateStudyPack(),
	fetchClassStudyPacks: () => mockFetchClassStudyPacks(),
	assignStudyPackToClass: (...args: unknown[]) =>
		mockAssignStudyPackToClass(...args),
}));

const mockStore = vi.hoisted(() => ({
	data: {
		viewer: { role: "teacher" },
		classes: [
			{
				id: "cl-1",
				name: "Lớp IELTS 6.5",
				level: "6.5",
				type: "ielts",
				skills: ["Reading"],
				mode: "Online",
				syllabusId: null,
				schedule: "T2",
				sessionsTotal: 12,
				sessionsDone: 2,
				status: "active",
			},
		],
		holidays: [],
		assignmentPrompts: [],
	},
}));

vi.mock("@/lib/data-store", () => ({
	useData: () => mockStore,
}));

import { StudyPackDetailRoute } from "./$packId";

function renderDetailRoute() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<StudyPackDetailRoute />
		</QueryClientProvider>,
	);
}

const systemPack: StudyPackDetailView = {
	id: "sys-pack-1",
	orgId: null,
	scope: "system",
	sourcePackId: null,
	title: "Bộ đề Chuẩn IELTS B2",
	description: "Lộ trình 3 buổi tổng hợp Reading & Listening",
	level: "B2",
	status: "ready",
	dayCount: 3,
	itemCount: 3,
	createdAt: "2026-11-01T00:00:00.000Z",
	updatedAt: "2026-11-01T00:00:00.000Z",
	items: [
		{
			id: "item-1",
			dayIndex: 1,
			position: 0,
			sourceKind: "library_exercise",
			sourceId: "ex-1",
			title: "Reading: Climate Change",
			skill: "reading",
			part: "p1",
			type: "mcq",
			level: "B2",
			status: "ready",
			note: "Đọc lướt tiêu đề trước",
		},
		{
			id: "item-2",
			dayIndex: 2,
			position: 0,
			sourceKind: "library_exercise",
			sourceId: "ex-2",
			title: "Listening: Campus Tour",
			skill: "listening",
			part: "p1",
			type: "mcq",
			level: "B2",
			status: "ready",
			note: "",
		},
		{
			id: "item-3",
			dayIndex: 3,
			position: 0,
			sourceKind: "library_exercise",
			sourceId: "ex-3",
			title: "Grammar: Conditionals",
			skill: "grammar",
			part: "p1",
			type: "mcq",
			level: "B2",
			status: "ready",
			note: "",
		},
	],
};

const orgPack: StudyPackDetailView = {
	...systemPack,
	id: "org-pack-1",
	orgId: "org-1",
	scope: "org",
	title: "Bộ đề Trung tâm 14 ngày",
};

function makeItemDetail(
	id: string,
	title: string,
	skill: string,
): StudyPackItemDetailView {
	return {
		id,
		dayIndex: 1,
		position: 0,
		sourceKind: "library_exercise",
		sourceId: "ex-1",
		title,
		skill,
		part: "p1",
		type: "mcq",
		level: "B2",
		status: "ready",
		note: "",
		band: "6.5",
		source: "Cambridge",
		prompt: "",
		intro: "",
		passage: `Nội dung của ${title}`,
		transcript: "",
		audioName: "",
		hasAudio: false,
		imageUrl: "",
		optionBank: [],
		exerciseNote: "",
		questions: [
			{
				stem: `Câu hỏi cho ${title}`,
				opts: ["Option A", "Option B"],
				answer: "A",
				alts: "",
				type: "mcq",
			},
		],
	};
}

beforeEach(() => {
	resetRouterState();
	routerState.params = { packId: "sys-pack-1" };
	mockStore.data.viewer = { role: "teacher" };
	mockFetchStudyPackDetail.mockReset();
	mockGetStudyPackItemDetail.mockReset();
	mockCloneStudyPack.mockReset();
	mockDeleteStudyPack.mockReset();
	mockGetStudyPackItemDetail.mockImplementation(async (_packId, itemId) => {
		const found = systemPack.items.find((it) => it.id === itemId);
		return makeItemDetail(
			itemId,
			found?.title ?? "Reading: Climate Change",
			found?.skill ?? "reading",
		);
	});
});

afterEach(() => {
	vi.useRealTimers();
	cleanup();
});

describe("StudyPackDetailRoute (/assignments/packs/$packId)", () => {
	it("renders system pack actions, selects first item, and navigates to cloned org pack", async () => {
		mockFetchStudyPackDetail.mockResolvedValue({ pack: systemPack });
		mockCloneStudyPack.mockResolvedValue({
			pack: { ...orgPack, id: "org-clone-99" },
		});

		renderDetailRoute();

		expect(
			await screen.findByRole("heading", { name: "Bộ đề Chuẩn IELTS B2" }),
		).toBeTruthy();
		expect(screen.getByText("Hệ thống")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Gán cho lớp" })).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Nhân bản về trung tâm" }),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Chỉnh sửa" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Xoá" })).toBeNull();

		// First item auto-selected and rendered in StudyPackItemViewer
		expect(
			await screen.findByText("Nội dung của Reading: Climate Change"),
		).toBeTruthy();

		fireEvent.click(
			screen.getByRole("button", { name: "Nhân bản về trung tâm" }),
		);
		await waitFor(() => {
			expect(mockCloneStudyPack).toHaveBeenCalledWith("sys-pack-1");
			expect(routerState.navigate).toHaveBeenCalledWith({
				to: "/assignments/packs/$packId",
				params: { packId: "org-clone-99" },
				search: {},
			});
		});
	});

	it("renders org pack edit/delete controls and handles 409 + confirm delete", async () => {
		routerState.params = { packId: "org-pack-1" };
		mockFetchStudyPackDetail.mockResolvedValue({ pack: orgPack });
		mockDeleteStudyPack
			.mockRejectedValueOnce(
				Object.assign(new Error("in use"), { status: 409 }),
			)
			.mockResolvedValueOnce({ ok: true });

		renderDetailRoute();

		expect(
			await screen.findByRole("heading", { name: "Bộ đề Trung tâm 14 ngày" }),
		).toBeTruthy();
		expect(screen.getByText("Trung tâm")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Chỉnh sửa" })).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "Nhân bản về trung tâm" }),
		).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
		const dialog = screen.getByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Xác nhận xoá" }),
		);

		expect(
			await within(dialog).findByText(
				"Không thể xoá bộ đề đã gán cho lớp học.",
			),
		).toBeTruthy();

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Xác nhận xoá" }),
		);
		await waitFor(() => {
			expect(mockDeleteStudyPack).toHaveBeenCalledWith("org-pack-1");
			expect(routerState.navigate).toHaveBeenCalledWith({
				to: "/assignments/packs",
				search: {},
			});
		});
	});

	it("hides mutation actions for ta role", async () => {
		mockStore.data.viewer = { role: "ta" };
		routerState.params = { packId: "org-pack-1" };
		mockFetchStudyPackDetail.mockResolvedValue({ pack: orgPack });

		renderDetailRoute();

		expect(
			await screen.findByRole("heading", { name: "Bộ đề Trung tâm 14 ngày" }),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Gán cho lớp" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Chỉnh sửa" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Xoá" })).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Nhân bản về trung tâm" }),
		).toBeNull();
	});

	it("renders 404 state with back link when study pack is missing", async () => {
		mockFetchStudyPackDetail.mockRejectedValue(
			Object.assign(new Error("not found"), { status: 404 }),
		);

		renderDetailRoute();

		expect(
			await screen.findByRole("heading", { name: "Không tìm thấy bộ đề" }),
		).toBeTruthy();
		const backLink = screen.getByRole("link", {
			name: "Quay lại Bộ đề tự học",
		}) as HTMLAnchorElement;
		expect(backLink.getAttribute("href")).toBe("/assignments/packs");
	});

	it("debounces search input 300ms to URL, filters by skill chip, and steps with Prev/Next", async () => {
		mockFetchStudyPackDetail.mockResolvedValue({ pack: systemPack });

		renderDetailRoute();

		await screen.findByText("Nội dung của Reading: Climate Change");
		expect(screen.getByText("Hiển thị 3/3 bài tập")).toBeTruthy();

		// Step forward via "Buổi sau"
		fireEvent.click(screen.getByRole("button", { name: "Buổi sau" }));
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/assignments/packs/$packId",
			params: { packId: "sys-pack-1" },
			search: { item: "item-2" },
			replace: true,
		});

		// Filter via ChipFilter
		fireEvent.click(screen.getByRole("button", { name: /^Listening/ }));
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/assignments/packs/$packId",
			params: { packId: "sys-pack-1" },
			search: { skill: "listening" },
			replace: true,
		});

		// Debounced search query
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const searchInput = screen.getByLabelText("Tìm bài tập trong bộ đề");
		fireEvent.change(searchInput, { target: { value: "Campus" } });
		expect(screen.getByText("Hiển thị 1/3 bài tập")).toBeTruthy();

		await act(async () => {
			vi.advanceTimersByTime(320);
		});

		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/assignments/packs/$packId",
			params: { packId: "sys-pack-1" },
			search: { q: "Campus" },
			replace: true,
		});
		// Skill filter chips remain visible while search narrows to a single skill
		expect(screen.getByRole("button", { name: /^Reading/ })).toBeTruthy();
		expect(screen.getByRole("button", { name: /^Grammar/ })).toBeTruthy();
	});

	it("clears stale ?item= on skill change, resets pending query across pack navigation, and hides assign on 0-day packs", async () => {
		routerState.search = { item: "item-1" };
		mockFetchStudyPackDetail
			.mockResolvedValueOnce({ pack: systemPack })
			.mockResolvedValueOnce({
				pack: { ...orgPack, dayCount: 0, itemCount: 0, items: [] },
			});

		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { rerender } = render(
			<QueryClientProvider client={client}>
				<StudyPackDetailRoute />
			</QueryClientProvider>,
		);

		await screen.findByText("Nội dung của Reading: Climate Change");
		fireEvent.click(screen.getByRole("button", { name: /^Listening/ }));
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/assignments/packs/$packId",
			params: { packId: "sys-pack-1" },
			search: { skill: "listening" },
			replace: true,
		});

		// Type partial search query then navigate to another pack before debounce fires
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const searchInput = screen.getByLabelText(
			"Tìm bài tập trong bộ đề",
		) as HTMLInputElement;
		fireEvent.change(searchInput, { target: { value: "Pending" } });
		routerState.navigate.mockClear();

		routerState.params = { packId: "org-pack-1" };
		routerState.search = {};
		rerender(
			<QueryClientProvider client={client}>
				<StudyPackDetailRoute />
			</QueryClientProvider>,
		);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(350);
		});
		expect(routerState.navigate).not.toHaveBeenCalled();

		vi.useRealTimers();
		expect(
			await screen.findByRole("heading", { name: "Bộ đề Trung tâm 14 ngày" }),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Gán cho lớp" })).toBeNull();
	});
});
