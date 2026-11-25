import { describe, expect, it } from "vitest";
import type { StudentQuizGroup } from "../contracts";
import {
	buildQuizParts,
	buildQuizPartsFromGroups,
	countAnswered,
	isAnsweredValue,
	type QuizPartQuestion,
} from "./quiz-parts";

describe("quiz-parts suite", () => {
	it("isAnsweredValue kiểm tra giá trị đã trả lời", () => {
		expect(isAnsweredValue("")).toBe(false);
		expect(isAnsweredValue("   ")).toBe(false);
		expect(isAnsweredValue(undefined)).toBe(false);
		expect(isAnsweredValue("answer")).toBe(true);
		expect(isAnsweredValue("  a  ")).toBe(true);
	});

	it("countAnswered đếm đúng số câu đã trả lời", () => {
		const questions: QuizPartQuestion[] = [
			{ q: 0, number: 1, stem: "S1", opts: null },
			{ q: 1, number: 2, stem: "S2", opts: null },
			{ q: 2, number: 3, stem: "S3", opts: null },
		];
		expect(countAnswered({}, questions)).toBe(0);
		expect(countAnswered({ 0: "A", 2: "C" }, questions)).toBe(2);
		expect(countAnswered({ 0: " ", 1: "B" }, questions)).toBe(1);
	});

	it("buildQuizParts chia part theo type khi không có groups", () => {
		const questions = [
			{ stem: "Q1", opts: null, pin: null, type: "headings" },
			{ stem: "Q2", opts: null, pin: null, type: "headings" },
			{ stem: "Q3", opts: null, pin: null, type: "summary" },
		];
		const parts = buildQuizParts(questions, "reading");
		expect(parts).toHaveLength(2);
		expect(parts[0]?.typeId).toBe("headings");
		expect(parts[1]?.typeId).toBe("summary");
	});

	it("buildQuizPartsFromGroups giữ nguyên optionBank riêng (kể cả mảng rỗng) cho từng nhóm", () => {
		const questions = [
			{ stem: "Q1", opts: null, pin: null, type: "headings" },
			{ stem: "Q2", opts: null, pin: null, type: "headings" },
			{ stem: "Q3", opts: null, pin: null, type: "summary" },
			{ stem: "Q4", opts: null, pin: null, type: "summary" },
		];

		const groups: StudentQuizGroup[] = [
			{
				id: "group-1",
				startIndex: 0,
				count: 2,
				type: "headings",
				instruction: "<p>Headings instruction</p>",
				optionBank: ["i", "ii", "iii"],
			},
			{
				id: "group-2",
				startIndex: 2,
				count: 2,
				type: "summary",
				instruction: "",
				optionBank: [],
			},
		];

		const parts = buildQuizPartsFromGroups(questions, groups, "reading");
		expect(parts).toHaveLength(2);

		// Group 1
		expect(parts[0]).toMatchObject({
			id: "part-1",
			label: "Questions 1–2",
			qStart: 1,
			typeId: "headings",
			instructionHtml: "<p>Headings instruction</p>",
			source: "group",
			optionBank: ["i", "ii", "iii"],
		});
		expect(parts[0]?.questions.map((q) => q.number)).toEqual([1, 2]);

		// Group 2 (Summary không có bank): optionBank phải là [] (không undefined)
		expect(parts[1]).toMatchObject({
			id: "part-2",
			label: "Questions 3–4",
			qStart: 3,
			typeId: "summary",
			source: "group",
			optionBank: [],
		});
		expect(parts[1]?.optionBank).toEqual([]);
		expect(parts[1]?.questions.map((q) => q.number)).toEqual([3, 4]);

		// Đảm bảo optionBank là bản sao mới
		expect(parts[0]?.optionBank).not.toBe(groups[0]?.optionBank);
		expect(parts[1]?.optionBank).not.toBe(groups[1]?.optionBank);
	});

	it("buildQuizPartsFromGroups fallback về buildQuizParts khi groups không phủ kín câu hỏi", () => {
		const questions = [
			{ stem: "Q1", opts: null, pin: null, type: "mcq" },
			{ stem: "Q2", opts: null, pin: null, type: "mcq" },
			{ stem: "Q3", opts: null, pin: null, type: "mcq" },
		];

		const invalidGroups: StudentQuizGroup[] = [
			{
				id: "group-1",
				startIndex: 0,
				count: 2,
				type: "mcq",
				instruction: "",
				optionBank: [],
			},
			// Thiếu câu hỏi thứ 3
		];

		const parts = buildQuizPartsFromGroups(questions, invalidGroups, "reading");
		expect(parts).toHaveLength(1);
		expect(parts[0]?.source).toBeUndefined(); // Fallback về buildQuizParts bình thường
		expect(parts[0]?.questions).toHaveLength(3);
	});
});
