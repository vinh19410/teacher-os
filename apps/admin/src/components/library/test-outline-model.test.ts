import type {
	LibraryPartDto,
	LibraryQuestionGroup,
} from "@teacher-os/api/library-contracts";
import { describe, expect, it } from "vitest";
import {
	emptyPartValue,
	type PartFormValue,
	partValueFromDto,
} from "./part-form";
import {
	buildTestOutline,
	computeLibraryTestRanges,
	type PartDraft,
	type PartSlot,
	resolvePartValues,
} from "./test-outline-model";

const SLOTS: PartSlot[] = [
	{ part: "p1", label: "Passage 1" },
	{ part: "p2", label: "Passage 2" },
	{ part: "p3", label: "Passage 3" },
];

function question(n: number, answer = "True") {
	return {
		stem: `Câu ${n}`,
		opts: null,
		answer,
		alts: "",
		type: null,
		pin: null,
	};
}

function dto(
	part: string,
	questionCount: number,
	groups: LibraryQuestionGroup[] = [],
) {
	return {
		id: `id-${part}`,
		testId: "t1",
		part,
		type: "tfng",
		title: `Passage ${part.slice(1)}`,
		band: "6.5",
		source: "",
		intro: "",
		passage: "<p>Đoạn văn</p>",
		transcript: "",
		imageUrl: "",
		questions: Array.from({ length: questionCount }, (_, i) => question(i + 1)),
		groups,
		groupsCorrupt: false,
		optionBank: [],
		note: "",
		audio: null,
		updatedAt: "2026-10-02T00:00:00.000Z",
	} satisfies LibraryPartDto;
}

function group(id: string, type: string, startIndex: number, count: number) {
	return {
		id,
		type,
		instruction: "",
		startIndex,
		count,
		optionBank: [] as string[],
		answersInline: false,
		splitContent: false,
		dragDrop: false,
	} satisfies LibraryQuestionGroup;
}

const noDrafts = new Map<string, PartDraft>();

describe("computeLibraryTestRanges — fold theo số câu thật (mirror web)", () => {
	it("(a) canonical 13/13/14 → qStart 1/14/27", () => {
		expect(
			computeLibraryTestRanges([
				{ part: "p1", count: 13 },
				{ part: "p2", count: 13 },
				{ part: "p3", count: 14 },
			]),
		).toEqual([
			{ part: "p1", qStart: 1, count: 13 },
			{ part: "p2", qStart: 14, count: 13 },
			{ part: "p3", qStart: 27, count: 14 },
		]);
	});

	it("(b) real-world 12/14/14 → 1/13/27 (NOT preset 1/14/27)", () => {
		expect(
			computeLibraryTestRanges([
				{ part: "p1", count: 12 },
				{ part: "p2", count: 14 },
				{ part: "p3", count: 14 },
			]),
		).toEqual([
			{ part: "p1", qStart: 1, count: 12 },
			{ part: "p2", qStart: 13, count: 14 },
			{ part: "p3", qStart: 27, count: 14 },
		]);
	});

	it("(c) part count 0 giữ nguyên mốc cho part sau", () => {
		expect(
			computeLibraryTestRanges([
				{ part: "p1", count: 13 },
				{ part: "p2", count: 0 },
				{ part: "p3", count: 14 },
			]),
		).toEqual([
			{ part: "p1", qStart: 1, count: 13 },
			{ part: "p2", qStart: 14, count: 0 },
			{ part: "p3", qStart: 14, count: 14 },
		]);
	});

	it("(d) chuỗi rỗng → rỗng", () => {
		expect(computeLibraryTestRanges([])).toEqual([]);
	});
});

describe("resolvePartValues", () => {
	it("draft dirty thắng bản đã lưu", () => {
		const saved = dto("p1", 3);
		const drafts = new Map<string, PartDraft>([
			[
				"p1",
				{ dirty: true, value: { ...partValueFromDto(saved), title: "Nháp" } },
			],
		]);
		const entries = resolvePartValues(
			"reading",
			SLOTS,
			new Map([["p1", saved]]),
			drafts,
		);
		expect(entries[0]).toMatchObject({ part: "p1", state: "dirty" });
		expect(entries[0]?.value.title).toBe("Nháp");
	});

	it("draft sạch KHÔNG đè bản đã lưu", () => {
		const saved = dto("p1", 3);
		const drafts = new Map<string, PartDraft>([
			[
				"p1",
				{
					dirty: false,
					value: { ...partValueFromDto(saved), title: "Nháp sạch" },
				},
			],
		]);
		const entries = resolvePartValues(
			"reading",
			SLOTS,
			new Map([["p1", saved]]),
			drafts,
		);
		expect(entries[0]?.state).toBe("saved");
		expect(entries[0]?.value.title).toBe("Passage 1");
	});

	it("slot chưa từng mở → state empty, value là baseline rỗng", () => {
		const entries = resolvePartValues("reading", SLOTS, new Map(), noDrafts);
		expect(entries[0]?.state).toBe("empty");
		expect(entries[0]?.value).toEqual(emptyPartValue("reading", "p1"));
	});

	it("draft sạch của slot trống (vừa «Thêm nội dung») vẫn state empty", () => {
		const drafts = new Map<string, PartDraft>([
			["p1", { dirty: false, value: emptyPartValue("reading", "p1") }],
		]);
		const entries = resolvePartValues("reading", SLOTS, new Map(), drafts);
		expect(entries[0]?.state).toBe("empty");
	});
});

describe("buildTestOutline", () => {
	it("Reading p1 2 nhóm (3+2 câu) → số 1…5; p2 bắt đầu 6 (fold, KHÔNG phải 14)", () => {
		const savedP1 = dto("p1", 5, [
			group("g1", "tfng", 0, 3),
			group("g2", "note", 3, 2),
		]);
		const savedP2 = dto("p2", 3);
		const outline = buildTestOutline(
			"reading",
			SLOTS,
			new Map([
				["p1", savedP1],
				["p2", savedP2],
			]),
			noDrafts,
		);
		const p1 = outline[0];
		expect(p1?.state).toBe("saved");
		expect(p1?.groupCount).toBe(2);
		expect(p1?.groups).toHaveLength(2);
		expect(p1?.groups[0]?.questions.map((q) => q.number)).toEqual([1, 2, 3]);
		expect(p1?.groups[1]?.questions.map((q) => q.number)).toEqual([4, 5]);
		expect(p1?.groups[1]?.label).toBe("Nhóm câu 2");
		expect(outline[1]?.qStart).toBe(6);
	});

	it("p1 12 câu + p2 14 câu → p2 qStart 13 (không dùng preset 14)", () => {
		const outline = buildTestOutline(
			"reading",
			SLOTS,
			new Map([
				["p1", dto("p1", 12)],
				["p2", dto("p2", 14)],
			]),
			noDrafts,
		);
		expect(outline[0]?.qStart).toBe(1);
		expect(outline[1]?.qStart).toBe(13);
	});

	it("p1 draft dirty thêm 1 câu → qStart của p2 tăng 1 NGAY", () => {
		const savedP1 = dto("p1", 3);
		const savedP2 = dto("p2", 3);
		const dirtyValue: PartFormValue = {
			...partValueFromDto(savedP1),
			questions: [...partValueFromDto(savedP1).questions, question(4)],
		};
		const before = buildTestOutline(
			"reading",
			SLOTS,
			new Map([
				["p1", savedP1],
				["p2", savedP2],
			]),
			noDrafts,
		);
		const after = buildTestOutline(
			"reading",
			SLOTS,
			new Map([
				["p1", savedP1],
				["p2", savedP2],
			]),
			new Map([["p1", { dirty: true, value: dirtyValue }]]),
		);
		expect(before[1]?.qStart).toBe(4);
		expect(after[1]?.qStart).toBe(5);
		expect(after[0]?.state).toBe("dirty");
	});

	it("part không nhóm hiện nhóm ngầm «Nhóm câu 1» với typeLabel từ quizTypeDisplay", () => {
		const outline = buildTestOutline(
			"reading",
			SLOTS,
			new Map([["p1", dto("p1", 2)]]),
			noDrafts,
		);
		const p1 = outline[0];
		expect(p1?.groupCount).toBe(1);
		expect(p1?.groups).toHaveLength(1);
		expect(p1?.groups[0]?.label).toBe("Nhóm câu 1");
		expect(p1?.groups[0]?.typeLabel).toBe("True / False / Not Given");
		expect(p1?.questionCount).toBe(2);
	});

	it("slot trống → groups rỗng, questionCount 0, không dịch số part sau", () => {
		const outline = buildTestOutline(
			"reading",
			SLOTS,
			new Map([["p2", dto("p2", 3)]]),
			noDrafts,
		);
		expect(outline[0]).toMatchObject({
			part: "p1",
			state: "empty",
			groups: [],
			questionCount: 0,
		});
		expect(outline[1]?.qStart).toBe(1);
	});
});
