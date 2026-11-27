// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock(
	"@teacher-os/ui/components/document-preview/blob-document-view",
	() => ({
		BlobDocumentView: (props: { label: string }) => (
			<div data-testid="blob-document-view">{props.label}</div>
		),
	}),
);

import { SliceBookModal } from "@/components/class-detail/slice-book-modal";
import { readBlobBytes } from "@/lib/pdf-slicer";
import {
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
} from "@/test/kernel-harness";

async function createSamplePdf(pageCount: number): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	for (let i = 0; i < pageCount; i += 1) {
		doc.addPage([300, 400]).drawText(`Page ${i + 1}`, { x: 20, y: 350 });
	}
	return doc.save();
}

const createObjectURL = vi.fn(() => "blob:slice-book");
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

describe("SliceBookModal", () => {
	it("loads a local 6-page PDF, validates invalid page range, then slices pages 2..4 into a real 3-page PDF upload", async () => {
		const uploadedCalls: Array<{
			url: URL;
			bytes: Uint8Array;
			fileName: string;
		}> = [];
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
					url.pathname === "/api/classes/cl-1/materials"
				) {
					return new Response(JSON.stringify({ items: [] }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				if (
					method === "PUT" &&
					url.pathname ===
						"/api/classes/cl-1/sessions/2026-11-10/materials/files"
				) {
					const file = init?.body as File;
					const bytes = await readBlobBytes(file);
					const headers = (init?.headers ?? {}) as Record<string, string>;
					uploadedCalls.push({
						url,
						bytes,
						fileName: decodeURIComponent(headers["X-File-Name"] ?? ""),
					});
					return new Response(
						JSON.stringify({
							item: {
								id: "mat-sliced-1",
								title: url.searchParams.get("title") ?? "Sliced",
								category: "lecture",
								sourceTitle: url.searchParams.get("sourceTitle"),
								sourcePageStart: Number(url.searchParams.get("pageStart")),
								sourcePageEnd: Number(url.searchParams.get("pageEnd")),
							},
						}),
						{ status: 201, headers: { "content-type": "application/json" } },
					);
				}
				return kernelFetch(input, init);
			}),
		);

		const onClose = vi.fn();
		const onUploaded = vi.fn();
		renderWithKernel(
			<SliceBookModal
				classId="cl-1"
				sessions={[
					{
						dateISO: "2026-11-10",
						index: 1,
						label: "Buổi 1 · 10/11 — Mở bài",
						defaultTitle: "Buổi 1 — Mở bài",
					},
				]}
				initialDateISO="2026-11-10"
				onClose={onClose}
				onUploaded={onUploaded}
			/>,
		);

		const dialog = await screen.findByRole("dialog", {
			name: "Cắt bài giảng từ sách PDF gốc",
		});

		// Verify shared tab warns teacher about student visibility
		fireEvent.click(
			within(dialog).getByRole("tab", { name: "Tài liệu chung của lớp" }),
		);
		expect(within(dialog).getByRole("note").textContent).toMatch(
			/Học viên trong lớp đang xem được toàn bộ file/,
		);

		// Switch back to local file tab and select a real 6-page PDF
		fireEvent.click(
			within(dialog).getByRole("tab", { name: "File PDF từ máy tính" }),
		);
		const pdfBytes = await createSamplePdf(6);
		const localFile = new File([new Uint8Array(pdfBytes)], "Cambridge-18.pdf", {
			type: "application/pdf",
		});
		const fileInput = within(dialog).getByLabelText(
			"Chọn file sách PDF từ máy tính",
		);
		fireEvent.change(fileInput, { target: { files: [localFile] } });

		const loadedBanner = await within(dialog).findByTestId("slice-book-loaded");
		expect(loadedBanner.textContent).toContain("Cambridge-18.pdf");
		expect(loadedBanner.textContent).toContain("6 trang");

		const startInput = within(dialog).getByLabelText("Từ trang");
		const endInput = within(dialog).getByLabelText("Đến trang");
		const submitBtn = within(dialog).getByRole("button", {
			name: "Cắt & gắn bài giảng",
		});

		// Invalid inverted range 5..2
		fireEvent.change(startInput, { target: { value: "5" } });
		fireEvent.change(endInput, { target: { value: "2" } });
		fireEvent.click(submitBtn);

		expect(
			await within(dialog).findByText(
				/Trang bắt đầu phải nhỏ hơn hoặc bằng trang kết thúc/,
			),
		).toBeTruthy();
		expect(uploadedCalls).toHaveLength(0);

		// Valid range 2..4 -> uploads real 3-page PDF
		fireEvent.change(startInput, { target: { value: "2" } });
		fireEvent.change(endInput, { target: { value: "4" } });
		fireEvent.click(submitBtn);

		await waitFor(() => expect(uploadedCalls).toHaveLength(1));
		expect(onUploaded).toHaveBeenCalledTimes(1);
		expect(onClose).toHaveBeenCalledTimes(1);

		const call = uploadedCalls[0];
		expect(call).toBeDefined();
		if (!call) return;
		expect(call.url.searchParams.get("sourceTitle")).toBe("Cambridge-18.pdf");
		expect(call.url.searchParams.get("pageStart")).toBe("2");
		expect(call.url.searchParams.get("pageEnd")).toBe("4");
		expect(call.fileName.endsWith("-tr-2-4.pdf")).toBe(true);

		const slicedDoc = await PDFDocument.load(call.bytes);
		expect(slicedDoc.getPageCount()).toBe(3);
	});
});
