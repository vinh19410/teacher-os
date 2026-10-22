import { z } from "zod";
import {
	ASSIGNMENT_ANSWER_CHOICES,
	ASSIGNMENT_OPTION_BANK_MAX,
	ASSIGNMENT_PART_TYPES,
	ASSIGNMENT_TEST_PRESETS,
	answerKindByType,
	assignmentQuestionSchema,
	isImageBasedType,
	isAssignmentImageUrl,
	optionBankKindFor,
} from "./contracts";
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
		timeLimitSeconds: z.number().int().min(60).max(4 * 3600).default(3600),
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
		timeLimitSeconds: z.number().int().min(60).max(4 * 3600).optional(),
		collection: z.string().trim().max(200).optional(),
		testGroup: z.string().trim().max(200).optional(),
	})
	.strict();
export type LibraryTestUpdate = z.infer<typeof libraryTestUpdateSchema>;

/** Upsert một slot part. Câu hỏi/optionBank/imageUrl tái dùng schema của
 * ngân hàng assignment — không nhân bản rule. `audioName` do route set sau
 * khi upload R2 (client không tự khai key). */
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
	})
	.strict();

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
	if (!(config.types[part.part] ?? []).includes(part.type)) {
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

	// Image-based (reading `diagram` + listening `map`): cần ảnh hợp lệ và
	// pin trên MỌI câu — câu không pin là mất chỗ trên hình.
	if (isImageBasedType(skill, part.type)) {
		if (!part.imageUrl.trim() || !isAssignmentImageUrl(part.imageUrl)) {
			add("imageUrl", "https image required for image-based part");
		}
		for (const [index, question] of part.questions.entries()) {
			if (!question.pin) add(`questions.${index}.pin`, "pin required");
		}
	}

	// OptionBank khớp dạng bankable — cùng luật ready của assignment:
	// đề không bankable thì bank phải rỗng; đề bankable thì bank ≥ 2,
	// đủ phủ câu bankable và mọi answer là nhãn trong bank.
	const bankKind = optionBankKindFor(
		skill,
		part.type,
		part.questions.map((q) => q.type),
	);
	if (!bankKind) {
		if (part.optionBank.length > 0) {
			add("optionBank", "optionBank only applies to bankable matching types");
		}
	} else {
		const bankQuestions = part.questions.filter(
			(q) => answerKindByType[q.type ?? part.type] === bankKind,
		);
		if (part.optionBank.length < 2 || part.optionBank.length < bankQuestions.length) {
			add(
				"optionBank",
				`bank must have 2–${ASSIGNMENT_OPTION_BANK_MAX} items and cover every bankable question`,
			);
		}
		const labels = ASSIGNMENT_ANSWER_CHOICES[bankKind];
		bankQuestions.forEach((question, offset) => {
			if (!question.answer.trim()) return;
			const labelIndex = labels.indexOf(question.answer as never);
			if (labelIndex < 0 || labelIndex >= part.optionBank.length) {
				add(
					`questions.${part.questions.indexOf(question)}.answer`,
					`offset ${offset}: answer must be a label inside the option bank`,
				);
			}
		});
	}
	return issues;
}

/**
 * Rule ready cho MỘT part: reading cần passage + ≥1 câu có stem;
 * listening cần ≥1 câu + audio; image-based cần imageUrl + pin mọi câu;
 * optionBank khớp dạng bankable; part/type thuộc catalog của skill.
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
export const libraryTestDetailSchema = libraryTestListItemSchema.omit({
	partCount: true,
	questionCount: true,
	hasAllAudio: true,
})
	.extend({ parts: z.array(libraryPartDtoSchema) })
	.strict();
export type LibraryTestDetail = z.infer<typeof libraryTestDetailSchema>;
