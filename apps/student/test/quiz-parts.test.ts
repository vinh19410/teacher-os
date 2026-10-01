import type { StudentQuizQuestion } from "@teacher-os/api/contracts";
import { buildQuizParts } from "@teacher-os/api/lib/quiz-parts";
import { describe, expect, it } from "vitest";

const question = (stem: string, type?: string): StudentQuizQuestion => ({
	stem,
	opts: null,
	pin: null,
	...(type ? { type } : {}),
});

describe("buildQuizParts — phân cụm theo type từng câu (#286)", () => {
	it("gom chuỗi câu liên tiếp cùng type thành các part riêng", () => {
		const questions = [
			...Array.from({ length: 4 }, (_, i) => question(`tfng ${i}`, "tfng")),
			...Array.from({ length: 4 }, (_, i) =>
				question(`flow ${i}`, "flowchart"),
			),
			...Array.from({ length: 5 }, (_, i) => question(`note ${i}`, "note")),
		];
		const parts = buildQuizParts(questions, "note");
		expect(parts).toHaveLength(3);
		expect(parts[0]).toMatchObject({
			label: "Questions 1–4",
			typeId: "tfng",
			qStart: 1,
		});
		expect(parts[1]).toMatchObject({
			label: "Questions 5–8",
			typeId: "flowchart",
			qStart: 5,
		});
		expect(parts[2]).toMatchObject({
			label: "Questions 9–13",
			typeId: "note",
			qStart: 9,
		});
		// q/number liên tục 0-based/1-based qua các cụm.
		expect(parts.flatMap((part) => part.questions.map(({ q }) => q))).toEqual(
			Array.from({ length: 13 }, (_, q) => q),
		);
		expect(
			parts.flatMap((part) => part.questions.map(({ number }) => number)),
		).toEqual(Array.from({ length: 13 }, (_, n) => n + 1));
	});

	it("câu thiếu type fallback về promptType và gom 1 part (đề cũ)", () => {
		const questions = [question("a"), question("b"), question("c")];
		const parts = buildQuizParts(questions, "info");
		expect(parts).toHaveLength(1);
		expect(parts[0].typeId).toBe("info");
		expect(parts[0].label).toBe("Questions 1–3");
	});

	it("đề 1 type (kể cả per-question cùng type) vẫn 1 part", () => {
		const questions = [question("a", "tfng"), question("b", "tfng")];
		expect(buildQuizParts(questions, "tfng")).toHaveLength(1);
	});

	it("cùng type xuất hiện lại sau cụm khác tạo part MỚI (chuỗi liên tiếp)", () => {
		const questions = [
			question("a", "tfng"),
			question("b", "note"),
			question("c", "tfng"),
		];
		const parts = buildQuizParts(questions, "note");
		expect(parts.map((part) => part.typeId)).toEqual(["tfng", "note", "tfng"]);
		expect(parts.map((part) => part.label)).toEqual([
			"Questions 1",
			"Questions 2",
			"Questions 3",
		]);
	});

	it("mảng rỗng → không có part nào", () => {
		expect(buildQuizParts([], "tfng")).toEqual([]);
	});
});

describe("buildQuizParts — intro chia cụm theo marker Questions X–Y (#301)", () => {
	const intro3 =
		"<p>Questions 1–4</p><p>Do the following statements agree…</p>" +
		"<p>Questions 5–8 · Flow-chart completion — Write ONE WORD ONLY from the passage.</p>" +
		"<p>Questions 9–13</p><p>Complete the notes below.</p>";

	it("13 câu không khai type + intro 3 marker → 3 part theo section", () => {
		const questions = Array.from({ length: 13 }, (_, i) => question(`q ${i}`));
		const parts = buildQuizParts(questions, "note", intro3);
		expect(parts.map((part) => part.label)).toEqual([
			"Questions 1–4",
			"Questions 5–8",
			"Questions 9–13",
		]);
		expect(parts[1].instructionHtml).toContain("Write ONE WORD ONLY");
		expect(parts.flatMap((part) => part.questions.map(({ q }) => q))).toEqual(
			Array.from({ length: 13 }, (_, q) => q),
		);
	});

	it("intro chỉ phủ 1–4: phần còn lại gom theo type, không instructionHtml", () => {
		const questions = [
			question("a"),
			question("b"),
			question("c"),
			question("d"),
			question("e", "tfng"),
			question("f", "tfng"),
		];
		const parts = buildQuizParts(
			questions,
			"note",
			"<p>Questions 1–4</p><p>Write TRUE.</p>",
		);
		expect(parts).toHaveLength(2);
		expect(parts[0].instructionHtml).toContain("Write TRUE.");
		expect(parts[1]).toMatchObject({
			label: "Questions 5–6",
			typeId: "tfng",
		});
		expect(parts[1].instructionHtml).toBeUndefined();
	});

	it("intro marker không hợp lệ (vượt biên) → y hệt khi không có intro", () => {
		const questions = Array.from({ length: 13 }, (_, i) => question(`q ${i}`));
		const bad = "<p>Questions 1–4</p><p>x</p><p>Questions 5–14</p><p>y</p>";
		expect(buildQuizParts(questions, "note", bad)).toEqual(
			buildQuizParts(questions, "note"),
		);
	});
});
