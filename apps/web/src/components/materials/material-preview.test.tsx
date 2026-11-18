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
	MaterialPreviewButton,
	materialPreviewMime,
} from "@/components/materials/material-preview";

// pdfjs-dist không chạy trong jsdom — viewer thật được kiểm ở màn import đề.
vi.mock("@/components/document-preview/blob-document-view", () => ({
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
}));

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
	// jsdom không có object URL — gắn spy trực tiếp lên URL toàn cục.
	URL.createObjectURL = createObjectURL;
	URL.revokeObjectURL = revokeObjectURL;
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

describe("MaterialPreviewButton", () => {
	it("renders nothing for a format that cannot be previewed", () => {
		const { container } = render(
			<MaterialPreviewButton
				item={row({
					mimeType:
						"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				})}
			/>,
		);
		expect(container.innerHTML).toBe("");
	});

	it("loads the file as a blob with credentials and shows it in a dialog", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(new Blob(["png"], { type: "image/png" }), {
					status: 200,
				}),
		);
		vi.stubGlobal("fetch", fetchMock);
		render(<MaterialPreviewButton item={row({ mimeType: "image/png" })} />);

		fireEvent.click(
			screen.getByRole("button", { name: "Xem trước Đề Reading" }),
		);
		const dialog = await screen.findByRole("dialog", { name: "Đề Reading" });
		const view = await within(dialog).findByTestId("blob-document-view");
		expect(view.getAttribute("data-url")).toBe("blob:preview-1");
		expect(view.getAttribute("data-mime")).toBe("image/png");
		expect(view.getAttribute("data-label")).toBe("Nội dung Đề Reading");

		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toMatch(/\/api\/materials\/mat-1\/file$/);
		expect(init.credentials).toBe("include");
		expect(
			within(dialog)
				.getByRole("link", { name: "Tải xuống Đề Reading" })
				.getAttribute("href"),
		).toMatch(/\/api\/materials\/mat-1\/file\?download=1$/);

		fireEvent.click(within(dialog).getAllByRole("button", { name: "Đóng" })[0]);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
	});

	it("shows an error with the download link when the file cannot be loaded", async () => {
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
		render(<MaterialPreviewButton item={row()} />);

		fireEvent.click(
			screen.getByRole("button", { name: "Xem trước Đề Reading" }),
		);
		const dialog = await screen.findByRole("dialog", { name: "Đề Reading" });
		const alert = await within(dialog).findByRole("alert");
		expect(alert.textContent).toContain("Không xem trước được tài liệu này.");
		expect(alert.textContent).toContain("Tài liệu không còn tồn tại");
		expect(within(dialog).queryByTestId("blob-document-view")).toBeNull();
		expect(
			within(dialog).getByRole("link", { name: "Tải xuống Đề Reading" }),
		).toBeTruthy();
		expect(createObjectURL).not.toHaveBeenCalled();
	});

	it("revokes a blob that arrives after the dialog was closed mid-load", async () => {
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
		render(<MaterialPreviewButton item={row()} />);

		fireEvent.click(
			screen.getByRole("button", { name: "Xem trước Đề Reading" }),
		);
		const dialog = await screen.findByRole("dialog", { name: "Đề Reading" });
		expect(within(dialog).getByRole("status").textContent).toBe(
			"Đang tải bản xem trước…",
		);
		fireEvent.click(within(dialog).getAllByRole("button", { name: "Đóng" })[0]);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

		resolveFetch(
			new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
				status: 200,
			}),
		);
		await waitFor(() =>
			expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1"),
		);
		expect(screen.queryByTestId("blob-document-view")).toBeNull();
	});
});
