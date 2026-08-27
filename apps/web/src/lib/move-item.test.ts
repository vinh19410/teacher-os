import { describe, expect, test } from "vitest";
import { moveItem } from "./move-item";

describe("moveItem", () => {
	test("moves an item down and up", () => {
		expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
		expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
	});

	test("out-of-range is a no-op", () => {
		const list = ["a", "b"];
		expect(moveItem(list, 0, -1)).toBe(list);
		expect(moveItem(list, 1, 1)).toBe(list);
		expect(moveItem(list, -1, 1)).toBe(list);
	});
});
