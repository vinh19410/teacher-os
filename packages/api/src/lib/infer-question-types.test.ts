import { describe, expect, test } from "vitest";
import { inferQuestionTypes } from "./infer-question-types";

type Row = {
	stem: string;
	opts: readonly string[] | null;
	answer: string;
	type?: string | null;
	pin?: unknown;
};

const row = (answer: string, overrides: Partial<Row> = {}): Row => ({
	stem: "Câu không marker",
	opts: null,
	...overrides,
	answer,
});

describe("inferQuestionTypes — run TF/YN liền kề (scenario B3, #303)", () => {
	test("run TRUE/FALSE thuần → tfng", () => {
		const types = inferQuestionTypes(
			[row("TRUE"), row("FALSE"), row("FALSE")],
			"note",
		);
		expect(types).toEqual(["tfng", "tfng", "tfng"]);
	});

	test("run YES/NO thuần → ynng", () => {
		const types = inferQuestionTypes([row("YES"), row("NO")], "note");
		expect(types).toEqual(["ynng", "ynng"]);
	});

	test("đổi họ TF ↔ YES/NO cắt run — mỗi run nhận type riêng", () => {
		const types = inferQuestionTypes(
			[row("TRUE"), row("FALSE"), row("YES"), row("NO"), row("NO")],
			"note",
		);
		expect(types).toEqual(["tfng", "tfng", "ynng", "ynng", "ynng"]);
	});

	test("NOT GIVEN trộn trong run TF giữ họ TF; NOT GIVEN đơn lẻ → tfng", () => {
		expect(
			inferQuestionTypes([row("TRUE"), row("NOT GIVEN"), row("FALSE")], "note"),
		).toEqual(["tfng", "tfng", "tfng"]);
		expect(inferQuestionTypes([row("NOT GIVEN")], "note")).toEqual(["tfng"]);
	});

	test("câu ứng viên chen giữa câu thường cắt run — câu thường nhận promptType", () => {
		const types = inferQuestionTypes(
			[row("TRUE"), row("timber"), row("NO")],
			"note",
		);
		// "timber" không thuộc họ TFNG → flush trước nó; nó nhận promptType.
		expect(types).toEqual(["tfng", "note", "ynng"]);
	});
});

describe("inferQuestionTypes — loại ứng viên (scenario B4)", () => {
	test("câu có opts / pin / stem marker ____ / type khai sẵn không được infer", () => {
		const types = inferQuestionTypes(
			[
				row("TRUE", { opts: ["True", "False"] }),
				row("FALSE", { pin: { x: 10, y: 20 } }),
				row("TRUE", { stem: "Houses used ____ frames." }),
				row("FALSE", { type: "sent" }),
			],
			"note",
		);
		expect(types).toEqual(["note", "note", "note", "sent"]);
	});

	test("promptType ngoài CLOZE_EDITOR_TYPES → không suy luận gì", () => {
		const types = inferQuestionTypes([row("TRUE"), row("NO")], "shortans");
		expect(types).toEqual(["shortans", "shortans"]);
	});

	test("câu có type khai sẵn cắt run và giữ nguyên type riêng", () => {
		const types = inferQuestionTypes(
			[row("TRUE"), row("NO", { type: "sent" }), row("TRUE")],
			"note",
		);
		// Câu giữa có type → không ứng viên, cắt run; hai câu TRUE tách 2 run tfng.
		expect(types).toEqual(["tfng", "sent", "tfng"]);
	});
});
