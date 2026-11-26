// @vitest-environment jsdom

import type { LessonMaterialView } from "@teacher-os/api/material-contracts";
import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastMock }));
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

import { SessionMaterialsModal } from "@/components/class-detail/session-materials-modal";
import {
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
} from "@/test/kernel-harness";

const directRow: LessonMaterialView = {
	id: "mat-direct",
	folderId: null,
	title: "Handout buổi 1",
	description: "",
	kind: "file",
	url: null,
	mimeType: "application/pdf",
	sizeBytes: 512,
	originalName: "handout.pdf",
	usageCount: 1,
	createdAt: "2026-11-01T00:00:00.000Z",
	updatedAt: "2026-11-01T00:00:00.000Z",
	position: 0,
	attachedAt: "2026-11-08T00:00:00.000Z",
};

function startSessionServer(body: unknown, role = "teacher") {
	const server = startKernelServer(
		snapshotFixture({ viewer: { role, canAccessFinance: false } }),
		(req) => {
			if (
				req.method === "GET" &&
				req.path === "/api/classes/cl-1/sessions/2026-11-10/materials"
			) {
				return { status: 200, body };
			}
			return undefined;
		},
	);
	const kernelFetch = globalThis.fetch;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input));
			if (
				(init?.method ?? "GET").toUpperCase() === "GET" &&
				/^\/api\/materials\/[^/]+\/file$/.test(url.pathname)
			) {
				return new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
					status: 200,
					headers: { "content-type": "application/pdf" },
				});
			}
			return kernelFetch(input, init);
		}),
	);
	return server;
}

function lessonMaterial(
	overrides: Partial<LessonMaterialView> = {},
): LessonMaterialView {
	return {
		...directRow,
		...overrides,
	};
}

interface RecordedSessionUpload {
	pathname: string;
	method: string;
	fileName: string;
	contentType: string;
}

function startSessionUploadServer(options: {
	getItems: () => LessonMaterialView[];
	onUpload: (req: RecordedSessionUpload) => Response | Promise<Response>;
}) {
	startKernelServer(
		snapshotFixture({ viewer: { role: "teacher", canAccessFinance: false } }),
	);
	const kernelFetch = globalThis.fetch;
	const uploads: RecordedSessionUpload[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
			if (
				method === "GET" &&
				url.pathname === "/api/classes/cl-1/sessions/2026-11-10/materials"
			) {
				return new Response(JSON.stringify({ items: options.getItems() }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			if (
				method === "PUT" &&
				url.pathname === "/api/classes/cl-1/sessions/2026-11-10/materials/files"
			) {
				const headers = (init?.headers ?? {}) as Record<string, string>;
				const recorded: RecordedSessionUpload = {
					pathname: url.pathname,
					method,
					fileName: decodeURIComponent(headers["X-File-Name"] ?? ""),
					contentType: headers["Content-Type"] ?? "",
				};
				uploads.push(recorded);
				return options.onUpload(recorded);
			}
			return kernelFetch(input, init);
		}),
	);
	return { uploads };
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

const createObjectURL = vi.fn(() => "blob:session-preview");
const revokeObjectURL = vi.fn();

beforeEach(() => {
	URL.createObjectURL = createObjectURL;
	URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	createObjectURL.mockClear();
	revokeObjectURL.mockClear();
	toastMock.success.mockClear();
	toastMock.error.mockClear();
});

function renderModal(onClose: () => void = vi.fn()) {
	return renderWithKernel(
		<SessionMaterialsModal
			classId="cl-1"
			dateISO="2026-11-10"
			sessionLabel="10/11"
			onClose={onClose}
		/>,
	);
}

describe("SessionMaterialsModal", () => {
	it("lists direct materials with inline preview and detach actions", async () => {
		startSessionServer({ items: [directRow] });
		renderModal();

		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		const list = await within(dialog).findByRole("list", {
			name: "Tài liệu đã gắn",
		});
		expect(within(list).getByText("Handout buổi 1")).toBeTruthy();
		expect(
			within(list).getByRole("button", { name: "Gỡ Handout buổi 1" }),
		).toBeTruthy();
		// Thumbnail inline tự hiển thị ở đầu hàng và bấm vào mở modal phóng to.
		expect(
			await within(list).findByTestId("blob-document-thumbnail"),
		).toBeTruthy();
		expect(
			within(list).getByRole("button", { name: "Xem trước Handout buổi 1" }),
		).toBeTruthy();
		expect(
			within(dialog).queryByRole("list", { name: "Tài liệu từ giáo trình" }),
		).toBeNull();
	});

	it("renders curriculum materials read-only with inline preview, download link, and badge (#655)", async () => {
		startSessionServer({
			items: [directRow],
			curriculumMaterials: [
				{
					id: "mat-syllabus",
					title: "Cam 15 Test 1 Passage 1",
					description: "",
					kind: "file",
					url: null,
					mimeType: "application/pdf",
					sizeBytes: 2048,
					originalName: "cam15.pdf",
					position: 0,
				},
			],
		});
		renderModal();

		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		const curriculum = await within(dialog).findByRole("list", {
			name: "Tài liệu từ giáo trình",
		});
		expect(
			within(curriculum).getByText("Cam 15 Test 1 Passage 1"),
		).toBeTruthy();
		expect(within(curriculum).getByText("Từ giáo trình")).toBeTruthy();
		expect(
			await within(curriculum).findByTestId("blob-document-thumbnail"),
		).toBeTruthy();
		expect(
			within(curriculum).getByRole("button", {
				name: "Xem trước Cam 15 Test 1 Passage 1",
			}),
		).toBeTruthy();
		expect(
			within(curriculum).getByRole("link", {
				name: "Tải xuống Cam 15 Test 1 Passage 1",
			}),
		).toBeTruthy();
		expect(within(curriculum).queryByRole("button", { name: /Gỡ/ })).toBeNull();
		expect(
			within(dialog).getByRole("button", { name: "Gỡ Handout buổi 1" }),
		).toBeTruthy();
	});

	it("shows the empty state only when both lists are empty", async () => {
		startSessionServer({ items: [] });
		renderModal();

		await screen.findByRole("dialog", { name: "Tài liệu buổi 10/11" });
		expect(await screen.findByTestId("session-materials-empty")).toBeTruthy();
	});

	it("still shows the empty hint state for a fresh session", async () => {
		startSessionServer({
			items: [],
			curriculumMaterials: [
				{
					id: "mat-syllabus",
					title: "Cam 15 Test 1 Passage 1",
					description: "",
					kind: "file",
					url: null,
					mimeType: "application/pdf",
					sizeBytes: 2048,
					originalName: "cam15.pdf",
					position: 0,
				},
			],
		});
		renderModal();

		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		await within(dialog).findByRole("list", {
			name: "Tài liệu từ giáo trình",
		});
		expect(within(dialog).queryByTestId("session-materials-empty")).toBeNull();
	});

	it("hides attach, upload, and detach controls for ta while keeping open actions and curriculum list (#646)", async () => {
		startSessionServer(
			{
				items: [directRow],
				curriculumMaterials: [
					{
						id: "mat-syllabus",
						title: "Cam 15 Test 1 Passage 1",
						description: "",
						kind: "file",
						url: null,
						mimeType: "application/pdf",
						sizeBytes: 2048,
						originalName: "cam15.pdf",
						position: 0,
					},
				],
			},
			"ta",
		);
		renderModal();

		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		const list = await within(dialog).findByRole("list", {
			name: "Tài liệu đã gắn",
		});
		expect(within(list).getByText("Handout buổi 1")).toBeTruthy();
		expect(
			within(list).getByRole("link", { name: "Tải xuống Handout buổi 1" }),
		).toBeTruthy();
		expect(
			within(dialog).queryByRole("button", { name: "Chọn từ ngân hàng" }),
		).toBeNull();
		expect(
			within(dialog).queryByRole("button", { name: "Tải lên mới" }),
		).toBeNull();
		expect(
			within(dialog).queryByLabelText("Chọn file tải lên cho buổi học"),
		).toBeNull();
		expect(
			within(list).queryByRole("button", { name: "Gỡ Handout buổi 1" }),
		).toBeNull();
		const curriculum = within(dialog).getByRole("list", {
			name: "Tài liệu từ giáo trình",
		});
		expect(
			within(curriculum).getByText("Cam 15 Test 1 Passage 1"),
		).toBeTruthy();

		cleanup();
		startSessionServer({ items: [] }, "ta");
		renderModal();
		const emptyDialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		const emptyEl = await within(emptyDialog).findByTestId(
			"session-materials-empty",
		);
		expect(emptyEl.textContent).toBe("Chưa có tài liệu nào cho buổi này.");
	});

	it("closes only the expanded preview dialog on Escape, keeping the session dialog open", async () => {
		startSessionServer({ items: [directRow] });
		renderModal();

		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		fireEvent.click(
			await within(dialog).findByRole("button", {
				name: "Xem trước Handout buổi 1",
			}),
		);
		expect(
			await screen.findByRole("dialog", { name: "Handout buổi 1" }),
		).toBeTruthy();

		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("dialog", { name: "Handout buổi 1" })).toBeNull();
		expect(
			screen.getByRole("dialog", { name: "Tài liệu buổi 10/11" }),
		).toBeTruthy();
	});

	it("uploads multiple valid files in one selection, shows compact summary, and lets teacher dismiss it", async () => {
		const currentItems: LessonMaterialView[] = [];
		const resolvers = new Map<string, (res: Response) => void>();

		const { uploads } = startSessionUploadServer({
			getItems: () => [...currentItems],
			onUpload: (req) =>
				new Promise<Response>((resolve) => {
					resolvers.set(req.fileName, resolve);
				}),
		});

		renderModal();
		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		await within(dialog).findByTestId("session-materials-empty");

		const fileInput = within(dialog).getByLabelText(
			"Chọn file tải lên cho buổi học",
		) as HTMLInputElement;
		expect(fileInput.multiple).toBe(true);

		fireEvent.change(fileInput, {
			target: {
				files: [
					new File(["%PDF-1"], "handout-1.pdf", { type: "application/pdf" }),
					new File(["%PDF-2"], "handout-2.pdf", { type: "application/pdf" }),
				],
			},
		});

		await waitFor(() => expect(resolvers.size).toBe(2));
		const uploadingBtn = within(dialog).getByRole("button", {
			name: "Đang tải lên (0/2)…",
		}) as HTMLButtonElement;
		expect(uploadingBtn.disabled).toBe(true);
		expect(uploadingBtn.getAttribute("aria-busy")).toBe("true");

		const item1 = lessonMaterial({
			id: "mat-up-1",
			title: "Handout phần 1",
			originalName: "handout-1.pdf",
			position: 0,
		});
		currentItems.push(item1);
		resolvers.get("handout-1.pdf")?.(jsonResponse(201, { item: item1 }));

		expect(
			await within(dialog).findByRole("button", {
				name: "Đang tải lên (1/2)…",
			}),
		).toBeTruthy();

		const item2 = lessonMaterial({
			id: "mat-up-2",
			title: "Handout phần 2",
			originalName: "handout-2.pdf",
			position: 1,
		});
		currentItems.push(item2);
		resolvers.get("handout-2.pdf")?.(jsonResponse(201, { item: item2 }));

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith(
				"Đã tải lên 2 file và gắn vào buổi học.",
			),
		);
		expect(uploads).toHaveLength(2);
		for (const upload of uploads) {
			expect(upload.method).toBe("PUT");
			expect(upload.pathname).toBe(
				"/api/classes/cl-1/sessions/2026-11-10/materials/files",
			);
		}

		const queueList = within(dialog).getByRole("list", {
			name: "Hàng đợi tải lên",
		});
		expect(within(queueList).getByText("handout-1.pdf")).toBeTruthy();
		expect(within(queueList).getByText("handout-2.pdf")).toBeTruthy();
		expect(within(dialog).getByText("Đã tải xong 2/2 file.")).toBeTruthy();

		const attachedList = await within(dialog).findByRole("list", {
			name: "Tài liệu đã gắn",
		});
		expect(within(attachedList).getByText("Handout phần 1")).toBeTruthy();
		expect(within(attachedList).getByText("Handout phần 2")).toBeTruthy();

		const dismissBtn = within(dialog).getByRole("button", {
			name: "Ẩn tiến độ tải lên",
		});
		expect(dismissBtn.textContent).toBe("Ẩn");
		fireEvent.click(dismissBtn);
		expect(
			within(dialog).queryByRole("list", { name: "Hàng đợi tải lên" }),
		).toBeNull();
	});

	it("uploads only the valid PDF in a mixed batch and reports unsupported file inline", async () => {
		const currentItems: LessonMaterialView[] = [];
		const { uploads } = startSessionUploadServer({
			getItems: () => [...currentItems],
			onUpload: (req) => {
				const created = lessonMaterial({
					id: "mat-valid-1",
					title: "Bài đọc buổi học",
					originalName: req.fileName,
					position: 0,
				});
				currentItems.push(created);
				return jsonResponse(201, { item: created });
			},
		});

		renderModal();
		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		await within(dialog).findByTestId("session-materials-empty");

		const fileInput = within(dialog).getByLabelText(
			"Chọn file tải lên cho buổi học",
		) as HTMLInputElement;
		fireEvent.change(fileInput, {
			target: {
				files: [
					new File(["%PDF-1.4"], "bai-doc.pdf", { type: "application/pdf" }),
					new File(["<html>"], "trang-web.html", { type: "text/html" }),
				],
			},
		});

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith(
				"Đã tải lên 1 file và gắn vào buổi học.",
			),
		);
		expect(uploads).toEqual([
			{
				pathname: "/api/classes/cl-1/sessions/2026-11-10/materials/files",
				method: "PUT",
				fileName: "bai-doc.pdf",
				contentType: "application/pdf",
			},
		]);

		const queueList = within(dialog).getByRole("list", {
			name: "Hàng đợi tải lên",
		});
		expect(within(queueList).getByText("bai-doc.pdf")).toBeTruthy();
		expect(within(queueList).getByText("trang-web.html")).toBeTruthy();
		expect(within(queueList).getByText("Đã tải")).toBeTruthy();
		expect(within(queueList).getByText("Không hợp lệ")).toBeTruthy();
		expect(within(dialog).getByRole("alert").textContent).toMatch(
			/Định dạng chưa hỗ trợ/,
		);

		const attachedList = await within(dialog).findByRole("list", {
			name: "Tài liệu đã gắn",
		});
		expect(within(attachedList).getByText("Bài đọc buổi học")).toBeTruthy();
	});

	it("retries only the failed file after a partial server error", async () => {
		const currentItems: LessonMaterialView[] = [];
		let shouldFailSecond = true;
		const { uploads } = startSessionUploadServer({
			getItems: () => [...currentItems],
			onUpload: (req) => {
				if (req.fileName === "file-loi.pdf" && shouldFailSecond) {
					return jsonResponse(500, {});
				}
				const created = lessonMaterial({
					id: `mat-${uploads.length}`,
					title:
						req.fileName === "file-ok.pdf"
							? "Tài liệu thành công"
							: "Tài liệu thử lại",
					originalName: req.fileName,
					position: currentItems.length,
				});
				currentItems.push(created);
				return jsonResponse(201, { item: created });
			},
		});

		renderModal();
		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		await within(dialog).findByTestId("session-materials-empty");

		const fileInput = within(dialog).getByLabelText(
			"Chọn file tải lên cho buổi học",
		) as HTMLInputElement;
		fireEvent.change(fileInput, {
			target: {
				files: [
					new File(["%PDF-1"], "file-ok.pdf", { type: "application/pdf" }),
					new File(["%PDF-2"], "file-loi.pdf", { type: "application/pdf" }),
				],
			},
		});

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith(
				"Đã tải lên 1 file và gắn vào buổi học.",
			),
		);
		expect(uploads).toHaveLength(2);
		expect(within(dialog).getByRole("alert").textContent).toMatch(
			/Không lưu được/,
		);

		const retryBtn = within(dialog).getByRole("button", {
			name: "Thử lại 1 file lỗi",
		});
		shouldFailSecond = false;
		toastMock.success.mockClear();
		fireEvent.click(retryBtn);

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith(
				"Đã tải lên 2 file và gắn vào buổi học.",
			),
		);
		expect(uploads).toHaveLength(3);
		expect(uploads[2]?.fileName).toBe("file-loi.pdf");
		expect(
			within(dialog).queryByRole("button", { name: /Thử lại/ }),
		).toBeNull();
		expect(within(dialog).queryByRole("alert")).toBeNull();
		expect(within(dialog).getByText("Đã tải xong 2/2 file.")).toBeTruthy();

		const attachedList = await within(dialog).findByRole("list", {
			name: "Tài liệu đã gắn",
		});
		expect(within(attachedList).getByText("Tài liệu thành công")).toBeTruthy();
		expect(within(attachedList).getByText("Tài liệu thử lại")).toBeTruthy();
	});

	it("locks modal closing on Escape and close button while uploading, and unlocks once settled", async () => {
		const currentItems: LessonMaterialView[] = [];
		const resolvers = new Map<string, (res: Response) => void>();
		const onClose = vi.fn();

		startSessionUploadServer({
			getItems: () => [...currentItems],
			onUpload: (req) =>
				new Promise<Response>((resolve) => {
					resolvers.set(req.fileName, resolve);
				}),
		});

		renderModal(onClose);
		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		await within(dialog).findByTestId("session-materials-empty");

		const fileInput = within(dialog).getByLabelText(
			"Chọn file tải lên cho buổi học",
		) as HTMLInputElement;
		fireEvent.change(fileInput, {
			target: {
				files: [
					new File(["%PDF-1"], "single-handout.pdf", {
						type: "application/pdf",
					}),
				],
			},
		});

		await waitFor(() => expect(resolvers.size).toBe(1));
		const uploadingBtn = within(dialog).getByRole("button", {
			name: "Đang tải lên…",
		}) as HTMLButtonElement;
		expect(uploadingBtn.disabled).toBe(true);
		expect(uploadingBtn.getAttribute("aria-busy")).toBe("true");

		const closeButtons = within(dialog).getAllByRole("button", {
			name: "Đóng",
		}) as HTMLButtonElement[];
		const footerCloseBtn = closeButtons.find(
			(btn) => btn.textContent === "Đóng",
		);
		const headerCloseBtn = closeButtons.find(
			(btn) => btn.textContent !== "Đóng",
		);
		expect(footerCloseBtn).toBeTruthy();
		expect(headerCloseBtn).toBeTruthy();
		expect(footerCloseBtn?.disabled).toBe(true);

		fireEvent.keyDown(document, { key: "Escape" });
		if (footerCloseBtn) fireEvent.click(footerCloseBtn);
		if (headerCloseBtn) fireEvent.click(headerCloseBtn);
		expect(onClose).not.toHaveBeenCalled();

		const created = lessonMaterial({
			id: "mat-single-1",
			title: "Single handout",
			originalName: "single-handout.pdf",
			position: 0,
		});
		currentItems.push(created);
		resolvers.get("single-handout.pdf")?.(jsonResponse(201, { item: created }));

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith(
				"Đã tải lên và gắn vào buổi học.",
			),
		);
		expect(
			within(dialog).queryByRole("list", { name: "Hàng đợi tải lên" }),
		).toBeNull();
		expect(footerCloseBtn?.disabled).toBe(false);

		if (footerCloseBtn) fireEvent.click(footerCloseBtn);
		expect(onClose).toHaveBeenCalledTimes(1);

		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(2);
	});

	it("separates lecture and homework tabs, shows page-range metadata, switches category, and displays session assignments", async () => {
		const patchCalls: Array<{ path: string; body: unknown }> = [];
		const linkCalls: Array<{ path: string; body: unknown }> = [];
		const lectureItem = lessonMaterial({
			id: "mat-lec-slice",
			title: "Bài giảng mở bài",
			category: "lecture",
			sourceTitle: "Cambridge 18.pdf",
			sourcePageStart: 5,
			sourcePageEnd: 12,
		});
		const homeworkItem = lessonMaterial({
			id: "mat-hw-1",
			title: "Phiếu bài tập về nhà",
			category: "homework",
		});

		startKernelServer(
			snapshotFixture({ viewer: { role: "teacher", canAccessFinance: false } }),
		);
		const kernelFetch = globalThis.fetch;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
				if (
					method === "GET" &&
					url.pathname === "/api/classes/cl-1/sessions/2026-11-10/materials"
				) {
					return jsonResponse(200, { items: [lectureItem, homeworkItem] });
				}
				if (
					method === "PATCH" &&
					url.pathname ===
						"/api/classes/cl-1/sessions/2026-11-10/materials/mat-lec-slice"
				) {
					const body = JSON.parse(String(init?.body ?? "{}"));
					patchCalls.push({ path: url.pathname, body });
					return jsonResponse(200, {
						item: { ...lectureItem, category: body.category },
					});
				}
				if (
					method === "POST" &&
					url.pathname ===
						"/api/classes/cl-1/sessions/2026-11-10/materials/links"
				) {
					const body = JSON.parse(String(init?.body ?? "{}"));
					linkCalls.push({ path: url.pathname, body });
					return jsonResponse(201, {
						item: lessonMaterial({
							id: "mat-new-link",
							title: body.title,
							kind: "link",
							url: body.url,
							category: body.category,
						}),
					});
				}
				return kernelFetch(input, init);
			}),
		);

		const onOpenAssignPrompt = vi.fn();
		renderWithKernel(
			<SessionMaterialsModal
				classId="cl-1"
				dateISO="2026-11-10"
				sessionLabel="10/11"
				sessionAssignments={[
					{
						id: "ca-1",
						classId: "cl-1",
						promptId: "p-1",
						title: "Writing Task 2 — Education",
						due: "2026-11-20",
						sessionDate: "2026-11-10",
						note: "",
						createdAt: "2026-11-01T00:00:00Z",
						targets: [{ studentId: "st-1", submittedAt: null }],
					},
				]}
				onOpenAssignPrompt={onOpenAssignPrompt}
				onClose={vi.fn()}
			/>,
		);

		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});

		// Lecture tab shows sliced lecture badge and hides homework item
		expect(await within(dialog).findByText("Bài giảng mở bài")).toBeTruthy();
		expect(
			within(dialog).getByText("Cambridge 18.pdf · tr. 5–12"),
		).toBeTruthy();
		expect(within(dialog).queryByText("Phiếu bài tập về nhà")).toBeNull();

		// Switch category from lecture -> homework
		fireEvent.click(
			within(dialog).getByRole("button", {
				name: "Chuyển Bài giảng mở bài sang bài tập",
			}),
		);
		await waitFor(() => expect(patchCalls).toHaveLength(1));
		expect(patchCalls[0]?.body).toEqual({ category: "homework" });

		// Switch to Homework tab
		fireEvent.click(
			within(dialog).getByRole("tab", { name: /Bài tập buổi học/ }),
		);
		expect(within(dialog).getByText("Phiếu bài tập về nhà")).toBeTruthy();
		expect(within(dialog).getByText("Writing Task 2 — Education")).toBeTruthy();

		// Trigger assign prompt callback
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Giao bài từ ngân hàng đề" }),
		);
		expect(onOpenAssignPrompt).toHaveBeenCalledTimes(1);

		// Create homework link directly
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Thêm liên kết" }),
		);
		fireEvent.change(within(dialog).getByLabelText("Tiêu đề"), {
			target: { value: "Form bài tập" },
		});
		fireEvent.change(within(dialog).getByLabelText("Đường dẫn"), {
			target: { value: "https://forms.gle/test" },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Thêm liên kết" }),
		);
		await waitFor(() => expect(linkCalls).toHaveLength(1));
		expect(linkCalls[0]?.body).toMatchObject({
			title: "Form bài tập",
			url: "https://forms.gle/test",
			category: "homework",
		});
	});
});
