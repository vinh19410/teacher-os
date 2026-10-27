// @vitest-environment jsdom

import {
	EXAM_IMPORT_ERROR_CODES,
	EXAM_IMPORT_ERROR_MESSAGES,
} from "@teacher-os/api/contracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportFailedPanel } from "./import-failed-panel";

describe("ImportFailedPanel (TOS-27 phase-02)", () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it("hiển thị nguyên văn thông điệp E-004, nhãn lý do và nút Thử bóc tách lại AI", () => {
		const onRetry = vi.fn();
		render(<ImportFailedPanel reason="timeout" onRetry={onRetry} />);
		const panel = screen.getByTestId("exam-import-failed-panel");
		expect(panel.getAttribute("role")).toBe("alert");
		expect(panel.textContent).toContain(
			EXAM_IMPORT_ERROR_MESSAGES[EXAM_IMPORT_ERROR_CODES.EXAM_FAILED],
		);
		expect(panel.textContent).toContain("Quá thời gian chờ 120 giây.");
		const btn = screen.getByTestId("exam-import-retry");
		expect(btn.textContent).toBe("Thử bóc tách lại AI");
		fireEvent.click(btn);
		expect(onRetry).toHaveBeenCalledOnce();
	});

	it("khi retrying=true thì khóa nút và đổi nhãn sang trạng thái chờ", () => {
		const onRetry = vi.fn();
		render(<ImportFailedPanel reason="ai_error" retrying onRetry={onRetry} />);
		const btn = screen.getByTestId("exam-import-retry");
		expect(btn.hasAttribute("disabled")).toBe(true);
		expect(btn.textContent).toContain("Đang tạo lượt thử lại");
	});
});
