import type {
	LibraryPartDto,
	LibraryQuestionGroup,
} from "@teacher-os/api/library-contracts";
import { describe, expect, it } from "vitest";
import { buildAnswersOverview } from "./answers-overview";
import type { PartDraft, PartSlot } from "./test-outline-model";

const SLOTS: PartSlot[] = [
	{ part: "p1", label: "Passage 1" },
	{ part: "p2", label: "Passage 2" },
];

function dto(
	part: string,
	questions: unknown[],
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
		questions,
		groups,
		optionBank: [],
		note: "",
		audio: null,
		updatedAt: "2026-10-02T00:00:00.000Z",
	} satisfies LibraryPartDto;
}

describe("buildAnswersOverview", () => {
	it("câu thiếu đáp án có missing: true; số câu liên tục qua part theo fold", () => {
		const rows = buildAnswersOverview({
			skill: "reading",
			slots: SLOTS,
			partsBySlot: new Map([
				[
					"p1",
					dto("p1", [
						{
							stem: "Câu 1",
							opts: null,
							answer: "TRUE",
							alts: "",
							type: null,
							pin: null,
						},
						{
							stem: "Câu 2",
							opts: null,
							answer: "",
							alts: "",
							type: null,
							pin: null,
						},
					]),
				],
				[
					"p2",
					dto("p2", [
						{
							stem: "Câu 3",
							opts: null,
							answer: "FALSE",
							alts: "",
							type: null,
							pin: null,
						},
					]),
				],
			]),
			drafts: new Map<string, PartDraft>(),
		});
		expect(rows.map((row) => row.number)).toEqual([1, 2, 3]);
		expect(rows.map((row) => row.partLabel)).toEqual([
			"Passage 1",
			"Passage 1",
			"Passage 2",
		]);
		expect(rows[1]?.missing).toBe(true);
		expect(rows[0]?.missing).toBe(false);
		expect(rows[0]?.answer).toBe("TRUE");
	});

	it('alts tách bằng đúng separator " / " của grader; "a/b" giữ nguyên', () => {
		const rows = buildAnswersOverview({
			skill: "reading",
			slots: SLOTS,
			partsBySlot: new Map([
				[
					"p1",
					dto("p1", [
						{
							stem: "Câu 1",
							opts: null,
							answer: "a",
							alts: "a / b /  c ",
							type: null,
							pin: null,
						},
						{
							stem: "Câu 2",
							opts: null,
							answer: "x",
							alts: "a/b",
							type: null,
							pin: null,
						},
						{
							stem: "Câu 3",
							opts: null,
							answer: "y",
							alts: " / ",
							type: null,
							pin: null,
						},
					]),
				],
			]),
			drafts: new Map<string, PartDraft>(),
		});
		expect(rows[0]?.alts).toEqual(["a", "b", "c"]);
		// Slash không space là phần giá trị — KHÔNG tách.
		expect(rows[1]?.alts).toEqual(["a/b"]);
		expect(rows[2]?.alts).toEqual([]);
	});

	it("groupIndex theo nhóm thật; slot trống không sinh hàng", () => {
		const rows = buildAnswersOverview({
			skill: "reading",
			slots: SLOTS,
			partsBySlot: new Map([
				[
					"p1",
					dto(
						"p1",
						[
							{
								stem: "Câu 1",
								opts: null,
								answer: "TRUE",
								alts: "",
								type: null,
								pin: null,
							},
							{
								stem: "Câu 2",
								opts: null,
								answer: "note",
								alts: "",
								type: null,
								pin: null,
							},
						],
						[
							{
								id: "g1",
								type: "tfng",
								instruction: "",
								startIndex: 0,
								count: 1,
								optionBank: [],
								answersInline: false,
								splitContent: false,
								dragDrop: false,
							},
							{
								id: "g2",
								type: "note",
								instruction: "",
								startIndex: 1,
								count: 1,
								optionBank: [],
								answersInline: false,
								splitContent: false,
								dragDrop: false,
							},
						],
					),
				],
			]),
			drafts: new Map<string, PartDraft>(),
		});
		expect(rows.map((row) => row.groupIndex)).toEqual([0, 1]);
		expect(rows).toHaveLength(2);
	});
});
