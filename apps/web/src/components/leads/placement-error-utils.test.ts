// @vitest-environment jsdom
import {
	locatePlacementErrors,
	PLACEMENT_ERROR_QUOTE_MAX,
	type PlacementError,
} from "@teacher-os/api/placement-test-contracts";
import { describe, expect, it } from "vitest";
import {
	buildHighlightSegments,
	circledNumber,
	domPointToOffset,
	newPlacementErrorId,
	overlappingErrorNumber,
	trimTextSpan,
	validatePlacementErrorDraft,
} from "./placement-error-utils";

const TEXT = "I goes to school yesterday and I buyed a book.";

function err(
	id: string,
	quote: string,
	overrides: Partial<PlacementError> = {},
): PlacementError {
	return {
		id,
		category: "grammar",
		quote,
		start: null,
		end: null,
		correction: "",
		explanation: "",
		...overrides,
	};
}

describe("buildHighlightSegments", () => {
	it("chia văn bản thành đoạn thường + đoạn lỗi theo offset, đánh số theo thứ tự đã định vị", () => {
		const located = locatePlacementErrors(TEXT, [
			err("b", "buyed", { category: "spelling" }),
			err("a", "goes"),
			err("x", "không có trong bài"),
		]);
		const segs = buildHighlightSegments(TEXT, located);
		expect(segs.map((s) => s.text).join("")).toBe(TEXT);
		const errorSegs = segs.filter((s) => s.kind === "error");
		expect(errorSegs.map((s) => [s.text, s.number])).toEqual([
			["goes", 1],
			["buyed", 2],
		]);
		expect(segs[0]).toEqual({ kind: "text", start: 0, text: "I " });
	});

	it("bỏ qua lỗi offset lệch/chồng lấn mà không làm hỏng văn bản", () => {
		const segs = buildHighlightSegments("abcdef", [
			err("1", "bc", { start: 1, end: 3 }),
			err("2", "c", { start: 2, end: 3 }),
			err("3", "zz", { start: 4, end: 99 }),
		]);
		expect(segs.map((s) => s.text).join("")).toBe("abcdef");
		expect(segs.filter((s) => s.kind === "error")).toHaveLength(1);
	});
});

describe("domPointToOffset", () => {
	function renderSegments() {
		const container = document.createElement("div");
		// "I " + [goes]① + " to school"
		container.innerHTML =
			'<span data-start="0">I </span><span><span data-start="2">goes</span><sup data-at="6">①</sup></span><span data-start="6"> to school</span>';
		document.body.appendChild(container);
		return container;
	}

	it("tính offset theo văn bản nguồn, không tính ký tự badge", () => {
		const c = renderSegments();
		const text = "I goes to school";
		const goesText = c.querySelector('[data-start="2"]')?.firstChild as Node;
		const tailText = c.querySelector('[data-start="6"]')?.firstChild as Node;
		const badgeText = c.querySelector("sup")?.firstChild as Node;
		expect(domPointToOffset(c, text.length, goesText, 1)).toBe(3);
		expect(domPointToOffset(c, text.length, tailText, 3)).toBe(9);
		expect(domPointToOffset(c, text.length, badgeText, 1)).toBe(6);
		// Điểm giữa các con của container: đầu đoạn kế tiếp / cuối văn bản.
		expect(domPointToOffset(c, text.length, c, 1)).toBe(2);
		expect(domPointToOffset(c, text.length, c, 3)).toBe(text.length);
		c.remove();
	});

	it("trả về null khi điểm nằm ngoài container", () => {
		const c = renderSegments();
		const outside = document.createTextNode("x");
		expect(domPointToOffset(c, 10, outside, 0)).toBeNull();
		c.remove();
	});
});

describe("trimTextSpan / overlappingErrorNumber / validate", () => {
	it("bỏ khoảng trắng hai đầu và trả quote đúng văn bản nguồn", () => {
		expect(trimTextSpan(TEXT, 1, 7)).toEqual({
			start: 2,
			end: 6,
			quote: "goes",
		});
		expect(trimTextSpan(TEXT, 8, 1)).toEqual({
			start: 2,
			end: 8,
			quote: "goes t",
		});
		expect(trimTextSpan("a   b", 1, 4)).toBeNull();
	});

	it("phát hiện chồng lấn với lỗi đã định vị", () => {
		const located = locatePlacementErrors(TEXT, [err("a", "goes")]);
		expect(overlappingErrorNumber(located, 3, 5)).toBe(1);
		expect(overlappingErrorNumber(located, 7, 10)).toBeNull();
	});

	it("validate theo giới hạn contract", () => {
		const base = {
			category: "grammar" as const,
			quote: "goes",
			correction: "went",
			explanation: "",
		};
		expect(validatePlacementErrorDraft(base)).toBeNull();
		expect(validatePlacementErrorDraft({ ...base, quote: "  " })).toMatch(
			/không được để trống/,
		);
		expect(
			validatePlacementErrorDraft({
				...base,
				quote: "x".repeat(PLACEMENT_ERROR_QUOTE_MAX + 1),
			}),
		).toMatch(/tối đa/);
	});

	it("id mới ≤ 40 ký tự và số thứ tự kiểu ①", () => {
		expect(newPlacementErrorId().length).toBeLessThanOrEqual(40);
		expect(circledNumber(1)).toBe("①");
		expect(circledNumber(20)).toBe("⑳");
		expect(circledNumber(21)).toBe("(21)");
	});
});
