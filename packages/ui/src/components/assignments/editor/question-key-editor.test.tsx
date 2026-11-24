// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emptyItem } from "./assignment-presets";
import { hasItemContent } from "./cloze-editor";
import { BulkKeyPastePanel, QuestionKeyEditor } from "./question-key-editor";

afterEach(cleanup);

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
				status="ready"
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				onBankChange={vi.fn()}
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
				status="ready"
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				onBankChange={vi.fn()}
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
				status="ready"
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				onBankChange={vi.fn()}
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
				status="ready"
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				onBankChange={vi.fn()}
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
				status="ready"
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				onBankChange={vi.fn()}
				imageUrl=""
				onImageUrlChange={vi.fn()}
			/>,
		);

		expect(html).toContain("Câu 27"); // Reading p3 starts at 27
		// Letter chips A–H (letter kind, like matching information).
		expect(html).toContain(">A<");
		expect(html).toContain(">H<");
		// Phase-02 FR5: the placeholder no longer asks the teacher to list the
		// bank in the intro — it points at the structured bank panel instead.
		expect(html).not.toContain("Liệt kê");
		expect(html).toContain("Chọn đáp án từ Ngân hàng lựa chọn bên dưới.");
		// Phase-02 FR3: the bank panel renders for the bankable type.
		expect(html).toContain("Ngân hàng lựa chọn");
		expect(html).toContain("Thêm mục");
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
				status="ready"
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				onBankChange={vi.fn()}
				imageUrl="https://example.com/diagram.png"
				onImageUrlChange={vi.fn()}
			/>,
		);

		expect(html).toContain("Ảnh biểu đồ (URL)");
		expect(html).toContain("https://example.com/diagram.png");
		// Phase-04: the thumbnail renders inside the pin editor (FR3).
		expect(html).toContain('alt="Ảnh đề"');
		expect(html).toContain("Bấm lên ảnh để đặt ghim");
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
				status="ready"
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				onBankChange={vi.fn()}
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
				status="ready"
				onIntroChange={vi.fn()}
				onItemsChange={vi.fn()}
				onBankChange={vi.fn()}
				imageUrl="http://insecure.example.com/d.png"
				onImageUrlChange={vi.fn()}
			/>,
		);
		expect(unsafeHtml).not.toContain("<img");
	});
});

describe("QuestionKeyEditor — phase-01 quick wins", () => {
	const base = {
		skill: "reading",
		partId: "p1",
		typeId: "note",
		intro: "",
		showErrors: false,
		status: "ready" as const,
		onIntroChange: vi.fn(),
		onItemsChange: vi.fn(),
		onBankChange: vi.fn(),
		imageUrl: "",
		onImageUrlChange: vi.fn(),
	};

	it("disables Thêm câu at the 40-question contract cap with a message (FR10)", () => {
		const items = Array.from({ length: 40 }, () => ({
			stem: `Q${Math.random()}`,
			answer: "",
			opts: null,
			alts: "",
		}));
		const html = renderToStaticMarkup(
			<QuestionKeyEditor {...base} items={items} />,
		);
		expect(html).toMatch(/disabled=""/);
		expect(html).toContain("Tối đa 40 câu");
	});

	it("keeps Thêm câu enabled below the cap", () => {
		const html = renderToStaticMarkup(
			<QuestionKeyEditor
				{...base}
				typeId="tfng"
				items={[
					{ stem: "S", answer: "TRUE", opts: null, alts: "" },
					{ stem: "S2", answer: "", opts: null, alts: "" },
				]}
			/>,
		);
		expect(html).not.toContain("Tối đa 40 câu");
	});

	it("offers the standard-instruction preset chip for completion kinds (FR8)", () => {
		const html = renderToStaticMarkup(
			<QuestionKeyEditor {...base} typeId="note" intro="" items={[]} />,
		);
		expect(html).toContain("Chèn câu lệnh chuẩn");
	});

	it("offers no preset chip when the type has no TYPE_HINTS entry", () => {
		const html = renderToStaticMarkup(
			<QuestionKeyEditor {...base} typeId="tfng" intro="" items={[]} />,
		);
		expect(html).not.toContain("Chèn câu lệnh chuẩn");
	});

	it("exposes the bulk key paste entry point (FR7)", () => {
		const html = renderToStaticMarkup(
			<QuestionKeyEditor {...base} typeId="tfng" intro="" items={[]} />,
		);
		expect(html).toContain("Thêm key hàng loạt");
	});
});

describe("QuestionKeyEditor — cloze/tablecomp editors (phase-03)", () => {
	const base = {
		skill: "reading",
		partId: "p2",
		typeId: "summary",
		intro: "",
		showErrors: false,
		status: "ready" as const,
		onIntroChange: vi.fn(),
		onItemsChange: vi.fn(),
		onBankChange: vi.fn(),
		imageUrl: "",
		onImageUrlChange: vi.fn(),
	};

	it.each([
		"sent",
		"note",
		"summary",
		"flowchart",
		"form",
		"notes",
		"sent4",
		"flow",
	])("embeds the cloze click-to-blank editor for %s", (typeId) => {
		const html = renderToStaticMarkup(
			<QuestionKeyEditor {...base} typeId={typeId} items={[]} />,
		);
		expect(html).toContain("Soạn đoạn hoàn thành");
		expect(html).not.toContain("Soạn bảng");
	});

	it("embeds the table grid editor for tablecomp instead of the cloze editor", () => {
		const html = renderToStaticMarkup(
			<QuestionKeyEditor {...base} typeId="tablecomp" items={[]} />,
		);
		expect(html).toContain("Soạn bảng");
		expect(html).not.toContain("Soạn đoạn hoàn thành");
	});

	it("keeps shortans on the plain phase-01 text rows without a content block", () => {
		const html = renderToStaticMarkup(
			<QuestionKeyEditor
				{...base}
				typeId="shortans"
				items={[emptyItem("shortans")]}
			/>,
		);
		expect(html).not.toContain("Soạn đoạn hoàn thành");
		expect(html).not.toContain("Soạn bảng");
		expect(html).toContain("Đáp án chấm tự động");
	});

	it("renders no content editor for non-completion kinds (tfng)", () => {
		const html = renderToStaticMarkup(
			<QuestionKeyEditor {...base} typeId="tfng" items={[]} />,
		);
		expect(html).not.toContain("Soạn đoạn hoàn thành");
		expect(html).not.toContain("Soạn bảng");
	});
});

describe("BulkKeyPastePanel — per-line errors with summary (FR7)", () => {
	it("lists each failing line with its reason and keeps valid-line count", () => {
		const html = renderToStaticMarkup(
			<BulkKeyPastePanel
				value={"1. TRUE\n9. FALSE\nTRUE"}
				onValueChange={vi.fn()}
				errors={[
					{
						line: 2,
						raw: "9. FALSE",
						reason: "out-of-range",
						message: "Q9 ngoài phạm vi phần này (đang có Q1–Q3).",
					},
					{
						line: 3,
						raw: "TRUE",
						reason: "unparsable",
						message: "Dòng không đọc được — dùng mẫu “số. giá trị”.",
					},
				]}
				appliedCount={1}
				onApply={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		expect(html).toContain("Dòng 2");
		expect(html).toContain("Q9 ngoài phạm vi");
		expect(html).toContain("Dòng 3");
		expect(html).toContain("1/3 dòng đã áp dụng");
		expect(html).toContain("Áp dụng");
	});

	it("stays quiet when the paste had no errors", () => {
		const html = renderToStaticMarkup(
			<BulkKeyPastePanel
				value="1. TRUE"
				onValueChange={vi.fn()}
				errors={[]}
				appliedCount={1}
				onApply={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		expect(html).not.toContain('role="alert"');
	});
});

describe("QuestionKeyEditor — view + qStartOverride (#424 phase-01)", () => {
	const base = {
		skill: "reading",
		partId: "p1",
		typeId: "note",
		intro: "Questions 1–2",
		showErrors: false,
		status: "ready" as const,
		onIntroChange: vi.fn(),
		onItemsChange: vi.fn(),
		onBankChange: vi.fn(),
		imageUrl: "",
		onImageUrlChange: vi.fn(),
	};
	const items = [
		{ stem: "One ____", answer: "a", opts: null, alts: "" },
		{ stem: "Two ____", answer: "b", opts: null, alts: "" },
	];

	it('view="intro": khối câu hỏi ẩn nhưng vẫn mount (hidden, không unmount)', () => {
		const html = renderToStaticMarkup(
			<QuestionKeyEditor {...base} items={items} view="intro" />,
		);
		const hiddenAt = html.indexOf("<div hidden");
		expect(hiddenAt).toBeGreaterThan(-1);
		expect(html.indexOf("Lưới đáp án")).toBeGreaterThan(hiddenAt);
		expect(html.indexOf("Hướng dẫn đề")).toBeGreaterThan(-1);
		expect(html.indexOf("Hướng dẫn đề")).toBeLessThan(hiddenAt);
	});

	it('view="questions": khối hướng dẫn ẩn nhưng vẫn mount (hidden, không unmount)', () => {
		const html = renderToStaticMarkup(
			<QuestionKeyEditor {...base} items={items} view="questions" />,
		);
		const hiddenAt = html.indexOf("<div hidden");
		expect(hiddenAt).toBeGreaterThan(-1);
		expect(html.indexOf("Hướng dẫn đề")).toBeGreaterThan(hiddenAt);
		expect(html.indexOf("Lưới đáp án")).toBeGreaterThan(-1);
		// Đúng một wrapper hidden — khối câu hỏi KHÔNG nằm trong đó.
		expect(html.match(/<div hidden/g)?.length).toBe(1);
	});

	it("view mặc định (all): hai khối đều hiện, không có wrapper hidden", () => {
		const html = renderToStaticMarkup(
			<QuestionKeyEditor {...base} items={items} />,
		);
		expect(html).not.toContain("<div hidden");
		expect(html).toContain("Hướng dẫn đề");
		expect(html).toContain("Lưới đáp án");
	});

	it("qStartOverride truyền xuống grid: nhãn Câu 4/Câu 5", () => {
		const html = renderToStaticMarkup(
			<QuestionKeyEditor {...base} items={items} qStartOverride={4} />,
		);
		expect(html).toContain('aria-label="Câu 4"');
		expect(html).toContain('aria-label="Câu 5"');
	});
});

describe("ClozeEditor.hasItemContent — bảo vệ explanation (#571)", () => {
	it("coi câu chỉ có explanation HTML thực là có nội dung, bỏ qua <p></p> rỗng", () => {
		expect(
			hasItemContent({
				stem: "",
				opts: null,
				answer: "",
				alts: "",
				explanation: "<p>Có giải thích</p>",
			}),
		).toBe(true);
		expect(
			hasItemContent({
				stem: "",
				opts: null,
				answer: "",
				alts: "",
				explanation: "<p>   </p>",
			}),
		).toBe(false);
	});
});

describe("QuestionKeyEditor — Wave 2A (mcq_many & libraryReadingMode)", () => {
	const base = {
		skill: "reading",
		partId: "p1",
		intro: "",
		showErrors: false,
		status: "ready" as const,
		onIntroChange: vi.fn(),
		onItemsChange: vi.fn(),
		onBankChange: vi.fn(),
		imageUrl: "",
		onImageUrlChange: vi.fn(),
	};

	it("renders McqManyEditor instead of AnswerKeyGrid/BulkKeyPastePanel for mcq_many", () => {
		const html = renderToStaticMarkup(
			<QuestionKeyEditor
				{...base}
				typeId="mcq_many"
				items={[emptyItem("mcq_many")]}
			/>,
		);
		expect(html).toContain("Câu 1–2 · Chọn 2 đáp án đúng");
		expect(html).toContain('aria-label="Nội dung câu hỏi chung"');
		expect(html).not.toContain("Lưới đáp án");
		expect(html).not.toContain("Thêm key hàng loạt");
		expect(html).not.toContain("Thêm câu");
	});

	it("libraryReadingMode summary: cloze/table toggle defaults by stem and word bank toggle manages optionBank", () => {
		const tableHtml = renderToStaticMarkup(
			<QuestionKeyEditor
				{...base}
				typeId="summary"
				libraryReadingMode
				maxBank={20}
				items={[
					{
						stem: "[table] r1 c1: Period / Event",
						answer: "A",
						opts: null,
						alts: "",
					},
				]}
				optionBank={["word1", "word2"]}
			/>,
		);
		expect(tableHtml).toContain("Đoạn văn (Cloze)");
		expect(tableHtml).toContain("Bảng (Grid)");
		expect(tableHtml).toContain("Soạn bảng");
		expect(tableHtml).toContain("Dùng ngân hàng từ (Word Bank)");
		expect(tableHtml).toContain("Ngân hàng từ (Word Bank)");
		expect(tableHtml).toContain("2/20 mục");
		// Summary with word bank shows choice chips A, B instead of text inputs
		expect(tableHtml).toContain('aria-label="Câu 1: A"');
		expect(tableHtml).not.toContain('aria-label="Đáp án chấm tự động"');

		// Interactive toggling
		const onBankChange = vi.fn();
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
		const { getByRole, getByLabelText, container, rerender } = render(
			<QuestionKeyEditor
				{...base}
				typeId="summary"
				libraryReadingMode
				maxBank={20}
				items={[{ stem: "Text ____", answer: "alpha", opts: null, alts: "" }]}
				optionBank={[]}
				onBankChange={onBankChange}
			/>,
		);
		expect(container.textContent).toContain("Soạn đoạn hoàn thành");
		expect(container.textContent).not.toContain("Ngân hàng từ (Word Bank)");

		// Toggle to Table mode
		fireEvent.click(getByRole("button", { name: "Bảng (Grid)" }));
		expect(container.textContent).toContain("Soạn bảng");

		// Enable Word Bank checkbox
		const checkbox = getByLabelText(
			"Dùng ngân hàng từ (Word Bank)",
		) as HTMLInputElement;
		expect(checkbox.checked).toBe(false);
		fireEvent.click(checkbox);
		expect(checkbox.checked).toBe(true);
		expect(container.textContent).toContain("Ngân hàng từ (Word Bank)");

		// With non-empty optionBank, unchecking triggers confirm and clears to []
		rerender(
			<QuestionKeyEditor
				{...base}
				typeId="summary"
				libraryReadingMode
				maxBank={20}
				items={[{ stem: "Text ____", answer: "A", opts: null, alts: "" }]}
				optionBank={["word1", "word2"]}
				onBankChange={onBankChange}
			/>,
		);
		fireEvent.click(getByLabelText("Dùng ngân hàng từ (Word Bank)"));
		expect(confirmSpy).toHaveBeenCalledTimes(1);
		expect(onBankChange).toHaveBeenCalledWith([]);
		confirmSpy.mockRestore();
	});

	it("libraryReadingMode fill_blank: supports cloze and table toggle", () => {
		const { getByRole, container } = render(
			<QuestionKeyEditor
				{...base}
				typeId="fill_blank"
				libraryReadingMode
				items={[{ stem: "Fill ____", answer: "sun", opts: null, alts: "" }]}
			/>,
		);
		expect(container.textContent).toContain("Soạn đoạn hoàn thành");
		fireEvent.click(getByRole("button", { name: "Bảng (Grid)" }));
		expect(container.textContent).toContain("Soạn bảng");
	});

	it("libraryReadingMode diagram: shows ClozeEditor with PinEditor and does not require pin on reading", () => {
		const html = renderToStaticMarkup(
			<QuestionKeyEditor
				{...base}
				skill="reading"
				typeId="diagram"
				libraryReadingMode
				showErrors
				status="ready"
				imageUrl="https://example.com/diagram.png"
				items={[
					{
						stem: "The ____ valve opens",
						answer: "intake",
						opts: null,
						alts: "",
						pin: null,
					},
				]}
			/>,
		);
		expect(html).toContain("Soạn đoạn hoàn thành");
		expect(html).toContain("Bấm lên ảnh để đặt ghim");
		expect(html).not.toContain("Đặt ghim trên ảnh cho câu này.");

		// Library listening map also keeps pins optional (maps already carry printed letters A–J)
		const libraryMapHtml = renderToStaticMarkup(
			<QuestionKeyEditor
				{...base}
				skill="listening"
				typeId="map"
				libraryMode
				showErrors
				status="ready"
				imageUrl="https://example.com/map.png"
				items={[
					{ stem: "Location 1", answer: "A", opts: null, alts: "", pin: null },
				]}
			/>,
		);
		expect(libraryMapHtml).not.toContain("Đặt ghim trên ảnh cho câu này.");

		// Teacher bank (non-library) listening map still requires pin when ready
		const webMapHtml = renderToStaticMarkup(
			<QuestionKeyEditor
				{...base}
				skill="listening"
				typeId="map"
				showErrors
				status="ready"
				imageUrl="https://example.com/map.png"
				items={[
					{ stem: "Location 1", answer: "A", opts: null, alts: "", pin: null },
				]}
			/>,
		);
		expect(webMapHtml).toContain("Đặt ghim trên ảnh cho câu này.");
	});

	it("libraryReadingMode match_names/matching show OptionBankEditor with maxBank=20", () => {
		for (const typeId of ["match_names", "matching"]) {
			const html = renderToStaticMarkup(
				<QuestionKeyEditor
					{...base}
					typeId={typeId}
					libraryReadingMode
					maxBank={20}
					optionBank={["Smith", "Jones"]}
					items={[{ stem: "Statement", answer: "A", opts: null, alts: "" }]}
				/>,
			);
			expect(html).toContain("2/20 mục");
			expect(html).toContain('aria-label="Câu 1: A"');
		}
	});

	it("mcq: thêm câu mới kế thừa 3 lựa chọn khi câu cuối đang có 3 lựa chọn", () => {
		const onItemsChange = vi.fn();
		const { getByRole } = render(
			<QuestionKeyEditor
				{...base}
				typeId="mcq"
				items={[
					{
						stem: "Q1",
						opts: ["A", "B", "C"],
						answer: "A",
						alts: "",
					},
				]}
				onItemsChange={onItemsChange}
			/>,
		);
		fireEvent.click(getByRole("button", { name: "Thêm câu" }));
		expect(onItemsChange).toHaveBeenCalledWith([
			{ stem: "Q1", opts: ["A", "B", "C"], answer: "A", alts: "" },
			{ stem: "", opts: ["", "", ""], answer: "", alts: "", pin: null },
		]);
	});
});
