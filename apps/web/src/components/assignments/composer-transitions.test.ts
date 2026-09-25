import { describe, expect, test } from "vitest";

import {
	emptyComposer,
	emptyItem,
} from "./assignment-presets";
import type { ComposerValue } from "./prompt-composer";
import {
	applyComposerFieldChange,
	hasAuthoringContent,
	structuralChangeKind,
} from "./composer-transitions";

function composer(overrides: Partial<ComposerValue> = {}): ComposerValue {
	return {
		...fresh(),
		...overrides,
	};
}

function fresh(): ComposerValue {
	return {
		skill: "reading",
		part: "p1",
		type: "tfng",
		title: "",
		band: "7.0",
		source: "",
		prompt: "",
		passage: "",
		intro: "",
		transcript: "",
		cueTopic: "",
		cuePoints: "",
		audioName: "",
		imageUrl: "",
		note: "",
		items: [emptyItem("tfng")],
	};
}

const authored = composer({
	passage: "Stepwells are underground reservoirs…",
	intro: "Questions 1–4",
	transcript: "",
	items: [
		{ stem: "First", answer: "TRUE", opts: null, alts: "" },
		{ stem: "Second", answer: "", opts: null, alts: "" },
	],
});

describe("structuralChangeKind (FR5 confirm gate)", () => {
	test("returns null for non-structural patches", () => {
		expect(structuralChangeKind(authored, { title: "x" })).toBeNull();
		expect(structuralChangeKind(authored, {})).toBeNull();
	});

	test("returns null when ChipFilter re-fires the already-selected option", () => {
		expect(structuralChangeKind(authored, { part: "p1", type: "tfng" })).toBeNull();
		expect(
			structuralChangeKind(authored, {
				skill: "reading",
				part: "p1",
				type: "tfng",
			}),
		).toBeNull();
	});

	test("classifies part and type changes; skill outranks part", () => {
		expect(structuralChangeKind(authored, { part: "p2", type: "headings" })).toBe("part");
		expect(structuralChangeKind(authored, { type: "sent" })).toBe("type");
		expect(
			structuralChangeKind(authored, { skill: "listening", part: "s1", type: "form" }),
		).toBe("skill");
	});
});

describe("hasAuthoringContent (FR5 confirm gate)", () => {
	test("bare meta fields (title/source/band/note) do not require a confirm", () => {
		expect(hasAuthoringContent(composer({ title: "Đề 1", source: "Cam" }))).toBe(false);
		expect(hasAuthoringContent(composer({ note: "ghi chú" }))).toBe(false);
	});

	test("items, passage, prompt, intro, transcript and cue content do", () => {
		expect(hasAuthoringContent(composer({ items: [{ stem: "s", answer: "", opts: null, alts: "" }] }))).toBe(true);
		expect(hasAuthoringContent(composer({ items: [{ stem: "", answer: "A", opts: null, alts: "" }] }))).toBe(true);
		expect(hasAuthoringContent(composer({ passage: "text" }))).toBe(true);
		expect(hasAuthoringContent(composer({ prompt: "text" }))).toBe(true);
		expect(hasAuthoringContent(composer({ intro: "Questions 1–3" }))).toBe(true);
		expect(hasAuthoringContent(composer({ transcript: "W: …" }))).toBe(true);
		expect(hasAuthoringContent(composer({ cueTopic: "A place" }))).toBe(true);
		expect(hasAuthoringContent(composer({ cuePoints: "You should say…" }))).toBe(true);
		expect(hasAuthoringContent(composer())).toBe(false);
	});
});

describe("applyComposerFieldChange — carry-over rules (FR5)", () => {
	test("same-skill part/type change keeps transcript, resets intro/items/imageUrl (#269 semantics + FR5)", () => {
		const reading = composer({
			intro: "Questions 1–4",
			transcript: "Note: transcript carries over within one skill",
			items: [{ stem: "First", answer: "TRUE", opts: null, alts: "" }],
		});
		const next = applyComposerFieldChange(reading, { part: "p2", type: "headings" });
		expect(next.part).toBe("p2");
		expect(next.type).toBe("headings");
		expect(next.transcript).toBe("Note: transcript carries over within one skill");
		expect(next.intro).toBe("");
		expect(next.items).toEqual([emptyItem("headings")]);
	});

	test("same-skill type change preserves a filled transcript", () => {
		const listening = composer({
			skill: "listening",
			part: "s1",
			type: "form",
			transcript: "W: Good morning…",
			intro: "Complete the form",
			items: [{ stem: "Name:", answer: "", opts: null, alts: "" }],
		});
		const next = applyComposerFieldChange(listening, { type: "mcq1" });
		expect(next.transcript).toBe("W: Good morning…");
		expect(next.intro).toBe("");
		expect(next.imageUrl).toBe("");
		expect(next.items).toEqual([emptyItem("mcq1")]);
		expect(next.passage).toBe("");
		// prompt/title survive the part/type reset (existing #269 behavior).
	});

	test("skill change goes through emptyComposer: full wipe including transcript", () => {
		const listening = composer({
			skill: "listening",
			part: "s1",
			type: "form",
			transcript: "W: Good morning…",
			prompt: "",
			title: "QC draft",
		});
		const next = applyComposerFieldChange(listening, {
			skill: "writing",
			part: "task2",
			type: "discuss",
		});
		expect(next.transcript).toBe("");
		expect(next.items).toEqual([]);
		expect(next.title).toBe("");
		expect(next.passage).toBe("");
		expect(next.type).toBe("discuss");
	});

	test("skill change with explicit type in the patch composes the right empty item", () => {
		const next = applyComposerFieldChange(composer(), {
			skill: "listening",
			part: "s1",
			type: "form",
		});
		expect(next.items).toEqual([emptyItem("form")]);
		expect(next.skill).toBe("listening");
	});

	test("ChipFilter re-fire for the same option is a plain merge — nothing is wiped (#269 guard)", () => {
		const next = applyComposerFieldChange(authored, { part: "p1", type: "tfng" });
		expect(next).toEqual(authored);
	});

	test("plain field patch merges without touching composed content", () => {
		const next = applyComposerFieldChange(authored, { title: "QC-218" });
		expect(next.title).toBe("QC-218");
		expect(next.items).toEqual(authored.items);
		expect(next.intro).toBe(authored.intro);
	});

	test("emptyComposer parity: skill-change result matches emptyComposer keys", () => {
		const next = applyComposerFieldChange(authored, {
			skill: "writing",
			part: "task2",
			type: "discuss",
		});
		expect(next).toEqual({
			...authored,
			...emptyComposer("writing", "discuss"),
			skill: "writing",
			part: "task2",
			type: "discuss",
		});
	});
});
