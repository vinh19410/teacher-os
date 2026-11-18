// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StudentLessonMaterialView } from "@teacher-os/api/material-contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lessonMaterialFileUrl } from "@/lib/repos/student";
import { formatFileSize, LessonMaterials } from "./lesson-materials";

vi.mock(
	"@teacher-os/ui/components/document-preview/blob-document-view",
	() => ({
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

const createObjectURL = vi.fn(() => "blob:student-preview-1");
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
	over: Partial<StudentLessonMaterialView> & { id: string },
): StudentLessonMaterialView {
	return {
		title: "Tài liệu",
		description: "",
		kind: "file",
		url: null,
		mimeType: "application/pdf",
		sizeBytes: 2_500_000,
		originalName: "a.pdf",
		position: 0,
		...over,
	};
}

function renderMaterials() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<LessonMaterials classId="class-1" date="2026-11-20" />
		</QueryClientProvider>,
	);
}

describe("formatFileSize", () => {
	it("định dạng dễ đọc", () => {
		expect(formatFileSize(null)).toBe("");
		expect(formatFileSize(512)).toBe("512 B");
		expect(formatFileSize(2_500_000)).toBe("2.5 MB");
		expect(formatFileSize(25_000_000)).toBe("25 MB");
	});
});

describe("LessonMaterials", () => {
	it("vẽ từng loại: PDF inline preview, Office chỉ có Tải, link rel an toàn, media có trình phát", async () => {
		const fetchMock = stubFetch(200, {
			items: [
				item({ id: "m1", title: "Đề cương", description: "Đọc trước" }),
				item({
					id: "m1b",
					title: "Bảng điểm",
					mimeType:
						"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
					originalName: "bang-diem.xlsx",
				}),
				item({
					id: "m2",
					title: "Bài đọc",
					kind: "link",
					url: "https://example.com/doc",
					mimeType: null,
					sizeBytes: null,
				}),
				item({
					id: "m3",
					title: "Nghe",
					kind: "media",
					mimeType: "audio/mpeg",
				}),
				item({
					id: "m4",
					title: "Xem",
					kind: "media",
					mimeType: "video/mp4",
				}),
			],
		});
		const { container } = renderMaterials();
		await waitFor(() =>
			expect(screen.getAllByTestId("lesson-material")).toHaveLength(5),
		);
		expect(screen.getByText("Đọc trước")).toBeTruthy();
		expect(screen.getAllByText("2.5 MB").length).toBeGreaterThan(0);

		const [file, office, link, audio] =
			screen.getAllByTestId("lesson-material");
		const download = file?.querySelector("a[href*='download=1']");
		expect(download).toBeTruthy();
		expect(file?.querySelector("a[target='_blank']")).toBeNull();
		// PDF có inline preview + blob fetch.
		expect(
			await within(file as HTMLElement).findByTestId("blob-document-view"),
		).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringMatching(
				/\/api\/student\/classes\/class-1\/sessions\/2026-11-20\/materials\/m1\/file$/,
			),
			expect.objectContaining({
				credentials: "include",
				headers: expect.objectContaining({ Accept: "*/*" }),
			}),
		);
		// Office không có inline preview.
		expect(
			within(office as HTMLElement).queryByTestId("material-preview"),
		).toBeNull();
		expect(office?.querySelector("a[href*='download=1']")).toBeTruthy();

		expect(
			audio?.querySelector("a[target='_blank']")?.getAttribute("rel"),
		).toBe("noopener noreferrer");
		const ext = link?.querySelector("a");
		expect(ext?.getAttribute("href")).toBe("https://example.com/doc");
		expect(ext?.getAttribute("target")).toBe("_blank");
		expect(ext?.getAttribute("rel")).toBe("noopener noreferrer");
		expect(link?.querySelector("a[href*='download=1']")).toBeNull();

		expect(container.querySelectorAll("audio")).toHaveLength(1);
		expect(container.querySelectorAll("video")).toHaveLength(1);
		expect(container.querySelector("audio")?.getAttribute("src")).toContain(
			"/sessions/2026-11-20/materials/m3/file",
		);
	});

	it("tự hồi phục 403 STUDENT_ORG_MISMATCH bằng cách xoá org stale và thử lại 1 lần", async () => {
		localStorage.setItem("active_student_org_id", "org-stale");
		let fileCalls = 0;
		stubFetch(
			200,
			{ items: [item({ id: "m1", title: "Đề org" })] },
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

		renderMaterials();
		const view = await screen.findByTestId("blob-document-view");
		expect(view.getAttribute("data-url")).toBe("blob:student-preview-1");
		expect(fileCalls).toBe(2);
		expect(localStorage.getItem("active_student_org_id")).toBeNull();
	});

	it("bấm «Mở rộng» portal dialog ra document.body, Escape đóng và trả focus, unmount revoke blob", async () => {
		stubFetch(200, {
			items: [item({ id: "m1", title: "Đề cương" })],
		});
		const { container, unmount } = renderMaterials();
		await screen.findByTestId("blob-document-view");

		const expandBtn = screen.getByRole("button", { name: "Mở rộng Đề cương" });
		expandBtn.focus();
		fireEvent.click(expandBtn);

		const dialog = await screen.findByRole("dialog", { name: "Đề cương" });
		// Portal ra document.body để thoát stacking context opacity-60 của ClassLessonList.
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
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:student-preview-1");
	});

	it("từ chối Content-Type lạ (text/html) mà không tạo blob URL", async () => {
		stubFetch(
			200,
			{ items: [item({ id: "m1", title: "Đề giả mạo" })] },
			async () =>
				new Response("<html>bad</html>", {
					status: 200,
					headers: { "Content-Type": "text/html; charset=utf-8" },
				}),
		);
		renderMaterials();
		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain(
			"Định dạng tài liệu không hỗ trợ xem trước.",
		);
		expect(createObjectURL).not.toHaveBeenCalled();
	});

	it("hiện thông báo lỗi tiếng Việt khi tải preview lỗi nhưng vẫn giữ nút Tải", async () => {
		stubFetch(
			200,
			{ items: [item({ id: "m1", title: "Đề lỗi" })] },
			async () =>
				new Response(JSON.stringify({ error: "material not found" }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				}),
		);
		renderMaterials();
		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("Không xem trước được tài liệu này.");
		expect(alert.textContent).toContain("Tài liệu không còn tồn tại");
		expect(screen.getByRole("link", { name: /Tải\s+Đề lỗi/ })).toBeTruthy();
	});

	it("hợp direct + tài liệu từ giáo trình thành một danh sách thường (#655)", async () => {
		stubFetch(200, {
			items: [item({ id: "d1", title: "Đề direct" })],
			curriculumMaterials: [
				item({ id: "c1", title: "Đề từ giáo trình", url: null }),
			],
		});
		renderMaterials();
		await waitFor(() =>
			expect(screen.getAllByTestId("lesson-material")).toHaveLength(2),
		);
		const rows = screen.getAllByTestId("lesson-material");
		expect(rows[0]?.textContent).toContain("Đề direct");
		expect(rows[1]?.textContent).toContain("Đề từ giáo trình");
		expect(rows[1]?.querySelector("a[href*='download=1']")).toBeTruthy();
		expect(
			await within(rows[1] as HTMLElement).findByTestId("blob-document-view"),
		).toBeTruthy();
	});

	it("gắn org đang chọn vào URL file vì thẻ media không gửi được header", () => {
		localStorage.setItem("active_student_org_id", "org-2");
		try {
			expect(lessonMaterialFileUrl("c1", "2026-11-20", "m1", true)).toMatch(
				/\/file\?download=1&org=org-2$/,
			);
			expect(lessonMaterialFileUrl("c1", "2026-11-20", "m1")).toMatch(
				/\/file\?org=org-2$/,
			);
		} finally {
			localStorage.removeItem("active_student_org_id");
		}
		expect(lessonMaterialFileUrl("c1", "2026-11-20", "m1")).toMatch(/\/file$/);
	});

	it("hiện empty khi buổi chưa có tài liệu", async () => {
		stubFetch(200, { items: [] });
		renderMaterials();
		expect(await screen.findByText("Buổi này chưa có tài liệu")).toBeTruthy();
	});

	it("404 không crash và không hiện lỗi, coi như chưa có tài liệu", async () => {
		stubFetch(404, { error: "session not found" });
		renderMaterials();
		expect(await screen.findByText("Buổi này chưa có tài liệu")).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("lỗi khác 404 hiện thông báo lỗi", async () => {
		stubFetch(500, { error: "boom" });
		renderMaterials();
		expect(await screen.findByRole("alert")).toBeTruthy();
	});
});
