import {
	assignmentPromptCreateSchema,
	assignmentPromptUpdateSchema,
	assignmentTestCreateSchema,
	assignmentTestUpdateSchema,
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
