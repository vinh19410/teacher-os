import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json";

describe("canonicalJson (#630, #632)", () => {
	it("is independent of object key ordering", () => {
		const a = { a: 1, b: "x", c: true };
		const b = { c: true, b: "x", a: 1 };
		expect(canonicalJson(a)).toBe(canonicalJson(b));
	});

	it("treats omitted keys, undefined, and null in object properties as equivalent (#632)", () => {
		const storedSnapshot = {
			stem: "Q1",
			opts: null,
			answer: "TRUE",
			alts: "",
			type: null,
			pin: null,
		};
		const sentWithoutTypeAndPin = {
			stem: "Q1",
			opts: null,
			answer: "TRUE",
			alts: "",
		};
		const sentWithUndefined = {
			stem: "Q1",
			opts: null,
			answer: "TRUE",
			alts: "",
			type: undefined,
			pin: undefined,
		};

		expect(canonicalJson(sentWithoutTypeAndPin)).toBe(
			canonicalJson(storedSnapshot),
		);
		expect(canonicalJson(sentWithUndefined)).toBe(
			canonicalJson(storedSnapshot),
		);
		expect(canonicalJson(sentWithoutTypeAndPin)).toBe(
			canonicalJson(sentWithUndefined),
		);
	});

	it("preserves null inside arrays so array element positions stay distinct", () => {
		expect(canonicalJson([null, "a"])).toBe('[null,"a"]');
		expect(canonicalJson(["a", null])).toBe('["a",null]');
		expect(canonicalJson([null])).not.toBe(canonicalJson([]));
		expect(canonicalJson([null, "a"])).not.toBe(canonicalJson(["a"]));
	});

	it("serializes top-level null and undefined to 'null'", () => {
		expect(canonicalJson(null)).toBe("null");
		expect(canonicalJson(undefined)).toBe("null");
	});

	it("distinguishes genuinely different questions", () => {
		const base = {
			stem: "Q1",
			opts: null,
			answer: "TRUE",
			alts: "",
			type: null,
			pin: null,
		};

		// Different stem
		expect(canonicalJson(base)).not.toBe(
			canonicalJson({ ...base, stem: "Q2" }),
		);
		// Different answer
		expect(canonicalJson(base)).not.toBe(
			canonicalJson({ ...base, answer: "FALSE" }),
		);
		// opts: null vs opts: ["A", "B"]
		expect(canonicalJson(base)).not.toBe(
			canonicalJson({ ...base, opts: ["A", "B"] }),
		);
		// type: null vs type: "mcq"
		expect(canonicalJson(base)).not.toBe(
			canonicalJson({ ...base, type: "mcq" }),
		);
		// pin: null vs pin: { x: 10, y: 20 }
		expect(canonicalJson(base)).not.toBe(
			canonicalJson({ ...base, pin: { x: 10, y: 20 } }),
		);
		// different pin coordinates
		expect(canonicalJson({ pin: { x: 10, y: 20 } })).not.toBe(
			canonicalJson({ pin: { x: 10, y: 30 } }),
		);
	});

	it("handles nested objects with null and undefined properties", () => {
		const nestedA = {
			info: {
				detail: "ok",
				extra: null,
			},
		};
		const nestedB = {
			info: {
				detail: "ok",
			},
		};
		expect(canonicalJson(nestedA)).toBe(canonicalJson(nestedB));
	});

	it("preserves optionBank comparison correctly", () => {
		const bankA = ["True", "False", "Not Given"];
		const bankB = ["True", "False", "Not Given"];
		const bankC = ["True", "False"];
		expect(canonicalJson(bankA)).toBe(canonicalJson(bankB));
		expect(canonicalJson(bankA)).not.toBe(canonicalJson(bankC));
	});
});
