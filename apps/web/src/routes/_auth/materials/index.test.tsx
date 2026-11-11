// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
	MaterialFolderView,
	MaterialView,
} from "@teacher-os/api/material-contracts";
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

const mockNavigate = vi.fn();
const mockSearch = vi.hoisted(() => ({
	current: {} as Record<string, string>,
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	useNavigate: () => mockNavigate,
	useSearch: () => mockSearch.current,
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/reauth", () => ({ reauth: vi.fn() }));

import { kernelQueryKey } from "@/lib/repos/kernel";
import { Route, validateMaterialsSearch } from "./index";

const Materials = (Route as unknown as { component: () => React.ReactNode })
	.component;

function material(overrides: Partial<MaterialView> = {}): MaterialView {
	return {
		id: "m-1",
		folderId: null,
		title: "Đề Writing Task 1",
		description: "Biểu đồ cột",
		kind: "file",
		url: null,
		mimeType: "application/pdf",
		sizeBytes: 2048,
		originalName: "de.pdf",
		usageCount: 0,
		createdAt: "2026-11-01T00:00:00.000Z",
		updatedAt: "2026-11-01T00:00:00.000Z",
		...overrides,
	};
}

const FOLDERS: MaterialFolderView[] = [
	{
		id: "f-1",
		parentId: null,
		name: "Writing",
		createdAt: "2026-11-01T00:00:00.000Z",
	},
];

type Reply = { status: number; body: unknown };
type Handler = (method: string, url: URL, init?: RequestInit) => Reply | null;

let fetchMock: ReturnType<typeof vi.fn>;

function renderRoute(
	items: MaterialView[],
	handler?: Handler,
	options?: { role?: string; folders?: MaterialFolderView[] },
) {
	const folders = options?.folders ?? FOLDERS;
	fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		const method = (init?.method ?? "GET").toUpperCase();
		const custom = handler?.(method, url, init);
		const reply: Reply =
			custom ??
			(url.pathname === "/api/materials/folders"
				? { status: 200, body: { folders } }
				: url.pathname === "/api/materials" && method === "GET"
					? { status: 200, body: { items } }
					: { status: 500, body: {} });
		return new Response(JSON.stringify(reply.body), {
			status: reply.status,
			headers: { "content-type": "application/json" },
		});
	});
	vi.stubGlobal("fetch", fetchMock);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	if (options?.role !== undefined) {
		client.setQueryData(kernelQueryKey, {
			viewer: { role: options.role, canAccessFinance: false },
		});
	}
	return render(
		<QueryClientProvider client={client}>
			<Materials />
		</QueryClientProvider>,
	);
}

function lastNavigateSearch(): Record<string, unknown> {
	const call = mockNavigate.mock.calls.at(-1)?.[0] as
		| { search?: Record<string, unknown> }
		| undefined;
	return call?.search ?? {};
}

function writes() {
	return fetchMock.mock.calls.filter(
		([, init]) =>
			((init as RequestInit | undefined)?.method ?? "GET") !== "GET",
	);
}

beforeEach(() => {
	mockNavigate.mockReset();
	mockSearch.current = {};
	toastMock.success.mockReset();
	toastMock.error.mockReset();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("validateMaterialsSearch", () => {
	it("keeps valid filters and drops unknown or empty values", () => {
		expect(validateMaterialsSearch({})).toEqual({});
		expect(validateMaterialsSearch({ q: "  ", kind: "video" })).toEqual({});
		expect(
			validateMaterialsSearch({ q: "ielts", kind: "link", folderId: "root" }),
		).toEqual({ q: "ielts", kind: "link", folderId: "root" });
	});
});

describe("/materials list", () => {
	it("shows the empty state with first actions when the bank is empty", async () => {
		renderRoute([]);
		const empty = await screen.findByTestId("materials-empty");
		expect(within(empty).getByText("Chưa có tài liệu nào")).toBeTruthy();
		expect(
			within(empty).getByRole("button", { name: "Thêm liên kết" }),
		).toBeTruthy();
	});

	it("lists materials with usage count and the folder tree", async () => {
		renderRoute([
			material({ usageCount: 2, folderId: "f-1" }),
			material({
				id: "m-2",
				kind: "link",
				title: "Bài đọc BBC",
				url: "https://www.bbc.co.uk/learning",
				mimeType: null,
				sizeBytes: null,
			}),
		]);
		expect(await screen.findByText("Đề Writing Task 1")).toBeTruthy();
		expect(screen.getByText("Dùng ở 2 buổi")).toBeTruthy();
		expect(screen.getByText("www.bbc.co.uk")).toBeTruthy();
		const nav = screen.getByRole("navigation", { name: "Thư mục tài liệu" });
		expect(within(nav).getByRole("button", { name: "Writing" })).toBeTruthy();
	});

	it("filters kind client-side with aria-hidden counts and writes kind to the URL", async () => {
		renderRoute([
			material(),
			material({ id: "m-2", kind: "link", title: "Link", url: "https://a.vn" }),
		]);
		const group = await screen.findByRole("group", { name: "Loại tài liệu" });
		const linkChip = within(group).getByRole("button", { name: "Liên kết" });
		await waitFor(() =>
			expect(linkChip.querySelector("[aria-hidden='true']")?.textContent).toBe(
				"1",
			),
		);
		fireEvent.click(linkChip);
		expect(lastNavigateSearch()).toEqual({ kind: "link" });
	});

	it("applies the kind from the URL and offers to clear filters", async () => {
		mockSearch.current = { kind: "link" };
		renderRoute([
			material(),
			material({ id: "m-2", kind: "link", title: "Link", url: "https://a.vn" }),
		]);
		expect(await screen.findByText("Link")).toBeTruthy();
		expect(screen.queryByText("Đề Writing Task 1")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
		expect(lastNavigateSearch()).toEqual({});
	});

	it("debounces search 300ms before writing q to the URL", async () => {
		renderRoute([material()]);
		await screen.findByText("Đề Writing Task 1");
		vi.useFakeTimers();
		fireEvent.change(screen.getByRole("searchbox", { name: "Tìm tài liệu" }), {
			target: { value: "task" },
		});
		act(() => {
			vi.advanceTimersByTime(299);
		});
		expect(mockNavigate).not.toHaveBeenCalled();
		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(lastNavigateSearch()).toEqual({ q: "task" });
	});

	it("selecting a folder writes folderId to the URL", async () => {
		renderRoute([material()]);
		const nav = await screen.findByRole("navigation", {
			name: "Thư mục tài liệu",
		});
		fireEvent.click(
			await within(nav).findByRole("button", { name: "Writing" }),
		);
		expect(lastNavigateSearch()).toEqual({ folderId: "f-1" });
		fireEvent.click(
			within(nav).getByRole("button", { name: "Chưa xếp thư mục" }),
		);
		expect(lastNavigateSearch()).toEqual({ folderId: "root" });
	});

	it("shows an error with retry when the list fails", async () => {
		renderRoute([], (method, url) =>
			method === "GET" && url.pathname === "/api/materials"
				? { status: 500, body: {} }
				: null,
		);
		expect(
			await screen.findByText("Không tải được danh sách tài liệu."),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
	});
});

describe("/materials writes", () => {
	it("shows the in-use message with the session count on 409", async () => {
		renderRoute([material({ usageCount: 3 })], (method) =>
			method === "DELETE"
				? {
						status: 409,
						body: {
							error: "MATERIAL_IN_USE",
							code: "MATERIAL_IN_USE",
							sessionCount: 3,
						},
					}
				: null,
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Xóa Đề Writing Task 1" }),
		);
		const dialog = await screen.findByRole("dialog", { name: "Xóa tài liệu" });
		fireEvent.click(within(dialog).getByRole("button", { name: "Xóa" }));
		expect((await within(dialog).findByRole("alert")).textContent).toBe(
			"Tài liệu đang được dùng ở 3 buổi học. Hãy gỡ khỏi các buổi đó trước khi xóa.",
		);
		expect(toastMock.success).not.toHaveBeenCalled();
	});

	it("blocks an unsupported upload before sending anything", async () => {
		renderRoute([material()]);
		await screen.findByText("Đề Writing Task 1");
		fireEvent.click(screen.getAllByRole("button", { name: "Tải file lên" })[0]);
		const dialog = await screen.findByRole("dialog", { name: "Tải file lên" });
		const input = within(dialog).getByLabelText("File") as HTMLInputElement;
		fireEvent.change(input, {
			target: {
				files: [new File(["<html>"], "trang.html", { type: "text/html" })],
			},
		});
		expect((await within(dialog).findByRole("alert")).textContent).toMatch(
			/Định dạng chưa hỗ trợ/,
		);
		fireEvent.click(within(dialog).getByRole("button", { name: "Tải lên" }));
		expect(writes()).toHaveLength(0);
	});

	it("uploads a valid file as raw bytes into the selected folder", async () => {
		mockSearch.current = { folderId: "f-1" };
		renderRoute([], (method) =>
			method === "PUT"
				? { status: 201, body: { material: material({ id: "m-9" }) } }
				: null,
		);
		await screen.findByTestId("materials-empty");
		fireEvent.click(screen.getAllByRole("button", { name: "Tải file lên" })[0]);
		const dialog = await screen.findByRole("dialog", { name: "Tải file lên" });
		const file = new File(["%PDF"], "Đề 1.pdf", { type: "" });
		fireEvent.change(within(dialog).getByLabelText("File"), {
			target: { files: [file] },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Tải lên" }));
		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith("Đã tải file lên."),
		);
		const [input, init] = writes()[0] ?? [];
		expect(String(input)).toMatch(/\/api\/materials\/files\?folderId=f-1$/);
		expect((init as RequestInit).headers).toEqual({
			"Content-Type": "application/pdf",
			"X-File-Name": encodeURIComponent("Đề 1.pdf"),
		});
	});

	it("rejects a non-http link without calling the server", async () => {
		renderRoute([material()]);
		await screen.findByText("Đề Writing Task 1");
		fireEvent.click(
			screen.getAllByRole("button", { name: "Thêm liên kết" })[0],
		);
		const dialog = await screen.findByRole("dialog", {
			name: "Thêm liên kết",
		});
		fireEvent.change(within(dialog).getByLabelText("Tiêu đề"), {
			target: { value: "Lừa" },
		});
		fireEvent.change(within(dialog).getByLabelText("Đường dẫn"), {
			target: { value: "javascript:alert(1)" },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Thêm liên kết" }),
		);
		expect((await within(dialog).findByRole("alert")).textContent).toMatch(
			/http/,
		);
		expect(writes()).toHaveLength(0);
	});

	it("shows the folder-not-empty message when deleting a folder fails", async () => {
		mockSearch.current = { folderId: "f-1" };
		renderRoute([material({ folderId: "f-1" })], (method) =>
			method === "DELETE"
				? {
						status: 409,
						body: { error: "FOLDER_NOT_EMPTY", code: "FOLDER_NOT_EMPTY" },
					}
				: null,
		);
		fireEvent.click(await screen.findByRole("button", { name: "Xóa thư mục" }));
		const dialog = await screen.findByRole("dialog", { name: "Xóa thư mục" });
		fireEvent.click(within(dialog).getByRole("button", { name: "Xóa" }));
		expect((await within(dialog).findByRole("alert")).textContent).toMatch(
			/còn thư mục con hoặc tài liệu/,
		);
	});

	it("renders cyclic folders at root and moves a cyclic folder to root in one save (#646)", async () => {
		const cyclicFolders: MaterialFolderView[] = [
			{
				id: "x",
				parentId: "y",
				name: "X",
				createdAt: "2026-11-01T00:00:00.000Z",
			},
			{
				id: "y",
				parentId: "x",
				name: "Y",
				createdAt: "2026-11-01T00:00:00.000Z",
			},
		];
		mockSearch.current = { folderId: "x" };
		renderRoute(
			[],
			(method, url) =>
				method === "PATCH" && url.pathname === "/api/materials/folders/x"
					? {
							status: 200,
							body: {
								folder: {
									id: "x",
									parentId: null,
									name: "X",
									createdAt: "2026-11-01T00:00:00.000Z",
								},
							},
						}
					: null,
			{ folders: cyclicFolders },
		);

		const nav = await screen.findByRole("navigation", {
			name: "Thư mục tài liệu",
		});
		expect(await within(nav).findByRole("button", { name: "X" })).toBeTruthy();
		expect(within(nav).getByRole("button", { name: "Y" })).toBeTruthy();

		fireEvent.click(await screen.findByRole("button", { name: "Di chuyển" }));
		const dialog = await screen.findByRole("dialog", {
			name: /Di chuyển/,
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

		await waitFor(() => expect(writes()).toHaveLength(1));
		const [, reqInit] = writes()[0] as [unknown, RequestInit];
		expect(JSON.parse(String(reqInit.body))).toEqual({ parentId: null });
	});

	it("hides all write actions and shows read-only empty copy when viewer role is ta (#646)", async () => {
		mockSearch.current = { folderId: "f-1" };
		renderRoute([material({ folderId: "f-1" })], undefined, { role: "ta" });

		expect(await screen.findByText("Đề Writing Task 1")).toBeTruthy();
		expect(
			screen.getByRole("link", { name: "Tải xuống Đề Writing Task 1" }),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Thêm liên kết" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Tải file lên" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Thư mục mới" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Đổi tên" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Di chuyển" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Xóa thư mục" })).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Sửa Đề Writing Task 1" }),
		).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Xóa Đề Writing Task 1" }),
		).toBeNull();

		cleanup();
		mockSearch.current = {};
		renderRoute([], undefined, { role: "ta", folders: [] });
		const empty = await screen.findByTestId("materials-empty");
		expect(
			within(empty).getByText(
				"Ngân hàng tài liệu của trung tâm hiện chưa có học liệu nào.",
			),
		).toBeTruthy();
		expect(
			within(empty).queryByRole("button", { name: "Thêm liên kết" }),
		).toBeNull();
		expect(
			within(empty).queryByRole("button", { name: "Tải file lên" }),
		).toBeNull();
	});
});
