import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
	buildSlicedPdfFile,
	inspectPdfDocument,
	PDF_SLICE_MAX_FILENAME_CHARS,
	PDF_SOURCE_MAX_BYTES,
	PdfSliceError,
	sanitizeSourceTitle,
	slicePdfPages,
	validatePageRange,
} from "./pdf-slicer";

async function makeMultiPagePdf(pageCount: number): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	for (let i = 0; i < pageCount; i += 1) {
		const page = doc.addPage([300 + i * 10, 400]);
		page.drawText(`Page ${i + 1}`, { x: 24, y: 350, size: 16 });
	}
	return doc.save();
}

describe("validatePageRange", () => {
	it("accepts valid 1-based inclusive ranges", () => {
		expect(validatePageRange(1, 1, 6)).toEqual({ ok: true });
		expect(validatePageRange(2, 5, 6)).toEqual({ ok: true });
		expect(validatePageRange(1, 6, 6)).toEqual({ ok: true });
	});

	it("rejects out-of-bounds, inverted, zero, negative, and non-integer ranges", () => {
		expect(validatePageRange(0, 2, 6).ok).toBe(false);
		expect(validatePageRange(5, 3, 6).ok).toBe(false);
		expect(validatePageRange(1, 7, 6).ok).toBe(false);
		expect(validatePageRange(1.5, 3, 6).ok).toBe(false);
		expect(validatePageRange(1, Number.NaN, 6).ok).toBe(false);
		expect(validatePageRange(1, 1, 0).ok).toBe(false);
	});
});

describe("inspectPdfDocument & slicePdfPages", () => {
	it("inspects a real 6-page PDF and slices pages 2..4 into an independent 3-page PDF", async () => {
		const sourceBytes = await makeMultiPagePdf(6);
		const loaded = await inspectPdfDocument(sourceBytes);
		expect(loaded.pageCount).toBe(6);

		const slicedBytes = await slicePdfPages(loaded, 2, 4);
		expect(new TextDecoder().decode(slicedBytes.slice(0, 5))).toBe("%PDF-");

		const reloaded = await PDFDocument.load(slicedBytes);
		expect(reloaded.getPageCount()).toBe(3);
		// Verify exact pages 2, 3, 4 were copied by checking distinct page widths
		expect(reloaded.getPage(0).getWidth()).toBe(310);
		expect(reloaded.getPage(1).getWidth()).toBe(320);
		expect(reloaded.getPage(2).getWidth()).toBe(330);
	});

	it("rejects non-PDF bytes with INVALID_PDF", async () => {
		const notPdf = new TextEncoder().encode("<html>not a pdf</html>");
		await expect(inspectPdfDocument(notPdf)).rejects.toMatchObject({
			name: "PdfSliceError",
			code: "INVALID_PDF",
		});
		await expect(inspectPdfDocument(new Uint8Array())).rejects.toMatchObject({
			code: "INVALID_PDF",
		});
	});

	it("rejects encrypted PDF markers with ENCRYPTED_PDF", async () => {
		// Save without object streams so a classic trailer dictionary exists, then inject /Encrypt
		const doc = await PDFDocument.create();
		doc.addPage([300, 400]);
		const validBytes = await doc.save({ useObjectStreams: false });
		const text = new TextDecoder("latin1").decode(validBytes);
		const withEncrypt = text.replace(
			/trailer\s*<</,
			"trailer\n<< /Encrypt << /Filter /Standard /V 1 /R 2 >> ",
		);
		const encryptedBytes = new Uint8Array(
			Array.from(withEncrypt, (c) => c.charCodeAt(0)),
		);
		const err = await inspectPdfDocument(encryptedBytes).catch(
			(e: unknown) => e,
		);
		expect(err).toBeInstanceOf(PdfSliceError);
		expect((err as PdfSliceError).code).toBe("ENCRYPTED_PDF");
	});

	it("rejects oversized source buffers with SOURCE_TOO_LARGE", async () => {
		const fakeHuge = new Uint8Array(10);
		Object.defineProperty(fakeHuge, "byteLength", {
			value: PDF_SOURCE_MAX_BYTES + 1,
		});
		await expect(inspectPdfDocument(fakeHuge)).rejects.toMatchObject({
			code: "SOURCE_TOO_LARGE",
		});
	});

	it("rejects output exceeding maxOutputBytes with SLICE_TOO_LARGE", async () => {
		const loaded = await inspectPdfDocument(await makeMultiPagePdf(4));
		await expect(slicePdfPages(loaded, 1, 4, 100)).rejects.toMatchObject({
			code: "SLICE_TOO_LARGE",
			maxBytes: 100,
		});
	});
});

describe("buildSlicedPdfFile", () => {
	it("preserves .pdf suffix and truncates filenames over 200 characters", () => {
		const longTitle = "Bài giảng chuyên sâu ".repeat(20);
		const file = buildSlicedPdfFile(
			new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
			longTitle,
			3,
			12,
		);
		expect(file.type).toBe("application/pdf");
		expect(file.name.endsWith("-tr-3-12.pdf")).toBe(true);
		expect(file.name.length).toBeLessThanOrEqual(PDF_SLICE_MAX_FILENAME_CHARS);
	});

	it("strips path separators and control/bidi characters", () => {
		const file = buildSlicedPdfFile(
			new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
			"../Sách:\u202e\u200b\ufeff Bài 1.pdf",
			5,
			5,
		);
		expect(file.name).toBe("Sách Bài 1-tr-5.pdf");
	});
});

describe("sanitizeSourceTitle", () => {
	it("strips control/format/bidi characters and caps at 200 chars", () => {
		const dirty = `\u200eCambridge\u00ad IELTS\u200b 18 — ${"A".repeat(250)}`;
		const clean = sanitizeSourceTitle(dirty);
		expect(clean.length).toBeLessThanOrEqual(200);
		expect(clean.startsWith("Cambridge IELTS 18")).toBe(true);
		expect(/[\p{Cc}\p{Cf}]/u.test(clean)).toBe(false);
	});
});
