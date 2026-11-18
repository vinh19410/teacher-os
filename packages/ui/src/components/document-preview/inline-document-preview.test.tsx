import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	INLINE_AUTO_PREVIEW_MAX_BYTES,
	InlineDocumentPreview,
	isPreviewableContentType,
	isPreviewableDocumentMime,
} from "./inline-document-preview";

vi.mock("./blob-document-view", () => ({
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
}));

const revokeObjectURL = vi.fn();

beforeEach(() => {
	URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	revokeObjectURL.mockClear();
});

describe("isPreviewableDocumentMime", () => {
	it.each([
		["application/pdf", "application/pdf"],
		["image/png", "image/png"],
		["image/jpeg", "image/jpeg"],
		["image/webp", "image/webp"],
	])("accepts file %s", (mimeType, expected) => {
		expect(isPreviewableDocumentMime("file", mimeType)).toBe(expected);
	});

	it.each([
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"text/html",
	])("rejects %s", (mimeType) => {
		expect(isPreviewableDocumentMime("file", mimeType)).toBeNull();
	});

	it("rejects non-file kinds and missing MIME", () => {
		expect(isPreviewableDocumentMime("link", "application/pdf")).toBeNull();
		expect(isPreviewableDocumentMime("media", "video/mp4")).toBeNull();
		expect(isPreviewableDocumentMime("file", null)).toBeNull();
	});
});

describe("isPreviewableContentType", () => {
	it("accepts allowlisted MIME types with optional parameters", () => {
		expect(isPreviewableContentType("application/pdf")).toBe(true);
		expect(isPreviewableContentType("APPLICATION/PDF; charset=utf-8")).toBe(
			true,
		);
		expect(isPreviewableContentType("image/png")).toBe(true);
		expect(isPreviewableContentType("image/jpeg")).toBe(true);
		expect(isPreviewableContentType("image/webp")).toBe(true);
	});

	it("rejects html, octet-stream, and missing content-type", () => {
		expect(isPreviewableContentType("text/html; charset=utf-8")).toBe(false);
		expect(isPreviewableContentType("application/octet-stream")).toBe(false);
		expect(isPreviewableContentType(null)).toBe(false);
		expect(isPreviewableContentType("")).toBe(false);
	});
});

describe("InlineDocumentPreview", () => {
	it("waits for IntersectionObserver before loading, disconnects on intersect, and keeps min-h placeholder", async () => {
		let observerCb: IntersectionObserverCallback | null = null;
		const disconnect = vi.fn();
		const observe = vi.fn();
		class MockIntersectionObserver {
			root = null;
			rootMargin = "";
			thresholds: number[] = [];
			constructor(cb: IntersectionObserverCallback) {
				observerCb = cb;
			}
			observe = observe;
			disconnect = disconnect;
			unobserve = vi.fn();
			takeRecords = () => [];
		}
		vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

		const loadBlobUrl = vi.fn(async () => "blob:inline-1");
		const { container } = render(
			<InlineDocumentPreview
				requestKey="doc-1"
				title="Đề Reading"
				mimeType="application/pdf"
				loadBlobUrl={loadBlobUrl}
				formatError={() => "Lỗi"}
			/>,
		);

		expect(observe).toHaveBeenCalledTimes(1);
		expect(loadBlobUrl).not.toHaveBeenCalled();
		expect(container.innerHTML).toContain("min-h-48");

		act(() => {
			observerCb?.(
				[{ isIntersecting: true } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			);
		});

		const view = await screen.findByTestId("blob-document-view");
		expect(view.getAttribute("data-url")).toBe("blob:inline-1");
		expect(view.getAttribute("data-viewport-class")).toContain("max-h-80");
		expect(disconnect).toHaveBeenCalled();
	});

	it("requires click-to-load inline for files larger than 10 MiB", async () => {
		const loadBlobUrl = vi.fn(async () => "blob:large-1");
		render(
			<InlineDocumentPreview
				requestKey="doc-large"
				title="Sách giáo trình"
				mimeType="application/pdf"
				sizeBytes={INLINE_AUTO_PREVIEW_MAX_BYTES + 1}
				loadBlobUrl={loadBlobUrl}
				formatError={() => "Lỗi"}
			/>,
		);

		expect(loadBlobUrl).not.toHaveBeenCalled();
		const btn = screen.getByRole("button", { name: "Tải bản xem trước" });
		fireEvent.click(btn);

		const view = await screen.findByTestId("blob-document-view");
		expect(view.getAttribute("data-url")).toBe("blob:large-1");
		expect(loadBlobUrl).toHaveBeenCalledTimes(1);
	});

	it("does not re-fetch or revoke blobUrl when parent re-renders or expand modal opens", async () => {
		let callCount = 0;
		const renderInline = (labelSuffix: string) => (
			<InlineDocumentPreview
				requestKey="doc-stable"
				title="Handout"
				mimeType="image/png"
				loadBlobUrl={async () => {
					callCount += 1;
					return `blob:stable-${callCount}-${labelSuffix}`;
				}}
				formatError={() => "Lỗi"}
				renderExpandedModal={({ blobUrl, onClose }) => (
					<div role="dialog" aria-label="Handout" data-url={blobUrl}>
						<button type="button" onClick={onClose}>
							Đóng
						</button>
					</div>
				)}
			/>
		);

		const { rerender, unmount } = render(renderInline("a"));
		const view = await screen.findByTestId("blob-document-view");
		expect(view.getAttribute("data-url")).toBe("blob:stable-1-a");

		// Re-render với closure loadBlobUrl mới nhưng cùng requestKey: không abort/fetch lại.
		rerender(renderInline("b"));
		expect(callCount).toBe(1);
		expect(revokeObjectURL).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "Mở rộng Handout" }));
		const dialog = screen.getByRole("dialog", { name: "Handout" });
		expect(dialog.getAttribute("data-url")).toBe("blob:stable-1-a");
		expect(callCount).toBe(1);

		fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(revokeObjectURL).not.toHaveBeenCalled();

		unmount();
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:stable-1-a");
	});

	it("revokes late-arriving blob if unmounted mid-flight", async () => {
		let resolveLoad: (url: string) => void = () => {};
		const loadBlobUrl = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					resolveLoad = resolve;
				}),
		);
		const { unmount } = render(
			<InlineDocumentPreview
				requestKey="doc-abort"
				title="Đề"
				mimeType="application/pdf"
				loadBlobUrl={loadBlobUrl}
				formatError={() => "Lỗi"}
			/>,
		);

		expect(screen.getByRole("status").textContent).toBe(
			"Đang tải bản xem trước…",
		);
		await waitFor(() => expect(loadBlobUrl).toHaveBeenCalledTimes(1));
		unmount();

		resolveLoad("blob:late-1");
		await waitFor(() =>
			expect(revokeObjectURL).toHaveBeenCalledWith("blob:late-1"),
		);
	});

	it("renders alert on load error", async () => {
		render(
			<InlineDocumentPreview
				requestKey="doc-err"
				title="Đề lỗi"
				mimeType="application/pdf"
				loadBlobUrl={async () => {
					throw new Error("boom");
				}}
				formatError={() => "Tài liệu không còn tồn tại."}
			/>,
		);

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("Không xem trước được tài liệu này.");
		expect(alert.textContent).toContain("Tài liệu không còn tồn tại.");
	});

	it("limits concurrent preview loads to 3 slots and resets/closes modal when requestKey changes", async () => {
		const resolvers: Array<(url: string) => void> = [];
		const loadBlobUrl = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					resolvers.push(resolve);
				}),
		);

		const { rerender } = render(
			<>
				{["k1", "k2", "k3", "k4"].map((k) => (
					<InlineDocumentPreview
						key={k}
						requestKey={k}
						title={`Doc ${k}`}
						mimeType="application/pdf"
						loadBlobUrl={loadBlobUrl}
						formatError={() => "Lỗi"}
						renderExpandedModal={({ blobUrl, onClose }) => (
							<div role="dialog" aria-label={`Doc ${k}`} data-url={blobUrl}>
								<button type="button" onClick={onClose}>
									Đóng
								</button>
							</div>
						)}
					/>
				))}
			</>,
		);

		await waitFor(() => expect(loadBlobUrl).toHaveBeenCalledTimes(3));
		resolvers[0]?.("blob:k1");
		await waitFor(() => expect(loadBlobUrl).toHaveBeenCalledTimes(4));
		resolvers[1]?.("blob:k2");
		resolvers[2]?.("blob:k3");
		resolvers[3]?.("blob:k4");

		await screen.findByRole("button", { name: "Mở rộng Doc k1" });
		fireEvent.click(screen.getByRole("button", { name: "Mở rộng Doc k1" }));
		expect(screen.getByRole("dialog", { name: "Doc k1" })).toBeTruthy();

		// Đổi requestKey của item đầu khi modal đang mở → đóng modal và revoke blob cũ.
		rerender(
			<InlineDocumentPreview
				requestKey="k1-next"
				title="Doc k1"
				mimeType="application/pdf"
				loadBlobUrl={async () => "blob:k1-next"}
				formatError={() => "Lỗi"}
				renderExpandedModal={({ blobUrl, onClose }) => (
					<div role="dialog" aria-label="Doc k1" data-url={blobUrl}>
						<button type="button" onClick={onClose}>
							Đóng
						</button>
					</div>
				)}
			/>,
		);

		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:k1");
	});
});
