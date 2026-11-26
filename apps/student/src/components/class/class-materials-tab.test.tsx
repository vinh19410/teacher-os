// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StudentClassMaterialView } from "@teacher-os/api/material-contracts";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	classMaterialFileUrl,
	setActiveStudentOrgId,
} from "@/lib/repos/student";
import {
	ACTIVE_STUDENT_USER_KEY,
	clearActiveStudentOrgId,
} from "@/lib/student-org-storage";
import { ClassMaterialsTab } from "./class-materials-tab";

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
			viewportClassName?: string;
		}) => (
			<div
				data-testid="blob-document-view"
				data-url={props.blobUrl}
				data-mime={props.mimeType}
				data-label={props.label}
				data-viewport-class={props.viewportClassName ?? ""}
			/>
		),
	}),
);

let blobCounter = 0;
const createObjectURL = vi.fn(() => {
	blobCounter += 1;
	return `blob:class-material-preview-${blobCounter}`;
});
const revokeObjectURL = vi.fn();

beforeEach(() => {
	blobCounter = 0;
	URL.createObjectURL = createObjectURL;
	URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
	vi.useRealTimers();
	cleanup();
	localStorage.removeItem("active_student_org_id");
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	createObjectURL.mockClear();
	revokeObjectURL.mockClear();
});

function stubFetch(
	status: number,
	body: unknown,
	fileReply?: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
	const fetchMock = vi.fn(
		async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes("/file")) {
				if (fileReply) return fileReply(url, init);
				return new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
					status: 200,
					headers: { "Content-Type": "application/pdf" },
				});
			}
			return new Response(JSON.stringify(body), {
				status,
				headers: { "Content-Type": "application/json" },
			});
		},
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function item(
	over: Partial<StudentClassMaterialView> & { id: string },
): StudentClassMaterialView {
	return {
		title: "Tài liệu chung",
		description: "",
		kind: "file",
		url: null,
		mimeType: "application/pdf",
		sizeBytes: 2_500_000,
		originalName: "course-guide.pdf",
		position: 0,
		...over,
	};
}

function renderTab(
	props: Partial<ComponentProps<typeof ClassMaterialsTab>> & {
		classId?: string;
	} = {},
) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const { classId = "class-1", ...rest } = props;
	const utils = render(
		<QueryClientProvider client={client}>
			<ClassMaterialsTab classId={classId} {...rest} />
		</QueryClientProvider>,
	);
	return {
		...utils,
		rerenderTab(nextProps: Partial<ComponentProps<typeof ClassMaterialsTab>>) {
			utils.rerender(
				<QueryClientProvider client={client}>
					<ClassMaterialsTab
						classId={nextProps.classId ?? classId}
						{...rest}
						{...nextProps}
					/>
				</QueryClientProvider>,
			);
		},
	};
}

describe("ClassMaterialsTab", () => {
	it("shows loading status while fetching shared materials", () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise(() => {})),
		);
		renderTab();
		const status = screen.getByRole("status");
		expect(status.textContent).toContain("Đang tải tài liệu chung…");
	});

	it("shows error alert and refetches when clicking retry button", async () => {
		let calls = 0;
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/file")) {
				return new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
					status: 200,
					headers: { "Content-Type": "application/pdf" },
				});
			}
			calls += 1;
			if (calls === 1) {
				return new Response(JSON.stringify({ error: "server error" }), {
					status: 500,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response(
				JSON.stringify({
					items: [item({ id: "m1", title: "Giáo trình tổng hợp" })],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		renderTab();
		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain(
			"Không tải được tài liệu chung. Vui lòng thử lại sau ít phút.",
		);

		const retryButton = screen.getByRole("button", { name: "Thử lại" });
		fireEvent.click(retryButton);

		await waitFor(() =>
			expect(screen.getAllByTestId("class-material")).toHaveLength(1),
		);
		expect(
			screen.getByText("Giáo trình tổng hợp", { selector: "p" }),
		).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
		expect(calls).toBe(2);
	});

	it("shows empty state when class has no shared materials", async () => {
		stubFetch(200, { items: [] });
		renderTab();
		const empty = await screen.findByTestId("class-materials-empty");
		expect(empty.textContent).toContain(
			"Lớp chưa có tài liệu chung nào. Giáo viên sẽ chia sẻ tài liệu dùng cho cả khóa tại đây.",
		);
	});

	it("treats 404 response as empty without rendering an error alert", async () => {
		stubFetch(404, { error: "class not found" });
		renderTab();
		expect(await screen.findByTestId("class-materials-empty")).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("groups by kind, defers PDF blob fetch until click, keeps audio/video/link/download, and exposes no write controls", async () => {
		const fetchMock = stubFetch(200, {
			items: [
				item({
					id: "m1",
					title: "Lộ trình khóa học",
					description: "Xem trước khi khai giảng",
				}),
				item({
					id: "m2",
					title: "Mẫu bài viết Task 2",
					mimeType:
						"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
					originalName: "task2-template.docx",
				}),
				item({
					id: "m3",
					title: "Audio phát âm",
					kind: "media",
					mimeType: "audio/mpeg",
					originalName: "pronunciation.mp3",
				}),
				item({
					id: "m4",
					title: "Video hướng dẫn",
					kind: "media",
					mimeType: "video/mp4",
					originalName: "guide.mp4",
				}),
				item({
					id: "m5",
					title: "Từ điển Cambridge",
					kind: "link",
					url: "https://dictionary.cambridge.org/",
					mimeType: null,
					sizeBytes: null,
					originalName: null,
				}),
			],
		});

		const { container } = renderTab();
		const rows = await screen.findAllByTestId("class-material");
		expect(rows).toHaveLength(5);

		// 3 nhóm theo kind thật
		expect(screen.getByRole("list", { name: "Tài liệu" })).toBeTruthy();
		expect(screen.getByRole("list", { name: "Audio – Video" })).toBeTruthy();
		expect(screen.getByRole("list", { name: "Liên kết" })).toBeTruthy();
		expect(screen.getByText("Xem trước khi khai giảng")).toBeTruthy();

		// KHÔNG tự fetch /file cho PDF khi vừa mount
		expect(
			fetchMock.mock.calls.some(([input]) => String(input).includes("/file")),
		).toBe(false);

		const [pdfRow, docxRow, audioRow, videoRow, linkRow] = rows;

		// PDF: nút Xem trước on-demand + link tải (không target _blank)
		expect(
			within(pdfRow as HTMLElement).getByRole("button", {
				name: "Xem trước Lộ trình khóa học",
			}),
		).toBeTruthy();
		expect(pdfRow?.querySelector("a[href*='download=1']")).toBeTruthy();
		expect(pdfRow?.querySelector("a[target='_blank']")).toBeNull();

		// DOCX: không có nút Xem trước, giữ link tải
		expect(
			within(docxRow as HTMLElement).queryByRole("button", {
				name: /Xem trước/,
			}),
		).toBeNull();
		expect(docxRow?.querySelector("a[href*='download=1']")).toBeTruthy();

		// Media: audio và video inline players + Mở + Tải
		const audioEl = audioRow?.querySelector("audio");
		expect(audioEl?.getAttribute("src")).toContain(
			"/api/student/classes/class-1/materials/m3/file",
		);
		expect(
			audioRow?.querySelector("a[target='_blank']")?.getAttribute("rel"),
		).toBe("noopener noreferrer");
		expect(audioRow?.querySelector("a[href*='download=1']")).toBeTruthy();

		const videoEl = videoRow?.querySelector("video");
		expect(videoEl?.getAttribute("src")).toContain(
			"/api/student/classes/class-1/materials/m4/file",
		);
		expect(
			videoRow?.querySelector("a[target='_blank']")?.getAttribute("rel"),
		).toBe("noopener noreferrer");
		expect(videoRow?.querySelector("a[href*='download=1']")).toBeTruthy();

		// Link: hostname + target="_blank" rel="noopener noreferrer", không download
		expect(linkRow?.textContent).toContain("dictionary.cambridge.org");
		const extLink = linkRow?.querySelector("a");
		expect(extLink?.getAttribute("href")).toBe(
			"https://dictionary.cambridge.org/",
		);
		expect(extLink?.getAttribute("target")).toBe("_blank");
		expect(extLink?.getAttribute("rel")).toBe("noopener noreferrer");
		expect(linkRow?.querySelector("a[href*='download=1']")).toBeNull();

		// Read-only ở trạng thái mặc định: 0 input file, 0 nút ghi/xóa
		expect(container.querySelector("input[type='file']")).toBeNull();
		expect(
			screen.queryByRole("button", {
				name: /tải lên|chọn từ kho|thêm|sửa|xóa|xoá|gỡ/i,
			}),
		).toBeNull();
	});

	it("loads on-demand preview on click, prevents double-click duplicate fetch, restores focus on Escape, and revokes blob on close & logout", async () => {
		let resolveFile!: (res: Response) => void;
		const fetchMock = stubFetch(
			200,
			{ items: [item({ id: "m1", title: "Sổ tay học viên" })] },
			() =>
				new Promise<Response>((resolve) => {
					resolveFile = resolve;
				}),
		);
		const { container } = renderTab();

		const expandBtn = await screen.findByRole("button", {
			name: "Xem trước Sổ tay học viên",
		});
		expandBtn.focus();
		// Double click không được bắn 2 request
		fireEvent.click(expandBtn);
		fireEvent.click(expandBtn);
		expect(expandBtn.getAttribute("aria-busy")).toBe("true");
		expect((expandBtn as HTMLButtonElement).disabled).toBe(false);

		const fileCalls = fetchMock.mock.calls.filter(([u]) =>
			String(u).includes("/file"),
		);
		expect(fileCalls).toHaveLength(1);

		await act(async () => {
			resolveFile(
				new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
					status: 200,
					headers: { "Content-Type": "application/pdf" },
				}),
			);
		});

		const dialog = await screen.findByRole("dialog", {
			name: "Sổ tay học viên",
		});
		expect(container.contains(dialog)).toBe(false);
		expect(document.body.contains(dialog)).toBe(true);
		expect(
			await within(dialog).findByTestId("blob-document-view"),
		).toBeTruthy();

		// Escape đóng dialog, trả focus về nút Xem trước và thu hồi blob URL
		fireEvent.keyDown(document, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(document.activeElement).toBe(expandBtn);
		expect(revokeObjectURL).toHaveBeenCalledWith(
			"blob:class-material-preview-1",
		);

		// Mở lại với org-1 rồi giả lập logout ở tab khác (org-1 -> null): tự đóng + thu hồi blob
		act(() => {
			setActiveStudentOrgId("org-1");
		});
		fireEvent.click(expandBtn);
		await act(async () => {
			resolveFile(
				new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
					status: 200,
					headers: { "Content-Type": "application/pdf" },
				}),
			);
		});
		expect(
			await screen.findByRole("dialog", { name: "Sổ tay học viên" }),
		).toBeTruthy();

		act(() => {
			clearActiveStudentOrgId();
		});
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(revokeObjectURL).toHaveBeenCalledWith(
			"blob:class-material-preview-2",
		);
	});

	it("recovers from 403 STUDENT_ORG_MISMATCH on on-demand preview click by clearing stale org and retrying once", async () => {
		localStorage.setItem("active_student_org_id", "org-stale");
		let fileCalls = 0;
		stubFetch(
			200,
			{ items: [item({ id: "m1", title: "Tài liệu org" })] },
			(_url, init) => {
				fileCalls += 1;
				const headers = init?.headers as Record<string, string> | undefined;
				if (fileCalls === 1) {
					expect(headers?.["x-student-org-id"]).toBe("org-stale");
					return new Response(
						JSON.stringify({ code: "STUDENT_ORG_MISMATCH" }),
						{
							status: 403,
							headers: { "Content-Type": "application/json" },
						},
					);
				}
				expect(headers?.["x-student-org-id"]).toBeUndefined();
				return new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
					status: 200,
					headers: { "Content-Type": "application/pdf" },
				});
			},
		);

		renderTab();
		const btn = await screen.findByRole("button", {
			name: "Xem trước Tài liệu org",
		});
		fireEvent.click(btn);

		const dialog = await screen.findByRole("dialog", { name: "Tài liệu org" });
		const view = await within(dialog).findByTestId("blob-document-view");
		expect(view.getAttribute("data-url")).toBe("blob:class-material-preview-1");
		expect(fileCalls).toBe(2);
		expect(localStorage.getItem("active_student_org_id")).toBeNull();
	});

	it("rejects non-previewable Content-Type without creating a blob URL", async () => {
		stubFetch(
			200,
			{ items: [item({ id: "m1", title: "Tệp giả mạo" })] },
			async () =>
				new Response("<html>bad</html>", {
					status: 200,
					headers: { "Content-Type": "text/html; charset=utf-8" },
				}),
		);
		renderTab();
		const btn = await screen.findByRole("button", {
			name: "Xem trước Tệp giả mạo",
		});
		fireEvent.click(btn);

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain(
			"Định dạng tài liệu không hỗ trợ xem trước.",
		);
		expect(createObjectURL).not.toHaveBeenCalled();
	});

	it("revokes late blob URL on unmount mid-fetch without surfacing a fake error alert", async () => {
		let resolveFile!: (res: Response) => void;
		stubFetch(
			200,
			{ items: [item({ id: "m1", title: "Tệp tải chậm" })] },
			() =>
				new Promise<Response>((resolve) => {
					resolveFile = resolve;
				}),
		);
		const { unmount } = renderTab();
		const btn = await screen.findByRole("button", {
			name: "Xem trước Tệp tải chậm",
		});
		fireEvent.click(btn);
		unmount();

		await act(async () => {
			resolveFile(
				new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
					status: 200,
					headers: { "Content-Type": "application/pdf" },
				}),
			);
		});
		expect(revokeObjectURL).toHaveBeenCalledWith(
			"blob:class-material-preview-1",
		);
	});

	it("aborts in-flight preview and closes open dialog on cross-tab logout storage event even when activeOrgId is null", async () => {
		let resolveFile!: (res: Response) => void;
		stubFetch(
			200,
			{ items: [item({ id: "m1", title: "Tài liệu bảo mật" })] },
			() =>
				new Promise<Response>((resolve) => {
					resolveFile = resolve;
				}),
		);
		renderTab();
		const btn = await screen.findByRole("button", {
			name: "Xem trước Tài liệu bảo mật",
		});

		// Trường hợp A: đăng xuất ở tab khác trong lúc đang loading
		fireEvent.click(btn);
		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: ACTIVE_STUDENT_USER_KEY,
					oldValue: "u1",
					newValue: null,
				}),
			);
		});
		await act(async () => {
			resolveFile(
				new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
					status: 200,
					headers: { "Content-Type": "application/pdf" },
				}),
			);
		});
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(revokeObjectURL).toHaveBeenCalledWith(
			"blob:class-material-preview-1",
		);

		// Trường hợp B: dialog đang mở khi activeOrgId === null, đăng xuất ở tab khác
		fireEvent.click(btn);
		await act(async () => {
			resolveFile(
				new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
					status: 200,
					headers: { "Content-Type": "application/pdf" },
				}),
			);
		});
		expect(
			await screen.findByRole("dialog", { name: "Tài liệu bảo mật" }),
		).toBeTruthy();

		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: ACTIVE_STUDENT_USER_KEY,
					oldValue: "u1",
					newValue: null,
				}),
			);
		});
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(revokeObjectURL).toHaveBeenCalledWith(
			"blob:class-material-preview-2",
		);
	});

	it("keeps 403 retry alive when useStudentTeam hydrates null -> org-real before PDF blob finishes", async () => {
		localStorage.setItem("active_student_org_id", "org-stale");
		let fileCalls = 0;
		let resolveRetry!: (res: Response) => void;
		stubFetch(
			200,
			{ items: [item({ id: "m1", title: "Tài liệu retry org" })] },
			() => {
				fileCalls += 1;
				if (fileCalls === 1) {
					return new Response(
						JSON.stringify({ code: "STUDENT_ORG_MISMATCH" }),
						{
							status: 403,
							headers: { "Content-Type": "application/json" },
						},
					);
				}
				return new Promise<Response>((resolve) => {
					resolveRetry = resolve;
				});
			},
		);

		renderTab();
		fireEvent.click(
			await screen.findByRole("button", {
				name: "Xem trước Tài liệu retry org",
			}),
		);
		await waitFor(() => expect(fileCalls).toBe(2));

		// Mô phỏng useStudentTeam kịp hydrate org-real trước khi file PDF tải xong
		act(() => {
			setActiveStudentOrgId("org-real");
		});
		await act(async () => {
			resolveRetry(
				new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
					status: 200,
					headers: { "Content-Type": "application/pdf" },
				}),
			);
		});

		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu retry org",
		});
		expect(
			await within(dialog).findByTestId("blob-document-view"),
		).toBeTruthy();
	});

	it("filters by kind, searches Vietnamese without diacritics & hostname, and resets cleanly", async () => {
		stubFetch(200, {
			items: [
				item({
					id: "m1",
					title: "Lộ trình khóa học",
					kind: "file",
				}),
				item({
					id: "m2",
					title: "Audio luyện nghe",
					kind: "media",
					mimeType: "audio/mpeg",
				}),
				item({
					id: "m3",
					title: "Từ điển trực tuyến",
					kind: "link",
					url: "https://dictionary.cambridge.org/",
					mimeType: null,
					sizeBytes: null,
					originalName: null,
				}),
			],
		});

		renderTab();
		await screen.findAllByTestId("class-material");

		// Lọc theo loại
		const filterGroup = screen.getByRole("group", {
			name: "Lọc theo loại tài liệu",
		});
		fireEvent.click(
			within(filterGroup).getByRole("button", { name: "Audio – Video" }),
		);
		expect(screen.getAllByTestId("class-material")).toHaveLength(1);
		expect(screen.queryByRole("list", { name: "Tài liệu" })).toBeNull();
		expect(screen.queryByRole("list", { name: "Liên kết" })).toBeNull();

		// Quay về Tất cả và tìm tiếng Việt không dấu
		fireEvent.click(
			within(filterGroup).getByRole("button", { name: "Tất cả" }),
		);
		const searchInput = screen.getByLabelText("Tìm tài liệu");
		fireEvent.change(searchInput, { target: { value: "lo trinh" } });
		expect(screen.getAllByTestId("class-material")).toHaveLength(1);
		expect(
			screen.getByText("Lộ trình khóa học", { selector: "p" }),
		).toBeTruthy();

		// Tìm theo hostname liên kết
		fireEvent.change(searchInput, { target: { value: "cambridge" } });
		expect(screen.getAllByTestId("class-material")).toHaveLength(1);
		expect(screen.getByText("Từ điển trực tuyến")).toBeTruthy();

		// Không khớp -> hiện empty search + Xóa tìm kiếm
		fireEvent.change(searchInput, { target: { value: "khong-ton-tai" } });
		expect(screen.queryAllByTestId("class-material")).toHaveLength(0);
		fireEvent.click(screen.getByRole("button", { name: "Xóa tìm kiếm" }));
		expect(screen.getAllByTestId("class-material")).toHaveLength(3);
	});

	it("debounces URL query safely (300ms): preserves filter clicks, cancels on unmount, and syncs external query prop", async () => {
		stubFetch(200, {
			items: [
				item({ id: "m1", title: "Lộ trình khóa học", kind: "file" }),
				item({
					id: "m2",
					title: "Audio luyện nghe",
					kind: "media",
					mimeType: "audio/mpeg",
				}),
			],
		});
		const onQueryChange = vi.fn();
		const onKindFilterChange = vi.fn();
		const { unmount, rerenderTab } = renderTab({
			kindFilter: "all",
			query: "",
			onKindFilterChange,
			onQueryChange,
		});
		await screen.findAllByTestId("class-material");

		vi.useFakeTimers();
		const searchInput = screen.getByLabelText(
			"Tìm tài liệu",
		) as HTMLInputElement;
		fireEvent.change(searchInput, { target: { value: "cambridge" } });

		// Chưa tới 300ms: chưa đẩy lên URL
		act(() => {
			vi.advanceTimersByTime(150);
		});
		expect(onQueryChange).not.toHaveBeenCalled();

		// Bấm chuyển filter loại trước 300ms -> gọi onKindFilterChange bình thường
		fireEvent.click(screen.getByRole("button", { name: "Audio – Video" }));
		expect(onKindFilterChange).toHaveBeenCalledWith("media");

		// Sau đủ 300ms -> đẩy query lên URL 1 lần
		act(() => {
			vi.advanceTimersByTime(200);
		});
		expect(onQueryChange).toHaveBeenCalledTimes(1);
		expect(onQueryChange).toHaveBeenCalledWith("cambridge");

		// Đổi prop query từ URL -> đồng bộ lại input
		rerenderTab({
			kindFilter: "media",
			query: "audio",
			onKindFilterChange,
			onQueryChange,
		});
		expect(searchInput.value).toBe("audio");

		// Gõ rồi unmount trước 300ms -> không gọi thêm onQueryChange
		fireEvent.change(searchInput, { target: { value: "unsent" } });
		unmount();
		act(() => {
			vi.advanceTimersByTime(500);
		});
		expect(onQueryChange).toHaveBeenCalledTimes(1);
	});

	it("appends active org query param to file and media URLs and reacts to org changes", async () => {
		localStorage.setItem("active_student_org_id", "org-2");
		expect(classMaterialFileUrl("c1", "m1", true)).toMatch(
			/\/api\/student\/classes\/c1\/materials\/m1\/file\?download=1&org=org-2$/,
		);
		expect(classMaterialFileUrl("c1", "m1")).toMatch(
			/\/api\/student\/classes\/c1\/materials\/m1\/file\?org=org-2$/,
		);

		stubFetch(200, {
			items: [
				item({
					id: "m3",
					title: "Nghe chung",
					kind: "media",
					mimeType: "audio/mpeg",
				}),
			],
		});
		const { container } = renderTab({ classId: "c1" });
		await waitFor(() =>
			expect(screen.getAllByTestId("class-material")).toHaveLength(1),
		);

		expect(container.querySelector("audio")?.getAttribute("src")).toMatch(
			/\/api\/student\/classes\/c1\/materials\/m3\/file\?org=org-2$/,
		);
		expect(
			container.querySelector("a[href*='download=1']")?.getAttribute("href"),
		).toMatch(
			/\/api\/student\/classes\/c1\/materials\/m3\/file\?download=1&org=org-2$/,
		);

		act(() => {
			setActiveStudentOrgId("org-3");
		});
		expect(container.querySelector("audio")?.getAttribute("src")).toMatch(
			/\/api\/student\/classes\/c1\/materials\/m3\/file\?org=org-3$/,
		);
		expect(
			container.querySelector("a[href*='download=1']")?.getAttribute("href"),
		).toMatch(
			/\/api\/student\/classes\/c1\/materials\/m3\/file\?download=1&org=org-3$/,
		);

		localStorage.removeItem("active_student_org_id");
		expect(classMaterialFileUrl("c1", "m1")).toMatch(/\/file$/);
	});
});
