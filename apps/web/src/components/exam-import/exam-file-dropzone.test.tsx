// @vitest-environment jsdom

import {
	EXAM_IMPORT_ERROR_CODES,
	EXAM_IMPORT_ERROR_MESSAGES,
} from "@teacher-os/api/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkExamFileMock = vi.fn();

vi.mock("@/lib/exam-file-check", () => ({
	checkExamFile: (...args: unknown[]) => checkExamFileMock(...args),
}));

import { ExamFileDropzone } from "./exam-file-dropzone";

describe("ExamFileDropzone (TOS-27 phase-02)", () => {
	beforeEach(() => {
		checkExamFileMock.mockReset();
	});

	afterEach(() => {
		document.body.replaceChildren();
	});

	it("tệp hợp lệ (checkExamFile → null) gọi onFile và không hiện alert", async () => {
		checkExamFileMock.mockResolvedValue(null);
		const onFile = vi.fn();
		render(<ExamFileDropzone disabled={false} onFile={onFile} />);
		const input = screen.getByTestId("exam-import-file-input");
		const file = new File(["ok"], "de.pdf", { type: "application/pdf" });
		fireEvent.change(input, { target: { files: [file] } });
		await waitFor(() => expect(onFile).toHaveBeenCalledWith(file));
		expect(screen.queryByTestId("exam-import-file-error")).toBeNull();
	});

	it("tệp lỗi (size/pages/password/type) hiện role=alert E-003 kèm lý do cụ thể và KHÔNG gọi onFile", async () => {
		checkExamFileMock.mockResolvedValue({
			reason: "pages",
			detail: "PDF 25 trang vượt giới hạn 20 trang.",
		});
		const onFile = vi.fn();
		render(<ExamFileDropzone disabled={false} onFile={onFile} />);
		const input = screen.getByTestId("exam-import-file-input");
		const file = new File(["bad"], "25trang.pdf", { type: "application/pdf" });
		fireEvent.change(input, { target: { files: [file] } });
		const alert = await screen.findByTestId("exam-import-file-error");
		expect(alert.getAttribute("role")).toBe("alert");
		expect(alert.textContent).toContain(
			EXAM_IMPORT_ERROR_MESSAGES[EXAM_IMPORT_ERROR_CODES.INVALID_FILE],
		);
		expect(alert.textContent).toContain("PDF 25 trang vượt giới hạn 20 trang.");
		expect(onFile).not.toHaveBeenCalled();
	});
});
