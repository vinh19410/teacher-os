import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildExamPdf } from "./make-pdf";
import { inspectExamFile } from "./validate-file";

describe("inspectExamFile (TOS-27 D1)", () => {
	test("ảnh PNG/JPEG tính 1 trang — không parse", async () => {
		await expect(
			inspectExamFile(new ArrayBuffer(8), "image/png"),
		).resolves.toEqual({ ok: true, pageCount: 1 });
		await expect(
			inspectExamFile(new ArrayBuffer(8), "image/jpeg"),
		).resolves.toEqual({ ok: true, pageCount: 1 });
	});

	test("PDF hợp lệ 1 trang → ok pageCount 1 và KHÔNG detach ArrayBuffer gốc", async () => {
		const buf = buildExamPdf(1);
		const originalLen = buf.byteLength;
		expect(originalLen).toBeGreaterThan(0);
		await expect(inspectExamFile(buf, "application/pdf")).resolves.toEqual({
			ok: true,
			pageCount: 1,
		});
		expect(buf.byteLength).toBe(originalLen);
	});

	test("PDF 25 trang vượt 20 → reason pages", async () => {
		await expect(
			inspectExamFile(buildExamPdf(25), "application/pdf"),
		).resolves.toEqual({ ok: false, reason: "pages" });
	});

	test("PDF đúng 20 trang (biên) → ok", async () => {
		await expect(
			inspectExamFile(buildExamPdf(20), "application/pdf"),
		).resolves.toEqual({ ok: true, pageCount: 20 });
	});

	test("PDF có mật khẩu (fixture mã hoá thật) → reason password", async () => {
		const bytes = readFileSync(
			new URL(
				"../../../../e2e/fixtures/exam-import/protected.pdf",
				import.meta.url,
			).pathname,
		);
		await expect(
			inspectExamFile(
				bytes.buffer.slice(
					bytes.byteOffset,
					bytes.byteOffset + bytes.byteLength,
				),
				"application/pdf",
			),
		).resolves.toEqual({ ok: false, reason: "password" });
	});

	test("bytes rác không parse được → reason type", async () => {
		await expect(
			inspectExamFile(new Uint8Array(64).fill(0x25).buffer, "application/pdf"),
		).resolves.toEqual({ ok: false, reason: "type" });
	});
});
