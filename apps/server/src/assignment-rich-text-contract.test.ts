import {
	ASSIGNMENT_OPTION_BANK_TYPES,
	QUIZ_TYPE_DISPLAY,
	answerKindByType,
	assignmentPromptCreateSchema,
	assignmentPromptUpdateSchema,
	assignmentTestCreateSchema,
	assignmentTestUpdateSchema,
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
		];
		for (const type of knownTypes) {
			expect(QUIZ_TYPE_DISPLAY[type], type).toBeDefined();
		}
	});
});
