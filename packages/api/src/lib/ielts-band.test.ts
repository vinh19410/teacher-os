import { describe, expect, test } from "vitest";
import {
	criterionLabel,
	essayTaskOf,
	formatBand,
	hasGradableTask,
	ieltsOverallBand,
	isAutoGradableSkill,
	isBandStep,
	isGradableSkill,
} from "./ielts-band";

describe("ieltsOverallBand — quy ước làm tròn IELTS", () => {
	test(".25 lên .5, .75 lên số nguyên kế", () => {
		expect(ieltsOverallBand([6, 6.5, 6, 6.5])).toBe(6.5); // avg 6.25
		expect(ieltsOverallBand([7, 7, 7, 8])).toBe(7.5); // avg 7.25
		expect(ieltsOverallBand([6.5, 7, 7, 7])).toBe(7); // avg 6.875
	});

	test(".125 và .75 giữ nguyên bậc 0.5 gần nhất", () => {
		expect(ieltsOverallBand([6, 6, 6, 6.5])).toBe(6); // avg 6.125
		expect(ieltsOverallBand([6.5, 6.5, 7, 7])).toBe(7); // avg 6.75
	});

	test("biên 0 và 9", () => {
		expect(ieltsOverallBand([0, 0, 0, 0])).toBe(0);
		expect(ieltsOverallBand([9, 9, 9, 9])).toBe(9);
	});

	test("mảng rỗng throw", () => {
		expect(() => ieltsOverallBand([])).toThrow();
	});
});

describe("isBandStep — 0..9 bước 0.5", () => {
	test("nhận 0, 5.5, 9", () => {
		expect(isBandStep(0)).toBe(true);
		expect(isBandStep(5.5)).toBe(true);
		expect(isBandStep(9)).toBe(true);
	});

	test("từ chối ngoài khoảng, lẻ 0.25 và non-finite", () => {
		expect(isBandStep(-0.5)).toBe(false);
		expect(isBandStep(9.5)).toBe(false);
		expect(isBandStep(6.25)).toBe(false);
		expect(isBandStep(Number.NaN)).toBe(false);
		expect(isBandStep(Number.POSITIVE_INFINITY)).toBe(false);
	});
});

describe("criterionLabel — nhãn IELTS theo skill/part", () => {
	test("Writing: task1 → Task Achievement, còn lại → Task Response", () => {
		expect(criterionLabel("writing", "task", "task1")).toBe("Task Achievement");
		expect(criterionLabel("writing", "task", "task2")).toBe("Task Response");
	});

	test("Speaking và các nhãn tiêu chí còn lại", () => {
		expect(criterionLabel("speaking", "pronunciation", "part2")).toBe(
			"Pronunciation",
		);
		expect(criterionLabel("writing", "coherence", "task1")).toBe(
			"Coherence & Cohesion",
		);
		expect(criterionLabel("speaking", "fluency", "part1")).toBe(
			"Fluency & Coherence",
		);
		expect(criterionLabel("writing", "lexical", "task2")).toBe(
			"Lexical Resource",
		);
		expect(criterionLabel("writing", "grammar", "task1")).toBe(
			"Grammatical Range & Accuracy",
		);
	});

	test("key lạ trả về chính key đó", () => {
		expect(criterionLabel("writing", "unknown", "task1")).toBe("unknown");
	});
});

describe("isGradableSkill", () => {
	test("reading/listening không chấm được, writing/speaking chấm được", () => {
		expect(isGradableSkill("reading")).toBe(false);
		expect(isGradableSkill("listening")).toBe(false);
		expect(isGradableSkill("writing")).toBe(true);
		expect(isGradableSkill("speaking")).toBe(true);
	});
});

describe("formatBand — hiển thị 1 chữ số thập phân", () => {
	test("7 → '7.0', 6.5 → '6.5'", () => {
		expect(formatBand(7)).toBe("7.0");
		expect(formatBand(6.5)).toBe("6.5");
	});
});

describe("isAutoGradableSkill, essayTaskOf & hasGradableTask (#574)", () => {
	test("isAutoGradableSkill nhận 4 kỹ năng tự chấm và từ chối writing/speaking", () => {
		expect(isAutoGradableSkill("reading")).toBe(true);
		expect(isAutoGradableSkill("listening")).toBe(true);
		expect(isAutoGradableSkill("grammar")).toBe(true);
		expect(isAutoGradableSkill("vocabulary")).toBe(true);
		expect(isAutoGradableSkill("writing")).toBe(false);
		expect(isAutoGradableSkill("speaking")).toBe(false);
		expect(isAutoGradableSkill("")).toBe(false);
	});

	test("đề Writing thuần trả hybrid=false và hasGradableTask=true", () => {
		const row = {
			skill: "writing",
			part: "task2",
			prompt: "<p>Discuss both views.</p>",
			writingPart: null,
			writingPrompt: "",
		};
		expect(essayTaskOf(row)).toEqual({
			skill: "writing",
			part: "task2",
			prompt: "<p>Discuss both views.</p>",
			hybrid: false,
		});
		expect(hasGradableTask(row)).toBe(true);
	});

	test("đề Speaking thuần: essayTaskOf=null nhưng hasGradableTask=true", () => {
		const row = { skill: "speaking", part: "part2", prompt: "" };
		expect(essayTaskOf(row)).toBeNull();
		expect(hasGradableTask(row)).toBe(true);
	});

	test("đề Reading thuần không có writing: cả hai trả null/false", () => {
		const row = {
			skill: "reading",
			part: "p1",
			prompt: "",
			writingPart: null,
		};
		expect(essayTaskOf(row)).toBeNull();
		expect(hasGradableTask(row)).toBe(false);
	});

	test("đề gộp phẳng và nested đều trả descriptor Writing hybrid=true", () => {
		expect(
			essayTaskOf({
				skill: "grammar",
				part: "g1",
				prompt: "",
				writingPart: "task1",
				writingPrompt: "<p>Describe the chart.</p>",
			}),
		).toEqual({
			skill: "writing",
			part: "task1",
			prompt: "<p>Describe the chart.</p>",
			hybrid: true,
		});

		const nested = {
			skill: "reading",
			part: "p1",
			prompt: "",
			writing: {
				part: "task2",
				type: "discuss",
				prompt: "<p>Write an essay.</p>",
			},
		};
		expect(essayTaskOf(nested)).toEqual({
			skill: "writing",
			part: "task2",
			prompt: "<p>Write an essay.</p>",
			hybrid: true,
		});
		expect(hasGradableTask(nested)).toBe(true);
		expect(hasGradableTask({ skill: "vocabulary", hasWriting: true })).toBe(
			true,
		);
	});

	test("phòng thủ: speaking kèm writingPart sai invariant không biến thành writing", () => {
		expect(
			essayTaskOf({
				skill: "speaking",
				writingPart: "task2",
				writingPrompt: "<p>Invalid</p>",
			}),
		).toBeNull();
	});
});
