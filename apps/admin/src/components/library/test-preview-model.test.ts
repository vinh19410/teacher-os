import type {
	LibraryPartDto,
	LibraryQuestionGroup,
} from "@teacher-os/api/library-contracts";
import { describe, expect, it } from "vitest";
import { partInputFromValue, partValueFromDto } from "./part-form";
import { buildTestOutline } from "./test-outline-model";
import { buildTestPreview } from "./test-preview-model";

const SLOTS = [
	{ part: "p1", label: "Passage 1" },
	{ part: "p2", label: "Passage 2" },
];

const QUESTIONS = [
	{ stem: "Q1", opts: null, answer: "1", alts: "", type: null, pin: null },
	{ stem: "Q2", opts: null, answer: "2", alts: "", type: null, pin: null },
];

function makeDto(slot: string, questionCount: number): LibraryPartDto {
	return {
		id: `part-${slot}`,
		testId: "t1",
		part: slot,
		type: "tfng",
		title: `Passage ${slot}`,
		band: "7.0",
		source: "",
		intro: "",
		passage: `<p>PASSAGE-SAVED-${slot}</p>`,
		transcript: "<p>CANARY-TRANSCRIPT</p>",
		imageUrl: "",
		questions: Array.from({ length: questionCount }, (_, i) => ({
			stem: `Q${i + 1}`,
			opts: null,
			answer: `CANARY-KEY-${slot}-${i}`,
			alts: "",
			type: null,
			pin: null,
		})),
		optionBank: [],
		groups: [],
		groupsCorrupt: false,
		note: "<p>CANARY-NOTE</p>",
		audio: null,
		updatedAt: "2026-10-02T00:00:00.000Z",
	};
}

function buildInput(slot: string, questionCount: number) {
	const built = partInputFromValue(
		slot,
		partValueFromDto(makeDto(slot, questionCount)),
	);
	if (!built.ok) throw new Error(`fixture parse failed: ${slot}`);
	return built.input;
}

const savedInputs = new Map([
	["p1", buildInput("p1", 2)],
	["p2", buildInput("p2", 2)],
]);

describe("buildTestPreview", () => {
	it("qOffset khớp buildTestOutline cho đề đã lưu (đếm fold toàn đề)", () => {
		const partsBySlot = new Map([
			["p1", makeDto("p1", 2)],
			["p2", makeDto("p2", 3)],
		]);
		const inputs = new Map([
			["p1", buildInput("p1", 2)],
			["p2", buildInput("p2", 3)],
		]);
		const tabs = buildTestPreview({
			skill: "reading",
			slots: SLOTS,
			partsBySlot,
			drafts: new Map(),
			savedInputs: inputs,
		});
		const outline = buildTestOutline("reading", SLOTS, partsBySlot, new Map());
		expect(tabs.map((tab) => tab.qStart)).toEqual(
			outline.map((section) => section.qStart),
		);
		expect(tabs.map((tab) => tab.state)).toEqual(["ok", "ok"]);
		expect(tabs[1]).toMatchObject({ qStart: 3, questionCount: 3 });
		expect(tabs[1]?.view?.parts[0]).toMatchObject({ qStart: 3 });
	});

	it("draft dirty parse đạt → view theo bản nháp, qStart theo outline", () => {
		const partsBySlot = new Map([["p1", makeDto("p1", 2)]]);
		const draftValue = {
			...partValueFromDto(makeDto("p1", 2)),
			passage: "<p> Nháp đang soạn </p>",
			questions: [
				{
					stem: "Draft stem",
					opts: null,
					answer: "",
					alts: "",
					type: null,
					pin: null,
				},
			],
		};
		const tabs = buildTestPreview({
			skill: "reading",
			slots: SLOTS,
			partsBySlot,
			drafts: new Map([["p1", { dirty: true, value: draftValue }]]),
			savedInputs,
		});
		expect(tabs[0]).toMatchObject({
			state: "ok",
			questionCount: 1,
		});
		expect(tabs[0]?.view?.detail.passage).toContain("Nháp đang soạn");
		// p2 trống → empty, giữ mốc.
		expect(tabs[1]).toMatchObject({ state: "empty", view: null, qStart: 2 });
	});

	it("draft hỏng + có saved → saved-fallback; qStart VẪN theo outline đếm draft (RT3/C1)", () => {
		const partsBySlot = new Map([["p1", makeDto("p1", 2)]]);
		// Draft "ngắn hơn" saved không gây parse fail — parse fail cần luật nhóm
		// vỡ: groups count không phủ hết questions.
		const draftValue = {
			...partValueFromDto(makeDto("p1", 2)),
			questions: [
				{ stem: "Q1", opts: null, answer: "", alts: "", type: null, pin: null },
				{ stem: "Q2", opts: null, answer: "", alts: "", type: null, pin: null },
				{ stem: "Q3", opts: null, answer: "", alts: "", type: null, pin: null },
			],
			groups: [
				{
					id: "g1",
					type: "tfng",
					instruction: "",
					startIndex: 0,
					count: 2,
					optionBank: [],
					answersInline: false,
					splitContent: false,
					dragDrop: false,
				} satisfies LibraryQuestionGroup,
			],
		};
		const tabs = buildTestPreview({
			skill: "reading",
			slots: SLOTS,
			partsBySlot,
			drafts: new Map([["p1", { dirty: true, value: draftValue }]]),
			savedInputs,
		});
		expect(tabs[0]?.state).toBe("saved-fallback");
		// Outline đếm 3 câu draft → p2 qStart = 4, dù view p1 chỉ 2 câu (C1).
		expect(tabs[0]?.questionCount).toBe(3);
		expect(tabs[0]?.view?.parts).toHaveLength(1);
		expect(tabs[1]?.qStart).toBe(4);
	});

	it("draft hỏng + chưa lưu → draft-invalid, view null (RT12)", () => {
		const draftValue = {
			...partValueFromDto(makeDto("p1", 2)),
			groups: [
				{
					id: "g1",
					type: "tfng",
					instruction: "",
					startIndex: 0,
					count: 5,
					optionBank: [],
					answersInline: false,
					splitContent: false,
					dragDrop: false,
				} satisfies LibraryQuestionGroup,
			],
		};
		const tabs = buildTestPreview({
			skill: "reading",
			slots: SLOTS,
			partsBySlot: new Map(),
			drafts: new Map([["p1", { dirty: true, value: draftValue }]]),
		});
		expect(tabs[0]).toMatchObject({
			state: "draft-invalid",
			view: null,
			questionCount: 2,
		});
	});

	it("saved groupsCorrupt → groups-corrupt, vẫn render blob (RT10)", () => {
		const corrupt = { ...makeDto("p1", 2), groupsCorrupt: true };
		const tabs = buildTestPreview({
			skill: "reading",
			slots: SLOTS,
			partsBySlot: new Map([["p1", corrupt]]),
			drafts: new Map(),
			savedInputs,
		});
		expect(tabs[0]).toMatchObject({ state: "groups-corrupt" });
		expect(tabs[0]?.view).not.toBeNull();
	});

	it("draft hỏng + lùi về saved groupsCorrupt → cả hai cờ cảnh báo (review Minor)", () => {
		const corrupt = { ...makeDto("p1", 2), groupsCorrupt: true };
		const draftValue = {
			...partValueFromDto(makeDto("p1", 2)),
			groups: [
				{
					id: "g1",
					type: "tfng",
					instruction: "",
					startIndex: 0,
					count: 9,
					optionBank: [],
					answersInline: false,
					splitContent: false,
					dragDrop: false,
				} satisfies LibraryQuestionGroup,
			],
		};
		const tabs = buildTestPreview({
			skill: "reading",
			slots: SLOTS,
			partsBySlot: new Map([["p1", corrupt]]),
			drafts: new Map([["p1", { dirty: true, value: draftValue }]]),
			savedInputs,
		});
		expect(tabs[0]?.state).toBe("saved-fallback");
		expect(tabs[0]?.savedFallback).toBe(true);
		expect(tabs[0]?.corrupt).toBe(true);
		expect(tabs[0]?.view).not.toBeNull();
	});

	it("tab không mang key đáp án/transcript/note ra ranh giới props (RT6/R6)", () => {
		const tabs = buildTestPreview({
			skill: "reading",
			slots: SLOTS,
			partsBySlot: new Map([
				["p1", makeDto("p1", 2)],
				["p2", makeDto("p2", 2)],
			]),
			drafts: new Map(),
			savedInputs,
		});
		const json = JSON.stringify(tabs);
		expect(json).not.toContain("CANARY-KEY");
		expect(json).not.toContain("CANARY-TRANSCRIPT");
		expect(json).not.toContain("CANARY-NOTE");
		// Nội dung học viên được phép: passage đã lưu.
		expect(json).toContain("PASSAGE-SAVED-p1");
	});
});
