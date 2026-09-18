import { describe, expect, test } from "vitest";

import {
	compositionDefaults,
	genreOf,
	TASK_PRESETS,
	taskOf,
	wordCount,
} from "./assignment-presets";

describe("assignment presets (#202)", () => {
	test("catalog: 2 tasks, 4 genres each, non-empty defaults, Task 2 default", () => {
		expect(TASK_PRESETS).toHaveLength(2);
		for (const task of TASK_PRESETS) {
			expect(task.genres).toHaveLength(4);
			for (const g of task.genres) {
				expect(g.title.length).toBeGreaterThan(0);
				expect(g.prompt.length).toBeGreaterThan(0);
			}
		}
		expect(taskOf("unknown").id).toBe("task2");
	});

	test("wordCount counts whitespace-separated words", () => {
		expect(wordCount("")).toBe(0);
		expect(wordCount("   ")).toBe(0);
		expect(wordCount("  a  b c ")).toBe(3);
	});

	test("genreOf resolves by id and falls back to the first genre", () => {
		expect(genreOf("task1", "chart").label).toBe("Biểu đồ");
		expect(genreOf("task1", "nope").label).toBe("Biểu đồ");
		expect(genreOf("task2", "discuss").label).toBe("Discuss both views");
	});

	test("compositionDefaults respects dirty flags", () => {
		const clean = compositionDefaults("task2", "opinion", false, false);
		expect(clean.title).toContain("Opinion");
		expect(clean.prompt).toContain("unpaid community service");

		const dirty = compositionDefaults("task2", "opinion", true, true);
		expect(dirty.title).toBe("");
		expect(dirty.prompt).toBe("");
	});
});
