import { countWords } from "@teacher-os/api/lib/word-count";
import { describe, expect, it } from "vitest";

describe("countWords — quy ước IELTS cho footer Writing (#304)", () => {
	it("chuỗi rỗng hoặc toàn whitespace → 0", () => {
		expect(countWords("")).toBe(0);
		expect(countWords("   ")).toBe(0);
		expect(countWords("\n\t \n")).toBe(0);
	});

	it("nhiều khoảng trắng/xuống dòng/tab liên tiếp vẫn tách đúng", () => {
		expect(countWords("The   graph\nshows\t\ta trend")).toBe(5);
		expect(countWords("  leading and trailing  ")).toBe(3);
	});

	it("từ gạch nối và số tính là 1 từ", () => {
		expect(countWords("a well-known fact")).toBe(3);
		expect(countWords("In 1960 the figure was 40 per cent")).toBe(8);
	});

	it("tiếng Việt có dấu đếm đúng", () => {
		expect(countWords("Biểu đồ cho thấy số lượng người kết hôn")).toBe(9);
	});
});
