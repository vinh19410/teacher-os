// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { QuizAttemptSummary } from "@teacher-os/api/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WritingReview } from "@/components/history/writing-review";
import * as quizRepos from "@/lib/repos/quiz";

const SUMMARY: QuizAttemptSummary = {
	id: "attempt-1",
	assignmentId: "",
	title: "Writing Mock 1",
	status: "submitted",
	correctCount: 0,
	wrongCount: 0,
	skippedCount: 0,
	totalCount: 0,
	startedAt: "2026-10-01T09:00:00.000Z",
	submittedAt: "2026-10-01T10:00:00.000Z",
	items: [],
	essay: "Governments should invest more in infrastructure.",
	skill: "writing",
	media: null,
	grade: {
		scores: { task: 6.0, coherence: 6.5, lexical: 6.0, grammar: 5.5 },
		band: 6.0,
		feedback: "A clear position with relevant support. Work on accuracy.",
		gradedAt: "2026-10-02T02:00:00.000Z",
	},
	part: "task2",
	annotations: [
		{ id: "a-1", start: 21, end: 26, note: "Collocation: “invest in”." },
	],
};

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function renderReview() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<WritingReview attemptId="attempt-1" />
		</QueryClientProvider>,
	);
}

describe("WritingReview (phase 11 #378)", () => {
	it("render band tổng + tiêu chí IELTS theo part + essay highlight", () => {
		vi.spyOn(quizRepos, "useAttemptSummary").mockReturnValue({
			isLoading: false,
			isError: false,
			data: SUMMARY,
		} as never);
		const { container } = renderReview();
		expect(screen.getByTestId("writing-review")).toBeTruthy();
		expect(screen.getByText("Band tổng")).toBeTruthy();
		// Band tổng 6.0 trùng điểm lexical 6.0 → getAllByText.
		expect(screen.getAllByText("6.0").length).toBeGreaterThan(0);
		// task2 → "Task Response"; các tiêu chí khác nhãn đầy đủ.
		expect(screen.getByText("Task Response")).toBeTruthy();
		expect(screen.getByText("Coherence & Cohesion")).toBeTruthy();
		expect(screen.getByText("Grammatical Range & Accuracy")).toBeTruthy();
		// Essay tách theo phần tử đoạn/mark — kiểm tra qua textContent.
		expect(container.textContent).toContain("invest");
		expect(container.textContent).toContain("Collocation");
		// Nhận xét của giáo viên hiển thị dưới dạng trích dẫn.
		expect(container.textContent).toContain("Work on accuracy.");
	});

	it("loading → Loader (spinner); lỗi → thông báo thử lại", () => {
		vi.spyOn(quizRepos, "useAttemptSummary").mockReturnValue({
			isLoading: true,
			isError: false,
		} as never);
		const { container } = renderReview();
		expect(container.querySelector(".animate-spin")).not.toBeNull();
		cleanup();

		vi.spyOn(quizRepos, "useAttemptSummary").mockReturnValue({
			isLoading: false,
			isError: true,
		} as never);
		renderReview();
		expect(
			screen.getByText(
				"Không tải được nhận xét của giáo viên. Vui lòng thử lại.",
			),
		).toBeTruthy();
	});
});
