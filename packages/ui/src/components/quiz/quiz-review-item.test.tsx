// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QuizReviewItem } from "./quiz-review-item";

afterEach(cleanup);

describe("QuizReviewItem (#978 answerLabel)", () => {
	it("defaults answer label to 'Bạn trả lời' and supports custom 'Học viên trả lời'", () => {
		const { rerender } = render(
			<QuizReviewItem
				info={{
					verdict: "wrong",
					key: "B",
					alts: "",
					answer: "A",
					note: "",
				}}
			/>,
		);
		expect(screen.getByText(/Bạn trả lời:/)).toBeTruthy();
		expect(screen.queryByText(/Học viên trả lời:/)).toBeNull();

		rerender(
			<QuizReviewItem
				info={{
					verdict: "wrong",
					key: "B",
					alts: "",
					answer: "A",
					note: "",
					answerLabel: "Học viên trả lời",
				}}
			/>,
		);
		expect(screen.getByText(/Học viên trả lời:/)).toBeTruthy();
		expect(screen.queryByText(/Bạn trả lời:/)).toBeNull();
	});
});
