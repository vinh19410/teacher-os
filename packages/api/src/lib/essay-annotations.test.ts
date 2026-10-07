import { describe, expect, it } from "vitest";
import type { EssayAnnotation } from "../contracts";
import {
	isValidAnnotationSpan,
	orderedAnnotations,
	overlapsAny,
	segmentEssay,
	snapSpanToWords,
} from "./essay-annotations";

const ESSAY = "the environment is our shared responsibility";

function annotation(
	id: string,
	start: number,
	end: number,
	note = "",
): EssayAnnotation {
	return { id, start, end, note };
}

describe("isValidAnnotationSpan", () => {
	it("chấp nhận biên hợp lệ đầu/cuối essay", () => {
		expect(isValidAnnotationSpan("abc", 0, 3)).toBe(true);
		expect(isValidAnnotationSpan("abc def", 4, 7)).toBe(true);
	});

	it("từ chối start === end hoặc end <= start", () => {
		expect(isValidAnnotationSpan("abc", 1, 1)).toBe(false);
		expect(isValidAnnotationSpan("abc", 2, 1)).toBe(false);
	});

	it("từ chối end vượt độ dài essay hoặc số âm", () => {
		expect(isValidAnnotationSpan("abc", 0, 4)).toBe(false);
		expect(isValidAnnotationSpan("abc", -1, 2)).toBe(false);
		expect(isValidAnnotationSpan("abc", 0, -1)).toBe(false);
	});

	it("từ chối số lẻ", () => {
		expect(isValidAnnotationSpan("abc", 0.5, 2)).toBe(false);
		expect(isValidAnnotationSpan("abc", 0, 1.5)).toBe(false);
	});

	it("từ chối đoạn toàn khoảng trắng", () => {
		expect(isValidAnnotationSpan("a  \nb", 1, 4)).toBe(false);
	});

	it("từ chối đoạn dài hơn QUIZ_ANNOTATION_SPAN_MAX", () => {
		expect(isValidAnnotationSpan("x".repeat(1001), 0, 1001)).toBe(false);
		expect(isValidAnnotationSpan("x".repeat(1000), 0, 1000)).toBe(true);
	});
});

describe("overlapsAny", () => {
	const spans = [annotation("a", 5, 10), annotation("b", 20, 25)];

	it("phát hiện chồng một phần trái/phải, nằm trong, bao ngoài", () => {
		expect(overlapsAny(spans, 8, 12)).toBe(true);
		expect(overlapsAny(spans, 3, 7)).toBe(true);
		expect(overlapsAny(spans, 6, 9)).toBe(true);
		expect(overlapsAny(spans, 0, 30)).toBe(true);
	});

	it("chạm biên không tính là chồng", () => {
		expect(overlapsAny(spans, 0, 5)).toBe(false);
		expect(overlapsAny(spans, 10, 12)).toBe(false);
		expect(overlapsAny(spans, 25, 30)).toBe(false);
	});

	it("bỏ qua span có id = ignoreId", () => {
		expect(overlapsAny(spans, 6, 9, "a")).toBe(false);
		expect(overlapsAny(spans, 6, 9, "b")).toBe(true);
	});

	it("danh sách rỗng không chồng", () => {
		expect(overlapsAny([], 0, 100)).toBe(false);
	});
});

describe("snapSpanToWords", () => {
	it("bắt dính giữa từ ra cả từ", () => {
		expect(snapSpanToWords("the environment is", 6, 10)).toEqual({
			start: 4,
			end: 15,
		});
	});

	it("cắt khoảng trắng và bắt dính sang từ kề", () => {
		expect(snapSpanToWords("the environment is", 3, 5)).toEqual({
			start: 4,
			end: 15,
		});
	});

	it("nhiều từ: giữa hai từ bắt dính thành 2 từ liền", () => {
		expect(snapSpanToWords("a bb ccc dddd", 3, 6)).toEqual({
			start: 2,
			end: 8,
		});
	});

	it("từ có dấu tiếng Việt và apostrophe", () => {
		const essay = "nói không phải don’t worry";
		expect(snapSpanToWords(essay, 1, 2)).toEqual({ start: 0, end: 3 });
		const dIdx = essay.indexOf("don’t");
		expect(snapSpanToWords(essay, dIdx + 1, dIdx + 3)).toEqual({
			start: dIdx,
			end: dIdx + 5,
		});
	});

	it("chỉ khoảng trắng → null", () => {
		expect(snapSpanToWords("a   b", 1, 4)).toBeNull();
	});

	it("ở đầu và cuối essay", () => {
		expect(snapSpanToWords("hello world", 0, 2)).toEqual({
			start: 0,
			end: 5,
		});
		expect(snapSpanToWords("hello world", 8, 11)).toEqual({
			start: 6,
			end: 11,
		});
	});
});

describe("segmentEssay", () => {
	it("không annotation → 1 đoạn bình thường", () => {
		const segs = segmentEssay(ESSAY, []);
		expect(segs).toHaveLength(1);
		expect(segs[0]).toMatchObject({
			start: 0,
			end: ESSAY.length,
			text: ESSAY,
			annotation: null,
			n: null,
		});
	});

	it("sắp annotation không theo thứ tự, n đánh theo thứ tự xuất hiện", () => {
		const segs = segmentEssay(ESSAY, [
			annotation("b", 20, 25, "hai"),
			annotation("a", 4, 15, "một"),
		]);
		const marks = segs.filter((s) => s.annotation);
		expect(marks.map((s) => s.n)).toEqual([1, 2]);
		expect(marks[0]?.annotation?.id).toBe("a");
		expect(marks[1]?.annotation?.id).toBe("b");
		expect(segs.map((s) => s.text).join("")).toBe(ESSAY);
	});

	it("annotation chồng → bỏ cái sau", () => {
		const segs = segmentEssay(ESSAY, [
			annotation("a", 4, 15),
			annotation("dup", 10, 20),
		]);
		const marks = segs.filter((s) => s.annotation);
		expect(marks).toHaveLength(1);
		expect(marks[0]?.annotation?.id).toBe("a");
		expect(segs.map((s) => s.text).join("")).toBe(ESSAY);
	});

	it("annotation sai biên → bỏ", () => {
		const segs = segmentEssay(ESSAY, [
			annotation("bad", -2, 5),
			annotation("ok", 4, 15),
		]);
		const marks = segs.filter((s) => s.annotation);
		expect(marks.map((s) => s.annotation?.id)).toEqual(["ok"]);
	});

	it("essay nhiều dòng, join vẫn bằng essay gốc", () => {
		const essay = "Line one.\nSecond line here.";
		const segs = segmentEssay(essay, [annotation("x", 0, 9, "câu 1")]);
		expect(segs.map((s) => s.text).join("")).toBe(essay);
		expect(segs.find((s) => s.annotation)?.annotation?.note).toBe("câu 1");
	});
});

describe("orderedAnnotations", () => {
	it("trả annotation theo thứ tự start kèm n khớp segmentEssay", () => {
		const list = orderedAnnotations(ESSAY, [
			annotation("b", 20, 25, "hai"),
			annotation("a", 4, 15, "một"),
		]);
		expect(list.map((a) => a.annotation.id)).toEqual(["a", "b"]);
		expect(list.map((a) => a.n)).toEqual([1, 2]);
	});

	it("bỏ annotation chồng/sai biên như segmentEssay", () => {
		const list = orderedAnnotations(ESSAY, [
			annotation("bad", 200, 300),
			annotation("ok", 4, 15),
		]);
		expect(list).toHaveLength(1);
		expect(list[0]?.annotation.id).toBe("ok");
	});
});
