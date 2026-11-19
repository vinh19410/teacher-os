// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MaterialRowItem } from "@/components/materials/material-item";
import {
	MaterialInlinePreview,
	materialPreviewMime,
} from "@/components/materials/material-preview";

const reauthMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/reauth", () => ({ reauth: reauthMock }));

// pdfjs-dist không chạy trong jsdom — viewer thật được kiểm ở màn import đề và E2E.
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

function row(overrides: Partial<MaterialRowItem> = {}): MaterialRowItem {
	return {
		id: "mat-1",
		title: "Đề Reading",
		description: "",
		kind: "file",
		url: null,
		mimeType: "application/pdf",
		sizeBytes: 1024,
		originalName: "de.pdf",
		...overrides,
	};
}

const createObjectURL = vi.fn(() => "blob:preview-1");
const revokeObjectURL = vi.fn();

beforeEach(() => {
	URL.createObjectURL = createObjectURL;
	URL.revokeObjectURL = revokeObjectURL;
	reauthMock.mockReset();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	createObjectURL.mockClear();
	revokeObjectURL.mockClear();
});

describe("materialPreviewMime", () => {
	it.each([
		["application/pdf", "application/pdf"],
		["image/png", "image/png"],
		["image/jpeg", "image/jpeg"],
		["image/webp", "image/webp"],
	])("previews file %s", (mimeType, expected) => {
		expect(materialPreviewMime(row({ mimeType }))).toBe(expected);
	});

	it.each([
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"text/html",
	])("does not preview %s", (mimeType) => {
		expect(materialPreviewMime(row({ mimeType }))).toBeNull();
	});

	it("does not preview links, media or rows without a MIME type", () => {
		expect(
			materialPreviewMime(
				row({ kind: "link", url: "https://example.com", mimeType: null }),
			),
		).toBeNull();
		expect(
			materialPreviewMime(row({ kind: "media", mimeType: "video/mp4" })),
		).toBeNull();
		expect(materialPreviewMime(row({ mimeType: null }))).toBeNull();
	});
});

describe("MaterialInlinePreview", () => {
	it("renders nothing for a format that cannot be previewed", () => {
		const { container } = render(
			<MaterialInlinePreview
				item={row({
					mimeType:
						"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				})}
			/>,
		);
		expect(container.innerHTML).toBe("");
	});

	it("loads the file inline as a blob with credentials and reuses it in the expand modal without re-fetching", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(new Blob(["png"], { type: "image/png" }), {
					status: 200,
					headers: { "content-type": "image/png" },
				}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const { unmount } = render(
			<MaterialInlinePreview item={row({ mimeType: "image/png" })} />,
		);

		const inlineThumb = await screen.findByTestId("blob-document-thumbnail");
		expect(inlineThumb.getAttribute("data-url")).toBe("blob:preview-1");
		expect(inlineThumb.getAttribute("data-mime")).toBe("image/png");
		expect(inlineThumb.getAttribute("data-label")).toBe("Nội dung Đề Reading");
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toMatch(/\/api\/materials\/mat-1\/file$/);
		expect(init.credentials).toBe("include");

		// Mở rộng sang modal: dùng lại cùng blob URL, không fetch lại và không revoke khi đóng modal.
		fireEvent.click(
			screen.getByRole("button", { name: "Xem trước Đề Reading" }),
		);
		const dialog = await screen.findByRole("dialog", { name: "Đề Reading" });
		const modalView = await within(dialog).findByTestId("blob-document-view");
		expect(modalView.getAttribute("data-url")).toBe("blob:preview-1");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(
			within(dialog)
				.getByRole("link", { name: "Tải xuống Đề Reading" })
				.getAttribute("href"),
		).toMatch(/\/api\/materials\/mat-1\/file\?download=1$/);

		fireEvent.click(within(dialog).getAllByRole("button", { name: "Đóng" })[0]);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(revokeObjectURL).not.toHaveBeenCalled();

		unmount();
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
	});

	it("rejects unexpected Content-Type responses such as text/html without creating a blob URL", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response("<html>bad</html>", {
						status: 200,
						headers: { "content-type": "text/html; charset=utf-8" },
					}),
			),
		);
		render(<MaterialInlinePreview item={row()} />);

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("Không xem trước được tài liệu này.");
		expect(alert.textContent).toContain(
			"Định dạng tài liệu không hỗ trợ xem trước.",
		);
		expect(createObjectURL).not.toHaveBeenCalled();
	});

	it("shows an error alert when the file cannot be loaded and triggers reauth on 401", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(JSON.stringify({ code: "MATERIAL_NOT_FOUND" }), {
						status: 404,
						headers: { "content-type": "application/json" },
					}),
			),
		);
		const { unmount } = render(<MaterialInlinePreview item={row()} />);

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("Không xem trước được tài liệu này.");
		expect(alert.textContent).toContain("Tài liệu không còn tồn tại");
		expect(screen.queryByTestId("blob-document-view")).toBeNull();
		expect(createObjectURL).not.toHaveBeenCalled();
		unmount();

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("Unauthorized", { status: 401 })),
		);
		render(<MaterialInlinePreview item={row({ id: "mat-401" })} />);
		await waitFor(() => expect(reauthMock).toHaveBeenCalledTimes(1));
	});

	it("revokes a blob that arrives after unmount mid-load", async () => {
		let resolveFetch: (res: Response) => void = () => {};
		vi.stubGlobal(
			"fetch",
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						resolveFetch = resolve;
					}),
			),
		);
		const { unmount } = render(<MaterialInlinePreview item={row()} />);

		expect(screen.getByRole("status").textContent).toBe(
			"Đang tải bản xem trước…",
		);
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		unmount();

		resolveFetch(
			new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
				status: 200,
				headers: { "content-type": "application/pdf" },
			}),
		);
		await waitFor(() =>
			expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1"),
		);
		expect(screen.queryByTestId("blob-document-view")).toBeNull();
	});
});
