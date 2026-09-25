import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { QuestionKeyEditor } from "./question-key-editor";

describe("QuestionKeyEditor (#218 v5)", () => {
	it("renders TFNG mode with choices chips and key-scan", () => {
		const items = [
			{ stem: "First statement", answer: "FALSE", opts: null, alts: "" },
			{ stem: "Second statement", answer: "TRUE", opts: null, alts: "" },
			{ stem: "Third statement", answer: "NOT GIVEN", opts: null, alts: "" },
		];
		const html = renderToStaticMarkup(
			<QuestionKeyEditor
				skill="reading"
				partId="p1"
				typeId="tfng"
				intro="Questions 1–3"
				items={items}
				showErrors={false}
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				imageUrl=""
				onImageUrlChange={vi.fn()}
			/>,
		);

		expect(html).toContain("Câu hỏi và đáp án đúng");
		expect(html).toContain("Câu 1");
		expect(html).toContain("Câu 2");
		expect(html).toContain("Câu 3");
		expect(html).toContain("TRUE");
		expect(html).toContain("FALSE");
		expect(html).toContain("NOT GIVEN");
		expect(html).toContain("1 FALSE · 2 TRUE · 3 NOT GIVEN");
		expect(html).toContain("Xóa");
	});

	it("hides delete button when there is only one item", () => {
		const singleItem = [
			{ stem: "Only statement", answer: "TRUE", opts: null, alts: "" },
		];
		const html = renderToStaticMarkup(
			<QuestionKeyEditor
				skill="reading"
				partId="p1"
				typeId="tfng"
				intro="Question 1"
				items={singleItem}
				showErrors={false}
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				imageUrl=""
				onImageUrlChange={vi.fn()}
			/>,
		);

		expect(html).toContain("Câu 1");
		expect(html).not.toContain("Xóa");
	});

	it("renders MCQ mode with 4 options grid and A-D chips", () => {
		const mcqItems = [
			{
				stem: "What is the main idea?",
				answer: "B",
				opts: ["Option 1", "Option 2", "Option 3", "Option 4"],
				alts: "",
			},
		];
		const html = renderToStaticMarkup(
			<QuestionKeyEditor
				skill="reading"
				partId="p3"
				typeId="mcq"
				intro="Choose A, B, C or D"
				items={mcqItems}
				showErrors={false}
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				imageUrl=""
				onImageUrlChange={vi.fn()}
			/>,
		);

		expect(html).toContain("Câu 27"); // Reading p3 starts at 27
		expect(html).toContain("Lựa chọn A");
		expect(html).toContain("Lựa chọn B");
		expect(html).toContain("Lựa chọn C");
		expect(html).toContain("Lựa chọn D");
		expect(html).toContain("27 B");
	});

	it("renders text completion mode with answer and alts input fields", () => {
		const textItems = [
			{
				stem: "The lake is located in the ………… valley.",
				answer: "northern",
				opts: null,
				alts: "north",
			},
		];
		const html = renderToStaticMarkup(
			<QuestionKeyEditor
				skill="reading"
				partId="p1"
				typeId="sent"
				intro="Complete the sentences"
				items={textItems}
				showErrors={false}
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				imageUrl=""
				onImageUrlChange={vi.fn()}
			/>,
		);

		expect(html).toContain("Câu 1");
		expect(html).toContain("Đáp án chấm tự động");
		expect(html).toContain("Chấp nhận thêm, cách nhau bằng /");
		expect(html).toContain("1 northern");
	});

	it("renders features mode with A–H chips and the option-bank intro placeholder (#269)", () => {
		const items = [{ stem: "29 is", answer: "B", opts: null, alts: "" }];
		const html = renderToStaticMarkup(
			<QuestionKeyEditor
				skill="reading"
				partId="p3"
				typeId="features"
				intro=""
				items={items}
				showErrors={false}
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				imageUrl=""
				onImageUrlChange={vi.fn()}
			/>,
		);

		expect(html).toContain("Câu 27"); // Reading p3 starts at 27
		// Letter chips A–H (letter kind, like matching information).
		expect(html).toContain(">A<");
		expect(html).toContain(">H<");
		// Placeholder instructs the teacher to list the option bank A–H here.
		expect(html).toContain("A–H");
		// Letter kind: no free-text answer/alts pair.
		expect(html).not.toContain("Chấp nhận thêm, cách nhau bằng /");
		expect(html).toContain("27 B");
	});

	it("renders diagram mode with the image URL field, thumbnail and text answer (#269)", () => {
		const items = [{ stem: "Label 4", answer: "steam", opts: null, alts: "" }];
		const html = renderToStaticMarkup(
			<QuestionKeyEditor
				skill="reading"
				partId="p1"
				typeId="diagram"
				intro=""
				items={items}
				showErrors={false}
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				imageUrl="https://example.com/diagram.png"
				onImageUrlChange={vi.fn()}
			/>,
		);

		expect(html).toContain("Ảnh biểu đồ (URL)");
		expect(html).toContain("https://example.com/diagram.png");
		expect(html).toContain('alt="Ảnh biểu đồ đề Reading"');
		// Text kind: free-text answer + alts, no chips.
		expect(html).toContain("Đáp án chấm tự động");
		expect(html).not.toContain(">H<");
	});

	it("hides the diagram thumbnail while the URL is empty or non-https (#269)", () => {
		const items = [{ stem: "Label 4", answer: "steam", opts: null, alts: "" }];
		const emptyHtml = renderToStaticMarkup(
			<QuestionKeyEditor
				skill="reading"
				partId="p1"
				typeId="diagram"
				intro=""
				items={items}
				showErrors={false}
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				imageUrl=""
				onImageUrlChange={vi.fn()}
			/>,
		);
		expect(emptyHtml).toContain("Ảnh biểu đồ (URL)");
		expect(emptyHtml).not.toContain("<img");

		const unsafeHtml = renderToStaticMarkup(
			<QuestionKeyEditor
				skill="reading"
				partId="p1"
				typeId="diagram"
				intro=""
				items={items}
				showErrors={false}
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				imageUrl="http://insecure.example.com/d.png"
				onImageUrlChange={vi.fn()}
			/>,
		);
		expect(unsafeHtml).not.toContain("<img");
	});
});
