// @vitest-environment jsdom

import {
	EXAM_IMPORT_ERROR_CODES,
	EXAM_IMPORT_ERROR_MESSAGES,
} from "@teacher-os/api/contracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	useNavigate: () => navigateMock,
}));

import { InsufficientCreditsDialog } from "./insufficient-credits-dialog";

describe("InsufficientCreditsDialog (TOS-27 D5)", () => {
	beforeEach(() => {
		navigateMock.mockReset();
	});

	afterEach(() => {
		document.body.replaceChildren();
	});

	it("open=false không render nội dung hộp thoại", () => {
		render(<InsufficientCreditsDialog open={false} onClose={() => {}} />);
		expect(screen.queryByTestId("exam-import-insufficient-credits")).toBeNull();
	});

	it("open=true hiển thị nguyên văn E-001, nút Đóng và nút Soạn đề thủ công", () => {
		const onClose = vi.fn();
		render(<InsufficientCreditsDialog open onClose={onClose} />);
		const msg = screen.getByTestId("exam-import-insufficient-credits");
		expect(msg.textContent).toBe(
			EXAM_IMPORT_ERROR_MESSAGES[EXAM_IMPORT_ERROR_CODES.INSUFFICIENT_CREDITS],
		);
		fireEvent.click(screen.getByTestId("exam-import-manual"));
		expect(navigateMock).toHaveBeenCalledWith({
			to: "/assignments/tests/new",
		});
		fireEvent.click(screen.getByTestId("exam-import-insufficient-close"));
		expect(onClose).toHaveBeenCalledOnce();
	});
});
