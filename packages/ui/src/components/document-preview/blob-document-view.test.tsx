import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDocumentMock = vi.hoisted(() => vi.fn());

vi.mock("pdfjs-dist", () => ({
	GlobalWorkerOptions: { workerSrc: "" },
	getDocument: getDocumentMock,
}));

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
	default: "blob:worker",
}));

import { BlobDocumentThumbnail } from "./blob-document-view";

afterEach(() => {
	cleanup();
	getDocumentMock.mockReset();
});

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("BlobDocumentThumbnail", () => {
	it("renders PDF page 1 scaled to cover the thumbnail and cleans up pdfjs tasks on unmount", async () => {
		const renderCancel = vi.fn();
		const docDestroy = vi.fn();
		const pageRender = vi.fn(() => ({
			cancel: renderCancel,
			promise: Promise.resolve(),
		}));
		const getPage = vi.fn(async () => ({
			getViewport: ({ scale }: { scale: number }) => ({
				width: 595 * scale,
				height: 842 * scale,
			}),
			render: pageRender,
		}));
		getDocumentMock.mockReturnValue({
			promise: Promise.resolve({ numPages: 2, getPage }),
			destroy: docDestroy,
		});

		const getContextSpy = vi
			.spyOn(HTMLCanvasElement.prototype, "getContext")
			.mockReturnValue({} as CanvasRenderingContext2D);

		const { container, unmount } = render(
			<BlobDocumentThumbnail
				blobUrl="blob:pdf-1"
				mimeType="application/pdf"
				label="Nội dung Đề 1"
			/>,
		);

		await waitFor(() => expect(getPage).toHaveBeenCalledWith(1));
		await waitFor(() => expect(pageRender).toHaveBeenCalledTimes(1));

		const canvas = container.querySelector("canvas");
		expect(canvas?.getAttribute("aria-label")).toBe("Nội dung Đề 1");
		expect(canvas?.style.width).toBe("96px");
		expect(getContextSpy).toHaveBeenCalledWith("2d");

		unmount();
		expect(renderCancel).toHaveBeenCalledTimes(1);
		expect(docDestroy).toHaveBeenCalledTimes(1);
	});

	it("renders PDF error fallback when pdfjs fails to open the document", async () => {
		getDocumentMock.mockReturnValue({
			promise: Promise.reject(new Error("Invalid PDF")),
			destroy: vi.fn(),
		});

		render(
			<BlobDocumentThumbnail
				blobUrl="blob:bad-pdf"
				mimeType="application/pdf"
				label="Nội dung Hỏng"
			/>,
		);

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toBe("Lỗi PDF");
	});

	it("renders cover image and shows image error fallback when loading fails", () => {
		render(
			<BlobDocumentThumbnail
				blobUrl="blob:img-1"
				mimeType="image/png"
				label="Nội dung Sơ đồ"
			/>,
		);

		const img = screen.getByRole("img", { name: "Nội dung Sơ đồ" });
		expect(img.getAttribute("src")).toBe("blob:img-1");
		expect(img.className).toContain("object-cover");

		fireEvent.error(img);
		expect(screen.getByRole("alert").textContent).toBe("Lỗi ảnh");
	});
});
