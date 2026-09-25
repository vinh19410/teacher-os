import { describe, expect, test } from "vitest";

import { answerChoices, emptyItem, kindOf } from "./assignment-presets";
import { applyBulkKeyPaste, PASTE_LINE_PATTERN } from "./bulk-key-paste";

function items(typeId: string, count: number) {
	return Array.from({ length: count }, () => emptyItem(typeId));
}

describe("bulk key paste — map by parsed question number (FR7)", () => {
	test("line pattern accepts `n.` and `n)` with leading spaces", () => {
		expect(PASTE_LINE_PATTERN.test("1. TRUE")).toBe(true);
		expect(PASTE_LINE_PATTERN.test("  12) TRUE")).toBe(true);
		expect(PASTE_LINE_PATTERN.test("TRUE")).toBe(false);
		expect(PASTE_LINE_PATTERN.test("1 TRUE")).toBe(false);
	});

	test("tfng: `2. FALSE` lands on the row displaying Q2 (index 1), not row order", () => {
		const result = applyBulkKeyPaste({
			raw: "2. FALSE\n1. TRUE",
			typeId: "tfng",
			qStart: 1,
			items: items("tfng", 2),
		});
		expect(result.errors).toEqual([]);
		expect(result.appliedCount).toBe(2);
		expect(result.items[0].answer).toBe("TRUE");
		expect(result.items[1].answer).toBe("FALSE");
	});

	test("listening s4: line `33. steam` maps to index 33 - 31 = 2", () => {
		const result = applyBulkKeyPaste({
			raw: "33. steam",
			typeId: "notes",
			qStart: 31,
			items: items("notes", 4),
		});
		expect(result.errors).toEqual([]);
		expect(result.items[2].answer).toBe("steam");
	});

	test("text kind: ` / ` splits answer and alts", () => {
		const result = applyBulkKeyPaste({
			raw: "1. northern / north / the north",
			typeId: "sent",
			qStart: 1,
			items: items("sent", 2),
		});
		expect(result.errors).toEqual([]);
		expect(result.items[0].answer).toBe("northern");
		expect(result.items[0].alts).toBe("north / the north");
		expect(result.items[1].answer).toBe("");
	});

	test("choice kind: value is matched case-insensitively to the canonical choice", () => {
		const result = applyBulkKeyPaste({
			raw: "1. not given",
			typeId: "tfng",
			qStart: 1,
			items: items("tfng", 1),
		});
		expect(result.errors).toEqual([]);
		expect(result.items[0].answer).toBe("NOT GIVEN");
	});

	test("out-of-range number produces a per-line error and does not shift other rows", () => {
		const result = applyBulkKeyPaste({
			raw: "1. TRUE\n9. FALSE",
			typeId: "tfng",
			qStart: 1,
			items: items("tfng", 3),
		});
		expect(result.appliedCount).toBe(1);
		expect(result.items[0].answer).toBe("TRUE");
		expect(result.items[1].answer).toBe("");
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({ line: 2, reason: "out-of-range" });
		expect(result.errors[0].message).toContain("Q9");
	});

	test("duplicate numbers produce a per-line error; first occurrence stays applied", () => {
		const result = applyBulkKeyPaste({
			raw: "1. TRUE\n1. FALSE",
			typeId: "tfng",
			qStart: 1,
			items: items("tfng", 2),
		});
		expect(result.appliedCount).toBe(1);
		expect(result.items[0].answer).toBe("TRUE");
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({ line: 2, reason: "duplicate" });
	});

	test("unparsable line produces a per-line error; valid lines still apply", () => {
		const result = applyBulkKeyPaste({
			raw: "TRUE\n2. FALSE",
			typeId: "tfng",
			qStart: 1,
			items: items("tfng", 2),
		});
		expect(result.appliedCount).toBe(1);
		expect(result.items[1].answer).toBe("FALSE");
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({ line: 1, reason: "unparsable" });
	});

	test("choice kind rejects values outside the choice set with a per-line error", () => {
		const result = applyBulkKeyPaste({
			raw: "1. MAYBE",
			typeId: "tfng",
			qStart: 1,
			items: items("tfng", 1),
		});
		expect(result.appliedCount).toBe(0);
		expect(result.items[0].answer).toBe("");
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({ line: 1, reason: "invalid-choice" });
		expect(result.errors[0].message).toContain(
			answerChoices("tfng")!.join(", "),
		);
	});

	test("blank lines are ignored, not reported", () => {
		const result = applyBulkKeyPaste({
			raw: "1. TRUE\n\n   \n2. FALSE",
			typeId: "tfng",
			qStart: 1,
			items: items("tfng", 2),
		});
		expect(result.errors).toEqual([]);
		expect(result.appliedCount).toBe(2);
	});

	test("never mutates the input items array", () => {
		const source = items("tfng", 2);
		const frozen = source.map((item) => ({ ...item }));
		applyBulkKeyPaste({
			raw: "1. TRUE",
			typeId: "tfng",
			qStart: 1,
			items: source,
		});
		expect(source).toEqual(frozen);
	});

	test("roman kind accepts i–viii values", () => {
		const result = applyBulkKeyPaste({
			raw: "14. iii",
			typeId: "headings",
			qStart: 14,
			items: items("headings", 2),
		});
		expect(kindOf("headings")).toBe("roman");
		expect(result.errors).toEqual([]);
		expect(result.items[0].answer).toBe("iii");
	});
});
