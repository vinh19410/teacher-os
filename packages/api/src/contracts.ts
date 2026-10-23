import { z } from "zod";
import { isBandStep } from "./lib/ielts-band";
import { isEmptyRichText, richTextField } from "./rich-text";

/**
 * Kernel API contracts — Wave 0.
 * Writes are POST-only with JSON bodies; ids are assigned by the server.
 * Every request is org-scoped from the session membership (no tenant header).
 */

/**
 * Issue #122 / Issue #251 — enroll an EXISTING student into a class.
 * Package derives from class via D1 pattern (sessionsTotal, tuitionFee ?? 0, mode).
 * Client only sends studentId.
 */
export const enrollStudentSchema = z.object({
	studentId: z.string().min(1),
});
export type EnrollStudent = z.infer<typeof enrollStudentSchema>;

export const CLASS_TYPES = ["ielts", "communication"] as const;
export type ClassType = (typeof CLASS_TYPES)[number];

export const IELTS_SKILLS = [
	"Writing",
	"Speaking",
	"Reading",
	"Listening",
] as const;

/** Strict HH:MM (00:00–23:59) — shared by the contract and web parsing. */
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const classCreateSchema = z
	.object({
		name: z.string().min(1),
		type: z.enum(CLASS_TYPES).default("ielts"),
		level: z.string().default(""),
		skills: z
			.array(z.enum(IELTS_SKILLS))
			.max(IELTS_SKILLS.length)
			.refine((skills) => new Set(skills).size === skills.length)
			.default([]),
		mode: z.string().default("Online"),
		/** Template to import a per-class curriculum copy from; "" = empty class. */
		templateId: z.string().default(""),
		schedule: z.object({
			/** 0 = Monday … 6 = Sunday (dayNames index convention). */
			days: z
				.array(z.number().int().min(0).max(6))
				.min(1)
				.max(7)
				.refine((days) => new Set(days).size === days.length),
			start: z.string().regex(TIME_REGEX),
			end: z.string().regex(TIME_REGEX),
		}),
		/** Capped: each enrollment generates this many lesson rows in one D1 batch — an uncapped value could brick the class (no class-edit endpoint exists). */
		sessionsTotal: z.number().int().min(1).max(52).default(12),
		/** Học phí mỗi học viên (VND) cho toàn khóa; null/undefined = chưa thiết lập, sửa được sau khi tạo. */
		tuitionFee: z.number().int().min(1).nullish(),
		startDate: z.string().default(""),
	})
	.superRefine((input, ctx) => {
		// Issue #105: creation rejects end <= start. Legacy stored rows with
		// end < start still parse (parseStoredSchedule guards only start ===
		// end) — the cross-midnight duration math stays for display only.
		if (input.schedule.end <= input.schedule.start) {
			ctx.addIssue({
				code: "custom",
				path: ["schedule", "end"],
				message: "Giờ kết thúc phải sau giờ bắt đầu",
			});
		}
		if (input.type === "ielts" && input.skills.length === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["skills"],
				message: "Lớp IELTS cần ít nhất một kỹ năng",
			});
		}
		if (input.type === "communication" && input.skills.length > 0) {
			ctx.addIssue({
				code: "custom",
				path: ["skills"],
				message: "Lớp Giao tiếp không chọn kỹ năng",
			});
		}
	});
export type ClassCreate = z.infer<typeof classCreateSchema>;

/** Import a deep copy of a syllabus template into a class (issue #79). */
export const importSyllabusSchema = z.object({
	templateId: z.string().min(1),
});
export type ImportSyllabus = z.infer<typeof importSyllabusSchema>;

/** Remove a class curriculum: deletes the imported copy tree, nulls the pointer. */
export const removeCurriculumSchema = z.object({}).strict();
export type RemoveCurriculum = z.infer<typeof removeCurriculumSchema>;
/** Xóa một syllabus template (hard delete cây module/lesson). Bản copy
 * của các lớp đã import không bị ảnh hưởng — deep-copy độc lập. */
export const deleteSyllabusSchema = z.object({}).strict();
export type DeleteSyllabus = z.infer<typeof deleteSyllabusSchema>;
export const classNotesSchema = z.object({
	notes: z.string(),
});
export type ClassNotes = z.infer<typeof classNotesSchema>;

/** Cập nhật học phí mỗi học viên của lớp; null = xóa học phí. */
export const classTuitionFeeUpdateSchema = z
	.object({ tuitionFee: z.number().int().min(1).nullable() })
	.strict();
export type ClassTuitionFeeUpdate = z.infer<typeof classTuitionFeeUpdateSchema>;

/**
 * Bulk content cho syllabus create (Excel/CSV import).
 * Mirror moduleUpsertSchema/lessonUpsertSchema + import-only caps
 * (server-side bound: client 2MB file cap không áp dụng cho caller trực tiếp).
 */
export const syllabusModuleContentSchema = z.object({
	title: z.string().min(1).max(500),
	description: z.string().max(10_000).default(""),
	lessons: z
		.array(
			z.object({
				title: z.string().min(1).max(500),
				objectives: z.string().max(10_000).default(""),
				materials: z.string().max(10_000).default(""),
				// Loại buổi (issue #154): default "lesson" — payload create/
				// replace luôn có kind, file import 4 cột v3 chạy như cũ.
				kind: z.enum(["lesson", "midterm", "final"]).default("lesson"),
				status: z.enum(["done", "current", "upcoming"]).default("upcoming"),
			}),
		)
		.default([]),
});
export type SyllabusModuleContent = z.infer<typeof syllabusModuleContentSchema>;

export const syllabusCreateSchema = z
	.object({
		name: z.string().min(1),
		type: z.enum(CLASS_TYPES).default("ielts"),
		level: z.string().default(""),
		skills: z
			.array(z.enum(IELTS_SKILLS))
			.max(IELTS_SKILLS.length)
			.refine((skills) => new Set(skills).size === skills.length)
			.default([]),
		description: z.string().default(""),
		totalLessons: z.number().int().min(0).default(0),
		modules: z.array(syllabusModuleContentSchema).optional(),
	})
	.superRefine((input, ctx) => {
		if (input.modules) {
			const nodes =
				input.modules.length +
				input.modules.reduce((sum, m) => sum + m.lessons.length, 0);
			if (nodes > 500) {
				ctx.addIssue({
					code: "custom",
					path: ["modules"],
					message: "Tổng số module và buổi học vượt giới hạn 500",
				});
			}
		}
		if (input.type === "ielts" && input.skills.length === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["skills"],
				message: "Syllabus IELTS cần ít nhất một kỹ năng",
			});
		}
		if (input.type === "communication" && input.skills.length > 0) {
			ctx.addIssue({
				code: "custom",
				path: ["skills"],
				message: "Syllabus Giao tiếp không chọn kỹ năng",
			});
		}
	});
export type SyllabusCreate = z.infer<typeof syllabusCreateSchema>;

export const moduleUpsertSchema = z.object({
	title: z.string().min(1),
	description: z.string().default(""),
});
export type ModuleUpsert = z.infer<typeof moduleUpsertSchema>;

export const lessonUpsertSchema = z.object({
	title: z.string().min(1),
	objectives: z.string().default(""),
	materials: z.string().default(""),
	// Loại buổi (issue #154): optional như status — form mở từ màn hình lớp
	// không gửi kind; route edit preserve giá trị existing, route add default
	// "lesson" khi vắng.
	kind: z.enum(["lesson", "midterm", "final"]).optional(),
	// Optional: form thêm/sửa buổi học mở từ màn hình syllabus không gửi status.
	// Route edit preserve giá trị existing; route add default "upcoming" khi vắng.
	status: z.enum(["done", "current", "upcoming"]).optional(),
});
export type LessonUpsert = z.infer<typeof lessonUpsertSchema>;

export const moduleRemoveSchema = z.object({}).strict();
export type ModuleRemove = z.infer<typeof moduleRemoveSchema>;
export const lessonRemoveSchema = z.object({}).strict();
export type LessonRemove = z.infer<typeof lessonRemoveSchema>;

/** Cap matches MAX_IMPORT_NODES — one D1 batch of UPDATEs. */
export const reorderModulesSchema = z
	.object({
		moduleIds: z.array(z.string().min(1)).min(1).max(500),
	})
	.strict();
export type ReorderModules = z.infer<typeof reorderModulesSchema>;
export const reorderLessonsSchema = z
	.object({
		lessonIds: z.array(z.string().min(1)).min(1).max(500),
	})
	.strict();
export type ReorderLessons = z.infer<typeof reorderLessonsSchema>;

/** Bulk replace nội dung syllabus (import ghi đè ở màn hình detail). */
export const syllabusReplaceContentSchema = z
	.object({
		modules: z.array(syllabusModuleContentSchema).min(1),
	})
	.strict()
	.superRefine((input, ctx) => {
		const nodes =
			input.modules.length +
			input.modules.reduce((sum, m) => sum + m.lessons.length, 0);
		if (nodes > 500) {
			ctx.addIssue({
				code: "custom",
				path: ["modules"],
				message: "Tổng số module và buổi học vượt giới hạn 500",
			});
		}
	});
export type SyllabusReplaceContent = z.infer<
	typeof syllabusReplaceContentSchema
>;

/**
 * IELTS rubric scores — strict shape, float 0–9 on purpose: half-bands
 * (6.5, 7.5) are the domain norm, so the repo-wide `.int()` convention
 * would reject most real grades.
 */
export const gradeScoresSchema = z
	.object({
		task: z.number().min(0).max(9),
		coherence: z.number().min(0).max(9),
		lexical: z.number().min(0).max(9),
		grammar: z.number().min(0).max(9),
	})
	.strict();
export type GradeScores = z.infer<typeof gradeScoresSchema>;

export const assignmentGradeSchema = z.object({
	scores: gradeScoresSchema,
});
export type AssignmentGrade = z.infer<typeof assignmentGradeSchema>;

/** Canonical v5 skill/part/type ids shared by server validation and web catalog. */
export const ASSIGNMENT_SKILLS = [
	"writing",
	"reading",
	"listening",
	"speaking",
] as const;
export type AssignmentSkill = (typeof ASSIGNMENT_SKILLS)[number];

export const ASSIGNMENT_PART_TYPES: Record<
	AssignmentSkill,
	{ parts: readonly string[]; types: Record<string, readonly string[]> }
> = {
	writing: {
		parts: ["task1", "task2"],
		types: {
			task1: ["chart", "table", "map", "process"],
			task2: ["discuss", "opinion", "advantage", "problem"],
		},
	},
	reading: {
		parts: ["p1", "p2", "p3"],
		types: {
			p1: ["tfng", "sent", "note", "shortans", "diagram"],
			p2: ["headings", "info", "summary", "sentend", "tablecomp"],
			p3: ["ynng", "mcq", "features", "flowchart"],
		},
	},
	listening: {
		parts: ["s1", "s2", "s3", "s4"],
		types: {
			s1: ["form", "mcq1"],
			s2: ["map", "match2"],
			s3: ["mcq3", "flow"],
			s4: ["notes", "sent4"],
		},
	},
	speaking: {
		parts: ["part1", "part2", "part3"],
		types: {
			part1: ["hometown", "work"],
			part2: ["place", "person", "object"],
			part3: ["cities", "education"],
		},
	},
};

/**
 * Full-test builder: slot layout per skill — mỗi slot là MỘT prompt ngân hàng
 * (design "IELTS Full Test Builder", 2026-09-28). Slot id khớp key `parts`
 * của ASSIGNMENT_PART_TYPES; label là display text cho UI builder/preview.
 */
export const ASSIGNMENT_TEST_PRESETS: Record<
	AssignmentSkill,
	{ slots: { part: string; label: string }[] }
> = {
	reading: {
		slots: [
			{ part: "p1", label: "Passage 1" },
			{ part: "p2", label: "Passage 2" },
			{ part: "p3", label: "Passage 3" },
		],
	},
	listening: {
		slots: [
			{ part: "s1", label: "Section 1" },
			{ part: "s2", label: "Section 2" },
			{ part: "s3", label: "Section 3" },
			{ part: "s4", label: "Section 4" },
		],
	},
	writing: {
		slots: [
			{ part: "task1", label: "Task 1" },
			{ part: "task2", label: "Task 2" },
		],
	},
	speaking: {
		slots: [
			{ part: "part1", label: "Part 1" },
			{ part: "part2", label: "Part 2" },
			{ part: "part3", label: "Part 3" },
		],
	},
};

export const ASSIGNMENT_ANSWER_CHOICES = {
	tfng: ["TRUE", "FALSE", "NOT GIVEN"],
	ynng: ["YES", "NO", "NOT GIVEN"],
	mcq4: ["A", "B", "C", "D"],
	mcq3: ["A", "B", "C"],
	roman: ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"],
	letter: ["A", "B", "C", "D", "E", "F", "G", "H"],
} as const;

/**
 * Exported so the web catalog can sync its KIND map against this one —
 * without the export, a drifted web kind map ships silently (#269).
 */
export const answerKindByType: Record<
	string,
	keyof typeof ASSIGNMENT_ANSWER_CHOICES
> = {
	tfng: "tfng",
	headings: "roman",
	info: "letter",
	ynng: "ynng",
	mcq: "mcq4",
	mcq1: "mcq3",
	map: "letter",
	match2: "letter",
	mcq3: "mcq3",
	features: "letter",
	sentend: "letter",
};

/**
 * Structured option bank (phase-02 FR2) — the (skill, type) pairs whose
 * prompts carry `optionBank`. Skill-qualified ON PURPOSE: `map` is shared
 * with writing task1 (a prompt-only type with no questions), which is NOT
 * bankable. Only these 5 matching kinds + listening map render a labeled
 * choice list; labels are positional (A–H letters or i–viii romans), so
 * the bank is capped at `ASSIGNMENT_OPTION_BANK_MAX` = 8 items.
 */
export const ASSIGNMENT_OPTION_BANK_MAX = 8;
export const ASSIGNMENT_OPTION_BANK_TYPES: Record<
	AssignmentSkill,
	readonly string[]
> = {
	writing: [],
	reading: ["headings", "info", "sentend", "features"],
	listening: ["match2", "map"],
	speaking: [],
};
export function isOptionBankable(skill: string, type: string): boolean {
	return (
		ASSIGNMENT_OPTION_BANK_TYPES[skill as AssignmentSkill] ?? []
	).includes(type);
}

/**
 * Kind của option bank cần hiển thị (#286, đề trộn dạng): bank vẫn là
 * PROMPT-level nhưng hiển thị khi type đề HOẶC bất kỳ câu bankable — nếu
 * không, cụm bankable trong đề không-bankable có instruction "choose from
 * the option bank" mà học viên không có list nào để chọn. Trả về undefined
 * khi không ai cần bank.
 */
export function optionBankKindFor(
	skill: string,
	promptType: string,
	questionTypes: readonly (string | null | undefined)[],
): keyof typeof ASSIGNMENT_ANSWER_CHOICES | undefined {
	if (isOptionBankable(skill, promptType)) return answerKindByType[promptType];
	for (const type of questionTypes) {
		const effective = type ?? promptType;
		if (isOptionBankable(skill, effective)) {
			return answerKindByType[effective];
		}
	}
	return undefined;
}

/**
 * Hiển thị chuẩn của từng dạng câu hỏi (label + instruction EN theo nguyên
 * văn đề IELTS) — nguồn DUY NHẤT cho header cụm trên take/review screen và
 * cho nhãn dạng bài ở authoring. Type lạ (đề cũ, snapshot fallback) rơi vào
 * `quizTypeDisplay()` thay vì crash renderer.
 */
export const QUIZ_TYPE_DISPLAY: Record<
	string,
	{ label: string; instruction: string }
> = {
	tfng: {
		label: "True / False / Not Given",
		instruction:
			"Do the following statements agree with the information given in the passage? Write TRUE / FALSE / NOT GIVEN.",
	},
	ynng: {
		label: "Yes / No / Not Given",
		instruction:
			"Do the following statements agree with the views of the writer? Write YES / NO / NOT GIVEN.",
	},
	mcq: {
		label: "Multiple choice",
		instruction: "Choose the correct letter A, B, C or D.",
	},
	mcq1: {
		label: "Multiple choice",
		instruction: "Choose the correct letter A, B or C.",
	},
	mcq3: {
		label: "Multiple choice",
		instruction: "Choose the correct letter A, B or C.",
	},
	headings: {
		label: "Matching headings",
		instruction:
			"Choose the correct heading for each paragraph from the list of headings. Write the correct roman numeral i–viii.",
	},
	info: {
		label: "Matching information",
		instruction:
			"Which section contains the following information? Write the correct letter A–H.",
	},
	features: {
		label: "Matching features",
		instruction:
			"Match each statement with the correct person/place. Choose from the option bank.",
	},
	sentend: {
		label: "Matching sentence endings",
		instruction: "Complete each sentence with the correct ending A–H.",
	},
	sent: {
		label: "Sentence completion",
		instruction:
			"Complete the sentences below. Choose NO MORE THAN THREE WORDS from the passage for each answer.",
	},
	sent4: {
		label: "Sentence completion",
		instruction:
			"Complete the sentences below. Write ONE WORD ONLY for each answer.",
	},
	note: {
		label: "Note completion",
		instruction:
			"Complete the notes below. Choose NO MORE THAN THREE WORDS from the passage for each answer.",
	},
	notes: {
		label: "Note completion",
		instruction:
			"Complete the notes below. Choose NO MORE THAN THREE WORDS from the passage for each answer.",
	},
	shortans: {
		label: "Short-answer questions",
		instruction:
			"Answer the questions below. Choose NO MORE THAN THREE WORDS AND/OR A NUMBER from the passage.",
	},
	diagram: {
		label: "Diagram label completion",
		instruction:
			"Label the diagram below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
	},
	summary: {
		label: "Summary completion",
		instruction:
			"Complete the summary below. Choose ONE WORD ONLY from the passage for each answer.",
	},
	tablecomp: {
		label: "Table completion",
		instruction:
			"Complete the table below. Choose NO MORE THAN THREE WORDS from the passage for each answer.",
	},
	flowchart: {
		label: "Flow-chart completion",
		instruction:
			"Complete the flow-chart below. Choose ONE WORD ONLY from the passage for each answer.",
	},
	flow: {
		label: "Flow-chart completion",
		instruction:
			"Complete the flow-chart below. Choose ONE WORD ONLY from the passage for each answer.",
	},
	form: {
		label: "Form completion",
		instruction:
			"Complete the form below. Write ONE WORD AND/OR A NUMBER for each answer.",
	},
	map: {
		label: "Map labelling",
		instruction:
			"Label the map below. Write the correct letter A–H for each location.",
	},
	match2: {
		label: "Matching",
		instruction: "Choose your answers from the option bank A–H.",
	},
};

/** Entry hiển thị cho type bất kỳ — type lạ giữ nguyên id làm label. */
export function quizTypeDisplay(type: string): {
	label: string;
	instruction: string;
} {
	return QUIZ_TYPE_DISPLAY[type] ?? { label: type, instruction: "" };
}

/**
 * Phase-04 FR2 — the (skill, type) pairs whose prompts label an IMAGE:
 * reading `diagram` + listening `map`. Skill-qualified ON PURPOSE (same
 * red-team rule as the option bank): writing task1 shares the `map` type id
 * but is a prompt-only type with no questions — it must never be gated on
 * image/pin. Pin coordinates are percents of the image box, so the pin rule
 * only applies where an image is required.
 */
export const ASSIGNMENT_IMAGE_BASED_TYPES: Record<
	AssignmentSkill,
	readonly string[]
> = {
	writing: [],
	reading: ["diagram"],
	listening: ["map"],
	speaking: [],
};
export function isImageBasedType(skill: string, type: string): boolean {
	return (
		ASSIGNMENT_IMAGE_BASED_TYPES[skill as AssignmentSkill] ?? []
	).includes(type);
}

/**
 * Diagram images are teacher-pasted URLs: https-only blocks `javascript:`,
 * `data:` and mixed content at the contract layer. The web editor and the
 * preview renderer (client-side draft path, no contract) re-use this same
 * pattern — single source for the scheme policy (#269).
 */
export const ASSIGNMENT_IMAGE_SRC_PATTERN = /^https:\/\/\S+$/;
export const ASSIGNMENT_IMAGE_URL_MAX_LENGTH = 500;

/** Full URL policy (scheme + length) shared by the schema field and the web
 * validation blocks, so client `canSave` never disagrees with a 400 (#269). */
export function isAssignmentImageUrl(value: string): boolean {
	const trimmed = value.trim();
	return (
		trimmed.length > 0 &&
		trimmed.length <= ASSIGNMENT_IMAGE_URL_MAX_LENGTH &&
		ASSIGNMENT_IMAGE_SRC_PATTERN.test(trimmed)
	);
}

/**
 * Một câu hỏi trong đề reading/listening — tách riêng để thư viện đề
 * (library-contracts) tái dùng nguyên văn, không nhân bản (#413). Field
 * giữ nguyên thứ tự và shape cũ; schema này là MỘT nguồn sự thật cho cả
 * assignment_prompt lẫn library_test_part.
 */
export const assignmentQuestionSchema = z
	.object({
		stem: z.string().trim().max(500),
		opts: z.array(z.string().max(500)).max(6).nullish(),
		answer: z.string().trim().max(200),
		alts: z.string().max(500).default(""),
		/**
		 * Dạng bài riêng của câu này (đề trộn nhiều dạng trong 1
		 * prompt). Optional — câu không khai type nhận fallback
		 * `prompt.type` khi server dựng payload student, đề cũ
		 * không cần migration.
		 */
		type: z.string().trim().min(1).max(20).nullish(),
		/**
		 * Phase-04 FR1 — label pin on the prompt image, percents of
		 * the image box (0–100, center of the pin). Nullish for
		 * non-image types and legacy image rows. `.strict()` on the
		 * inner object ON PURPOSE (red-team #2/#12): the old strip
		 * mode silently dropped unknown fields — a typo'd field or
		 * a drifted client now 400s instead of vanishing data.
		 */
		pin: z
			.object({
				x: z.number().min(0).max(100),
				y: z.number().min(0).max(100),
			})
			.nullish(),
		/**
		 * Giải thích đáp án (rich text) hiển thị sau khi nộp — tương ứng
		 * "Feedback" của từng đáp án bên Selfomy. Optional, KHÔNG default để
		 * câu cũ giữ nguyên shape.
		 */
		explanation: richTextField(2000).optional(),
		/**
		 * Khóa tập đáp án không thứ tự (IELTS "Choose TWO"): các câu cùng
		 * khóa trong một snapshot được chấm như một tập — đáp án đúng ở câu
		 * này được chấp nhận ở câu kia. Null/absent = chấm theo vị trí.
		 */
		answerSet: z.string().trim().min(1).max(20).nullish(),
	})
	.strict();

/**
 * Ngân hàng đề IELTS 4 kỹ năng. `status` luôn tường minh trên wire:
 * ready = hiện khi giao từ trang Lớp học, draft = bản nháp riêng tư.
 */
const assignmentPromptBaseSchema = z
	.object({
		skill: z.enum(ASSIGNMENT_SKILLS),
		part: z.string().trim().min(1).max(20),
		type: z.string().trim().min(1).max(20),
		title: z.string().trim().min(1).max(200),
		band: z.enum(["6.0", "6.5", "7.0", "7.5"]),
		source: z.string().trim().max(200),
		// Rich text (HTML string) — the meaningful cap is measured on the
		// plain text without markup; raw cap guards transport. intro/transcript/
		// note gain a leading trim of the HTML string (harmless around tags).
		prompt: richTextField(5000),
		passage: richTextField(20000),
		intro: richTextField(2000),
		transcript: richTextField(10000),
		cueTopic: z.string().trim().max(500),
		// cuePoints stays PLAIN text (one idea per line) — do not convert.
		cuePoints: z.string().max(2000),
		audioName: z.string().trim().max(200),
		imageUrl: z.string().trim().max(500).default(""),
		questions: z.array(assignmentQuestionSchema).max(40),
		/**
		 * Phase-02 FR2 — structured option bank for the bankable matching
		 * pairs (`ASSIGNMENT_OPTION_BANK_TYPES`). Every item must be 1–200
		 * chars after trim (empty rows never parse, even as drafts — the web
		 * editor mirrors this). Rules tying bank ↔ answers only gate `ready`;
		 * see the superRefine below.
		 */
		optionBank: z
			.array(z.string().trim().min(1).max(200))
			.max(ASSIGNMENT_OPTION_BANK_MAX)
			.default([]),
		note: richTextField(2000),
		status: z.enum(["draft", "ready"]),
	})
	.strict();

export const assignmentPromptCreateSchema =
	assignmentPromptBaseSchema.superRefine((value, ctx) => {
		const config = ASSIGNMENT_PART_TYPES[value.skill];
		if (!config.parts.includes(value.part)) {
			ctx.addIssue({ code: "custom", path: ["part"], message: "invalid part" });
			return;
		}
		if (!(config.types[value.part] ?? []).includes(value.type)) {
			ctx.addIssue({ code: "custom", path: ["type"], message: "invalid type" });
		}
		// Đề trộn dạng: type riêng của câu phải thuộc catalog type của part.
		const partTypes = config.types[value.part] ?? [];
		for (const [index, question] of value.questions.entries()) {
			if (question.type && !partTypes.includes(question.type)) {
				ctx.addIssue({
					code: "custom",
					path: ["questions", index, "type"],
					message: "invalid type",
				});
			}
		}
		const auto = value.skill === "reading" || value.skill === "listening";
		if (!auto && value.questions.length)
			ctx.addIssue({
				code: "custom",
				path: ["questions"],
				message: "questions only apply to reading or listening",
			});
		if (value.skill === "writing" && isEmptyRichText(value.prompt))
			ctx.addIssue({
				code: "custom",
				path: ["prompt"],
				message: "prompt required",
			});
		if (value.skill === "reading") {
			if (isEmptyRichText(value.passage))
				ctx.addIssue({
					code: "custom",
					path: ["passage"],
					message: "passage required",
				});
			if (
				value.questions.length < 1 ||
				!value.questions.some((question) => question.stem.trim())
			)
				ctx.addIssue({
					code: "custom",
					path: ["questions"],
					message: "question stem required",
				});
		}
		if (value.skill === "listening") {
			if (
				value.questions.length < 1 ||
				!value.questions.some((question) => question.stem.trim())
			)
				ctx.addIssue({
					code: "custom",
					path: ["questions"],
					message: "question stem required",
				});
			if (value.status === "ready" && !value.audioName.trim())
				ctx.addIssue({
					code: "custom",
					path: ["audioName"],
					message: "audio required when ready",
				});
		}
		// Phase-04 FR2 — image-based pairs are (skill, type)-qualified:
		// reading `diagram` + listening `map`. Writing task1 shares the `map`
		// type id and must NEVER be gated on image/pin (red-team #1). Ready
		// prompts on these pairs need the image AND a pin on every question —
		// a key without a place on the image is the old blind-text behavior.
		if (isImageBasedType(value.skill, value.type)) {
			if (value.status === "ready" && !value.imageUrl.trim())
				ctx.addIssue({
					code: "custom",
					path: ["imageUrl"],
					message: "image required when ready",
				});
			if (value.status === "ready") {
				for (const [index, question] of value.questions.entries()) {
					if (!question.pin)
						ctx.addIssue({
							code: "custom",
							path: ["questions", index, "pin"],
							message: "pin required when ready",
						});
				}
			}
		}
		if (value.imageUrl && !isAssignmentImageUrl(value.imageUrl))
			ctx.addIssue({
				code: "custom",
				path: ["imageUrl"],
				message: "imageUrl must be an https URL",
			});
		if (auto && value.status === "ready") {
			for (const [index, question] of value.questions.entries()) {
				if (!question.stem.trim())
					ctx.addIssue({
						code: "custom",
						path: ["questions", index, "stem"],
						message: "stem required when ready",
					});
				if (!question.answer.trim())
					ctx.addIssue({
						code: "custom",
						path: ["questions", index, "answer"],
						message: "answer required when ready",
					});
			}
		}
		if (value.skill === "speaking") {
			if (value.part === "part2" && !value.cueTopic.trim())
				ctx.addIssue({
					code: "custom",
					path: ["cueTopic"],
					message: "cue topic required",
				});
			if (value.part !== "part2" && isEmptyRichText(value.prompt))
				ctx.addIssue({
					code: "custom",
					path: ["prompt"],
					message: "prompt required",
				});
		}
		// Answer-choice validation theo type HIỆU DỤNG của từng câu (type câu
		// ?? type prompt) — đề trộn dạng chấm khớp kind của câu chứa nó.
		for (const [index, question] of value.questions.entries()) {
			const kind = answerKindByType[question.type ?? value.type];
			if (!kind) continue;
			const choices = ASSIGNMENT_ANSWER_CHOICES[kind];
			if (question.answer && !choices.includes(question.answer as never))
				ctx.addIssue({
					code: "custom",
					path: ["questions", index, "answer"],
					message: "invalid answer choice",
				});
		}
		// Phase-02 FR2 — option bank rules. Bankable is (skill, type)-qualified
		// (red-team #1): writing task1 shares the `map` type id but is NOT
		// bankable, so a bank arriving there is rejected outright. The 2..8 /
		// ≥ questions / label-in-bank / sentend-distinct rules gate `ready`
		// only — drafts may carry a partial bank while the teacher is keying.
		// #286: đề trộn dạng — bank áp khi type ĐỀ hoặc bất kỳ CÂU bankable
		// (`optionBankKindFor`); câu tự do trong đề trộn không bị ép nhãn.
		const bankKind = optionBankKindFor(
			value.skill,
			value.type,
			value.questions.map((question) => question.type),
		);
		if (!bankKind) {
			if (value.optionBank.length > 0)
				ctx.addIssue({
					code: "custom",
					path: ["optionBank"],
					message: "optionBank only applies to bankable matching types",
				});
		} else if (value.status === "ready") {
			const { optionBank } = value;
			// Chỉ những câu có kind hiệu dụng trùng bankKind dùng bank này.
			const bankQuestions = value.questions
				.map((question, index) => ({ question, index }))
				.filter(
					({ question }) =>
						answerKindByType[question.type ?? value.type] === bankKind,
				);
			if (optionBank.length < 2 || optionBank.length < bankQuestions.length)
				ctx.addIssue({
					code: "custom",
					path: ["optionBank"],
					message: `bank must have 2–${ASSIGNMENT_OPTION_BANK_MAX} items and cover every bankable question`,
				});
			if (bankQuestions.length > ASSIGNMENT_OPTION_BANK_MAX)
				ctx.addIssue({
					code: "custom",
					path: ["questions"],
					message: `bankable types allow at most ${ASSIGNMENT_OPTION_BANK_MAX} questions (label alphabet size)`,
				});
			const labels = ASSIGNMENT_ANSWER_CHOICES[bankKind];
			const used = new Set<string>();
			for (const { question, index } of bankQuestions) {
				if (!question.answer.trim()) continue;
				const labelIndex = labels.indexOf(question.answer as never);
				if (labelIndex < 0 || labelIndex >= optionBank.length)
					ctx.addIssue({
						code: "custom",
						path: ["questions", index, "answer"],
						message: "answer must be a label inside the option bank",
					});
				if ((question.type ?? value.type) === "sentend") {
					// Formal-format rule: sentend uses each option exactly once;
					// features and the other matching kinds may reuse labels.
					if (used.has(question.answer))
						ctx.addIssue({
							code: "custom",
							path: ["questions", index, "answer"],
							message: "duplicate answer — each option is used once",
						});
					used.add(question.answer);
				}
			}
		}
	});
export type AssignmentPromptCreate = z.infer<
	typeof assignmentPromptCreateSchema
>;

/**
 * PATCH /assignments/prompts/:id (full-test builder phase-2): partial của
 * create, giữ validate từng question (inner schema strict + answer choice
 * theo `type` khi body có). `skill`/`part` KHÔNG patch được — legacy
 * `task`/`genre` derive từ chúng lúc create, đổi là lệch round-trip; các
 * rule phụ thuộc skill (part/type membership, questions-per-skill, ready
 * gating) cần row DB nên route kiểm sau khi load prompt theo org.
 */
export const assignmentPromptUpdateSchema = assignmentPromptBaseSchema
	.omit({ skill: true, part: true })
	.partial()
	.strict()
	.superRefine((value, ctx) => {
		if (value.imageUrl && !isAssignmentImageUrl(value.imageUrl))
			ctx.addIssue({
				code: "custom",
				path: ["imageUrl"],
				message: "imageUrl must be an https URL",
			});
		// Answer-choice theo type HIỆU DỤNG từng câu (mirror create — #286):
		// ép kind của type prompt lên mọi câu sẽ false-reject đề trộn dạng
		// (prompt tfng + câu note answer tự do) ngay tại schema, mù field.
		if (value.questions) {
			for (const [index, question] of value.questions.entries()) {
				const kind =
					answerKindByType[question.type ?? value.type ?? ""] ?? null;
				if (!kind) continue;
				const choices = ASSIGNMENT_ANSWER_CHOICES[kind];
				if (question.answer && !choices.includes(question.answer as never))
					ctx.addIssue({
						code: "custom",
						path: ["questions", index, "answer"],
						message: "invalid answer choice",
					});
			}
		}
	});
export type AssignmentPromptUpdate = z.infer<
	typeof assignmentPromptUpdateSchema
>;

/**
 * Full test CRUD (design "IELTS Full Test Builder"). `timeLimitSeconds`
 * null = không giới hạn (Writing/Speaking); cap 3*3600 = full IELTS timed
 * paper. Parts KHÔNG nằm ở create — dùng PUT parts riêng (replace-all).
 */
export const assignmentTestCreateSchema = z
	.object({
		title: z.string().trim().min(1).max(200),
		description: richTextField(2000).optional(),
		skill: z.enum(ASSIGNMENT_SKILLS),
		timeLimitSeconds: z
			.number()
			.int()
			.gt(0)
			.max(3 * 3600)
			.nullable(),
		collection: z.string().trim().max(200).optional(),
		testGroup: z.string().trim().max(100).optional(),
	})
	.strict();
export type AssignmentTestCreate = z.infer<typeof assignmentTestCreateSchema>;

/** Meta/status update — partial của create; parts đổi qua parts-set riêng. */
export const assignmentTestUpdateSchema = assignmentTestCreateSchema
	.partial()
	.extend({ status: z.enum(["draft", "ready"]).optional() })
	.strict();
export type AssignmentTestUpdate = z.infer<typeof assignmentTestUpdateSchema>;

/**
 * Replace-all parts body (PUT /assignments/tests/:id/parts). Slot id phải
 * thuộc UNION các preset (slot id toàn cục duy nhất); membership theo skill
 * CỦA TEST và cap "≤ số slot preset" do route kiểm (route có test.skill từ
 * DB — phase-02). Contract chặn: slot lạ, trùng part, quá 4 slot (listening
 * là preset lớn nhất).
 */
export const assignmentTestPartsSetSchema = z
	.array(
		z
			.object({
				part: z.string().trim().min(1).max(20),
				promptId: z.string().trim().min(1).max(100),
				qStartOverride: z.number().int().gt(0).optional(),
			})
			.strict(),
	)
	.max(4)
	.superRefine((parts, ctx) => {
		const validSlots: Record<string, true> = Object.fromEntries(
			Object.values(ASSIGNMENT_TEST_PRESETS).flatMap((preset) =>
				preset.slots.map((slot) => [slot.part, true] as const),
			),
		);
		const seen = new Set<string>();
		for (const [index, item] of parts.entries()) {
			if (!validSlots[item.part]) {
				ctx.addIssue({
					code: "custom",
					path: [index, "part"],
					message: "invalid part slot",
				});
				continue;
			}
			if (seen.has(item.part)) {
				ctx.addIssue({
					code: "custom",
					path: [index, "part"],
					message: "duplicate part",
				});
				continue;
			}
			seen.add(item.part);
		}
	});
export type AssignmentTestPartsSet = z.infer<
	typeof assignmentTestPartsSetSchema
>;

/**
 * Giao đề ngân hàng cho lớp (#208). `due` là ISO yyyy-mm-dd (so được với
 * hôm nay — precedent `invoice.due`, khác `assignment.due` display dd/mm);
 * min-today theo ngày VN KHÔNG nằm ở contract — route tự kiểm sau
 * `parseStartDateStrict` (red-team F6). studentIds ≤ 100/lượt (red-team F11).
 */
export const classAssignmentCreateSchema = z
	.object({
		promptId: z.string().trim().min(1).max(100),
		due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		note: z.string().trim().max(2000).default(""),
		studentIds: z.array(z.string().trim().min(1)).min(1).max(100),
	})
	.strict();
export type ClassAssignmentCreate = z.infer<typeof classAssignmentCreateSchema>;

/** Feedback is teacher-authored and may contain sensitive education data. */
export const commentBankCreateSchema = z
	.object({
		text: z.string().trim().min(1).max(2000),
		operationId: z.string().uuid(),
	})
	.strict();
export type CommentBankCreate = z.infer<typeof commentBankCreateSchema>;

/**
 * Weekly parent-report creation (#173). A "sent" report requires content —
 * an empty send would create a log entry for a message that never existed.
 * Drafts may be empty; `channel` is metadata only (no real delivery yet).
 */
export const reportCreateSchema = z
	.object({
		studentId: z.string().min(1),
		period: z.string().trim().min(1).max(120),
		content: z.string().max(4000),
		channel: z.enum(["Zalo OA", "Email"]),
		status: z.enum(["draft", "sent"]),
	})
	.strict()
	.refine((v) => v.status !== "sent" || v.content.trim().length > 0, {
		message: "content required when sending",
	});
export type ReportCreate = z.infer<typeof reportCreateSchema>;

/**
 * Scheduled-lesson status actions (Wave 4) — NOT syllabus_lesson (invariant 5).
 * The body is exactly `{}`: the target status comes from the endpoint, never
 * the client; anything else is rejected so a forged `status` cannot ride along.
 */
export const lessonActionSchema = z.object({}).strict();
export type LessonAction = z.infer<typeof lessonActionSchema>;

/**
 * Lesson edit (issue #55) — full-replace, upcoming-only. day: 1 = Monday …
 * 7 = Sunday (lesson-day convention; the class schedule JSON is 0-based —
 * the off-by-one is pinned here). WARNING for consumers (#56): omitted
 * optional fields reset to "" — send all five fields or topic/zoom are wiped.
 * zoom only accepts "" or an https:// URL (it lands in the Zalo reminder
 * template, so scheme injection must die at the boundary).
 */
export const lessonEditSchema = z
	.object({
		day: z.number().int().min(1).max(7),
		time: z.string().regex(TIME_REGEX),
		dur: z.number().int().min(1).max(1440),
		topic: z.string().max(500).default(""),
		zoom: z
			.string()
			.max(2048)
			.default("")
			.refine((value) => value === "" || value.startsWith("https://"), {
				message: "zoom phải là URL https:// hoặc rỗng",
			}),
	})
	.strict();
export type LessonEdit = z.infer<typeof lessonEditSchema>;

/**
 * Occurrence-level edit (issue #98) — `≥1` field, never `day`: the server
 * derives the weekday from `moveDate`. Every shared field MUST stay
 * constraint-identical to lessonEditSchema above (.strict(), zoom only "" or
 * https:// — it lands in the Zalo reminder template so scheme injection dies
 * at the boundary; topic ≤500; dur ≤1440 with midnight wrap handled by the
 * generator formula). moveDate is pattern-checked here and roundtrip-guarded
 * against the real calendar server-side (`parseStartDateStrict`) because a
 * regex alone accepts 2026-02-30.
 */
export const occurrenceEditSchema = z
	.object({
		moveDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional(),
		time: z.string().regex(TIME_REGEX).optional(),
		dur: z.number().int().min(1).max(1440).optional(),
		topic: z.string().max(500).optional(),
		zoom: z
			.string()
			.max(2048)
			.optional()
			.refine(
				(value) =>
					value === undefined || value === "" || value.startsWith("https://"),
				{
					message: "zoom phải là URL https:// hoặc rỗng",
				},
			),
	})
	.strict()
	.refine(
		(body) =>
			body.moveDate !== undefined ||
			body.time !== undefined ||
			body.dur !== undefined ||
			body.topic !== undefined ||
			body.zoom !== undefined,
		{ message: "cần ít nhất một trường để chỉnh" },
	);
export type OccurrenceEdit = z.infer<typeof occurrenceEditSchema>;

/** Occurrence mutations report what landed (advisory numbers — see plan #98 K5/RT5). */
export interface OccurrenceMutationResponse {
	updated: number;
	skipped: number;
}

/** Mark-paid accepts only the display method; amount/status remain server-owned. */
export const invoiceMarkPaidSchema = z
	.object({ method: z.string().trim().min(1).max(32) })
	.strict();
export type InvoiceMarkPaid = z.infer<typeof invoiceMarkPaidSchema>;

/**
 * Issue #60 — create a tuition invoice for an enrollment. `due` is ISO
 * yyyy-mm-dd and is roundtrip-guarded server-side (`parseStartDateStrict`,
 * same precedent as `moveDate`) because the regex alone accepts 2026-02-30.
 * `amount` is integer VND and must be positive — unlike package `price`
 * (min 0), an invoice is a concrete amount due. Creation is non-idempotent,
 * consistent with POST /api/syllabus-templates.
 */
export const invoiceCreateSchema = z
	.object({
		enrollmentId: z.string().min(1),
		amount: z.number().int().min(1),
		due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		note: z.string().trim().max(500).default(""),
	})
	.strict();
export type InvoiceCreate = z.infer<typeof invoiceCreateSchema>;

// --- Kernel snapshot rows (server → web adapter) ---

export interface KernelStudentRow {
	id: string;
	name: string;
	phone: string;
	/** Email học viên — danh tính đăng nhập tương lai (username) cùng phone; "" với row legacy. */
	email: string;
	zalo: string;
	parentName: string;
	parentPhone: string;
}

export interface KernelClassRow {
	id: string;
	name: string;
	level: string;
	type: ClassType;
	skills: string[];
	mode: string;
	syllabusId: string | null;
	/** Raw string: JSON `{days,start,end}` (new) or legacy free text. Web formats it. */
	schedule: string;
	sessionsTotal: number;
	/**
	 * Stored legacy column with no writer since Wave 4 — the display value
	 * derives from completed lessons (invariant 7). Do not trust it.
	 */
	sessionsDone: number;
	status: string;
	startDate: string;
	/** Học phí mỗi học viên (VND) cho toàn khóa; null = chưa thiết lập. */
	tuitionFee: number | null;
	notes: string;
}

export const ENROLLMENT_STATUSES = ["invited", "active"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export interface KernelEnrollmentRow {
	id: string;
	classId: string;
	studentId: string;
	status: EnrollmentStatus | string;
	createdAt: string;
}

/**
 * Entitlement owned by a student; enrollment is the optional class attachment
 * (issue #104 — a package can exist before the student joins a class, so
 * `enrollmentId`/`classId` are null for parked packages).
 * done/remaining are derived downstream, never stored.
 */
export interface KernelPackageRow {
	id: string;
	enrollmentId: string | null;
	classId: string | null;
	studentId: string;
	total: number;
	price: number;
	mode: "Online" | "Offline" | string;
	start: string;
	expiry: string;
	status: string;
	createdAt: string;
}

export interface KernelSyllabusLessonRow {
	id: string;
	title: string;
	objectives: string;
	materials: string;
	/** Loại buổi (issue #154): "lesson" | "midterm" | "final"; `| string` cho forward-compat. */
	kind: "lesson" | "midterm" | "final" | string;
	status: "done" | "current" | "upcoming" | string;
}

export interface KernelSyllabusModuleRow {
	id: string;
	title: string;
	description: string;
	lessons: KernelSyllabusLessonRow[];
}

export interface KernelSyllabusRow {
	id: string;
	name: string;
	level: string;
	type: ClassType;
	skills: string[];
	description: string;
	/** NULL = shared template; a class id = that class's imported copy. */
	classId: string | null;
	/** Template the copy was imported from (null on templates). */
	sourceTemplateId: string | null;
	/** Stored form value; the adapter recomputes from the tree. */
	totalLessons: number;
	modules: KernelSyllabusModuleRow[];
}

export interface KernelAssignmentRow {
	id: string;
	studentId: string;
	title: string;
	type: string;
	/** Display-formatted dd/mm text, like every other date on the wire. */
	due: string;
	status: "not-submitted" | "late" | "graded" | string;
	scores: {
		task: number;
		coherence: number;
		lexical: number;
		grammar: number;
	} | null;
}

/**
 * A delivered/plan session (Wave 4). The student is never on this row —
 * the adapter resolves `sid` via the enrollment (invariant 2). done/remaining
 * derive from completed rows of the enrollment (invariant 6).
 * `date` (issue #98): occurrence identity yyyy-mm-dd — every row sharing
 * `(classId, date)` IS one physical session; NULL means the class diverged
 * from its schedule heuristic and renders through the frozen legacy path.
 */
export interface KernelLessonRow {
	id: string;
	classId: string;
	enrollmentId: string;
	day: number;
	time: string;
	dur: number;
	date: string | null;
	type: string;
	status: "completed" | "upcoming" | "cancelled" | "absent" | string;
	topic: string;
	zoom: string;
}

export interface KernelInvoiceRow {
	id: string;
	studentId: string;
	/**
	 * Issue #60 — ISO yyyy-mm-dd, unlike `date`'s display dd/mm and unlike
	 * the "every other date on the wire" dd/mm docblock on
	 * KernelAssignmentRow.due: the year is required for overdue math.
	 * Display formatting is a web concern (issue #61).
	 */
	due: string;
	note: string;
	enrollmentId: string;
	amount: number;
	status: "paid" | "overdue" | "unpaid" | string;
	date: string;
	type: string;
	method: string;
	/**
	 * #320 — ledger-recomputed paid total (SUM of matched
	 * payment_transaction amounts). Stays 0 for manually mark-paid invoices.
	 */
	paidAmount: number;
	/**
	 * #343 — ISO 8601 creation timestamp (server clock); the anchor for
	 * revenue-by-period bucketing. Drizzle `timestamp_ms` maps to a JS
	 * `Date`, so the snapshot loader serializes it explicitly with
	 * `.toISOString()` — never `Number()` this on the wire.
	 */
	createdAt: string;
}

export interface AssignmentQuestion {
	stem: string;
	opts: string[] | null;
	answer: string;
	alts: string;
	/** Dạng bài riêng của câu — nullish khi câu đi theo type của prompt. */
	type?: string | null;
	/** Phase-04 FR1 — image label pin (percents of the image box). Null for
	 * non-image types and legacy image rows. */
	pin?: { x: number; y: number } | null;
	/** Giải thích đáp án (rich text) — mirror schema ở assignmentQuestionSchema,
	 * optional không default để câu cũ giữ nguyên shape. */
	explanation?: string;
	/** Khóa tập đáp án không thứ tự (IELTS "Choose TWO") — mirror schema. */
	answerSet?: string | null;
}

export interface KernelAssignmentPromptRow {
	id: string;
	task: string;
	genre: string;
	skill: AssignmentSkill | string;
	part: string;
	type: string;
	title: string;
	band: string;
	source: string;
	prompt: string;
	intro: string;
	passage: string;
	transcript: string;
	cueTopic: string;
	cuePoints: string;
	audioName: string;
	imageUrl: string;
	questions: AssignmentQuestion[];
	/** Phase-02 FR7 — structured option bank (labeled choice list). */
	optionBank: string[];
	note: string;
	status: "draft" | "ready" | string;
	/** ISO datetime string — snapshot convention (bank sort + `Thêm {date}`). */
	createdAt: string;
}

/** One lượt giao (#208): header + targets embedded. `title` là snapshot tên
 * đề lúc giao; `submittedAt` null = chưa nộp (display-only, derived). */
export interface KernelClassAssignmentRow {
	id: string;
	classId: string;
	promptId: string;
	title: string;
	due: string;
	note: string;
	createdAt: string;
	targets: Array<{
		studentId: string;
		submittedAt: string | null;
		/** Attempt đã nộp (status submitted) — null khi chưa nộp/chưa có attempt. */
		attemptId: string | null;
		/** ISO datetime lần chấm gần nhất — null khi chưa chấm. */
		gradedAt: string | null;
		/** Band tổng (ieltsOverallBand) — null khi chưa chấm. */
		band: number | null;
	}>;
}

/** Một slot của full test — position là thứ tự slot trong preset. */
export interface KernelAssignmentTestPartRow {
	testId: string;
	promptId: string;
	part: string;
	position: number;
	qStartOverride: number | null;
}

/**
 * Full test snapshot row (parts đã group theo test). Không nhúng passage/
 * transcript — UI lấy prompt detail từ assignmentPrompts theo promptId.
 */
export interface KernelAssignmentTestRow {
	id: string;
	title: string;
	description: string | null;
	skill: AssignmentSkill | string;
	timeLimitSeconds: number | null;
	collection: string | null;
	testGroup: string | null;
	status: "draft" | "ready" | string;
	parts: KernelAssignmentTestPartRow[];
}

export interface KernelReportRow {
	id: string;
	studentId: string;
	period: string;
	sessions: number;
	status: "read" | "sent" | "draft";
	sent: string;
	read: string;
}
export interface KernelNotifRow {
	id: string;
	text: string;
	time: string;
	channel: string;
	dot: "accent" | "danger" | "warn";
}

export interface KernelCommentBankRow {
	id: string;
	tag: string;
	text: string;
}

export interface KernelSnapshot {
	students: KernelStudentRow[];
	classes: KernelClassRow[];
	syllabi: KernelSyllabusRow[];
	enrollments: KernelEnrollmentRow[];
	packages: KernelPackageRow[];
	lessons: KernelLessonRow[];
	assignments: KernelAssignmentRow[];
	invoices: KernelInvoiceRow[];
	reports: KernelReportRow[];
	assignmentPrompts: KernelAssignmentPromptRow[];
	notifs: KernelNotifRow[];
	commentBank: KernelCommentBankRow[];
	classAssignments: KernelClassAssignmentRow[];
	assignmentTests: KernelAssignmentTestRow[];
	vocabDecks: KernelVocabDeckRow[];
	vocabSuggestions?: KernelVocabSuggestionRow[];
}

export interface CreatedResponse {
	id: string;
}

/**
 * Student Portal API contracts.
 * Endpoints mounted under /api/student (GET /me, GET /overview, and POST /onboarding written by students).
 * Trust anchor is session email + bridge provisioning.
 */
export const STUDENT_ERROR_CODES = {
	NOT_LINKED: "STUDENT_NOT_LINKED",
	AMBIGUOUS: "STUDENT_AMBIGUOUS",
	EMAIL_UNVERIFIED: "STUDENT_EMAIL_UNVERIFIED",
} as const;
export type StudentErrorCode =
	(typeof STUDENT_ERROR_CODES)[keyof typeof STUDENT_ERROR_CODES];

/**
 * Account-role gate errors (plan #260): a session whose `user.role` does not
 * match the app is rejected at the API middleware layer — the student portal
 * and the teacher app share one cross-subdomain cookie zone, so the form-level
 * sign-in rejection alone is not enough.
 */
export const ACCOUNT_ERROR_CODES = {
	STUDENT_ON_TEACHER_APP: "ACCOUNT_STUDENT_ROLE",
	TEACHER_ON_STUDENT_PORTAL: "ACCOUNT_TEACHER_ROLE",
	/** Role admin chạm kernel tree của teacher app (plan #413). */
	ADMIN_ON_TEACHER_APP: "ACCOUNT_ADMIN_ROLE",
	/** Sign-up trên origin admin với email ngoài ADMIN_EMAILS (plan #413). */
	ADMIN_SIGNUP_FORBIDDEN: "ACCOUNT_ADMIN_SIGNUP_FORBIDDEN",
	/** requireAdmin: session không thỏa admin gate (plan #413). */
	NOT_ADMIN: "ACCOUNT_NOT_ADMIN",
} as const;
export type AccountErrorCode =
	(typeof ACCOUNT_ERROR_CODES)[keyof typeof ACCOUNT_ERROR_CODES];

export const EXAM_INTERESTS = ["ielts", "toeic"] as const;
export type ExamInterest = (typeof EXAM_INTERESTS)[number];

export const IELTS_TARGET_BANDS = [
	"5.0",
	"5.5",
	"6.0",
	"6.5",
	"7.0",
	"7.5",
	"8.0+",
] as const;
export const TOEIC_TARGET_SCORES = [
	"450",
	"550",
	"650",
	"750",
	"850",
	"990",
] as const;

export const LEARNING_GOAL_OPTIONS = [
	"study-abroad",
	"career",
	"certification",
	"communication",
	"academic",
	"other",
] as const;
export type LearningGoalOption = (typeof LEARNING_GOAL_OPTIONS)[number];

export const DAILY_STUDY_HOUR_OPTIONS = [
	"under-1",
	"1-2",
	"2-3",
	"3-plus",
] as const;
export type DailyStudyHourOption = (typeof DAILY_STUDY_HOUR_OPTIONS)[number];

/** Payload POST /api/student/onboarding — wizard 4 bước (D4/D7: đầy đủ, không skip). */
const onboardingPayloadBase = z.object({
	examInterest: z.enum(EXAM_INTERESTS),
	/** Chuỗi hiển thị; hợp lệ phải nằm trong mảng tương ứng examInterest (superRefine). */
	targetScore: z.string().min(1),
	learningGoals: z
		.array(z.enum(LEARNING_GOAL_OPTIONS))
		.min(1)
		.refine((goals) => new Set(goals).size === goals.length),
	learningGoalsNote: z.string().trim().max(200).optional(),
	dailyStudyHours: z.enum(DAILY_STUDY_HOUR_OPTIONS),
});
export const studentOnboardingPayloadSchema = onboardingPayloadBase.superRefine(
	(value, ctx) => {
		const allowed =
			value.examInterest === "ielts" ? IELTS_TARGET_BANDS : TOEIC_TARGET_SCORES;
		if (!(allowed as readonly string[]).includes(value.targetScore)) {
			ctx.addIssue({
				code: "custom",
				path: ["targetScore"],
				message: `targetScore must be one of ${allowed.join(", ")}`,
			});
		}
	},
);
export type StudentOnboardingPayload = z.infer<
	typeof studentOnboardingPayloadSchema
>;

export const studentMeSchema = z.object({
	user: z.object({
		name: z.string(),
		email: z.string(),
	}),
	student: z.object({
		id: z.string(),
		name: z.string(),
		email: z.string(),
		orgId: z.string(),
		examInterest: z.string().nullable().catch(null),
		targetScore: z.string().nullable().catch(null),
		learningGoals: z
			.array(z.enum(LEARNING_GOAL_OPTIONS))
			.nullable()
			.catch(null),
		learningGoalsNote: z.string().nullable().catch(null),
		dailyStudyHours: z.string().nullable().catch(null),
		/** ISO 8601 string — precedent: studentAssignmentSchema.submittedAt. */
		onboardingCompletedAt: z.string().nullable().catch(null),
	}),
});
export type StudentMe = z.infer<typeof studentMeSchema>;

export const studentNextSessionSchema = z.object({
	date: z.string(),
	time: z.string(),
	topic: z.string(),
});
export type StudentNextSession = z.infer<typeof studentNextSessionSchema>;

/** Giáo viên phụ trách lớp = giáo viên sở hữu org (membership role 'teacher' sớm nhất). */
export const studentTeacherSchema = z.object({
	name: z.string(),
	email: z.string(),
	image: z.string().nullable().catch(null),
});
export type StudentTeacher = z.infer<typeof studentTeacherSchema>;

export const studentClassSchema = z.object({
	id: z.string(),
	name: z.string(),
	level: z.string(),
	mode: z.string(),
	schedule: z.string(),
	sessionsDone: z.number().int(),
	sessionsTotal: z.number().int(),
	status: z.string(),
	nextSession: studentNextSessionSchema.nullable(),
	/**
	 * Enrollment của học viên trong lớp này. 'invited' = giáo viên đã thêm vào
	 * lớp nhưng học viên chưa xác nhận (issue #264): portal hiển thị trạng thái
	 * chờ kích hoạt và gọi POST /api/student/enrollments/:enrollmentId/accept.
	 * `.catch` fallback giữ hành vi "đang học" khi server cũ chưa trả field.
	 */
	enrollmentId: z.string().catch(""),
	enrollmentStatus: z.enum(ENROLLMENT_STATUSES).catch("active"),
	/** null = org không có membership giáo viên; `.catch` giữ client chạy với server cũ. */
	teacher: studentTeacherSchema.nullable().catch(null),
});
export type StudentClass = z.infer<typeof studentClassSchema>;

export const studentAssignmentScoresSchema = z.object({
	task: z.number(),
	coherence: z.number(),
	lexical: z.number(),
	grammar: z.number(),
});
export type StudentAssignmentScores = z.infer<
	typeof studentAssignmentScoresSchema
>;

export const studentAssignmentSchema = z.object({
	id: z.string(),
	title: z.string(),
	source: z.enum(["class_assignment", "grading"]),
	classId: z.string().nullable(),
	className: z.string().nullable(),
	due: z.string(),
	submittedAt: z.string().nullable(),
	scores: studentAssignmentScoresSchema.nullable(),
});
export type StudentAssignment = z.infer<typeof studentAssignmentSchema>;

export const studentOverviewSchema = z.object({
	student: z.object({
		id: z.string(),
		name: z.string(),
	}),
	classes: z.array(studentClassSchema),
	assignments: z.array(studentAssignmentSchema),
});
export type StudentOverview = z.infer<typeof studentOverviewSchema>;

/** Buổi học của chính học viên trong lớp (GET /api/student/classes/:classId). */
export const studentClassLessonSchema = z.object({
	id: z.string(),
	/** yyyy-mm-dd; null = lớp legacy (null theo cả lớp). */
	date: z.string().nullable(),
	/** Thứ trong tuần, Monday = 1. */
	day: z.number().int(),
	time: z.string(),
	dur: z.number().int(),
	status: z.string(),
	topic: z.string(),
});
export type StudentClassLesson = z.infer<typeof studentClassLessonSchema>;

export const studentClassDetailSchema = z.object({
	class: studentClassSchema.extend({ startDate: z.string() }),
	lessons: z.array(studentClassLessonSchema),
	assignments: z.array(studentAssignmentSchema),
});
export type StudentClassDetail = z.infer<typeof studentClassDetailSchema>;

/** Roster "Bạn cùng lớp" — CHỈ tên + chữ tắt, không bao giờ trả
 * email/band/học phí/điểm (quy ước quyền riêng lớp học #378). */
export const classmatesResponseSchema = z.array(
	z.object({
		id: z.string(),
		name: z.string(),
		initials: z.string(),
		isMe: z.boolean(),
	}),
);
export type ClassmatesResponse = z.infer<typeof classmatesResponseSchema>;

// --- Tự luyện (phase 10, #378) — /api/student/practice domain --------------
// KHÔNG có "dictation": kỹ năng này chưa có đề trong thư viện.

/** Kỹ năng có đề luyện tập trong thư viện `assignment_test`. */
export const PRACTICE_SKILLS = [
	"reading",
	"listening",
	"writing",
	"speaking",
] as const;
export type PracticeSkill = (typeof PRACTICE_SKILLS)[number];

/** Số đề mỗi trang catalog (design-v2 SkillCatalog PER=12). */
export const PRACTICE_CATALOG_PAGE_SIZE = 12;

/** Kết quả gần nhất của CHÍNH học viên này với một đề luyện tập. `score`
 * là chuỗi hiển thị sẵn ("8/13" tự chấm, "Band 6.5" đã chấm Writing/
 * Speaking), null khi đề tự chấm mà server không derive được. */
export const practiceAttemptSummarySchema = z
	.object({
		/** ISO datetime lần nộp gần nhất. */
		submittedAt: z.string(),
		/** "graded" = giáo viên đã chấm (gradeScores có mặt). */
		status: z.enum(["submitted", "graded"]),
		score: z.string().nullable(),
	})
	.strict();
export type PracticeAttemptSummary = z.infer<
	typeof practiceAttemptSummarySchema
>;

/** Một đề luyện tập trong catalog — MỘT row `assignment_test` status ready. */
export const practiceCatalogItemSchema = z
	.object({
		testId: z.string(),
		title: z.string(),
		skill: z.enum(PRACTICE_SKILLS),
		/** Số part đã ghép trong đề (số slot `assignment_test_part`). */
		parts: z.number().int().min(1),
		/** Bộ sưu tập nguồn — null khi giáo viên không đặt. */
		collection: z.string().nullable(),
		testGroup: z.string().nullable(),
		/** Thời lượng theo phút (từ `timeLimitSeconds`) — null = không giới hạn. */
		durationMin: z.number().int().nullable(),
		/** Lượt tự luyện gần nhất của chính học viên — null = chưa làm. */
		lastAttempt: practiceAttemptSummarySchema.nullable(),
	})
	.strict();
export type PracticeCatalogItem = z.infer<typeof practiceCatalogItemSchema>;

/** GET /api/student/practice?skill=&collection=&q=&page= — phân trang 12. */
export const practiceCatalogResponseSchema = z
	.object({
		items: z.array(practiceCatalogItemSchema),
		page: z.number().int().min(1),
		pages: z.number().int().min(1),
		total: z.number().int().min(0),
	})
	.strict();
export type PracticeCatalogResponse = z.infer<
	typeof practiceCatalogResponseSchema
>;

/** POST /api/student/practice/:testId/attempts — 201 lượt mới / 200 resume
 * lượt đang làm (cùng shape với start attempt luồng assignment). */
export const startPracticeResponseSchema = z
	.object({ attemptId: z.string().min(1) })
	.strict();
export type StartPracticeResponse = z.infer<typeof startPracticeResponseSchema>;

// --- Lịch sử học tập (phase 11, #378) — /api/student/history domain --------
// Nguồn: quiz_attempt đã nộp (practice + assignment) và vocab_review_log
// (sessionKind='review'), gom ngày theo giờ Việt Nam (vietnam-date.ts).
// KHÔNG có Dictation/Mock test — hai loại này chưa có dữ liệu thật.

/** Kỹ năng hiển thị trên trang Lịch sử: 4 skill có đề + Từ vựng (SRS). */
export const HISTORY_SKILLS = [...PRACTICE_SKILLS, "vocabulary"] as const;
export type HistorySkill = (typeof HISTORY_SKILLS)[number];

/** Số dòng mỗi trang danh sách chi tiết. */
export const HISTORY_PAGE_SIZE = 20;

/** Một ngày có hoạt động. Chỉ ngày count > 0 mới xuất hiện trong mảng —
 * client dựng lưới tháng và coi ngày vắng mặt là 0. */
export const historyDaySchema = z
	.object({
		/** yyyy-mm-dd theo giờ Việt Nam. */
		date: z.string(),
		/** Số hoạt động: lượt nộp bài + thẻ từ vựng đã ôn. */
		count: z.number().int().min(0),
		/** Tổng phút học (làm bài + ôn từ) rơi vào ngày này. */
		minutes: z.number().int().min(0),
	})
	.strict();
export type HistoryDay = z.infer<typeof historyDaySchema>;

/** GET /api/student/history/month?ym=yyyy-mm (mặc định tháng hiện tại VN). */
export const historyMonthResponseSchema = z
	.object({
		ym: z.string(),
		days: z.array(historyDaySchema),
	})
	.strict();
export type HistoryMonthResponse = z.infer<typeof historyMonthResponseSchema>;

/** Một dòng bảng tuần: đếm hoạt động theo 7 ngày Thứ 2 → Chủ nhật. */
export const historyWeekRowSchema = z
	.object({
		skill: z.enum(HISTORY_SKILLS),
		days: z.array(z.number().int().min(0)).length(7),
	})
	.strict();
export type HistoryWeekRow = z.infer<typeof historyWeekRowSchema>;

/** GET /api/student/history/week?monday=yyyy-mm-dd — ngày lẻ được chuẩn hóa
 * về Thứ Hai của tuần chứa nó; `minutes` là tổng phút mỗi ngày cho cột
 * "Thời gian" của WeekTable. */
export const historyWeekResponseSchema = z
	.object({
		monday: z.string(),
		rows: z.array(historyWeekRowSchema),
		minutes: z.array(z.number().int().min(0)).length(7),
	})
	.strict();
export type HistoryWeekResponse = z.infer<typeof historyWeekResponseSchema>;

/** Nguồn một dòng lịch sử: luyện tập / bài tập lớp / ôn từ vựng. */
export const HISTORY_ENTRY_KINDS = ["practice", "assignment", "vocab"] as const;
export type HistoryEntryKind = (typeof HISTORY_ENTRY_KINDS)[number];

/** Một dòng trong danh sách chi tiết. Vocab gộp theo ngày: 1 dòng
 * "Từ vựng" = mọi thẻ đã ôn trong ngày đó (id `vocab-<date>`). */
export const historyEntrySchema = z
	.object({
		id: z.string(),
		kind: z.enum(HISTORY_ENTRY_KINDS),
		skill: z.enum(HISTORY_SKILLS),
		title: z.string(),
		/** yyyy-mm-dd giờ Việt Nam của thời điểm nộp/ôn. */
		date: z.string(),
		/** ISO datetime — dùng sắp xếp mới nhất trước. */
		submittedAt: z.string(),
		minutes: z.number().int().min(0),
		/** Chuỗi hiển thị sẵn ("Band 6.0", "8/13") — null = chưa có điểm. */
		score: z.string().nullable(),
		/** auto = tự chấm · graded = giáo viên đã chấm · awaiting = chờ chấm. */
		status: z.enum(["auto", "graded", "awaiting"]),
		/** Attempt nguồn để mở xem lại (Writing đã chấm) — vocab luôn null. */
		attemptId: z.string().nullable(),
	})
	.strict();
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

/** GET /api/student/history?skill=&page= — mới nhất trước, 20 dòng/trang. */
export const historyListResponseSchema = z
	.object({
		entries: z.array(historyEntrySchema),
		page: z.number().int().min(1),
		pages: z.number().int().min(1),
		total: z.number().int().min(0),
	})
	.strict();
export type HistoryListResponse = z.infer<typeof historyListResponseSchema>;

// --- Student quiz take & review (#283) — /api/student quiz attempt domain ---

export const QUIZ_ATTEMPT_STATUSES = ["in_progress", "submitted"] as const;
export type QuizAttemptStatus = (typeof QUIZ_ATTEMPT_STATUSES)[number];

/** Verdict per question — tính server-side từ questionsSnapshot (Phase 1). */
export const QUIZ_VERDICTS = ["correct", "wrong", "skipped"] as const;
export type QuizVerdict = (typeof QUIZ_VERDICTS)[number];

/** Cap answer value per autosave PATCH (RT#16) — matches the 4096-byte body cap. */
export const QUIZ_ANSWER_VALUE_MAX = 500;

/** Cap bài viết Writing (#304): Task 2 thường 250–400 từ ≈ 2.500 ký tự,
 * 10.000 là dư ~4 lần. Riêng route /essay có body cap 48KB (đủ cho 10.000
 * ký tự UTF-8 3 byte cộng escape JSON, vẫn dưới giới hạn 64KB của fetch
 * keepalive); các route quiz khác giữ cap 4096 byte. */
export const QUIZ_ESSAY_MAX = 10000;
export const QUIZ_ESSAY_BODY_MAX = 48 * 1024;

/** Autosave bài viết Writing: route PATCH /attempts/:id/essay, body `{ text }`.
 * Tách khỏi map `answers` vì map đó gắn với index câu hỏi, cap 500 ký tự và
 * đi vào gradeQuiz — đề Writing không có câu nào. */
export const quizEssayPatchSchema = z
	.object({
		text: z.string().max(QUIZ_ESSAY_MAX),
	})
	.strict();
export type QuizEssayPatch = z.infer<typeof quizEssayPatchSchema>;

/** Bài nói Speaking (#305): 1 file audio/video mỗi attempt, user chốt 50MB —
 * dưới trần 100MB body request của Worker gói Free/Pro, đủ cho audio và
 * video 720p ngắn. Upload là raw body PUT stream thẳng vào R2. */
export const QUIZ_MEDIA_MAX_BYTES = 50 * 1024 * 1024;
export const QUIZ_MEDIA_NAME_MAX = 200;

/** Allowlist MIME bài nói → nhãn định dạng hiển thị. Server chỉ nhận
 * Content-Type trong map này; client chuẩn hoá theo đuôi file trước khi gửi
 * (`resolveQuizMediaType`). */
export const QUIZ_MEDIA_TYPES: Readonly<Record<string, string>> = {
	"audio/mpeg": "MP3",
	"audio/mp4": "M4A",
	"audio/x-m4a": "M4A",
	"audio/aac": "AAC",
	"audio/wav": "WAV",
	"audio/x-wav": "WAV",
	"audio/wave": "WAV",
	"audio/webm": "WEBM",
	"audio/ogg": "OGG",
	"video/mp4": "MP4",
	"video/quicktime": "MOV",
	"video/webm": "WEBM",
};

/** File bài nói đã tải lên của một attempt (không lộ object key). */
export const quizAttemptMediaSchema = z
	.object({
		name: z.string(),
		type: z.string(),
		size: z.number().int().min(0),
		/** ISO datetime. */
		uploadedAt: z.string(),
	})
	.strict();
export type QuizAttemptMedia = z.infer<typeof quizAttemptMediaSchema>;

/** Nhận xét giáo viên cho bài Writing/Speaking — plain text. */
export const QUIZ_FEEDBACK_MAX = 5000;
/** Điểm một tiêu chí IELTS: 0–9, bước 0.5. */
export const bandScoreSchema = z
	.number()
	.refine(isBandStep, "band step 0.5 in 0..9");
export const writingGradeScoresSchema = z
	.object({
		task: bandScoreSchema,
		coherence: bandScoreSchema,
		lexical: bandScoreSchema,
		grammar: bandScoreSchema,
	})
	.strict();
export const speakingGradeScoresSchema = z
	.object({
		fluency: bandScoreSchema,
		lexical: bandScoreSchema,
		grammar: bandScoreSchema,
		pronunciation: bandScoreSchema,
	})
	.strict();
/** POST /api/grading/:attemptId/grade — scores validate theo skill ở server. */
export const quizGradeInputSchema = z
	.object({
		scores: z.record(z.string(), z.number()),
		feedback: z.string().max(QUIZ_FEEDBACK_MAX),
	})
	.strict();
export type QuizGradeInput = z.infer<typeof quizGradeInputSchema>;
/** Điểm đã chấm — band luôn derive từ scores (ieltsOverallBand). */
export const quizAttemptGradeSchema = z
	.object({
		scores: z.record(z.string(), z.number()),
		band: z.number(),
		feedback: z.string(),
		/** ISO datetime lần lưu gần nhất. */
		gradedAt: z.string(),
	})
	.strict();
export type QuizAttemptGrade = z.infer<typeof quizAttemptGradeSchema>;

/** Highlight + ghi chú giáo viên trên essay Writing (#332). Offset là index
 * UTF-16 (String.slice) trên essay đã nộp — essay đóng băng sau nộp. */
export const QUIZ_ANNOTATION_NOTE_MAX = 1000;
export const QUIZ_ANNOTATIONS_MAX = 200;
export const QUIZ_ANNOTATION_SPAN_MAX = 1000;
export const essayAnnotationSchema = z
	.object({
		id: z.string(),
		start: z.number().int().min(0),
		end: z.number().int().min(1),
		note: z.string(),
	})
	.strict();
export type EssayAnnotation = z.infer<typeof essayAnnotationSchema>;
/** POST /api/grading/:attemptId/annotations — biên kiểm thêm theo essay ở server. */
export const essayAnnotationCreateSchema = z
	.object({
		start: z.number().int().min(0),
		end: z.number().int().min(1),
		note: z.string().max(QUIZ_ANNOTATION_NOTE_MAX),
	})
	.strict()
	.refine((v) => v.end > v.start, "end must be greater than start");
export type EssayAnnotationCreate = z.infer<typeof essayAnnotationCreateSchema>;
/** PATCH /api/grading/:attemptId/annotations/:annotationId. */
export const essayAnnotationPatchSchema = z
	.object({ note: z.string().max(QUIZ_ANNOTATION_NOTE_MAX) })
	.strict();
export type EssayAnnotationPatch = z.infer<typeof essayAnnotationPatchSchema>;

/** GET /api/grading/:attemptId — bài nộp Writing/Speaking cho giáo viên chấm. */
export const teacherSubmissionSchema = z
	.object({
		attemptId: z.string(),
		classAssignmentId: z.string(),
		classId: z.string(),
		className: z.string(),
		title: z.string(),
		due: z.string(),
		student: z.object({ id: z.string(), name: z.string() }).strict(),
		skill: z.enum(["writing", "speaking"]),
		part: z.string(),
		prompt: z
			.object({
				prompt: z.string(),
				imageUrl: z.string(),
				cueTopic: z.string(),
				cuePoints: z.string(),
				note: z.string(),
			})
			.strict(),
		startedAt: z.string(),
		submittedAt: z.string(),
		essay: z.string().nullable(),
		media: quizAttemptMediaSchema.nullable(),
		grade: quizAttemptGradeSchema.nullable(),
		/** Highlight + ghi chú trên essay (#332) — server luôn gửi; optional
		 * để bundle mới + server cũ không throw. Speaking luôn `[]`. */
		annotations: z.array(essayAnnotationSchema).optional(),
		/** Bài tự luyện (phase 10, #378): KHÔNG gắn lớp — `classId`/
		 * `classAssignmentId` là chuỗi rỗng, `className` là nhãn "Luyện tập",
		 * `due` rỗng. Optional để bundle cũ + server mới không throw. */
		practice: z.literal(true).optional(),
	})
	.strict();
export type TeacherSubmission = z.infer<typeof teacherSubmissionSchema>;

/** Một dòng trong hàng chờ chấm Writing/Speaking (GET /api/grading, #383) —
 * hợp nhất cả bài giao theo lớp (mode='assignment') và tự luyện
 * (mode='practice', classId='', className='Luyện tập', due=''). */
export const gradingQueueItemSchema = z
	.object({
		attemptId: z.string(),
		mode: z.enum(["assignment", "practice"]),
		classId: z.string(),
		className: z.string(),
		title: z.string(),
		due: z.string(),
		student: z.object({ id: z.string(), name: z.string() }).strict(),
		skill: z.enum(["writing", "speaking"]),
		part: z.string(),
		submittedAt: z.string(),
		grade: quizAttemptGradeSchema.nullable(),
	})
	.strict();
export type GradingQueueItem = z.infer<typeof gradingQueueItemSchema>;

/** GET /api/grading — danh sách bài nộp Writing/Speaking cho giáo viên chấm. */
export const gradingQueueResponseSchema = z
	.object({
		items: z.array(gradingQueueItemSchema),
	})
	.strict();
export type GradingQueueResponse = z.infer<typeof gradingQueueResponseSchema>;

/** Mục tiêu số từ tối thiểu IELTS Writing theo part — chỉ cảnh báo ở client,
 * không chặn nộp (user chốt #304). Part lạ → không hiện mục tiêu. */
export const WRITING_MIN_WORDS: Readonly<Record<string, number>> = {
	task1: 150,
	task2: 250,
};

/** Body của POST start/submit — exactly `{}` (mirror lessonActionSchema). */
export const quizAttemptActionSchema = z.object({}).strict();
export type QuizAttemptAction = z.infer<typeof quizAttemptActionSchema>;

/** Autosave 1 câu: `q` là index 0-based; range check chạy server-side với
 * snapshot length (contract không biết độ dài đề). */
export const quizAnswerPatchSchema = z
	.object({
		q: z.number().int().min(0),
		value: z.string().max(QUIZ_ANSWER_VALUE_MAX),
	})
	.strict();
export type QuizAnswerPatch = z.infer<typeof quizAnswerPatchSchema>;

/** Câu hỏi đã sanitize cho take surface — `answer`/`alts` bị strip (RT#6). */
export const studentQuizQuestionSchema = z
	.object({
		stem: z.string(),
		opts: z.array(z.string()).nullable(),
		/** Dạng bài hiệu dụng của câu (server resolve `question.type ??
		 * prompt.type`). OPTIONAL phía client dù server luôn gửi: client
		 * student strict-parse payload, bundle cũ + server mới không được
		 * throw trong cửa sổ deploy — client đọc `question.type ??
		 * detail.type` (fallback kép). */
		type: z.string().optional(),
		pin: z.object({ x: z.number(), y: z.number() }).nullish(),
	})
	.strict();
export type StudentQuizQuestion = z.infer<typeof studentQuizQuestionSchema>;

/**
 * GET /api/student/assignments/:assignmentId/quiz — đề sạch cho take screen.
 * Paper fields đọc từ prompt hiện tại; `questions` lấy từ `questionsSnapshot`
 * của attempt khi đã start (RT#3), còn `note`, `transcript` (nguồn suy ra đáp
 * án listening) và answer key không bao giờ xuống wire — transcript không có
 * mặt trong payload. `attempt.answers` cho resume; null khi chưa start.
 */
export const studentQuizDetailSchema = z
	.object({
		assignmentId: z.string(),
		title: z.string(),
		due: z.string(),
		skill: z.string(),
		part: z.string(),
		type: z.string(),
		band: z.string(),
		intro: z.string(),
		prompt: z.string(),
		passage: z.string(),
		cueTopic: z.string(),
		cuePoints: z.string(),
		audioName: z.string(),
		imageUrl: z.string(),
		optionBank: z.array(z.string()),
		/** "Hướng dẫn thêm" của giáo viên — CHỈ có với đề Speaking (#305):
		 * đề Speaking không có answer key nên note là hướng dẫn cho học viên;
		 * đề tự chấm vẫn giữ kín note tới sau khi nộp (RT#6). */
		note: z.string().optional(),
		questions: z.array(studentQuizQuestionSchema),
		attempt: z
			.object({
				id: z.string(),
				status: z.enum(QUIZ_ATTEMPT_STATUSES),
				answers: z.record(z.string(), z.string()),
				/** Bài viết Writing đã autosave — optional để bundle cũ + server
				 * mới không throw trong cửa sổ deploy (#304). */
				essay: z.string().optional(),
				/** File bài nói Speaking đã tải lên (#305) — optional cùng lý
				 * do với `essay`. */
				media: quizAttemptMediaSchema.nullable().optional(),
			})
			.nullable(),
	})
	.strict();
export type StudentQuizDetail = z.infer<typeof studentQuizDetailSchema>;

/** POST submit → counters (idempotent: double submit trả đúng shape này). */
export const quizSubmitResultSchema = z
	.object({
		correctCount: z.number().int().min(0),
		totalCount: z.number().int().min(0),
		wrongCount: z.number().int().min(0),
		skippedCount: z.number().int().min(0),
	})
	.strict();
export type QuizSubmitResult = z.infer<typeof quizSubmitResultSchema>;

/** Một dòng compact cho summary list: n → đáp án học viên → đáp án đúng. */
export const quizAttemptItemSchema = z
	.object({
		verdict: z.enum(QUIZ_VERDICTS),
		key: z.string(),
		answer: z.string().nullable(),
	})
	.strict();
export type QuizAttemptItem = z.infer<typeof quizAttemptItemSchema>;

/**
 * GET /api/student/attempts/:attemptId — summary sau nộp. 409 khi attempt
 * còn `in_progress` (RT#6) nên payload thành công luôn là đã submit.
 */
export const quizAttemptSummarySchema = z
	.object({
		id: z.string(),
		assignmentId: z.string(),
		title: z.string(),
		status: z.enum(QUIZ_ATTEMPT_STATUSES),
		correctCount: z.number().int().min(0),
		wrongCount: z.number().int().min(0),
		skippedCount: z.number().int().min(0),
		totalCount: z.number().int().min(0),
		/** ISO datetime — duration hiển thị = submittedAt − startedAt. */
		startedAt: z.string(),
		submittedAt: z.string(),
		items: z.array(quizAttemptItemSchema),
		/** Bài viết Writing đã nộp — null/undefined khi đề không phải Writing.
		 * Optional bảo vệ chiều client mới + server cũ (key vắng mặt không
		 * throw). CHIỀU NGƯỢC lại không bảo vệ được: schema này `.strict()`
		 * nên bundle cũ (chưa có key essay) parse payload mới sẽ throw
		 * Unrecognized key cho tới khi reload lấy bundle mới (#304,
		 * code-review F2 — cùng cửa sổ đã chấp nhận ở precedent `type`
		 * #286; server + student phải deploy cùng release). */
		essay: z.string().nullable().optional(),
		/** Skill của đề (#305) — summary rẽ nhánh Speaking theo field này.
		 * Optional cùng precedent `essay`: vắng mặt = server cũ, xử lý như đề
		 * không phải Speaking. */
		skill: z.string().optional(),
		/** File bài nói đã nộp — null khi đề không phải Speaking hoặc bài
		 * Speaking cũ nộp trước #305. */
		media: quizAttemptMediaSchema.nullable().optional(),
		/** Điểm giáo viên chấm (Writing/Speaking). Server CHỈ gửi key khi đã
		 * chấm — bundle cũ (strict) chỉ lỗi parse ở attempt đã chấm. */
		grade: quizAttemptGradeSchema.nullable().optional(),
		/** Part của đề (task1/task2/part1…) — server CHỈ gửi kèm `grade`, để
		 * nhãn tiêu chí Writing đúng TA/TR; cùng lý do strict ở trên. */
		part: z.string().optional(),
		/** Highlight + ghi chú giáo viên (#332) — server CHỈ gửi khi đã chấm +
		 * Writing + có ít nhất 1 highlight, cùng lý do strict của `grade`. */
		annotations: z.array(essayAnnotationSchema).optional(),
		/** Lượt tự luyện (phase 10) — server CHỈ gửi khi attempt practice;
		 * `testId` là đề thư viện nguồn để client dựng URL take/review. */
		practice: z.literal(true).optional(),
		testId: z.string().optional(),
	})
	.strict();
export type QuizAttemptSummary = z.infer<typeof quizAttemptSummarySchema>;

/**
 * GET /api/student/attempts/:attemptId/detail — review đầy đủ: paper render
 * từ snapshot (stem/opts/pin) + key/alts/verdict/đáp án học viên per câu +
 * `note` của đề (withhold ở take, chỉ reveal sau submit). Cùng gate 409
 * in_progress như summary.
 */
export const quizAttemptDetailSchema = quizAttemptSummarySchema
	.omit({ items: true })
	.extend({
		note: z.string(),
		questions: z.array(
			studentQuizQuestionSchema
				.extend({
					key: z.string(),
					alts: z.string(),
					verdict: z.enum(QUIZ_VERDICTS),
					answer: z.string().nullable(),
				})
				.strict(),
		),
	})
	.strict();
export type QuizAttemptDetail = z.infer<typeof quizAttemptDetailSchema>;

/**
 * Student Invitation & Multi-Org Contracts (Phase 2).
 */
export const STUDENT_INVITATION_ERROR_CODES = {
	ALREADY_IN_ORG: "STUDENT_ALREADY_IN_ORG",
	INVITATION_ALREADY_PENDING: "INVITATION_ALREADY_PENDING",
	INVITATION_NOT_FOUND: "INVITATION_NOT_FOUND",
} as const;
export type StudentInvitationErrorCode =
	(typeof STUDENT_INVITATION_ERROR_CODES)[keyof typeof STUDENT_INVITATION_ERROR_CODES];

export const studentInviteSchema = z.object({
	email: z.string().trim().email("Email không hợp lệ"),
});
export type StudentInviteInput = z.infer<typeof studentInviteSchema>;

export interface StudentInvitationItem {
	id: string;
	orgId: string;
	orgName?: string;
	inviterUserId: string;
	inviterName?: string;
	email: string;
	status: "pending" | "accepted" | "rejected" | "canceled";
	createdAt: string | number | Date;
	updatedAt?: string | number | Date;
}

export interface StudentOrgItem {
	id: string;
	name: string;
	isCurrent: boolean;
}

// --- Bank Hub account linking (issue #320) ---

export const BANK_LINK_ERROR_CODES = {
	BANKHUB_DISABLED: "BANKHUB_DISABLED",
	ALREADY_LINKED: "BANK_LINK_ALREADY_LINKED",
	NO_LINKED_ACCOUNT: "BANK_LINK_NO_LINKED_ACCOUNT",
	BAD_HOSTED_LINK_ORIGIN: "BANK_LINK_BAD_HOSTED_LINK_ORIGIN",
	COMPANY_SETTLING: "BANK_LINK_COMPANY_SETTLING",
	BANKHUB_UPSTREAM: "BANKHUB_UPSTREAM",
	BANKHUB_RATE_LIMITED: "BANKHUB_RATE_LIMITED",
} as const;
export type BankLinkErrorCode =
	(typeof BANK_LINK_ERROR_CODES)[keyof typeof BANK_LINK_ERROR_CODES];

export const bankLinkStatusSchema = z.object({
	enabled: z.boolean(),
	status: z.enum(["none", "linked", "inactive", "unlinked"]),
	brandName: z.string(),
	accountNumberMasked: z.string(),
	holderName: z.string(),
	linkedAt: z.string().nullable(),
});
export type BankLinkStatus = z.infer<typeof bankLinkStatusSchema>;

export const bankLinkTokenRequestSchema = z
	.object({ purpose: z.enum(["link", "unlink", "reactivate"]) })
	.strict();
export type BankLinkTokenRequest = z.infer<typeof bankLinkTokenRequestSchema>;

export const bankLinkTokenResponseSchema = z.object({
	hostedLinkUrl: z.string().min(1),
	expiresAt: z.string(),
});
export type BankLinkTokenResponse = z.infer<typeof bankLinkTokenResponseSchema>;

// --- Invoice payment instructions (#320) ---

export const PAYMENT_ERROR_CODES = {
	INVOICE_NOT_FOUND: "PAYMENT_INVOICE_NOT_FOUND",
	NO_BANK_LINK: "PAYMENT_NO_BANK_LINK",
} as const;

export interface PaymentBankInfo {
	brandName: string;
	accountNumber: string;
	holderName: string;
}

export interface PaymentInstructions {
	invoiceCode: string;
	amount: number;
	paidAmount: number;
	amountDue: number;
	status: string;
	due: string;
	note: string;
	/** false when the org has no linked account or the invoice is settled. */
	payable: boolean;
	reason?: "NO_BANK_LINK" | "PAID";
	bank?: PaymentBankInfo;
	memo?: string;
	qrUrl?: string;
}

/** Public /pay/<token> view: no teacher free-text (note) and no due date. */
export type PublicPayView = Omit<PaymentInstructions, "note" | "due"> & {
	orgName: string;
	studentName: string;
};

export interface StudentInvoiceItem {
	id: string;
	invoiceCode: string;
	amount: number;
	paidAmount: number;
	amountDue: number;
	status: string;
	due: string;
	type: string;
}

/** #320 — one row of the teacher's unmatched-transaction queue. */
export interface PaymentTransactionItem {
	id: string;
	amount: number;
	/** Null on foreign_code rows — another org's transfer memo is secret. */
	content: string | null;
	referenceCode: string;
	transactionDate: string;
	unmatchedReason:
		| ""
		| "unknown_code"
		| "invoice_paid"
		| "no_code"
		| "foreign_code"
		| string;
	paymentCode: string | null;
}

export const paymentAssignSchema = z
	.object({ invoiceId: z.string().min(1) })
	.strict();
export type PaymentAssignInput = z.infer<typeof paymentAssignSchema>;

/** #345 — one matched bank transaction on the teacher's invoice detail page. */
export interface InvoiceTransactionItem {
	id: string;
	amount: number;
	/** Transfer memo as typed by the payer. */
	content: string;
	referenceCode: string;
	/** Provider timestamp string, as stored (e.g. "2026-10-05 10:00:00"). */
	transactionDate: string;
	/** ISO 8601 — server ingest time (Drizzle timestamp_ms → Date → toISOString()). */
	createdAt: string;
}

export interface ReconcileResult {
	scanned: number;
	matched: number;
	unmatched: number;
}

// --- Student Vocab SRS Game (#359) & Built-in Vocab Library (#361) ---
// RELEASE TRAIN NOTE (#304, #361): All vocab response/request schemas use `.strict()`.
// `apps/server` and `apps/student` MUST be deployed on the same release train.
// Note on `hasAudio` (#361): `.default(false)` makes old payloads backward-compatible
// with the new schema, but an older student bundle parsing `.strict()` at runtime will
// reject the new `hasAudio` field from a newer server — always deploy worker + student together.

/** Server-side upper bound for clamping `durationMs` (1 hour) — never rejects client input. */
export const VOCAB_DURATION_MAX_MS = 3_600_000;

/** Upper bound (5 MB) for proxying remote library audio files (#361). */
export const LIBRARY_AUDIO_MAX_BYTES = 5 * 1024 * 1024;

export const VOCAB_ERROR_CODES = {
	DECK_NOT_FOUND: "VOCAB_DECK_NOT_FOUND",
	WORD_NOT_FOUND: "VOCAB_WORD_NOT_FOUND",
	CARD_NOT_FOUND: "VOCAB_CARD_NOT_FOUND",
	/** Review first-result trên card chưa học (state='new') — phải qua Learn. */
	CARD_NOT_DUE: "VOCAB_CARD_NOT_DUE",
	AUDIO_NOT_FOUND: "VOCAB_AUDIO_NOT_FOUND",
	INVALID_AUDIO: "VOCAB_INVALID_AUDIO",
	LIBRARY_COURSE_NOT_FOUND: "LIBRARY_COURSE_NOT_FOUND",
	LIBRARY_DECK_NOT_FOUND: "LIBRARY_DECK_NOT_FOUND",
	LIBRARY_CLONE_TOO_LARGE: "LIBRARY_CLONE_TOO_LARGE",
	LIBRARY_CLONE_DUPLICATE_DECK: "LIBRARY_CLONE_DUPLICATE_DECK",
	SUGGESTION_NOT_FOUND: "VOCAB_SUGGESTION_NOT_FOUND",
	SUGGESTION_ALREADY_ACCEPTED: "VOCAB_SUGGESTION_ALREADY_ACCEPTED",
} as const;
export type VocabErrorCode =
	(typeof VOCAB_ERROR_CODES)[keyof typeof VOCAB_ERROR_CODES];

export interface KernelVocabDeckRow {
	id: string;
	classId: string | null;
	title: string;
	lang: string;
	wordCount: number;
	createdAt: string;
	sourceLibraryDeckId: string | null;
}
export interface KernelVocabSuggestionRow {
	id: string;
	deckId: string;
	studentId: string;
	note: string | null;
	createdAt: string;
}

export const RESERVED_LIBRARY_ID_PREFIX_REGEX =
	/^(libcourse|libdeck|libword)-/i;

export const vocabDeckCreateSchema = z
	.object({
		id: z
			.string()
			.min(1)
			.max(128)
			.refine(
				(id) => !RESERVED_LIBRARY_ID_PREFIX_REGEX.test(id),
				"Reserved library ID prefix",
			)
			.optional(),
		classId: z.string().min(1).nullable().optional().default(null),
		title: z.string().trim().min(1).max(200),
		lang: z.string().trim().min(1).max(16).default("en"),
	})
	.strict();
export type VocabDeckCreateInput = z.infer<typeof vocabDeckCreateSchema>;

export const vocabDeckRenameSchema = z
	.object({
		deckId: z.string().min(1),
		title: z.string().trim().min(1).max(200),
		lang: z.string().trim().min(1).max(16).optional(),
	})
	.strict();
export type VocabDeckRenameInput = z.infer<typeof vocabDeckRenameSchema>;

export const vocabDeckDeleteSchema = z
	.object({
		deckId: z.string().min(1),
	})
	.strict();
export type VocabDeckDeleteInput = z.infer<typeof vocabDeckDeleteSchema>;

/**
 * Teacher word upsert contract. Note: `audioKey` is intentionally omitted here
 * (red-team F3) — audio keys are generated and set exclusively by the server
 * after a verified upload to `PUT /api/kernel/vocab/words/:wordId/audio`.
 */
export const vocabWordUpsertSchema = z
	.object({
		id: z
			.string()
			.min(1)
			.max(128)
			.refine(
				(id) => !RESERVED_LIBRARY_ID_PREFIX_REGEX.test(id),
				"Reserved library ID prefix",
			)
			.optional(),
		deckId: z.string().min(1),
		word: z.string().trim().min(1).max(200),
		ipa: z.string().trim().max(200).nullable().optional(),
		translation: z.string().trim().max(500).default(""),
		sortOrder: z.number().int().min(0).default(0),
	})
	.strict();
export type VocabWordUpsertInput = z.infer<typeof vocabWordUpsertSchema>;

export const vocabWordRemoveSchema = z
	.object({
		wordId: z.string().min(1),
	})
	.strict();
export type VocabWordRemoveInput = z.infer<typeof vocabWordRemoveSchema>;

export const vocabTeacherWordSchema = z
	.object({
		id: z.string().min(1),
		deckId: z.string().min(1),
		word: z.string(),
		ipa: z.string().nullable(),
		translation: z.string(),
		audioKey: z.string().nullable(),
		audioUrl: z.string().nullable(),
		sortOrder: z.number().int(),
	})
	.strict();
export type VocabTeacherWord = z.infer<typeof vocabTeacherWordSchema>;

export const vocabTeacherWordsResponseSchema = z
	.object({
		words: z.array(vocabTeacherWordSchema),
	})
	.strict();
export type VocabTeacherWordsResponse = z.infer<
	typeof vocabTeacherWordsResponseSchema
>;

export const vocabLibraryCourseSchema = z
	.object({
		id: z.string().min(1),
		name: z.string(),
		description: z.string().nullable(),
		target: z.string().nullable(),
		deckCount: z.number().int().min(0),
		sortOrder: z.number().int(),
	})
	.strict();
export type VocabLibraryCourse = z.infer<typeof vocabLibraryCourseSchema>;

export const vocabLibraryCoursesResponseSchema = z
	.object({
		courses: z.array(vocabLibraryCourseSchema),
	})
	.strict();
export type VocabLibraryCoursesResponse = z.infer<
	typeof vocabLibraryCoursesResponseSchema
>;

export const vocabLibraryDeckSchema = z
	.object({
		id: z.string().min(1),
		courseId: z.string().min(1),
		title: z.string(),
		description: z.string().nullable(),
		imageUrl: z.string().nullable(),
		wordCount: z.number().int().min(0),
		sortOrder: z.number().int(),
	})
	.strict();
export type VocabLibraryDeck = z.infer<typeof vocabLibraryDeckSchema>;

export const vocabLibraryDecksResponseSchema = z
	.object({
		decks: z.array(vocabLibraryDeckSchema),
	})
	.strict();
export type VocabLibraryDecksResponse = z.infer<
	typeof vocabLibraryDecksResponseSchema
>;

export const vocabLibraryWordSchema = z
	.object({
		id: z.string().min(1),
		word: z.string(),
		ipa: z.string().nullable(),
		pos: z.string().nullable(),
		translation: z.string(),
		sentenceVi: z.string().nullable(),
		sentenceEn: z.string().nullable(),
		pictureUrl: z.string().nullable(),
		audioUrl: z.string().nullable(),
		sortOrder: z.number().int(),
	})
	.strict();
export type VocabLibraryWord = z.infer<typeof vocabLibraryWordSchema>;

export const vocabLibraryWordsResponseSchema = z
	.object({
		deck: z
			.object({
				id: z.string().min(1),
				title: z.string(),
			})
			.strict(),
		words: z.array(vocabLibraryWordSchema),
	})
	.strict();
export type VocabLibraryWordsResponse = z.infer<
	typeof vocabLibraryWordsResponseSchema
>;

export const vocabLibraryCloneSchema = z
	.object({
		classId: z.string().min(1).nullable().optional().default(null),
		deckIds: z.array(z.string().min(1)).min(1).max(50),
	})
	.strict();
export type VocabLibraryCloneInput = z.infer<typeof vocabLibraryCloneSchema>;

export const vocabStudentLibraryCourseSchema = z
	.object({
		id: z.string().min(1),
		name: z.string(),
		description: z.string().nullable(),
		target: z.string().nullable(),
		deckCount: z.number().int().min(0),
		wordCount: z.number().int().min(0),
		reviewWordCount: z.number().int().min(0),
		learnedWordCount: z.number().int().min(0),
		dueWordCount: z.number().int().min(0),
		sortOrder: z.number().int(),
	})
	.strict();
export type VocabStudentLibraryCourse = z.infer<
	typeof vocabStudentLibraryCourseSchema
>;

export const vocabStudentLibraryCoursesResponseSchema = z
	.object({
		courses: z.array(vocabStudentLibraryCourseSchema),
	})
	.strict();
export type VocabStudentLibraryCoursesResponse = z.infer<
	typeof vocabStudentLibraryCoursesResponseSchema
>;

export const vocabStudentLibraryCourseSummarySchema = z
	.object({
		id: z.string().min(1),
		name: z.string(),
		description: z.string().nullable(),
		target: z.string().nullable(),
	})
	.strict();
export type VocabStudentLibraryCourseSummary = z.infer<
	typeof vocabStudentLibraryCourseSummarySchema
>;

export const vocabStudentLibraryDeckSchema = z
	.object({
		id: z.string().min(1),
		courseId: z.string().min(1),
		title: z.string(),
		description: z.string().nullable(),
		imageUrl: z.string().nullable(),
		wordCount: z.number().int().min(0),
		newCount: z.number().int().min(0),
		reviewCount: z.number().int().min(0),
		dueCount: z.number().int().min(0),
		learnedCount: z.number().int().min(0),
		sortOrder: z.number().int(),
	})
	.strict();
export type VocabStudentLibraryDeck = z.infer<
	typeof vocabStudentLibraryDeckSchema
>;

export const vocabStudentLibraryDecksResponseSchema = z
	.object({
		course: vocabStudentLibraryCourseSummarySchema.optional(),
		decks: z.array(vocabStudentLibraryDeckSchema),
	})
	.strict();
export type VocabStudentLibraryDecksResponse = z.infer<
	typeof vocabStudentLibraryDecksResponseSchema
>;

export const vocabSuggestDeckSchema = z
	.object({
		id: z.string().min(1).max(128).optional(),
		deckId: z.string().min(1),
		studentId: z.string().min(1),
		note: z.string().trim().max(500).nullable().optional(),
	})
	.strict();
export type VocabSuggestDeckInput = z.infer<typeof vocabSuggestDeckSchema>;

export const vocabRevokeSuggestionSchema = z
	.object({
		suggestionId: z.string().min(1),
	})
	.strict();
export type VocabRevokeSuggestionInput = z.infer<
	typeof vocabRevokeSuggestionSchema
>;

export const vocabTeacherSuggestionSchema = z
	.object({
		id: z.string().min(1),
		deckId: z.string().min(1),
		studentId: z.string().min(1),
		note: z.string().nullable(),
		status: z.enum(["pending", "accepted", "dismissed"]),
		createdAt: z.string(),
		respondedAt: z.string().nullable(),
	})
	.strict();
export type VocabTeacherSuggestion = z.infer<
	typeof vocabTeacherSuggestionSchema
>;

export const vocabTeacherSuggestionsResponseSchema = z
	.object({
		suggestions: z.array(vocabTeacherSuggestionSchema),
	})
	.strict();
export type VocabTeacherSuggestionsResponse = z.infer<
	typeof vocabTeacherSuggestionsResponseSchema
>;

export const vocabStudentProgressDeckSchema = z
	.object({
		deckId: z.string().min(1),
		title: z.string(),
		classId: z.string().nullable(),
		className: z.string().catch(""),
		source: z.enum(["class", "suggested", "library"]).catch("class"),
		total: z.number().int().min(0),
		byLevel: z.tuple([
			z.number().int().min(0),
			z.number().int().min(0),
			z.number().int().min(0),
			z.number().int().min(0),
			z.number().int().min(0),
		]),
		dueToday: z.number().int().min(0),
		stateNew: z.number().int().min(0),
		stateReview: z.number().int().min(0),
		lastActivityAt: z.string().nullable(),
	})
	.strict();
export type VocabStudentProgressDeck = z.infer<
	typeof vocabStudentProgressDeckSchema
>;

export const vocabStudentProgressActivityDaySchema = z
	.object({
		dateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		sessions: z.number().int().min(0),
		correct: z.number().int().min(0),
	})
	.strict();
export type VocabStudentProgressActivityDay = z.infer<
	typeof vocabStudentProgressActivityDaySchema
>;

export const vocabStudentProgressResponseSchema = z
	.object({
		studentId: z.string().min(1),
		decks: z.array(vocabStudentProgressDeckSchema),
		activity7Days: z.array(vocabStudentProgressActivityDaySchema),
	})
	.strict();
export type VocabStudentProgressResponse = z.infer<
	typeof vocabStudentProgressResponseSchema
>;

export const vocabSuggestionItemSchema = z
	.object({
		id: z.string().min(1),
		deckId: z.string().min(1),
		title: z.string(),
		wordCount: z.number().int().min(0),
		note: z.string().nullable().catch(null),
		createdAt: z.string(),
	})
	.strict();
export type VocabSuggestionItem = z.infer<typeof vocabSuggestionItemSchema>;

export const vocabSuggestionMutationResponseSchema = z
	.object({
		id: z.string().min(1),
		deckId: z.string().min(1),
		status: z.enum(["accepted", "dismissed"]),
		respondedAt: z.string(),
	})
	.strict();
export type VocabSuggestionMutationResponse = z.infer<
	typeof vocabSuggestionMutationResponseSchema
>;

export const vocabOverviewDeckSchema = z
	.object({
		deckId: z.string().min(1),
		title: z.string(),
		className: z.string().catch(""),
		source: z.enum(["class", "suggested", "library"]).catch("class"),
		total: z.number().int().min(0),
		newCount: z.number().int().min(0),
		dueCount: z.number().int().min(0),
	})
	.strict();
export type VocabOverviewDeck = z.infer<typeof vocabOverviewDeckSchema>;

export const vocabOverviewSchema = z
	.object({
		dueCount: z.number().int().min(0),
		nextDueAt: z.number().int().nullable(),
		upcomingCount: z.number().int().min(0).nullable(),
		learnedCount: z.number().int().min(0),
		matureCount: z.number().int().min(0),
		levelDistribution: z.tuple([
			z.number().int().min(0),
			z.number().int().min(0),
			z.number().int().min(0),
			z.number().int().min(0),
			z.number().int().min(0),
		]),
		streak: z.number().int().min(0),
		retention: z.number().int().min(0).max(100).nullable(),
		forecast: z.tuple([
			z.number().int().min(0),
			z.number().int().min(0),
			z.number().int().min(0),
			z.number().int().min(0),
			z.number().int().min(0),
			z.number().int().min(0),
			z.number().int().min(0),
		]),
		decks: z.array(vocabOverviewDeckSchema),
		suggestions: z.array(vocabSuggestionItemSchema).catch([]),
	})
	.strict();
export type VocabOverview = z.infer<typeof vocabOverviewSchema>;

export const vocabSessionDeckSchema = z
	.object({
		id: z.string().min(1),
		title: z.string(),
		lang: z.string(),
	})
	.strict();
export type VocabSessionDeck = z.infer<typeof vocabSessionDeckSchema>;

export const vocabSessionCardSchema = z
	.object({
		id: z.string().min(1),
		wordId: z.string().min(1),
		word: z.string(),
		translation: z.string(),
		ipa: z.string().nullable(),
		audioKey: z.string().nullable(),
		hasAudio: z.boolean().default(false),
		level: z.number().int().min(1).max(5),
		isWarning: z.boolean(),
		state: z.enum(["new", "review"]),
		intervalDays: z.number().int().min(0),
		dueAt: z.number().int(),
		lapses: z.number().int().min(0),
	})
	.strict();
export type VocabSessionCard = z.infer<typeof vocabSessionCardSchema>;

export const vocabPoolItemSchema = z
	.object({
		wordId: z.string().min(1),
		word: z.string(),
		translation: z.string(),
		lang: z.string(),
		deckId: z.string().min(1),
	})
	.strict();
export type VocabPoolItem = z.infer<typeof vocabPoolItemSchema>;

export const vocabSessionDataSchema = z
	.object({
		deck: vocabSessionDeckSchema,
		cards: z.array(vocabSessionCardSchema),
		pool: z.array(vocabPoolItemSchema),
	})
	.strict();
export type VocabSessionData = z.infer<typeof vocabSessionDataSchema>;

export const vocabAnswerSchema = z
	.object({
		clientLogId: z.string().uuid(),
		cardId: z.string().min(1),
		correct: z.boolean(),
		durationMs: z.number().int().min(0),
	})
	.strict();
export type VocabAnswerInput = z.infer<typeof vocabAnswerSchema>;

export const vocabLearnCommitSchema = z
	.object({
		clientLogId: z.string().uuid(),
		cardId: z.string().min(1),
		/**
		 * Equivalent to `firstTryCorrect` across all scored steps of the word
		 * (`docs/srs-spec.md` §3b rule 7; a word with only "intro" is true).
		 */
		gradeGood: z.boolean(),
		durationMs: z.number().int().min(0),
	})
	.strict();
export type VocabLearnCommitInput = z.infer<typeof vocabLearnCommitSchema>;

export const vocabCardMutationResponseSchema = z
	.object({
		card: vocabSessionCardSchema,
	})
	.strict();
export type VocabCardMutationResponse = z.infer<
	typeof vocabCardMutationResponseSchema
>;
