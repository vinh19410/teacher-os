import { inferQuestionTypes } from "@teacher-os/api/lib/infer-question-types";
import { describe, expect, test } from "vitest";

type Q = Parameters<typeof inferQuestionTypes>[0][number];

function q(partial: Partial<Q> = {}): Q {
	return {
		stem: "The roof was made of wood.",
		opts: null,
		answer: "TRUE",
		type: null,
		pin: null,
		...partial,
	};
}

/** Câu note-completion có marker ô trống. */
function blank(answer = "timber"): Q {
	return q({ stem: "Houses used ____ frames.", answer });
}

describe("inferQuestionTypes", () => {
	test("answers named like Object.prototype members are not treated as TFNG", () => {
		const questions = [
			q({ answer: "constructor" }),
			q({ answer: "toString" }),
			q({ answer: "__proto__" }),
			q({ answer: "hasOwnProperty" }),
		];
		expect(inferQuestionTypes(questions, "note")).toEqual([
			"note",
			"note",
			"note",
			"note",
		]);
	});

	test("note prompt: markerless TFNG answers become tfng, blanks stay note", () => {
		const questions = [
			q({ answer: "FALSE" }),
			q({ answer: "TRUE" }),
			q({ answer: "NOT GIVEN" }),
			q({ answer: "FALSE" }),
			blank(),
			blank(),
			blank(),
			blank(),
		];
		expect(inferQuestionTypes(questions, "note")).toEqual([
			"tfng",
			"tfng",
			"tfng",
			"tfng",
			"note",
			"note",
			"note",
			"note",
		]);
	});

	test("run containing YES/NO family becomes ynng, including NOT GIVEN", () => {
		const types = inferQuestionTypes(
			[q({ answer: "YES" }), q({ answer: "NOT GIVEN" }), q({ answer: "NO" })],
			"note",
		);
		expect(types).toEqual(["ynng", "ynng", "ynng"]);
	});

	test("run of only NOT GIVEN defaults to tfng", () => {
		const types = inferQuestionTypes(
			[q({ answer: "NOT GIVEN" }), q({ answer: "NOT GIVEN" })],
			"note",
		);
		expect(types).toEqual(["tfng", "tfng"]);
	});

	test("explicit question type is kept even when the answer looks like TFNG", () => {
		const types = inferQuestionTypes(
			[q({ type: "mcq", answer: "TRUE" }), q({ answer: "TRUE" })],
			"note",
		);
		expect(types).toEqual(["mcq", "tfng"]);
	});

	test("choice-kind prompt type is returned untouched for untyped questions", () => {
		const types = inferQuestionTypes(
			[q({ answer: "TRUE" }), q({ stem: "plain", answer: "whatever" })],
			"tfng",
		);
		expect(types).toEqual(["tfng", "tfng"]);
	});

	test("lowercase answer is not inferred", () => {
		expect(inferQuestionTypes([q({ answer: "true" })], "note")).toEqual([
			"note",
		]);
	});

	test("stem with a marker is not inferred", () => {
		const types = inferQuestionTypes(
			[q({ stem: "It was ____ built.", answer: "TRUE" })],
			"note",
		);
		expect(types).toEqual(["note"]);
	});

	test("question with opts is not inferred", () => {
		const types = inferQuestionTypes(
			[q({ opts: ["A", "B"], answer: "TRUE" })],
			"note",
		);
		expect(types).toEqual(["note"]);
	});

	test("empty opts array still counts as no opts", () => {
		expect(inferQuestionTypes([q({ opts: [] })], "note")).toEqual(["tfng"]);
	});

	test("question with pin is not inferred", () => {
		const types = inferQuestionTypes(
			[q({ pin: { x: 1, y: 2 }, answer: "TRUE" })],
			"note",
		);
		expect(types).toEqual(["note"]);
	});

	test("answer is trimmed before matching", () => {
		expect(inferQuestionTypes([q({ answer: "  NOT GIVEN " })], "note")).toEqual(
			["tfng"],
		);
	});

	test("tablecomp, shortans and removed prompt (empty type) are never inferred", () => {
		const table = q({ stem: "[table] r1 c1: x", answer: "YES" });
		expect(inferQuestionTypes([table], "tablecomp")).toEqual(["tablecomp"]);
		expect(inferQuestionTypes([q({ answer: "TRUE" })], "shortans")).toEqual([
			"shortans",
		]);
		expect(inferQuestionTypes([q({ answer: "TRUE" })], "")).toEqual([""]);
	});

	test("mixed families split the run per family; NOT GIVEN joins the YES side", () => {
		expect(
			inferQuestionTypes(
				[q({ answer: "TRUE" }), q({ answer: "YES" }), q({ answer: "FALSE" })],
				"note",
			),
		).toEqual(["tfng", "ynng", "tfng"]);

		expect(
			inferQuestionTypes(
				[
					q({ answer: "YES" }),
					q({ answer: "NOT GIVEN" }),
					q({ answer: "YES" }),
				],
				"note",
			),
		).toEqual(["ynng", "ynng", "ynng"]);
	});

	test("two TFNG runs separated by a blank are decided independently", () => {
		const types = inferQuestionTypes(
			[
				q({ answer: "TRUE" }),
				q({ answer: "NOT GIVEN" }),
				blank(),
				q({ answer: "YES" }),
				q({ answer: "NOT GIVEN" }),
			],
			"note",
		);
		expect(types).toEqual(["tfng", "tfng", "note", "ynng", "ynng"]);
	});

	test("empty questions returns empty array", () => {
		expect(inferQuestionTypes([], "note")).toEqual([]);
	});
});
