import {
	ASSIGNMENT_PART_TYPES,
	ASSIGNMENT_SKILLS,
} from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";

import {
	answerChoices,
	compositionDefaults,
	emptyItem,
	kindOf,
	partOf,
	qStartOf,
	SKILLS,
	skillOf,
	typeOf,
	wordCount,
} from "./assignment-presets";

describe("assignment presets catalog (#218 v5)", () => {
	test("catalog shape: 4 skills, 12 parts, 29 types total with breakdown per skill", () => {
		expect(SKILLS).toHaveLength(4);
		expect(SKILLS.map((s) => s.id)).toEqual(ASSIGNMENT_SKILLS);

		const writing = skillOf("writing");
		const reading = skillOf("reading");
		const listening = skillOf("listening");
		const speaking = skillOf("speaking");

		expect(writing.parts).toHaveLength(2);
		expect(reading.parts).toHaveLength(3);
		expect(listening.parts).toHaveLength(4);
		expect(speaking.parts).toHaveLength(3);

		const totalParts = SKILLS.reduce((sum, s) => sum + s.parts.length, 0);
		expect(totalParts).toBe(12);

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

		expect(writingTypes).toBe(8); // task1 (4) + task2 (4)
		expect(readingTypes).toBe(6); // p1 (2) + p2 (2) + p3 (2)
		expect(listeningTypes).toBe(8); // s1 (2) + s2 (2) + s3 (2) + s4 (2)
		expect(speakingTypes).toBe(7); // part1 (2) + part2 (3) + part3 (2)

		const totalTypes =
			writingTypes + readingTypes + listeningTypes + speakingTypes;
		expect(totalTypes).toBe(29);
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
		expect(kindOf("unknown")).toBe("text");
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

	test("helper fallbacks with unknown ids do not crash", () => {
		expect(skillOf("unknown_skill").id).toBe("writing");
		expect(partOf("writing", "unknown_part").id).toBe("task1");
		expect(typeOf("writing", "task1", "unknown_type").id).toBe("chart");
		expect(kindOf("unknown_type")).toBe("text");
		expect(qStartOf("unknown_skill", "unknown_part")).toBe(1);
	});

	test("compositionDefaults respects dirty flags", () => {
		const clean = compositionDefaults(
			"writing",
			"task2",
			"discuss",
			false,
			false,
		);
		expect(clean.title).toContain("Discuss both views");
		expect(clean.prompt).toContain("Some people think");

		const dirty = compositionDefaults(
			"writing",
			"task2",
			"discuss",
			true,
			true,
		);
		expect(dirty.title).toBe("");
		expect(dirty.prompt).toBe("");

		// Legacy calling signature compatibility
		const legacyClean = compositionDefaults("task2", "discuss", false, false);
		expect(legacyClean.title).toContain("Discuss both views");
	});

	test("spot-check verbatim design template for Reading Passage 1 TFNG", () => {
		const tfng = typeOf("reading", "p1", "tfng");

		expect(tfng.title).toBe("Reading Passage 1 — True/False/Not Given");
		expect(tfng.items).toBeDefined();
		expect(tfng.items?.[0].answer).toBe("FALSE");
		expect(tfng.items?.[0].stem).toBe(
			"Stepwells were first built in the twentieth century.",
		);
		expect(tfng.intro).toContain("TRUE if the statement agrees");
	});

	test("wordCount counts whitespace-separated words", () => {
		expect(wordCount("")).toBe(0);
		expect(wordCount("   ")).toBe(0);
		expect(wordCount("  a  b c ")).toBe(3);
	});
});
