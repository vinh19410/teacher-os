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

describe("buildQuizParts — qOffset multi-part (#433)", () => {
	it("intro marker toàn đề 'Questions 14–20' + qOffset 13 → nhãn 14–20, q/number 13+i (R2)", () => {
		// Part 2 của đề: giáo viên dán marker theo số toàn đề; splitQuizIntro
		// tự quy về local (offset = 13) còn nhãn cuối cùng theo qStart.
		const questions = Array.from({ length: 7 }, (_, i) => question(`q ${i}`));
		const parts = buildQuizParts(
			questions,
			"note",
			"<p>Questions 14–20</p><p>Complete the notes below.</p>",
			13,
		);
		expect(parts).toHaveLength(1);
		expect(parts[0]).toMatchObject({
			label: "Questions 14–20",
			qStart: 14,
			source: "intro",
		});
		// Marker đã strip khỏi instruction; nội dung giáo viên giữ nguyên.
		expect(parts[0]?.instructionHtml).not.toContain("Questions");
		expect(parts[0]?.instructionHtml).toContain("Complete the notes below.");
		expect(parts[0]?.questions.map((q) => q.q)).toEqual([
			13, 14, 15, 16, 17, 18, 19,
		]);
		expect(parts[0]?.questions.map((q) => q.number)).toEqual([
			14, 15, 16, 17, 18, 19, 20,
		]);
	});

	it("qOffset=0 (mặc định) → hành vi cũ nguyên vẹn", () => {
		const questions = Array.from({ length: 4 }, (_, i) => question(`q ${i}`));
		expect(buildQuizParts(questions, "note", "", 0)).toEqual(
			buildQuizParts(questions, "note"),
		);
	});

	it("cluster sau section mang qOffset (không chỉ section intro)", () => {
		const questions = [
			...Array.from({ length: 2 }, (_, i) => question(`tfng ${i}`, "tfng")),
			...Array.from({ length: 3 }, (_, i) => question(`note ${i}`)),
		];
		const parts = buildQuizParts(questions, "note", "", 5);
		expect(parts.map((part) => part.qStart)).toEqual([6, 8]);
		expect(parts.flatMap((part) => part.questions.map(({ q }) => q))).toEqual([
			5, 6, 7, 8, 9,
		]);
	});
});
