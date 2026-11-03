import {
	ASSIGNMENT_IMAGE_BASED_TYPES,
	ASSIGNMENT_OPTION_BANK_TYPES,
	ASSIGNMENT_PART_TYPES,
	ASSIGNMENT_SKILLS,
	answerKindByType,
	isOptionBankable,
} from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";

import {
	answerChoices,
	BANKABLE_PAIRS,
	bankLabel,
	emptyComposer,
	emptyItem,
	IMAGE_BASED_PAIRS,
	isAutoSkill,
	isBankableType,
	isImageBased,
	KIND,
	kindOf,
	partOf,
	qStartOf,
	SKILLS,
	skillOf,
	TYPE_HINTS,
	typeOf,
	wordCount,
} from "./assignment-presets";

describe("assignment presets catalog (#218 v5)", () => {
	test("catalog shape: 6 skills, 14 parts, 43 types total with breakdown per skill", () => {
		expect(SKILLS).toHaveLength(6);
		expect(SKILLS.map((s) => s.id)).toEqual(ASSIGNMENT_SKILLS);

		const writing = skillOf("writing");
		const reading = skillOf("reading");
		const listening = skillOf("listening");
		const speaking = skillOf("speaking");
		const grammar = skillOf("grammar");
		const vocabulary = skillOf("vocabulary");

		expect(writing.parts).toHaveLength(2);
		expect(reading.parts).toHaveLength(3);
		expect(listening.parts).toHaveLength(4);
		expect(speaking.parts).toHaveLength(3);
		expect(grammar.parts).toHaveLength(1);
		expect(vocabulary.parts).toHaveLength(1);

		const totalParts = SKILLS.reduce((sum, s) => sum + s.parts.length, 0);
		expect(totalParts).toBe(14);

		const writingTypes = writing.parts.reduce(
			(sum, p) => sum + p.types.length,
			0,
		);
		const readingTypes = reading.parts.reduce(
			(sum, p) => sum + p.types.length,
			0,
		);
		const listeningTypes = listening.parts.reduce(
			(sum, p) => sum + p.types.length,
			0,
		);
		const speakingTypes = speaking.parts.reduce(
			(sum, p) => sum + p.types.length,
			0,
		);
		const grammarTypes = grammar.parts.reduce(
			(sum, p) => sum + p.types.length,
			0,
		);
		const vocabularyTypes = vocabulary.parts.reduce(
			(sum, p) => sum + p.types.length,
			0,
		);

		expect(writingTypes).toBe(8); // task1 (4) + task2 (4)
		expect(readingTypes).toBe(14); // p1 (5) + p2 (5) + p3 (4) — #269
		expect(listeningTypes).toBe(8); // s1 (2) + s2 (2) + s3 (2) + s4 (2)
		expect(speakingTypes).toBe(7); // part1 (2) + part2 (3) + part3 (2)
		expect(grammarTypes).toBe(3); // g1 (3)
		expect(vocabularyTypes).toBe(3); // v1 (3)

		const totalTypes =
			writingTypes +
			readingTypes +
			listeningTypes +
			speakingTypes +
			grammarTypes +
			vocabularyTypes;
		expect(totalTypes).toBe(43);
	});

	test("catalog ids match ASSIGNMENT_PART_TYPES whitelist from @teacher-os/api/contracts", () => {
		for (const skill of SKILLS) {
			const config = ASSIGNMENT_PART_TYPES[skill.id];
			expect(config).toBeDefined();
			expect(skill.parts.map((p) => p.id)).toEqual([...config.parts]);

			for (const part of skill.parts) {
				const expectedTypes = config.types[part.id];
				expect(expectedTypes).toBeDefined();
				expect(part.types.map((t) => t.id)).toEqual([...expectedTypes]);
			}
		}
	});

	test("kindOf maps type ids to correct answer kinds", () => {
		expect(kindOf("tfng")).toBe("tfng");
		expect(kindOf("ynng")).toBe("ynng");
		expect(kindOf("mcq")).toBe("mcq4");
		expect(kindOf("mcq1")).toBe("mcq3");
		expect(kindOf("mcq3")).toBe("mcq3");
		expect(kindOf("headings")).toBe("roman");
		expect(kindOf("info")).toBe("letter");
		expect(kindOf("map")).toBe("letter");
		expect(kindOf("match2")).toBe("letter");
		expect(kindOf("sent")).toBe("text");
		expect(kindOf("form")).toBe("text");
		expect(kindOf("notes")).toBe("text");
		expect(kindOf("flow")).toBe("text");
		expect(kindOf("sent4")).toBe("text");
		expect(kindOf("note")).toBe("text");
		expect(kindOf("shortans")).toBe("text");
		expect(kindOf("diagram")).toBe("text");
		expect(kindOf("summary")).toBe("text");
		expect(kindOf("tablecomp")).toBe("text");
		expect(kindOf("flowchart")).toBe("text");
		expect(kindOf("sentend")).toBe("letter");
		expect(kindOf("features")).toBe("letter");
		expect(kindOf("match")).toBe("letter");
		expect(kindOf("gap")).toBe("text");
		expect(kindOf("transform")).toBe("text");
		expect(kindOf("unknown")).toBe("text");
	});

	test("web KIND stays in sync with the exported server answerKindByType (#269)", () => {
		const allTypeIds = Object.values(ASSIGNMENT_PART_TYPES).flatMap((config) =>
			Object.values(config.types).flat(),
		);
		expect(allTypeIds.length).toBe(43);
		for (const typeId of allTypeIds) {
			// Both sides fall back to text for types without an explicit entry.
			const serverKind = answerKindByType[typeId] ?? "text";
			expect(KIND[typeId] ?? "text", typeId).toBe(serverKind);
		}
	});

	test("TYPE_HINTS carries official IELTS instructions for the 8 new reading types (#269)", () => {
		const newIds = [
			"note",
			"shortans",
			"diagram",
			"summary",
			"sentend",
			"tablecomp",
			"features",
			"flowchart",
		];
		for (const id of newIds) {
			expect(TYPE_HINTS[id], id).toBeTruthy();
		}
		// Word-limit clauses per the official task instructions.
		expect(TYPE_HINTS.diagram).toContain("MỘT TỪ");
		expect(TYPE_HINTS.note).toContain("BA TỪ");
		// Phase-02 FR5: the matching types key answers from the structured
		// option-bank editor — the placeholder must NOT ask the teacher to
		// list the A–H bank inside the intro anymore.
		expect(TYPE_HINTS.features).not.toContain("Liệt kê");
		expect(TYPE_HINTS.sentend).not.toContain("Liệt kê");
		expect(TYPE_HINTS.features).not.toContain("tại đây");
		expect(TYPE_HINTS.sentend).not.toContain("tại đây");
		// Existing types keep their current (empty) placeholder behavior.
		expect(TYPE_HINTS.tfng).toBeUndefined();
		expect(TYPE_HINTS.sent).toBeUndefined();
	});

	test("qStartOf calculates question start numbers by skill and part", () => {
		// Reading
		expect(qStartOf("reading", "p1")).toBe(1);
		expect(qStartOf("reading", "p2")).toBe(14);
		expect(qStartOf("reading", "p3")).toBe(27);

		// Listening
		expect(qStartOf("listening", "s1")).toBe(1);
		expect(qStartOf("listening", "s2")).toBe(11);
		expect(qStartOf("listening", "s3")).toBe(21);
		expect(qStartOf("listening", "s4")).toBe(31);

		// Writing & Speaking default to 1
		expect(qStartOf("writing", "task1")).toBe(1);
		expect(qStartOf("writing", "task2")).toBe(1);
		expect(qStartOf("speaking", "part1")).toBe(1);
		expect(qStartOf("grammar", "g1")).toBe(1);
		expect(qStartOf("vocabulary", "v1")).toBe(1);
	});

	test("answerChoices returns choice lists for choice kinds and null for text", () => {
		expect(answerChoices("tfng")).toEqual(["TRUE", "FALSE", "NOT GIVEN"]);
		expect(answerChoices("ynng")).toEqual(["YES", "NO", "NOT GIVEN"]);
		expect(answerChoices("mcq4")).toEqual(["A", "B", "C", "D"]);
		expect(answerChoices("mcq3")).toEqual(["A", "B", "C"]);
		expect(answerChoices("roman")).toHaveLength(8);
		expect(answerChoices("letter")).toHaveLength(8);
		expect(answerChoices("text")).toBeNull();
	});

	test("emptyItem generates empty question item with opts sized for kind", () => {
		const mcq4Item = emptyItem("mcq");
		expect(mcq4Item.opts).toEqual(["", "", "", ""]);
		expect(mcq4Item.stem).toBe("");
		expect(mcq4Item.answer).toBe("");

		const mcq3Item = emptyItem("mcq1");
		expect(mcq3Item.opts).toEqual(["", "", ""]);

		const textItem = emptyItem("sent");
		expect(textItem.opts).toBeNull();
	});

	test("catalog carries no hardcoded sample content", () => {
		const catalog = JSON.stringify(SKILLS);
		expect(catalog).not.toContain("Cambridge");
		expect(catalog).not.toContain("Stepwells");
		expect(catalog).not.toContain("Some people think");
		for (const skill of SKILLS) {
			expect(skill).not.toHaveProperty("source");
			for (const part of skill.parts) {
				expect(part).not.toHaveProperty("passage");
				for (const type of part.types) {
					expect(Object.keys(type).sort()).toEqual(["id", "label"]);
				}
			}
		}
	});

	test("emptyComposer returns blank content for every skill", () => {
		for (const skill of SKILLS) {
			for (const part of skill.parts) {
				for (const type of part.types) {
					const blank = emptyComposer(skill.id, type.id);
					expect(blank.title).toBe("");
					expect(blank.source).toBe("");
					expect(blank.prompt).toBe("");
					expect(blank.passage).toBe("");
					expect(blank.intro).toBe("");
					expect(blank.transcript).toBe("");
					expect(blank.cueTopic).toBe("");
					expect(blank.cuePoints).toBe("");
					expect(blank.audioName).toBe("");
					expect(blank.imageUrl).toBe("");
					expect(blank.note).toBe("");
					// Phase-02 FR3: the option bank starts empty for every type.
					expect(blank.optionBank).toEqual([]);
					if (isAutoSkill(skill.id)) {
						expect(blank.items).toEqual([emptyItem(type.id)]);
					} else {
						expect(blank.items).toEqual([]);
					}
				}
			}
		}
	});

	describe("option bank helpers (phase-02 FR3)", () => {
		test("BANKABLE_PAIRS mirrors the contracts skill-qualified set exactly", () => {
			const fromContracts = new Set(
				Object.entries(ASSIGNMENT_OPTION_BANK_TYPES).flatMap(([skill, types]) =>
					types.map((type) => `${skill}:${type}`),
				),
			);
			expect([...BANKABLE_PAIRS].sort()).toEqual([...fromContracts].sort());
			expect(BANKABLE_PAIRS.size).toBe(7);
			// Spot-check the red-team #1 trap: writing task1 shares the `map`
			// type id but must never be bankable.
			expect(BANKABLE_PAIRS.has("writing:map")).toBe(false);
			expect(BANKABLE_PAIRS.has("listening:map")).toBe(true);
			expect(BANKABLE_PAIRS.has("vocabulary:match")).toBe(true);
		});

		describe("image pin helpers (phase-04 FR2)", () => {
			test("IMAGE_BASED_PAIRS mirrors the contracts skill-qualified set exactly", () => {
				const fromContracts = new Set(
					Object.entries(ASSIGNMENT_IMAGE_BASED_TYPES).flatMap(
						([skill, types]) => types.map((type) => `${skill}:${type}`),
					),
				);
				expect([...IMAGE_BASED_PAIRS].sort()).toEqual(
					[...fromContracts].sort(),
				);
				expect(IMAGE_BASED_PAIRS.size).toBe(2);
				// The red-team #1 trap again: writing task1 `map` is prompt-only and
				// never image-gated; listening s2 `map` is.
				expect(IMAGE_BASED_PAIRS.has("writing:map")).toBe(false);
				expect(IMAGE_BASED_PAIRS.has("listening:map")).toBe(true);
				expect(IMAGE_BASED_PAIRS.has("reading:diagram")).toBe(true);
			});

			test("isImageBased is skill-qualified", () => {
				expect(isImageBased("reading", "diagram")).toBe(true);
				expect(isImageBased("listening", "map")).toBe(true);
				expect(isImageBased("writing", "map")).toBe(false);
				expect(isImageBased("reading", "map")).toBe(false);
			});
		});

		test("isBankableType is skill-qualified", () => {
			expect(isBankableType("reading", "headings")).toBe(true);
			expect(isBankableType("reading", "info")).toBe(true);
			expect(isBankableType("reading", "sentend")).toBe(true);
			expect(isBankableType("reading", "features")).toBe(true);
			expect(isBankableType("listening", "match2")).toBe(true);
			expect(isBankableType("listening", "map")).toBe(true);
			expect(isBankableType("vocabulary", "match")).toBe(true);
			expect(isBankableType("grammar", "mcq")).toBe(false);
			expect(isBankableType("writing", "map")).toBe(false);
			expect(isBankableType("writing", "discuss")).toBe(false);
			expect(isBankableType("reading", "tfng")).toBe(false);
			expect(isBankableType("reading", "diagram")).toBe(false);
			expect(isBankableType("unknown", "headings")).toBe(false);
			// Stay in sync with the contracts helper itself.
			for (const skill of SKILLS) {
				for (const part of skill.parts) {
					for (const type of part.types) {
						expect(isBankableType(skill.id, type.id)).toBe(
							isOptionBankable(skill.id, type.id),
						);
					}
				}
			}
		});

		test("bankLabel derives positional labels: A–H for letter, i–viii for roman", () => {
			expect(bankLabel("letter", 0)).toBe("A");
			expect(bankLabel("letter", 7)).toBe("H");
			expect(bankLabel("roman", 0)).toBe("i");
			expect(bankLabel("roman", 7)).toBe("viii");
			// Beyond the alphabet or a non-bankable kind: no label.
			expect(bankLabel("letter", 8)).toBe("");
			expect(bankLabel("roman", 8)).toBe("");
			expect(bankLabel("tfng", 0)).toBe("");
			expect(bankLabel("text", 0)).toBe("");
		});
	});

	test("helper fallbacks with unknown ids do not crash", () => {
		expect(skillOf("unknown_skill").id).toBe("writing");
		expect(partOf("writing", "unknown_part").id).toBe("task1");
		expect(typeOf("writing", "task1", "unknown_type").id).toBe("chart");
		expect(kindOf("unknown_type")).toBe("text");
		expect(qStartOf("unknown_skill", "unknown_part")).toBe(1);
	});

	test("wordCount counts whitespace-separated words", () => {
		expect(wordCount("")).toBe(0);
		expect(wordCount("   ")).toBe(0);
		expect(wordCount("  a  b c ")).toBe(3);
	});
});
