import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import { QUESTION_STEM_MAX } from "@/components/assignments/answer-key-grid";
import {
	addTableRow,
	buildClozeSegments,
	buildTableStem,
	CLOZE_MARKER,
	CLOZE_MAX_BLANKS,
	CLOZE_STEM_MAX,
	CLOZE_TOKENIZE_PERF_CHARS,
	type ClozeBlankEntry,
	clickClozeToken,
	clozeApplyIssues,
	countBlanks,
	emptyTableGrid,
	parseClozeRaw,
	parseTableStem,
	removeTableCol,
	removeTableRow,
	segmentsToItems,
	splitStemByMarker,
	type TableGridState,
	tableApplyIssues,
	tableSegments,
	toggleClozeBlank,
	toggleTableCell,
	tokenizePassage,
	updateTableCell,
} from "./cloze";

describe("countBlanks (phase-03 FR7 — shared composer + preview helper)", () => {
	it("counts a single marker", () => {
		expect(countBlanks("Rains refill the ____ each year.")).toBe(1);
	});
	it("zero markers is valid (backward compat)", () => {
		expect(countBlanks("Rains refill the wells each year.")).toBe(0);
	});
	it("counts two markers — the per-row error case", () => {
		expect(countBlanks("____ and ____")).toBe(2);
	});
	it("needs at least four underscores", () => {
		expect(countBlanks("three ___ under")).toBe(0);
		expect(countBlanks("exactly ____ four")).toBe(1);
		expect(countBlanks("longer ______ six")).toBe(1);
	});
	it("marker constant is the minimum four-underscore form", () => {
		expect(CLOZE_MARKER).toBe("____");
	});
});

describe("splitStemByMarker (phase-03 FR5 — preview split)", () => {
	it("splits at the marker", () => {
		expect(splitStemByMarker("The ____ sat")).toEqual(["The ", " sat"]);
	});
	it("no marker returns [stem, empty]", () => {
		expect(splitStemByMarker("plain stem")).toEqual(["plain stem", ""]);
	});
	it("marker at start and at end", () => {
		expect(splitStemByMarker("____ start")).toEqual(["", " start"]);
		expect(splitStemByMarker("end ____")).toEqual(["end ", ""]);
	});
	it("splits at the FIRST marker only", () => {
		expect(splitStemByMarker("a ____ b ____ c")).toEqual(["a ", " b ____ c"]);
	});
});

describe("parseClozeRaw (phase-03 FR1 raw mode — H5P *answer/alt* syntax)", () => {
	it("parses a single blank", () => {
		expect(parseClozeRaw("The *cat* sat")).toEqual([
			{ stem: "The ____ sat", answer: "cat", alts: "" },
		]);
	});
	it("splits at each blank; trailing text joins the last segment", () => {
		expect(parseClozeRaw("The *cat* saw the *mat*")).toEqual([
			{ stem: "The ____", answer: "cat", alts: "" },
			{ stem: " saw the ____", answer: "mat", alts: "" },
		]);
	});
	it("collects alternates separated by /", () => {
		expect(parseClozeRaw("*north/south* wind")).toEqual([
			{ stem: "____ wind", answer: "north", alts: "south" },
		]);
		expect(parseClozeRaw("*a/b/c*")).toEqual([
			{ stem: "____", answer: "a", alts: "b/c" },
		]);
	});
	it("trims spaces inside the asterisks", () => {
		expect(parseClozeRaw("* cat / feline *")).toEqual([
			{ stem: "____", answer: "cat", alts: "feline" },
		]);
	});
	it("escaped \\* outside a blank stays a literal asterisk (no blanks)", () => {
		expect(parseClozeRaw("2 \\* 3 = 6")).toEqual([]);
	});
	it("escaped \\* inside a blank stays in the answer", () => {
		expect(parseClozeRaw("*a\\*b* here")).toEqual([
			{ stem: "____ here", answer: "a*b", alts: "" },
		]);
	});
	it("an unterminated * is a literal asterisk, not a blank", () => {
		expect(parseClozeRaw("The *cat sat")).toEqual([]);
		expect(parseClozeRaw("5 * 4 = 20")).toEqual([]);
	});
	it("blank at start of the text", () => {
		expect(parseClozeRaw("*Bees* make honey")).toEqual([
			{ stem: "____ make honey", answer: "Bees", alts: "" },
		]);
	});
	it("blank at end of the text", () => {
		expect(parseClozeRaw("Honey is made by *bees*")).toEqual([
			{ stem: "Honey is made by ____", answer: "bees", alts: "" },
		]);
	});
	it("punctuation inside the blank is kept verbatim (teacher's explicit syntax)", () => {
		expect(parseClozeRaw("the *mat,*")).toEqual([
			{ stem: "the ____", answer: "mat,", alts: "" },
		]);
	});
	it("no blanks or empty text passes through as an empty list", () => {
		expect(parseClozeRaw("")).toEqual([]);
		expect(parseClozeRaw("plain text, no markers")).toEqual([]);
	});
});

describe("tokenizePassage (phase-03 FR1 visual mode)", () => {
	it("splits on whitespace and keeps offsets", () => {
		const tokens = tokenizePassage("The cat sat");
		expect(tokens.map((token) => token.text)).toEqual(["The", "cat", "sat"]);
		for (const token of tokens) {
			expect("The cat sat".slice(token.start, token.end)).toBe(token.text);
		}
		expect(tokens.map((token) => token.index)).toEqual([0, 1, 2]);
	});
	it("a punctuation-attached word is one token", () => {
		expect(tokenizePassage("the mat, and slept.").map((t) => t.text)).toEqual([
			"the",
			"mat,",
			"and",
			"slept.",
		]);
	});
	it("multiple blanks per paragraph survive tokenization", () => {
		const text = "First line ends here.\nSecond line has *two* words.";
		const tokens = tokenizePassage(text);
		expect(tokens.length).toBe(9);
		expect(tokens.at(-1)?.text).toBe("words.");
	});
	it("empty text has no tokens", () => {
		expect(tokenizePassage("")).toEqual([]);
		expect(tokenizePassage("   \n  ")).toEqual([]);
	});
	it("tokenizes 20 000 chars well under 50 ms (non-functional cap)", () => {
		const sentence =
			"The stepwell builders cut tunnels into the rock to channel the flow. ";
		const text = sentence.repeat(
			Math.ceil(CLOZE_TOKENIZE_PERF_CHARS / sentence.length),
		);
		const start = performance.now();
		const tokens = tokenizePassage(text);
		const elapsed = performance.now() - start;
		expect(text.length).toBeGreaterThanOrEqual(CLOZE_TOKENIZE_PERF_CHARS);
		expect(tokens.length).toBeGreaterThan(3000);
		expect(elapsed).toBeLessThan(50);
	});
});

describe("toggleClozeBlank (phase-03 FR1 — click order bookkeeping)", () => {
	const tokens = tokenizePassage("The cat sat on the mat");
	const cat = tokens[1];
	const mat = tokens[5];

	it("adds a blank with the clicked word as answer", () => {
		const blanks = toggleClozeBlank([], cat);
		expect(blanks).toEqual([{ tokenIndex: 1, answer: "cat", alts: "" }]);
	});
	it("toggling again removes the blank", () => {
		const blanks = toggleClozeBlank(
			[cat].map(() => ({
				tokenIndex: cat.index,
				answer: cat.text,
				alts: "",
			})),
			cat,
		);
		expect(blanks).toEqual([]);
	});
	it("click order is preserved even when clicked out of text order", () => {
		let blanks: ClozeBlankEntry[] = [];
		blanks = toggleClozeBlank(blanks, mat);
		blanks = toggleClozeBlank(blanks, cat);
		expect(blanks.map((blank) => blank.tokenIndex)).toEqual([5, 1]);
	});
});

describe("clickClozeToken (phase-03 FR3 — stray click never deletes a key)", () => {
	const tokens = tokenizePassage("The cat sat on the mat");
	const cat = tokens[1];
	const mat = tokens[5];
	const blanks: ClozeBlankEntry[] = [
		{ tokenIndex: cat.index, answer: "cat", alts: "a cat" },
	];

	it("clicking a blanked word opens its edit popover and keeps the blank", () => {
		const result = clickClozeToken(blanks, cat);
		expect(result.openBlank).toBe(cat.index);
		expect(result.blanks).toEqual(blanks);
	});

	it("clicking a fresh word adds the blank and closes the popover", () => {
		const result = clickClozeToken(blanks, mat);
		expect(result.openBlank).toBeNull();
		expect(result.blanks).toHaveLength(2);
		expect(result.blanks[1]).toEqual({
			tokenIndex: mat.index,
			answer: "mat",
			alts: "",
		});
	});
});

describe("buildClozeSegments (phase-03 FR2 — segment i ends at the next blank)", () => {
	const tokens = tokenizePassage("The cat sat on the mat and slept.");

	it("binds answers positionally regardless of click order", () => {
		const mat = tokens[5];
		const cat = tokens[1];
		let blanks: ClozeBlankEntry[] = [];
		blanks = toggleClozeBlank(blanks, mat);
		blanks = toggleClozeBlank(blanks, cat);
		const segments = buildClozeSegments(
			"The cat sat on the mat and slept.",
			blanks,
		);
		expect(segments).toEqual([
			{ stem: "The ____", answer: "cat", alts: "" },
			{ stem: " sat on the ____ and slept.", answer: "mat", alts: "" },
		]);
	});
	it("blank on the first token leaves an empty before-text", () => {
		const blanks = [tokens[0]].map((token) => ({
			tokenIndex: token.index,
			answer: token.text,
			alts: "",
		}));
		expect(buildClozeSegments("The cat sat", blanks)).toEqual([
			{ stem: "____ cat sat", answer: "The", alts: "" },
		]);
	});
	it("blank on the last token leaves the trailing text in the same segment", () => {
		const last = tokenizePassage("The cat slept.").at(-1);
		if (!last) throw new Error("missing token");
		const segments = buildClozeSegments("The cat slept.", [
			{ tokenIndex: last.index, answer: "slept.", alts: "" },
		]);
		expect(segments).toEqual([
			{ stem: "The cat ____", answer: "slept.", alts: "" },
		]);
	});
	it("keeps alts edited through the popover (FR3)", () => {
		const segments = buildClozeSegments("The cat sat", [
			{ tokenIndex: 1, answer: "cat", alts: "feline" },
		]);
		expect(segments[0].alts).toBe("feline");
	});
	it("stale token indexes (text edited after clicking) are ignored", () => {
		expect(
			buildClozeSegments("Short text", [
				{ tokenIndex: 99, answer: "x", alts: "" },
			]),
		).toEqual([]);
	});
	it("zero blanks produce zero segments", () => {
		expect(buildClozeSegments("Some text", [])).toEqual([]);
	});
});

describe("segmentsToItems (phase-03 FR2 — existing {stem, opts, answer, alts} shape)", () => {
	it("maps segments to wire items with opts null", () => {
		const items = segmentsToItems([
			{ stem: "The ____", answer: " cat ", alts: "feline" },
			{ stem: " sat on the ____", answer: "mat", alts: "" },
		]);
		expect(items).toEqual([
			{ stem: "The ____", opts: null, answer: "cat", alts: "feline" },
			{ stem: " sat on the ____", opts: null, answer: "mat", alts: "" },
		]);
	});
});

describe("clozeApplyIssues (phase-03 FR2 — caps BEFORE writing items)", () => {
	it("clean segments pass", () => {
		expect(
			clozeApplyIssues([{ stem: "The ____", answer: "cat", alts: "" }]),
		).toEqual([]);
	});
	it("a segment over the 500-char stem cap errors at that segment", () => {
		const long = `${"word ".repeat(110)}____`; // > 500 chars
		const issues = clozeApplyIssues([
			{ stem: "The ____", answer: "cat", alts: "" },
			{ stem: long, answer: "x", alts: "" },
		]);
		expect(issues.length).toBe(1);
		expect(issues[0]).toContain("2");
		expect(issues[0]).toContain(String(CLOZE_STEM_MAX));
	});
	it("more blanks than the 40-question cap blocks apply", () => {
		const segments = Array.from(
			{ length: CLOZE_MAX_BLANKS + 1 },
			(_, index) => ({
				stem: `seg ${index} ____`,
				answer: "x",
				alts: "",
			}),
		);
		const issues = clozeApplyIssues(segments);
		expect(issues.length).toBe(1);
		expect(issues[0]).toContain(String(CLOZE_MAX_BLANKS));
	});
	it("reports both cap breaches together", () => {
		const segments = Array.from({ length: CLOZE_MAX_BLANKS + 1 }, () => ({
			stem: "x".repeat(CLOZE_STEM_MAX + 1),
			answer: "x",
			alts: "",
		}));
		const issues = clozeApplyIssues(segments);
		// One over-count issue + one per-segment stem issue (41 segments).
		expect(
			issues.some((issue) => issue.includes(String(CLOZE_MAX_BLANKS))),
		).toBe(true);
		expect(
			issues.filter((issue) => issue.includes(String(CLOZE_STEM_MAX))).length,
		).toBe(CLOZE_MAX_BLANKS + 1);
	});
});

describe("tablecomp stem prefix (phase-03 FR4 — marker-exempt)", () => {
	it("builds the [table] prefix without a marker", () => {
		const stem = buildTableStem(2, 3, "Material", "Cost");
		expect(stem).toBe("[table] r2 c3: Material / Cost");
		expect(countBlanks(stem)).toBe(0);
	});
	it("round-trips through parseTableStem", () => {
		const ref = parseTableStem(buildTableStem(1, 2, "Row title", "Col title"));
		expect(ref).toEqual({
			row: 1,
			col: 2,
			rowTitle: "Row title",
			colTitle: "Col title",
		});
	});
	it("non-table stems parse to null", () => {
		expect(parseTableStem("Rains refill the ____ each year.")).toBeNull();
		expect(parseTableStem("")).toBeNull();
	});
	it("empty titles survive the round trip", () => {
		const ref = parseTableStem(buildTableStem(1, 1, "", ""));
		expect(ref).toEqual({ row: 1, col: 1, rowTitle: "", colTitle: "" });
	});
	it("a slash inside the column title stays in the column title", () => {
		const ref = parseTableStem(buildTableStem(1, 1, "Row", "North / South"));
		expect(ref).toEqual({
			row: 1,
			col: 1,
			rowTitle: "Row",
			colTitle: "North / South",
		});
	});
});

describe("table grid state (phase-03 FR4 — grid editor math)", () => {
	function gridWithPiston(): TableGridState {
		const state = emptyTableGrid(2, 3);
		return toggleTableCell(
			{
				...state,
				cells: [
					["piston", "boiler", ""],
					["", "", "valve"],
				],
			},
			0,
			1,
		);
	}

	it("starts empty with the given shape", () => {
		const state = emptyTableGrid(2, 3);
		expect(state.rowTitles).toEqual(["", ""]);
		expect(state.colTitles).toEqual(["", "", ""]);
		expect(state.cells).toEqual([
			["", "", ""],
			["", "", ""],
		]);
		expect(state.blanks).toEqual([]);
	});

	it("clicking a filled cell captures the answer and clears the cell", () => {
		const state = gridWithPiston();
		expect(state.blanks).toEqual([
			{ row: 0, col: 1, answer: "boiler", alts: "" },
		]);
		expect(state.cells[0][1]).toBe("");
	});
	it("clicking an empty cell is a no-op (no empty answers)", () => {
		const state = emptyTableGrid(2, 2);
		expect(toggleTableCell(state, 0, 0)).toBe(state);
	});
	it("clicking a blanked cell restores the content", () => {
		const state = gridWithPiston();
		const restored = toggleTableCell(state, 0, 1);
		expect(restored.blanks).toEqual([]);
		expect(restored.cells[0][1]).toBe("boiler");
	});
	it("editing a blanked cell is ignored (the answer lives in the blank)", () => {
		const state = gridWithPiston();
		const edited = updateTableCell(state, 0, 1, "typed over");
		expect(edited).toBe(state);
	});
	it("adding a row keeps blanks", () => {
		const state = addTableRow(gridWithPiston());
		expect(state.rowTitles.length).toBe(3);
		expect(state.cells.length).toBe(3);
		expect(state.blanks).toEqual([
			{ row: 0, col: 1, answer: "boiler", alts: "" },
		]);
	});
	it("removing a row drops its blanks and shifts later rows", () => {
		let state = gridWithPiston();
		state = toggleTableCell(state, 1, 2); // blank "valve" at row 1
		const next = removeTableRow(state, 0);
		expect(next.rowTitles.length).toBe(1);
		expect(next.blanks).toEqual([
			{ row: 0, col: 2, answer: "valve", alts: "" },
		]);
	});
	it("removing a column drops its blanks and shifts later columns", () => {
		const state = gridWithPiston();
		const next = removeTableCol(state, 0);
		expect(next.colTitles.length).toBe(2);
		expect(next.cells[0].length).toBe(2);
		expect(next.blanks).toEqual([
			{ row: 0, col: 0, answer: "boiler", alts: "" },
		]);
	});
	it("never removes the last row or column", () => {
		const state = emptyTableGrid(1, 1);
		expect(removeTableRow(state, 0)).toBe(state);
		expect(removeTableCol(state, 0)).toBe(state);
	});
	it("tableSegments emit 1-based positions and titles", () => {
		const state: TableGridState = {
			colTitles: ["Invention", "Year"],
			rowTitles: ["Steam engine", "Spinning jenny"],
			cells: [
				["", "1769"],
				["", "1764"],
			],
			blanks: [{ row: 0, col: 0, answer: "piston", alts: "" }],
		};
		expect(tableSegments(state)).toEqual([
			{
				stem: "[table] r1 c1: Steam engine / Invention",
				answer: "piston",
				alts: "",
			},
		]);
	});
	it("tableApplyIssues blocks over 40 blanks and over-long stems", () => {
		expect(tableApplyIssues(gridWithPiston())).toEqual([]);
		const many: TableGridState = {
			...emptyTableGrid(7, 7),
			blanks: Array.from({ length: 41 }, (_, index) => ({
				row: index % 7,
				col: Math.floor(index / 7) % 7,
				answer: "x",
				alts: "",
			})),
		};
		expect(tableApplyIssues(many).some((issue) => issue.includes("40"))).toBe(
			true,
		);
		const longTitle = "t".repeat(480);
		const longStem: TableGridState = {
			...emptyTableGrid(1, 1),
			rowTitles: [longTitle],
			colTitles: [longTitle],
			blanks: [{ row: 0, col: 0, answer: "x", alts: "" }],
		};
		const issues = tableApplyIssues(longStem);
		expect(issues.length).toBe(1);
		expect(issues[0]).toContain(String(QUESTION_STEM_MAX));
	});
});

describe("CLOZE_EDITOR_TYPES (phase-03 — 8 cloze types; tablecomp has its own grid)", () => {
	it("covers exactly the completion types that get the click-to-blank editor", async () => {
		const { CLOZE_EDITOR_TYPES, TABLECOMP_TYPE } = await import("./cloze");
		expect([...CLOZE_EDITOR_TYPES].sort()).toEqual(
			[
				"flow",
				"flowchart",
				"form",
				"note",
				"notes",
				"sent",
				"sent4",
				"summary",
			].sort(),
		);
		expect(TABLECOMP_TYPE).toBe("tablecomp");
		expect(CLOZE_EDITOR_TYPES.has("shortans")).toBe(false);
		expect(CLOZE_EDITOR_TYPES.has("tablecomp")).toBe(false);
	});
});
