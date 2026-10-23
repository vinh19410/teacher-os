import { z } from "zod";
import {
	ASSIGNMENT_ANSWER_CHOICES,
	ASSIGNMENT_OPTION_BANK_MAX,
	ASSIGNMENT_PART_TYPES,
	ASSIGNMENT_TEST_PRESETS,
	answerKindByType,
	assignmentQuestionSchema,
	isAssignmentImageUrl,
	isImageBasedType,
	optionBankKindFor,
} from "./contracts";
import {
	CLOZE_EDITOR_TYPES,
	CLOZE_MARKER_SOURCE,
} from "./lib/infer-question-types";
import { isEmptyRichText, richTextField } from "./rich-text";

/**
 * Thư viện đề toàn hệ thống (plan #413, phase 2). Toàn bộ rule ở đây là
 * HÀM THUẦN — server và UI cùng gọi để `canSave` không lệch 400. Schema
 * câu hỏi/optionBank/imageUrl tái dùng NGUYÊN VĂN từ `contracts.ts`
 * (một nguồn sự thật, không nhân bản).
 */

/** Thư viện chỉ chứa đề tự chấm 2 skill: reading | listening. */
export const LIBRARY_SKILLS = ["reading", "listening"] as const;
export type LibrarySkill = (typeof LIBRARY_SKILLS)[number];

export function isLibrarySkill(skill: string): skill is LibrarySkill {
	return (LIBRARY_SKILLS as readonly string[]).includes(skill);
}

/** Trần dung lượng audio mỗi part — khớp QUIZ_MEDIA_MAX_BYTES của Speaking. */
export const LIBRARY_AUDIO_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Allowlist MIME audio thư viện — TÁCH từ map MIME audio của Speaking
 * (QUIZ_MEDIA_TYPES): chỉ lấy các entry `audio/*`, loại toàn bộ video
 * (mp4/mov/webm video) vì đề listening là thu âm. Giá trị là nhãn hiển thị.
 */
export const LIBRARY_AUDIO_MIME: Readonly<Record<string, string>> = {
	"audio/mpeg": "MP3",
	"audio/mp4": "M4A",
	"audio/x-m4a": "M4A",
	"audio/aac": "AAC",
	"audio/wav": "WAV",
	"audio/x-wav": "WAV",
	"audio/wave": "WAV",
	"audio/webm": "WEBM",
	"audio/ogg": "OGG",
};

/** Mã lỗi chuẩn của routes thư viện đề. */
export const LIBRARY_ERROR_CODES = [
	"TEST_NOT_FOUND",
	"PART_NOT_FOUND",
	"NOT_READY",
	"INVALID_AUDIO",
	"AUDIO_TOO_LARGE",
	"UNSUPPORTED_AUDIO_TYPE",
	"SKILL_IMMUTABLE",
	// #425 — groups corrupt: chặn ghi đè/lỡ phát hành, không sửa mất im lặng.
	"GROUPS_CORRUPT",
	"GROUPS_NOT_CORRUPT",
] as const;
export type LibraryErrorCode = (typeof LIBRARY_ERROR_CODES)[number];

/**
 * Create đề mới. `skill` CHỈ ở create — immutable sau tạo (rule này do
 * route enforce khi PATCH, update schema bỏ hẳn field để không nhận).
 */
export const libraryTestCreateSchema = z
	.object({
		title: z.string().trim().min(1).max(200),
		description: z.string().trim().max(2000).default(""),
		skill: z.enum(LIBRARY_SKILLS),
		timeLimitSeconds: z
			.number()
			.int()
			.min(60)
			.max(4 * 3600)
			.default(3600),
		collection: z.string().trim().max(200).default(""),
		testGroup: z.string().trim().max(200).default(""),
	})
	.strict();
export type LibraryTestCreate = z.infer<typeof libraryTestCreateSchema>;

/** PATCH metadata đề — không có `skill` (immutable), không có `status`
 * (chuyển draft↔ready là endpoint riêng chạy validateTestReady). */
export const libraryTestUpdateSchema = z
	.object({
		title: z.string().trim().min(1).max(200).optional(),
		description: z.string().trim().max(2000).optional(),
		timeLimitSeconds: z
			.number()
			.int()
			.min(60)
			.max(4 * 3600)
			.optional(),
		collection: z.string().trim().max(200).optional(),
		testGroup: z.string().trim().max(200).optional(),
	})
	.strict();
export type LibraryTestUpdate = z.infer<typeof libraryTestUpdateSchema>;

/** Số marker ô trống `____` trong stem — cùng nghĩa `countBlanks` của
 * packages/ui (split theo CLOZE_MARKER_SOURCE), viết lại ở api vì api
 * không được import ui. */
export function countClozeMarkers(stem: string): number {
	return stem.split(new RegExp(CLOZE_MARKER_SOURCE)).length - 1;
}

/** Thư viện bỏ khóa dạng-bài-theo-slot: mọi dạng của skill dùng được ở mọi slot. */
export function librarySkillTypes(skill: LibrarySkill): readonly string[] {
	return [...new Set(Object.values(ASSIGNMENT_PART_TYPES[skill].types).flat())];
}

/** Upsert một slot part. Câu hỏi/optionBank/imageUrl tái dùng schema của
 * ngân hàng assignment — không nhân bản rule. `audioName` do route set sau
 * khi upload R2 (client không tự khai key). */
export const LIBRARY_GROUP_MAX = 20;
export const libraryQuestionGroupSchema = z
	.object({
		id: z.string().trim().min(1).max(40),
		type: z.string().trim().min(1).max(20),
		instruction: richTextField(5000),
		startIndex: z.number().int().min(0),
		count: z.number().int().min(1).max(40),
		optionBank: z
			.array(z.string().trim().min(1).max(200))
			.max(ASSIGNMENT_OPTION_BANK_MAX)
			.default([]),
		answersInline: z.boolean().default(false),
		splitContent: z.boolean().default(false),
		dragDrop: z.boolean().default(false),
	})
	.strict();
export type LibraryQuestionGroup = z.infer<typeof libraryQuestionGroupSchema>;

export const libraryPartUpsertSchema = z
	.object({
		part: z.string().trim().min(1).max(20),
		type: z.string().trim().min(1).max(20),
		title: z.string().trim().min(1).max(200),
		band: z.enum(["6.0", "6.5", "7.0", "7.5"]),
		source: z.string().trim().max(200),
		intro: richTextField(2000),
		passage: richTextField(20000),
		transcript: richTextField(10000),
		imageUrl: z.string().trim().max(500).default(""),
		questions: z.array(assignmentQuestionSchema).max(40),
		optionBank: z
			.array(z.string().trim().min(1).max(200))
			.max(ASSIGNMENT_OPTION_BANK_MAX)
			.default([]),
		note: richTextField(2000),
		audioName: z.string().trim().max(200).default(""),
		groups: z
			.array(libraryQuestionGroupSchema)
			.max(LIBRARY_GROUP_MAX)
			.default([]),
		// #425 — xác nhận tường minh "ghi đè nhóm hỏng": chỉ literal(true) được
		// nhận; server chặn 409 GROUPS_CORRUPT khi row corrupt mà thiếu cờ này.
		discardCorruptGroups: z.literal(true).optional(),
	})
	.strict()
	.superRefine((value, ctx) => {
		const addIssue = (path: (string | number)[], message: string) =>
			ctx.addIssue({ code: "custom", path, message });

		// answerSet ≥ 2 câu mỗi khóa — chạy TRƯỚC early-return nhóm ngầm để
		// đề không nhóm vẫn bị chặn khi khóa chỉ có 1 câu (red-team S1).
		const answerSetIndexes = new Map<string, number[]>();
		for (const [index, question] of value.questions.entries()) {
			if (!question.answerSet) continue;
			const list = answerSetIndexes.get(question.answerSet) ?? [];
			list.push(index);
			answerSetIndexes.set(question.answerSet, list);
		}
		for (const indexes of answerSetIndexes.values()) {
			const [firstIndex] = indexes;
			if (firstIndex === undefined) continue;
			if (indexes.length < 2) {
				addIssue(
					["questions", firstIndex],
					"answer set needs at least two questions",
				);
				continue;
			}
			if (
				value.groups.length > 0 &&
				!value.groups.some((group) =>
					indexes.every(
						(i) => i >= group.startIndex && i < group.startIndex + group.count,
					),
				)
			) {
				// Path CHỈ ĐÚNG NHÓM chứa câu đầu của khóa — parity với
				// partIssues (findIndex theo firstIndex) để draft-save và ready
				// cùng ngữ nghĩa (issue #426 F2). gi < 0 (coverage hỏng) giữ path
				// ["groups"] chung chung — rule coverage riêng đã chặn trường hợp.
				const gi = value.groups.findIndex(
					(group) =>
						firstIndex >= group.startIndex &&
						firstIndex < group.startIndex + group.count,
				);
				addIssue(
					gi >= 0 ? ["groups", gi] : ["groups"],
					"answer set must stay inside one group",
				);
			}
		}

		if (value.groups.length === 0) return; // nhóm ngầm — đề cũ, không kiểm tiếp.

		const firstGroup = value.groups[0];
		if (!firstGroup) return;
		if (firstGroup.startIndex !== 0) {
			addIssue(["groups", 0, "startIndex"], "first group must start at 0");
		}
		let previous = firstGroup;
		for (const [i, group] of value.groups.entries()) {
			if (i > 0) {
				if (group.startIndex !== previous.startIndex + previous.count) {
					addIssue(["groups", i, "startIndex"], "groups must be contiguous");
				}
			}
			previous = group;
		}
		if (
			value.groups.reduce((sum, group) => sum + group.count, 0) !==
			value.questions.length
		) {
			addIssue(["groups"], "group counts must cover every question");
		}
		const seenIds = new Set<string>();
		for (const [i, group] of value.groups.entries()) {
			if (seenIds.has(group.id)) {
				addIssue(["groups", i, "id"], "duplicate group id");
			}
			seenIds.add(group.id);
		}
		if (value.optionBank.length > 0) {
			addIssue(["optionBank"], "optionBank lives on groups when groups exist");
		}
		if (value.type !== firstGroup.type) {
			addIssue(["type"], "part type must equal first group type");
		}
	});

/** Input shape sau khi parse (questions có `alts` default đã bơm). */
export type LibraryPartInput = z.infer<typeof libraryPartUpsertSchema>;

/** Một vấn đề chặn ready: path kiểu dotted ("questions.1.pin") + message. */
export interface LibraryPartIssue {
	path: string;
	message: string;
}

function partIssues(
	skill: LibrarySkill,
	part: LibraryPartInput,
	prefix = "",
): LibraryPartIssue[] {
	const issues: LibraryPartIssue[] = [];
	const add = (path: string, message: string) =>
		issues.push({ path: prefix ? `${prefix}.${path}` : path, message });

	const config = ASSIGNMENT_PART_TYPES[skill];
	if (!config.parts.includes(part.part)) {
		add("part", "invalid part for skill");
		return issues;
	}
	// Thư viện bỏ khóa dạng-bài-theo-slot: mọi dạng của skill dùng được ở mọi slot.
	if (!librarySkillTypes(skill).includes(part.type)) {
		add("type", "invalid type for part");
	}

	if (skill === "reading" && isEmptyRichText(part.passage)) {
		add("passage", "passage required");
	}
	if (part.questions.length < 1 || !part.questions.some((q) => q.stem.trim())) {
		add("questions", "at least one question with a stem is required");
	}
	if (skill === "listening" && !part.audioName.trim()) {
		add("audio", "audio required");
	}

	// Nhóm hiệu lực: part không khai nhóm → một nhóm ngầm phủ cả part
	// (giữ nguyên hành vi ready của đề soạn trước khi có tầng nhóm).
	const hasRealGroups = part.groups.length > 0;
	const effectiveGroups = (
		hasRealGroups
			? part.groups.map((group, gi) => ({ group, gi }))
			: [
					{
						group: {
							id: "implicit",
							type: part.type,
							instruction: "",
							startIndex: 0,
							count: part.questions.length,
							optionBank: part.optionBank,
							answersInline: false,
							splitContent: false,
							dragDrop: false,
						},
						gi: -1,
					},
				]
	) as { group: LibraryQuestionGroup; gi: number }[];

	for (const { group, gi } of effectiveGroups) {
		const groupPath = hasRealGroups ? `groups.${gi}` : "";
		const bankPath = groupPath ? `${groupPath}.optionBank` : "optionBank";
		const questions = part.questions.slice(
			group.startIndex,
			group.startIndex + group.count,
		);
		const abs = (offset: number) => group.startIndex + offset;

		// Image-based (reading `diagram` + listening `map`): ảnh cấp part,
		// pin trên MỌI câu trong dải — câu không pin là mất chỗ trên hình.
		if (isImageBasedType(skill, group.type)) {
			if (!part.imageUrl.trim() || !isAssignmentImageUrl(part.imageUrl)) {
				add("imageUrl", "https image required for image-based part");
			}
			for (const [offset, question] of questions.entries()) {
				if (!question.pin) add(`questions.${abs(offset)}.pin`, "pin required");
			}
		}

		// OptionBank khớp dạng bankable — cùng luật ready của assignment:
		// đề không bankable thì bank phải rỗng; đề bankable thì bank ≥ 2,
		// đủ phủ câu bankable và mọi answer là nhãn trong bank.
		const bankKind = optionBankKindFor(
			skill,
			group.type,
			questions.map((q) => q.type),
		);
		if (!bankKind) {
			if (group.optionBank.length > 0) {
				add(bankPath, "optionBank only applies to bankable matching types");
			}
		} else {
			const bankQuestions = questions
				.map((question, offset) => ({ question, offset }))
				.filter(
					({ question }) =>
						answerKindByType[question.type ?? group.type] === bankKind,
				);
			if (
				group.optionBank.length < 2 ||
				group.optionBank.length < bankQuestions.length
			) {
				add(
					bankPath,
					`bank must have 2–${ASSIGNMENT_OPTION_BANK_MAX} items and cover every bankable question`,
				);
			}
			const labels = ASSIGNMENT_ANSWER_CHOICES[bankKind];
			bankQuestions.forEach(({ question, offset }) => {
				if (!question.answer.trim()) return;
				const labelIndex = labels.indexOf(question.answer as never);
				if (labelIndex < 0 || labelIndex >= group.optionBank.length) {
					add(
						`questions.${abs(offset)}.answer`,
						`offset ${offset}: answer must be a label inside the option bank`,
					);
				}
			});
		}

		// Chỉ nhóm thật mới có các rule tầng nhóm.
		if (!hasRealGroups) continue;
		if (!librarySkillTypes(skill).includes(group.type)) {
			add(`${groupPath}.type`, "invalid type for skill");
		}
		for (const [offset, question] of questions.entries()) {
			if ((question.type ?? group.type) !== group.type) {
				add(
					`questions.${abs(offset)}.type`,
					"question type must match its group",
				);
			}
		}
		if (group.answersInline && !CLOZE_EDITOR_TYPES.has(group.type)) {
			add(
				`${groupPath}.answersInline`,
				"inline answers need a completion type",
			);
		}
		if (group.answersInline) {
			for (const [offset, question] of questions.entries()) {
				if (countClozeMarkers(question.stem) !== 1) {
					add(
						`questions.${abs(offset)}.stem`,
						"inline question needs exactly one blank",
					);
				}
			}
		}
	}

	// answerSet: mỗi khóa ≥ 2 câu và (khi có nhóm) nằm trọn trong dải của
	// một nhóm thật duy nhất (red-team S1).
	const answerSetIndexes = new Map<string, number[]>();
	for (const [index, question] of part.questions.entries()) {
		if (!question.answerSet) continue;
		const list = answerSetIndexes.get(question.answerSet) ?? [];
		list.push(index);
		answerSetIndexes.set(question.answerSet, list);
	}
	for (const indexes of answerSetIndexes.values()) {
		const [first] = indexes;
		if (first === undefined) continue;
		if (indexes.length < 2) {
			add(`questions.${first}`, "answer set needs at least two questions");
			continue;
		}
		if (!hasRealGroups) continue;
		const insideOneGroup = part.groups.some((group) =>
			indexes.every(
				(i) => i >= group.startIndex && i < group.startIndex + group.count,
			),
		);
		if (!insideOneGroup) {
			const gi = part.groups.findIndex(
				(g) => first >= g.startIndex && first < g.startIndex + g.count,
			);
			add(`groups.${gi}`, "answer set must stay inside one group");
		}
	}
	return issues;
}

/**
 * Rule ready cho MỘT part: reading cần passage + ≥1 câu có stem;
 * listening cần ≥1 câu + audio; image-based cần imageUrl + pin mọi câu;
 * optionBank khớp dạng bankable; part/type thuộc catalog của skill;
 * nhóm thật thêm rule dải câu, type khớp nhóm, answersInline cloze.
 * Trả về danh sách vấn đề (rỗng = đạt) để UI `canSave` tái dùng.
 */
export function validatePartForReady(
	skill: LibrarySkill,
	part: LibraryPartInput,
): LibraryPartIssue[] {
	return partIssues(skill, part);
}

/**
 * Rule ready cho CẢ ĐỀ: đủ slot theo ASSIGNMENT_TEST_PRESETS[skill]
 * (reading 3, listening 4) và từng part đạt validatePartForReady.
 */
export function validateTestReady(
	skill: LibrarySkill,
	parts: LibraryPartInput[],
): LibraryPartIssue[] {
	const issues: LibraryPartIssue[] = [];
	const byPart = new Map(parts.map((part) => [part.part, part]));
	for (const slot of ASSIGNMENT_TEST_PRESETS[skill].slots) {
		const part = byPart.get(slot.part);
		if (!part) {
			issues.push({
				path: `parts.${slot.part}`,
				message: `missing part ${slot.part}`,
			});
			continue;
		}
		issues.push(...partIssues(skill, part, `parts.${slot.part}`));
	}
	return issues;
}

/** Thông tin audio của part trên wire — KHÔNG lộ `audioKey` (R2 object key). */
const libraryPartAudioSchema = z
	.object({
		name: z.string(),
		type: z.string(),
		size: z.number().int().min(0),
		/** ISO datetime. */
		uploadedAt: z.string(),
	})
	.strict();
export type LibraryPartAudio = z.infer<typeof libraryPartAudioSchema>;

/** DTO part trả client: không có audioKey/audio key nội bộ. */
export const libraryPartDtoSchema = z
	.object({
		id: z.string(),
		testId: z.string(),
		part: z.string(),
		type: z.string(),
		title: z.string(),
		band: z.string(),
		source: z.string(),
		intro: z.string(),
		passage: z.string(),
		transcript: z.string(),
		imageUrl: z.string(),
		questions: z.array(z.unknown()),
		groups: z.array(libraryQuestionGroupSchema),
		// #425 — cờ "groups trên DB corrupt, đã fallback []". Default false để
		// admin mới parse được response server cũ (deploy-skew 1 chiều); server
		// emit luôn set field.
		groupsCorrupt: z.boolean().default(false),
		optionBank: z.array(z.string()),
		note: z.string(),
		audio: libraryPartAudioSchema.nullable(),
		updatedAt: z.string(),
	})
	.strict();
export type LibraryPartDto = z.infer<typeof libraryPartDtoSchema>;

/** Item danh sách đề: kèm thống kê gộp từ parts để render list 1 query. */
export const libraryTestListItemSchema = z
	.object({
		id: z.string(),
		title: z.string(),
		description: z.string().nullable(),
		skill: z.string(),
		timeLimitSeconds: z.number().int(),
		collection: z.string().nullable(),
		testGroup: z.string().nullable(),
		status: z.string(),
		createdAt: z.string(),
		updatedAt: z.string(),
		partCount: z.number().int().min(0),
		questionCount: z.number().int().min(0),
		/** Mọi part listening đều có audio (reading luôn true). */
		hasAllAudio: z.boolean(),
	})
	.strict();
export type LibraryTestListItem = z.infer<typeof libraryTestListItemSchema>;

/** Chi tiết đề kèm toàn bộ parts (DTO, không lộ audioKey). */
export const libraryTestDetailSchema = libraryTestListItemSchema
	.omit({
		partCount: true,
		questionCount: true,
		hasAllAudio: true,
	})
	.extend({ parts: z.array(libraryPartDtoSchema) })
	.strict();
export type LibraryTestDetail = z.infer<typeof libraryTestDetailSchema>;
