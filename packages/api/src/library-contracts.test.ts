import { describe, expect, test } from "vitest";
import {
	LIBRARY_AUDIO_MAX_BYTES,
	LIBRARY_AUDIO_MIME,
	LIBRARY_ERROR_CODES,
	LIBRARY_SKILLS,
	libraryPartUpsertSchema,
	libraryTestCreateSchema,
	libraryTestUpdateSchema,
	validatePartForReady,
	validateTestReady,
} from "./library-contracts";
import type { LibraryPartInput } from "./library-contracts";

function readingPart(overrides: Partial<LibraryPartInput> = {}): LibraryPartInput {
	return {
		part: "p1",
		type: "tfng",
		title: "Passage 1",
		band: "7.0",
		source: "",
		intro: "",
		passage: "<p>Once upon a time</p>",
		transcript: "",
		imageUrl: "",
		questions: [{ stem: "The story is old", answer: "TRUE", alts: "" }],
		optionBank: [],
		note: "",
		audioName: "",
		...overrides,
	};
}

function listeningPart(overrides: Partial<LibraryPartInput> = {}): LibraryPartInput {
	return readingPart({
		part: "s1",
		type: "form",
		passage: "",
		audioName: "section1.mp3",
		...overrides,
	});
}

describe("validatePartForReady", () => {
	test("reading đạt khi có passage + ít nhất 1 câu có stem", () => {
		expect(validatePartForReady("reading", readingPart())).toEqual([]);
	});

	test("reading thiếu passage bị từ chối", () => {
		const issues = validatePartForReady("reading", readingPart({ passage: "" }));
		expect(issues.some((issue) => issue.path === "passage")).toBe(true);
	});

	test("reading không có câu nào (hoặc stem rỗng) bị từ chối", () => {
		for (const questions of [[], [{ stem: "  ", answer: "TRUE", alts: "" }]]) {
			const issues = validatePartForReady(
				"reading",
				readingPart({ questions }),
			);
			expect(issues.some((issue) => issue.path === "questions")).toBe(true);
		}
	});

	test("listening thiếu audio bị từ chối, reading không cần audio", () => {
		expect(
			validatePartForReady("listening", listeningPart({ audioName: "" })).some(
				(issue) => issue.path === "audio",
			),
		).toBe(true);
		expect(validatePartForReady("listening", listeningPart())).toEqual([]);
	});

	test("listening cũng cần ≥ 1 câu có stem", () => {
		const issues = validatePartForReady("listening", listeningPart({ questions: [] }));
		expect(issues.some((issue) => issue.path === "questions")).toBe(true);
	});

	test("image-based (reading diagram / listening map) cần imageUrl + pin mọi câu", () => {
		const base = readingPart({
			type: "diagram",
			imageUrl: "https://cdn.example.com/d.png",
			questions: [{ stem: "q", answer: "TRUE", alts: "", pin: { x: 10, y: 20 } }],
		});
		expect(validatePartForReady("reading", base)).toEqual([]);

		const noImage = validatePartForReady(
			"reading",
			readingPart({ type: "diagram", imageUrl: "" }),
		);
		expect(noImage.some((issue) => issue.path === "imageUrl")).toBe(true);

		const missingPin = validatePartForReady(
			"reading",
			readingPart({
				type: "diagram",
				imageUrl: "https://cdn.example.com/d.png",
				questions: [
					{ stem: "q1", answer: "TRUE", alts: "", pin: { x: 10, y: 20 } },
					{ stem: "q2", answer: "FALSE", alts: "" },
				],
			}),
		);
		expect(missingPin.some((issue) => issue.path === "questions.1.pin")).toBe(true);

		// listening map — image-based pair thứ hai.
		const mapNoPin = validatePartForReady(
			"listening",
			listeningPart({ type: "map", audioName: "s2.mp3" }),
		);
		expect(mapNoPin.some((issue) => issue.path === "imageUrl")).toBe(true);
	});

	test("type không thuộc catalog của part bị từ chối", () => {
		const issues = validatePartForReady("reading", readingPart({ type: "task1" }));
		expect(issues.some((issue) => issue.path === "type")).toBe(true);
		expect(
			validatePartForReady("reading", readingPart({ part: "s1" })).some(
				(issue) => issue.path === "part",
			),
		).toBe(true);
	});

	test("optionBank chỉ áp cho dạng bankable; bankable cần bank đủ phủ câu", () => {
		// tfng không bankable mà có bank → từ chối.
		expect(
			validatePartForReady(
				"reading",
				readingPart({ optionBank: ["A", "B"] }),
			).some((issue) => issue.path === "optionBank"),
		).toBe(true);

		// headings bankable (p2) mà không có bank → từ chối.
		expect(
			validatePartForReady(
				"reading",
				readingPart({
					part: "p2",
					type: "headings",
					questions: [{ stem: "q", answer: "i", alts: "" }],
				}),
			).some((issue) => issue.path === "optionBank"),
		).toBe(true);

		// headings có bank nhưng câu trả lời nhãn ngoài bank → từ chối.
		expect(
			validatePartForReady(
				"reading",
				readingPart({
					part: "p2",
					type: "headings",
					questions: [{ stem: "q", answer: "ix", alts: "" }],
					optionBank: ["i", "ii"],
				}),
			).some((issue) => issue.path === "questions.0.answer"),
		).toBe(true);

		// headings đủ bank + nhãn hợp lệ → đạt.
		expect(
			validatePartForReady(
				"reading",
				readingPart({
					part: "p2",
					type: "headings",
					questions: [{ stem: "q", answer: "i", alts: "" }],
					optionBank: ["i", "ii"],
				}),
			),
		).toEqual([]);
	});
});

describe("validateTestReady", () => {
	test("reading cần đủ 3 slot p1..p3 và từng part đạt", () => {
		const issues = validateTestReady("reading", [
			readingPart(),
			readingPart({ part: "p2" }),
		]);
		expect(issues.some((issue) => issue.path === "parts.p3")).toBe(true);

		const broken = validateTestReady("reading", [
			readingPart(),
			readingPart({ part: "p2", passage: "" }),
			readingPart({ part: "p3" }),
		]);
		expect(broken.some((issue) => issue.path === "parts.p2.passage")).toBe(true);

		expect(
			validateTestReady("reading", [
				readingPart(),
				readingPart({ part: "p2", type: "headings", questions: [{ stem: "q", answer: "i", alts: "" }], optionBank: ["i", "ii"] }),
				readingPart({ part: "p3", type: "ynng", questions: [{ stem: "q", answer: "YES", alts: "" }] }),
			]),
		).toEqual([]);
	});

	test("listening cần đủ 4 slot s1..s4, mỗi part có audio + câu", () => {
		const issues = validateTestReady("listening", [
			listeningPart(),
			listeningPart({ part: "s2" }),
			listeningPart({ part: "s3" }),
		]);
		expect(issues.some((issue) => issue.path === "parts.s4")).toBe(true);

		const noAudio = validateTestReady("listening", [
			listeningPart(),
			listeningPart({ part: "s2", audioName: "" }),
			listeningPart({ part: "s3" }),
			listeningPart({ part: "s4" }),
		]);
		expect(noAudio.some((issue) => issue.path === "parts.s2.audio")).toBe(true);
	});
});

describe("schemas", () => {
	test("libraryTestCreateSchema nhận reading/listening, từ chối skill khác", () => {
		expect(LIBRARY_SKILLS).toEqual(["reading", "listening"]);
		expect(
			libraryTestCreateSchema.safeParse({
				title: "Cam 15 Test 1",
				skill: "reading",
			}).success,
		).toBe(true);
		expect(
			libraryTestCreateSchema.safeParse({ title: "x", skill: "speaking" })
				.success,
		).toBe(false);
		// strict: field lạ bị từ chối.
		expect(
			libraryTestCreateSchema.safeParse({
				title: "x",
				skill: "reading",
				hack: 1,
			}).success,
		).toBe(false);
	});

	test("libraryTestUpdateSchema KHÔNG cho sửa skill (immutable) và là partial", () => {
		expect(
			libraryTestUpdateSchema.safeParse({ title: "Đổi tên" }).success,
		).toBe(true);
		expect(
			libraryTestUpdateSchema.safeParse({ skill: "listening" }).success,
		).toBe(false);
	});

	test("libraryPartUpsertSchema strict + tái dùng assignmentQuestionSchema", () => {
		const ok = libraryPartUpsertSchema.safeParse({
			part: "p1",
			type: "tfng",
			title: "Passage 1",
			band: "7.0",
			source: "",
			intro: "",
			passage: "<p>text</p>",
			transcript: "",
			imageUrl: "",
			questions: [{ stem: "q", answer: "TRUE", alts: "" }],
			optionBank: [],
			note: "",
			audioName: "",
		});
		expect(ok.success).toBe(true);

		// strict: field lạ trong câu bị từ chối (nguồn sự thật contracts.ts).
		const bad = libraryPartUpsertSchema.safeParse({
			part: "p1",
			type: "tfng",
			questions: [{ stem: "q", answer: "TRUE", alts: "", oops: 1 }],
		});
		expect(bad.success).toBe(false);
	});
});

describe("constants + DTO surface", () => {
	test("LIBRARY_AUDIO_MAX_BYTES = 50MB", () => {
		expect(LIBRARY_AUDIO_MAX_BYTES).toBe(50 * 1024 * 1024);
	});

	test("LIBRARY_AUDIO_MIME là tập con audio của QUIZ_MEDIA_TYPES (không video)", () => {
		for (const mime of [
			"audio/mpeg",
			"audio/mp4",
			"audio/x-m4a",
			"audio/aac",
			"audio/wav",
			"audio/x-wav",
			"audio/wave",
			"audio/webm",
			"audio/ogg",
		]) {
			expect(LIBRARY_AUDIO_MIME[mime]).toBeTruthy();
		}
		expect("video/mp4" in LIBRARY_AUDIO_MIME).toBe(false);
		expect("video/quicktime" in LIBRARY_AUDIO_MIME).toBe(false);
	});

	test("LIBRARY_ERROR_CODES chứa mã tối thiểu", () => {
		for (const code of [
			"TEST_NOT_FOUND",
			"PART_NOT_FOUND",
			"NOT_READY",
			"INVALID_AUDIO",
			"AUDIO_TOO_LARGE",
		]) {
			expect(LIBRARY_ERROR_CODES).toContain(code);
		}
	});
});
