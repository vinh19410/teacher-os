// @vitest-environment jsdom
import {
	type QuizReviewInfo,
	QuizReviewItem,
} from "@teacher-os/ui/components/quiz/quiz-review-item";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
	cleanup();
});

const info = (overrides: Partial<QuizReviewInfo> = {}): QuizReviewInfo => ({
	verdict: "wrong",
	key: "Paris",
	alts: "",
	answer: "London",
	note: "",
	...overrides,
});

describe("QuizReviewItem — giải thích rich text trong DOM (#358)", () => {
	it("render HTML đã sanitize: giữ định dạng, bỏ script/handler", () => {
		render(
			<QuizReviewItem
				info={info({
					explanation:
						'<p>Đoạn 2 nêu rõ <strong>Paris</strong>.</p><script>window.__x=1</script><img src="x" onerror="window.__y=1">',
				})}
			/>,
		);
		const disclosure = screen.getByTestId("quiz-review-explanation");
		expect(disclosure.querySelector("strong")?.textContent).toBe("Paris");
		expect(disclosure.querySelector("script")).toBeNull();
		expect(disclosure.innerHTML).not.toContain("onerror");
		expect(disclosure.textContent).not.toContain("<p>");
	});

	it("note HTML cũ cũng render định dạng thay vì thẻ thô", () => {
		render(
			<QuizReviewItem info={info({ note: "<p>Ghi chú <em>chung</em></p>" })} />,
		);
		const disclosure = screen.getByTestId("quiz-review-explanation");
		expect(disclosure.dataset.source).toBe("note");
		expect(disclosure.querySelector("em")?.textContent).toBe("chung");
	});

	it("disclosure đóng mặc định, mở bằng summary 'Giải thích'", () => {
		render(<QuizReviewItem info={info({ explanation: "<p>Vì vậy</p>" })} />);
		const disclosure = screen.getByTestId(
			"quiz-review-explanation",
		) as HTMLDetailsElement;
		expect(disclosure.open).toBe(false);
		fireEvent.click(screen.getByText("Giải thích"));
		expect(disclosure.open).toBe(true);
	});
});
