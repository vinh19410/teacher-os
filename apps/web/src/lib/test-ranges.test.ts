import { describe, expect, it } from "vitest";

import { computeTestRanges } from "./test-ranges";

function part(
	part: string,
	questionCount: number,
	qStartOverride: number | null = null,
) {
	return {
		part,
		qStartOverride,
		promptQuestions: Array.from({ length: questionCount }, () => ({
			stem: `stem-${part}`,
		})),
	};
}

describe("computeTestRanges — continuous numbering (Task 3.1)", () => {
	it("(a) canonical paper 13/13/14 → qStart 1/14/27", () => {
		const ranges = computeTestRanges({
			parts: [part("p1", 13), part("p2", 13), part("p3", 14)],
		});
		expect(ranges).toEqual([
			{ part: "p1", qStart: 1, count: 13 },
			{ part: "p2", qStart: 14, count: 13 },
			{ part: "p3", qStart: 27, count: 14 },
		]);
	});

	// REGRESSION then chốt: part thật không luôn 13 câu — static preset
	// qStart (1/14/27 trong assignment-presets.ts) sẽ lệch answers panel;
	// số chỉ được tính từ count thật của part trước (phase-03 plan Task 3.1).
	it("(b) real-world 12/14/14 → qStart 1/13/27 (NOT preset 1/14/27)", () => {
		const ranges = computeTestRanges({
			parts: [part("p1", 12), part("p2", 14), part("p3", 14)],
		});
		expect(ranges).toEqual([
			{ part: "p1", qStart: 1, count: 12 },
			{ part: "p2", qStart: 13, count: 14 },
			{ part: "p3", qStart: 27, count: 14 },
		]);
	});

	it("(c) qStartOverride mid-test đè số và các part sau nối tiếp từ đó", () => {
		const ranges = computeTestRanges({
			parts: [part("p1", 13), part("p2", 13, 20), part("p3", 14)],
		});
		expect(ranges).toEqual([
			{ part: "p1", qStart: 1, count: 13 },
			{ part: "p2", qStart: 20, count: 13 },
			{ part: "p3", qStart: 33, count: 14 },
		]);
	});

	it("(d) part chưa gắn prompt (count 0) không làm lệch các part sau", () => {
		const ranges = computeTestRanges({
			parts: [part("p1", 13), part("p2", 0), part("p3", 14)],
		});
		expect(ranges).toEqual([
			{ part: "p1", qStart: 1, count: 13 },
			{ part: "p2", qStart: 14, count: 0 },
			{ part: "p3", qStart: 14, count: 14 },
		]);
	});
});
