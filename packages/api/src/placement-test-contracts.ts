import { z } from "zod";
import {
	LEAD_COURSE_LABELS,
	LEAD_COURSES,
	type LeadCourse,
} from "./lead-contracts";

/**
 * Contract dùng chung cho màn sửa đề kiểm tra đầu vào (`/placement-test`
 * trong `apps/web`) và API công khai (`/public/placement-test` cho
 * `apps/profile`, issue #515).
 *
 * Nháp (`placementContentSchema`) chỉ kiểm shape và trần kích thước để giáo
 * viên lưu dở được (`answer: null`, `audioId: null`, `prompt` rỗng). Khi
 * bấm Phát hành, cả client và server chạy `validatePlacementForPublish` rồi
 * `buildPlacementSnapshot` để dựng snapshot bất biến cho học viên.
 */

export const PLACEMENT_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
export const PLACEMENT_PROMPT_MAX = 1000;
export const PLACEMENT_OPTION_MAX = 300;
export const PLACEMENT_CLIP_TITLE_MAX = 200;
export const PLACEMENT_LEVEL_MAX = 20;
export const PLACEMENT_CEFR_MAX = 20;
export const PLACEMENT_MAX_QUESTIONS = 100;
export const PLACEMENT_MAX_CLIPS = 20;
export const PLACEMENT_MAX_CLIP_QUESTIONS = 20;
export const PLACEMENT_MAX_BANDS = 8;
export const PLACEMENT_AUDIO_MAX_BYTES = 20 * 1024 * 1024;
export const PLACEMENT_DRAFT_BODY_MAX_BYTES = 256 * 1024;

export const PLACEMENT_QUESTION_KINDS = ["grammar", "vocab"] as const;
export type PlacementQuestionKind = (typeof PLACEMENT_QUESTION_KINDS)[number];

export const PLACEMENT_LEVELS = [
	"A1",
	"A2",
	"B1",
	"B2",
	"B2+",
	"C1",
	"C2",
] as const;

export const placementOptionsSchema = z.tuple([
	z.string().max(PLACEMENT_OPTION_MAX),
	z.string().max(PLACEMENT_OPTION_MAX),
	z.string().max(PLACEMENT_OPTION_MAX),
	z.string().max(PLACEMENT_OPTION_MAX),
]);

export const placementAnswerSchema = z.number().int().min(0).max(3).nullable();

export const placementVgQuestionSchema = z.object({
	id: z.string().regex(PLACEMENT_ID_REGEX),
	kind: z.enum(PLACEMENT_QUESTION_KINDS).default("grammar"),
	level: z.string().trim().max(PLACEMENT_LEVEL_MAX),
	prompt: z.string().max(PLACEMENT_PROMPT_MAX),
	options: placementOptionsSchema,
	answer: placementAnswerSchema,
});
export type PlacementVgQuestion = z.infer<typeof placementVgQuestionSchema>;

export const placementListeningQuestionSchema = z.object({
	id: z.string().regex(PLACEMENT_ID_REGEX),
	level: z.string().trim().max(PLACEMENT_LEVEL_MAX),
	prompt: z.string().max(PLACEMENT_PROMPT_MAX),
	options: placementOptionsSchema,
	answer: placementAnswerSchema,
});
export type PlacementListeningQuestion = z.infer<
	typeof placementListeningQuestionSchema
>;

export const placementQuestionSchema = z.union([
	placementVgQuestionSchema,
	placementListeningQuestionSchema,
]);
export type PlacementQuestion = z.infer<typeof placementQuestionSchema>;

export const placementClipSchema = z.object({
	id: z.string().regex(PLACEMENT_ID_REGEX),
	audioId: z.string().uuid().nullable(),
	maxPlays: z.number().int().min(1).max(5).default(2),
	level: z.string().trim().max(PLACEMENT_LEVEL_MAX),
	title: z.string().max(PLACEMENT_CLIP_TITLE_MAX),
	questions: z
		.array(placementListeningQuestionSchema)
		.max(PLACEMENT_MAX_CLIP_QUESTIONS),
});
export type PlacementClip = z.infer<typeof placementClipSchema>;

export const placementBandSchema = z.object({
	min: z.number().int().min(0),
	max: z.number().int().min(0),
	cefr: z.string().trim().max(PLACEMENT_CEFR_MAX),
	course: z.string().trim().max(64),
});
export type PlacementBand = z.infer<typeof placementBandSchema>;

export const placementVgPartSchema = z.object({
	id: z.literal("vocab-grammar"),
	title: z.string().max(100).default("Vocab + Grammar"),
	questions: z.array(placementVgQuestionSchema).max(PLACEMENT_MAX_QUESTIONS),
});
export type PlacementVgPart = z.infer<typeof placementVgPartSchema>;

export const placementListeningPartSchema = z.object({
	id: z.literal("listening"),
	title: z.string().max(100).default("Listening"),
	clips: z.array(placementClipSchema).max(PLACEMENT_MAX_CLIPS),
});
export type PlacementListeningPart = z.infer<
	typeof placementListeningPartSchema
>;

export const placementContentSchema = z
	.object({
		bands: z.array(placementBandSchema).max(PLACEMENT_MAX_BANDS),
		parts: z.tuple([placementVgPartSchema, placementListeningPartSchema]),
	})
	.superRefine((val, ctx) => {
		const vgCount = val.parts[0].questions.length;
		const listeningCount = val.parts[1].clips.reduce(
			(sum, clip) => sum + clip.questions.length,
			0,
		);
		if (vgCount + listeningCount > PLACEMENT_MAX_QUESTIONS) {
			ctx.addIssue({
				code: "custom",
				path: ["parts"],
				message: `Tổng số câu hỏi không được vượt quá ${PLACEMENT_MAX_QUESTIONS} câu.`,
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
}

export interface PlacementPublishedVgQuestion {
	id: string;
	kind: PlacementQuestionKind;
	level: string;
	prompt: string;
	options: [string, string, string, string];
	answer: 0 | 1 | 2 | 3;
}

export interface PlacementPublishedListeningQuestion {
	id: string;
	level: string;
	prompt: string;
	options: [string, string, string, string];
	answer: 0 | 1 | 2 | 3;
}

export interface PlacementPublishedClip {
	id: string;
	src: string;
	maxPlays: number;
	level: string;
	title: string;
	questions: PlacementPublishedListeningQuestion[];
}

export interface PlacementSnapshot {
	version: number;
	bands: PlacementPublishedBand[];
	parts: [
		{
			id: "vocab-grammar";
			title: string;
			questions: PlacementPublishedVgQuestion[];
		},
		{
			id: "listening";
			title: string;
			clips: PlacementPublishedClip[];
		},
	];
}

const LEAD_COURSE_SET = new Set<string>(LEAD_COURSES);

function validateQuestionItem(
	q: PlacementVgQuestion | PlacementListeningQuestion,
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
		q.answer > 3
	) {
		issues.push({
			path: `${basePath}.answer`,
			message: "Chưa chọn đáp án đúng.",
		});
	}
}

/**
 * Kiểm toàn bộ điều kiện trước khi Phát hành (D4, Phase 1 bước 2).
 * Trả danh sách `{ path, message }` tiếng Việt; mảng rỗng là hợp lệ.
 */
export function validatePlacementForPublish(
	content: PlacementContent,
): PlacementPublishIssue[] {
	const issues: PlacementPublishIssue[] = [];
	const vgPart = content.parts[0];
	const listeningPart = content.parts[1];

	const seenQuestionIds = new Set<string>();
	const seenClipIds = new Set<string>();

	if (vgPart.questions.length === 0) {
		issues.push({
			path: "parts.0.questions",
			message: "Phần 1 (Vocab + Grammar) phải có ít nhất 1 câu hỏi.",
		});
	}

	vgPart.questions.forEach((q, qIdx) => {
		validateQuestionItem(
			q,
			`parts.0.questions.${qIdx}`,
			seenQuestionIds,
			issues,
		);
	});

	if (listeningPart.clips.length === 0) {
		issues.push({
			path: "parts.1.clips",
			message: "Phần 2 (Listening) phải có ít nhất 1 đoạn nghe.",
		});
	}

	let listeningQuestionCount = 0;
	listeningPart.clips.forEach((clip, cIdx) => {
		const clipPath = `parts.1.clips.${cIdx}`;
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
			validateQuestionItem(
				q,
				`${clipPath}.questions.${qIdx}`,
				seenQuestionIds,
				issues,
			);
		});
	});

	const totalQuestions = vgPart.questions.length + listeningQuestionCount;
	if (totalQuestions > PLACEMENT_MAX_QUESTIONS) {
		issues.push({
			path: "parts",
			message: `Tổng số câu hỏi không được vượt quá ${PLACEMENT_MAX_QUESTIONS} câu.`,
		});
	}

	if (content.bands.length === 0) {
		issues.push({
			path: "bands",
			message: "Phải có ít nhất 1 ngưỡng điểm CEFR.",
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
		if (band.min > band.max) {
			issues.push({
				path: `${bandPath}.min`,
				message: "Điểm tối thiểu không được lớn hơn điểm tối đa.",
			});
		}
	});

	const firstBand = content.bands[0];
	if (firstBand && firstBand.min !== 0) {
		issues.push({
			path: "bands.0.min",
			message: "Ngưỡng điểm đầu tiên phải bắt đầu từ 0.",
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
				message: `Ngưỡng thứ ${i + 1} bị hở khoảng điểm so với ngưỡng thứ ${i}.`,
			});
		}
	}

	const lastBand = content.bands[content.bands.length - 1];
	if (lastBand && totalQuestions > 0 && lastBand.max !== totalQuestions) {
		issues.push({
			path: `bands.${content.bands.length - 1}.max`,
			message: `Ngưỡng cuối cùng phải kết thúc đúng bằng tổng số câu (${totalQuestions}).`,
		});
	}

	return issues;
}

/**
 * Dựng snapshot JSON công khai tại thời điểm Phát hành (D6, Phase 1 bước 3).
 * Chỉ copy các trường allowlist: `bands` có thêm `courseLabel`, mỗi `clip` có
 * `src: /public/placement-test/audio/<audioId>` và bỏ `audioId`.
 */
export function buildPlacementSnapshot(
	content: PlacementContent,
	version: number,
): PlacementSnapshot {
	const vgPart = content.parts[0];
	const listeningPart = content.parts[1];

	return {
		version,
		bands: content.bands.map((band) => {
			const course = band.course as LeadCourse;
			return {
				min: band.min,
				max: band.max,
				cefr: band.cefr.trim(),
				course,
				courseLabel: LEAD_COURSE_LABELS[course] ?? band.course,
			};
		}),
		parts: [
			{
				id: "vocab-grammar",
				title: vgPart.title.trim() || "Vocab + Grammar",
				questions: vgPart.questions.map((q) => ({
					id: q.id,
					kind: q.kind,
					level: q.level.trim(),
					prompt: q.prompt.trim(),
					options: [
						q.options[0].trim(),
						q.options[1].trim(),
						q.options[2].trim(),
						q.options[3].trim(),
					],
					answer: (q.answer ?? 0) as 0 | 1 | 2 | 3,
				})),
			},
			{
				id: "listening",
				title: listeningPart.title.trim() || "Listening",
				clips: listeningPart.clips.map((clip) => ({
					id: clip.id,
					src: `/public/placement-test/audio/${clip.audioId}`,
					maxPlays: clip.maxPlays,
					level: clip.level.trim(),
					title: clip.title.trim(),
					questions: clip.questions.map((q) => ({
						id: q.id,
						level: q.level.trim(),
						prompt: q.prompt.trim(),
						options: [
							q.options[0].trim(),
							q.options[1].trim(),
							q.options[2].trim(),
							q.options[3].trim(),
						],
						answer: (q.answer ?? 0) as 0 | 1 | 2 | 3,
					})),
				})),
			},
		],
	};
}

const PUBLIC_AUDIO_SRC_PREFIX = "/public/placement-test/audio/";

/**
 * Thu thập mọi `audioId` đang được tham chiếu bởi `draft` (qua `clip.audioId`)
 * hoặc `published` (qua `clip.src = "/public/placement-test/audio/<audioId>"`)
 * để D11 dọn audio không bao giờ xóa nhầm file của bản đang phát hành.
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
				}>;
			};
			if (!Array.isArray(parsed?.parts)) continue;
			for (const part of parsed.parts) {
				if (!Array.isArray(part?.clips)) continue;
				for (const clip of part.clips) {
					if (
						typeof clip?.audioId === "string" &&
						clip.audioId.trim().length > 0
					) {
						ids.add(clip.audioId.trim());
					}
					if (
						typeof clip?.src === "string" &&
						clip.src.startsWith(PUBLIC_AUDIO_SRC_PREFIX)
					) {
						const tail = clip.src.slice(PUBLIC_AUDIO_SRC_PREFIX.length).trim();
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
