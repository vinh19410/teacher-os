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
	normalizePlacementErrorsForSkill,
	overlappingErrorNumber,
	PLACEMENT_ERROR_STYLES,
	placementErrorCategoryOptionsForSkill,
	placementErrorLabel,
	placementErrorStyle,
	resolvePlacementErrorCategory,
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
			err("b", "buyed", { category: "lexical" }),
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

describe("skill-specific IELTS error categories & styles", () => {
	it("returns exact 4 English IELTS categories per skill", () => {
		expect(placementErrorCategoryOptionsForSkill("writing")).toEqual([
			{ key: "task", label: "Task Response" },
			{ key: "coherence", label: "Coherence & Cohesion" },
			{ key: "lexical", label: "Lexical Resource" },
			{ key: "grammar", label: "Grammatical Range & Accuracy" },
		]);
		expect(placementErrorCategoryOptionsForSkill("speaking")).toEqual([
			{ key: "fluency", label: "Fluency & Coherence" },
			{ key: "lexical", label: "Lexical Resource" },
			{ key: "grammar", label: "Grammatical Range & Accuracy" },
			{ key: "pronunciation", label: "Pronunciation" },
		]);
	});

	it("maps every IELTS category to synced --class-* highlight, border, dot, and slider accent tokens", () => {
		expect(PLACEMENT_ERROR_STYLES.task).toMatchObject({
			label: "Task Response",
			dotCls: "bg-class-3",
			borderLeftCls: "border-l-4 border-l-class-3",
			sliderAccentCls: "accent-class-3",
		});
		expect(PLACEMENT_ERROR_STYLES.coherence).toMatchObject({
			label: "Coherence & Cohesion",
			dotCls: "bg-class-4",
			borderLeftCls: "border-l-4 border-l-class-4",
			sliderAccentCls: "accent-class-4",
		});
		expect(PLACEMENT_ERROR_STYLES.fluency).toMatchObject({
			label: "Fluency & Coherence",
			dotCls: "bg-class-4",
			borderLeftCls: "border-l-4 border-l-class-4",
			sliderAccentCls: "accent-class-4",
		});
		expect(PLACEMENT_ERROR_STYLES.lexical).toMatchObject({
			label: "Lexical Resource",
			dotCls: "bg-class-1",
			borderLeftCls: "border-l-4 border-l-class-1",
			sliderAccentCls: "accent-class-1",
		});
		expect(PLACEMENT_ERROR_STYLES.grammar).toMatchObject({
			label: "Grammatical Range & Accuracy",
			dotCls: "bg-class-5",
			borderLeftCls: "border-l-4 border-l-class-5",
			sliderAccentCls: "accent-class-5",
		});
		expect(PLACEMENT_ERROR_STYLES.pronunciation).toMatchObject({
			label: "Pronunciation",
			dotCls: "bg-class-2",
			borderLeftCls: "border-l-4 border-l-class-2",
			sliderAccentCls: "accent-class-2",
		});
	});

	it("normalizes legacy and cross-skill categories defensively with grammar fallback", () => {
		expect(resolvePlacementErrorCategory("vocabulary", "writing")).toBe(
			"lexical",
		);
		expect(resolvePlacementErrorCategory("spelling", "writing")).toBe(
			"lexical",
		);
		expect(resolvePlacementErrorCategory("pronunciation", "writing")).toBe(
			"lexical",
		);
		expect(resolvePlacementErrorCategory("fluency", "writing")).toBe(
			"coherence",
		);
		expect(resolvePlacementErrorCategory("task", "speaking")).toBe("fluency");
		expect(resolvePlacementErrorCategory("coherence", "speaking")).toBe(
			"fluency",
		);
		expect(resolvePlacementErrorCategory("unknown-key", "speaking")).toBe(
			"grammar",
		);

		expect(placementErrorStyle("spelling", "writing")).toBe(
			PLACEMENT_ERROR_STYLES.lexical,
		);
		expect(placementErrorLabel("task", "speaking")).toBe("Fluency & Coherence");
		expect(placementErrorLabel("pronunciation")).toBe("Pronunciation");

		const normalized = normalizePlacementErrorsForSkill(
			[
				err("1", "goes", {
					category: "spelling" as unknown as PlacementError["category"],
				}),
				err("2", "book", { category: "pronunciation" }),
			],
			"writing",
		);
		expect(normalized.map((item) => item.category)).toEqual([
			"lexical",
			"lexical",
		]);
	});
});
