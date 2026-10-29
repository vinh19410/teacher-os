// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CardTabs, nextTabIndex } from "./card-tabs";

const tabs = [
	{ id: "intro", label: "Hướng dẫn" },
	{ id: "settings", label: "Thiết lập" },
	{ id: "questions", label: "Câu hỏi", count: 5 },
];

describe("nextTabIndex", () => {
	it("mũi tên phải wrap vòng về tab đầu", () => {
		expect(nextTabIndex(3, 2, 1)).toBe(0);
		expect(nextTabIndex(3, 0, 1)).toBe(1);
	});

	it("mũi tên trái wrap vòng về tab cuối", () => {
		expect(nextTabIndex(3, 0, -1)).toBe(2);
	});

	it("Home/End về đầu/cuối", () => {
		expect(nextTabIndex(3, 2, "first")).toBe(0);
		expect(nextTabIndex(3, 0, "last")).toBe(2);
	});

	it("không có tab → -1", () => {
		expect(nextTabIndex(0, 0, 1)).toBe(-1);
	});
});

describe("CardTabs (render tĩnh)", () => {
	it("role=tablist/tab, aria-selected, id theo idPrefix, aria-controls", () => {
		const html = renderToStaticMarkup(
			<CardTabs
				tabs={tabs}
				active="settings"
				onSelect={vi.fn()}
				idPrefix="grp-1"
			/>,
		);
		expect(html).toContain('role="tablist"');
		expect(html).toContain('id="grp-1-tab-settings"');
		expect(html).toContain('aria-selected="true"');
		expect(html).toContain('aria-controls="grp-1-panel-questions"');
	});

	it("badge đếm aria-hidden — không vào accessible name của tab", () => {
		const html = renderToStaticMarkup(
			<CardTabs
				tabs={tabs}
				active="intro"
				onSelect={vi.fn()}
				idPrefix="grp-1"
			/>,
		);
		const questionsTab = html
			.split('id="grp-1-tab-questions"')[1]
			?.split("</button>")[0];
		expect(questionsTab).toContain("Câu hỏi");
		expect(questionsTab).toContain('aria-hidden="true"');
		expect(questionsTab).toContain(">5</span>");
	});

	it("tab có lỗi hiện chấm destructive + sr-only, không trên tab đang mở", () => {
		const html = renderToStaticMarkup(
			<CardTabs
				tabs={[
					{ id: "a", label: "A" },
					{ id: "b", label: "B", hasError: true },
					{ id: "c", label: "C", hasError: true },
				]}
				active="c"
				onSelect={vi.fn()}
				idPrefix="t"
			/>,
		);
		const tabB = html.split('id="t-tab-b"')[1]?.split("</button>")[0];
		expect(tabB).toContain("bg-destructive");
		expect(tabB).toContain("sr-only");
		// Tab đang mở (c) không lặp chấm lỗi.
		const tabC = html.split('id="t-tab-c"')[1]?.split("</button>")[0];
		expect(tabC).not.toContain("bg-destructive");
	});
});
