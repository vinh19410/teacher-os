import type { StudentQuizQuestion } from "@teacher-os/api/contracts";
import { describe, expect, it } from "vitest";
import { buildQuizParts } from "@/lib/quiz-parts";

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
