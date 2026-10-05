import { describe, expect, test } from "vitest";
import { countWords } from "./word-count";

describe("countWords — quy ước IELTS (#304, scenario I7)", () => {
	test("chuỗi rỗng / toàn whitespace → 0", () => {
		expect(countWords("")).toBe(0);
		expect(countWords("   \n\t  ")).toBe(0);
	});

	test("từ có gạch nối và số tính là 1 từ", () => {
		expect(countWords("well-known")).toBe(1);
		expect(countWords("In 1960, the rate rose.")).toBe(5);
	});

	test("tách theo mọi whitespace: tab, xuống dòng, khoảng trắng kép", () => {
		expect(countWords("one\ttwo\nthree  four")).toBe(4);
	});

	test("emoji và CJK đếm theo chunk phân tách whitespace", () => {
		// Pin hành vi: emoji không có space → dính vào từ kế bên (1 chunk).
		expect(countWords("great 😀 job")).toBe(3);
		expect(countWords("great😀job")).toBe(1);
		// CJK không có khoảng trắng giữa các chữ → cả cụm là 1 "từ".
		expect(countWords("書くのが好きです")).toBe(1);
	});

	test("tiếng Việt có dấu đếm đúng số từ", () => {
		expect(countWords("The graph shows dữ liệu from 1960.")).toBe(7);
	});
});
