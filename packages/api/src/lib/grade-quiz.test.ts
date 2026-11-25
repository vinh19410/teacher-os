import { describe, expect, test } from "vitest";
import {
	type AssignmentQuestion,
	assignmentPromptCreateSchema,
	assignmentTestCreateSchema,
} from "../contracts";
import {
	canClusterImplicitMcqMany,
	gradeQuiz,
	isAcceptedAnswer,
	resolveSummaryAnswerKeys,
	sanitizeAnswerSetKeys,
} from "./grade-quiz";

const question = (
	overrides: Partial<AssignmentQuestion> = {},
): AssignmentQuestion => ({
	stem: "Câu hỏi",
	opts: null,
	answer: "Paris",
	alts: "",
	pin: null,
	...overrides,
});

describe("gradeQuiz — verdicts (#283)", () => {
	test("blank hoặc thiếu key → skipped; khớp candidate → correct; lệch → wrong", () => {
		const grade = gradeQuiz(
			[
				question({ answer: "Paris", alts: "" }),
				question({ answer: "northern", alts: "north / Northern" }),
				question({ answer: "TRUE", alts: "" }),
			],
			{ "0": "   ", "1": "NORTH" },
		);
		expect(grade.verdicts).toEqual(["skipped", "correct", "skipped"]);
		expect(grade).toMatchObject({
			correctCount: 1,
			wrongCount: 0,
			skippedCount: 2,
			totalCount: 3,
		});
	});

	test("normalize: hoa/thường + whitespace dư vẫn correct; đáp án lệch dấu → wrong", () => {
		const grade = gradeQuiz([question({ answer: "Hà Nội", alts: "" })], {
			"0": "  hà   nội  ",
		});
		expect(grade.verdicts).toEqual(["correct"]);

		// Pin hành vi hiện tại (scenario I6): normalize KHÔNG canonicalize
		// Unicode — NFD (dấu tổ hợp) không khớp NFC (dấu dựng sẵn). Nếu muốn
		// chấp nhận cả hai, phải thêm normalize("NFC") vào grader trước.
		const nfd = "Hà Nội".normalize("NFD");
		expect(nfd).not.toBe("Hà Nội"); // literal tổ hợp thật, chặn phantom pin
		expect(
			gradeQuiz([question({ answer: "Hà Nội" })], { "0": nfd }).verdicts,
		).toEqual(["wrong"]);
	});
});

describe("gradeQuiz — alts với separator ' / ' (scenario I5)", () => {
	test("alt phân tách đúng ' / ' — space-slash-space", () => {
		const grade = gradeQuiz(
			[question({ answer: "northern", alts: "north / Northern" })],
			{ "0": "north" },
		);
		expect(grade.verdicts).toEqual(["correct"]);
	});

	test("slash trong giá trị alt không phải điểm tách — chỉ ' / ' mới tách", () => {
		// alt "a/b" chứa slash không space: tách đúng phải cho đúng 2 candidate
		// "a/b" và "c". Nếu tách theo "/" trần thì nửa mảnh "a"/"b" sẽ được
		// chấm đúng — sai ngữ nghĩa đáp án.
		const q = question({ answer: "none of these", alts: "a/b / c" });
		expect(gradeQuiz([q], { "0": "a/b" }).verdicts).toEqual(["correct"]);
		expect(gradeQuiz([q], { "0": "c" }).verdicts).toEqual(["correct"]);
		expect(gradeQuiz([q], { "0": "a" }).verdicts).toEqual(["wrong"]);
		expect(gradeQuiz([q], { "0": "b" }).verdicts).toEqual(["wrong"]);
	});

	test("answer chứa slash không bao giờ bị tách dù separator thế nào", () => {
		// "24/7" là một đáp án nguyên vẹn; "24 / 7" phải sai, và nửa mảnh "24"
		// cũng phải sai — nếu grader tách theo "/" thì "24" sẽ được chấm đúng.
		const q = question({ answer: "24/7", alts: "" });
		expect(gradeQuiz([q], { "0": "24/7" }).verdicts).toEqual(["correct"]);
		expect(gradeQuiz([q], { "0": "24 / 7" }).verdicts).toEqual(["wrong"]);
		expect(gradeQuiz([q], { "0": "24" }).verdicts).toEqual(["wrong"]);
		expect(gradeQuiz([q], { "0": "7" }).verdicts).toEqual(["wrong"]);
	});

	test("alts nhiều mức + alt rỗng bị bỏ — không khớp chuỗi trắng", () => {
		const q = question({ answer: "ii", alts: " / two /  " });
		expect(gradeQuiz([q], { "0": "two" }).verdicts).toEqual(["correct"]);
		expect(gradeQuiz([q], { "0": "ii" }).verdicts).toEqual(["correct"]);
		// Blank alt bị drop nên submission trắng vẫn là skipped, không correct.
		expect(gradeQuiz([q], {}).verdicts).toEqual(["skipped"]);
	});

	test("candidate chỉ khớp sau normalize — 'NORTH' khớp alt 'north'", () => {
		const grade = gradeQuiz(
			[question({ answer: "northern", alts: "north / Northern" })],
			{ "0": "  NoRtH  " },
		);
		expect(grade.verdicts).toEqual(["correct"]);
	});
});

describe("gradeQuiz — đáp án chứa ký tự JSON đặc biệt (scenario I4)", () => {
	test("answer/alts chứa quote và backslash vẫn chấm đúng (không bị làm hỏng)", () => {
		const quoted = question({ answer: 'he said "ok"', alts: "ok" });
		expect(gradeQuiz([quoted], { "0": 'He said "ok"' }).verdicts).toEqual([
			"correct",
		]);
		expect(gradeQuiz([quoted], { "0": "ok" }).verdicts).toEqual(["correct"]);
		expect(gradeQuiz([quoted], { "0": 'he said "no"' }).verdicts).toEqual([
			"wrong",
		]);

		const path = question({ answer: "C:\\Users", alts: "" });
		expect(gradeQuiz([path], { "0": "c:\\users" }).verdicts).toEqual([
			"correct",
		]);
		expect(gradeQuiz([path], { "0": "c:\\users2" }).verdicts).toEqual([
			"wrong",
		]);
	});
});

describe("isAcceptedAnswer — rule so khớp dùng chung grader/UI (#351)", () => {
	test("khớp key sau normalize (hoa/thường + whitespace dư)", () => {
		expect(isAcceptedAnswer("  PARIS  ", "Paris", "")).toBe(true);
		expect(isAcceptedAnswer("hà   nội", "Hà Nội", "")).toBe(true);
	});

	test("khớp alt sau normalize — cùng rule grader", () => {
		expect(isAcceptedAnswer("NORTH", "northern", "north / Northern")).toBe(
			true,
		);
		expect(isAcceptedAnswer("northern", "northern", "north")).toBe(true);
	});

	test("không khớp khi lệch và khi value rỗng (blank không bao giờ đúng)", () => {
		expect(isAcceptedAnswer("hanoi", "Hà Nội", "")).toBe(false);
		expect(isAcceptedAnswer("", "Paris", "glue / paste")).toBe(false);
		expect(isAcceptedAnswer("   ", "Paris", "")).toBe(false);
	});

	test("'a/b' không bị tách — separator phải đúng ' / '", () => {
		// Slash không có space xung quanh là một phần của giá trị.
		expect(isAcceptedAnswer("a/b", "a/b", "")).toBe(true);
		expect(isAcceptedAnswer("a", "a/b", "")).toBe(false);
		// Alt rỗng (separator thừa) bị drop — value rỗng không khớp được.
		expect(isAcceptedAnswer("", "Paris", " / ")).toBe(false);
	});
});

describe("gradeQuiz & contracts — Grammar & Vocabulary (#533)", () => {
	test("chấm đúng câu mcq, gap, transform (grammar g1) và match (vocabulary v1)", () => {
		const questions: AssignmentQuestion[] = [
			question({
				type: "mcq",
				stem: "She ____ to school every day.",
				opts: ["go", "goes", "going", "gone"],
				answer: "B",
			}),
			question({
				type: "gap",
				stem: "If I ____ you, I would study harder.",
				answer: "were",
				alts: "was",
			}),
			question({
				type: "transform",
				stem: "It is a pity I did not meet her. (WISH)",
				answer: "I wish I had met her",
				alts: "I wish I'd met her",
			}),
			question({
				type: "match",
				stem: "Ubiquitous",
				answer: "C",
			}),
		];

		const graded = gradeQuiz(questions, {
			"0": "b",
			"1": "  WAS ",
			"2": "i wish   i had met her",
			"3": "C",
		});
		expect(graded.correctCount).toBe(4);
		expect(graded.verdicts).toEqual([
			"correct",
			"correct",
			"correct",
			"correct",
		]);
	});

	test("contract nhận đề grammar/vocabulary không cần passage, kiểm tra gap có 1 blank và chặn assignment_test", () => {
		const baseGrammar = {
			skill: "grammar" as const,
			part: "g1",
			type: "gap",
			title: "Conditional sentences",
			band: "7.0" as const,
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
			status: "ready" as const,
		};

		const validGap = assignmentPromptCreateSchema.safeParse({
			...baseGrammar,
			questions: [
				{
					stem: "If I ____ rich, I would travel.",
					opts: null,
					answer: "were",
					alts: "was",
				},
			],
		});
		expect(validGap.success).toBe(true);

		const invalidGapNoBlank = assignmentPromptCreateSchema.safeParse({
			...baseGrammar,
			questions: [
				{
					stem: "If I were rich, I would travel.",
					opts: null,
					answer: "were",
					alts: "",
				},
			],
		});
		expect(invalidGapNoBlank.success).toBe(false);

		const validTransformNoBlank = assignmentPromptCreateSchema.safeParse({
			...baseGrammar,
			type: "transform",
			questions: [
				{
					stem: "Rewrite: I last saw him in May.",
					opts: null,
					answer: "I have not seen him since May",
					alts: "",
				},
			],
		});
		expect(validTransformNoBlank.success).toBe(true);

		const invalidTestSkill = assignmentTestCreateSchema.safeParse({
			title: "Grammar Full Test",
			skill: "grammar",
			timeLimitSeconds: 1800,
		});
		expect(invalidTestSkill.success).toBe(false);
	});
});

describe("gradeQuiz — Choose THREE unordered grading & implicit mcq_many fallback", () => {
	const bikesOpts = [
		"Wheel size",
		"Balance",
		"Rate of speed",
		"The back wheel",
		"Safety",
		"Downhill travel",
	];
	const bikesStem =
		"Choose THREE letters, A-F, and write them next to questions 8-10. The invention of different gears on a bicycle affected which THREE of the following?";

	const bikesQuestions = (withAnswerSet: boolean): AssignmentQuestion[] => [
		question({
			type: "mcq_many",
			stem: bikesStem,
			opts: bikesOpts,
			answer: "C",
			...(withAnswerSet ? { answerSet: "set-2" } : {}),
		}),
		question({
			type: "mcq_many",
			stem: `  ${bikesStem}  `,
			opts: bikesOpts.map((opt) => ` ${opt} `),
			answer: "D",
			...(withAnswerSet ? { answerSet: "set-2" } : {}),
		}),
		question({
			type: "mcq_many",
			stem: bikesStem,
			opts: bikesOpts,
			answer: "F",
			...(withAnswerSet ? { answerSet: "set-2" } : {}),
		}),
	];

	test.each([true, false])(
		"Bikes Q8–10 (withAnswerSet=%s): mọi hoán vị của C, D, F đều 3/3; A, C, D → 2/3; A, E, F → 1/3; trùng lặp không tính hai lần; bỏ trống → skipped",
		(withAnswerSet) => {
			const qs = bikesQuestions(withAnswerSet);

			expect(gradeQuiz(qs, { "0": "F", "1": "C", "2": "D" })).toMatchObject({
				verdicts: ["correct", "correct", "correct"],
				correctCount: 3,
				wrongCount: 0,
				skippedCount: 0,
			});

			expect(gradeQuiz(qs, { "0": "D", "1": "F", "2": "C" })).toMatchObject({
				verdicts: ["correct", "correct", "correct"],
				correctCount: 3,
			});

			expect(gradeQuiz(qs, { "0": "A", "1": "C", "2": "D" })).toMatchObject({
				verdicts: ["wrong", "correct", "correct"],
				correctCount: 2,
				wrongCount: 1,
			});

			expect(gradeQuiz(qs, { "0": "A", "1": "E", "2": "F" })).toMatchObject({
				verdicts: ["wrong", "wrong", "correct"],
				correctCount: 1,
				wrongCount: 2,
			});

			expect(gradeQuiz(qs, { "0": "C", "1": "C", "2": "D" })).toMatchObject({
				verdicts: ["correct", "wrong", "correct"],
				correctCount: 2,
				wrongCount: 1,
			});

			expect(gradeQuiz(qs, { "0": "D", "1": "F" })).toMatchObject({
				verdicts: ["correct", "correct", "skipped"],
				correctCount: 2,
				wrongCount: 0,
				skippedCount: 1,
			});
		},
	);

	test("study-pack slot suffix stems (lựa chọn 1/3..3/3) without answerSet cluster together, while consecutive (1/2, 2/2) + (1/2, 2/2) stay separate", () => {
		const opts = ["Opt A", "Opt B", "Opt C", "Opt D", "Opt E", "Opt F"];
		const b59WithoutSet = [
			question({
				type: "mcq_many",
				stem: "Questions 1 (lựa chọn 1/3)",
				opts,
				answer: "A",
			}),
			question({
				type: "mcq_many",
				stem: "Questions 1 (lựa chọn 2/3)",
				opts,
				answer: "D",
			}),
			question({
				type: "mcq_many",
				stem: "Questions 1 (lựa chọn 3/3)",
				opts,
				answer: "F",
			}),
		];
		expect(
			gradeQuiz(b59WithoutSet, { "0": "F", "1": "A", "2": "D" }),
		).toMatchObject({
			verdicts: ["correct", "correct", "correct"],
			correctCount: 3,
		});

		const twoConsecutivePairs = [
			question({
				type: "mcq_many",
				stem: "Questions 1 (lựa chọn 1/2)",
				opts,
				answer: "A",
			}),
			question({
				type: "mcq_many",
				stem: "Questions 1 (lựa chọn 2/2)",
				opts,
				answer: "B",
			}),
			question({
				type: "mcq_many",
				stem: "Questions 1 (lựa chọn 1/2)",
				opts,
				answer: "C",
			}),
			question({
				type: "mcq_many",
				stem: "Questions 1 (lựa chọn 2/2)",
				opts,
				answer: "D",
			}),
		];
		// Cross-swapping cluster 1 and cluster 2 must score 0/4.
		expect(
			gradeQuiz(twoConsecutivePairs, {
				"0": "C",
				"1": "D",
				"2": "A",
				"3": "B",
			}),
		).toMatchObject({
			verdicts: ["wrong", "wrong", "wrong", "wrong"],
			correctCount: 0,
		});
		// Swapping within each cluster must score 4/4.
		expect(
			gradeQuiz(twoConsecutivePairs, {
				"0": "B",
				"1": "A",
				"2": "D",
				"3": "C",
			}),
		).toMatchObject({
			verdicts: ["correct", "correct", "correct", "correct"],
			correctCount: 4,
		});
	});

	test("inherits promptType: 'mcq_many' when question.type is null, undefined, or empty string", () => {
		const qs = [
			question({ type: null, stem: bikesStem, opts: bikesOpts, answer: "C" }),
			question({
				type: undefined,
				stem: bikesStem,
				opts: bikesOpts,
				answer: "D",
			}),
			question({ type: "", stem: bikesStem, opts: bikesOpts, answer: "F" }),
		];
		expect(
			gradeQuiz(
				qs,
				{ "0": "F", "1": "C", "2": "D" },
				{ promptType: "mcq_many" },
			),
		).toMatchObject({
			verdicts: ["correct", "correct", "correct"],
			correctCount: 3,
		});
	});

	test("non-consecutive same-stem mcq_many clusters never merge across intervening questions", () => {
		const qs = [
			question({
				type: "mcq_many",
				stem: bikesStem,
				opts: bikesOpts,
				answer: "A",
			}),
			question({
				type: "mcq_many",
				stem: bikesStem,
				opts: bikesOpts,
				answer: "B",
			}),
			question({
				type: "mcq",
				stem: "Middle single MCQ",
				opts: ["One", "Two", "Three"],
				answer: "A",
			}),
			question({
				type: "mcq_many",
				stem: bikesStem,
				opts: bikesOpts,
				answer: "C",
			}),
			question({
				type: "mcq_many",
				stem: bikesStem,
				opts: bikesOpts,
				answer: "D",
			}),
		];
		expect(
			gradeQuiz(qs, { "0": "C", "1": "D", "2": "A", "3": "A", "4": "B" }),
		).toMatchObject({
			verdicts: ["wrong", "wrong", "correct", "wrong", "wrong"],
			correctCount: 1,
		});
	});

	test("malformed opts (null, <2 non-empty items) never trigger implicit clustering", () => {
		const invalidCases: Array<string[] | null> = [
			null,
			[],
			["Only one"],
			["", ""],
			["Only one", "   "],
		];
		for (const opts of invalidCases) {
			const a = question({
				type: "mcq_many",
				stem: "Choose TWO",
				opts,
				answer: "A",
			});
			const b = question({
				type: "mcq_many",
				stem: "Choose TWO",
				opts,
				answer: "B",
			});
			expect(canClusterImplicitMcqMany(a, b)).toBe(false);
			expect(gradeQuiz([a, b], { "0": "B", "1": "A" }).verdicts).toEqual([
				"wrong",
				"wrong",
			]);
		}
	});
});

describe("resolveSummaryAnswerKeys — unordered set display keys", () => {
	const bikesOpts = [
		"Wheel size",
		"Balance",
		"Rate of speed",
		"The back wheel",
		"Safety",
		"Downhill travel",
	];

	test("formats Bikes Q8–10 as 'C, D, F' sorted ascending for both explicit and implicit clusters", () => {
		const explicitUnsorted = [
			question({
				type: "mcq_many",
				stem: "Choose THREE",
				opts: bikesOpts,
				answer: "f",
				answerSet: "set-2",
			}),
			question({
				type: "mcq_many",
				stem: "Choose THREE",
				opts: bikesOpts,
				answer: "c",
				answerSet: "set-2",
			}),
			question({
				type: "mcq_many",
				stem: "Choose THREE",
				opts: bikesOpts,
				answer: "d",
				answerSet: "set-2",
			}),
		];
		expect(resolveSummaryAnswerKeys(explicitUnsorted)).toEqual([
			"C, D, F",
			"C, D, F",
			"C, D, F",
		]);

		const implicit = [
			question({
				type: "mcq_many",
				stem: "Choose THREE",
				opts: bikesOpts,
				answer: "F",
			}),
			question({
				type: "mcq_many",
				stem: "Choose THREE",
				opts: bikesOpts,
				answer: "C",
			}),
			question({
				type: "mcq_many",
				stem: "Choose THREE",
				opts: bikesOpts,
				answer: "D",
			}),
		];
		expect(resolveSummaryAnswerKeys(implicit)).toEqual([
			"C, D, F",
			"C, D, F",
			"C, D, F",
		]);
	});

	test("supports extended A–Z letter sets (sent4), protects lowercase Roman headings, and deduplicates free-text sets in order", () => {
		const extendedLetters = [
			question({ type: "sent4", opts: null, answer: "K", answerSet: "q1-4" }),
			question({ type: "sent4", opts: null, answer: "C", answerSet: "q1-4" }),
			question({ type: "sent4", opts: null, answer: "G", answerSet: "q1-4" }),
			question({ type: "sent4", opts: null, answer: "E", answerSet: "q1-4" }),
		];
		expect(resolveSummaryAnswerKeys(extendedLetters)).toEqual([
			"C, E, G, K",
			"C, E, G, K",
			"C, E, G, K",
			"C, E, G, K",
		]);

		const romanHeadings = [
			question({ type: "headings", opts: null, answer: "i", answerSet: "h1" }),
			question({ type: "headings", opts: null, answer: "v", answerSet: "h1" }),
		];
		expect(resolveSummaryAnswerKeys(romanHeadings)).toEqual(["i, v", "i, v"]);

		const freeText = [
			question({ answer: "  solar  power ", answerSet: "t1" }),
			question({ answer: "wind", answerSet: "t1" }),
			question({ answer: "SOLAR POWER", answerSet: "t1" }),
		];
		expect(resolveSummaryAnswerKeys(freeText)).toEqual([
			"solar power, wind",
			"solar power, wind",
			"solar power, wind",
		]);

		const singleAndPositional = [
			question({ answer: "Paris" }),
			question({ answer: "B", answerSet: "solo" }),
		];
		expect(resolveSummaryAnswerKeys(singleAndPositional)).toEqual([
			"Paris",
			"B",
		]);
	});
});

describe("sanitizeAnswerSetKeys — bounded length without collisions", () => {
	test("preserves <=20 trimmed keys, strips whitespace-only keys, and remaps >20 keys without prefix or existing-key collisions", () => {
		const items = [
			{ id: 1, answerSet: " s1 " },
			{ id: 2, answerSet: "   " },
			{ id: 3, answerSet: "very-long-answerset-prefix-1" },
			{ id: 4, answerSet: "  very-long-answerset-prefix-1  " },
			{ id: 5, answerSet: "very-long-answerset-prefix-2" },
			{ id: 6 },
		];
		const sanitized = sanitizeAnswerSetKeys(items);
		expect(sanitized[0]?.answerSet).toBe("s1");
		expect("answerSet" in (sanitized[1] ?? {})).toBe(false);
		expect("answerSet" in (sanitized[5] ?? {})).toBe(false);
		expect(sanitized[2]?.answerSet).toBeDefined();
		expect(sanitized[2]?.answerSet).toBe(sanitized[3]?.answerSet);
		expect(sanitized[2]?.answerSet).not.toBe(sanitized[4]?.answerSet);
		expect(sanitized[2]?.answerSet).not.toBe("s1");
		expect(sanitized[4]?.answerSet).not.toBe("s1");
		expect((sanitized[2]?.answerSet ?? "").length).toBeLessThanOrEqual(20);
		expect((sanitized[4]?.answerSet ?? "").length).toBeLessThanOrEqual(20);
	});
});
