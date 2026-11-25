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
vi.mock(
	"@teacher-os/ui/components/document-preview/blob-document-view",
	() => ({
		BlobDocumentThumbnail: (props: {
			blobUrl: string;
			mimeType: string;
			label: string;
		}) => (
			<div
				data-testid="blob-document-thumbnail"
				data-url={props.blobUrl}
				data-mime={props.mimeType}
				data-label={props.label}
			/>
		),
		BlobDocumentView: (props: {
			blobUrl: string;
			mimeType: string;
			label: string;
		}) => (
			<div
				data-testid="blob-document-view"
				data-url={props.blobUrl}
				data-mime={props.mimeType}
				data-label={props.label}
			/>
		),
	}),
);

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
type Handler = (
	method: string,
	url: URL,
	init?: RequestInit,
) => Reply | null | Promise<Reply | null>;

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
		if (
			method === "GET" &&
			/^\/api\/materials\/[^/]+\/file$/.test(url.pathname)
		) {
			return new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
				status: 200,
				headers: { "content-type": "application/pdf" },
			});
		}
		const custom = await handler?.(method, url, init);
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
	URL.createObjectURL = vi.fn(() => "blob:list-preview");
	URL.revokeObjectURL = vi.fn();
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

	it("shows class usage count badges alongside session usage counts", async () => {
		renderRoute([
			material({
				id: "m-class-only",
				title: "Đề cương khóa học",
				usageCount: 0,
				classUsageCount: 2,
			}),
			material({
				id: "m-both",
				title: "Bảng tiêu chí chấm",
				usageCount: 1,
				classUsageCount: 3,
			}),
			material({
				id: "m-unused",
				title: "Tài liệu chưa dùng",
				usageCount: 0,
				classUsageCount: 0,
			}),
		]);

		const items = await screen.findAllByTestId("material-item");
		expect(items).toHaveLength(3);

		expect(within(items[0]).getByText("Dùng ở 2 lớp")).toBeTruthy();
		expect(within(items[0]).queryByText("Chưa dùng ở buổi nào")).toBeNull();

		expect(within(items[1]).getByText("Dùng ở 1 buổi")).toBeTruthy();
		expect(within(items[1]).getByText("Dùng ở 3 lớp")).toBeTruthy();
		expect(within(items[1]).queryByText("Chưa dùng ở buổi nào")).toBeNull();

		expect(within(items[2]).getByText("Chưa dùng ở buổi nào")).toBeTruthy();
		expect(within(items[2]).queryByText(/Dùng ở \d+ lớp/)).toBeNull();
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
		// Xem trước inline là thao tác đọc — trợ giảng vẫn dùng được.
		expect(await screen.findByTestId("blob-document-thumbnail")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Xem trước Đề Writing Task 1" }),
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

	it("uploads multiple valid files into the active folder and closes the dialog", async () => {
		mockSearch.current = { folderId: "f-1" };
		let seq = 0;
		renderRoute([], (method) => {
			if (method === "PUT") {
				seq += 1;
				return {
					status: 201,
					body: { material: material({ id: `m-batch-${seq}` }) },
				};
			}
			return null;
		});
		await screen.findByTestId("materials-empty");
		fireEvent.click(screen.getAllByRole("button", { name: "Tải file lên" })[0]);
		const dialog = await screen.findByRole("dialog", { name: "Tải file lên" });

		const fileA = new File(["%PDF-1"], "Bài 1.pdf", {
			type: "application/pdf",
			lastModified: 1000,
		});
		const fileB = new File(["%PDF-2"], "Bài 2.pdf", {
			type: "application/pdf",
			lastModified: 2000,
		});
		fireEvent.change(within(dialog).getByLabelText("File"), {
			target: { files: [fileA, fileB] },
		});

		expect(
			within(dialog).getByText("Có thể chọn thêm nhiều đợt trước khi tải lên."),
		).toBeTruthy();
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Tải lên 2 file" }),
		);

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith("Đã tải lên 2 file."),
		);
		await waitFor(() =>
			expect(screen.queryByRole("dialog", { name: "Tải file lên" })).toBeNull(),
		);

		const putCalls = writes();
		expect(putCalls).toHaveLength(2);
		const uploadedHeaders = putCalls.map(([input, init]) => {
			expect(String(input)).toMatch(/\/api\/materials\/files\?folderId=f-1$/);
			return (init as RequestInit).headers as Record<string, string>;
		});
		expect(uploadedHeaders.map((h) => h["X-File-Name"]).sort()).toEqual(
			[encodeURIComponent("Bài 1.pdf"), encodeURIComponent("Bài 2.pdf")].sort(),
		);
	});

	it("supports drag-and-drop, multi-round append, duplicate skipping, and item removal before upload", async () => {
		renderRoute([], (method) =>
			method === "PUT"
				? { status: 201, body: { material: material({ id: "m-drop" }) } }
				: null,
		);
		await screen.findByTestId("materials-empty");
		fireEvent.click(screen.getAllByRole("button", { name: "Tải file lên" })[0]);
		const dialog = await screen.findByRole("dialog", { name: "Tải file lên" });

		// Bấm tải lên khi chưa chọn file báo lỗi hợp lệ và không gửi request.
		fireEvent.click(within(dialog).getByRole("button", { name: "Tải lên" }));
		expect((await within(dialog).findByRole("alert")).textContent).toBe(
			"Chọn ít nhất một file để tải lên.",
		);
		expect(writes()).toHaveLength(0);

		const dropzone = within(dialog).getByRole("button", {
			name: /Kéo thả nhiều file vào đây/,
		});
		fireEvent.dragOver(dropzone);
		expect(dropzone.className).toContain("border-primary");
		expect(dropzone.className).toContain("bg-accent");
		fireEvent.dragLeave(dropzone);
		expect(dropzone.className).toContain("border-input");

		// Đợt 1: kéo thả file đầu tiên.
		const file1 = new File(["%PDF-a"], "reading-1.pdf", {
			type: "application/pdf",
			lastModified: 1000,
		});
		fireEvent.drop(dropzone, { dataTransfer: { files: [file1] } });
		expect(within(dialog).queryByRole("alert")).toBeNull();
		expect(within(dialog).getByText("reading-1.pdf")).toBeTruthy();

		// Đợt 2: chọn thêm file khác qua input.
		const file2 = new File(["%PDF-b"], "reading-2.pdf", {
			type: "application/pdf",
			lastModified: 2000,
		});
		fireEvent.change(within(dialog).getByLabelText("File"), {
			target: { files: [file2] },
		});
		expect(within(dialog).getByText("reading-1.pdf")).toBeTruthy();
		expect(within(dialog).getByText("reading-2.pdf")).toBeTruthy();
		expect(
			within(dialog).getByRole("button", { name: "Tải lên 2 file" }),
		).toBeTruthy();

		// Đợt 3: thả lại file trùng dấu vân tay → bỏ qua và chỉ hiện nhắc nhở dịu (không role="alert").
		const duplicateFile1 = new File(["%PDF-a"], "reading-1.pdf", {
			type: "application/pdf",
			lastModified: 1000,
		});
		fireEvent.drop(dropzone, { dataTransfer: { files: [duplicateFile1] } });
		expect(
			within(dialog).getByText("File vừa chọn đã có trong danh sách."),
		).toBeTruthy();
		expect(within(dialog).queryByRole("alert")).toBeNull();
		expect(
			within(dialog).getByRole("button", { name: "Tải lên 2 file" }),
		).toBeTruthy();

		// Gỡ file đầu tiên khỏi hàng đợi trước khi tải lên.
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Bỏ reading-1.pdf" }),
		);
		expect(within(dialog).queryByText("reading-1.pdf")).toBeNull();
		expect(
			within(dialog).queryByText("File vừa chọn đã có trong danh sách."),
		).toBeNull();
		expect(within(dialog).getByText("reading-2.pdf")).toBeTruthy();

		fireEvent.click(within(dialog).getByRole("button", { name: "Tải lên" }));
		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith("Đã tải file lên."),
		);
		await waitFor(() =>
			expect(screen.queryByRole("dialog", { name: "Tải file lên" })).toBeNull(),
		);
		expect(writes()).toHaveLength(1);
		const [, init] = writes()[0] as [unknown, RequestInit];
		expect((init.headers as Record<string, string>)["X-File-Name"]).toBe(
			encodeURIComponent("reading-2.pdf"),
		);
	});

	it("uploads only valid files in a mixed batch and keeps the dialog open for invalid items", async () => {
		renderRoute([], (method) =>
			method === "PUT"
				? { status: 201, body: { material: material({ id: "m-mixed" }) } }
				: null,
		);
		await screen.findByTestId("materials-empty");
		fireEvent.click(screen.getAllByRole("button", { name: "Tải file lên" })[0]);
		const dialog = await screen.findByRole("dialog", { name: "Tải file lên" });

		const validFile = new File(["%PDF"], "hop-le.pdf", {
			type: "application/pdf",
			lastModified: 1000,
		});
		const invalidFile = new File(["<html>"], "sai-dinh-dang.html", {
			type: "text/html",
			lastModified: 2000,
		});
		fireEvent.change(within(dialog).getByLabelText("File"), {
			target: { files: [validFile, invalidFile] },
		});

		expect(within(dialog).getAllByRole("alert")).toHaveLength(1);
		expect(within(dialog).getByRole("alert").textContent).toMatch(
			/Định dạng chưa hỗ trợ/,
		);

		fireEvent.click(within(dialog).getByRole("button", { name: "Tải lên" }));
		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith("Đã tải 1 file lên."),
		);

		// Chỉ gửi file hợp lệ, không gọi API cho file không hợp lệ và giữ dialog mở.
		expect(writes()).toHaveLength(1);
		const [, init] = writes()[0] as [unknown, RequestInit];
		expect((init.headers as Record<string, string>)["X-File-Name"]).toBe(
			encodeURIComponent("hop-le.pdf"),
		);
		expect(screen.getByRole("dialog", { name: "Tải file lên" })).toBeTruthy();
		expect(within(dialog).getByText("Đã tải")).toBeTruthy();
		expect(within(dialog).getByText("Không hợp lệ")).toBeTruthy();
		expect(within(dialog).getByRole("alert").textContent).toMatch(
			/Định dạng chưa hỗ trợ/,
		);
		expect(
			within(dialog).queryByRole("button", { name: /Tải lên/ }),
		).toBeNull();
		const closeButtons = within(dialog).getAllByRole("button", {
			name: "Đóng",
		});
		expect(closeButtons).toHaveLength(2);
		fireEvent.click(closeButtons[1]);
		expect(screen.queryByRole("dialog", { name: "Tải file lên" })).toBeNull();
	});

	it("retries only failed files after a partial server error and closes the dialog on recovery", async () => {
		const attemptsByName = new Map<string, number>();
		renderRoute([], (method, _url, init) => {
			if (method !== "PUT") return null;
			const headers = init?.headers as Record<string, string> | undefined;
			const decodedName = decodeURIComponent(headers?.["X-File-Name"] ?? "");
			const attempt = (attemptsByName.get(decodedName) ?? 0) + 1;
			attemptsByName.set(decodedName, attempt);
			if (decodedName === "file-loi.pdf" && attempt === 1) {
				return { status: 500, body: {} };
			}
			return {
				status: 201,
				body: { material: material({ id: `m-${decodedName}-${attempt}` }) },
			};
		});
		await screen.findByTestId("materials-empty");
		fireEvent.click(screen.getAllByRole("button", { name: "Tải file lên" })[0]);
		const dialog = await screen.findByRole("dialog", { name: "Tải file lên" });

		const okFile = new File(["%PDF-1"], "file-ok.pdf", {
			type: "application/pdf",
			lastModified: 1000,
		});
		const flakyFile = new File(["%PDF-2"], "file-loi.pdf", {
			type: "application/pdf",
			lastModified: 2000,
		});
		fireEvent.change(within(dialog).getByLabelText("File"), {
			target: { files: [okFile, flakyFile] },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Tải lên 2 file" }),
		);

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith("Đã tải 1 file lên."),
		);
		expect(screen.getByRole("dialog", { name: "Tải file lên" })).toBeTruthy();
		expect(within(dialog).getAllByRole("alert")).toHaveLength(1);
		const retryButtons = within(dialog).getAllByRole("button", {
			name: "Thử lại 1 file lỗi",
		});
		expect(retryButtons).toHaveLength(1);
		expect(writes()).toHaveLength(2);

		fireEvent.click(retryButtons[0]);
		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith("Đã tải lên 2 file."),
		);
		await waitFor(() =>
			expect(screen.queryByRole("dialog", { name: "Tải file lên" })).toBeNull(),
		);
		// Lần thử lại chỉ gửi đúng file bị lỗi, không tải lại file đã thành công.
		expect(writes()).toHaveLength(3);
		expect(attemptsByName.get("file-ok.pdf")).toBe(1);
		expect(attemptsByName.get("file-loi.pdf")).toBe(2);
	});

	it("locks modal closing and folder selection while upload is in flight", async () => {
		let resolvePut!: (reply: Reply) => void;
		const putPromise = new Promise<Reply>((resolve) => {
			resolvePut = resolve;
		});
		renderRoute([], (method) => (method === "PUT" ? putPromise : null));
		await screen.findByTestId("materials-empty");
		fireEvent.click(screen.getAllByRole("button", { name: "Tải file lên" })[0]);
		const dialog = await screen.findByRole("dialog", { name: "Tải file lên" });

		fireEvent.change(within(dialog).getByLabelText("File"), {
			target: {
				files: [
					new File(["%PDF"], "dang-tai.pdf", {
						type: "application/pdf",
						lastModified: 1000,
					}),
				],
			},
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Tải lên" }));

		const busyButton = await within(dialog).findByRole("button", {
			name: "Đang tải lên…",
		});
		expect((busyButton as HTMLButtonElement).disabled).toBe(true);
		expect(busyButton.getAttribute("aria-busy")).toBe("true");
		const cancelButton = within(dialog).getByRole("button", {
			name: "Hủy",
		}) as HTMLButtonElement;
		expect(cancelButton.disabled).toBe(true);
		expect(
			(within(dialog).getByLabelText("Thư mục") as HTMLSelectElement).disabled,
		).toBe(true);

		// Escape, nút Đóng góc trên và nút Hủy đều bị khóa trong lúc đang tải.
		fireEvent.keyDown(document, { key: "Escape" });
		fireEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));
		fireEvent.click(cancelButton);
		expect(screen.getByRole("dialog", { name: "Tải file lên" })).toBeTruthy();

		resolvePut({
			status: 201,
			body: { material: material({ id: "m-inflight" }) },
		});
		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith("Đã tải file lên."),
		);
		await waitFor(() =>
			expect(screen.queryByRole("dialog", { name: "Tải file lên" })).toBeNull(),
		);
	});

	it("replaces a stale invalid-only selection when choosing a valid file next", async () => {
		renderRoute([], (method) =>
			method === "PUT"
				? { status: 201, body: { material: material({ id: "m-replaced" }) } }
				: null,
		);
		await screen.findByTestId("materials-empty");
		fireEvent.click(screen.getAllByRole("button", { name: "Tải file lên" })[0]);
		const dialog = await screen.findByRole("dialog", { name: "Tải file lên" });

		fireEvent.change(within(dialog).getByLabelText("File"), {
			target: {
				files: [
					new File(["<html>"], "bad.html", {
						type: "text/html",
						lastModified: 1000,
					}),
				],
			},
		});
		expect((await within(dialog).findByRole("alert")).textContent).toMatch(
			/Định dạng chưa hỗ trợ/,
		);
		fireEvent.click(within(dialog).getByRole("button", { name: "Tải lên" }));
		expect(writes()).toHaveLength(0);

		fireEvent.change(within(dialog).getByLabelText("File"), {
			target: {
				files: [
					new File(["%PDF"], "hop-le.pdf", {
						type: "application/pdf",
						lastModified: 2000,
					}),
				],
			},
		});
		expect(within(dialog).queryByRole("alert")).toBeNull();
		expect(within(dialog).queryByText("bad.html")).toBeNull();
		expect(within(dialog).getByText("hop-le.pdf")).toBeTruthy();

		fireEvent.click(within(dialog).getByRole("button", { name: "Tải lên" }));
		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith("Đã tải file lên."),
		);
		await waitFor(() =>
			expect(screen.queryByRole("dialog", { name: "Tải file lên" })).toBeNull(),
		);
		expect(writes()).toHaveLength(1);
		const [, init] = writes()[0] as [unknown, RequestInit];
		expect((init.headers as Record<string, string>)["X-File-Name"]).toBe(
			encodeURIComponent("hop-le.pdf"),
		);
	});
});
