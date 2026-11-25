import { z } from "zod";
import {
	LEAD_COURSE_LABELS,
	LEAD_COURSES,
	LEAD_NOTE_MAX,
	type LeadCourse,
	normalizeVietnamPhone,
} from "./lead-contracts";
import { criterionLabel, formatBand, isBandStep } from "./lib/ielts-band";
import {
	createDefaultPlacementReadingPart,
	createDefaultPlacementSpeakingPart,
	createDefaultPlacementWritingPart,
	dedupeReadingPassages,
} from "./placement-test-defaults";

/**
 * Contract dùng chung cho bộ đề kiểm tra đầu vào 5 kỹ năng (#515, #721):
 * - Editor giáo viên (`/placement-test` trong `apps/web`)
 * - API công khai (`/public/placement-test` & `/public/placement-test/submissions`)
 * - Trang làm bài học viên (`/kiem-tra-dau-vao/` trong `apps/profile`)
 * - Màn chấm điểm giáo viên (`/leads` trong `apps/web`)
 */

export const PLACEMENT_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
export const PLACEMENT_PROMPT_MAX = 2000;
export const PLACEMENT_PASSAGE_BODY_MAX = 6000;
export const PLACEMENT_TRANSCRIPT_MAX = 8000;
export const PLACEMENT_OPTION_MAX = 300;
export const PLACEMENT_CLIP_TITLE_MAX = 200;
export const PLACEMENT_LEVEL_MAX = 20;
export const PLACEMENT_CEFR_MAX = 40;
export const PLACEMENT_DISPLAY_COURSE_MAX = 120;
export const PLACEMENT_ADVICE_MAX = 1000;
export const PLACEMENT_MAX_QUESTIONS = 100;
export const PLACEMENT_MAX_CLIPS = 20;
export const PLACEMENT_MAX_CLIP_QUESTIONS = 20;
export const PLACEMENT_MAX_PASSAGES = 20;
export const PLACEMENT_MAX_PASSAGE_QUESTIONS = 20;
export const PLACEMENT_MAX_SPEAKING_TASKS = 20;
export const PLACEMENT_MAX_BANDS = 8;
export const PLACEMENT_AUDIO_MAX_BYTES = 20 * 1024 * 1024;
export const PLACEMENT_SPEAKING_MEDIA_MAX_BYTES = 50 * 1024 * 1024;
export const PLACEMENT_UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;
export const PLACEMENT_DRAFT_BODY_MAX_BYTES = 512 * 1024;
export const PLACEMENT_WRITING_TEXT_MAX = 10_000;
export const PLACEMENT_TEACHER_FEEDBACK_MAX = 2000;
export const PLACEMENT_CRITERION_COMMENT_MAX = 1000;
export const LEAD_PLACEMENT_SUMMARY_MAX = 300;

export const PLACEMENT_QUESTION_KINDS = ["grammar", "vocab"] as const;
export type PlacementQuestionKind = (typeof PLACEMENT_QUESTION_KINDS)[number];

export const PLACEMENT_READING_PASSAGE_KINDS = [
	"sign",
	"message",
	"passage",
	"cloze",
] as const;
export type PlacementReadingPassageKind =
	(typeof PLACEMENT_READING_PASSAGE_KINDS)[number];

export const PLACEMENT_LEVELS = [
	"Pre-A1",
	"A1",
	"A2",
	"A2+",
	"B1",
	"B2",
	"B2+",
	"C1",
	"C2",
] as const;

export const placementOptionsSchema = z
	.array(z.string().max(PLACEMENT_OPTION_MAX))
	.min(3)
	.max(4);

export const placementAnswerSchema = z.number().int().min(0).max(3).nullable();

export const placementListeningMcqQuestionSchema = z.object({
	id: z.string().regex(PLACEMENT_ID_REGEX),
	type: z.literal("mcq").default("mcq"),
	level: z.string().trim().max(PLACEMENT_LEVEL_MAX),
	prompt: z.string().max(PLACEMENT_PROMPT_MAX),
	options: placementOptionsSchema,
	answer: placementAnswerSchema,
});
export type PlacementListeningMcqQuestion = z.infer<
	typeof placementListeningMcqQuestionSchema
>;

export const placementListeningGapQuestionSchema = z.object({
	id: z.string().regex(PLACEMENT_ID_REGEX),
	type: z.literal("gap"),
	level: z.string().trim().max(PLACEMENT_LEVEL_MAX),
	prompt: z.string().max(PLACEMENT_PROMPT_MAX),
	accept: z.array(z.string().max(120)).min(1).max(15),
});
export type PlacementListeningGapQuestion = z.infer<
	typeof placementListeningGapQuestionSchema
>;

export const placementListeningQuestionSchema = z.union([
	placementListeningGapQuestionSchema,
	placementListeningMcqQuestionSchema,
]);
export type PlacementListeningQuestion = z.infer<
	typeof placementListeningQuestionSchema
>;

export const placementClipSchema = z.object({
	id: z.string().regex(PLACEMENT_ID_REGEX),
	partLabel: z.string().max(60).default(""),
	instruction: z.string().max(1000).default(""),
	title: z.string().max(PLACEMENT_CLIP_TITLE_MAX),
	notesTitle: z.string().max(200).default(""),
	transcript: z.string().max(PLACEMENT_TRANSCRIPT_MAX).default(""),
	audioId: z.string().uuid().nullable(),
	maxPlays: z.number().int().min(1).max(5).default(2),
	level: z.string().trim().max(PLACEMENT_LEVEL_MAX),
	questions: z
		.array(placementListeningQuestionSchema)
		.max(PLACEMENT_MAX_CLIP_QUESTIONS),
});
export type PlacementClip = z.infer<typeof placementClipSchema>;

export const placementListeningPartSchema = z.object({
	id: z.literal("listening"),
	title: z.string().max(100).default("Listening"),
	clips: z.array(placementClipSchema).max(PLACEMENT_MAX_CLIPS),
});
export type PlacementListeningPart = z.infer<
	typeof placementListeningPartSchema
>;

export const placementVgQuestionSchema = z.object({
	id: z.string().regex(PLACEMENT_ID_REGEX),
	kind: z.enum(PLACEMENT_QUESTION_KINDS).default("grammar"),
	level: z.string().trim().max(PLACEMENT_LEVEL_MAX),
	prompt: z.string().max(PLACEMENT_PROMPT_MAX),
	options: placementOptionsSchema,
	answer: placementAnswerSchema,
});
export type PlacementVgQuestion = z.infer<typeof placementVgQuestionSchema>;

export const placementVgPartSchema = z.object({
	id: z.literal("vocab-grammar"),
	title: z.string().max(100).default("Grammar & Vocabulary"),
	questions: z.array(placementVgQuestionSchema).max(PLACEMENT_MAX_QUESTIONS),
});
export type PlacementVgPart = z.infer<typeof placementVgPartSchema>;

export const placementReadingQuestionSchema = z.object({
	id: z.string().regex(PLACEMENT_ID_REGEX),
	level: z.string().trim().max(PLACEMENT_LEVEL_MAX),
	prompt: z.string().max(PLACEMENT_PROMPT_MAX).default(""),
	options: placementOptionsSchema,
	answer: placementAnswerSchema,
});
export type PlacementReadingQuestion = z.infer<
	typeof placementReadingQuestionSchema
>;

export const placementReadingPassageSchema = z.object({
	id: z.string().regex(PLACEMENT_ID_REGEX),
	partLabel: z.string().max(60).default(""),
	kind: z.enum(PLACEMENT_READING_PASSAGE_KINDS).default("passage"),
	instruction: z.string().max(1000).default(""),
	title: z.string().max(200).default(""),
	body: z.string().max(PLACEMENT_PASSAGE_BODY_MAX).default(""),
	questions: z
		.array(placementReadingQuestionSchema)
		.max(PLACEMENT_MAX_PASSAGE_QUESTIONS),
});
export type PlacementReadingPassage = z.infer<
	typeof placementReadingPassageSchema
>;

export const placementReadingPartSchema = z.object({
	id: z.literal("reading"),
	title: z.string().max(100).default("Reading"),
	passages: z.array(placementReadingPassageSchema).max(PLACEMENT_MAX_PASSAGES),
});
export type PlacementReadingPart = z.infer<typeof placementReadingPartSchema>;

export const placementWritingPartSchema = z.object({
	id: z.literal("writing"),
	title: z.string().max(100).default("Writing"),
	promptTitle: z.string().max(200).default(""),
	promptBody: z.string().max(PLACEMENT_PASSAGE_BODY_MAX).default(""),
	minWords: z.number().int().min(10).max(500).default(50),
	maxWords: z.number().int().min(10).max(1000).default(80),
});
export type PlacementWritingPart = z.infer<typeof placementWritingPartSchema>;

export const placementSpeakingTaskSchema = z.object({
	id: z.string().regex(PLACEMENT_ID_REGEX),
	partLabel: z.string().max(60).default(""),
	level: z.string().trim().max(PLACEMENT_LEVEL_MAX),
	prompt: z.string().max(PLACEMENT_PROMPT_MAX),
	prepSeconds: z.number().int().min(0).max(120).default(15),
	answerSeconds: z.number().int().min(5).max(180).default(45),
	/** Audio đọc câu hỏi tùy chọn (upload bởi giáo viên; không có thì client tự đọc bằng Web Speech). */
	audioId: z.string().uuid().nullable().optional(),
});
export type PlacementSpeakingTask = z.infer<typeof placementSpeakingTaskSchema>;

export const placementSpeakingPartSchema = z.object({
	id: z.literal("speaking"),
	title: z.string().max(100).default("Speaking"),
	tasks: z.array(placementSpeakingTaskSchema).max(PLACEMENT_MAX_SPEAKING_TASKS),
});
export type PlacementSpeakingPart = z.infer<typeof placementSpeakingPartSchema>;

export const placementBandSchema = z.object({
	min: z.number().int().min(0).max(100),
	max: z.number().int().min(0).max(100),
	cefr: z.string().trim().max(PLACEMENT_CEFR_MAX),
	course: z.string().trim().max(64),
	displayCourse: z.string().max(PLACEMENT_DISPLAY_COURSE_MAX).default(""),
	advice: z.string().max(PLACEMENT_ADVICE_MAX).default(""),
});
export type PlacementBand = z.infer<typeof placementBandSchema>;

export const placementContentSchema = z
	.object({
		bands: z.array(placementBandSchema).max(PLACEMENT_MAX_BANDS),
		parts: z.tuple([
			placementListeningPartSchema,
			placementVgPartSchema,
			placementReadingPartSchema,
			placementWritingPartSchema,
			placementSpeakingPartSchema,
		]),
	})
	.superRefine((val, ctx) => {
		const listeningCount = val.parts[0].clips.reduce(
			(sum, clip) => sum + clip.questions.length,
			0,
		);
		const vgCount = val.parts[1].questions.length;
		const readingCount = val.parts[2].passages.reduce(
			(sum, p) => sum + p.questions.length,
			0,
		);
		if (listeningCount + vgCount + readingCount > PLACEMENT_MAX_QUESTIONS) {
			ctx.addIssue({
				code: "custom",
				path: ["parts"],
				message: `Tổng số câu hỏi trắc nghiệm & điền từ không được vượt quá ${PLACEMENT_MAX_QUESTIONS} câu.`,
			});
		}
	});
export type PlacementContent = z.infer<typeof placementContentSchema>;

export const placementDraftSaveSchema = z.object({
	revision: z.number().int().min(0),
	content: placementContentSchema,
});
export type PlacementDraftSave = z.infer<typeof placementDraftSaveSchema>;

export const placementPublishRequestSchema = z.object({
	revision: z.number().int().min(1),
});
export type PlacementPublishRequest = z.infer<
	typeof placementPublishRequestSchema
>;

export interface PlacementPublishIssue {
	path: string;
	message: string;
}

export interface PlacementAudioMeta {
	name: string;
	size: number;
	type: string;
}

export interface PlacementTeacherStateResponse {
	draft: PlacementContent | null;
	revision: number;
	publishedVersion: number;
	publishedAt: string | null;
	dirty: boolean;
	isLeadOrg: boolean;
	audio: Record<string, PlacementAudioMeta>;
}

export interface PlacementPublishedBand {
	min: number;
	max: number;
	cefr: string;
	course: LeadCourse;
	courseLabel: string;
	displayCourse: string;
	advice: string;
}

export interface PlacementPublishedListeningMcqQuestion {
	id: string;
	type: "mcq";
	level: string;
	prompt: string;
	options: string[];
	answer: number;
}

export interface PlacementPublishedListeningGapQuestion {
	id: string;
	type: "gap";
	level: string;
	prompt: string;
	accept: string[];
}

export type PlacementPublishedListeningQuestion =
	| PlacementPublishedListeningMcqQuestion
	| PlacementPublishedListeningGapQuestion;

export interface PlacementPublishedClip {
	id: string;
	partLabel: string;
	instruction: string;
	title: string;
	notesTitle: string;
	src: string;
	maxPlays: number;
	level: string;
	questions: PlacementPublishedListeningQuestion[];
}

export interface PlacementPublishedVgQuestion {
	id: string;
	kind: PlacementQuestionKind;
	level: string;
	prompt: string;
	options: string[];
	answer: number;
}

export interface PlacementPublishedReadingQuestion {
	id: string;
	level: string;
	prompt: string;
	options: string[];
	answer: number;
}

export interface PlacementPublishedReadingPassage {
	id: string;
	partLabel: string;
	kind: PlacementReadingPassageKind;
	instruction: string;
	title: string;
	body: string;
	questions: PlacementPublishedReadingQuestion[];
}

export interface PlacementPublishedWritingPart {
	id: "writing";
	title: string;
	promptTitle: string;
	promptBody: string;
	minWords: number;
	maxWords: number;
}

export interface PlacementPublishedSpeakingTask {
	id: string;
	partLabel: string;
	level: string;
	prompt: string;
	prepSeconds: number;
	answerSeconds: number;
	src?: string;
}

export interface PlacementSnapshot {
	version: number;
	bands: PlacementPublishedBand[];
	parts: [
		{
			id: "listening";
			title: string;
			clips: PlacementPublishedClip[];
		},
		{
			id: "vocab-grammar";
			title: string;
			questions: PlacementPublishedVgQuestion[];
		},
		{
			id: "reading";
			title: string;
			passages: PlacementPublishedReadingPassage[];
		},
		PlacementPublishedWritingPart,
		{
			id: "speaking";
			title: string;
			tasks: PlacementPublishedSpeakingTask[];
		},
	];
}

const LEAD_COURSE_SET = new Set<string>(LEAD_COURSES);

/** Chuẩn hóa đáp án điền từ theo đúng quy tắc của đề mẫu HTML. */
export function normalizePlacementGapAnswer(raw: unknown): string {
	return String(raw ?? "")
		.toLowerCase()
		.replace(/p\.?m\.?|\$|dollars?|o'clock/g, "")
		.replace(/[^a-z0-9]/g, "");
}

/** Kiểm tra snapshot đề đầu vào đã phát hành có ít nhất 1 câu hỏi Speaking hay không. */
export function hasPlacementSpeakingTasks(
	snapshot: Pick<PlacementSnapshot, "parts">,
): boolean {
	const speakingPart = snapshot.parts.find((part) => part.id === "speaking");
	return Array.isArray(speakingPart?.tasks) && speakingPart.tasks.length > 0;
}

/** Đếm số từ trong bài Writing. */
export function countPlacementWords(text: string): number {
	const trimmed = text.trim();
	if (!trimmed) return 0;
	return trimmed.split(/\s+/).filter(Boolean).length;
}

function validateMcqQuestion(
	q: {
		id: string;
		level: string;
		prompt: string;
		options: string[];
		answer: number | null;
	},
	basePath: string,
	seenQuestionIds: Set<string>,
	issues: PlacementPublishIssue[],
	opts: { allowEmptyPrompt?: boolean } = {},
) {
	if (seenQuestionIds.has(q.id)) {
		issues.push({
			path: `${basePath}.id`,
			message: `Mã câu hỏi "${q.id}" bị trùng.`,
		});
	} else {
		seenQuestionIds.add(q.id);
	}

	if (q.level.trim().length === 0) {
		issues.push({
			path: `${basePath}.level`,
			message: "Cấp độ câu hỏi không được để trống.",
		});
	}

	if (!opts.allowEmptyPrompt && q.prompt.trim().length === 0) {
		issues.push({
			path: `${basePath}.prompt`,
			message: "Nội dung câu hỏi không được để trống.",
		});
	}

	const trimmedOptions = q.options.map((opt) => opt.trim());
	trimmedOptions.forEach((opt, optIdx) => {
		if (opt.length === 0) {
			issues.push({
				path: `${basePath}.options.${optIdx}`,
				message: `Đáp án ${String.fromCharCode(65 + optIdx)} không được để trống.`,
			});
		}
	});

	const nonEmptyOptions = trimmedOptions.filter((opt) => opt.length > 0);
	if (new Set(nonEmptyOptions).size !== nonEmptyOptions.length) {
		issues.push({
			path: `${basePath}.options`,
			message: "Các đáp án trong cùng một câu không được trùng nhau.",
		});
	}

	if (
		q.answer === null ||
		!Number.isInteger(q.answer) ||
		q.answer < 0 ||
		q.answer >= q.options.length
	) {
		issues.push({
			path: `${basePath}.answer`,
			message: "Chưa chọn đáp án đúng hợp lệ.",
		});
	}
}

function validateGapQuestion(
	q: PlacementListeningGapQuestion,
	basePath: string,
	seenQuestionIds: Set<string>,
	issues: PlacementPublishIssue[],
) {
	if (seenQuestionIds.has(q.id)) {
		issues.push({
			path: `${basePath}.id`,
			message: `Mã câu hỏi "${q.id}" bị trùng.`,
		});
	} else {
		seenQuestionIds.add(q.id);
	}

	if (q.level.trim().length === 0) {
		issues.push({
			path: `${basePath}.level`,
			message: "Cấp độ câu hỏi không được để trống.",
		});
	}

	if (q.prompt.trim().length === 0) {
		issues.push({
			path: `${basePath}.prompt`,
			message: "Nội dung câu điền từ không được để trống.",
		});
	}

	const normalizedAccept = q.accept
		.map((a) => normalizePlacementGapAnswer(a))
		.filter((a) => a.length > 0);
	if (normalizedAccept.length === 0) {
		issues.push({
			path: `${basePath}.accept`,
			message: "Câu điền từ phải có ít nhất 1 đáp án chấp nhận.",
		});
	}
}

/**
 * Kiểm toàn bộ điều kiện trước khi Phát hành bản 5 kỹ năng.
 * Trả danh sách `{ path, message }` tiếng Việt; mảng rỗng là hợp lệ.
 */
export function validatePlacementForPublish(
	content: PlacementContent,
): PlacementPublishIssue[] {
	const issues: PlacementPublishIssue[] = [];
	const [listeningPart, vgPart, readingPart, writingPart, speakingPart] =
		content.parts;

	const seenQuestionIds = new Set<string>();
	const seenClipIds = new Set<string>();
	const seenPassageIds = new Set<string>();
	const seenSpeakingIds = new Set<string>();

	// 1. Listening
	if (listeningPart.clips.length === 0) {
		issues.push({
			path: "parts.0.clips",
			message: "Phần 1 (Listening) phải có ít nhất 1 đoạn nghe.",
		});
	}

	let listeningQuestionCount = 0;
	listeningPart.clips.forEach((clip, cIdx) => {
		const clipPath = `parts.0.clips.${cIdx}`;
		if (seenClipIds.has(clip.id)) {
			issues.push({
				path: `${clipPath}.id`,
				message: `Mã đoạn nghe "${clip.id}" bị trùng.`,
			});
		} else {
			seenClipIds.add(clip.id);
		}

		if (!clip.audioId || clip.audioId.trim().length === 0) {
			issues.push({
				path: `${clipPath}.audioId`,
				message: "Đoạn nghe chưa có file âm thanh.",
			});
		}

		if (clip.level.trim().length === 0) {
			issues.push({
				path: `${clipPath}.level`,
				message: "Cấp độ đoạn nghe không được để trống.",
			});
		}

		if (clip.title.trim().length === 0) {
			issues.push({
				path: `${clipPath}.title`,
				message: "Tiêu đề đoạn nghe không được để trống.",
			});
		}

		if (clip.questions.length === 0) {
			issues.push({
				path: `${clipPath}.questions`,
				message: "Mỗi đoạn nghe phải có ít nhất 1 câu hỏi.",
			});
		}

		clip.questions.forEach((q, qIdx) => {
			listeningQuestionCount += 1;
			const qPath = `${clipPath}.questions.${qIdx}`;
			if (q.type === "gap") {
				validateGapQuestion(q, qPath, seenQuestionIds, issues);
			} else {
				validateMcqQuestion(q, qPath, seenQuestionIds, issues);
			}
		});
	});

	// 2. Grammar & Vocabulary
	if (vgPart.questions.length === 0) {
		issues.push({
			path: "parts.1.questions",
			message: "Phần 2 (Grammar & Vocabulary) phải có ít nhất 1 câu hỏi.",
		});
	}

	vgPart.questions.forEach((q, qIdx) => {
		validateMcqQuestion(
			q,
			`parts.1.questions.${qIdx}`,
			seenQuestionIds,
			issues,
		);
	});

	// 3. Reading
	if (readingPart.passages.length === 0) {
		issues.push({
			path: "parts.2.passages",
			message: "Phần 3 (Reading) phải có ít nhất 1 đoạn/bài đọc.",
		});
	}

	let readingQuestionCount = 0;
	readingPart.passages.forEach((passage, pIdx) => {
		const pPath = `parts.2.passages.${pIdx}`;
		if (seenPassageIds.has(passage.id)) {
			issues.push({
				path: `${pPath}.id`,
				message: `Mã bài đọc "${passage.id}" bị trùng.`,
			});
		} else {
			seenPassageIds.add(passage.id);
		}

		if (passage.body.trim().length === 0) {
			issues.push({
				path: `${pPath}.body`,
				message: "Nội dung văn bản/biển báo không được để trống.",
			});
		}

		if (passage.questions.length === 0) {
			issues.push({
				path: `${pPath}.questions`,
				message: "Mỗi bài đọc phải có ít nhất 1 câu hỏi.",
			});
		}

		const allowEmptyPrompt = passage.kind !== "passage";
		passage.questions.forEach((q, qIdx) => {
			readingQuestionCount += 1;
			validateMcqQuestion(
				q,
				`${pPath}.questions.${qIdx}`,
				seenQuestionIds,
				issues,
				{ allowEmptyPrompt },
			);
		});
	});

	const totalObjectiveQuestions =
		listeningQuestionCount + vgPart.questions.length + readingQuestionCount;
	if (totalObjectiveQuestions > PLACEMENT_MAX_QUESTIONS) {
		issues.push({
			path: "parts",
			message: `Tổng số câu hỏi trắc nghiệm & điền từ không được vượt quá ${PLACEMENT_MAX_QUESTIONS} câu.`,
		});
	}

	// 4. Writing
	if (writingPart.promptTitle.trim().length === 0) {
		issues.push({
			path: "parts.3.promptTitle",
			message: "Phần 4 (Writing) phải có tiêu đề đề bài.",
		});
	}
	if (writingPart.promptBody.trim().length === 0) {
		issues.push({
			path: "parts.3.promptBody",
			message: "Phần 4 (Writing) phải có nội dung hướng dẫn viết.",
		});
	}
	if (writingPart.minWords > writingPart.maxWords) {
		issues.push({
			path: "parts.3.minWords",
			message: "Số từ tối thiểu không được lớn hơn số từ tối đa.",
		});
	}

	// 5. Speaking
	if (speakingPart.tasks.length === 0) {
		issues.push({
			path: "parts.4.tasks",
			message: "Phần 5 (Speaking) phải có ít nhất 1 câu hỏi nói.",
		});
	}
	speakingPart.tasks.forEach((task, tIdx) => {
		const tPath = `parts.4.tasks.${tIdx}`;
		if (seenSpeakingIds.has(task.id)) {
			issues.push({
				path: `${tPath}.id`,
				message: `Mã câu hỏi nói "${task.id}" bị trùng.`,
			});
		} else {
			seenSpeakingIds.add(task.id);
		}
		if (task.prompt.trim().length === 0) {
			issues.push({
				path: `${tPath}.prompt`,
				message: "Nội dung câu hỏi Speaking không được để trống.",
			});
		}
		if (task.level.trim().length === 0) {
			issues.push({
				path: `${tPath}.level`,
				message: "Cấp độ câu hỏi Speaking không được để trống.",
			});
		}
	});

	// Bands (%)
	if (content.bands.length === 0) {
		issues.push({
			path: "bands",
			message: "Phải có ít nhất 1 ngưỡng điểm CEFR (%).",
		});
		return issues;
	}

	content.bands.forEach((band, bIdx) => {
		const bandPath = `bands.${bIdx}`;
		if (band.cefr.trim().length === 0) {
			issues.push({
				path: `${bandPath}.cefr`,
				message: "Mức CEFR không được để trống.",
			});
		}
		if (!LEAD_COURSE_SET.has(band.course)) {
			issues.push({
				path: `${bandPath}.course`,
				message: "Khóa học gợi ý không thuộc danh mục hợp lệ.",
			});
		}
		if (band.displayCourse.trim().length === 0) {
			issues.push({
				path: `${bandPath}.displayCourse`,
				message: "Tên khóa học hiển thị cho học viên không được để trống.",
			});
		}
		if (band.min > band.max) {
			issues.push({
				path: `${bandPath}.min`,
				message: "Điểm % tối thiểu không được lớn hơn điểm % tối đa.",
			});
		}
	});

	const firstBand = content.bands[0];
	if (firstBand && firstBand.min !== 0) {
		issues.push({
			path: "bands.0.min",
			message: "Ngưỡng điểm đầu tiên phải bắt đầu từ 0%.",
		});
	}

	for (let i = 1; i < content.bands.length; i += 1) {
		const prev = content.bands[i - 1];
		const curr = content.bands[i];
		if (!prev || !curr) continue;
		if (curr.min <= prev.max) {
			issues.push({
				path: `bands.${i}.min`,
				message: `Ngưỡng thứ ${i + 1} bị chồng lấn với ngưỡng thứ ${i}.`,
			});
		} else if (curr.min > prev.max + 1) {
			issues.push({
				path: `bands.${i}.min`,
				message: `Ngưỡng thứ ${i + 1} bị hở khoảng % so với ngưỡng thứ ${i}.`,
			});
		}
	}

	const lastBand = content.bands[content.bands.length - 1];
	if (lastBand && lastBand.max !== 100) {
		issues.push({
			path: `bands.${content.bands.length - 1}.max`,
			message: "Ngưỡng cuối cùng phải kết thúc đúng bằng 100%.",
		});
	}

	return issues;
}

/**
 * Dựng snapshot JSON công khai tại thời điểm Phát hành (bỏ `audioId` &
 * `transcript`, gắn URL phát công khai `/public/placement-test/audio/<audioId>`).
 */
export function buildPlacementSnapshot(
	content: PlacementContent,
	version: number,
): PlacementSnapshot {
	const [listeningPart, vgPart, readingPart, writingPart, speakingPart] =
		content.parts;

	return {
		version,
		bands: content.bands.map((band) => {
			const course = band.course as LeadCourse;
			const fallbackLabel = LEAD_COURSE_LABELS[course] ?? band.course;
			return {
				min: band.min,
				max: band.max,
				cefr: band.cefr.trim(),
				course,
				courseLabel: fallbackLabel,
				displayCourse: band.displayCourse.trim() || fallbackLabel,
				advice: band.advice.trim(),
			};
		}),
		parts: [
			{
				id: "listening",
				title: listeningPart.title.trim() || "Listening",
				clips: listeningPart.clips.map((clip) => ({
					id: clip.id,
					partLabel: clip.partLabel.trim(),
					instruction: clip.instruction.trim(),
					title: clip.title.trim(),
					notesTitle: clip.notesTitle.trim(),
					src: `/public/placement-test/audio/${clip.audioId}`,
					maxPlays: clip.maxPlays,
					level: clip.level.trim(),
					questions: clip.questions.map((q) =>
						q.type === "gap"
							? {
									id: q.id,
									type: "gap" as const,
									level: q.level.trim(),
									prompt: q.prompt.trim(),
									accept: q.accept
										.map((a) => normalizePlacementGapAnswer(a))
										.filter(Boolean),
								}
							: {
									id: q.id,
									type: "mcq" as const,
									level: q.level.trim(),
									prompt: q.prompt.trim(),
									options: q.options.map((opt) => opt.trim()),
									answer: q.answer ?? 0,
								},
					),
				})),
			},
			{
				id: "vocab-grammar",
				title: vgPart.title.trim() || "Grammar & Vocabulary",
				questions: vgPart.questions.map((q) => ({
					id: q.id,
					kind: q.kind,
					level: q.level.trim(),
					prompt: q.prompt.trim(),
					options: q.options.map((opt) => opt.trim()),
					answer: q.answer ?? 0,
				})),
			},
			{
				id: "reading",
				title: readingPart.title.trim() || "Reading",
				passages: readingPart.passages.map((p) => ({
					id: p.id,
					partLabel: p.partLabel.trim(),
					kind: p.kind,
					instruction: p.instruction.trim(),
					title: p.title.trim(),
					body: p.body.trim(),
					questions: p.questions.map((q) => ({
						id: q.id,
						level: q.level.trim(),
						prompt: q.prompt.trim(),
						options: q.options.map((opt) => opt.trim()),
						answer: q.answer ?? 0,
					})),
				})),
			},
			{
				id: "writing",
				title: writingPart.title.trim() || "Writing",
				promptTitle: writingPart.promptTitle.trim(),
				promptBody: writingPart.promptBody.trim(),
				minWords: writingPart.minWords,
				maxWords: writingPart.maxWords,
			},
			{
				id: "speaking",
				title: speakingPart.title.trim() || "Speaking",
				tasks: speakingPart.tasks.map((t) => ({
					id: t.id,
					partLabel: t.partLabel.trim(),
					level: t.level.trim(),
					prompt: t.prompt.trim(),
					prepSeconds: t.prepSeconds,
					answerSeconds: t.answerSeconds,
					src: t.audioId ? `/public/placement-test/audio/${t.audioId}` : "",
				})),
			},
		],
	};
}

/** Schema v1 cũ để đọc an toàn draft cũ còn nằm trong D1 trước khi giáo viên bấm "Nhập lại đề gốc mẫu". */
const legacyBandSchema = z.object({
	min: z.number().int().min(0),
	max: z.number().int().min(0),
	cefr: z.string(),
	course: z.string(),
	courseLabel: z.string().optional(),
});

const legacyV1Schema = z.object({
	bands: z.array(legacyBandSchema),
	parts: z.tuple([
		z.object({
			id: z.literal("vocab-grammar"),
			title: z.string(),
			questions: z.array(placementVgQuestionSchema),
		}),
		z.object({
			id: z.literal("listening"),
			title: z.string(),
			clips: z.array(
				z.object({
					id: z.string(),
					audioId: z.string().uuid().nullable(),
					maxPlays: z.number().int().min(1).max(5).default(2),
					level: z.string(),
					title: z.string(),
					questions: z.array(
						z.object({
							id: z.string(),
							level: z.string(),
							prompt: z.string(),
							options: placementOptionsSchema,
							answer: placementAnswerSchema,
						}),
					),
				}),
			),
		}),
	]),
});

const legacyPublishedV1Schema = z.object({
	version: z.number().int().min(1).default(1),
	bands: z.array(legacyBandSchema),
	parts: z.tuple([
		z.object({
			id: z.literal("vocab-grammar"),
			title: z.string(),
			questions: z.array(placementVgQuestionSchema),
		}),
		z.object({
			id: z.literal("listening"),
			title: z.string(),
			clips: z.array(
				z.object({
					id: z.string(),
					src: z.string().optional(),
					audioId: z.string().uuid().nullable().optional(),
					maxPlays: z.number().int().min(1).max(5).default(2),
					level: z.string(),
					title: z.string(),
					questions: z.array(
						z.object({
							id: z.string(),
							level: z.string(),
							prompt: z.string(),
							options: placementOptionsSchema,
							answer: placementAnswerSchema,
						}),
					),
				}),
			),
		}),
	]),
});

const placementPublishedBandSchema = z.object({
	min: z.number().int().min(0).max(100),
	max: z.number().int().min(0).max(100),
	cefr: z.string(),
	course: z.string(),
	courseLabel: z.string().optional(),
	displayCourse: z.string().optional(),
	advice: z.string().optional(),
});

const placementPublishedSpeakingTaskSchema = z.object({
	id: z.string(),
	partLabel: z.string().default(""),
	level: z.string(),
	prompt: z.string(),
	prepSeconds: z.number().int().min(0).max(120).default(15),
	answerSeconds: z.number().int().min(5).max(180).default(45),
	src: z.string().default(""),
});

const placementPublishedSpeakingPartSchema = z.object({
	id: z.literal("speaking"),
	title: z.string().default("Speaking"),
	tasks: z.array(placementPublishedSpeakingTaskSchema),
});

const placementSnapshotV2Schema = z.object({
	version: z.number().int().min(1).default(1),
	bands: z.array(placementPublishedBandSchema),
	parts: z.tuple([
		z.object({
			id: z.literal("listening"),
			title: z.string(),
			clips: z.array(
				z.object({
					id: z.string(),
					partLabel: z.string().default(""),
					instruction: z.string().default(""),
					title: z.string(),
					notesTitle: z.string().default(""),
					src: z.string(),
					maxPlays: z.number().int().min(1).max(5),
					level: z.string(),
					questions: z.array(
						z.union([
							z.object({
								id: z.string(),
								type: z.literal("gap"),
								level: z.string(),
								prompt: z.string(),
								accept: z.array(z.string()),
							}),
							z.object({
								id: z.string(),
								type: z.literal("mcq").default("mcq"),
								level: z.string(),
								prompt: z.string(),
								options: z.array(z.string()),
								answer: z.number().int().min(0),
							}),
						]),
					),
				}),
			),
		}),
		z.object({
			id: z.literal("vocab-grammar"),
			title: z.string(),
			questions: z.array(
				z.object({
					id: z.string(),
					kind: z.enum(PLACEMENT_QUESTION_KINDS),
					level: z.string(),
					prompt: z.string(),
					options: z.array(z.string()),
					answer: z.number().int().min(0),
				}),
			),
		}),
		z.object({
			id: z.literal("reading"),
			title: z.string(),
			passages: z.array(
				z.object({
					id: z.string(),
					partLabel: z.string().default(""),
					kind: z.enum(PLACEMENT_READING_PASSAGE_KINDS),
					instruction: z.string().default(""),
					title: z.string(),
					body: z.string(),
					questions: z.array(
						z.object({
							id: z.string(),
							level: z.string(),
							prompt: z.string(),
							options: z.array(z.string()),
							answer: z.number().int().min(0),
						}),
					),
				}),
			),
		}),
		z.object({
			id: z.literal("writing"),
			title: z.string().default("Writing"),
			promptTitle: z.string().default(""),
			promptBody: z.string().default(""),
			minWords: z.number().int().min(0).default(50),
			maxWords: z.number().int().min(0).default(80),
		}),
		placementPublishedSpeakingPartSchema,
	]),
});

function collectObjectiveIds(
	listeningClips: ReadonlyArray<{ questions: ReadonlyArray<{ id: string }> }>,
	vgQuestions: ReadonlyArray<{ id: string }>,
	readingPassages: ReadonlyArray<{
		id: string;
		questions: ReadonlyArray<{ id: string }>;
	}>,
) {
	const usedQuestionIds = new Set<string>();
	const usedPassageIds = new Set<string>();
	let existingCount = 0;

	for (const clip of listeningClips) {
		for (const q of clip.questions) {
			usedQuestionIds.add(q.id);
			existingCount += 1;
		}
	}
	for (const q of vgQuestions) {
		usedQuestionIds.add(q.id);
		existingCount += 1;
	}
	for (const passage of readingPassages) {
		usedPassageIds.add(passage.id);
		for (const q of passage.questions) {
			usedQuestionIds.add(q.id);
			existingCount += 1;
		}
	}

	return {
		usedQuestionIds,
		usedPassageIds,
		remainingBudget: Math.max(0, PLACEMENT_MAX_QUESTIONS - existingCount),
	};
}

function buildUpgradedLegacyBands(
	rawBands: ReadonlyArray<z.infer<typeof legacyBandSchema>>,
	oldTotal: number,
): Array<PlacementBand & { courseLabel: string }> {
	if (rawBands.length === 0) {
		return [
			{
				min: 0,
				max: 100,
				cefr: "A1",
				course: "comm-1",
				courseLabel: LEAD_COURSE_LABELS["comm-1"],
				displayCourse: LEAD_COURSE_LABELS["comm-1"],
				advice: "",
			},
		];
	}

	const boundedBands = rawBands.slice(0, PLACEMENT_MAX_BANDS);
	const count = boundedBands.length;
	const upgraded: Array<PlacementBand & { courseLabel: string }> = [];

	for (let idx = 0; idx < count; idx += 1) {
		const b = boundedBands[idx]!;
		const isLast = idx === count - 1;
		const prev = idx > 0 ? upgraded[idx - 1] : undefined;
		const min = prev ? Math.min(100, prev.max + 1) : 0;
		// Reserve at least 1% point per trailing band so N >= 3 never collapse onto 100.
		const maxCap = isLast ? 100 : Math.max(min, 100 - (count - 1 - idx));
		const scaledMax = Math.round((b.max / oldTotal) * 100);
		const max = isLast ? 100 : Math.min(maxCap, Math.max(min, scaledMax));

		const normalizedCourse: LeadCourse = LEAD_COURSE_SET.has(b.course)
			? (b.course as LeadCourse)
			: "comm-1";
		const courseLabel =
			b.courseLabel?.trim() || LEAD_COURSE_LABELS[normalizedCourse];

		upgraded.push({
			min,
			max,
			cefr: b.cefr.trim().slice(0, PLACEMENT_CEFR_MAX) || `Level ${idx + 1}`,
			course: normalizedCourse,
			courseLabel,
			displayCourse: courseLabel,
			advice: "",
		});
	}

	return upgraded;
}

/**
 * Đọc an toàn cả cấu trúc v2 mới lẫn draft v1 cũ (2 phần: Vocab+Grammar, Listening)
 * để màn `/placement-test` không bao giờ lỗi 500 trên dữ liệu D1 có sẵn.
 */
export function upgradeLegacyPlacementContent(
	raw: unknown,
): PlacementContent | null {
	const v2 = placementContentSchema.safeParse(raw);
	if (v2.success) {
		return v2.data;
	}

	const v1 = legacyV1Schema.safeParse(raw);
	if (!v1.success) {
		return null;
	}

	const oldVg = v1.data.parts[0];
	const oldListening = v1.data.parts[1];
	const oldTotal = Math.max(
		1,
		oldVg.questions.length +
			oldListening.clips.reduce((s, c) => s + c.questions.length, 0),
	);

	const upgradedBands: PlacementBand[] = buildUpgradedLegacyBands(
		v1.data.bands,
		oldTotal,
	).map(({ courseLabel: _ignored, ...band }) => band);

	const { usedQuestionIds, usedPassageIds, remainingBudget } =
		collectObjectiveIds(oldListening.clips, oldVg.questions, []);
	const defaultReading = createDefaultPlacementReadingPart();
	const backfilledReadingPassages = dedupeReadingPassages(
		defaultReading.passages,
		usedQuestionIds,
		usedPassageIds,
		remainingBudget,
	);

	return {
		bands: upgradedBands,
		parts: [
			{
				id: "listening",
				title: oldListening.title.trim() || "Listening",
				clips: oldListening.clips.map((clip) => ({
					id: clip.id,
					partLabel: "",
					instruction: "",
					title: clip.title,
					notesTitle: "",
					transcript: "",
					audioId: clip.audioId,
					maxPlays: clip.maxPlays,
					level: clip.level,
					questions: clip.questions.map((q) => ({
						id: q.id,
						type: "mcq" as const,
						level: q.level,
						prompt: q.prompt,
						options: q.options,
						answer: q.answer,
					})),
				})),
			},
			{
				id: "vocab-grammar",
				title: oldVg.title.trim() || "Grammar & Vocabulary",
				questions: oldVg.questions,
			},
			{
				id: "reading",
				title: defaultReading.title,
				passages: backfilledReadingPassages,
			},
			createDefaultPlacementWritingPart(),
			createDefaultPlacementSpeakingPart(),
		],
	};
}

/**
 * Chuẩn hoá JSON `published` khi phục vụ bài thi & chấm điểm: hỗ trợ cả
 * snapshot v2 (5 kỹ năng) lẫn snapshot v1 cũ (2 phần `[vocab-grammar, listening]`,
 * band tính theo số câu đúng thay vì `%`) đang nằm sẵn trong D1 trước migration.
 */
export function normalizePublishedPlacementSnapshot(
	raw: unknown,
): PlacementSnapshot | null {
	const v2 = placementSnapshotV2Schema.safeParse(raw);
	if (v2.success) {
		const [listening, vg, reading, writing, speaking] = v2.data.parts;
		const { usedQuestionIds, usedPassageIds, remainingBudget } =
			collectObjectiveIds(listening.clips, vg.questions, reading.passages);

		const defaultReading = createDefaultPlacementReadingPart();
		const readingTitle = reading.title.trim() || defaultReading.title;
		const normalizedReading =
			reading.passages.length === 0
				? {
						...reading,
						title: readingTitle,
						passages: dedupeReadingPassages(
							defaultReading.passages,
							usedQuestionIds,
							usedPassageIds,
							remainingBudget,
						),
					}
				: {
						...reading,
						title: readingTitle,
					};

		const defaultWriting = createDefaultPlacementWritingPart();
		const writingTitle = writing.title.trim() || defaultWriting.title;
		const minWords =
			writing.minWords >= 10
				? Math.min(500, writing.minWords)
				: defaultWriting.minWords;
		const maxWords = Math.min(
			1000,
			Math.max(
				minWords,
				writing.maxWords >= 10 ? writing.maxWords : defaultWriting.maxWords,
			),
		);
		const hasPromptBody = writing.promptBody.trim().length > 0;
		const normalizedWriting = hasPromptBody
			? {
					...writing,
					title: writingTitle,
					promptTitle: writing.promptTitle.trim() || "Bài viết ngắn",
					minWords,
					maxWords,
				}
			: {
					...writing,
					title: writingTitle,
					promptTitle: defaultWriting.promptTitle,
					promptBody: defaultWriting.promptBody,
					minWords,
					maxWords,
				};

		const defaultSpeaking = createDefaultPlacementSpeakingPart();
		const speakingTitle = speaking.title.trim() || defaultSpeaking.title;
		const normalizedSpeaking =
			speaking.tasks.length === 0
				? {
						...speaking,
						title: speakingTitle,
						tasks: defaultSpeaking.tasks.map((t) => ({ ...t, src: "" })),
					}
				: {
						...speaking,
						title: speakingTitle,
					};

		return {
			version: v2.data.version,
			bands: v2.data.bands.map((b) => {
				const course = LEAD_COURSE_SET.has(b.course)
					? (b.course as LeadCourse)
					: ("comm-1" as LeadCourse);
				const courseLabel =
					b.courseLabel?.trim() || LEAD_COURSE_LABELS[course] || b.course;
				return {
					min: b.min,
					max: b.max,
					cefr: b.cefr,
					course,
					courseLabel,
					displayCourse: b.displayCourse?.trim() || courseLabel,
					advice: b.advice?.trim() ?? "",
				};
			}),
			parts: [
				{
					...listening,
					title: listening.title.trim() || "Listening",
				},
				{
					...vg,
					title: vg.title.trim() || "Grammar & Vocabulary",
				},
				normalizedReading,
				normalizedWriting,
				normalizedSpeaking,
			],
		};
	}

	const v1 = legacyPublishedV1Schema.safeParse(raw);
	if (!v1.success) {
		return null;
	}

	const oldVg = v1.data.parts[0];
	const oldListening = v1.data.parts[1];
	const oldTotal = Math.max(
		1,
		oldVg.questions.length +
			oldListening.clips.reduce((s, c) => s + c.questions.length, 0),
	);

	const upgradedBands: PlacementPublishedBand[] = buildUpgradedLegacyBands(
		v1.data.bands,
		oldTotal,
	).map((b) => ({
		min: b.min,
		max: b.max,
		cefr: b.cefr,
		course: b.course as LeadCourse,
		courseLabel: b.courseLabel,
		displayCourse: b.displayCourse,
		advice: b.advice,
	}));

	const { usedQuestionIds, usedPassageIds, remainingBudget } =
		collectObjectiveIds(oldListening.clips, oldVg.questions, []);
	const defaultReading = createDefaultPlacementReadingPart();
	const backfilledReadingPassages = dedupeReadingPassages(
		defaultReading.passages,
		usedQuestionIds,
		usedPassageIds,
		remainingBudget,
	);

	return {
		version: v1.data.version,
		bands: upgradedBands,
		parts: [
			{
				id: "listening",
				title: oldListening.title.trim() || "Listening",
				clips: oldListening.clips.map((clip) => ({
					id: clip.id,
					partLabel: "",
					instruction: "",
					title: clip.title,
					notesTitle: "",
					src:
						clip.src?.trim() ||
						(clip.audioId ? `${PUBLIC_AUDIO_SRC_PREFIX}${clip.audioId}` : ""),
					maxPlays: clip.maxPlays,
					level: clip.level,
					questions: clip.questions.map((q) => ({
						id: q.id,
						type: "mcq" as const,
						level: q.level,
						prompt: q.prompt,
						options: q.options,
						answer: q.answer ?? 0,
					})),
				})),
			},
			{
				id: "vocab-grammar",
				title: oldVg.title.trim() || "Grammar & Vocabulary",
				questions: oldVg.questions.map((q) => ({
					id: q.id,
					kind: q.kind,
					level: q.level,
					prompt: q.prompt,
					options: q.options,
					answer: q.answer ?? 0,
				})),
			},
			{
				id: "reading",
				title: defaultReading.title,
				passages: backfilledReadingPassages,
			},
			createDefaultPlacementWritingPart(),
			{
				...createDefaultPlacementSpeakingPart(),
				tasks: createDefaultPlacementSpeakingPart().tasks.map((t) => ({
					...t,
					src: "",
				})),
			},
		],
	};
}

const PUBLIC_AUDIO_SRC_PREFIX = "/public/placement-test/audio/";

/**
 * Thu thập mọi `audioId` đang được tham chiếu bởi `draft` hoặc `published`
 * để dọn audio mồ côi không bao giờ xóa nhầm file của bản đang phát hành.
 */
export function extractReferencedAudioIds(
	draftJson: string | null | undefined,
	publishedJson: string | null | undefined,
): Set<string> {
	const ids = new Set<string>();
	for (const raw of [draftJson, publishedJson]) {
		if (!raw) continue;
		try {
			const parsed = JSON.parse(raw) as {
				parts?: Array<{
					clips?: Array<{ audioId?: unknown; src?: unknown }>;
					tasks?: Array<{ audioId?: unknown; src?: unknown }>;
				}>;
			};
			if (!Array.isArray(parsed?.parts)) continue;
			for (const part of parsed.parts) {
				const items = [
					...(Array.isArray(part?.clips) ? part.clips : []),
					...(Array.isArray(part?.tasks) ? part.tasks : []),
				];
				for (const item of items) {
					if (
						typeof item?.audioId === "string" &&
						item.audioId.trim().length > 0
					) {
						ids.add(item.audioId.trim());
					}
					if (
						typeof item?.src === "string" &&
						item.src.startsWith(PUBLIC_AUDIO_SRC_PREFIX)
					) {
						const tail = item.src.slice(PUBLIC_AUDIO_SRC_PREFIX.length).trim();
						if (tail.length > 0) {
							ids.add(tail);
						}
					}
				}
			}
		} catch {
			// Ignore malformed JSON
		}
	}
	return ids;
}

// ---------------------------------------------------------------------------
// Rubric chấm Writing / Speaking & Hàm tính điểm dùng chung (HTML formula)
// ---------------------------------------------------------------------------

/** Rubric kiểu cũ (0–5 nguyên) — giữ để đọc & hiển thị bài đã chấm trước đây. */
export const PLACEMENT_RUBRIC_INTERMEDIATE_NOTE =
	"4 = giữa mô tả 5 và 3 · 2 = giữa mô tả 3 và 1 · 0 = không có bài / không đủ ngôn ngữ để đánh giá.";

export const PLACEMENT_LEGACY_WRITING_RUBRIC = [
	{
		key: "ct",
		label: "Content",
		desc: "Đủ 3 ý, đúng yêu cầu",
		levels: {
			5: "Đủ cả 3 ý, ý 3 có lý do rõ ràng; người đọc hiểu đầy đủ.",
			3: "Đủ 3 ý nhưng 1 ý sơ sài, hoặc thiếu 1 ý.",
			1: "Chỉ có 1 ý / lạc đề một phần.",
		},
	},
	{
		key: "or",
		label: "Organisation",
		desc: "Bố cục email, từ nối",
		levels: {
			5: "Có mở/kết email phù hợp; ý sắp xếp mạch lạc; dùng nhiều từ nối (because, so, but, also…).",
			3: "Có bố cục cơ bản; dùng and, but, because.",
			1: "Câu rời rạc, không có bố cục email.",
		},
	},
	{
		key: "lg",
		label: "Language",
		desc: "Ngữ pháp & từ vựng",
		levels: {
			5: "Dùng đúng hiện tại đơn, quá khứ, so sánh; có câu phức; từ vựng phong phú. Lỗi nhỏ.",
			3: "Câu đơn khá chính xác; từ vựng cơ bản đủ dùng; lỗi không cản trở hiểu.",
			1: "Lỗi cơ bản dày đặc (thiếu động từ, sai chia), từ vựng rất hạn chế.",
		},
	},
] as const;

export const PLACEMENT_LEGACY_SPEAKING_RUBRIC = [
	{
		key: "gv",
		label: "Grammar & Vocabulary",
		desc: "Ngữ pháp & từ vựng",
		levels: {
			5: "Dùng tốt câu đơn và một số câu phức (because, if, when, which). Từ vựng đủ để nói về chủ đề quen thuộc và nêu ý kiến; lỗi không gây hiểu lầm.",
			3: "Kiểm soát khá tốt câu đơn (hiện tại, quá khứ, going to). Từ vựng đủ cho chủ đề hằng ngày; còn lỗi nhưng vẫn hiểu được.",
			1: "Chỉ dùng từ đơn, cụm có sẵn (I'm…, My name is…). Lỗi cơ bản thường xuyên.",
		},
	},
	{
		key: "dm",
		label: "Discourse Management",
		desc: "Độ dài, mạch lạc, phát triển ý",
		levels: {
			5: "Nói gần hết thời gian cho phép; có lý do và ví dụ (Answer → Reason → Example); dùng từ nối (because, so, but, for example, in my opinion). Ít ngập ngừng.",
			3: "Trả lời được 1–2 câu liên quan mỗi câu hỏi; có dùng and, but, because. Còn ngập ngừng nhưng không đứt mạch.",
			1: "Câu trả lời rất ngắn, rời rạc; im lặng lâu, bỏ trống nhiều câu.",
		},
	},
	{
		key: "pr",
		label: "Pronunciation",
		desc: "Phát âm, trọng âm, ngữ điệu",
		levels: {
			5: "Dễ hiểu trong toàn bộ bài nói; âm cuối, trọng âm từ và ngữ điệu câu nhìn chung đúng.",
			3: "Phần lớn dễ hiểu dù còn giọng Việt rõ; đôi khi mất âm cuối, sai trọng âm.",
			1: "Thường khó hiểu; mất âm cuối, sai nguyên âm khiến người nghe phải đoán.",
		},
	},
	{
		key: "ic",
		label: "Task Response",
		desc: "Hiểu và trả lời đúng câu hỏi (thay cho Interactive Communication)",
		levels: {
			5: "Hiểu và trả lời đúng trọng tâm tất cả câu hỏi, kể cả Part 3.",
			3: "Trả lời đúng phần lớn câu hỏi Part 1–2; Part 3 còn chung chung hoặc lạc ý.",
			1: "Chỉ trả lời được vài câu Part 1; nhiều câu hiểu sai hoặc bỏ trống.",
		},
	},
] as const;

export const legacyPlacementWritingRubricSchema = z.object({
	ct: z.number().int().min(0).max(5),
	or: z.number().int().min(0).max(5),
	lg: z.number().int().min(0).max(5),
});
export type PlacementLegacyWritingRubric = z.infer<
	typeof legacyPlacementWritingRubricSchema
>;

export const legacyPlacementSpeakingRubricSchema = z.object({
	gv: z.number().int().min(0).max(5),
	dm: z.number().int().min(0).max(5),
	pr: z.number().int().min(0).max(5),
	ic: z.number().int().min(0).max(5),
});
export type PlacementLegacySpeakingRubric = z.infer<
	typeof legacyPlacementSpeakingRubricSchema
>;

/** 4 tiêu chí Writing theo chuẩn IELTS (thang 0–9, bước 0.5). */
export const PLACEMENT_WRITING_RUBRIC = [
	{
		key: "task",
		label: criterionLabel("writing", "task", "task2"),
		desc: "Mức độ hoàn thành & trả lời đúng yêu cầu đề bài",
	},
	{
		key: "coherence",
		label: criterionLabel("writing", "coherence", "task2"),
		desc: "Mạch lạc, liên kết câu và bố cục bài viết",
	},
	{
		key: "lexical",
		label: criterionLabel("writing", "lexical", "task2"),
		desc: "Độ đa dạng và chính xác của từ vựng",
	},
	{
		key: "grammar",
		label: criterionLabel("writing", "grammar", "task2"),
		desc: "Độ đa dạng và chính xác ngữ pháp",
	},
] as const;

/** 4 tiêu chí Speaking theo chuẩn IELTS (thang 0–9, bước 0.5). */
export const PLACEMENT_SPEAKING_RUBRIC = [
	{
		key: "fluency",
		label: criterionLabel("speaking", "fluency", ""),
		desc: "Độ trôi chảy và mạch lạc khi nói",
	},
	{
		key: "lexical",
		label: criterionLabel("speaking", "lexical", ""),
		desc: "Độ đa dạng và chính xác của từ vựng",
	},
	{
		key: "grammar",
		label: criterionLabel("speaking", "grammar", ""),
		desc: "Độ đa dạng và chính xác ngữ pháp",
	},
	{
		key: "pronunciation",
		label: criterionLabel("speaking", "pronunciation", ""),
		desc: "Phát âm, trọng âm và ngữ điệu",
	},
] as const;

export const placementIeltsBandSchema = z
	.number()
	.refine(isBandStep, "Điểm IELTS phải từ 0 đến 9 theo bước 0.5.");

export const placementWritingRubricSchema = z
	.object({
		task: placementIeltsBandSchema,
		coherence: placementIeltsBandSchema,
		lexical: placementIeltsBandSchema,
		grammar: placementIeltsBandSchema,
	})
	.strict();
export type PlacementWritingRubric = z.infer<
	typeof placementWritingRubricSchema
>;

export const placementSpeakingRubricSchema = z
	.object({
		fluency: placementIeltsBandSchema,
		lexical: placementIeltsBandSchema,
		grammar: placementIeltsBandSchema,
		pronunciation: placementIeltsBandSchema,
	})
	.strict();
export type PlacementSpeakingRubric = z.infer<
	typeof placementSpeakingRubricSchema
>;

export type PlacementStoredWritingRubric =
	| PlacementWritingRubric
	| PlacementLegacyWritingRubric;
export type PlacementStoredSpeakingRubric =
	| PlacementSpeakingRubric
	| PlacementLegacySpeakingRubric;

export function isIeltsWritingRubric(
	rubric: PlacementStoredWritingRubric | null | undefined,
): rubric is PlacementWritingRubric {
	return Boolean(rubric && "task" in rubric);
}

export function isIeltsSpeakingRubric(
	rubric: PlacementStoredSpeakingRubric | null | undefined,
): rubric is PlacementSpeakingRubric {
	return Boolean(rubric && "fluency" in rubric);
}

function parseRawJson(raw: string | null): unknown {
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

export function parseStoredWritingRubric(
	raw: string | null,
): PlacementStoredWritingRubric | null {
	const parsed = parseRawJson(raw);
	if (!parsed) return null;
	const ielts = placementWritingRubricSchema.safeParse(parsed);
	if (ielts.success) return ielts.data;
	const legacy = legacyPlacementWritingRubricSchema.safeParse(parsed);
	return legacy.success ? legacy.data : null;
}

export function parseStoredSpeakingRubric(
	raw: string | null,
): PlacementStoredSpeakingRubric | null {
	const parsed = parseRawJson(raw);
	if (!parsed) return null;
	const ielts = placementSpeakingRubricSchema.safeParse(parsed);
	if (ielts.success) return ielts.data;
	const legacy = legacyPlacementSpeakingRubricSchema.safeParse(parsed);
	return legacy.success ? legacy.data : null;
}

const placementCriterionCommentSchema = z
	.string()
	.trim()
	.max(PLACEMENT_CRITERION_COMMENT_MAX)
	.default("");

export const placementWritingCriterionCommentsSchema = z
	.object({
		task: placementCriterionCommentSchema,
		coherence: placementCriterionCommentSchema,
		lexical: placementCriterionCommentSchema,
		grammar: placementCriterionCommentSchema,
	})
	.strict();
export type PlacementWritingCriterionComments = z.infer<
	typeof placementWritingCriterionCommentsSchema
>;

export const placementSpeakingCriterionCommentsSchema = z
	.object({
		fluency: placementCriterionCommentSchema,
		lexical: placementCriterionCommentSchema,
		grammar: placementCriterionCommentSchema,
		pronunciation: placementCriterionCommentSchema,
	})
	.strict();
export type PlacementSpeakingCriterionComments = z.infer<
	typeof placementSpeakingCriterionCommentsSchema
>;

export function emptyWritingCriterionComments(): PlacementWritingCriterionComments {
	return {
		task: "",
		coherence: "",
		lexical: "",
		grammar: "",
	};
}

export function emptySpeakingCriterionComments(): PlacementSpeakingCriterionComments {
	return {
		fluency: "",
		lexical: "",
		grammar: "",
		pronunciation: "",
	};
}

export function parseStoredWritingCriterionComments(
	raw: string | null,
): PlacementWritingCriterionComments | null {
	const parsed = parseRawJson(raw);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return null;
	}
	const result = placementWritingCriterionCommentsSchema.safeParse(parsed);
	return result.success ? result.data : null;
}

export function parseStoredSpeakingCriterionComments(
	raw: string | null,
): PlacementSpeakingCriterionComments | null {
	const parsed = parseRawJson(raw);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return null;
	}
	const result = placementSpeakingCriterionCommentsSchema.safeParse(parsed);
	return result.success ? result.data : null;
}

export interface PlacementObjectiveItemResult {
	id: string;
	section: "listening" | "vocab-grammar" | "reading";
	type: "mcq" | "gap";
	level: string;
	prompt: string;
	expected: number | string[];
	studentAnswer: number | string | null;
	correct: boolean;
}

export interface PlacementLevelStat {
	level: string;
	correct: number;
	total: number;
	pct: number;
}

export interface PlacementSectionScore {
	correct: number;
	total: number;
	pct: number | null;
}

export interface PlacementObjectiveResult {
	listening: PlacementSectionScore;
	vocabGrammar: PlacementSectionScore;
	reading: PlacementSectionScore;
	totalCorrect: number;
	totalQuestions: number;
	averagePct: number;
	byLevel: PlacementLevelStat[];
	items: PlacementObjectiveItemResult[];
	provisionalBand: PlacementPublishedBand;
	provisionalSummary: string;
}

export function matchPlacementBand(
	pct: number,
	bands: readonly PlacementPublishedBand[],
): PlacementPublishedBand {
	if (bands.length === 0) {
		return {
			min: 0,
			max: 100,
			cefr: "A1",
			course: "comm-1",
			courseLabel: LEAD_COURSE_LABELS["comm-1"],
			displayCourse: LEAD_COURSE_LABELS["comm-1"],
			advice: "",
		};
	}
	const sorted = [...bands].sort((a, b) => a.min - b.min);
	const firstBand = sorted[0];
	if (!firstBand) {
		return {
			min: 0,
			max: 100,
			cefr: "A1",
			course: "comm-1",
			courseLabel: LEAD_COURSE_LABELS["comm-1"],
			displayCourse: LEAD_COURSE_LABELS["comm-1"],
			advice: "",
		};
	}
	const safePct = Number.isFinite(pct) ? pct : 0;
	// Khớp theo ngưỡng `min` trên số thực (giống `bandOf(total)` trong HTML gốc) để không làm tròn nhảy bậc sai ở biên.
	let matched = firstBand;
	for (const band of sorted) {
		if (safePct >= band.min) {
			matched = band;
		}
	}
	return matched;
}

/**
 * Chấm 3 phần tự động (Listening, Grammar & Vocabulary, Reading) từ snapshot
 * đã phát hành và map đáp án học viên gửi lên.
 */
export function gradePlacementObjective(
	snapshot: PlacementSnapshot,
	answers: {
		listening?: Record<string, string | number | null | undefined>;
		vocabGrammar?: Record<string, number | null | undefined>;
		reading?: Record<string, number | null | undefined>;
	},
): PlacementObjectiveResult {
	const lAnswers = answers.listening ?? {};
	const gvAnswers = answers.vocabGrammar ?? {};
	const rAnswers = answers.reading ?? {};

	const items: PlacementObjectiveItemResult[] = [];
	const levelMap = new Map<string, { correct: number; total: number }>();

	const recordLevel = (level: string, correct: boolean) => {
		const key = level.trim() || "A1";
		const prev = levelMap.get(key) ?? { correct: 0, total: 0 };
		prev.total += 1;
		if (correct) prev.correct += 1;
		levelMap.set(key, prev);
	};

	const listeningPart = snapshot.parts.find((p) => p.id === "listening");
	let lCorrect = 0;
	let lTotal = 0;
	for (const clip of listeningPart?.clips ?? []) {
		for (const q of clip.questions) {
			lTotal += 1;
			if (q.type === "gap") {
				const raw = lAnswers[q.id];
				const val = typeof raw === "string" ? raw : "";
				const normVal = normalizePlacementGapAnswer(val);
				const ok =
					normVal.length > 0 &&
					q.accept.some((acc) => normalizePlacementGapAnswer(acc) === normVal);
				if (ok) lCorrect += 1;
				recordLevel(q.level, ok);
				items.push({
					id: q.id,
					section: "listening",
					type: "gap",
					level: q.level,
					prompt: q.prompt,
					expected: q.accept,
					studentAnswer: val.trim() || null,
					correct: ok,
				});
			} else {
				const raw = lAnswers[q.id];
				const picked =
					typeof raw === "number" && Number.isInteger(raw) ? raw : null;
				const ok = picked !== null && picked >= 0 && picked === q.answer;
				if (ok) lCorrect += 1;
				recordLevel(q.level, ok);
				items.push({
					id: q.id,
					section: "listening",
					type: "mcq",
					level: q.level,
					prompt: q.prompt,
					expected: q.answer,
					studentAnswer: picked,
					correct: ok,
				});
			}
		}
	}

	const vgPart = snapshot.parts.find((p) => p.id === "vocab-grammar");
	let gvCorrect = 0;
	let gvTotal = 0;
	for (const q of vgPart?.questions ?? []) {
		gvTotal += 1;
		const raw = gvAnswers[q.id];
		const picked =
			typeof raw === "number" && Number.isInteger(raw) ? raw : null;
		const ok = picked !== null && picked >= 0 && picked === q.answer;
		if (ok) gvCorrect += 1;
		recordLevel(q.level, ok);
		items.push({
			id: q.id,
			section: "vocab-grammar",
			type: "mcq",
			level: q.level,
			prompt: q.prompt,
			expected: q.answer,
			studentAnswer: picked,
			correct: ok,
		});
	}

	const readingPart = snapshot.parts.find((p) => p.id === "reading");
	let rCorrect = 0;
	let rTotal = 0;
	for (const passage of readingPart?.passages ?? []) {
		for (const q of passage.questions) {
			rTotal += 1;
			const raw = rAnswers[q.id];
			const picked =
				typeof raw === "number" && Number.isInteger(raw) ? raw : null;
			const ok = picked !== null && picked >= 0 && picked === q.answer;
			if (ok) rCorrect += 1;
			recordLevel(q.level, ok);
			items.push({
				id: q.id,
				section: "reading",
				type: "mcq",
				level: q.level,
				prompt: q.prompt || passage.title || passage.partLabel,
				expected: q.answer,
				studentAnswer: picked,
				correct: ok,
			});
		}
	}

	const toSection = (
		correct: number,
		total: number,
	): PlacementSectionScore => ({
		correct,
		total,
		pct: total > 0 ? Math.round((correct / total) * 100) : null,
	});

	const listeningScore = toSection(lCorrect, lTotal);
	const vgScore = toSection(gvCorrect, gvTotal);
	const readingScore = toSection(rCorrect, rTotal);

	const exactActivePcts = [
		lTotal > 0 ? (lCorrect / lTotal) * 100 : null,
		gvTotal > 0 ? (gvCorrect / gvTotal) * 100 : null,
		rTotal > 0 ? (rCorrect / rTotal) * 100 : null,
	].filter((v): v is number => v !== null);
	const exactAveragePct =
		exactActivePcts.length > 0
			? exactActivePcts.reduce((s, v) => s + v, 0) / exactActivePcts.length
			: 0;
	const averagePct = Math.round(exactAveragePct);

	const levelOrder = new Map<string, number>(
		PLACEMENT_LEVELS.map((lvl, idx) => [lvl, idx]),
	);
	const byLevel: PlacementLevelStat[] = [...levelMap.entries()]
		.sort((a, b) => (levelOrder.get(a[0]) ?? 99) - (levelOrder.get(b[0]) ?? 99))
		.map(([level, stat]) => ({
			level,
			correct: stat.correct,
			total: stat.total,
			pct: stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0,
		}));

	const provisionalBand = matchPlacementBand(exactAveragePct, snapshot.bands);
	const totalCorrect = lCorrect + gvCorrect + rCorrect;
	const totalQuestions = lTotal + gvTotal + rTotal;

	const summary = `Tạm tính ${provisionalBand.cefr} (${averagePct}% — L ${lCorrect}/${lTotal} · G&V ${gvCorrect}/${gvTotal} · R ${rCorrect}/${rTotal}, chờ chấm W&S)`;

	return {
		listening: listeningScore,
		vocabGrammar: vgScore,
		reading: readingScore,
		totalCorrect,
		totalQuestions,
		averagePct,
		byLevel,
		items,
		provisionalBand,
		provisionalSummary: summary.slice(0, LEAD_PLACEMENT_SUMMARY_MAX),
	};
}

export interface PlacementFinalResult {
	writingScore: number | null;
	writingPct: number | null;
	speakingScore: number | null;
	speakingPct: number | null;
	averagePct: number;
	band: PlacementPublishedBand;
	speakingBand: PlacementPublishedBand | null;
	note: string;
	finalSummary: string;
}

export type PlacementGradingScale = "ielts" | "legacy";

/**
 * Công thức tính kết quả cuối cùng sau khi giáo viên chấm Writing & Speaking:
 * - Mặc định theo thang IELTS (0–9, bước 0.5): quy đổi `(band / 9) * 100%`.
 * - Hỗ trợ `scale = "legacy"` (`/15` Writing, `/20` Speaking) cho dữ liệu cũ.
 * - Trung bình % trên các kỹ năng đã có điểm (Listening, G&V, Reading, Writing?, Speaking?).
 * - Áp dụng quy tắc sàn Speaking: nếu bậc Speaking thấp hơn bậc tổng thể >= 2 bậc
 *   thì hạ kết quả 1 bậc kèm giải thích; nếu cao hơn >= 2 bậc thì gắn gợi ý lớp cao hơn.
 */
export function computePlacementFinal(params: {
	objective: Pick<
		PlacementObjectiveResult,
		"listening" | "vocabGrammar" | "reading"
	>;
	bands: readonly PlacementPublishedBand[];
	writingScore: number | null;
	speakingScore: number | null;
	writingScale?: PlacementGradingScale;
	speakingScale?: PlacementGradingScale;
}): PlacementFinalResult {
	const sortedBands = [...params.bands].sort((a, b) => a.min - b.min);
	const writingScale = params.writingScale ?? "ielts";
	const speakingScale = params.speakingScale ?? "ielts";
	const writingMax = writingScale === "legacy" ? 15 : 9;
	const speakingMax = speakingScale === "legacy" ? 20 : 9;

	const writingScore = params.writingScore;
	const exactWritingPct =
		writingScore !== null ? (writingScore / writingMax) * 100 : null;
	const writingPct =
		exactWritingPct !== null ? Math.round(exactWritingPct) : null;

	const speakingScore = params.speakingScore;
	const exactSpeakingPct =
		speakingScore !== null ? (speakingScore / speakingMax) * 100 : null;
	const speakingPct =
		exactSpeakingPct !== null ? Math.round(exactSpeakingPct) : null;

	const sectionExactPct = (sec: PlacementSectionScore): number | null => {
		if (sec.total > 0) return (sec.correct / sec.total) * 100;
		return sec.pct;
	};

	const activeExactPcts = [
		sectionExactPct(params.objective.listening),
		sectionExactPct(params.objective.vocabGrammar),
		sectionExactPct(params.objective.reading),
		exactWritingPct,
		exactSpeakingPct,
	].filter((v): v is number => v !== null);

	const exactTotalPct =
		activeExactPcts.length > 0
			? activeExactPcts.reduce((s, v) => s + v, 0) / activeExactPcts.length
			: 0;
	const averagePct = Math.round(exactTotalPct);

	let band = matchPlacementBand(exactTotalPct, sortedBands);
	const speakingBand =
		exactSpeakingPct !== null
			? matchPlacementBand(exactSpeakingPct, sortedBands)
			: null;

	let note = "";
	if (speakingBand && sortedBands.length > 0) {
		const bi = sortedBands.findIndex(
			(b) => b.min === band.min && b.max === band.max && b.cefr === band.cefr,
		);
		const si = sortedBands.findIndex(
			(b) =>
				b.min === speakingBand.min &&
				b.max === speakingBand.max &&
				b.cefr === speakingBand.cefr,
		);
		if (bi >= 0 && si >= 0) {
			if (bi - si >= 2) {
				band = sortedBands[bi - 1] ?? band;
				note =
					"Điểm Speaking thấp hơn đáng kể so với các kỹ năng khác nên kết quả được hạ 1 bậc (khoá học tập trung giao tiếp).";
			} else if (si - bi >= 2) {
				note =
					"Speaking tốt hơn hẳn các kỹ năng khác — có thể cân nhắc lớp cao hơn nếu học viên muốn tập trung nói.";
			}
		}
	}

	const formatSummaryScore = (
		prefix: string,
		score: number | null,
		scale: PlacementGradingScale,
		max: number,
	) => {
		if (score === null) return null;
		return scale === "legacy"
			? `${prefix} ${score}/${max}`
			: `${prefix} ${formatBand(score)}/9`;
	};

	const partsSummary = [
		`L ${params.objective.listening.correct}/${params.objective.listening.total}`,
		`G&V ${params.objective.vocabGrammar.correct}/${params.objective.vocabGrammar.total}`,
		`R ${params.objective.reading.correct}/${params.objective.reading.total}`,
		formatSummaryScore("W", writingScore, writingScale, 15),
		formatSummaryScore("S", speakingScore, speakingScale, 20),
	]
		.filter(Boolean)
		.join(" · ");

	const finalSummary =
		`CEFR ${band.cefr} (${averagePct}% — ${partsSummary})`.slice(
			0,
			LEAD_PLACEMENT_SUMMARY_MAX,
		);

	return {
		writingScore,
		writingPct,
		speakingScore,
		speakingPct,
		averagePct,
		band,
		speakingBand,
		note,
		finalSummary,
	};
}

/**
 * Xuất tin nhắn kết quả chuẩn gửi Zalo cho học viên.
 */
export function buildPlacementZaloText(params: {
	studentName: string;
	phone: string;
	objective: PlacementObjectiveResult;
	writingScore: number | null;
	speakingScore: number | null;
	speakingStatus: "none" | "pending_upload" | "uploaded" | "skipped";
	band: PlacementPublishedBand;
	averagePct: number;
	note: string;
	teacherFeedback: string;
	writingScale?: PlacementGradingScale;
	speakingScale?: PlacementGradingScale;
}): string {
	const fmtPct = (v: number | null) => (v === null ? "—" : `${v}%`);
	const writingScale = params.writingScale ?? "ielts";
	const speakingScale = params.speakingScale ?? "ielts";
	const wText =
		params.writingScore !== null
			? writingScale === "legacy"
				? `${params.writingScore}/15 (${Math.round((params.writingScore / 15) * 100)}%)`
				: `Band ${formatBand(params.writingScore)}/9 (${Math.round((params.writingScore / 9) * 100)}%)`
			: "chưa chấm";
	const sText =
		params.speakingScore !== null
			? speakingScale === "legacy"
				? `${params.speakingScore}/20 (${Math.round((params.speakingScore / 20) * 100)}%)`
				: `Band ${formatBand(params.speakingScore)}/9 (${Math.round((params.speakingScore / 9) * 100)}%)`
			: params.speakingStatus === "skipped"
				? "bỏ qua"
				: params.speakingStatus === "none"
					? "không có bài nói"
					: "chưa chấm";

	const lines = [
		"KET QUA KIEM TRA DAU VAO — MS MY ENGLISH",
		`Hoc vien: ${params.studentName}${params.phone ? ` (${params.phone})` : ""}`,
		"---",
		`Listening: ${params.objective.listening.correct}/${params.objective.listening.total} (${fmtPct(params.objective.listening.pct)})`,
		`Grammar & Vocab: ${params.objective.vocabGrammar.correct}/${params.objective.vocabGrammar.total} (${fmtPct(params.objective.vocabGrammar.pct)})`,
		`Reading: ${params.objective.reading.correct}/${params.objective.reading.total} (${fmtPct(params.objective.reading.pct)})`,
		`Writing: ${wText}`,
		`Speaking: ${sText}`,
		"---",
		`Tong the: ${params.averagePct}% — Trinh do: ${params.band.cefr}`,
		`Khoa de xuat: ${params.band.displayCourse || params.band.courseLabel}`,
	];

	if (params.band.advice) {
		lines.push(`Goi y lo trinh: ${params.band.advice}`);
	}
	if (params.note) {
		lines.push(`Luu y trinh do: ${params.note}`);
	}
	if (params.teacherFeedback.trim()) {
		lines.push(`Nhan xet cua Co My: ${params.teacherFeedback.trim()}`);
	}

	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// API Schemas cho Public Submission & Teacher Grading
// ---------------------------------------------------------------------------

export const placementAnswersSchema = z.object({
	listening: z
		.record(
			z.string().max(64),
			z.union([z.string().max(120), z.number().int().min(0).max(3), z.null()]),
		)
		.default({}),
	vocabGrammar: z
		.record(
			z.string().max(64),
			z.union([z.number().int().min(0).max(3), z.null()]),
		)
		.default({}),
	reading: z
		.record(
			z.string().max(64),
			z.union([z.number().int().min(0).max(3), z.null()]),
		)
		.default({}),
});

export const studentPlacementSubmitSchema = z
	.object({
		answers: placementAnswersSchema,
		writingText: z.string().max(PLACEMENT_WRITING_TEXT_MAX).default(""),
		speakingMode: z.enum(["upload", "none"]).default("none"),
		speakingDurationSec: z
			.number()
			.int()
			.min(0)
			.max(3600)
			.nullable()
			.optional()
			.default(null),
	})
	.strict();
export type StudentPlacementSubmit = z.infer<
	typeof studentPlacementSubmitSchema
>;

export const placementPublicSubmitSchema = z
	.object({
		lead: z.object({
			name: z.string().trim().min(1).max(120),
			phone: z
				.string()
				.trim()
				.transform((v, ctx) => {
					const norm = normalizeVietnamPhone(v);
					if (!norm) {
						ctx.addIssue({
							code: "custom",
							message:
								"Số điện thoại Việt Nam phải có đúng 10 số bắt đầu bằng 0.",
						});
						return z.NEVER;
					}
					return norm;
				}),
			email: z.string().trim().max(160).optional().default(""),
			birthDate: z.string().trim().max(20).optional().default(""),
			note: z.string().trim().max(LEAD_NOTE_MAX).optional().default(""),
		}),
		answers: placementAnswersSchema,
		writingText: z.string().max(PLACEMENT_WRITING_TEXT_MAX).default(""),
		speakingMode: z.enum(["upload", "none"]).default("none"),
		speakingDurationSec: z
			.number()
			.int()
			.min(0)
			.max(3600)
			.nullable()
			.optional()
			.default(null),
	})
	.strict();
export type PlacementPublicSubmit = z.infer<typeof placementPublicSubmitSchema>;

// ---------------------------------------------------------------------------
// Chấm nháp AI Writing/Speaking + highlight lỗi (#730)
// ---------------------------------------------------------------------------

export type PlacementErrorSkill = "writing" | "speaking";

/** 4 loại lỗi Writing tương ứng 1-1 với 4 tiêu chí chấm IELTS Writing. */
export const PLACEMENT_WRITING_ERROR_CATEGORIES = [
	{ key: "task", label: criterionLabel("writing", "task", "task2") },
	{ key: "coherence", label: criterionLabel("writing", "coherence", "task2") },
	{ key: "lexical", label: criterionLabel("writing", "lexical", "task2") },
	{ key: "grammar", label: criterionLabel("writing", "grammar", "task2") },
] as const;
export type PlacementWritingErrorCategory =
	(typeof PLACEMENT_WRITING_ERROR_CATEGORIES)[number]["key"];

/** 4 loại lỗi Speaking tương ứng 1-1 với 4 tiêu chí chấm IELTS Speaking. */
export const PLACEMENT_SPEAKING_ERROR_CATEGORIES = [
	{ key: "fluency", label: criterionLabel("speaking", "fluency", "") },
	{ key: "lexical", label: criterionLabel("speaking", "lexical", "") },
	{ key: "grammar", label: criterionLabel("speaking", "grammar", "") },
	{
		key: "pronunciation",
		label: criterionLabel("speaking", "pronunciation", ""),
	},
] as const;
export type PlacementSpeakingErrorCategory =
	(typeof PLACEMENT_SPEAKING_ERROR_CATEGORIES)[number]["key"];

/** Tập hợp 6 loại lỗi IELTS chuẩn của cả Writing và Speaking (nhãn tiếng Anh). */
export const PLACEMENT_ERROR_CATEGORIES = [
	{ key: "task", label: criterionLabel("writing", "task", "task2") },
	{ key: "coherence", label: criterionLabel("writing", "coherence", "task2") },
	{ key: "fluency", label: criterionLabel("speaking", "fluency", "") },
	{ key: "lexical", label: criterionLabel("writing", "lexical", "task2") },
	{ key: "grammar", label: criterionLabel("writing", "grammar", "task2") },
	{
		key: "pronunciation",
		label: criterionLabel("speaking", "pronunciation", ""),
	},
] as const;
export type PlacementErrorCategory =
	| PlacementWritingErrorCategory
	| PlacementSpeakingErrorCategory;

export interface PlacementErrorCategoryOption<
	K extends PlacementErrorCategory = PlacementErrorCategory,
> {
	readonly key: K;
	readonly label: string;
}

export function placementErrorCategoriesForSkill(
	skill: "writing",
): readonly PlacementErrorCategoryOption<PlacementWritingErrorCategory>[];
export function placementErrorCategoriesForSkill(
	skill: "speaking",
): readonly PlacementErrorCategoryOption<PlacementSpeakingErrorCategory>[];
export function placementErrorCategoriesForSkill(
	skill: PlacementErrorSkill,
): readonly PlacementErrorCategoryOption<PlacementErrorCategory>[];
export function placementErrorCategoriesForSkill(
	skill: PlacementErrorSkill,
): readonly PlacementErrorCategoryOption<PlacementErrorCategory>[] {
	return skill === "writing"
		? PLACEMENT_WRITING_ERROR_CATEGORIES
		: PLACEMENT_SPEAKING_ERROR_CATEGORIES;
}

/**
 * Chuẩn hóa key loại lỗi (kể cả key cũ trong DB như `vocabulary`, `spelling`,
 * hay key lệch kỹ năng) về 4 tiêu chí IELTS hợp lệ của từng kỹ năng. Key lạ → null.
 */
export function normalizePlacementErrorCategory(
	raw: string,
	skill: "writing",
): PlacementWritingErrorCategory | null;
export function normalizePlacementErrorCategory(
	raw: string,
	skill: "speaking",
): PlacementSpeakingErrorCategory | null;
export function normalizePlacementErrorCategory(
	raw: string,
	skill: PlacementErrorSkill,
): PlacementErrorCategory | null;
export function normalizePlacementErrorCategory(
	raw: string,
	skill: PlacementErrorSkill,
): PlacementErrorCategory | null {
	const key = raw.trim().toLowerCase();
	if (skill === "writing") {
		switch (key) {
			case "task":
				return "task";
			case "coherence":
			case "fluency":
				return "coherence";
			case "lexical":
			case "vocabulary":
			case "spelling":
			case "pronunciation":
				return "lexical";
			case "grammar":
				return "grammar";
			default:
				return null;
		}
	}
	switch (key) {
		case "fluency":
		case "coherence":
		case "task":
			return "fluency";
		case "lexical":
		case "vocabulary":
		case "spelling":
			return "lexical";
		case "grammar":
			return "grammar";
		case "pronunciation":
			return "pronunciation";
		default:
			return null;
	}
}

const PLACEMENT_WRITING_ERROR_CATEGORY_KEYS =
	PLACEMENT_WRITING_ERROR_CATEGORIES.map((c) => c.key) as [
		PlacementWritingErrorCategory,
		...PlacementWritingErrorCategory[],
	];
const PLACEMENT_SPEAKING_ERROR_CATEGORY_KEYS =
	PLACEMENT_SPEAKING_ERROR_CATEGORIES.map((c) => c.key) as [
		PlacementSpeakingErrorCategory,
		...PlacementSpeakingErrorCategory[],
	];
const PLACEMENT_ERROR_CATEGORY_KEYS = PLACEMENT_ERROR_CATEGORIES.map(
	(c) => c.key,
) as [PlacementErrorCategory, ...PlacementErrorCategory[]];

export const PLACEMENT_ERRORS_MAX = 60;
export const PLACEMENT_ERROR_QUOTE_MAX = 300;
export const PLACEMENT_ERROR_EXPLANATION_MAX = 600;

function createPlacementErrorSchema<
	const K extends readonly [string, ...string[]],
>(keys: K) {
	return z
		.object({
			id: z.string().trim().min(1).max(40),
			category: z.enum(keys),
			quote: z.string().min(1).max(PLACEMENT_ERROR_QUOTE_MAX),
			start: z.number().int().min(0).nullable().default(null),
			end: z.number().int().min(0).nullable().default(null),
			correction: z.string().max(PLACEMENT_ERROR_QUOTE_MAX).default(""),
			explanation: z.string().max(PLACEMENT_ERROR_EXPLANATION_MAX).default(""),
		})
		.strict();
}

/**
 * Một lỗi được đánh dấu trên bài viết (Writing) hoặc transcript (Speaking).
 * `quote` là đoạn nguyên văn bị sai; `start`/`end` là offset ký tự (UTF-16,
 * `end` loại trừ) trong văn bản nguồn do SERVER định vị lại từ `quote`
 * (`locatePlacementErrors`) — null khi không tìm thấy (thẻ vẫn hiện, không tô).
 */
export const placementErrorSchema = createPlacementErrorSchema(
	PLACEMENT_ERROR_CATEGORY_KEYS,
);
export type PlacementError = z.infer<typeof placementErrorSchema>;

export const placementErrorListSchema = z
	.array(placementErrorSchema)
	.max(PLACEMENT_ERRORS_MAX);

export const placementWritingErrorSchema = createPlacementErrorSchema(
	PLACEMENT_WRITING_ERROR_CATEGORY_KEYS,
);
export type PlacementWritingError = z.infer<typeof placementWritingErrorSchema>;

export const placementWritingErrorListSchema = z
	.array(placementWritingErrorSchema)
	.max(PLACEMENT_ERRORS_MAX);

export const placementSpeakingErrorSchema = createPlacementErrorSchema(
	PLACEMENT_SPEAKING_ERROR_CATEGORY_KEYS,
);
export type PlacementSpeakingError = z.infer<
	typeof placementSpeakingErrorSchema
>;

export const placementSpeakingErrorListSchema = z
	.array(placementSpeakingErrorSchema)
	.max(PLACEMENT_ERRORS_MAX);

/**
 * Định vị lại offset của từng lỗi trong `text` (thuần, dùng chung server/UI):
 * - Giữ `start/end` nếu `text.slice(start, end) === quote` và không chồng lấn.
 * - Ngược lại tìm `quote` (ưu tiên khớp chính xác, sau đó không phân biệt
 *   hoa thường — chỉ khi hạ chữ thường không đổi độ dài văn bản/quote) từ
 *   đầu văn bản, bỏ qua vùng đã bị lỗi trước chiếm.
 * - Không tìm được → `start = end = null`.
 * Kết quả sắp theo vị trí (lỗi không định vị được xếp cuối, giữ thứ tự gốc).
 */
export function locatePlacementErrors(
	text: string,
	errors: readonly PlacementError[],
): PlacementError[] {
	const taken: Array<[number, number]> = [];
	const overlaps = (s: number, e: number) =>
		taken.some(([ts, te]) => s < te && ts < e);
	const lower = text.toLowerCase();
	// Hạ chữ thường có thể đổi độ dài chuỗi (vd "İ" → "i̇"), làm lệch offset
	// so với văn bản gốc — khi đó chỉ khớp chính xác.
	const lowerSafe = lower.length === text.length;
	const find = (quote: string): [number, number] | null => {
		const lowerQuote = quote.toLowerCase();
		const passes: Array<readonly [string, string]> = [[text, quote]];
		if (lowerSafe && lowerQuote.length === quote.length) {
			passes.push([lower, lowerQuote]);
		}
		for (const [hay, needle] of passes) {
			let from = 0;
			while (from <= hay.length) {
				const idx = hay.indexOf(needle, from);
				if (idx < 0) break;
				const end = idx + needle.length;
				if (!overlaps(idx, end)) return [idx, end];
				from = idx + 1;
			}
		}
		return null;
	};
	const located = errors.map((err) => {
		const { start, end } = err;
		if (
			start !== null &&
			end !== null &&
			end > start &&
			text.slice(start, end) === err.quote &&
			!overlaps(start, end)
		) {
			taken.push([start, end]);
			return err;
		}
		const hit = err.quote.trim().length > 0 ? find(err.quote) : null;
		if (hit) taken.push(hit);
		return { ...err, start: hit?.[0] ?? null, end: hit?.[1] ?? null };
	});
	return located
		.map((err, i) => ({ err, i }))
		.sort((a, b) => {
			const as = a.err.start ?? Number.POSITIVE_INFINITY;
			const bs = b.err.start ?? Number.POSITIVE_INFINITY;
			return as === bs ? a.i - b.i : as - bs;
		})
		.map(({ err }) => err);
}

export type PlacementAiStatus = "none" | "processing" | "drafted" | "failed";

/** Mã lỗi pipeline chấm AI placement (lưu `ai_error_code`). */
export const PLACEMENT_AI_ERROR_CODES = {
	DISABLED: "AI_GRADING_DISABLED",
	FAILED: "AI_GRADING_FAILED",
	TIMEOUT: "AI_GRADING_TIMEOUT",
	NO_TRANSCRIPT: "AI_GRADING_NO_TRANSCRIPT",
} as const;

/** Bản nháp AI cho một kỹ năng — chỉ liệt kê lỗi, không đề xuất điểm hay nhận xét. */
export interface PlacementAiSkillDraft {
	errors: PlacementError[];
}

export const placementTeacherGradeSchema = z
	.object({
		writingRubric: placementWritingRubricSchema,
		writingScore: placementIeltsBandSchema,
		speakingRubric: placementSpeakingRubricSchema.nullable().default(null),
		speakingScore: placementIeltsBandSchema.nullable().default(null),
		writingCriterionComments: placementWritingCriterionCommentsSchema.default(
			() => emptyWritingCriterionComments(),
		),
		speakingCriterionComments: placementSpeakingCriterionCommentsSchema
			.nullable()
			.default(null),
		courseId: z
			.string()
			.trim()
			.min(1, "Vui lòng chọn khóa học đề xuất.")
			.max(128),
		teacherFeedback: z.string().max(PLACEMENT_TEACHER_FEEDBACK_MAX).default(""),
		/** Lỗi giáo viên chốt cho bài viết / transcript theo 4 tiêu chí từng kỹ năng. */
		writingErrors: placementWritingErrorListSchema.default([]),
		speakingErrors: placementSpeakingErrorListSchema.default([]),
	})
	.strict()
	.superRefine((val, ctx) => {
		if ((val.speakingRubric === null) !== (val.speakingScore === null)) {
			ctx.addIssue({
				code: "custom",
				path: [val.speakingScore === null ? "speakingScore" : "speakingRubric"],
				message:
					"Điểm tổng và điểm tiêu chí Speaking phải cùng được nhập hoặc cùng bỏ trống.",
			});
		}
	});
export type PlacementTeacherGrade = z.infer<typeof placementTeacherGradeSchema>;

export interface PlacementSubmissionDetail {
	id: string;
	leadId: string | null;
	studentId?: string | null;
	studentName: string;
	studentPhone: string;
	testVersion: number;
	status: "pending_grading" | "graded";
	submittedAt: string;
	snapshot: PlacementSnapshot;
	answers: {
		listening: Record<string, string | number | null>;
		vocabGrammar: Record<string, number | null>;
		reading: Record<string, number | null>;
	};
	objective: PlacementObjectiveResult;
	writingText: string;
	writingWordCount: number;
	speakingStatus: "none" | "pending_upload" | "uploaded" | "skipped";
	speakingMediaUrl: string | null;
	speakingMediaMime: string | null;
	speakingMediaSize: number | null;
	speakingDurationSec: number | null;
	writingRubric: PlacementStoredWritingRubric | null;
	writingScore: number | null;
	writingCriterionComments: PlacementWritingCriterionComments | null;
	speakingRubric: PlacementStoredSpeakingRubric | null;
	speakingScore: number | null;
	speakingCriterionComments: PlacementSpeakingCriterionComments | null;
	teacherFeedback: string;
	finalBandLevel: string | null;
	finalCourseId: string | null;
	finalCourse: string | null;
	finalDisplayCourse: string | null;
	finalScorePct: number | null;
	finalNote: string;
	gradedAt: string | null;
	zaloText: string;
	/** #730: trạng thái phân tích lỗi AI + danh sách lỗi (chỉ giáo viên thấy). */
	aiStatus: PlacementAiStatus;
	aiErrorCode: string | null;
	aiDraftedAt: string | null;
	aiWriting: PlacementAiSkillDraft | null;
	aiSpeaking: PlacementAiSkillDraft | null;
	/** Transcript Speaking AI chuyển từ audio ("" = chưa có). */
	speakingTranscript: string;
	/** Lỗi đã chốt (null = chưa chốt lần nào) — offset đã định vị lại. */
	writingErrors: PlacementError[] | null;
	speakingErrors: PlacementError[] | null;
	/** Link kết quả công khai tuyệt đối (null = chưa chốt). */
	resultUrl: string | null;
	resultEmailStatus: "sent" | "failed" | "skipped" | null;
}

/**
 * Kết quả công khai cho học viên (#730) — GET /public/placement-test/results/:token.
 * Chỉ tồn tại sau khi giáo viên chốt; không chứa nháp AI, đáp án đúng hay PII
 * ngoài tên học viên.
 */
export interface PlacementPublicResultView {
	studentName: string;
	submittedAt: string;
	gradedAt: string;
	objective: Pick<
		PlacementObjectiveResult,
		"listening" | "vocabGrammar" | "reading"
	>;
	writingText: string;
	writingRubric: PlacementStoredWritingRubric | null;
	writingScore: number | null;
	writingCriterionComments: PlacementWritingCriterionComments | null;
	writingErrors: PlacementError[];
	speakingStatus: "none" | "pending_upload" | "uploaded" | "skipped";
	speakingTranscript: string;
	speakingRubric: PlacementStoredSpeakingRubric | null;
	speakingScore: number | null;
	speakingCriterionComments: PlacementSpeakingCriterionComments | null;
	speakingErrors: PlacementError[];
	finalBandLevel: string | null;
	finalDisplayCourse: string | null;
	finalScorePct: number | null;
	finalNote: string;
	bandAdvice: string;
	teacherFeedback: string;
}

const INLINE_CEFR_TAG_RE =
	/\s*[([][\s]*(?:(?:level|cefr)\s+)?(?:pre-a1|a1|a2\+?|b1\+?|b2\+?|c1|c2)(?:\s*(?:[–—/-]|to)\s*(?:pre-a1|a1|a2\+?|b1\+?|b2\+?|c1|c2))?[\s]*[)\]]/gi;

/**
 * Lược nhãn cấp độ CEFR trong ngoặc trên tiêu đề/nhãn phần trước khi hiển thị
 * cho thí sinh làm bài để không lộ độ khó câu hỏi (#726).
 */
export function stripInlineCefrLabel(rawTitle: string): string {
	return String(rawTitle ?? "")
		.replace(INLINE_CEFR_TAG_RE, " ")
		.replace(/\s{2,}/g, " ")
		.replace(/\s+([,:;!?])/g, "$1")
		.trim();
}

export const STUDENT_PLACEMENT_STATUSES = [
	"not_started",
	"pending_grading",
	"graded",
	"exempt",
	"unavailable",
] as const;
export type StudentPlacementStatus =
	(typeof STUDENT_PLACEMENT_STATUSES)[number];

export const studentPlacementStatusSchema = z.object({
	status: z.enum(STUDENT_PLACEMENT_STATUSES),
	hasEntryScore: z.boolean(),
	entryScore: z.string().nullable(),
	promptDismissedAt: z.string().nullable(),
	submissionId: z.string().nullable(),
	testAvailable: z.boolean(),
	testVersion: z.number().int().nullable(),
});
export type StudentPlacementStatusResponse = z.infer<
	typeof studentPlacementStatusSchema
>;

export interface StudentPlacementSubmissionView {
	id: string;
	testVersion: number;
	status: "pending_grading" | "graded";
	submittedAt: string;
	gradedAt: string | null;
	objective: Pick<
		PlacementObjectiveResult,
		"listening" | "vocabGrammar" | "reading"
	>;
	writingText: string;
	writingWordCount: number;
	writingRubric: PlacementStoredWritingRubric | null;
	writingScore: number | null;
	writingCriterionComments: PlacementWritingCriterionComments | null;
	writingErrors: PlacementError[];
	speakingStatus: "none" | "pending_upload" | "uploaded" | "skipped";
	speakingTranscript: string;
	speakingRubric: PlacementStoredSpeakingRubric | null;
	speakingScore: number | null;
	speakingCriterionComments: PlacementSpeakingCriterionComments | null;
	speakingErrors: PlacementError[];
	finalBandLevel: string | null;
	finalDisplayCourse: string | null;
	finalScorePct: number | null;
	finalNote: string;
	bandAdvice: string;
	teacherFeedback: string;
}

export interface StudentPlacementViewResponse
	extends StudentPlacementStatusResponse {
	snapshot: PlacementSnapshot | null;
	submission: StudentPlacementSubmissionView | null;
	speakingTasks?: PlacementPublishedSpeakingTask[] | null;
}

export interface StudentPlacementSpeakingTokenResponse {
	uploadToken: string;
	uploadTokenExpiresAt: string;
}

export interface StudentPlacementSubmitResponse {
	submissionId: string;
	uploadToken: string | null;
	uploadTokenExpiresAt: string | null;
	objective: Pick<
		PlacementObjectiveResult,
		"listening" | "vocabGrammar" | "reading"
	>;
}

const BANNED_SPEAKING_FTYP_BRANDS: Readonly<Record<string, true>> = {
	heic: true,
	heix: true,
	hevc: true,
	hevx: true,
	mif1: true,
	msf1: true,
	avif: true,
	avis: true,
	"jp2 ": true,
};

function hasMagicBytesAt(
	buf: Uint8Array,
	offset: number,
	expected: readonly number[],
): boolean {
	if (buf.byteLength < offset + expected.length) return false;
	for (let i = 0; i < expected.length; i += 1) {
		if (buf[offset + i] !== expected[i]) return false;
	}
	return true;
}

function readFourCcAlnumSpace(buf: Uint8Array, offset: number): string | null {
	if (buf.byteLength < offset + 4) return null;
	let out = "";
	for (let i = 0; i < 4; i += 1) {
		const b = buf[offset + i] ?? 0;
		const valid =
			b === 0x20 ||
			(b >= 0x30 && b <= 0x39) ||
			(b >= 0x41 && b <= 0x5a) ||
			(b >= 0x61 && b <= 0x7a);
		if (!valid) return null;
		out += String.fromCharCode(b);
	}
	return out;
}

/**
 * Nhận diện MIME audio thực tế từ các byte đầu của payload Speaking, khớp với
 * các chữ ký container audio được server chấp nhận. Trả `null` nếu byte đầu
 * không khớp container audio hợp lệ.
 */
export function detectSpeakingAudioMimeFromBytes(
	head: Uint8Array,
): string | null {
	if (head.byteLength < 4) return null;

	// RIFF....WAVE hoặc RF64....WAVE
	if (
		head.byteLength >= 12 &&
		(hasMagicBytesAt(head, 0, [0x52, 0x49, 0x46, 0x46]) ||
			hasMagicBytesAt(head, 0, [0x52, 0x46, 0x36, 0x34])) &&
		hasMagicBytesAt(head, 8, [0x57, 0x41, 0x56, 0x45])
	) {
		return "audio/wav";
	}

	// ISO BMFF ftyp box (MP4/M4A audio), loại trừ brand ảnh (HEIC/AVIF/JP2)
	if (
		head.byteLength >= 16 &&
		hasMagicBytesAt(head, 4, [0x66, 0x74, 0x79, 0x70])
	) {
		const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
		const rawSize = view.getUint32(0, false);
		let effectiveSize = rawSize;
		let brandOffset = 8;
		let sizeValid = true;
		if (rawSize === 1) {
			if (head.byteLength < 24 || view.getUint32(8, false) !== 0) {
				sizeValid = false;
			} else {
				effectiveSize = view.getUint32(12, false);
				if (effectiveSize < 24) sizeValid = false;
				brandOffset = 16;
			}
		} else if (rawSize < 16) {
			sizeValid = false;
		}
		if (sizeValid && effectiveSize <= 4096 && effectiveSize % 4 === 0) {
			const brand = readFourCcAlnumSpace(head, brandOffset);
			if (
				brand !== null &&
				!Object.hasOwn(BANNED_SPEAKING_FTYP_BRANDS, brand)
			) {
				return "audio/mp4";
			}
		}
	}

	// EBML (WebM / Matroska)
	if (hasMagicBytesAt(head, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
		return "audio/webm";
	}

	// OggS
	if (hasMagicBytesAt(head, 0, [0x4f, 0x67, 0x67, 0x53])) {
		return "audio/ogg";
	}

	// ID3 tag hoặc MPEG Layer 3 frame sync
	const b0 = head[0] ?? 0;
	const b1 = head[1] ?? 0;
	const b2 = head[2] ?? 0;
	if (
		hasMagicBytesAt(head, 0, [0x49, 0x44, 0x33]) ||
		(b0 === 0xff &&
			(b1 & 0xe0) === 0xe0 &&
			(b1 & 0x18) !== 0x08 &&
			(b1 & 0x06) === 0x02 &&
			(b2 & 0xf0) !== 0x00 &&
			(b2 & 0xf0) !== 0xf0 &&
			(b2 & 0x0c) !== 0x0c)
	) {
		return "audio/mpeg";
	}

	// ADTS AAC frame sync
	if (b0 === 0xff && (b1 & 0xf6) === 0xf0 && ((b2 >> 2) & 0x0f) < 13) {
		return "audio/aac";
	}

	return null;
}

const PLACEMENT_SPEAKING_UPLOAD_META_BY_MIME: Readonly<
	Record<string, { contentType: string; filename: string }>
> = {
	"audio/webm": { contentType: "audio/webm", filename: "speaking.webm" },
	"video/webm": { contentType: "audio/webm", filename: "speaking.webm" },
	"audio/mp4": { contentType: "audio/mp4", filename: "speaking.m4a" },
	"video/mp4": { contentType: "audio/mp4", filename: "speaking.m4a" },
	"audio/x-m4a": { contentType: "audio/mp4", filename: "speaking.m4a" },
	"audio/m4a": { contentType: "audio/mp4", filename: "speaking.m4a" },
	"audio/mp4a-latm": { contentType: "audio/mp4", filename: "speaking.m4a" },
	"audio/ogg": { contentType: "audio/ogg", filename: "speaking.ogg" },
	"audio/opus": { contentType: "audio/ogg", filename: "speaking.ogg" },
	"audio/x-opus+ogg": { contentType: "audio/ogg", filename: "speaking.ogg" },
	"audio/x-vorbis+ogg": { contentType: "audio/ogg", filename: "speaking.ogg" },
	"video/ogg": { contentType: "audio/ogg", filename: "speaking.ogg" },
	"application/ogg": { contentType: "audio/ogg", filename: "speaking.ogg" },
	"audio/mpeg": { contentType: "audio/mpeg", filename: "speaking.mp3" },
	"audio/mp3": { contentType: "audio/mpeg", filename: "speaking.mp3" },
	"audio/x-mp3": { contentType: "audio/mpeg", filename: "speaking.mp3" },
	"audio/x-mpeg": { contentType: "audio/mpeg", filename: "speaking.mp3" },
	"audio/mpeg3": { contentType: "audio/mpeg", filename: "speaking.mp3" },
	"audio/x-mpeg-3": { contentType: "audio/mpeg", filename: "speaking.mp3" },
	"audio/wav": { contentType: "audio/wav", filename: "speaking.wav" },
	"audio/x-wav": { contentType: "audio/wav", filename: "speaking.wav" },
	"audio/wave": { contentType: "audio/wav", filename: "speaking.wav" },
	"audio/vnd.wave": { contentType: "audio/wav", filename: "speaking.wav" },
	"audio/aac": { contentType: "audio/aac", filename: "speaking.aac" },
	"audio/x-aac": { contentType: "audio/aac", filename: "speaking.aac" },
	"audio/aacp": { contentType: "audio/aac", filename: "speaking.aac" },
	"audio/vnd.dlna.adts": { contentType: "audio/aac", filename: "speaking.aac" },
	"audio/adts": { contentType: "audio/aac", filename: "speaking.aac" },
	"audio/x-hx-aac-adts": { contentType: "audio/aac", filename: "speaking.aac" },
};

const DEFAULT_PLACEMENT_SPEAKING_UPLOAD_META = {
	contentType: "audio/webm",
	filename: "speaking.webm",
} as const;

/**
 * Chuẩn hoá `Content-Type` và tên file gửi lên server khi tải bài Speaking:
 * ưu tiên chữ ký magic-byte thực tế trong `headBytes` khi có (tránh trường hợp
 * WebKit/iOS gắn `video/mp4`, chuỗi rỗng hoặc fallback sai so với byte thật).
 */
export function resolvePlacementSpeakingUploadMeta(
	blobType: string,
	headBytes?: Uint8Array | null,
): { contentType: string; filename: string } {
	if (headBytes && headBytes.byteLength >= 4) {
		const detected = detectSpeakingAudioMimeFromBytes(headBytes);
		if (
			detected &&
			Object.hasOwn(PLACEMENT_SPEAKING_UPLOAD_META_BY_MIME, detected)
		) {
			const meta = PLACEMENT_SPEAKING_UPLOAD_META_BY_MIME[detected];
			if (meta) return { ...meta };
		}
	}
	const normalized = (blobType.split(";")[0] ?? "").trim().toLowerCase();
	if (Object.hasOwn(PLACEMENT_SPEAKING_UPLOAD_META_BY_MIME, normalized)) {
		const meta = PLACEMENT_SPEAKING_UPLOAD_META_BY_MIME[normalized];
		if (meta) return { ...meta };
	}
	return { ...DEFAULT_PLACEMENT_SPEAKING_UPLOAD_META };
}

const IN_APP_BROWSER_RE =
	/zalo|fban|fbav|fb_iab|messenger|instagram|line\/|bytedancewebview|musical_ly|tiktok/i;

/**
 * Nhận diện WebView trong ứng dụng di động (Zalo, Facebook/Messenger,
 * Instagram, Line, TikTok) thường hạn chế quyền mic hoặc `MediaRecorder`.
 */
export function isLikelyInAppBrowser(userAgent: string): boolean {
	if (!userAgent) return false;
	return IN_APP_BROWSER_RE.test(userAgent);
}
