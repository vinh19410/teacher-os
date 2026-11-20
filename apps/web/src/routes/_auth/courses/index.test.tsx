// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
	CourseCatalogResponse,
	CourseCategoryDto,
} from "@teacher-os/api/course-contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
type MockSearch = {
	q?: string;
	status?: "active" | "inactive";
};
const mockSearch = vi.hoisted(() => ({ current: {} as MockSearch }));
const toastMock = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
}));
const reauthMock = vi.hoisted(() => vi.fn());
const financeGuardState = vi.hoisted(() => ({ canAccessFinance: true }));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useSearch: () => mockSearch.current,
	}),
	useNavigate: () => mockNavigate,
	useSearch: () => mockSearch.current,
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/reauth", () => ({ reauth: reauthMock }));
vi.mock("@/lib/use-finance-route-guard", () => ({
	useFinanceRouteGuard: () => financeGuardState.canAccessFinance,
}));

import { Route, validateCoursesSearch } from "./index";

const Courses = (Route as unknown as { component: () => React.ReactNode })
	.component;

function seededCatalog(): CourseCatalogResponse {
	return {
		categories: [
			{
				id: "cat-comm",
				name: "Giao Tiếp",
				sortOrder: 0,
				isActive: true,
				createdAt: "2026-11-01T00:00:00.000Z",
				updatedAt: "2026-11-01T00:00:00.000Z",
				courses: [
					{
						id: "course-comm-1",
						categoryId: "cat-comm",
						name: "Communication English Level 1",
						sortOrder: 0,
						isActive: true,
						createdAt: "2026-11-01T00:00:00.000Z",
						updatedAt: "2026-11-01T00:00:00.000Z",
					},
					{
						id: "course-comm-2",
						categoryId: "cat-comm",
						name: "Communication English Level 2",
						sortOrder: 1,
						isActive: true,
						createdAt: "2026-11-01T00:00:00.000Z",
						updatedAt: "2026-11-01T00:00:00.000Z",
					},
					{
						id: "course-comm-3",
						categoryId: "cat-comm",
						name: "Communication English Level 3",
						sortOrder: 2,
						isActive: false,
						createdAt: "2026-11-01T00:00:00.000Z",
						updatedAt: "2026-11-01T00:00:00.000Z",
					},
				],
			},
			{
				id: "cat-ielts",
				name: "IELTS",
				sortOrder: 1,
				isActive: true,
				createdAt: "2026-11-01T00:00:00.000Z",
				updatedAt: "2026-11-01T00:00:00.000Z",
				courses: [
					{
						id: "course-ielts-1",
						categoryId: "cat-ielts",
						name: "Foundation",
						sortOrder: 0,
						isActive: true,
						createdAt: "2026-11-01T00:00:00.000Z",
						updatedAt: "2026-11-01T00:00:00.000Z",
					},
					{
						id: "course-ielts-2",
						categoryId: "cat-ielts",
						name: "First Step",
						sortOrder: 1,
						isActive: true,
						createdAt: "2026-11-01T00:00:00.000Z",
						updatedAt: "2026-11-01T00:00:00.000Z",
					},
					{
						id: "course-ielts-3",
						categoryId: "cat-ielts",
						name: "Pre IELTS",
						sortOrder: 2,
						isActive: true,
						createdAt: "2026-11-01T00:00:00.000Z",
						updatedAt: "2026-11-01T00:00:00.000Z",
					},
					{
						id: "course-ielts-4",
						categoryId: "cat-ielts",
						name: "Advanced",
						sortOrder: 3,
						isActive: true,
						createdAt: "2026-11-01T00:00:00.000Z",
						updatedAt: "2026-11-01T00:00:00.000Z",
					},
				],
			},
		],
	};
}

function emptyCategory(
	overrides: Partial<CourseCategoryDto> = {},
): CourseCategoryDto {
	return {
		id: "cat-empty",
		name: "Thiếu Nhi",
		sortOrder: 2,
		isActive: true,
		createdAt: "2026-11-01T00:00:00.000Z",
		updatedAt: "2026-11-01T00:00:00.000Z",
		courses: [],
		...overrides,
	};
}

type RequestRecord = {
	url: string;
	method: string;
	body: unknown;
};

function stubCatalogFetch(
	initial: CourseCatalogResponse = seededCatalog(),
	handler?: (
		url: string,
		method: string,
		body: unknown,
		state: CourseCatalogResponse,
	) => Response | undefined,
) {
	const state: CourseCatalogResponse = structuredClone(initial);
	const requests: RequestRecord[] = [];
	const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		requests.push({ url, method, body });

		if (handler) {
			const custom = handler(url, method, body, state);
			if (custom) return Promise.resolve(custom);
		}
		if (url.endsWith("/api/courses") && method === "GET") {
			return Promise.resolve(
				new Response(JSON.stringify(state), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);
		}
		return Promise.resolve(new Response("not found", { status: 404 }));
	});
	vi.stubGlobal("fetch", fetchMock);
	return { requests, state, fetchMock };
}

function renderCourses() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<Courses />
		</QueryClientProvider>,
	);
}

function lastNavigateSearch(): Record<string, unknown> {
	const call = mockNavigate.mock.calls.at(-1)?.[0];
	if (call && typeof call === "object" && "search" in call) {
		const search = call.search;
		return search && typeof search === "object"
			? (search as Record<string, unknown>)
			: {};
	}
	return {};
}

beforeEach(() => {
	mockNavigate.mockReset();
	mockSearch.current = {};
	toastMock.success.mockReset();
	toastMock.error.mockReset();
	reauthMock.mockReset();
	financeGuardState.canAccessFinance = true;
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("validateCoursesSearch", () => {
	it("chuẩn hóa giá trị mặc định/lạ về undefined và giữ q/status hợp lệ", () => {
		expect(validateCoursesSearch({})).toEqual({});
		expect(validateCoursesSearch({ q: "   ", status: "all" })).toEqual({});
		expect(validateCoursesSearch({ status: "archived" })).toEqual({});
		expect(validateCoursesSearch({ q: "ielts", status: "active" })).toEqual({
			q: "ielts",
			status: "active",
		});
		expect(validateCoursesSearch({ status: "inactive" })).toEqual({
			status: "inactive",
		});
	});
});

describe("màn quản trị /courses", () => {
	it("hiển thị danh mục mặc định Giao Tiếp (3 khóa) và IELTS (4 khóa)", async () => {
		stubCatalogFetch();
		renderCourses();

		const cards = await screen.findAllByTestId("course-category-card");
		expect(cards).toHaveLength(2);
		expect(within(cards[0] as HTMLElement).getByText("Giao Tiếp")).toBeTruthy();
		expect(
			within(cards[0] as HTMLElement).getAllByTestId("course-item-row"),
		).toHaveLength(3);
		expect(within(cards[1] as HTMLElement).getByText("IELTS")).toBeTruthy();
		expect(
			within(cards[1] as HTMLElement).getAllByTestId("course-item-row"),
		).toHaveLength(4);
		expect(screen.getByTestId("courses-status-summary").textContent).toContain(
			"Hiển thị 2 nhóm · 7 khóa học",
		);
	});

	it("lọc theo chip trạng thái + tìm kiếm debounce 300ms đẩy lên URL + Xóa bộ lọc", async () => {
		stubCatalogFetch();
		const { rerender } = renderCourses();
		await screen.findByText("Giao Tiếp");

		// Chip counts: Tất cả 7, Đang hoạt động 6, Đã ẩn 1
		const statusGroup = screen.getByRole("group", {
			name: "Trạng thái khóa học",
		});
		expect(statusGroup.textContent).toContain("7");
		expect(statusGroup.textContent).toContain("6");
		expect(statusGroup.textContent).toContain("1");

		// Bấm chip "Đã ẩn" đẩy ?status=inactive lên URL
		fireEvent.click(screen.getByRole("button", { name: "Đã ẩn" }));
		expect(lastNavigateSearch()).toEqual({ status: "inactive" });

		// Simulate URL update to status=inactive
		mockSearch.current = { status: "inactive" };
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		rerender(
			<QueryClientProvider client={client}>
				<Courses />
			</QueryClientProvider>,
		);
		await waitFor(() =>
			expect(screen.getAllByTestId("course-item-row")).toHaveLength(1),
		);
		expect(screen.getByText("Communication English Level 3")).toBeTruthy();

		// Bấm Xóa bộ lọc -> xóa search và đưa URL về rỗng
		fireEvent.click(screen.getByTestId("courses-clear-filters-btn"));
		expect(lastNavigateSearch()).toEqual({});

		// Gõ search -> debounce 300ms mới navigate
		mockNavigate.mockReset();
		mockSearch.current = {};
		fireEvent.change(screen.getByTestId("courses-search-input"), {
			target: { value: "Foundation" },
		});
		expect(mockNavigate).not.toHaveBeenCalled();
		await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
		expect(lastNavigateSearch()).toEqual({ q: "Foundation" });
	});

	it("tạo nhóm mới, hiển thị lỗi trùng tên từ server, sửa và ẩn/hiện nhóm", async () => {
		let duplicateFirst = true;
		const { requests } = stubCatalogFetch(
			seededCatalog(),
			(url, method, body, state) => {
				if (url.endsWith("/api/courses/categories") && method === "POST") {
					if (duplicateFirst) {
						duplicateFirst = false;
						return Response.json(
							{
								error: "COURSE_CATEGORY_DUPLICATE",
								code: "COURSE_CATEGORY_DUPLICATE",
								message: "Tên nhóm khóa học đã tồn tại.",
							},
							{ status: 409 },
						);
					}
					const payload = body as { name: string };
					const created = emptyCategory({
						id: "cat-new",
						name: payload.name,
					});
					state.categories.push(created);
					return Response.json({ category: created }, { status: 201 });
				}
				if (
					url.endsWith("/api/courses/categories/cat-new") &&
					method === "PATCH"
				) {
					const payload = body as { name?: string; isActive?: boolean };
					const cat = state.categories.find((c) => c.id === "cat-new");
					if (cat) {
						if (payload.name !== undefined) cat.name = payload.name;
						if (payload.isActive !== undefined) cat.isActive = payload.isActive;
					}
					return Response.json({ category: cat }, { status: 200 });
				}
				return undefined;
			},
		);
		renderCourses();
		await screen.findByText("Giao Tiếp");

		// Mở modal thêm nhóm -> gặp lỗi 409 trùng tên
		fireEvent.click(screen.getByTestId("add-category-btn"));
		fireEvent.change(screen.getByTestId("course-category-name-input"), {
			target: { value: "IELTS" },
		});
		fireEvent.click(screen.getByTestId("course-category-submit-btn"));
		expect(
			await screen.findByText("Tên nhóm khóa học đã tồn tại."),
		).toBeTruthy();

		// Đổi tên sang TOEIC -> tạo thành công
		fireEvent.change(screen.getByTestId("course-category-name-input"), {
			target: { value: "TOEIC" },
		});
		fireEvent.click(screen.getByTestId("course-category-submit-btn"));
		await screen.findByText("TOEIC");
		expect(toastMock.success).toHaveBeenCalled();

		// Sửa tên nhóm TOEIC -> TOEIC Intensive
		fireEvent.click(screen.getByLabelText("Sửa nhóm TOEIC"));
		fireEvent.change(screen.getByTestId("course-category-name-input"), {
			target: { value: "TOEIC Intensive" },
		});
		fireEvent.click(screen.getByTestId("course-category-submit-btn"));
		await screen.findByText("TOEIC Intensive");

		// Ẩn nhóm TOEIC Intensive
		fireEvent.click(screen.getByLabelText("Ẩn nhóm TOEIC Intensive"));
		await waitFor(() =>
			expect(
				requests.some(
					(r) =>
						r.method === "PATCH" &&
						r.url.endsWith("/api/courses/categories/cat-new") &&
						(r.body as { isActive?: boolean })?.isActive === false,
				),
			).toBe(true),
		);
	});

	it("khóa nút xóa nhóm khi còn khóa học và cho phép xóa nhóm rỗng qua modal xác nhận", async () => {
		const initial = seededCatalog();
		initial.categories.push(emptyCategory());
		const { requests } = stubCatalogFetch(
			initial,
			(url, method, _body, state) => {
				if (
					url.endsWith("/api/courses/categories/cat-empty") &&
					method === "DELETE"
				) {
					state.categories = state.categories.filter(
						(c) => c.id !== "cat-empty",
					);
					return Response.json({ deleted: true }, { status: 200 });
				}
				return undefined;
			},
		);
		renderCourses();
		await screen.findByText("Thiếu Nhi");

		// Nhóm còn khóa học -> nút xóa bị disabled
		const deleteCommBtn = screen.getByLabelText(
			"Xóa nhóm Giao Tiếp",
		) as HTMLButtonElement;
		expect(deleteCommBtn.disabled).toBe(true);

		// Nhóm rỗng -> nút xóa bật, bấm mở confirm modal và xóa thành công
		const deleteEmptyBtn = screen.getByLabelText(
			"Xóa nhóm Thiếu Nhi",
		) as HTMLButtonElement;
		expect(deleteEmptyBtn.disabled).toBe(false);
		fireEvent.click(deleteEmptyBtn);
		fireEvent.click(screen.getByTestId("course-delete-confirm-btn"));

		await waitFor(() =>
			expect(
				requests.some(
					(r) =>
						r.method === "DELETE" &&
						r.url.endsWith("/api/courses/categories/cat-empty"),
				),
			).toBe(true),
		);
		await waitFor(() => expect(screen.queryByText("Thiếu Nhi")).toBeNull());
	});

	it("thêm, sửa, đổi nhóm, ẩn/hiện, sắp xếp thứ tự và xóa khóa học", async () => {
		const { requests } = stubCatalogFetch(
			seededCatalog(),
			(url, method, body, state) => {
				if (
					url.endsWith("/api/courses/categories/reorder") &&
					method === "POST"
				) {
					const { orderedIds } = body as { orderedIds: string[] };
					state.categories.sort(
						(a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id),
					);
					return Response.json(state, { status: 200 });
				}
				if (url.endsWith("/api/courses/items") && method === "POST") {
					const payload = body as { categoryId: string; name: string };
					const cat = state.categories.find((c) => c.id === payload.categoryId);
					const item = {
						id: "course-new",
						categoryId: payload.categoryId,
						name: payload.name,
						sortOrder: cat?.courses.length ?? 0,
						isActive: true,
						createdAt: "2026-11-02T00:00:00.000Z",
						updatedAt: "2026-11-02T00:00:00.000Z",
					};
					cat?.courses.push(item);
					return Response.json({ course: item }, { status: 201 });
				}
				if (
					url.endsWith("/api/courses/items/course-new") &&
					method === "PATCH"
				) {
					const payload = body as {
						categoryId?: string;
						name?: string;
						isActive?: boolean;
					};
					for (const cat of state.categories) {
						const found = cat.courses.find((c) => c.id === "course-new");
						if (found) {
							if (payload.name !== undefined) found.name = payload.name;
							if (payload.isActive !== undefined) {
								found.isActive = payload.isActive;
							}
							if (payload.categoryId && payload.categoryId !== cat.id) {
								cat.courses = cat.courses.filter((c) => c.id !== "course-new");
								found.categoryId = payload.categoryId;
								state.categories
									.find((c) => c.id === payload.categoryId)
									?.courses.push(found);
							}
							return Response.json({ course: found }, { status: 200 });
						}
					}
				}
				if (url.endsWith("/api/courses/items/reorder") && method === "POST") {
					const { categoryId, orderedIds } = body as {
						categoryId: string;
						orderedIds: string[];
					};
					const cat = state.categories.find((c) => c.id === categoryId);
					cat?.courses.sort(
						(a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id),
					);
					return Response.json(state, { status: 200 });
				}
				if (
					url.endsWith("/api/courses/items/course-new") &&
					method === "DELETE"
				) {
					for (const cat of state.categories) {
						cat.courses = cat.courses.filter((c) => c.id !== "course-new");
					}
					return Response.json({ deleted: true }, { status: 200 });
				}
				return undefined;
			},
		);
		renderCourses();
		await screen.findByText("Foundation");

		// Reorder categories: move IELTS up
		fireEvent.click(screen.getByLabelText("Di chuyển nhóm IELTS lên"));
		await waitFor(() =>
			expect(
				requests.some(
					(r) =>
						r.method === "POST" &&
						r.url.endsWith("/api/courses/categories/reorder") &&
						JSON.stringify((r.body as { orderedIds: string[] }).orderedIds) ===
							JSON.stringify(["cat-ielts", "cat-comm"]),
				),
			).toBe(true),
		);

		// Reorder course within IELTS: move First Step up
		fireEvent.click(screen.getByLabelText("Di chuyển khóa học First Step lên"));
		await waitFor(() =>
			expect(
				requests.some(
					(r) =>
						r.method === "POST" &&
						r.url.endsWith("/api/courses/items/reorder") &&
						(r.body as { categoryId: string }).categoryId === "cat-ielts",
				),
			).toBe(true),
		);

		// Thêm khóa học vào nhóm IELTS
		fireEvent.click(screen.getByLabelText("Thêm khóa học vào nhóm IELTS"));
		fireEvent.change(screen.getByTestId("course-item-name-input"), {
			target: { value: "IELTS Intensive 7.5+" },
		});
		fireEvent.click(screen.getByTestId("course-item-submit-btn"));
		await screen.findByText("IELTS Intensive 7.5+");

		// Sửa khóa học -> đổi tên & chuyển nhóm
		fireEvent.click(screen.getByLabelText("Sửa khóa học IELTS Intensive 7.5+"));
		fireEvent.change(screen.getByTestId("course-item-category-select"), {
			target: { value: "cat-comm" },
		});
		fireEvent.change(screen.getByTestId("course-item-name-input"), {
			target: { value: "Communication Pro" },
		});
		fireEvent.click(screen.getByTestId("course-item-submit-btn"));
		await screen.findByText("Communication Pro");

		// Ẩn khóa học
		fireEvent.click(screen.getByLabelText("Ẩn khóa học Communication Pro"));
		await waitFor(() =>
			expect(
				requests.some(
					(r) =>
						r.method === "PATCH" &&
						r.url.endsWith("/api/courses/items/course-new") &&
						(r.body as { isActive?: boolean }).isActive === false,
				),
			).toBe(true),
		);

		// Xóa khóa học -> modal nêu rõ không ảnh hưởng bài chấm cũ
		fireEvent.click(screen.getByLabelText("Xóa khóa học Communication Pro"));
		expect(
			screen.getByText(/không ảnh hưởng đến các bài kiểm tra đầu vào đã chấm/i),
		).toBeTruthy();
		fireEvent.click(screen.getByTestId("course-delete-confirm-btn"));
		await waitFor(() =>
			expect(screen.queryByText("Communication Pro")).toBeNull(),
		);
	});

	it("401 gọi reauth và canAccessFinance = false ẩn trang không gọi API", async () => {
		const { fetchMock } = stubCatalogFetch(
			seededCatalog(),
			() => new Response("unauthorized", { status: 401 }),
		);
		renderCourses();
		await waitFor(() => expect(reauthMock).toHaveBeenCalled());

		cleanup();
		fetchMock.mockClear();
		financeGuardState.canAccessFinance = false;
		const view = renderCourses();
		expect(view.container.innerHTML).toBe("");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
