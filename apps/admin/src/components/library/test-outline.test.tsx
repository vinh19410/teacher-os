// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TestOutline } from "./test-outline";

const sections = [
	{
		part: "p1",
		label: "Passage 1",
		qStart: 1,
		state: "saved" as const,
		groupCount: 1,
		questionCount: 3,
		groups: [
			{
				index: 0,
				label: "Nhóm câu 1",
				typeLabel: "Đúng/Sai/Không nhắc",
				questions: [
					{ number: 1, offset: 0, hasAnswer: true },
					{ number: 2, offset: 1, hasAnswer: false },
					{ number: 3, offset: 2, hasAnswer: true },
				],
			},
		],
	},
	{
		part: "p2",
		label: "Passage 2",
		qStart: 4,
		state: "empty" as const,
		groupCount: 0,
		questionCount: 0,
		groups: [],
	},
	{
		part: "p3",
		label: "Passage 3",
		qStart: 4,
		state: "dirty" as const,
		groupCount: 2,
		questionCount: 5,
		groups: [
			{
				index: 0,
				label: "Nhóm câu 1",
				typeLabel: "Đúng/Sai/Không nhắc",
				questions: [
					{ number: 4, offset: 0, hasAnswer: true },
					{ number: 5, offset: 1, hasAnswer: true },
				],
			},
			{
				index: 1,
				label: "Nhóm câu 2",
				typeLabel: "Điền từ",
				questions: [
					{ number: 6, offset: 0, hasAnswer: true },
					{ number: 7, offset: 1, hasAnswer: false },
					{ number: 8, offset: 2, hasAnswer: true },
				],
			},
		],
	},
];

const render = (active: Parameters<typeof TestOutline>[0]["active"]) =>
	renderToStaticMarkup(
		<TestOutline
			sections={sections}
			active={active}
			onSelect={vi.fn()}
			collapsed={false}
			onCollapsedChange={vi.fn()}
		/>,
	);

describe("TestOutline (render tĩnh)", () => {
	it("nav Mục lục đề + nút thu gọn có aria-expanded", () => {
		const html = render(null);
		expect(html).toContain('aria-label="Mục lục đề"');
		expect(html).toContain("Thu gọn mục lục");
		expect(html).toContain('aria-expanded="true"');
	});

	it("đủ slot part; nút part tên đúng nhãn slot; phụ đề aria-hidden ngoài button", () => {
		const html = render(null);
		expect(html).toContain(">Passage 1</button>");
		expect(html).toContain(">Passage 2</button>");
		expect(html).toContain(">Passage 3</button>");
		// Phụ đề đếm nằm ngoài button, aria-hidden.
		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain("1 nhóm · 3 câu");
		expect(html).toContain(">Trống</span>");
	});

	it("part dirty có chấm warn + sr-only chưa lưu; part đang chọn aria-current", () => {
		const html = render({ part: "p1" });
		expect(html).toContain("bg-amber-500");
		expect(html).toContain("chưa lưu");
	});

	it("part đang mở liệt kê nhóm; nhóm đang chọn hiện câu; câu thiếu đáp án có chấm", () => {
		const html = render({ part: "p1", group: 0 });
		expect(html).toContain(">Nhóm câu 1</button>");
		expect(html).toContain("Đúng/Sai/Không nhắc");
		expect(html).toContain(">Câu 1</button>");
		expect(html).toContain("Câu 2<");
		// Câu 2 thiếu đáp án → chấm warn aria-hidden trong hàng câu.
		expect(html).toContain('aria-current="true"');
	});

	it("part không mở không liệt kê nhóm", () => {
		const html = render({ part: "p1" });
		// p3 (không mở) có 2 nhóm nhưng không render nút nhóm.
		const count = html.split("Nhóm câu").length - 1;
		expect(count).toBe(1);
	});

	it("kongming F1: part đang mở hiện câu của MỌI nhóm (kể cả khi chưa chọn nhóm)", () => {
		// Sau reload activePosition = {null, null} — cây vẫn phải liệt kê
		// đủ câu của mọi nhóm thuộc part đang mở (spec Task 3.2 bước 5).
		const html = render({ part: "p3" });
		for (const n of [4, 5, 6, 7, 8]) {
			// Câu thiếu đáp án có chấm warn span trong button → assert `>Câu n<`.
			expect(html).toContain(`>Câu ${n}<`);
		}
		// Chưa chọn nhóm/câu nào → không có question nào mang aria-current.
		const questionButtons = html.split(">Câu ").slice(1);
		for (const fragment of questionButtons) {
			expect(fragment).not.toContain('aria-current="true"');
		}
	});

	it("kongming F1: aria-current câu chỉ khi khớp cả nhóm lẫn câu", () => {
		const html = render({ part: "p3", group: 1, question: 0 });
		expect(html).toContain('aria-current="true"');
		// "Câu 6" (nhóm 2, offset 0) là nút duy nhất được tô.
		const marked = html.match(/aria-current="true"[^>]*>[^<]*Câu \d+/g) ?? [];
		expect(marked.filter((m) => m.includes("Câu 6"))).toHaveLength(1);
		expect(marked.filter((m) => m.includes("Câu 4"))).toHaveLength(0);
	});
});
