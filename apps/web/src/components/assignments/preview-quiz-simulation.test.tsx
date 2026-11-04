// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { PreviewDraft } from "@/lib/assignment-preview-draft";
import { buildQuizSim, type QuizSimulation } from "@/lib/assignment-quiz-sim";
import { useQuizSimulation } from "@/lib/use-quiz-simulation";
import { PreviewQuizSimulation } from "./preview-quiz-simulation";

afterEach(cleanup);

/**
 * Key/alts/note strings không được xuất hiện ở take DOM — mirror
 * QUIZ_LEAK_STRINGS của e2e student (spec student-quiz-take-review).
 */
const LEAK_STRINGS = ["iron", "metal / steel", "Đáp án đúng là iron"] as const;

function noteDraft(): PreviewDraft {
	return {
		task: "task2",
		genre: "discuss",
		skill: "reading",
		part: "p1",
		type: "note",
		title: "Reading — Note completion",
		band: "6.0",
		source: "Fixture",
		prompt: "",
		note: "Đáp án đúng là iron (thay thế: metal / steel).",
		status: "ready",
		items: [
			{
				stem: "The tower is made of ____.",
				opts: null,
				answer: "iron",
				alts: "metal / steel",
			},
			{
				stem: "It stands in the city of ____.",
				opts: null,
				answer: "Paris",
				alts: "",
			},
		],
	};
}

function mcqDraft(): PreviewDraft {
	return {
		...noteDraft(),
		part: "p3",
		type: "mcq",
		note: "Đáp án đúng là C — Paris",
		items: [
			{
				stem: "Where is the Eiffel Tower?",
				opts: ["London", "Rome", "Paris", "Madrid"],
				answer: "C",
				alts: "",
			},
		],
	};
}

/** Harness mirror wiring của route preview.tsx: state sống ở harness
 * (route-level), tab render điều kiện đúng 1 tab tại một thời điểm. */
function SimHarness({ sim }: { sim: QuizSimulation }) {
	const [tab, setTab] = useState<"paper" | "sim">("paper");
	const quiz = useQuizSimulation(sim);
	return (
		<div>
			<button
				type="button"
				data-testid="harness-tab-sim"
				onClick={() => setTab("sim")}
			>
				sim
			</button>
			<button
				type="button"
				data-testid="harness-tab-paper"
				onClick={() => setTab("paper")}
			>
				paper
			</button>
			{tab === "sim" ? (
				<PreviewQuizSimulation
					sim={sim}
					answers={quiz.answers}
					grade={quiz.grade}
					onAnswer={quiz.onAnswer}
					onSubmit={quiz.submit}
					onReset={quiz.reset}
				/>
			) : (
				<div data-testid="harness-paper" />
			)}
		</div>
	);
}

/** Fixture auto-graded luôn dựng được — null là lỗi fixture, fail sớm. */
function simOf(draft: PreviewDraft, key: string): QuizSimulation {
	const sim = buildQuizSim(draft, key);
	if (!sim) throw new Error(`fixture must build a sim: ${key}`);
	return sim;
}

function openSimHarness(sim: QuizSimulation) {
	render(<SimHarness sim={sim} />);
	fireEvent.click(screen.getByTestId("harness-tab-sim"));
}

describe("PreviewQuizSimulation — take view", () => {
	it("DOM take không chứa key/alts/note (mirror leak contract)", () => {
		openSimHarness(simOf(noteDraft(), "fixture-note"));
		const html = document.body.innerHTML;
		for (const leak of LEAK_STRINGS) {
			expect(html).not.toContain(leak);
		}
		expect(screen.queryByTestId("quiz-review-item")).toBeNull();
		expect(screen.getByRole("button", { name: /Nộp bài/ })).toBeTruthy();
	});

	it("điền cloze qua input; nộp → chấm đúng theo gradeQuiz", () => {
		openSimHarness(simOf(noteDraft(), "fixture-note"));
		const first = screen.getByLabelText("Điền đáp án câu 1");
		fireEvent.change(first, { target: { value: "steel" } }); // alt của iron
		const second = screen.getByLabelText("Điền đáp án câu 2");
		fireEvent.change(second, { target: { value: "lyon" } }); // sai
		fireEvent.click(screen.getByRole("button", { name: /Nộp bài/ }));

		// Review: đúng 1 (steel ≈ alts), sai 1 (lyon).
		expect(screen.getByTestId("attempt-correct-count").textContent).toBe("1");
		expect(screen.getByTestId("attempt-correct").textContent).toBe("1");
		expect(screen.getByTestId("attempt-wrong").textContent).toBe("1");
		expect(screen.getByTestId("attempt-skipped").textContent).toBe("0");
		expect(screen.getAllByTestId("quiz-review-item")).toHaveLength(2);
		// Đáp án + thay thế + giải thích từ note đề.
		expect(document.body.innerHTML).toContain("Đáp án:");
		expect(document.body.innerHTML).toContain("iron");
		expect(document.body.innerHTML).toContain("thay thế");
		expect(screen.getAllByText("Giải thích")).toHaveLength(2);
	});

	it("mcq render radio pills; chọn đúng letter → correct", () => {
		openSimHarness(simOf(mcqDraft(), "fixture-mcq"));
		fireEvent.click(screen.getByRole("radio", { name: "C Paris" }));
		fireEvent.click(screen.getByRole("button", { name: /Nộp bài/ }));
		expect(screen.getByTestId("attempt-correct").textContent).toBe("1");
		expect(screen.queryByTestId("attempt-wrong")?.textContent).toBe("0");
	});

	it("hiển thị explanation riêng từng câu ở review mode sau khi nộp, ẩn hoàn toàn ở take mode (#571)", () => {
		const draftWithExplanation: PreviewDraft = {
			...mcqDraft(),
			note: "Note chung fallback",
			items: [
				{
					stem: "Where is the Eiffel Tower?",
					opts: ["London", "Rome", "Paris", "Madrid"],
					answer: "C",
					alts: "",
					explanation: "<p>Giải thích riêng: Tháp Eiffel ở Paris.</p>",
				},
			],
		};
		openSimHarness(simOf(draftWithExplanation, "fixture-mcq-exp"));
		expect(document.body.innerHTML).not.toContain(
			"Giải thích riêng: Tháp Eiffel ở Paris.",
		);
		fireEvent.click(screen.getByRole("radio", { name: "C Paris" }));
		fireEvent.click(screen.getByRole("button", { name: /Nộp bài/ }));
		const disclosure = screen.getByTestId("quiz-review-explanation");
		expect(disclosure.getAttribute("data-source")).toBe("question");
		expect(disclosure.textContent).toContain(
			"Giải thích riêng: Tháp Eiffel ở Paris.",
		);
		expect(disclosure.textContent).not.toContain("Note chung fallback");
	});
});

describe("PreviewQuizSimulation — composed state", () => {
	it("'Làm lại' reset answers + grade — DOM trở lại không chứa key", () => {
		openSimHarness(simOf(noteDraft(), "fixture-note"));
		fireEvent.change(screen.getByLabelText("Điền đáp án câu 1"), {
			target: { value: "iron" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Nộp bài/ }));
		expect(document.body.innerHTML).toContain("iron");

		fireEvent.click(screen.getByRole("button", { name: "Làm lại" }));
		expect(screen.getByRole("button", { name: /Nộp bài/ })).toBeTruthy();
		const html = document.body.innerHTML;
		for (const leak of LEAK_STRINGS) {
			expect(html).not.toContain(leak);
		}
		// Input trở về rỗng.
		expect(
			(screen.getByLabelText("Điền đáp án câu 1") as HTMLInputElement).value,
		).toBe("");
	});

	it("đổi tab không mất bài làm (state lift ở route level)", () => {
		openSimHarness(simOf(noteDraft(), "fixture-note"));
		fireEvent.change(screen.getByLabelText("Điền đáp án câu 1"), {
			target: { value: "steel" },
		});
		fireEvent.click(screen.getByTestId("harness-tab-paper"));
		expect(screen.queryByLabelText("Điền đáp án câu 1")).toBeNull();
		fireEvent.click(screen.getByTestId("harness-tab-sim"));
		expect(
			(screen.getByLabelText("Điền đáp án câu 1") as HTMLInputElement).value,
		).toBe("steel");
	});

	it("đổi đề (simKey ?id=A → ?id=B) reset grade + answers — không giữ grade cũ", () => {
		const { rerender } = render(
			<SimHarness sim={simOf(noteDraft(), "prompt-a")} />,
		);
		fireEvent.click(screen.getByTestId("harness-tab-sim"));
		fireEvent.change(screen.getByLabelText("Điền đáp án câu 1"), {
			target: { value: "steel" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Nộp bài/ }));
		expect(screen.getByTestId("attempt-correct-count").textContent).toBe("1");

		// Search-only navigation: cùng component, chỉ simKey đổi.
		rerender(<SimHarness sim={simOf(mcqDraft(), "prompt-b")} />);
		expect(screen.getByRole("button", { name: /Nộp bài/ })).toBeTruthy();
		expect(screen.queryByTestId("attempt-correct-count")).toBeNull();
	});
});
