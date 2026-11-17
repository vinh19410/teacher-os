// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyItem, type QuestionItem } from "./assignment-presets";
import { McqManyEditor } from "./mcq-many-editor";

afterEach(cleanup);

function renderControlled(
	initialItems: QuestionItem[],
	props: Partial<Parameters<typeof McqManyEditor>[0]> = {},
) {
	const state = { items: initialItems };
	const onItemsChange = vi.fn((next: QuestionItem[]) => {
		state.items = next;
	});
	const view = () => (
		<McqManyEditor
			items={state.items}
			qStart={1}
			showErrors={false}
			onItemsChange={onItemsChange}
			{...props}
		/>
	);
	const utils = render(view());
	return {
		...utils,
		state,
		onItemsChange,
		sync: () => utils.rerender(view()),
	};
}

describe("McqManyEditor", () => {
	it("treats [emptyItem('mcq_many')] as 1 cluster with 5 options and range Câu 1–2", () => {
		const { container, getByLabelText, queryByRole } = renderControlled([
			emptyItem("mcq_many"),
		]);
		expect(container.textContent).toContain("Câu 1–2 · Chọn 2 đáp án đúng");
		expect(getByLabelText("Nội dung câu hỏi chung")).not.toBeNull();
		for (const letter of ["A", "B", "C", "D", "E"]) {
			expect(getByLabelText(`Đáp án đúng ${letter}`)).not.toBeNull();
			expect(getByLabelText(`Lựa chọn ${letter}`)).not.toBeNull();
		}
		expect(queryByRole("button", { name: /Xóa cụm/ })).toBeNull();
	});

	it("emits K consecutive items sharing stem, opts, answerSet (<=20 chars) sorted A–H", () => {
		const { getByLabelText, state, sync, container } = renderControlled([
			emptyItem("mcq_many"),
		]);
		fireEvent.change(getByLabelText("Nội dung câu hỏi chung"), {
			target: { value: "Which TWO features are mentioned?" },
		});
		sync();
		expect(state.items).toHaveLength(2);
		const setId = state.items[0]?.answerSet;
		expect(setId).toBeTruthy();
		expect(setId?.length).toBeLessThanOrEqual(20);
		expect(state.items[1]?.answerSet).toBe(setId);

		// Check D then B — emitted answers must be sorted ["B", "D"]
		fireEvent.click(getByLabelText("Đáp án đúng D"));
		sync();
		expect(state.items.map((item) => item.answer)).toEqual(["D", ""]);

		fireEvent.click(getByLabelText("Đáp án đúng B"));
		sync();
		expect(state.items.map((item) => item.answer)).toEqual(["B", "D"]);
		expect(container.textContent).toContain("Câu 1–2 · Chọn 2 đáp án đúng");

		// Check 3rd answer A — expands cluster to 3 items ["A", "B", "D"]
		fireEvent.click(getByLabelText("Đáp án đúng A"));
		sync();
		expect(state.items).toHaveLength(3);
		expect(state.items.map((item) => item.answer)).toEqual(["A", "B", "D"]);
		expect(container.textContent).toContain("Câu 1–3 · Chọn 3 đáp án đúng");

		// Uncheck A and B — keeps 2 placeholder items with ["D", ""]
		fireEvent.click(getByLabelText("Đáp án đúng A"));
		sync();
		fireEvent.click(getByLabelText("Đáp án đúng B"));
		sync();
		expect(state.items).toHaveLength(2);
		expect(state.items.map((item) => item.answer)).toEqual(["D", ""]);
	});

	it("adds options up to 8 and removes options down to 2 while shifting checked letters", () => {
		const { getByRole, getByLabelText, queryByLabelText, state, sync } =
			renderControlled([
				{
					stem: "Choose TWO",
					opts: ["One", "Two", "Three"],
					answer: "A",
					alts: "",
					answerSet: "set-1",
				},
				{
					stem: "Choose TWO",
					opts: ["One", "Two", "Three"],
					answer: "C",
					alts: "",
					answerSet: "set-1",
				},
			]);

		fireEvent.click(getByRole("button", { name: "+ Thêm lựa chọn" }));
		sync();
		expect(state.items[0]?.opts).toHaveLength(4);
		expect(getByLabelText("Lựa chọn D")).not.toBeNull();

		// Remove option B: C shifts to B, leaving ["A", "B"]
		fireEvent.click(getByLabelText("Xóa lựa chọn B"));
		sync();
		expect(state.items[0]?.opts).toEqual(["One", "Three", ""]);
		expect(state.items.map((item) => item.answer)).toEqual(["A", "B"]);

		// Remove option C -> down to 2 options, delete buttons disappear
		fireEvent.click(getByLabelText("Xóa lựa chọn C"));
		sync();
		expect(state.items[0]?.opts).toHaveLength(2);
		expect(queryByLabelText("Xóa lựa chọn A")).toBeNull();
	});

	it("supports adding and removing multiple clusters with sequential numbering", () => {
		const { getByRole, container, state, sync } = renderControlled(
			[
				{
					stem: "Cluster 1",
					opts: ["A1", "B1", "C1"],
					answer: "A",
					alts: "",
					answerSet: "set-a",
				},
				{
					stem: "Cluster 1",
					opts: ["A1", "B1", "C1"],
					answer: "B",
					alts: "",
					answerSet: "set-a",
				},
			],
			{ qStart: 21 },
		);
		expect(container.textContent).toContain("Câu 21–22 · Chọn 2 đáp án đúng");

		fireEvent.click(getByRole("button", { name: "+ Thêm cụm chọn nhiều" }));
		sync();
		expect(state.items).toHaveLength(4);
		expect(container.textContent).toContain("Câu 23–24 · Chọn 2 đáp án đúng");

		fireEvent.click(getByRole("button", { name: "Xóa cụm câu 21–22" }));
		sync();
		expect(state.items).toHaveLength(2);
		expect(container.textContent).toContain("Câu 21–22 · Chọn 2 đáp án đúng");
	});

	it("respects maxTotalQuestions=40 and lockAddQuestion when adding clusters or checking extra options", () => {
		const items39: QuestionItem[] = [
			...Array.from({ length: 34 }, (_, i) => ({
				stem: `S${Math.floor(i / 2)}`,
				opts: ["1", "2", "3"],
				answer: i % 2 === 0 ? "A" : "B",
				alts: "",
				answerSet: `set-${Math.floor(i / 2)}`,
			})),
			{
				stem: "Triple",
				opts: ["1", "2", "3"],
				answer: "A",
				alts: "",
				answerSet: "set-triple",
			},
			{
				stem: "Triple",
				opts: ["1", "2", "3"],
				answer: "B",
				alts: "",
				answerSet: "set-triple",
			},
			{
				stem: "Triple",
				opts: ["1", "2", "3"],
				answer: "C",
				alts: "",
				answerSet: "set-triple",
			},
			{
				stem: "Last",
				opts: ["1", "2", "3", "4"],
				answer: "A",
				alts: "",
				answerSet: "set-last",
			},
			{
				stem: "Last",
				opts: ["1", "2", "3", "4"],
				answer: "B",
				alts: "",
				answerSet: "set-last",
			},
		];
		const { getByRole, getAllByLabelText } = renderControlled(items39, {
			maxTotalQuestions: 40,
		});
		const addBtn = getByRole("button", {
			name: "+ Thêm cụm chọn nhiều",
		}) as HTMLButtonElement;
		expect(addBtn.disabled).toBe(true);
		expect(
			(
				getAllByLabelText("Đáp án đúng D").at(-1) as
					| HTMLInputElement
					| undefined
			)?.disabled,
		).toBe(false);
	});

	it("disables extra answer checks and adding clusters when lockAddQuestion is true", () => {
		const locked = renderControlled(
			[
				{
					stem: "S",
					opts: ["1", "2", "3"],
					answer: "A",
					alts: "",
					answerSet: "set-1",
				},
				{
					stem: "S",
					opts: ["1", "2", "3"],
					answer: "B",
					alts: "",
					answerSet: "set-1",
				},
			],
			{ lockAddQuestion: true },
		);
		const checkC = locked.getByLabelText("Đáp án đúng C") as HTMLInputElement;
		expect(checkC.disabled).toBe(true);
		const addBtn = locked.getByRole("button", {
			name: "+ Thêm cụm chọn nhiều",
		}) as HTMLButtonElement;
		expect(addBtn.disabled).toBe(true);
	});

	it("shows explanation editor when showExplanation is true and validation alerts when showErrors is true", () => {
		const { container } = render(
			<McqManyEditor
				items={[emptyItem("mcq_many")]}
				qStart={1}
				showErrors
				requireFilled
				showExplanation
				onItemsChange={vi.fn()}
			/>,
		);
		expect(container.textContent).toContain("Giải thích câu 1–2");
		expect(container.textContent).toContain("Nhập nội dung câu hỏi.");
		expect(container.textContent).toContain(
			"Cần ít nhất 2 lựa chọn có nội dung.",
		);
		expect(container.textContent).toContain("Chọn ít nhất 2 đáp án đúng.");
	});
});
