// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Route-level INTERACTIVE test cho tab "Làm thử & Soi bài" (#285) — pin leak
// contract + client-side grading trên CHÍNH route component (bổ sung cho
// preview.test.tsx static và preview-quiz-simulation.test.tsx harness).
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useSearch: () => ({ id: undefined }),
	}),
	useNavigate: () => vi.fn(),
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

vi.mock("@/lib/data-store", () => ({
	useData: () => ({ data: { assignmentPrompts: [] } }),
}));

import {
	PREVIEW_DRAFT_KEY,
	type PreviewDraft,
	savePreviewDraft,
} from "@/lib/assignment-preview-draft";
import { PreviewAssignmentRoute } from "./preview";

afterEach(() => {
	cleanup();
	sessionStorage.removeItem(PREVIEW_DRAFT_KEY);
});

const LEAK_STRINGS = ["iron", "metal / steel", "Đáp án đúng là iron"] as const;

const readingDraft: PreviewDraft = {
	task: "p1",
	genre: "note",
	title: "Route-level sim",
	band: "7.0",
	source: "",
	prompt: "",
	note: "Đáp án đúng là iron (thay thế: metal / steel).",
	status: "ready",
	skill: "reading",
	part: "p1",
	type: "note",
	passage: "Passage text.",
	intro: "",
	items: [
		{
			stem: "The tower is made of ____.",
			opts: null,
			answer: "iron",
			alts: "metal / steel",
		},
	],
};

describe("PreviewAssignmentRoute — tab 'Làm thử & Soi bài' (#285)", () => {
	it("mở tab sim: take DOM của ROUTE sạch key; nộp → review chấm đúng", () => {
		savePreviewDraft(readingDraft);
		render(<PreviewAssignmentRoute />);
		fireEvent.click(screen.getByRole("tab", { name: "Làm thử & Soi bài" }));

		expect(screen.getByRole("button", { name: /Nộp bài/ })).toBeTruthy();
		const html = document.body.innerHTML;
		for (const leak of LEAK_STRINGS) {
			expect(html).not.toContain(leak);
		}

		fireEvent.change(screen.getByLabelText("Điền đáp án câu 1"), {
			target: { value: "steel" }, // alt của iron
		});
		fireEvent.click(screen.getByRole("button", { name: /Nộp bài/ }));
		expect(screen.getByTestId("attempt-correct-count").textContent).toBe("1");
		// Review lộ key — đúng hành vi sau nộp.
		expect(document.body.innerHTML).toContain("iron");
		expect(screen.getByRole("button", { name: "Làm lại" })).toBeTruthy();
	});

	it("đổi về tab 'Đề bài' sau khi nộp: review rời DOM, bài làm giữ qua lượt quay lại", () => {
		savePreviewDraft(readingDraft);
		render(<PreviewAssignmentRoute />);
		fireEvent.click(screen.getByRole("tab", { name: "Làm thử & Soi bài" }));
		fireEvent.change(screen.getByLabelText("Điền đáp án câu 1"), {
			target: { value: "steel" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Nộp bài/ }));
		expect(screen.getByTestId("attempt-correct-count")).toBeTruthy();

		fireEvent.click(screen.getByRole("tab", { name: "Đề bài" }));
		// Đúng 1 tab trong DOM: review không còn.
		expect(screen.queryByTestId("attempt-correct-count")).toBeNull();
		const html = document.body.innerHTML;
		for (const leak of LEAK_STRINGS) {
			expect(html).not.toContain(leak);
		}
	});
});
