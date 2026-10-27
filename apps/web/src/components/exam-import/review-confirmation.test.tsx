// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExamImportActions } from "./exam-import-actions";
import { ReviewConfirmation } from "./review-confirmation";

afterEach(cleanup);

function GateHarness({
	reviewCount,
	onSaveDraft = vi.fn(),
	onPublish = vi.fn(),
}: {
	reviewCount: number;
	onSaveDraft?: () => void;
	onPublish?: () => void;
}) {
	const [confirmed, setConfirmed] = useState(false);
	return (
		<div>
			<ReviewConfirmation
				reviewCount={reviewCount}
				confirmed={confirmed}
				onConfirmedChange={setConfirmed}
			/>
			<ExamImportActions
				reviewCount={reviewCount}
				confirmed={confirmed}
				onSaveDraft={onSaveDraft}
				onPublish={onPublish}
			/>
		</div>
	);
}

describe("ReviewConfirmation & ExamImportActions (TOS-26 #472)", () => {
	it("reviewCount = 0 → không render hộp kiểm xác nhận, nút 'Lưu vào Ngân hàng đề' mở sẵn", () => {
		const onPublish = vi.fn();
		render(<GateHarness reviewCount={0} onPublish={onPublish} />);

		expect(screen.queryByTestId("review-confirmation")).toBeNull();
		expect(screen.queryByTestId("review-confirmation-checkbox")).toBeNull();

		const saveDraftBtn = screen.getByTestId(
			"save-draft-button",
		) as HTMLButtonElement;
		const publishBtn = screen.getByTestId(
			"publish-exam-button",
		) as HTMLButtonElement;
		expect(saveDraftBtn.disabled).toBe(false);
		expect(publishBtn.disabled).toBe(false);

		fireEvent.click(publishBtn);
		expect(onPublish).toHaveBeenCalledTimes(1);
	});

	it("reviewCount > 0 → hiện hộp kiểm, khóa 'Lưu vào Ngân hàng đề' (nhưng 'Lưu bản nháp' vẫn bật) tới khi tích xác nhận", () => {
		const onSaveDraft = vi.fn();
		const onPublish = vi.fn();
		render(
			<GateHarness
				reviewCount={2}
				onSaveDraft={onSaveDraft}
				onPublish={onPublish}
			/>,
		);

		const checkbox = screen.getByTestId(
			"review-confirmation-checkbox",
		) as HTMLInputElement;
		const saveDraftBtn = screen.getByTestId(
			"save-draft-button",
		) as HTMLButtonElement;
		const publishBtn = screen.getByTestId(
			"publish-exam-button",
		) as HTMLButtonElement;

		expect(checkbox.checked).toBe(false);
		expect(
			screen.getByText(
				/Tôi đã kiểm tra và xác nhận các câu gắn nhãn Cần rà soát lại/,
			),
		).toBeTruthy();

		// Chưa tích: Lưu bản nháp bật, Lưu vào Ngân hàng đề bị disabled kèm lý do.
		expect(saveDraftBtn.disabled).toBe(false);
		expect(publishBtn.disabled).toBe(true);
		expect(publishBtn.getAttribute("aria-describedby")).toBeTruthy();
		expect(screen.getByTestId("publish-disabled-reason").textContent).toContain(
			"Cần tích xác nhận 2 câu",
		);

		fireEvent.click(saveDraftBtn);
		expect(onSaveDraft).toHaveBeenCalledTimes(1);

		// Tích hộp kiểm → nút Lưu vào Ngân hàng đề được mở khóa.
		fireEvent.click(checkbox);
		expect(checkbox.checked).toBe(true);
		expect(publishBtn.disabled).toBe(false);
		expect(screen.queryByTestId("publish-disabled-reason")).toBeNull();

		fireEvent.click(publishBtn);
		expect(onPublish).toHaveBeenCalledTimes(1);
	});
});
