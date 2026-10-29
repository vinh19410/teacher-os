import type { AssignmentQuestion } from "@teacher-os/api/contracts";
import type { LibraryPartInput } from "@teacher-os/api/library-contracts";
import { describe, expect, it } from "vitest";
import {
	type LibraryQuizView,
	libraryPartToQuizView,
} from "./library-quiz-preview";

/** Câu soạn đầy đủ key (answer/alts/explanation mang canary để assert strip). */
const question = (
	stem: string,
	overrides: Partial<AssignmentQuestion> = {},
): AssignmentQuestion => ({
	stem,
	opts: null,
	answer: `CANARY-KEY-${stem}`,
	alts: "",
	...(overrides.type ? { type: overrides.type } : {}),
	...(overrides.pin ? { pin: overrides.pin } : {}),
	...(overrides.explanation ? { explanation: `CANARY-EXPLAIN-${stem}` } : {}),
});

const partInput = (
	overrides: Partial<LibraryPartInput> = {},
): LibraryPartInput => ({
	part: "p1",
	type: "tfng",
	title: "Part 1",
	band: "7.0",
	source: "",
	intro: "<p>Intro preamble CANARY-INTRO</p>",
	passage: "<p>Passage CANARY-PASSAGE</p>",
	transcript: "<p>CANARY-TRANSCRIPT</p>",
	imageUrl: "",
	questions: [question("q1"), question("q2"), question("q3")],
	optionBank: [],
	note: "<p>CANARY-NOTE</p>",
	audioName: "audio.mp3",
	groups: [],
	...overrides,
});

const opts = (view: LibraryQuizView) => {
	// JSON toàn view — canary ở bất kỳ đâu (kể cả key lẫn value) đều là lộ.
	return JSON.stringify(view);
};

describe("libraryPartToQuizView — part không nhóm (nhóm ngầm)", () => {
	it("detail đúng fields, intro/passage/audioName/imageUrl passthrough, không note", () => {
		const view = libraryPartToQuizView(partInput(), {
			skill: "reading",
			qOffset: 0,
		});
		expect(view.detail).toEqual({
			skill: "reading",
			type: "tfng",
			band: "7.0",
			intro: "<p>Intro preamble CANARY-INTRO</p>",
			prompt: "",
			passage: "<p>Passage CANARY-PASSAGE</p>",
			cueTopic: "",
			cuePoints: "",
			audioName: "audio.mp3",
			imageUrl: "",
			optionBank: [],
		});
		expect("note" in view.detail).toBe(false);
	});

	it("strip key: view không chứa answer/alts/explanation/transcript/note (canary)", () => {
		const view = libraryPartToQuizView(
			partInput({
				questions: [question("q1", { explanation: "y" }), question("q2")],
			}),
			{ skill: "reading", qOffset: 0 },
		);
		const json = opts(view);
		expect(json).not.toContain("CANARY-KEY");
		expect(json).not.toContain("CANARY-EXPLAIN");
		expect(json).not.toContain("CANARY-TRANSCRIPT");
		expect(json).not.toContain("CANARY-NOTE");
	});

	it("pure: input deep-equal trước/sau lời gọi (savedInputs dùng chung)", () => {
		const input = partInput({
			questions: [
				question("q1", { explanation: "y", pin: { x: 10, y: 20 } }),
				question("q2"),
			],
		});
		const snapshot = structuredClone(input);
		libraryPartToQuizView(input, { skill: "reading", qOffset: 0 });
		expect(input).toEqual(snapshot);
	});

	it("câu stem rỗng giữ vị trí — không lọc (RT14)", () => {
		const input = partInput({
			questions: [question("q1"), question(""), question("q3")],
		});
		const view = libraryPartToQuizView(input, {
			skill: "reading",
			qOffset: 0,
		});
		expect(view.parts).toHaveLength(1);
		expect(view.parts[0]?.questions.map((q) => q.q)).toEqual([0, 1, 2]);
		expect(view.parts[0]?.questions[1]?.stem).toBe("");
	});

	it("part-level optionBank passthrough khi không có nhóm", () => {
		const view = libraryPartToQuizView(
			partInput({ optionBank: ["River", "Mountain"] }),
			{ skill: "reading", qOffset: 0 },
		);
		expect(view.detail.optionBank).toEqual(["River", "Mountain"]);
	});
});

describe("libraryPartToQuizView — part có nhóm (groups)", () => {
	const grouped = partInput({
		type: "headings",
		questions: [
			question("h1", { type: "headings" }),
			question("h2", { type: "headings" }),
			// Câu chưa khai type ở nhóm sau — phải nhận type NHÓM, không phải type đề (RT9).
			question("n1"),
			question("n2", { type: "note" }),
		],
		groups: [
			{
				id: "g1",
				type: "headings",
				instruction: "<p>Chọn heading</p>",
				startIndex: 0,
				count: 2,
				optionBank: ["I", "II", "III"],
				answersInline: false,
				splitContent: false,
				dragDrop: false,
			},
			{
				id: "g2",
				type: "note",
				instruction: "<p>Hoàn thành notes</p>",
				startIndex: 2,
				count: 2,
				optionBank: [],
				answersInline: true,
				splitContent: false,
				dragDrop: true,
			},
		],
	});

	it("mỗi nhóm thành 1 QuizPart: type, instruction, bank riêng, source group", () => {
		const view = libraryPartToQuizView(grouped, {
			skill: "reading",
			qOffset: 0,
		});
		expect(view.parts).toHaveLength(2);
		expect(view.parts[0]).toMatchObject({
			label: "Questions 1–2",
			qStart: 1,
			typeId: "headings",
			instructionHtml: "<p>Chọn heading</p>",
			optionBank: ["I", "II", "III"],
			source: "group",
		});
		expect(view.parts[1]).toMatchObject({
			label: "Questions 3–4",
			qStart: 3,
			typeId: "note",
			source: "group",
		});
		expect(view.parts[1]?.optionBank).toBeUndefined();
	});

	it("câu nhóm sau chưa khai type nhận type nhóm đó (infer per-group — RT9)", () => {
		const view = libraryPartToQuizView(grouped, {
			skill: "reading",
			qOffset: 0,
		});
		expect(view.parts[1]?.questions.map((q) => q.type)).toEqual([
			"note",
			"note",
		]);
	});

	it("detail.optionBank rỗng khi có nhóm (schema cấm bank part-level)", () => {
		const view = libraryPartToQuizView(grouped, {
			skill: "reading",
			qOffset: 0,
		});
		expect(view.detail.optionBank).toEqual([]);
	});

	it("qOffset > 0: q/number/qStart/nhãn toàn đề (multi-part #433)", () => {
		const view = libraryPartToQuizView(grouped, {
			skill: "reading",
			qOffset: 13,
		});
		expect(view.parts[0]).toMatchObject({
			label: "Questions 14–15",
			qStart: 14,
		});
		expect(view.parts[0]?.questions.map((q) => q.q)).toEqual([13, 14]);
		expect(view.parts[0]?.questions.map((q) => q.number)).toEqual([14, 15]);
		expect(view.parts[1]).toMatchObject({
			label: "Questions 16–17",
			qStart: 16,
		});
	});

	it("pin câu giữ nguyên qua mapping", () => {
		const input = partInput({
			questions: [question("p1", { pin: { x: 5, y: 6 } })],
		});
		const view = libraryPartToQuizView(input, {
			skill: "listening",
			qOffset: 2,
		});
		expect(view.parts[0]?.questions[0]?.pin).toEqual({ x: 5, y: 6 });
		expect(view.parts[0]?.questions[0]?.q).toBe(2);
	});

	it("unsupportedGroupFlags liệt kê nhóm bật cờ chưa hỗ trợ (D7)", () => {
		const view = libraryPartToQuizView(grouped, {
			skill: "reading",
			qOffset: 0,
		});
		expect(view.unsupportedGroupFlags).toEqual([
			{ groupLabel: "Questions 3–4", flags: ["answersInline", "dragDrop"] },
		]);
	});

	it("intro passthrough nguyên vẹn (QuizPaper quyết cắt — mapping không cắt)", () => {
		const view = libraryPartToQuizView(
			partInput({
				intro: "<p>Questions 1–2</p><p>Preamble giữ nguyên</p>",
				groups: grouped.groups,
				questions: grouped.questions,
			}),
			{ skill: "reading", qOffset: 0 },
		);
		expect(view.detail.intro).toContain("Preamble giữ nguyên");
	});
});
