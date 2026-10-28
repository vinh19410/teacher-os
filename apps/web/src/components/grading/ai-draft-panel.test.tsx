// @vitest-environment jsdom
import {
	AI_GRADING_E004_MESSAGE,
	type AiGradingDraftView,
} from "@teacher-os/api/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	AiDraftPanel,
	AiDraftStatusBadge,
	aiDraftErrorLabel,
} from "./ai-draft-panel";

afterEach(() => {
	cleanup();
});

const DRAFTED: AiGradingDraftView = {
	status: "ai_drafted",
	aiScores: { task: 6.5, coherence: 7, lexical: 6, grammar: 6.5 },
	aiFeedback: "AI: bài có luận điểm rõ, cần ví dụ cụ thể hơn.",
	reviewedScores: null,
	reviewedFeedback: "",
	gradingMode: "standard",
	version: 1,
	errorCode: null,
	publishedAt: null,
};

describe("AiDraftPanel (TOS-30 #478)", () => {
	test("điền 4 điểm gợi ý theo tiêu chí Writing, format 1 chữ số thập phân", () => {
		render(<AiDraftPanel draft={DRAFTED} skill="writing" part="task2" />);
		// 6.5 → "6.5", 7 → "7.0" (task 6.5 trùng grammar 6.5 → 2 phần tử)
		expect(screen.getAllByText("6.5")).toHaveLength(2);
		expect(screen.getByText("7.0")).toBeTruthy();
		expect(screen.getByText("6.0")).toBeTruthy();
		expect(screen.getByText("Task Response")).toBeTruthy();
		expect(screen.getByText("Coherence & Cohesion")).toBeTruthy();
		expect(
			screen.getByText("AI: bài có luận điểm rõ, cần ví dụ cụ thể hơn."),
		).toBeTruthy();
		expect(screen.getByText("AI đã chấm nháp")).toBeTruthy();
	});

	test("nháp rà của giáo viên ưu tiên hiển thị thay nhận xét AI", () => {
		render(
			<AiDraftPanel
				draft={{
					...DRAFTED,
					status: "teacher_reviewing",
					reviewedScores: { task: 7, coherence: 7, lexical: 7, grammar: 7 },
					reviewedFeedback: "Giáo viên đã chỉnh.",
				}}
				skill="writing"
				part="task2"
			/>,
		);
		expect(screen.getAllByText("7.0")).toHaveLength(4);
		expect(screen.queryByText("6.5")).toBeNull();
		expect(screen.getByText("Giáo viên đã chỉnh.")).toBeTruthy();
		expect(screen.queryByText(/AI: bài có luận điểm/)).toBeNull();
		expect(screen.getByText("Đang rà soát")).toBeTruthy();
	});

	test("manual_pending hiện nhãn lỗi, không hiện điểm", () => {
		render(
			<AiDraftPanel
				draft={{
					...DRAFTED,
					status: "manual_pending",
					aiScores: null,
					aiFeedback: "",
					errorCode: "AI_GRADING_TIMEOUT",
				}}
				skill="writing"
				part="task2"
			/>,
		);
		expect(screen.getByText("Chờ chấm tay")).toBeTruthy();
		expect(
			screen.getByText("AI quá hạn — bạn vẫn chấm tay bình thường."),
		).toBeTruthy();
		expect(screen.getByText("AI chưa có điểm gợi ý cho bài này.")).toBeTruthy();
	});

	test("published hiển thị nhãn + thời điểm trả bài", () => {
		render(
			<AiDraftPanel
				draft={{
					...DRAFTED,
					status: "published",
					publishedAt: "2026-10-28T03:04:05.000Z",
				}}
				skill="writing"
				part="task2"
			/>,
		);
		expect(screen.getByText("Đã trả kết quả")).toBeTruthy();
		expect(screen.getByText(/Đã trả bài/)).toBeTruthy();
	});
});

describe("AiDraftStatusBadge", () => {
	test("mỗi trạng thái có nhãn riêng", () => {
		const statuses = [
			"ai_processing",
			"ai_drafted",
			"teacher_reviewing",
			"manual_pending",
			"published",
		] as const;
		const labels = [
			"AI đang chấm…",
			"AI đã chấm nháp",
			"Đang rà soát",
			"Chờ chấm tay",
			"Đã trả kết quả",
		];
		for (const [index, status] of statuses.entries()) {
			render(<AiDraftStatusBadge status={status} />);
			expect(screen.getByText(labels[index])).toBeTruthy();
			cleanup();
		}
	});
});

describe("aiDraftErrorLabel", () => {
	test("map đầy đủ mã lỗi, null → null", () => {
		expect(aiDraftErrorLabel("AI_GRADING_TIMEOUT")).toContain("quá hạn");
		expect(aiDraftErrorLabel("AI_GRADING_DISABLED")).toContain("chưa cấu hình");
		expect(aiDraftErrorLabel("AI_GRADING_NO_TRANSCRIPT")).toContain(
			"lời thoại",
		);
		expect(aiDraftErrorLabel("AI_GRADING_FAILED")).toContain("lỗi");
		expect(aiDraftErrorLabel("MA_CODE_LA")).toBe("AI chấm lỗi.");
		expect(aiDraftErrorLabel(null)).toBeNull();
	});
});

describe("AiDraftPanel — E-004 và Thử chấm lại AI (TOS-33 #481)", () => {
	test("TIMEOUT/FAILED hiện E-004 + nút Thử chấm lại AI; GV bấm gọi onRetry", () => {
		const onRetry = vi.fn();
		render(
			<AiDraftPanel
				draft={{
					...DRAFTED,
					status: "manual_pending",
					aiScores: null,
					aiFeedback: "",
					errorCode: "AI_GRADING_FAILED",
				}}
				skill="writing"
				part="task2"
				canRetry={true}
				onRetry={onRetry}
			/>,
		);
		expect(screen.getByTestId("ai-draft-e004").textContent).toContain(
			"E-selfomy-alignment-004",
		);
		expect(screen.getByTestId("ai-draft-e004").textContent).toContain(
			AI_GRADING_E004_MESSAGE,
		);
		const btn = screen.getByTestId("ai-retry-button") as HTMLButtonElement;
		expect(btn.disabled).toBe(false);
		fireEvent.click(btn);
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	test("TA (canRetry=false) vẫn thấy panel E-004 nhưng nút retry disabled kèm tooltip", () => {
		const onRetry = vi.fn();
		render(
			<AiDraftPanel
				draft={{
					...DRAFTED,
					status: "manual_pending",
					aiScores: null,
					aiFeedback: "",
					errorCode: "AI_GRADING_TIMEOUT",
				}}
				skill="writing"
				part="task2"
				canRetry={false}
				onRetry={onRetry}
			/>,
		);
		const btn = screen.getByTestId("ai-retry-button") as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
		expect(btn.getAttribute("title")).toBe(
			"Chỉ Giáo viên đứng lớp được chấm lại AI",
		);
		fireEvent.click(btn);
		expect(onRetry).not.toHaveBeenCalled();
	});

	test("DISABLED/NO_TRANSCRIPT không hiện E-004 hay nút retry", () => {
		render(
			<AiDraftPanel
				draft={{
					...DRAFTED,
					status: "manual_pending",
					aiScores: null,
					aiFeedback: "",
					errorCode: "AI_GRADING_NO_TRANSCRIPT",
				}}
				skill="speaking"
				part="part2"
			/>,
		);
		expect(screen.queryByTestId("ai-draft-e004")).toBeNull();
		expect(screen.queryByTestId("ai-retry-button")).toBeNull();
	});
});
