// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnswerKeyGrid } from "./answer-key-grid";
import { emptyItem, type QuestionItem } from "./assignment-presets";

afterEach(cleanup);

function tfngItems(count: number, answers: string[] = []) {
	return Array.from({ length: count }, (_, index) => ({
		stem: `Statement ${index + 1}`,
		answer: answers[index] ?? "",
		opts: null,
		alts: "",
	}));
}

function renderGrid(props: Partial<Parameters<typeof AnswerKeyGrid>[0]>) {
	return renderToStaticMarkup(
		<AnswerKeyGrid
			typeId="tfng"
			skill="reading"
			partId="p1"
			items={tfngItems(1)}
			showErrors={false}
			onItemsChange={vi.fn()}
			onAddQuestion={vi.fn()}
			{...props}
		/>,
	);
}

describe("AnswerKeyGrid — three row kinds (phase-01 FR1/FR2/FR4)", () => {
	it("renders tfng rows with REAL question numbers from qStart, not 1..n", () => {
		const html = renderGrid({
			typeId: "ynng",
			skill: "listening",
			partId: "s4",
			items: tfngItems(3),
		});
		expect(html).toContain("Câu 31");
		expect(html).toContain("Câu 32");
		expect(html).toContain("Câu 33");
		expect(html).not.toMatch(/Câu 1</);
		expect(html).toContain("YES");
		expect(html).toContain("NOT GIVEN");
	});

	it("wires aria-pressed and per-chip aria-labels on the answer chips", () => {
		const html = renderGrid({
			items: tfngItems(1, ["TRUE"]),
		});
		expect(html).toContain('aria-label="Câu 1: TRUE"');
		expect(html).toContain('aria-label="Câu 1: FALSE"');
		expect(html).toContain('aria-label="Câu 1: NOT GIVEN"');
		// Exactly the selected chip is pressed.
		expect(html).toMatch(/aria-pressed="true"[^>]*>TRUE</);
		expect(html).toMatch(/aria-pressed="false"[^>]*>FALSE</);
	});

	it("carries data-qindex on each row for focus management", () => {
		const html = renderGrid({ items: tfngItems(3) });
		expect(html).toContain('data-qindex="0"');
		expect(html).toContain('data-qindex="1"');
		expect(html).toContain('data-qindex="2"');
	});

	it("renders mcq rows with stem input, A–D chips and option inputs", () => {
		const html = renderGrid({
			typeId: "mcq",
			skill: "reading",
			partId: "p3",
			items: [
				{
					stem: "What is the main idea?",
					answer: "B",
					opts: ["One", "Two", "Three", "Four"],
					alts: "",
				},
			],
		});
		expect(html).toContain("Câu 27");
		expect(html).toContain('aria-label="Câu 27: A"');
		expect(html).toMatch(/aria-pressed="true"[^>]*>B</);
		expect(html).toContain('placeholder="Lựa chọn A"');
		expect(html).toContain('placeholder="Lựa chọn D"');
		expect(html).toContain("Four");
	});

	it("renders letter rows with A–H chips and no free-text answer/alts inputs", () => {
		const html = renderGrid({
			typeId: "features",
			skill: "reading",
			partId: "p3",
			items: [{ stem: "29 is", answer: "B", opts: null, alts: "" }],
		});
		expect(html).toContain(">A<");
		expect(html).toContain(">H<");
		expect(html).not.toContain("Chấp nhận thêm, cách nhau bằng /");
	});

	it("renders roman rows with i–viii chips", () => {
		const html = renderGrid({
			typeId: "headings",
			skill: "reading",
			partId: "p2",
			items: [{ stem: "Paragraph A", answer: "iii", opts: null, alts: "" }],
		});
		expect(html).toContain(">i<");
		expect(html).toContain(">viii<");
		expect(html).toMatch(/aria-pressed="true"[^>]*>iii</);
	});

	it("renders text rows with stem, answer and alts inputs in one grid row", () => {
		const html = renderGrid({
			typeId: "sent",
			skill: "reading",
			partId: "p1",
			items: [
				{
					stem: "The lake is in the …… valley.",
					answer: "northern",
					opts: null,
					alts: "north",
				},
			],
		});
		expect(html).toContain('aria-label="Nội dung câu hỏi phía học viên"');
		expect(html).toContain('aria-label="Đáp án chấm tự động"');
		expect(html).toContain('aria-label="Chấp nhận thêm, cách nhau bằng /"');
		expect(html).toContain("northern");
		expect(html).not.toContain('aria-label="Câu 1: TRUE"');
	});
});

describe("AnswerKeyGrid — per-row validation (phase-01 FR9)", () => {
	it("shows missing stem/answer errors inside the row when showErrors is on", () => {
		const html = renderGrid({
			items: [emptyItem("tfng")],
			showErrors: true,
		});
		expect(html).toContain("Nhập nội dung câu hỏi.");
		expect(html).toContain("Khóa đáp án đúng.");
	});

	it("flags over-cap stem (500), answer (200) and alts (500) — contract caps", () => {
		const html = renderGrid({
			items: [
				{
					stem: "s".repeat(501),
					answer: "a".repeat(201),
					opts: null,
					alts: "x".repeat(501),
				},
			],
			typeId: "sent",
			showErrors: true,
		});
		expect(html).toContain("vượt quá 500 ký tự");
		expect(html).toContain("vượt quá 200 ký tự");
	});

	it("flags an mcq option over the 500-char contract cap", () => {
		const html = renderGrid({
			typeId: "mcq",
			skill: "reading",
			partId: "p3",
			items: [
				{
					stem: "Main idea?",
					answer: "A",
					opts: ["o".repeat(501), "Two", "Three", "Four"],
					alts: "",
				},
			],
			showErrors: true,
		});
		expect(html).toContain("Lựa chọn vượt quá 500 ký tự.");
	});

	it("a draft (requireFilled=false) stays quiet about missing stem/answer but still flags over-cap and invalid choices", () => {
		const draftQuiet = renderGrid({
			items: [emptyItem("tfng")],
			showErrors: true,
			requireFilled: false,
		});
		expect(draftQuiet).not.toContain("Nhập nội dung câu hỏi.");
		expect(draftQuiet).not.toContain("Khóa đáp án đúng.");

		const draftLoud = renderGrid({
			items: [{ stem: "s".repeat(501), answer: "MAYBE", opts: null, alts: "" }],
			showErrors: true,
			requireFilled: false,
		});
		expect(draftLoud).toContain("vượt quá 500 ký tự");
		expect(draftLoud).toContain("không thuộc bộ đáp án");
	});

	it("keeps rows quiet until blur or save", () => {
		const html = renderGrid({ items: [emptyItem("tfng")], showErrors: false });
		expect(html).not.toContain("Nhập nội dung câu hỏi.");
		expect(html).not.toContain("Khóa đáp án đúng.");
	});

	it("flags a stored answer outside the choice set", () => {
		const html = renderGrid({
			items: [{ stem: "S", answer: "MAYBE", opts: null, alts: "" }],
			showErrors: true,
		});
		expect(html).toContain("không thuộc bộ đáp án");
	});

	it("does not flag an empty alts field (alts are optional)", () => {
		const html = renderGrid({
			typeId: "sent",
			items: [{ stem: "S", answer: "x", opts: null, alts: "" }],
			showErrors: true,
		});
		expect(html).not.toContain("vượt quá");
	});
});

describe("AnswerKeyGrid — marker rule (phase-03 FR7)", () => {
	it("flags a stem with two or more ____ markers inside the row, in both statuses", () => {
		for (const requireFilled of [true, false]) {
			const html = renderGrid({
				typeId: "sent",
				items: [{ stem: "a ____ b ____ c", answer: "x", opts: null, alts: "" }],
				showErrors: true,
				requireFilled,
			});
			expect(html).toContain("2 chỗ trống");
			expect(html).toContain("một chỗ trống");
		}
	});

	it("one marker and zero markers stay valid", () => {
		const html = renderGrid({
			typeId: "sent",
			items: [
				{ stem: "with ____ marker", answer: "x", opts: null, alts: "" },
				{ stem: "[table] r1 c1: A / B", answer: "y", opts: null, alts: "" },
			],
			showErrors: true,
		});
		expect(html).not.toContain("chỗ trống (____)");
		expect(html).not.toContain("một chỗ trống.");
	});
});

describe("AnswerKeyGrid — row actions", () => {
	it("keeps the per-row delete button hidden while a single row remains", () => {
		const single = renderGrid({ items: [emptyItem("tfng")] });
		expect(single).not.toContain("Xóa");
		const many = renderGrid({ items: tfngItems(2) });
		expect(many).toContain("Xóa");
	});
});

describe("AnswerKeyGrid — option bank chips (phase-02 FR4)", () => {
	it("sources letter chips from the bank for bankable kinds: 5 rows → A–E only", () => {
		const html = renderGrid({
			typeId: "features",
			skill: "reading",
			partId: "p3",
			items: tfngItems(2, ["A", "C"]),
			optionBank: ["Ada", "Brunel", "Curie", "Darwin", "Einstein"],
		});
		expect(html).toContain('aria-label="Câu 27: A"');
		expect(html).toContain('aria-label="Câu 27: E"');
		expect(html).not.toContain('aria-label="Câu 27: F"');
		expect(html).not.toContain('aria-label="Câu 27: H"');
		// Keyed answers still render as selected.
		expect(html).toMatch(/aria-pressed="true"[^>]*>A</);
	});

	it("falls back to the full alphabet when the bank is empty (draft UX)", () => {
		const html = renderGrid({
			typeId: "features",
			skill: "reading",
			partId: "p3",
			items: tfngItems(1),
			optionBank: [],
		});
		expect(html).toContain('aria-label="Câu 27: A"');
		expect(html).toContain('aria-label="Câu 27: H"');
	});

	it("sources roman chips from the bank for headings", () => {
		const html = renderGrid({
			typeId: "headings",
			skill: "reading",
			partId: "p2",
			items: tfngItems(1, ["i"]),
			optionBank: ["I", "II", "III"],
		});
		expect(html).toContain('aria-label="Câu 14: i"');
		expect(html).toContain('aria-label="Câu 14: iii"');
		expect(html).not.toContain('aria-label="Câu 14: iv"');
	});

	it("sentend used labels render disabled and faded; features may reuse", () => {
		const sentend = renderGrid({
			typeId: "sentend",
			skill: "reading",
			partId: "p2",
			items: tfngItems(2, ["A", ""]),
			optionBank: ["Nửa A", "Nửa B", "Nửa C"],
		});
		// Row 2's "A" chip is disabled + faded (row 1 already keyed it).
		expect(sentend).toContain('aria-label="Câu 15: A" disabled');
		expect(sentend).toContain("opacity-40");
		expect(sentend).not.toContain('aria-label="Câu 15: B" disabled');

		const features = renderGrid({
			typeId: "features",
			skill: "reading",
			partId: "p3",
			items: tfngItems(2, ["A", ""]),
			optionBank: ["Ada", "Brunel", "Curie"],
		});
		expect(features).not.toContain('aria-label="Câu 27: A" disabled');
	});

	it("the current row's own selection stays enabled", () => {
		const html = renderGrid({
			typeId: "sentend",
			skill: "reading",
			partId: "p2",
			items: tfngItems(2, ["A", "A"]),
			optionBank: ["Nửa A", "Nửa B", "Nửa C"],
		});
		expect(html).toMatch(/aria-pressed="true"[^>]*>A</);
		expect(html).not.toContain('aria-label="Câu 14: A" disabled');
	});

	it("flags a keyed answer beyond the bank length as invalid", () => {
		const html = renderGrid({
			typeId: "features",
			skill: "reading",
			partId: "p3",
			items: tfngItems(1, ["F"]),
			optionBank: ["Ada", "Brunel"],
			showErrors: true,
		});
		expect(html).toContain("không thuộc bộ đáp án");
	});

	it("non-bankable kinds ignore the optionBank prop entirely", () => {
		const html = renderGrid({
			typeId: "mcq",
			skill: "reading",
			partId: "p3",
			items: [
				{ stem: "Main idea?", answer: "A", opts: ["", "", "", ""], alts: "" },
			],
			optionBank: ["Ada", "Brunel"],
		});
		expect(html).toContain('aria-label="Câu 27: A"');
		expect(html).toContain('aria-label="Câu 27: D"');
	});
});

describe("AnswerKeyGrid — per-question type (mixed prompts)", () => {
	it("renders a per-row type select listing the part catalog plus the prompt type default", () => {
		const html = renderGrid({
			typeId: "note",
			skill: "reading",
			partId: "p1",
		});
		expect(html).toContain('aria-label="Dạng bài câu 1"');
		// Catalog p1: tfng, sent, note, shortans, diagram.
		for (const option of ["tfng", "sent", "note", "shortans", "diagram"]) {
			expect(html).toContain(`value="${option}"`);
		}
		// Default option = theo dạng đề (prompt type).
		expect(html).toContain("Theo dạng đề");
	});

	it("keys the answer widget off the question type, not the prompt type", () => {
		const html = renderGrid({
			typeId: "note",
			skill: "reading",
			partId: "p1",
			items: [
				{
					stem: "T/F/NG statement",
					answer: "TRUE",
					opts: null,
					alts: "",
					type: "tfng",
				},
				{ stem: "Cloze ____", answer: "river", opts: null, alts: "" },
			],
		});
		// Row 1 (tfng): chips; Row 2 (prompt type note): free text + alts.
		expect(html).toContain('aria-label="Câu 1: TRUE"');
		expect(html).toContain('aria-label="Câu 1: NOT GIVEN"');
		expect(html).toContain('aria-label="Đáp án chấm tự động"');
		expect(html).toContain('aria-label="Chấp nhận thêm, cách nhau bằng /"');
	});

	it("changing a row type resets opts/answer, keeps stem, drops pin off image types", async () => {
		const onItemsChange = vi.fn();
		const { container } = render(
			<AnswerKeyGrid
				typeId="note"
				skill="reading"
				partId="p1"
				items={[
					{
						stem: "Keep my stem",
						answer: "river",
						opts: null,
						alts: "rivers",
						pin: { x: 10, y: 20 },
					},
				]}
				showErrors={false}
				onItemsChange={onItemsChange}
				onAddQuestion={vi.fn()}
			/>,
		);
		const select = container.querySelector(
			'select[aria-label="Dạng bài câu 1"]',
		) as HTMLSelectElement;
		expect(select).not.toBeNull();
		fireEvent.change(select, { target: { value: "tfng" } });
		expect(onItemsChange).toHaveBeenCalledTimes(1);
		const next = onItemsChange.mock.calls[0][0][0];
		// tfng không phải loại ảnh → pin bị drop (tránh route câu vào
		// PinOverlay lệch trên take screen).
		expect(next).toEqual({
			stem: "Keep my stem",
			opts: null,
			answer: "",
			alts: "",
			pin: null,
			type: "tfng",
		});

		// Type ảnh (diagram thuộc p1) → pin giữ nguyên khi câu revert về
		// dạng đề (câu phải đang có type riêng, không thì là no-op).
		const onKeepPin = vi.fn();
		const again = render(
			<AnswerKeyGrid
				typeId="diagram"
				skill="reading"
				partId="p1"
				items={[
					{
						stem: "Pinned stem",
						answer: "TRUE",
						opts: null,
						alts: "",
						pin: { x: 10, y: 20 },
						type: "tfng",
					},
				]}
				showErrors={false}
				onItemsChange={onKeepPin}
				onAddQuestion={vi.fn()}
			/>,
		);
		fireEvent.change(
			again.container.querySelector(
				'select[aria-label="Dạng bài câu 1"]',
			) as HTMLSelectElement,
			{ target: { value: "" } },
		);
		expect(onKeepPin.mock.calls[0][0][0]).toMatchObject({
			stem: "Pinned stem",
			pin: { x: 10, y: 20 },
			type: null,
		});
	});

	it("reverting a row to the prompt default sends type null", () => {
		const onItemsChange = vi.fn();
		const { container } = render(
			<AnswerKeyGrid
				typeId="note"
				skill="reading"
				partId="p1"
				items={[
					{
						stem: "Statement",
						answer: "TRUE",
						opts: null,
						alts: "",
						type: "tfng",
					},
				]}
				showErrors={false}
				onItemsChange={onItemsChange}
				onAddQuestion={vi.fn()}
			/>,
		);
		const select = container.querySelector(
			'select[aria-label="Dạng bài câu 1"]',
		) as HTMLSelectElement;
		fireEvent.change(select, { target: { value: "" } });
		const next = onItemsChange.mock.calls[0][0][0];
		expect(next.type).toBeNull();
		expect(next.stem).toBe("Statement");
	});
});

describe("AnswerKeyGrid — cảnh báo câu T/F/NG đang theo dạng điền chữ", () => {
	const noteItems = [
		{ stem: "The roof was wood.", answer: "FALSE", opts: null, alts: "" },
		{ stem: "The walls were red.", answer: "TRUE", opts: null, alts: "" },
		{ stem: "No data on doors.", answer: "NOT GIVEN", opts: null, alts: "" },
		{ stem: "Floors were stone.", answer: "FALSE", opts: null, alts: "" },
		{
			stem: "Houses used ____ frames.",
			answer: "timber",
			opts: null,
			alts: "",
		},
	];

	function renderNote(
		props: Partial<Parameters<typeof AnswerKeyGrid>[0]> = {},
	) {
		return render(
			<AnswerKeyGrid
				typeId="note"
				skill="reading"
				partId="p1"
				items={noteItems}
				showErrors={false}
				onItemsChange={vi.fn()}
				onAddQuestion={vi.fn()}
				{...props}
			/>,
		);
	}

	it("warns once for the run of questions 1-4 and not for the blank question", () => {
		const { getAllByRole, getByRole } = renderNote();
		const warnings = getAllByRole("group", { name: /Gợi ý dạng bài/ });
		expect(warnings).toHaveLength(1);
		expect(warnings[0].textContent).toContain("Câu 1–4");
		expect(warnings[0].textContent).toContain("Note completion");
		expect(
			getByRole("button", {
				name: "Đặt dạng True / False / Not Given cho câu 1–4",
			}),
		).not.toBeNull();
	});

	it("numbers the warning with the real question numbers from qStart", () => {
		const { getByRole } = renderNote({
			typeId: "flowchart",
			partId: "p3",
			items: [
				{ stem: "Claim A", answer: "YES", opts: null, alts: "" },
				{ stem: "Claim B", answer: "NOT GIVEN", opts: null, alts: "" },
			],
		});
		expect(
			getByRole("button", {
				name: "Đặt dạng Yes / No / Not Given cho câu 27–28",
			}),
		).not.toBeNull();
	});

	it("one click sets type on the run only and keeps stem, answer and the other rows", () => {
		const onItemsChange = vi.fn();
		const { getByRole } = renderNote({ onItemsChange });
		fireEvent.click(
			getByRole("button", {
				name: "Đặt dạng True / False / Not Given cho câu 1–4",
			}),
		);
		expect(onItemsChange).toHaveBeenCalledTimes(1);
		const next = onItemsChange.mock.calls[0][0];
		expect(next).toEqual([
			{ ...noteItems[0], type: "tfng" },
			{ ...noteItems[1], type: "tfng" },
			{ ...noteItems[2], type: "tfng" },
			{ ...noteItems[3], type: "tfng" },
			noteItems[4],
		]);
	});

	it("shows no warning once questions already carry a type", () => {
		const { queryAllByRole } = renderNote({
			items: noteItems.map((item, index) =>
				index < 4 ? { ...item, type: "tfng" } : item,
			),
		});
		expect(queryAllByRole("group", { name: /Gợi ý dạng bài/ })).toHaveLength(0);
	});

	it("shows no warning or button when the part catalog lacks the inferred type", () => {
		// Listening s1 catalog không có tfng/ynng; type `form` thì có suy luận.
		const { queryAllByRole, queryByRole } = renderNote({
			typeId: "form",
			skill: "listening",
			partId: "s1",
		});
		expect(queryAllByRole("group", { name: /Gợi ý dạng bài/ })).toHaveLength(0);
		expect(queryByRole("button", { name: /Đặt dạng/ })).toBeNull();
	});

	it("places the warning before the row fieldset so Enter on the button cannot add a question", () => {
		const onAddQuestion = vi.fn();
		const { getByRole, container } = renderNote({ onAddQuestion });
		const button = getByRole("button", {
			name: "Đặt dạng True / False / Not Given cho câu 1–4",
		});
		// Handler Enter nằm trên fieldset của hàng (data-qindex); nút không được lồng trong đó.
		expect(button.closest("fieldset[data-qindex]")).toBeNull();
		const firstRow = container.querySelector('fieldset[data-qindex="0"]');
		expect(
			button.compareDocumentPosition(firstRow as Node) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		fireEvent.keyDown(button, { key: "Enter" });
		fireEvent.keyDown(button, { key: " " });
		expect(onAddQuestion).not.toHaveBeenCalled();
	});
});

describe("AnswerKeyGrid — qStartOverride + showExplanation (#424 Task 1.1)", () => {
	it("đánh số theo override: fieldset, nút xóa và nhãn giải thích", () => {
		const html = renderGrid({
			qStartOverride: 4,
			showExplanation: true,
			items: tfngItems(2),
		});
		expect(html).toContain('aria-label="Câu 4"');
		expect(html).toContain('aria-label="Câu 5"');
		expect(html).toContain('aria-label="Xóa câu 4"');
		expect(html).toContain('aria-label="Xóa câu 5"');
		expect(html).toContain("Giải thích câu 4");
		expect(html).toContain("Giải thích câu 5");
		expect(html).not.toContain('aria-label="Câu 1"');
	});

	it("không truyền qStartOverride → số câu theo part như cũ", () => {
		const html = renderGrid({ items: tfngItems(1) });
		expect(html).toContain('aria-label="Câu 1"');
	});

	it("không truyền showExplanation → không có ô giải thích", () => {
		expect(renderGrid({ items: tfngItems(1) })).not.toContain("Giải thích câu");
	});
});

describe("AnswerKeyGrid — hàng thu gọn (#424 Task 1.6)", () => {
	const sentItems = [
		{ stem: "Câu đầu", answer: "", opts: null, alts: "" },
		{ stem: "Câu hai đã có đáp án", answer: "TRUE", opts: null, alts: "" },
	];

	it("openRow=null: chip tóm tắt, KHÔNG fieldset/ô nhập trong DOM", () => {
		const html = renderGrid({
			typeId: "sent",
			collapsible: true,
			openRow: null,
			items: sentItems,
		});
		expect(html).toContain("Câu 1");
		expect(html).toContain("Thiếu đáp án");
		expect(html).toContain("Có đáp án");
		expect(html).not.toContain('aria-label="Đáp án chấm tự động"');
		// Thân hàng thu gọn bị unmount — không có fieldset hàng nào.
		expect(html).not.toContain("data-qindex");
	});

	it("openRow=0: hàng đầu mở đủ ô nhập, hàng hai vẫn thu gọn", () => {
		const html = renderGrid({
			typeId: "sent",
			collapsible: true,
			openRow: 0,
			items: sentItems,
		});
		expect(html).toContain('data-qindex="0"');
		expect(html).not.toContain('data-qindex="1"');
		expect(html).toContain('aria-label="Đáp án chấm tự động"');
		// Hàng mở có viền nhấn.
		expect(html).toContain("ring-2");
	});

	it("hàng có id theo rowIdPrefix", () => {
		const html = renderGrid({
			typeId: "sent",
			collapsible: true,
			rowIdPrefix: "grp-1",
			items: sentItems,
		});
		expect(html).toContain('id="grp-1-q0"');
		expect(html).toContain('id="grp-1-q1"');
	});

	it("collapsible vắng mặt → render phẳng như cũ (nút Xóa text giữ nguyên)", () => {
		const html = renderGrid({ typeId: "sent", items: sentItems });
		expect(html).toContain('data-qindex="0"');
		expect(html).toContain('aria-label="Xóa câu 1"');
		expect(html).not.toContain("Thiếu đáp án");
	});
});

describe("AnswerKeyGrid — move/remove hàng đang mở (#424 Task 1.6)", () => {
	/** Render có state ngoài để mô phỏng caller giữ items + openRow. */
	function renderInteractive(
		initialItems: QuestionItem[],
		initialOpen: number | null,
	) {
		const state = { items: initialItems, openRow: initialOpen };
		const onItemsChange = vi.fn((next: QuestionItem[]) => {
			state.items = next;
		});
		const onOpenRowChange = vi.fn((next: number | null) => {
			state.openRow = next;
		});
		const view = () => (
			<AnswerKeyGrid
				typeId="sent"
				skill="reading"
				partId="p1"
				items={state.items}
				showErrors={false}
				onItemsChange={onItemsChange}
				onAddQuestion={() => false}
				collapsible
				openRow={state.openRow}
				onOpenRowChange={onOpenRowChange}
			/>
		);
		const utils = render(view());
		return {
			...utils,
			state,
			onItemsChange,
			onOpenRowChange,
			sync: () => utils.rerender(view()),
		};
	}

	it("move hàng đang mở: dữ liệu đổi, blurred remap, openRow dời, lỗi dán đúng hàng", () => {
		const { container, state, sync } = renderInteractive(
			[
				{ stem: "", answer: "", opts: null, alts: "" },
				{ stem: "Filled", answer: "ans", opts: null, alts: "" },
			],
			0,
		);
		// Blur hàng 0 đang mở để lộ lỗi thiếu stem/answer.
		fireEvent.focusOut(container.querySelector('fieldset[data-qindex="0"]')!);
		sync();
		expect(container.textContent).toContain("Nhập nội dung câu hỏi.");
		fireEvent.click(
			container.querySelector('button[aria-label="Đưa câu 1 xuống"]')!,
		);
		expect(state.items.map((item) => item.stem)).toEqual(["Filled", ""]);
		expect(state.openRow).toBe(1);
		sync();
		const rows = container.querySelectorAll("fieldset[data-qindex]");
		expect(rows).toHaveLength(1);
		expect(rows[0].getAttribute("data-qindex")).toBe("1");
		// Lỗi đang hiện đi theo hàng thiếu dữ liệu (giờ là index 1 · Câu 2).
		expect(rows[0].textContent).toContain("Nhập nội dung câu hỏi.");
		// Hàng thu gọn Câu 1 giữ nội dung "Filled" + chip Có đáp án.
		const collapsed = container.querySelector("#p1-q0");
		expect(collapsed?.textContent).toContain("Filled");
		expect(collapsed?.textContent).toContain("Có đáp án");
	});

	it("remove hàng đang mở: openRow đóng, không còn lỗi treo", () => {
		const { container, state, sync } = renderInteractive(
			[
				{ stem: "", answer: "", opts: null, alts: "" },
				{ stem: "Filled", answer: "ans", opts: null, alts: "" },
			],
			0,
		);
		fireEvent.focusOut(container.querySelector('fieldset[data-qindex="0"]')!);
		sync();
		expect(container.textContent).toContain("Nhập nội dung câu hỏi.");
		fireEvent.click(container.querySelector('button[aria-label="Xóa câu 1"]')!);
		expect(state.items.map((item) => item.stem)).toEqual(["Filled"]);
		expect(state.openRow).toBeNull();
		sync();
		expect(container.querySelectorAll("fieldset[data-qindex]")).toHaveLength(0);
		expect(container.querySelector("#p1-q0")?.textContent).toContain(
			"Có đáp án",
		);
		expect(container.textContent).not.toContain("Nhập nội dung câu hỏi.");
	});

	it("hàng có lỗi đang hiện bị ép mở (ẩn nút thu gọn); hết lỗi thu gọn được và blur được clear", () => {
		const { container, sync } = renderInteractive(
			[{ stem: "", answer: "", opts: null, alts: "" }],
			null,
		);
		fireEvent.click(container.querySelector('button[aria-label="Mở câu 1"]')!);
		sync();
		fireEvent.focusOut(container.querySelector('fieldset[data-qindex="0"]')!);
		sync();
		expect(container.textContent).toContain("Nhập nội dung câu hỏi.");
		// Force-open: nút thu gọn của hàng lỗi ẩn đi.
		expect(
			container.querySelector('button[aria-label="Thu gọn câu 1"]'),
		).toBeNull();
		fireEvent.change(
			container.querySelector(
				'input[aria-label="Nội dung câu hỏi phía học viên"]',
			)!,
			{ target: { value: "Stem" } },
		);
		sync();
		fireEvent.change(
			container.querySelector('input[aria-label="Đáp án chấm tự động"]')!,
			{ target: { value: "A" } },
		);
		sync();
		expect(container.textContent).not.toContain("Nhập nội dung câu hỏi.");
		fireEvent.click(
			container.querySelector('button[aria-label="Thu gọn câu 1"]')!,
		);
		sync();
		expect(container.querySelectorAll("fieldset[data-qindex]")).toHaveLength(0);
		// Collapse đã clear blur: mở lại không lộ lỗi cũ.
		fireEvent.click(container.querySelector('button[aria-label="Mở câu 1"]')!);
		sync();
		expect(container.textContent).not.toContain("Nhập nội dung câu hỏi.");
	});
});
