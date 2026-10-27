// @vitest-environment jsdom

import type { ExtractedExamDraft } from "@teacher-os/api/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtractedExamPanel } from "./extracted-exam-panel";

afterEach(cleanup);

function draftWithReview(needsReview = true): ExtractedExamDraft {
	return {
		title: "Cambridge IELTS 18 Test 2",
		skill: "reading",
		timeLimitMinutes: 60,
		parts: [
			{
				passage: "Đoạn văn mẫu.\n\nĐoạn 2.",
				questions: [
					{
						stem: "Câu 1 độ tin cậy cao",
						opts: ["TRUE", "FALSE", "NOT GIVEN"],
						answer: "TRUE",
						type: "tfng",
						confidence: 0.95,
						needsReview: false,
					},
					{
						stem: "Câu 2 cần rà soát",
						answer: "",
						type: "shortans",
						confidence: 0.55,
						needsReview,
					},
				],
			},
		],
	};
}

describe("ExtractedExamPanel (TOS-26 #472)", () => {
	it("sửa đáp án câu gắn nhãn vẫn giữ nguyên badge '(!) Cần rà soát lại', Lưu bản nháp nhận nội dung mới, Lưu vào Ngân hàng đề mở khóa sau khi tích xác nhận", () => {
		const onSaveDraft = vi.fn();
		const onPublish = vi.fn();
		render(
			<ExtractedExamPanel
				draft={draftWithReview(true)}
				onSaveDraft={onSaveDraft}
				onPublish={onPublish}
			/>,
		);

		// Sửa đáp án câu 2 (câu có needsReview = true)
		const answerInput = screen.getByTestId(
			"question-answer-1",
		) as HTMLInputElement;
		fireEvent.change(answerInput, { target: { value: "infrastructure" } });
		expect(answerInput.value).toBe("infrastructure");

		// Nhãn vàng "(!) Cần rà soát lại" không tự mất khi sửa câu (Plan D2)
		expect(screen.getAllByTestId("question-needs-review")).toHaveLength(1);

		// Lưu bản nháp luôn được phép dù chưa tích xác nhận
		const saveDraftBtn = screen.getByTestId(
			"save-draft-button",
		) as HTMLButtonElement;
		const publishBtn = screen.getByTestId(
			"publish-exam-button",
		) as HTMLButtonElement;
		expect(saveDraftBtn.disabled).toBe(false);
		expect(publishBtn.disabled).toBe(true);

		fireEvent.click(saveDraftBtn);
		expect(onSaveDraft).toHaveBeenCalledTimes(1);
		expect(onSaveDraft.mock.calls[0]?.[0]?.parts[0]?.questions[1]?.answer).toBe(
			"infrastructure",
		);

		// Tích hộp kiểm xác nhận → nút Lưu vào Ngân hàng đề mở khóa
		const checkbox = screen.getByTestId(
			"review-confirmation-checkbox",
		) as HTMLInputElement;
		fireEvent.click(checkbox);
		expect(publishBtn.disabled).toBe(false);

		fireEvent.click(publishBtn);
		expect(onPublish).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Cambridge IELTS 18 Test 2",
			}),
			true,
		);
	});

	it("đề không có câu gắn nhãn (needsReview = false) → không render hộp kiểm, nút xuất bản mở sẵn", () => {
		const onPublish = vi.fn();
		render(
			<ExtractedExamPanel
				draft={draftWithReview(false)}
				onPublish={onPublish}
			/>,
		);

		expect(screen.queryByTestId("review-confirmation-checkbox")).toBeNull();
		const publishBtn = screen.getByTestId(
			"publish-exam-button",
		) as HTMLButtonElement;
		expect(publishBtn.disabled).toBe(false);
		fireEvent.click(publishBtn);
		expect(onPublish).toHaveBeenCalledWith(expect.anything(), true);
	});
});
