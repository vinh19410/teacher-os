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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	classMaterialFileUrl,
	setActiveStudentOrgId,
} from "@/lib/repos/student";
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

const createObjectURL = vi.fn(() => "blob:class-material-preview-1");
const revokeObjectURL = vi.fn();

beforeEach(() => {
	URL.createObjectURL = createObjectURL;
	URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
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

function renderTab(classId = "class-1") {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<ClassMaterialsTab classId={classId} />
		</QueryClientProvider>,
	);
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

	it("renders PDF preview, DOCX download, audio/video players, external link, and exposes no write controls", async () => {
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
		const list = await screen.findByRole("list", {
			name: "Tài liệu chung của lớp",
		});
		expect(list).toBeTruthy();

		const rows = within(list).getAllByTestId("class-material");
		expect(rows).toHaveLength(5);
		expect(screen.getByText("Xem trước khi khai giảng")).toBeTruthy();
		expect(screen.getAllByText("2.5 MB").length).toBeGreaterThan(0);

		const [pdfRow, docxRow, audioRow, videoRow, linkRow] = rows;

		// PDF: thumbnail preview + download link only (no open-in-tab)
		expect(
			await within(pdfRow as HTMLElement).findByTestId(
				"blob-document-thumbnail",
			),
		).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringMatching(
				/\/api\/student\/classes\/class-1\/materials\/m1\/file$/,
			),
			expect.objectContaining({
				credentials: "include",
				headers: expect.objectContaining({ Accept: "*/*" }),
			}),
		);
		expect(pdfRow?.querySelector("a[href*='download=1']")).toBeTruthy();
		expect(pdfRow?.querySelector("a[target='_blank']")).toBeNull();

		// DOCX: no inline preview thumbnail, keeps download link
		expect(
			within(docxRow as HTMLElement).queryByTestId("material-preview"),
		).toBeNull();
		expect(docxRow?.querySelector("a[href*='download=1']")).toBeTruthy();

		// Media: audio and video players + Open (new tab) + Download
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

		// Link: safe target="_blank" rel="noopener noreferrer", no download
		const extLink = linkRow?.querySelector("a");
		expect(extLink?.getAttribute("href")).toBe(
			"https://dictionary.cambridge.org/",
		);
		expect(extLink?.getAttribute("target")).toBe("_blank");
		expect(extLink?.getAttribute("rel")).toBe("noopener noreferrer");
		expect(linkRow?.querySelector("a[href*='download=1']")).toBeNull();

		// Read-only: no file input or teacher mutation buttons
		expect(container.querySelector("input[type='file']")).toBeNull();
		expect(
			screen.queryByRole("button", {
				name: /tải lên|chọn từ kho|thêm|sửa|xóa|xoá|gỡ/i,
			}),
		).toBeNull();
		const buttons = screen.getAllByRole("button");
		expect(buttons).toHaveLength(1);
		expect(buttons[0]?.getAttribute("aria-label")).toBe(
			"Xem trước Lộ trình khóa học",
		);
	});

	it("opens preview dialog via portal, restores focus on Escape, and revokes blob on unmount", async () => {
		stubFetch(200, {
			items: [item({ id: "m1", title: "Sổ tay học viên" })],
		});
		const { container, unmount } = renderTab();
		await screen.findByTestId("blob-document-thumbnail");

		const expandBtn = screen.getByRole("button", {
			name: "Xem trước Sổ tay học viên",
		});
		expandBtn.focus();
		fireEvent.click(expandBtn);

		const dialog = await screen.findByRole("dialog", {
			name: "Sổ tay học viên",
		});
		expect(container.contains(dialog)).toBe(false);
		expect(document.body.contains(dialog)).toBe(true);
		expect(
			await within(dialog).findByTestId("blob-document-view"),
		).toBeTruthy();

		fireEvent.keyDown(document, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(document.activeElement).toBe(expandBtn);
		expect(revokeObjectURL).not.toHaveBeenCalled();

		unmount();
		expect(revokeObjectURL).toHaveBeenCalledWith(
			"blob:class-material-preview-1",
		);
	});

	it("recovers from 403 STUDENT_ORG_MISMATCH on preview fetch by clearing stale org and retrying once", async () => {
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
		const thumb = await screen.findByTestId("blob-document-thumbnail");
		expect(thumb.getAttribute("data-url")).toBe(
			"blob:class-material-preview-1",
		);
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
		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain(
			"Định dạng tài liệu không hỗ trợ xem trước.",
		);
		expect(createObjectURL).not.toHaveBeenCalled();
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
		const { container } = renderTab("c1");
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
