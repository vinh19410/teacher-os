import { describe, expect, test } from "vitest";
import type {
	LibraryPartInput,
	LibraryQuestionGroup,
} from "./library-contracts";
import {
	countClozeMarkers,
	LIBRARY_AUDIO_MAX_BYTES,
	LIBRARY_AUDIO_MIME,
	LIBRARY_ERROR_CODES,
	LIBRARY_SKILLS,
	libraryPartDtoSchema,
	libraryPartUpsertSchema,
	libraryTestCreateSchema,
	libraryTestUpdateSchema,
	validatePartForReady,
	validateTestReady,
} from "./library-contracts";

function readingPart(
	overrides: Partial<LibraryPartInput> = {},
): LibraryPartInput {
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
		groups: [],
		...overrides,
	};
}

function listeningPart(
	overrides: Partial<LibraryPartInput> = {},
): LibraryPartInput {
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
		const issues = validatePartForReady(
			"reading",
			readingPart({ passage: "" }),
		);
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
		const issues = validatePartForReady(
			"listening",
			listeningPart({ questions: [] }),
		);
		expect(issues.some((issue) => issue.path === "questions")).toBe(true);
	});

	test("image-based (reading diagram / listening map) cần imageUrl + pin mọi câu", () => {
		const base = readingPart({
			type: "diagram",
			imageUrl: "https://cdn.example.com/d.png",
			questions: [
				{ stem: "q", answer: "TRUE", alts: "", pin: { x: 10, y: 20 } },
			],
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
		expect(missingPin.some((issue) => issue.path === "questions.1.pin")).toBe(
			true,
		);

		// listening map — image-based pair thứ hai.
		const mapNoPin = validatePartForReady(
			"listening",
			listeningPart({ type: "map", audioName: "s2.mp3" }),
		);
		expect(mapNoPin.some((issue) => issue.path === "imageUrl")).toBe(true);
	});

	test("type không thuộc catalog của part bị từ chối", () => {
		const issues = validatePartForReady(
			"reading",
			readingPart({ type: "task1" }),
		);
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
		expect(broken.some((issue) => issue.path === "parts.p2.passage")).toBe(
			true,
		);

		expect(
			validateTestReady("reading", [
				readingPart(),
				readingPart({
					part: "p2",
					type: "headings",
					questions: [{ stem: "q", answer: "i", alts: "" }],
					optionBank: ["i", "ii"],
				}),
				readingPart({
					part: "p3",
					type: "ynng",
					questions: [{ stem: "q", answer: "YES", alts: "" }],
				}),
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

function twoGroups(): [LibraryQuestionGroup, LibraryQuestionGroup] {
	return [
		{
			id: "g1",
			type: "tfng",
			instruction: "",
			startIndex: 0,
			count: 3,
			optionBank: [],
			answersInline: false,
			splitContent: false,
			dragDrop: false,
		},
		{
			id: "g2",
			type: "note",
			instruction: "",
			startIndex: 3,
			count: 2,
			optionBank: [],
			answersInline: false,
			splitContent: false,
			dragDrop: false,
		},
	];
}

function groupedReadingPart(
	overrides: Partial<LibraryPartInput> = {},
): LibraryPartInput {
	return readingPart({
		type: "tfng",
		questions: [
			{ stem: "q1", answer: "TRUE", alts: "" },
			{ stem: "q2", answer: "FALSE", alts: "" },
			{ stem: "q3", answer: "TRUE", alts: "" },
			{ stem: "q4", answer: "London", alts: "" },
			{ stem: "q5", answer: "Berlin", alts: "" },
		],
		groups: twoGroups(),
		...overrides,
	});
}

function upsertPayload(part: LibraryPartInput) {
	return libraryPartUpsertSchema.safeParse(part);
}

/** Danh sách issue parse (rỗng nếu ok) — cho các test phủ luật nhóm. */
function upsertIssues(part: LibraryPartInput) {
	const result = libraryPartUpsertSchema.safeParse(part);
	return result.success ? [] : result.error.issues;
}

describe("library question groups", () => {
	test("countClozeMarkers đếm đúng marker `____` (≥ 4 gạch dưới)", () => {
		expect(countClozeMarkers("Growers ____ the bogs")).toBe(1);
		expect(countClozeMarkers("a ___ b")).toBe(0);
		expect(countClozeMarkers("____ x ______")).toBe(2);
	});

	test("upsert với groups: [] (đề cũ, nhóm ngầm) parse ok", () => {
		expect(upsertPayload(readingPart()).success).toBe(true);
	});

	test("2 nhóm [0..2], [3..4] + 5 câu parse ok", () => {
		expect(upsertPayload(groupedReadingPart()).success).toBe(true);
	});

	test("dải hở (startIndex 4 thay vì 3) bị từ chối ở groups.1.startIndex", () => {
		const [g1, g2] = twoGroups();
		const issues = upsertIssues(
			groupedReadingPart({
				groups: [g1, { ...g2, startIndex: 4 }],
			}),
		);
		expect(
			issues.some((issue) => {
				const [a, b, c] = issue.path;
				return a === "groups" && b === 1 && c === "startIndex";
			}),
		).toBe(true);
	});

	test("tổng count 4 với 5 câu bị từ chối ở path ['groups']", () => {
		const [g1, g2] = twoGroups();
		const issues = upsertIssues(
			groupedReadingPart({
				groups: [g1, { ...g2, count: 1 }],
			}),
		);
		expect(
			issues.some(
				(issue) => issue.path.length === 1 && issue.path[0] === "groups",
			),
		).toBe(true);
	});

	test("id nhóm trùng bị từ chối", () => {
		const [g1, g2] = twoGroups();
		const result = upsertPayload(
			groupedReadingPart({
				groups: [g1, { ...g2, id: "g1" }],
			}),
		);
		expect(result.success).toBe(false);
	});

	test("optionBank cấp part khác rỗng khi có nhóm bị từ chối", () => {
		const issues = upsertIssues(groupedReadingPart({ optionBank: ["A", "B"] }));
		expect(issues.some((issue) => issue.path[0] === "optionBank")).toBe(true);
	});

	test("answerSet xuyên nhóm bị chặn; nhóm ngầm vẫn chặn khóa 1 câu (S1)", () => {
		const questions = groupedReadingPart().questions.map((question, i) =>
			i === 4 || i === 0 ? { ...question, answerSet: "s" } : question,
		);
		const cross = upsertIssues(groupedReadingPart({ questions }));
		expect(
			cross.some(
				(issue) =>
					issue.path[0] === "groups" &&
					issue.message === "answer set must stay inside one group",
			),
		).toBe(true);

		const lonely = upsertIssues(
			readingPart({
				questions: [{ stem: "solo", answer: "TRUE", alts: "", answerSet: "x" }],
			}),
		);
		expect(
			lonely.some(
				(issue) =>
					issue.path[0] === "questions" &&
					issue.message === "answer set needs at least two questions",
			),
		).toBe(true);
	});

	test("answerSet xuyên nhóm emit path ĐÚNG NHÓM chứa câu đầu (parity partIssues) — #426 F2", () => {
		// Khóa "s" gom câu index 2 (nhóm gi=0) và index 3 (nhóm gi=1) — vắt
		// biên 3. Quy ước parity với partIssues: gi = findIndex nhóm chứa câu
		// ĐẦU TIÊN của khóa (index 2 → nhóm 0) — smallest member luôn ở nhóm
		// sớm hơn khi coverage hợp lệ.
		const questions = groupedReadingPart().questions.map((question, i) =>
			i === 3 || i === 2 ? { ...question, answerSet: "s" } : question,
		);
		const cross = upsertIssues(groupedReadingPart({ questions }));
		expect(
			cross.some(
				(issue) =>
					issue.path[0] === "groups" &&
					issue.path[1] === 0 &&
					issue.message === "answer set must stay inside one group",
			),
		).toBe(true);

		// Khóa 1 câu: path giữ ["questions", firstIndex] (khóa hành vi cũ).
		const lonely = upsertIssues(
			readingPart({
				questions: [{ stem: "solo", answer: "TRUE", alts: "", answerSet: "x" }],
			}),
		);
		expect(
			lonely.some(
				(issue) =>
					issue.path[0] === "questions" &&
					issue.path[1] === 0 &&
					issue.message === "answer set needs at least two questions",
			),
		).toBe(true);
	});

	test("answersInline cần đúng 1 marker ____ mỗi câu trong dải", () => {
		const [g1, g2] = twoGroups();
		const issues = validatePartForReady(
			"reading",
			groupedReadingPart({
				groups: [g1, { ...g2, answersInline: true }],
			}),
		);
		expect(issues.some((issue) => issue.path === "questions.3.stem")).toBe(
			true,
		);
	});

	test("nhóm không phải dạng completion không được answersInline", () => {
		const [g1, g2] = twoGroups();
		const issues = validatePartForReady(
			"reading",
			groupedReadingPart({
				groups: [{ ...g1, answersInline: true }, g2],
			}),
		);
		expect(
			issues.some((issue) => issue.path === "groups.0.answersInline"),
		).toBe(true);
	});

	test("thư viện bỏ khóa dạng-bài-theo-slot: p1 dạng mcq hợp lệ", () => {
		const issues = validatePartForReady(
			"reading",
			readingPart({
				type: "mcq",
				questions: [{ stem: "q", answer: "A", alts: "" }],
			}),
		);
		expect(
			issues.some((issue) => issue.message === "invalid type for part"),
		).toBe(false);
	});
});

describe("#425 — groups corrupt contract (DTO cờ + upsert cờ tường minh)", () => {
	function partDtoFixture() {
		return {
			id: "part-1",
			testId: "test-1",
			part: "p1",
			type: "summary",
			title: "Part 1",
			band: "7.0",
			source: "",
			intro: "",
			passage: "",
			transcript: "",
			imageUrl: "",
			questions: [],
			groups: [],
			optionBank: [],
			note: "",
			audio: null,
			updatedAt: "2026-10-23T00:00:00.000Z",
		};
	}

	test("DTO có groupsCorrupt true/false → parse giữ nguyên giá trị", () => {
		expect(
			libraryPartDtoSchema.parse({ ...partDtoFixture(), groupsCorrupt: true })
				.groupsCorrupt,
		).toBe(true);
		expect(
			libraryPartDtoSchema.parse({ ...partDtoFixture(), groupsCorrupt: false })
				.groupsCorrupt,
		).toBe(false);
	});

	test("DTO thiếu groupsCorrupt → parse thành công, mặc định false (deploy-skew 1 chiều)", () => {
		expect(libraryPartDtoSchema.parse(partDtoFixture()).groupsCorrupt).toBe(
			false,
		);
	});

	test("upsert chấp nhận discardCorruptGroups: true (literal)", () => {
		const parsed = libraryPartUpsertSchema.parse({
			part: "p1",
			type: "summary",
			title: "Part 1",
			band: "7.0",
			source: "",
			intro: "",
			passage: "",
			transcript: "",
			questions: [],
			note: "",
			discardCorruptGroups: true,
		});
		expect(parsed.discardCorruptGroups).toBe(true);
	});

	test("upsert từ chối discardCorruptGroups: false (chỉ literal(true))", () => {
		const result = libraryPartUpsertSchema.safeParse({
			part: "p1",
			type: "summary",
			title: "Part 1",
			band: "7.0",
			source: "",
			intro: "",
			passage: "",
			transcript: "",
			questions: [],
			note: "",
			discardCorruptGroups: false,
		});
		expect(result.success).toBe(false);
	});

	test("upsert strict vẫn chặn field lạ", () => {
		const result = libraryPartUpsertSchema.safeParse({
			part: "p1",
			type: "summary",
			title: "Part 1",
			band: "7.0",
			source: "",
			intro: "",
			passage: "",
			transcript: "",
			questions: [],
			note: "",
			groupsUnknownField: 1,
		});
		expect(result.success).toBe(false);
	});

	test("LIBRARY_ERROR_CODES có GROUPS_CORRUPT + GROUPS_NOT_CORRUPT", () => {
		expect(LIBRARY_ERROR_CODES).toContain("GROUPS_CORRUPT");
		expect(LIBRARY_ERROR_CODES).toContain("GROUPS_NOT_CORRUPT");
	});
});
