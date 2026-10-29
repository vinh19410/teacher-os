import { describe, expect, it } from "vitest";
import {
	addGroup,
	effectiveGroups,
	groupQuestionNumber,
	moveGroup,
	moveQuestion,
	patchGroup,
	removeGroup,
	setGroupItems,
	splitIntoGroups,
} from "./group-model";
import {
	emptyPartValue,
	type PartFormValue,
	partInputFromValue,
} from "./part-form";

/** Value đọc + listening s1: mọi thao tác phải parse qua upsert schema. */
function baseValue(): PartFormValue {
	return {
		...emptyPartValue("reading", "p1"),
		title: "Passage 1",
		passage: "<p>Đoạn văn đọc</p>",
		questions: [1, 2, 3].map((n) => ({
			stem: `Câu ${n}`,
			opts: null,
			answer: "True",
			alts: "",
			type: null,
			pin: null,
		})),
	};
}

/** Value 2 nhóm thật: tfng 3 câu (0..2) + note 2 câu (3..4). */
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
	};
}

function twoGroupValue(): PartFormValue {
	return {
		...baseValue(),
		questions: [1, 2, 3, 4, 5].map((n) => ({
			stem: `Câu ${n}`,
			opts: null,
			answer: "True",
			alts: "",
			type: null,
			pin: null,
		})),
		groups: [group("g1", "tfng", 0, 3), group("g2", "note", 3, 2)],
	};
}

/** Mọi thao tác nhóm phải cho ra input parse được qua upsert schema. */
function expectParses(value: PartFormValue) {
	const built = partInputFromValue("p1", value);
	if (!built.ok) throw new Error(JSON.stringify(built.errors));
	return built.input;
}

describe("effectiveGroups / splitIntoGroups", () => {
	it("part không nhóm → một nhóm ngầm phủ toàn part", () => {
		const value = baseValue();
		const groups = effectiveGroups(value);
		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({
			id: "implicit",
			startIndex: 0,
			count: 3,
			optionBank: [],
		});
	});

	it("splitIntoGroups chuyển intro/optionBank sang nhóm và dọn cấp part", () => {
		const value = {
			...baseValue(),
			intro: "<p>Câu lệnh</p>",
			optionBank: ["A", "B"],
		};
		const split = splitIntoGroups(value);
		expect(split.groups).toHaveLength(1);
		expect(split.groups[0]).toMatchObject({
			instruction: "<p>Câu lệnh</p>",
			optionBank: ["A", "B"],
			count: 3,
		});
		expect(split.intro).toBe("");
		expect(split.optionBank).toEqual([]);
		expectParses(split);
	});
});

describe("addGroup", () => {
	it("part 3 câu không nhóm → 2 nhóm [0..2] và [3..3], bank part rỗng", () => {
		const next = addGroup(baseValue(), "note");
		expect(next.groups).toHaveLength(2);
		expect(next.groups[0]).toMatchObject({ startIndex: 0, count: 3 });
		expect(next.groups[1]).toMatchObject({ startIndex: 3, count: 1 });
		expect(next.optionBank).toEqual([]);
		expect(next.questions).toHaveLength(4);
		expect(next.groups[1]?.type).toBe("note");
		expectParses(next);
	});
});

describe("removeGroup", () => {
	it("xóa nhóm 0 (3 câu) → còn đúng 2 câu của nhóm sau, startIndex 0", () => {
		const value = twoGroupValue();
		const next = removeGroup(value, 0);
		expect(next.groups).toHaveLength(1);
		expect(next.groups[0]).toMatchObject({ startIndex: 0, count: 2 });
		expect(next.questions).toHaveLength(2);
		expect(next.questions.map((q) => q.stem)).toEqual(["Câu 4", "Câu 5"]);
		expectParses(next);
	});

	it("xóa nhóm cuối cùng còn lại → hoàn instruction/optionBank về cấp part, groups []", () => {
		const value = splitIntoGroups({
			...baseValue(),
			intro: "<p>Câu lệnh</p>",
			optionBank: ["A", "B"],
		});
		const next = removeGroup(value, 0);
		expect(next.groups).toEqual([]);
		expect(next.intro).toBe("<p>Câu lệnh</p>");
		expect(next.optionBank).toEqual(["A", "B"]);
		expect(next.questions).toHaveLength(3);
		expectParses(next);
	});
});

describe("moveGroup", () => {
	it("đưa nhóm 1 lên đầu → dải câu đi theo, startIndex đúng, type part theo nhóm đầu", () => {
		const value = twoGroupValue();
		const next = moveGroup(value, 1, -1);
		expect(next.groups.map((g) => g.type)).toEqual(["note", "tfng"]);
		expect(next.groups.map((g) => [g.startIndex, g.count])).toEqual([
			[0, 2],
			[2, 3],
		]);
		expect(next.questions.map((q) => q.stem)).toEqual([
			"Câu 4",
			"Câu 5",
			"Câu 1",
			"Câu 2",
			"Câu 3",
		]);
		expect(next.type).toBe("note");
		expectParses(next);
	});
});

describe("setGroupItems", () => {
	it("tăng nhóm 0 từ 3 lên 4 câu → nhóm 1 startIndex 4", () => {
		const value = twoGroupValue();
		const group0 = value.groups[0];
		if (!group0) throw new Error("missing group 0");
		const items = [
			...value.questions.slice(0, 3),
			{
				stem: "Câu mới",
				opts: null,
				answer: "False",
				alts: "",
				type: null,
				pin: null,
			},
		];
		const next = setGroupItems(value, 0, items);
		expect(next.groups[0]?.count).toBe(4);
		expect(next.groups[1]?.startIndex).toBe(4);
		expect(next.questions).toHaveLength(6);
		expectParses(next);
	});
});

describe("patchGroup", () => {
	it("đổi type nhóm → xóa type riêng của câu trong dải, part.type theo nhóm đầu", () => {
		const value = twoGroupValue();
		const withType = {
			...value,
			questions: value.questions.map((q, i) =>
				i === 0 ? { ...q, type: "tfng" } : q,
			),
		};
		const next = patchGroup(withType, 0, { type: "tfng" });
		expect(next.questions[0]?.type).toBeNull();
		expect(next.type).toBe("tfng");
		expectParses(next);
	});

	it("patch nhóm khác 0 không đổi part.type", () => {
		const value = twoGroupValue();
		const next = patchGroup(value, 1, { instruction: "<p>Hướng dẫn</p>" });
		expect(next.type).toBe("tfng");
		expect(next.groups[1]?.instruction).toBe("<p>Hướng dẫn</p>");
		expectParses(next);
	});
});

describe("moveQuestion", () => {
	it("hoán đổi câu trong dải nhóm, không vượt biên nhóm", () => {
		const value = twoGroupValue();
		// Nhóm 1 (note) giữ câu index 3,4 — đẩy câu đầu nhóm lên là no-op.
		const boundary = moveQuestion(value, 1, 0, -1);
		expect(boundary).toBe(value);
		const moved = moveQuestion(value, 1, 0, 1);
		expect(moved.questions.map((q) => q.stem)).toEqual([
			"Câu 1",
			"Câu 2",
			"Câu 3",
			"Câu 5",
			"Câu 4",
		]);
		expect(moved.groups).toEqual(value.groups);
		expectParses(moved);
	});
});

describe("groupQuestionNumber", () => {
	it("số tuyệt đối = qStart + startIndex + offset", () => {
		const value = twoGroupValue();
		const group0 = value.groups[0];
		const group1 = value.groups[1];
		if (!group0 || !group1) throw new Error("missing groups");
		expect(groupQuestionNumber(1, group0, 0)).toBe(1);
		expect(groupQuestionNumber(1, group1, 1)).toBe(5);
	});
});
