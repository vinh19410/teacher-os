// @vitest-environment jsdom

import type { EssayAnnotation } from "@teacher-os/api/contracts";
import { EssayWithHighlights } from "@teacher-os/ui/components/quiz/essay-with-highlights";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

const ESSAY = "The environment matters to everyone.";

function annotation(
	id: string,
	start: number,
	end: number,
	note = "",
): EssayAnnotation {
	return { id, start, end, note };
}

describe("EssayWithHighlights (#332)", () => {
	it("render mark đánh số theo thứ tự xuất hiện và không thêm text lạ", () => {
		const { container } = render(
			<EssayWithHighlights
				essay={ESSAY}
				annotations={[annotation("b", 27, 35, "sau"), annotation("a", 4, 15)]}
			/>,
		);
		const marks = [...container.querySelectorAll("mark")];
		expect(marks).toHaveLength(2);
		expect(marks.map((m) => m.dataset.n)).toEqual(["1", "2"]);
		expect(marks[0]?.textContent).toBe("environment");
		expect(marks[1]?.textContent).toBe("everyone");
		// Pseudo-element không lọt DOM text — textContent khớp essay gốc.
		expect(container.textContent).toBe(ESSAY);
	});

	it("essay chứa thẻ script render dạng text, không execute", () => {
		const essay = "<script>alert(1)</script> plain";
		const { container } = render(
			<EssayWithHighlights essay={essay} annotations={[]} />,
		);
		expect(container.querySelector("script")).toBeNull();
		expect(container.textContent).toBe(essay);
	});

	it("annotation chồng nhau bị bỏ qua — chỉ 1 mark", () => {
		const { container } = render(
			<EssayWithHighlights
				essay={ESSAY}
				annotations={[annotation("a", 4, 15), annotation("dup", 10, 20)]}
			/>,
		);
		expect(container.querySelectorAll("mark")).toHaveLength(1);
	});

	it("activeId khớp thì mark mang viền mực đen (ring)", () => {
		const { container } = render(
			<EssayWithHighlights
				essay={ESSAY}
				annotations={[annotation("a", 4, 15)]}
				activeId="a"
			/>,
		);
		expect(container.querySelector("mark")?.className).toContain("ring-1");
	});

	it("className từ markProps gộp thêm, không đè mất nền highlight (#332 review)", () => {
		const { container } = render(
			<EssayWithHighlights
				essay={ESSAY}
				annotations={[annotation("a", 4, 15)]}
				markProps={() => ({
					className: "cursor-pointer focus-visible:outline-none",
				})}
			/>,
		);
		const mark = container.querySelector("mark");
		// Redesign phase 6: lỗi bài viết dùng mark.anno (nền cam nhạt + gạch
		// chân cam theo token) thay bg-warn-soft.
		expect(mark?.className).toContain("anno");
		expect(mark?.className).toContain("after:content-[attr(data-n)]");
		expect(mark?.className).toContain("cursor-pointer");
	});
});

describe("EssayWithHighlights inlineNotes (#336)", () => {
	it("mặc định không render ghi chú inline — textContent khớp essay gốc", () => {
		const { container } = render(
			<EssayWithHighlights
				essay={ESSAY}
				annotations={[annotation("a", 4, 15, "Đúng từ.")]}
			/>,
		);
		expect(
			container.querySelector('[data-testid="essay-inline-note"]'),
		).toBeNull();
		expect(container.textContent).toBe(ESSAY);
	});

	it("inlineNotes: ghi chú nằm ngay sau mark có note, mark không note thì không", () => {
		const { container } = render(
			<EssayWithHighlights
				essay={ESSAY}
				annotations={[
					annotation("a", 4, 15, "Đúng từ."),
					annotation("b", 27, 35),
				]}
				inlineNotes
			/>,
		);
		const notes = container.querySelectorAll(
			'[data-testid="essay-inline-note"]',
		);
		expect(notes).toHaveLength(1);
		const markWithNote = container.querySelector(
			'mark[data-annotation-id="a"]',
		);
		expect(markWithNote?.nextElementSibling?.getAttribute("data-testid")).toBe(
			"essay-inline-note",
		);
		const markNoNote = container.querySelector('mark[data-annotation-id="b"]');
		expect(
			markNoNote?.nextElementSibling?.getAttribute("data-testid"),
		).toBeNull();
	});

	it("inlineNotes: ghi chú chỉ toàn khoảng trắng coi như rỗng — không sinh span", () => {
		const { container } = render(
			<EssayWithHighlights
				essay={ESSAY}
				annotations={[annotation("a", 4, 15, "   ")]}
				inlineNotes
			/>,
		);
		expect(
			container.querySelector('[data-testid="essay-inline-note"]'),
		).toBeNull();
	});

	it("span ghi chú có sr-only 'Ghi chú n: ' và text ghi chú", () => {
		const { container } = render(
			<EssayWithHighlights
				essay={ESSAY}
				annotations={[annotation("a", 4, 15, "Đúng từ.")]}
				inlineNotes
			/>,
		);
		const note = container.querySelector('[data-testid="essay-inline-note"]');
		expect(note?.textContent).toContain("Ghi chú 1: ");
		expect(note?.textContent).toContain("Đúng từ.");
		expect(note?.querySelector(".sr-only")).not.toBeNull();
	});

	it("ghi chú chứa HTML render dạng text, không execute", () => {
		const { container } = render(
			<EssayWithHighlights
				essay={ESSAY}
				annotations={[annotation("a", 4, 15, "<b>đậm</b>")]}
				inlineNotes
			/>,
		);
		expect(container.querySelector("b")).toBeNull();
		const note = container.querySelector('[data-testid="essay-inline-note"]');
		expect(note?.textContent).toContain("<b>đậm</b>");
	});
});
