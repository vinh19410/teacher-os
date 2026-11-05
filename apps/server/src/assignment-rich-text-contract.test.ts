import {
	ASSIGNMENT_OPTION_BANK_TYPES,
	answerKindByType,
	assignmentPromptCreateSchema,
	assignmentPromptUpdateSchema,
	assignmentTestCreateSchema,
	assignmentTestUpdateSchema,
	QUIZ_TYPE_DISPLAY,
	quizTypeDisplay,
} from "@teacher-os/api/contracts";
import { describe, expect, it } from "vitest";

const writingReady = {
	skill: "writing",
	part: "task2",
	type: "discuss",
	title: "Writing Task 2",
	band: "7.0",
	source: "",
	prompt: "Discuss both views.",
	passage: "",
	intro: "",
	transcript: "",
	cueTopic: "",
	cuePoints: "",
	audioName: "",
	questions: [],
	note: "",
	status: "ready",
} as const;

const speakingPart1Ready = {
	...writingReady,
	skill: "speaking",
	part: "part1",
	type: "hometown",
	title: "Speaking Part 1",
};

describe("assignmentPromptCreateSchema — rich text fields", () => {
	it("caps prompt content on plain text even when wrapped in tags", () => {
		const over = assignmentPromptCreateSchema.safeParse({
			...writingReady,
			prompt: `<p>${"a".repeat(6000)}</p>`,
		});
		expect(over.success).toBe(false);

		const ok = assignmentPromptCreateSchema.safeParse({
			...writingReady,
			prompt: `<p>${"a".repeat(5000)}</p>`,
		});
		expect(ok.success).toBe(true);
	});

	it("enforces the raw HTML cap with its own message", () => {
		// passage: plain cap 20000, raw cap 50000 — 49998 plain chars pass the
		// plain cap but the raw string (3+49998+4=50005) busts the raw cap.
		const rawOver = `<p>${"a".repeat(49998)}</p>`;
		expect(rawOver.length).toBeGreaterThan(50000);
		const result = assignmentPromptCreateSchema.safeParse({
			...writingReady,
			passage: rawOver,
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const messages = result.error.issues.map((issue) => issue.message);
			expect(messages).toContain(
				"Nội dung vượt quá 50000 ký tự tính cả định dạng",
			);
		}
	});

	it("treats tag-only prompt as empty at the writing ready gate", () => {
		const result = assignmentPromptCreateSchema.safeParse({
			...writingReady,
			prompt: "<p><br></p>",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const issues = result.error.issues.filter(
				(issue) => issue.path[0] === "prompt",
			);
			expect(issues.some((issue) => issue.message === "prompt required")).toBe(
				true,
			);
		}
	});

	it("treats tag-only prompt as empty at the speaking part1 ready gate", () => {
		const result = assignmentPromptCreateSchema.safeParse({
			...speakingPart1Ready,
			prompt: "<p></p>",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const issues = result.error.issues.filter(
				(issue) => issue.path[0] === "prompt",
			);
			expect(issues.some((issue) => issue.message === "prompt required")).toBe(
				true,
			);
		}
	});

	it("accepts rich HTML content with real text", () => {
		const result = assignmentPromptCreateSchema.safeParse({
			...writingReady,
			prompt: "<p>Discuss <strong>both</strong> views.</p>",
			note: "<p>Chú ý <em>thời gian</em></p>",
			intro: "<p>Intro</p>",
			transcript: "<p>Transcript</p>",
		});
		expect(result.success).toBe(true);
	});

	it("keeps accepting legacy plain payloads unchanged (client not swapped yet)", () => {
		const result = assignmentPromptCreateSchema.safeParse({
			...writingReady,
			prompt: "Dòng 1\nDòng 2",
			passage: "Plain passage",
		});
		expect(result.success).toBe(true);
	});

	it("still rejects the old whitespace-only passage at the reading gate", () => {
		const result = assignmentPromptCreateSchema.safeParse({
			...writingReady,
			skill: "reading",
			part: "p1",
			type: "tfng",
			prompt: "",
			passage: "   ",
			questions: [{ stem: "Q1", opts: null, answer: "TRUE", alts: "" }],
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(
				result.error.issues.some(
					(issue) => issue.message === "passage required",
				),
			).toBe(true);
		}
	});

	it("accepts empty rich fields on PATCH — emptiness is not a field-level rule", () => {
		// The create schema's superRefine still gates required fields per skill
		// (pre-existing behavior, ready and draft alike); field-level rich text
		// has no non-empty refine, so an all-empty PATCH parses fine.
		const result = assignmentPromptUpdateSchema.safeParse({
			prompt: "",
			passage: "",
			intro: "",
			transcript: "",
			note: "",
		});
		expect(result.success).toBe(true);
	});

	it("keeps an editor round-trip of a near-cap passage inside the cap", () => {
		// 19,639 plain chars split into 40 paragraphs; the editor round-trip
		// wraps each in <p>, adding block newlines — collapsed measurement
		// must keep it under the 20,000 plain cap.
		const paragraphs = Array.from(
			{ length: 40 },
			(_, i) => `${"x".repeat(487)} ${i.toString().padStart(2, "0")}`,
		);
		const plain = paragraphs.join("\n");
		expect(plain.length).toBeLessThanOrEqual(20000);
		const html = paragraphs.map((p) => `<p>${p}</p>`).join("");
		const result = assignmentPromptCreateSchema.safeParse({
			...writingReady,
			passage: html,
		});
		expect(result.success).toBe(true);
	});
});

describe("update schemas keep rich caps after .partial()", () => {
	it("assignmentPromptUpdateSchema still caps a rich prompt", () => {
		const result = assignmentPromptUpdateSchema.safeParse({
			prompt: `<p>${"a".repeat(5001)}</p>`,
		});
		expect(result.success).toBe(false);
	});

	it("assignmentPromptUpdateSchema still caps passage HTML on plain length", () => {
		const result = assignmentPromptUpdateSchema.safeParse({
			passage: `<p>${"b".repeat(20001)}</p>`,
		});
		expect(result.success).toBe(false);
	});

	it("assignmentTestUpdateSchema still caps a rich description", () => {
		const result = assignmentTestUpdateSchema.safeParse({
			description: `<p>${"c".repeat(2001)}</p>`,
		});
		expect(result.success).toBe(false);
	});

	it("assignmentTestCreateSchema accepts a rich description under the cap", () => {
		const result = assignmentTestCreateSchema.safeParse({
			title: "Mock test 1",
			description: "<p>Full <strong>mock</strong> test</p>",
			skill: "reading",
			timeLimitSeconds: 3600,
		});
		expect(result.success).toBe(true);
	});
});

/** Reading p1 draft đủ điều kiện — per-question type tests đổi сверху. */
const readingP1Draft = {
	skill: "reading",
	part: "p1",
	type: "note",
	title: "Reading Mixed",
	band: "6.5",
	source: "",
	prompt: "Read and answer.",
	passage: "<p>Passage body</p>",
	intro: "",
	transcript: "",
	cueTopic: "",
	cuePoints: "",
	audioName: "",
	imageUrl: "",
	optionBank: [],
	note: "",
	status: "draft",
} as const;

const typedQuestion = (type?: string) => ({
	stem: "Statement about the passage",
	opts: null,
	answer: type === "tfng" ? "TRUE" : "river",
	alts: "",
	pin: null,
	...(type ? { type } : {}),
});

describe("assignmentPromptCreateSchema — per-question type", () => {
	it("accepts questions whose type belongs to the part catalog", () => {
		const result = assignmentPromptCreateSchema.safeParse({
			...readingP1Draft,
			questions: [typedQuestion("tfng"), typedQuestion("note")],
		});
		expect(result.success).toBe(true);
	});

	it("accepts legacy questions without a per-question type", () => {
		const result = assignmentPromptCreateSchema.safeParse({
			...readingP1Draft,
			questions: [typedQuestion(), typedQuestion()],
		});
		expect(result.success).toBe(true);
	});

	it("rejects a per-question type outside the part catalog at questions.N.type", () => {
		// flowchart là type của p3 — không thuộc catalog p1.
		const result = assignmentPromptCreateSchema.safeParse({
			...readingP1Draft,
			questions: [typedQuestion("flowchart")],
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((issue) => issue.path.join("."));
			expect(paths).toContain("questions.0.type");
		}
	});

	it("validates answer choices against the question type, not the prompt type", () => {
		// Prompt type note (free text) nhưng câu tfng phải dùng choice hợp lệ.
		const bad = assignmentPromptCreateSchema.safeParse({
			...readingP1Draft,
			questions: [{ ...typedQuestion("tfng"), answer: "maybe" }],
		});
		expect(bad.success).toBe(false);
		if (!bad.success) {
			const paths = bad.error.issues.map((issue) => issue.path.join("."));
			expect(paths).toContain("questions.0.answer");
		}

		const good = assignmentPromptCreateSchema.safeParse({
			...readingP1Draft,
			questions: [typedQuestion("tfng")],
		});
		expect(good.success).toBe(true);
	});
});

describe("QUIZ_TYPE_DISPLAY — shared display metadata", () => {
	it("returns label + IELTS instruction for a known type", () => {
		const tfng = quizTypeDisplay("tfng");
		expect(tfng.label).toBe("True / False / Not Given");
		expect(tfng.instruction).toContain("TRUE / FALSE / NOT GIVEN");
	});

	it("falls back to the raw type id with empty instruction for unknown types", () => {
		expect(quizTypeDisplay("nope")).toEqual({ label: "nope", instruction: "" });
	});

	it("covers every answer-kind and option-bank type used by the catalog", () => {
		const knownTypes = [
			...Object.keys(answerKindByType),
			...ASSIGNMENT_OPTION_BANK_TYPES.reading,
			...ASSIGNMENT_OPTION_BANK_TYPES.listening,
			...ASSIGNMENT_OPTION_BANK_TYPES.vocabulary,
			"gap",
			"transform",
		];
		for (const type of knownTypes) {
			expect(QUIZ_TYPE_DISPLAY[type], type).toBeDefined();
		}
	});
});

describe("assignmentPromptCreateSchema — option bank cho đề trộn dạng (#286)", () => {
	const readingBase = {
		...readingP1Draft,
		status: "ready",
		passage: "<p>Passage body</p>",
	} as const;

	it("chấp nhận bank khi CÂU bankable trong prompt không-bankable", () => {
		// p1 không có type bankable nào — mượn cấu trúc p2: prompt summary
		// (không bankable) + câu headings (bankable, roman).
		const result = assignmentPromptCreateSchema.safeParse({
			...readingBase,
			part: "p2",
			type: "summary",
			optionBank: ["Tiêu đề I", "Tiêu đề II"],
			questions: [
				{
					stem: "Paragraph A",
					opts: null,
					answer: "i",
					alts: "",
					type: "headings",
				},
				{
					stem: "Gap ____",
					opts: null,
					answer: "river",
					alts: "",
				},
			],
		});
		expect(result.success).toBe(true);
	});

	it("câu tự do trong đề bankable không bị ép nhãn bank", () => {
		// Prompt headings (bankable) + câu summary free-text answer — schema
		// cũ ép mọi câu vào nhãn i–viii → 400 mù.
		const result = assignmentPromptCreateSchema.safeParse({
			...readingBase,
			part: "p2",
			type: "headings",
			optionBank: ["Tiêu đề I", "Tiêu đề II"],
			questions: [
				{
					stem: "Paragraph A",
					opts: null,
					answer: "i",
					alts: "",
				},
				{
					stem: "Gap ____",
					opts: null,
					answer: "river",
					alts: "",
					type: "summary",
				},
			],
		});
		expect(result.success).toBe(true);
	});

	it("vẫn từ chối bank khi không đề nào lẫn câu nào bankable", () => {
		const result = assignmentPromptCreateSchema.safeParse({
			...readingBase,
			optionBank: ["Không hợp lệ"],
			questions: [typedQuestion("note")],
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((issue) => issue.path.join("."));
			expect(paths).toContain("optionBank");
		}
	});

	it("bank ready phải phủ đủ số câu bankable (không tính câu tự do)", () => {
		const result = assignmentPromptCreateSchema.safeParse({
			...readingBase,
			part: "p2",
			type: "summary",
			optionBank: ["Chỉ một mục"],
			questions: [
				{
					stem: "Paragraph A",
					opts: null,
					answer: "i",
					alts: "",
					type: "headings",
				},
				{
					stem: "Paragraph B",
					opts: null,
					answer: "ii",
					alts: "",
					type: "headings",
				},
			],
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((issue) => issue.path.join("."));
			expect(paths).toContain("optionBank");
		}
	});
});

describe("assignmentPromptUpdateSchema — answer choice theo type từng câu (#286)", () => {
	it("không ép choice của prompt type lên câu khác type", () => {
		// Payload client thật: type prompt tfng + câu note answer tự do —
		// schema cũ reject "river" ∉ [TRUE/FALSE/NOT GIVEN] mù field.
		const result = assignmentPromptUpdateSchema.safeParse({
			type: "tfng",
			questions: [
				{ stem: "S1", opts: null, answer: "TRUE", alts: "", type: "tfng" },
				{
					stem: "S2 ____",
					opts: null,
					answer: "river",
					alts: "",
					type: "note",
				},
			],
		});
		expect(result.success).toBe(true);
	});

	it("vẫn chặn answer sai kind của chính câu đó", () => {
		const result = assignmentPromptUpdateSchema.safeParse({
			type: "tfng",
			questions: [
				{ stem: "S1", opts: null, answer: "maybe", alts: "", type: "tfng" },
			],
		});
		expect(result.success).toBe(false);
	});
});

describe("assignmentPromptCreateSchema — grammar & vocabulary (#533)", () => {
	const baseAuto = {
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
		optionBank: [],
		note: "",
	} as const;

	it("cho phép đề grammar ready với passage rỗng và câu transform không có ____", () => {
		const result = assignmentPromptCreateSchema.safeParse({
			...baseAuto,
			skill: "grammar",
			part: "g1",
			type: "transform",
			title: "Grammar Transform",
			status: "ready",
			questions: [
				{
					stem: "She started learning English 3 years ago.",
					opts: null,
					answer: "She has been learning English for 3 years",
					alts: "",
				},
			],
		});
		expect(result.success).toBe(true);
	});

	it("từ chối câu gap ở trạng thái ready khi không có đúng 1 chỗ trống ____", () => {
		const result = assignmentPromptCreateSchema.safeParse({
			...baseAuto,
			skill: "grammar",
			part: "g1",
			type: "gap",
			title: "Grammar Gap",
			status: "ready",
			questions: [
				{
					stem: "She goes to school every day.",
					opts: null,
					answer: "goes",
					alts: "",
				},
			],
		});
		expect(result.success).toBe(false);
	});

	it("yêu cầu optionBank hợp lệ cho vocabulary match khi ready", () => {
		const badBank = assignmentPromptCreateSchema.safeParse({
			...baseAuto,
			skill: "vocabulary",
			part: "v1",
			type: "match",
			title: "Vocab Match",
			status: "ready",
			optionBank: ["Only one"],
			questions: [
				{ stem: "Word 1", opts: null, answer: "A", alts: "" },
				{ stem: "Word 2", opts: null, answer: "B", alts: "" },
			],
		});
		expect(badBank.success).toBe(false);

		const goodBank = assignmentPromptCreateSchema.safeParse({
			...baseAuto,
			skill: "vocabulary",
			part: "v1",
			type: "match",
			title: "Vocab Match",
			status: "ready",
			optionBank: ["Definition A", "Definition B", "Definition C"],
			questions: [
				{ stem: "Word 1", opts: null, answer: "A", alts: "" },
				{ stem: "Word 2", opts: null, answer: "C", alts: "" },
			],
		});
		expect(goodBank.success).toBe(true);
	});

	it("chặn tạo assignment_test với skill grammar hoặc vocabulary", () => {
		expect(
			assignmentTestCreateSchema.safeParse({
				title: "Grammar Test",
				skill: "grammar",
				timeLimitSeconds: 1200,
			}).success,
		).toBe(false);
		expect(
			assignmentTestCreateSchema.safeParse({
				title: "Vocabulary Test",
				skill: "vocabulary",
				timeLimitSeconds: 1200,
			}).success,
		).toBe(false);
	});
});

describe("assignmentPromptCreateSchema — prompt type requirement by status (#577)", () => {
	it("cho phép đề Writing draft có type rỗng", () => {
		const res = assignmentPromptCreateSchema.safeParse({
			...writingReady,
			status: "draft",
			type: "",
		});
		expect(res.success).toBe(true);
	});

	it("từ chối đề Writing ready khi type rỗng", () => {
		const res = assignmentPromptCreateSchema.safeParse({
			...writingReady,
			status: "ready",
			type: "",
		});
		expect(res.success).toBe(false);
		if (!res.success) {
			expect(
				res.error.issues.some((issue) => issue.path.includes("type")),
			).toBe(true);
		}
	});

	it("từ chối đề Writing draft có type ngoài catalog", () => {
		const res = assignmentPromptCreateSchema.safeParse({
			...writingReady,
			status: "draft",
			type: "invalid_type",
		});
		expect(res.success).toBe(false);
	});

	it("chấp nhận đề Writing ready có type hợp lệ", () => {
		const res = assignmentPromptCreateSchema.safeParse({
			...writingReady,
			status: "ready",
			type: "discuss",
		});
		expect(res.success).toBe(true);
	});

	it("từ chối đề Reading draft khi type rỗng (chỉ Writing được phép để trống)", () => {
		const res = assignmentPromptCreateSchema.safeParse({
			...writingReady,
			skill: "reading",
			part: "p1",
			type: "",
			status: "draft",
			passage: "<p>Passage content</p>",
			questions: [{ stem: "Q1", answer: "", alts: "", opts: null }],
		});
		expect(res.success).toBe(false);
	});
});
