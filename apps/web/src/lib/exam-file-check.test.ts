// @vitest-environment jsdom

import { EXAM_IMPORT_LIMITS } from "@teacher-os/api/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getDocumentMock = vi.fn();

// jsdom không chạy Web Worker của pdfjs-dist (trình duyệt thật chạy trong E2E
// AC-004); mock getDocument để kiểm đầy đủ nhánh đếm trang / PasswordException
// / PDF hỏng và đảm bảo task.destroy() luôn được gọi.
vi.mock("pdfjs-dist", () => ({
	GlobalWorkerOptions: { workerSrc: "" },
	getDocument: (...args: unknown[]) => getDocumentMock(...args),
}));

import { checkExamFile } from "./exam-file-check";

describe("checkExamFile (TOS-27 phase-02)", () => {
	beforeEach(() => {
		getDocumentMock.mockReset();
	});

	it("chặn tệp sai định dạng (text/plain) → reason type, không đụng pdfjs", async () => {
		const file = new File(["hello"], "note.txt", { type: "text/plain" });
		const res = await checkExamFile(file);
		expect(res?.reason).toBe("type");
		expect(getDocumentMock).not.toHaveBeenCalled();
	});

	it("chặn tệp vượt 15 MB → reason size kèm dung lượng cụ thể, không đụng pdfjs", async () => {
		const big = new Uint8Array(18 * 1024 * 1024);
		const file = new File([big], "big.pdf", { type: "application/pdf" });
		const res = await checkExamFile(file);
		expect(res).toEqual({
			reason: "size",
			detail: "Tệp 18,0 MB vượt giới hạn 15 MB.",
		});
		expect(getDocumentMock).not.toHaveBeenCalled();
	});

	it("cho qua ảnh PNG/JPEG hợp lệ ≤ 15 MB mà không gọi pdfjs", async () => {
		const file = new File([new Uint8Array(1024)], "page.png", {
			type: "image/png",
		});
		expect(await checkExamFile(file)).toBeNull();
		expect(getDocumentMock).not.toHaveBeenCalled();
	});

	it("cho qua PDF hợp lệ đúng biên 20 trang và gọi task.destroy()", async () => {
		const destroy = vi.fn();
		getDocumentMock.mockReturnValue({
			promise: Promise.resolve({ numPages: EXAM_IMPORT_LIMITS.maxPages }),
			destroy,
		});
		const file = new File([new Uint8Array(32)], "valid.pdf", {
			type: "application/pdf",
		});
		expect(await checkExamFile(file)).toBeNull();
		expect(destroy).toHaveBeenCalledOnce();
	});

	it("chặn PDF 25 trang (> 20 trang) → reason pages kèm số trang", async () => {
		const destroy = vi.fn();
		getDocumentMock.mockReturnValue({
			promise: Promise.resolve({ numPages: EXAM_IMPORT_LIMITS.maxPages + 5 }),
			destroy,
		});
		const file = new File([new Uint8Array(32)], "25pages.pdf", {
			type: "application/pdf",
		});
		const res = await checkExamFile(file);
		expect(res).toEqual({
			reason: "pages",
			detail: "PDF 25 trang vượt giới hạn 20 trang.",
		});
		expect(destroy).toHaveBeenCalledOnce();
	});

	it("chặn PDF có mật khẩu (PasswordException) → reason password", async () => {
		const destroy = vi.fn();
		const pwdErr = new Error("No password given");
		pwdErr.name = "PasswordException";
		getDocumentMock.mockReturnValue({
			promise: Promise.reject(pwdErr),
			destroy,
		});
		const file = new File([new Uint8Array(32)], "protected.pdf", {
			type: "application/pdf",
		});
		const res = await checkExamFile(file);
		expect(res).toEqual({
			reason: "password",
			detail: "Tệp PDF có mật khẩu — hãy bỏ mật khẩu hoặc đổi tệp khác.",
		});
		expect(destroy).toHaveBeenCalledOnce();
	});

	it("PDF hỏng ném lỗi khác → reason type", async () => {
		const destroy = vi.fn();
		getDocumentMock.mockReturnValue({
			promise: Promise.reject(new Error("InvalidPDFException")),
			destroy,
		});
		const file = new File([new Uint8Array(32)], "broken.pdf", {
			type: "application/pdf",
		});
		const res = await checkExamFile(file);
		expect(res).toEqual({
			reason: "type",
			detail: "Tệp PDF hỏng hoặc không đọc được cấu trúc.",
		});
		expect(destroy).toHaveBeenCalledOnce();
	});
});
