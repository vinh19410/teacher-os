import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
	TestPreviewDraft,
	TestPreviewPartDraft,
} from "@/lib/assignment-test-preview-draft";
import { TestPreviewPaper } from "./test-preview-paper";

type PartSpec = {
	part: string;
	type: string;
	count: number;
	bank?: string[];
	opts?: string[] | null;
};

function partDraft(spec: PartSpec, index: number): TestPreviewPartDraft {
	return {
		part: spec.part,
		label: `Passage ${index + 1}`,
		qStartOverride: null,
		promptId: `prompt-${spec.part}`,
		type: spec.type,
		title: `Đề ${spec.part} — nguồn Cambridge`,
		intro: "Choose the correct answer.",
		passage: `Đoạn đọc ${spec.part} — paso único cho assert.`,
		prompt: "",
		audioName: "",
		optionBank: spec.bank ?? [],
		items: Array.from({ length: spec.count }, (_, i) => ({
			stem: `${spec.part} câu ____ số ${i + 1}`,
			answer: `secret-${spec.part}-${i}`,
			opts: spec.opts ?? null,
			alts: `ALT-LEAK-${spec.part}-${i}`,
		})),
	};
}

function paperDraft(specs: PartSpec[]): TestPreviewDraft {
	return {
		schemaVersion: 1,
		savedAt: 0,
		test: {
			title: "IELTS Reading Mock 01",
			skill: "reading",
			timeLimitSeconds: 3600,
			collection: "Cambridge IELTS 18",
			testGroup: "TEST 5",
		},
		parts: specs.map(partDraft),
	};
}

function emptyPart(part: string, index: number): TestPreviewPartDraft {
	return {
		part,
		label: `Passage ${index + 1}`,
		qStartOverride: null,
		promptId: null,
		type: "",
		title: "",
		intro: "",
		passage: "",
		prompt: "",
		audioName: "",
		optionBank: [],
		items: [],
	};
}

/** Số câu render dưới dạng <strong>N.</strong> — đúng thứ tự xuất hiện. */
function questionNumbers(html: string): number[] {
	return Array.from(html.matchAll(/<strong>(\d+)\.<\/strong>/g), (match) =>
		Number(match[1]),
	);
}

const ROMAN_BANK = [
	"Người xây kênh",
	"Thời kỳ đồ sắt",
	"Giao thương đường biển",
	"Cách mạng nông nghiệp",
	"Khai mỏ vùng cao",
	"Đường sắt đầu tiên",
	"Chính sách thuế quan",
	"Di cư lao động",
];

describe("TestPreviewPaper (phase-04 Task 4.2)", () => {
	it("13/13/14: đánh số liên tục 1–40 không nhảy số, header đủ", () => {
		const html = renderToStaticMarkup(
			<TestPreviewPaper
				draft={paperDraft([
					{ part: "p1", type: "tfng", count: 13 },
					{ part: "p2", type: "headings", count: 13, bank: ROMAN_BANK },
					{ part: "p3", type: "summary", count: 14 },
				])}
			/>,
		);
		expect(questionNumbers(html)).toEqual(
			Array.from({ length: 40 }, (_, i) => i + 1),
		);
		expect(html).toContain("Questions 1–40");
		expect(html).toContain("Time: 60 minutes");
		expect(html).toContain("Cambridge IELTS 18 · TEST 5");
		expect(html).toContain("READING PASSAGE 1");
		expect(html).toContain("READING PASSAGE 2");
		expect(html).toContain("READING PASSAGE 3");
		// Mốc từng part theo computeTestRanges.
		expect(html).toContain("Questions 1–13");
		expect(html).toContain("Questions 14–26");
		expect(html).toContain("Questions 27–40");
		expect(html).toContain("Đoạn đọc p1");
		expect(html).toContain("Đoạn đọc p3");
	});

	it("12/14/14: part 1 có 12 câu — vẫn 1–40, mốc part dịch đúng", () => {
		const html = renderToStaticMarkup(
			<TestPreviewPaper
				draft={paperDraft([
					{ part: "p1", type: "tfng", count: 12 },
					{ part: "p2", type: "headings", count: 14, bank: ROMAN_BANK },
					{
						part: "p3",
						type: "mcq4",
						count: 14,
						opts: ["Option甲", "Option乙", "Option丙", "Option丁"],
					},
				])}
			/>,
		);
		expect(questionNumbers(html)).toEqual(
			Array.from({ length: 40 }, (_, i) => i + 1),
		);
		expect(html).toContain("Questions 1–40");
		expect(html).toContain("Questions 1–12");
		expect(html).toContain("Questions 13–26");
		expect(html).toContain("Questions 27–40");
		// MCQ options render chữ cái như student-preview-paper.
		expect(html).toContain("A Option甲");
		expect(html).toContain("D Option丁");
	});

	it("option bank render 1 lần đầu part với label đúng loại", () => {
		const html = renderToStaticMarkup(
			<TestPreviewPaper
				draft={paperDraft([
					{ part: "p1", type: "tfng", count: 13 },
					{ part: "p2", type: "headings", count: 13, bank: ROMAN_BANK },
					{ part: "p3", type: "summary", count: 14 },
				])}
			/>,
		);
		expect(html.match(/Ngân hàng lựa chọn/g)).toHaveLength(1);
		expect(html).toMatch(/viii<\/span> Di cư lao động/);
		expect(html).toMatch(/i<\/span> Người xây kênh/);
	});

	it("KHÔNG render answer/alts ở bất kỳ đâu", () => {
		const html = renderToStaticMarkup(
			<TestPreviewPaper
				draft={paperDraft([
					{ part: "p1", type: "tfng", count: 13 },
					{ part: "p2", type: "headings", count: 13, bank: ROMAN_BANK },
					{ part: "p3", type: "summary", count: 14 },
				])}
			/>,
		);
		expect(html).not.toContain("secret-");
		expect(html).not.toContain("ALT-LEAK-");
	});

	it("slot trống bị bỏ khỏi render; mốc số không dịch — part sau chạy tiếp", () => {
		const html = renderToStaticMarkup(
			<TestPreviewPaper
				draft={{
					schemaVersion: 1,
					savedAt: 0,
					test: {
						title: "IELTS Reading Mock 01",
						skill: "reading",
						timeLimitSeconds: 3600,
						collection: "",
						testGroup: "",
					},
					parts: [
						partDraft({ part: "p1", type: "tfng", count: 13 }, 0),
						emptyPart("p2", 1),
						partDraft({ part: "p3", type: "summary", count: 14 }, 2),
					],
				}}
			/>,
		);
		expect(html).not.toContain("READING PASSAGE 2");
		// computeTestRanges: slot trống giữ mốc — p3 chạy tiếp 14, không nhảy 27.
		expect(questionNumbers(html)).toEqual(
			Array.from({ length: 27 }, (_, i) => i + 1),
		);
		expect(html).toContain("Questions 1–13");
		expect(html).toContain("Questions 14–27");
		expect(html).toContain("Questions 1–27");
	});

	it("bộ đề trống hiện notice thân thiện, không có số câu", () => {
		const html = renderToStaticMarkup(
			<TestPreviewPaper
				draft={{
					schemaVersion: 1,
					savedAt: 0,
					test: {
						title: "",
						skill: "reading",
						timeLimitSeconds: null,
						collection: "",
						testGroup: "",
					},
					parts: [emptyPart("p1", 0)],
				}}
			/>,
		);
		expect(html).toContain("Chưa có part nào");
		expect(html).not.toContain("Questions");
		expect(html).not.toContain("Time:");
	});
});
