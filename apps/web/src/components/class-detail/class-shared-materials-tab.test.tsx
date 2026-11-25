// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
	ClassMaterialView,
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

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const reauthMock = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/reauth", () => ({ reauth: reauthMock }));
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

import { ClassSharedMaterialsTab } from "@/components/class-detail/class-shared-materials-tab";
import { kernelQueryKey } from "@/lib/repos/kernel";

function classMaterial(
	overrides: Partial<ClassMaterialView> = {},
): ClassMaterialView {
	return {
		id: "m-pdf",
		folderId: null,
		title: "Đề cương khóa học",
		description: "Lộ trình 12 buổi",
		kind: "file",
		url: null,
		mimeType: "application/pdf",
		sizeBytes: 2048,
		originalName: "de-cuong.pdf",
		usageCount: 0,
		classUsageCount: 1,
		createdAt: "2026-11-01T00:00:00.000Z",
		updatedAt: "2026-11-01T00:00:00.000Z",
		position: 0,
		attachedAt: "2026-11-02T00:00:00.000Z",
		...overrides,
	};
}

function bankMaterial(overrides: Partial<MaterialView> = {}): MaterialView {
	return {
		id: "m-bank-1",
		folderId: null,
		title: "Bảng phát âm IPA",
		description: "Tài liệu tham khảo chung",
		kind: "file",
		url: null,
		mimeType: "application/pdf",
		sizeBytes: 1024,
		originalName: "ipa.pdf",
		usageCount: 0,
		classUsageCount: 0,
		createdAt: "2026-11-01T00:00:00.000Z",
		updatedAt: "2026-11-01T00:00:00.000Z",
		...overrides,
	};
}

const FOLDERS: MaterialFolderView[] = [
	{
		id: "f-1",
		parentId: null,
		name: "IELTS Chung",
		createdAt: "2026-11-01T00:00:00.000Z",
	},
];

type Reply = { status: number; body: unknown };
type Handler = (
	method: string,
	url: URL,
	init?: RequestInit,
) => Reply | Promise<Response> | null;

let fetchMock: ReturnType<typeof vi.fn>;

function renderTab(options?: {
	items?: ClassMaterialView[];
	bank?: MaterialView[];
	role?: string;
	classId?: string;
	handler?: Handler;
}) {
	const classId = options?.classId ?? "cl-1";
	const items = options?.items ?? [];
	const bank = options?.bank ?? [];
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
		const custom = options?.handler?.(method, url, init);
		if (custom instanceof Promise) return custom;
		const reply: Reply =
			custom ??
			(method === "GET" && url.pathname === `/api/classes/${classId}/materials`
				? { status: 200, body: { items } }
				: method === "GET" && url.pathname === "/api/materials/folders"
					? { status: 200, body: { folders: FOLDERS } }
					: method === "GET" && url.pathname === "/api/materials"
						? { status: 200, body: { items: bank } }
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
	const result = render(
		<QueryClientProvider client={client}>
			<ClassSharedMaterialsTab classId={classId} />
		</QueryClientProvider>,
	);
	return { ...result, client };
}

function writeCalls() {
	return fetchMock.mock.calls.filter(
		([, init]) =>
			((init as RequestInit | undefined)?.method ?? "GET") !== "GET",
	);
}

beforeEach(() => {
	toastMock.success.mockReset();
	toastMock.error.mockReset();
	reauthMock.mockReset();
	URL.createObjectURL = vi.fn(() => "blob:class-shared-preview");
	URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("ClassSharedMaterialsTab", () => {
	it("shows loading status before the class materials request resolves", async () => {
		let resolveResponse!: (res: Response) => void;
		renderTab({
			handler: (method, url) => {
				if (
					method === "GET" &&
					url.pathname === "/api/classes/cl-1/materials"
				) {
					return new Promise<Response>((resolve) => {
						resolveResponse = resolve;
					});
				}
				return null;
			},
		});

		const status = screen.getByRole("status");
		expect(status.textContent).toBe("Đang tải tài liệu…");

		resolveResponse(
			new Response(JSON.stringify({ items: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		expect(
			await screen.findByTestId("class-shared-materials-empty"),
		).toBeTruthy();
	});

	it("shows an error alert with retry and recovers when refetch succeeds", async () => {
		let attempts = 0;
		renderTab({
			handler: (method, url) => {
				if (
					method === "GET" &&
					url.pathname === "/api/classes/cl-1/materials"
				) {
					attempts += 1;
					if (attempts === 1) return { status: 500, body: {} };
					return { status: 200, body: { items: [classMaterial()] } };
				}
				return null;
			},
		});

		const alert = await screen.findByRole("alert");
		fireEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));

		expect(await screen.findByText("Đề cương khóa học")).toBeTruthy();
		expect(attempts).toBe(2);
	});

	it("renders distinct empty copy for teachers and read-only TAs", async () => {
		renderTab({ items: [], role: "teacher" });
		const teacherEmpty = await screen.findByTestId(
			"class-shared-materials-empty",
		);
		expect(teacherEmpty.textContent).toContain("Chọn từ kho tài liệu");

		cleanup();
		renderTab({ items: [], role: "ta" });
		const taEmpty = await screen.findByTestId("class-shared-materials-empty");
		expect(taEmpty.textContent).toBe("Lớp hiện chưa có tài liệu chung nào.");
	});

	it("renders PDF with inline preview, media with play/download, and links with external open", async () => {
		renderTab({
			items: [
				classMaterial(),
				classMaterial({
					id: "m-audio",
					title: "Audio mẫu phát âm",
					description: "",
					kind: "media",
					mimeType: "audio/mpeg",
					sizeBytes: 4096,
					originalName: "pronunciation.mp3",
					position: 1,
				}),
				classMaterial({
					id: "m-link",
					title: "Từ điển Cambridge",
					description: "Tra từ hàng ngày",
					kind: "link",
					url: "https://dictionary.cambridge.org/",
					mimeType: null,
					sizeBytes: null,
					originalName: null,
					position: 2,
				}),
			],
		});

		const list = await screen.findByRole("list", {
			name: "Tài liệu chung của lớp",
		});
		expect(within(list).getByText("Đề cương khóa học")).toBeTruthy();
		expect(
			await within(list).findByTestId("blob-document-thumbnail"),
		).toBeTruthy();
		expect(
			within(list).getByRole("button", {
				name: "Xem trước Đề cương khóa học",
			}),
		).toBeTruthy();
		expect(
			within(list).getByRole("link", {
				name: "Tải xuống Đề cương khóa học",
			}),
		).toBeTruthy();
		expect(
			within(list).getByRole("button", { name: "Gỡ Đề cương khóa học" }),
		).toBeTruthy();

		expect(
			within(list).getByRole("link", { name: "Phát Audio mẫu phát âm" }),
		).toBeTruthy();
		expect(
			within(list).getByRole("link", {
				name: "Tải xuống Audio mẫu phát âm",
			}),
		).toBeTruthy();

		expect(
			within(list).getByRole("link", {
				name: "Mở liên kết Từ điển Cambridge",
			}),
		).toBeTruthy();
		expect(within(list).getByText("dictionary.cambridge.org")).toBeTruthy();
	});

	it("attaches a material from the bank browser and locks already-attached items", async () => {
		const existing = classMaterial({ id: "m-pdf", title: "Đề cương khóa học" });
		const available = bankMaterial({
			id: "m-bank-1",
			title: "Bảng phát âm IPA",
		});
		const currentItems: ClassMaterialView[] = [existing];

		renderTab({
			bank: [existing, available],
			handler: (method, url) => {
				if (
					method === "GET" &&
					url.pathname === "/api/classes/cl-1/materials"
				) {
					return { status: 200, body: { items: [...currentItems] } };
				}
				if (
					method === "POST" &&
					url.pathname === "/api/classes/cl-1/materials"
				) {
					const attached = classMaterial({
						...available,
						classUsageCount: 1,
						position: 1,
					});
					currentItems.push(attached);
					return { status: 201, body: { item: attached } };
				}
				return null;
			},
		});

		await screen.findByText("Đề cương khóa học");
		fireEvent.click(
			screen.getByRole("button", { name: "Chọn từ kho tài liệu" }),
		);

		const dialog = await screen.findByRole("dialog", {
			name: "Chọn từ kho tài liệu",
		});
		const alreadyBtn = (await within(dialog).findByRole("button", {
			name: "Đã gắn Đề cương khóa học",
		})) as HTMLButtonElement;
		expect(alreadyBtn.disabled).toBe(true);

		const pickBtn = within(dialog).getByRole("button", {
			name: "Gắn Bảng phát âm IPA",
		});
		fireEvent.click(pickBtn);

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith(
				"Đã gắn tài liệu vào lớp.",
			),
		);
		const [reqUrl, reqInit] = writeCalls()[0] ?? [];
		expect(String(reqUrl)).toMatch(/\/api\/classes\/cl-1\/materials$/);
		expect((reqInit as RequestInit).method).toBe("POST");
		expect(JSON.parse(String((reqInit as RequestInit).body))).toEqual({
			materialId: "m-bank-1",
		});
		await waitFor(() => {
			const locked = within(dialog).getByRole("button", {
				name: "Đã gắn Bảng phát âm IPA",
			}) as HTMLButtonElement;
			expect(locked.disabled).toBe(true);
		});
	});

	it("uploads a valid PDF in one step and blocks unsupported files on the client", async () => {
		const currentItems: ClassMaterialView[] = [];
		renderTab({
			handler: (method, url) => {
				if (
					method === "GET" &&
					url.pathname === "/api/classes/cl-1/materials"
				) {
					return { status: 200, body: { items: [...currentItems] } };
				}
				if (
					method === "PUT" &&
					url.pathname === "/api/classes/cl-1/materials/files"
				) {
					const created = classMaterial({
						id: "m-up",
						title: "Tai-lieu-lop.pdf",
					});
					currentItems.push(created);
					return { status: 201, body: { item: created } };
				}
				return null;
			},
		});

		await screen.findByTestId("class-shared-materials-empty");
		const fileInput = screen.getByLabelText(
			"Chọn file tải lên cho lớp học",
		) as HTMLInputElement;

		// Unsupported file blocked before any network write.
		fireEvent.change(fileInput, {
			target: {
				files: [new File(["<html>"], "bad.html", { type: "text/html" })],
			},
		});
		expect((await screen.findByRole("alert")).textContent).toMatch(
			/Định dạng chưa hỗ trợ/,
		);
		expect(writeCalls()).toHaveLength(0);

		// Valid PDF uploads directly to /api/classes/:classId/materials/files.
		const pdf = new File(["%PDF-1.4"], "Tài liệu lớp.pdf", { type: "" });
		fireEvent.change(fileInput, { target: { files: [pdf] } });

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith(
				"Đã tải lên và thêm vào tài liệu chung.",
			),
		);
		const [reqUrl, reqInit] = writeCalls()[0] ?? [];
		expect(String(reqUrl)).toMatch(/\/api\/classes\/cl-1\/materials\/files$/);
		expect((reqInit as RequestInit).method).toBe("PUT");
		expect((reqInit as RequestInit).headers).toEqual({
			"Content-Type": "application/pdf",
			"X-File-Name": encodeURIComponent("Tài liệu lớp.pdf"),
		});
		expect(await screen.findByText("Tai-lieu-lop.pdf")).toBeTruthy();
	});

	it("validates link URL inline and submits valid class shared links", async () => {
		const currentItems: ClassMaterialView[] = [];
		renderTab({
			handler: (method, url) => {
				if (
					method === "GET" &&
					url.pathname === "/api/classes/cl-1/materials"
				) {
					return { status: 200, body: { items: [...currentItems] } };
				}
				if (
					method === "POST" &&
					url.pathname === "/api/classes/cl-1/materials/links"
				) {
					const created = classMaterial({
						id: "m-link-new",
						title: "Ngân hàng đề Cambridge",
						description: "Luyện đọc cuối tuần",
						kind: "link",
						url: "https://example.edu.vn/reading",
						mimeType: null,
						sizeBytes: null,
						originalName: null,
					});
					currentItems.push(created);
					return { status: 201, body: { item: created } };
				}
				return null;
			},
		});

		await screen.findByTestId("class-shared-materials-empty");
		fireEvent.click(screen.getByRole("button", { name: "Thêm liên kết" }));

		const dialog = await screen.findByRole("dialog", { name: "Thêm liên kết" });
		fireEvent.change(within(dialog).getByLabelText("Tiêu đề"), {
			target: { value: "  Ngân hàng đề Cambridge  " },
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
		expect(writeCalls()).toHaveLength(0);

		fireEvent.change(within(dialog).getByLabelText("Đường dẫn"), {
			target: { value: "https://example.edu.vn/reading" },
		});
		fireEvent.change(within(dialog).getByLabelText("Mô tả (không bắt buộc)"), {
			target: { value: "  Luyện đọc cuối tuần  " },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Thêm liên kết" }),
		);

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith(
				"Đã thêm liên kết vào tài liệu chung.",
			),
		);
		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", { name: "Thêm liên kết" }),
			).toBeNull(),
		);
		const [reqUrl, reqInit] = writeCalls()[0] ?? [];
		expect(String(reqUrl)).toMatch(/\/api\/classes\/cl-1\/materials\/links$/);
		expect(JSON.parse(String((reqInit as RequestInit).body))).toEqual({
			title: "Ngân hàng đề Cambridge",
			url: "https://example.edu.vn/reading",
			description: "Luyện đọc cuối tuần",
		});
		expect(await screen.findByText("Ngân hàng đề Cambridge")).toBeTruthy();
	});

	it("detaches a material from the class without deleting it from the bank", async () => {
		let currentItems: ClassMaterialView[] = [classMaterial()];
		renderTab({
			handler: (method, url) => {
				if (
					method === "GET" &&
					url.pathname === "/api/classes/cl-1/materials"
				) {
					return { status: 200, body: { items: currentItems } };
				}
				if (
					method === "DELETE" &&
					url.pathname === "/api/classes/cl-1/materials/m-pdf"
				) {
					currentItems = [];
					return { status: 200, body: { ok: true } };
				}
				return null;
			},
		});

		fireEvent.click(
			await screen.findByRole("button", { name: "Gỡ Đề cương khóa học" }),
		);

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith(
				"Đã gỡ tài liệu khỏi lớp.",
			),
		);
		const [reqUrl, reqInit] = writeCalls()[0] ?? [];
		expect(String(reqUrl)).toMatch(/\/api\/classes\/cl-1\/materials\/m-pdf$/);
		expect((reqInit as RequestInit).method).toBe("DELETE");
		expect(
			await screen.findByTestId("class-shared-materials-empty"),
		).toBeTruthy();
	});

	it("hides all write and detach actions for ta while keeping read-only access", async () => {
		renderTab({ items: [classMaterial()], role: "ta" });

		const list = await screen.findByRole("list", {
			name: "Tài liệu chung của lớp",
		});
		expect(within(list).getByText("Đề cương khóa học")).toBeTruthy();
		expect(
			await within(list).findByTestId("blob-document-thumbnail"),
		).toBeTruthy();
		expect(
			within(list).getByRole("link", {
				name: "Tải xuống Đề cương khóa học",
			}),
		).toBeTruthy();

		expect(
			screen.queryByRole("button", { name: "Chọn từ kho tài liệu" }),
		).toBeNull();
		expect(screen.queryByRole("button", { name: "Tải file lên" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Thêm liên kết" })).toBeNull();
		expect(screen.queryByLabelText("Chọn file tải lên cho lớp học")).toBeNull();
		expect(
			screen.queryByText(/File tải lên và liên kết mới được lưu/),
		).toBeNull();
		expect(
			within(list).queryByRole("button", { name: "Gỡ Đề cương khóa học" }),
		).toBeNull();
	});

	it("closes open write modals and clears inline errors when role downgrades to ta", async () => {
		const { client } = renderTab({ items: [], role: "teacher" });
		await screen.findByTestId("class-shared-materials-empty");

		fireEvent.click(screen.getByRole("button", { name: "Thêm liên kết" }));
		expect(
			await screen.findByRole("dialog", { name: "Thêm liên kết" }),
		).toBeTruthy();

		act(() => {
			client.setQueryData(kernelQueryKey, {
				viewer: { role: "ta", canAccessFinance: false },
			});
		});

		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", { name: "Thêm liên kết" }),
			).toBeNull(),
		);
	});

	it("surfaces 409 ALREADY_ATTACHED inside the picker and triggers reauth on 401", async () => {
		let mode: "conflict" | "unauth" = "conflict";
		const available = bankMaterial({
			id: "m-race",
			title: "Tài liệu gắn trùng",
		});
		let classListGets = 0;

		renderTab({
			bank: [available],
			handler: (method, url) => {
				if (
					method === "GET" &&
					url.pathname === "/api/classes/cl-1/materials"
				) {
					classListGets += 1;
					return { status: 200, body: { items: [] } };
				}
				if (
					method === "POST" &&
					url.pathname === "/api/classes/cl-1/materials"
				) {
					if (mode === "conflict") {
						return {
							status: 409,
							body: { error: "ALREADY_ATTACHED", code: "ALREADY_ATTACHED" },
						};
					}
					return { status: 401, body: { error: "unauthorized" } };
				}
				return null;
			},
		});

		await screen.findByTestId("class-shared-materials-empty");
		const initialGets = classListGets;
		fireEvent.click(
			screen.getByRole("button", { name: "Chọn từ kho tài liệu" }),
		);
		const dialog = await screen.findByRole("dialog", {
			name: "Chọn từ kho tài liệu",
		});

		fireEvent.click(
			await within(dialog).findByRole("button", {
				name: "Gắn Tài liệu gắn trùng",
			}),
		);
		expect((await within(dialog).findByRole("alert")).textContent).toBe(
			"Tài liệu này đã được gắn trước đó.",
		);
		await waitFor(() => expect(classListGets).toBeGreaterThan(initialGets));
		expect(reauthMock).not.toHaveBeenCalled();

		mode = "unauth";
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Gắn Tài liệu gắn trùng" }),
		);
		await waitFor(() => expect(reauthMock).toHaveBeenCalledTimes(1));
	});
});
