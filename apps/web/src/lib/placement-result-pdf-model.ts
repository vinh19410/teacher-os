/**
 * Pure view-model builder cho phiếu kết quả bài kiểm tra đầu vào (PDF A4).
 * Không phụ thuộc DOM hay pdfmake để test nhanh trong môi trường Node.
 */
import { formatBand } from "@teacher-os/api/lib/ielts-band";
import {
	isIeltsSpeakingRubric,
	isIeltsWritingRubric,
	normalizePlacementErrorCategory,
	PLACEMENT_ERROR_CATEGORIES,
	PLACEMENT_LEGACY_SPEAKING_RUBRIC,
	PLACEMENT_LEGACY_WRITING_RUBRIC,
	PLACEMENT_SPEAKING_RUBRIC,
	PLACEMENT_WRITING_RUBRIC,
	type PlacementError,
	type PlacementErrorCategory,
	type PlacementErrorSkill,
	type PlacementSectionScore,
	type PlacementSubmissionDetail,
} from "@teacher-os/api/placement-test-contracts";

export const PDF_BRAND_NAME = "CÔ ĐỖ THỤC MỸ • THE ENGLISH CORNER";
export const PDF_REPORT_TITLE = "PHIẾU KẾT QUẢ BÀI KIỂM TRA ĐẦU VÀO 5 KỸ NĂNG";
export const PDF_FOOTER_SUPPORT_TEXT = "Hỗ trợ: Zalo 0929.060.994";
export const PDF_NO_ERRORS_TEXT = "Cô không ghi nhận lỗi nào cần đánh dấu.";
export const PDF_EMPTY_WRITING_TEXT = "Học viên chưa có bài viết.";
export const PDF_SKIPPED_SPEAKING_TEXT = "Học viên đã bỏ qua phần Speaking.";
export const PDF_DEFAULT_FILENAME = "phieu-ket-qua-dau-vao.pdf";

const VIETNAM_DATE_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	timeZone: "Asia/Ho_Chi_Minh",
});

const CATEGORY_LABELS: Record<PlacementErrorCategory, string> =
	Object.fromEntries(
		PLACEMENT_ERROR_CATEGORIES.map((c) => [c.key, c.label]),
	) as Record<PlacementErrorCategory, string>;

const CIRCLED_NUMBERS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const CIRCLED_NUMBER_RE = /[①-⑳]/g;
const EXTENDED_PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/gu;
const EMOJI_AND_INVISIBLE_RE =
	/(?:[\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u200B-\u200F\uFEFF]|\u20E3|\uFE0E|\uFE0F)/gu;

function stripNonPrintableControlChars(value: string): string {
	let out = "";
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code === 9 || code === 10 || (code >= 32 && code !== 127)) {
			out += value[i];
		}
	}
	return out;
}

export interface PlacementPdfRubricCriterion {
	key: string;
	label: string;
	desc: string;
	valueText: string;
	comment: string;
}

export interface PlacementPdfNumberedError {
	number: number;
	id: string;
	category: PlacementErrorCategory;
	categoryLabel: string;
	quote: string;
	correction: string;
	explanation: string;
	located: boolean;
}

export type PlacementPdfHighlightSegment =
	| { kind: "text"; text: string }
	| {
			kind: "error";
			text: string;
			number: number;
			category: PlacementErrorCategory;
	  };

export interface PlacementPdfObjectiveSkill {
	key: "listening" | "vocabGrammar" | "reading";
	label: string;
	scoreText: string;
}

export interface PlacementPdfWritingSection {
	isIelts: boolean;
	totalText: string | null;
	criteria: PlacementPdfRubricCriterion[] | null;
	text: string;
	wordCount: number;
	segments: PlacementPdfHighlightSegment[];
	errors: PlacementPdfNumberedError[];
	hasContent: boolean;
}

export interface PlacementPdfSpeakingSection {
	status: PlacementSubmissionDetail["speakingStatus"];
	skippedNotice: string | null;
	isIelts: boolean;
	totalText: string | null;
	criteria: PlacementPdfRubricCriterion[] | null;
	transcript: string;
	segments: PlacementPdfHighlightSegment[];
	errors: PlacementPdfNumberedError[];
	hasContent: boolean;
}

export interface PlacementPdfFeedbackBlock {
	key: "teacherFeedback" | "bandAdvice" | "finalNote";
	title: string;
	body: string;
}

export interface PlacementResultPdfModel {
	filename: string;
	brandName: string;
	reportTitle: string;
	studentName: string;
	submittedDate: string;
	gradedDate: string;
	overview: {
		cefr: string;
		recommendedCourse: string;
		overallScorePct: string;
	};
	objectiveSkills: PlacementPdfObjectiveSkill[];
	writing: PlacementPdfWritingSection;
	speaking: PlacementPdfSpeakingSection;
	feedbackBlocks: PlacementPdfFeedbackBlock[];
	footerSupportText: string;
}

/**
 * Chuẩn hóa chuỗi cho font Be Vietnam Pro trong PDF: thay thế các ký tự
 * không có glyph (`→`, `①..⑳`, `✓`, `✗`, emoji) thành ký tự tương đương
 * đọc được, giữ nguyên toàn bộ tiếng Việt có dấu, `•`, `—`, `–`, `…`.
 */
export function sanitizePdfText(raw: string): string {
	const cleaned = String(raw ?? "")
		.normalize("NFC")
		.replace(/\r\n?/g, "\n")
		.replace(/↔/g, "<->")
		.replace(/→/g, "->")
		.replace(/←/g, "<-")
		.replace(/⇒/g, "=>")
		.replace(/↑/g, "^")
		.replace(/↓/g, "v")
		.replace(/[●▪]/g, "•")
		.replace(/[★☆]/g, "*")
		.replace(/☐/g, "[ ]")
		.replace(/[✓✔]/g, "[OK]")
		.replace(/[✗✘]/g, "[X]")
		.replace(CIRCLED_NUMBER_RE, (ch) => {
			const idx = CIRCLED_NUMBERS.indexOf(ch);
			return idx >= 0 ? `[${idx + 1}]` : "";
		})
		.replace(EXTENDED_PICTOGRAPHIC_RE, "")
		.replace(EMOJI_AND_INVISIBLE_RE, "");
	return stripNonPrintableControlChars(cleaned);
}

/**
 * Tạo tên file PDF an toàn từ tên học viên:
 * `phieu-ket-qua-<slug>.pdf`, lùi về `phieu-ket-qua-dau-vao.pdf` nếu rỗng.
 */
export function buildPlacementPdfFilename(studentName: string): string {
	const slug = String(studentName ?? "")
		.replace(/[đĐ]/g, "d")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80)
		.replace(/-+$/g, "");
	return slug ? `phieu-ket-qua-${slug}.pdf` : PDF_DEFAULT_FILENAME;
}

/** Định dạng ngày ISO sang `dd/mm/yyyy` theo múi giờ Việt Nam (`—` nếu trống/lỗi). */
export function formatPlacementPdfDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	const parts = VIETNAM_DATE_FORMATTER.formatToParts(date);
	const day = parts.find((p) => p.type === "day")?.value;
	const month = parts.find((p) => p.type === "month")?.value;
	const year = parts.find((p) => p.type === "year")?.value;
	if (!day || !month || !year) return "—";
	return `${day}/${month}/${year}`;
}

function formatObjectiveSectionScore(
	score: PlacementSectionScore | null | undefined,
): string {
	if (!score || !Number.isFinite(score.total) || score.total <= 0) {
		return "—";
	}
	const pct =
		score.pct !== null && Number.isFinite(score.pct)
			? ` (${Math.round(score.pct)}%)`
			: "";
	return `${score.correct}/${score.total}${pct}`;
}

function isLocatedError(
	err: PlacementError,
): err is PlacementError & { start: number; end: number } {
	return (
		typeof err.start === "number" &&
		typeof err.end === "number" &&
		Number.isInteger(err.start) &&
		Number.isInteger(err.end) &&
		err.start >= 0 &&
		err.end > err.start
	);
}

function buildAnnotatedSkillData(
	rawText: string,
	rawErrors: readonly PlacementError[] | null | undefined,
	skill: PlacementErrorSkill,
): {
	segments: PlacementPdfHighlightSegment[];
	errors: PlacementPdfNumberedError[];
} {
	const source = String(rawText ?? "");
	const list: readonly PlacementError[] = Array.isArray(rawErrors)
		? rawErrors
		: [];

	const sorted = list
		.map((err, index) => ({
			err: {
				...err,
				category:
					normalizePlacementErrorCategory(err.category, skill) ?? "grammar",
			},
			index,
		}))
		.sort((a, b) => {
			const as = isLocatedError(a.err) ? a.err.start : Number.POSITIVE_INFINITY;
			const bs = isLocatedError(b.err) ? b.err.start : Number.POSITIVE_INFINITY;
			return as === bs ? a.index - b.index : as - bs;
		})
		.map(({ err }, idx) => ({ err, number: idx + 1 }));

	const placed: Array<{
		err: PlacementError & { start: number; end: number };
		number: number;
	}> = [];
	const placedNumbers = new Set<number>();
	let cursor = 0;

	for (const item of sorted) {
		const { err, number } = item;
		if (!isLocatedError(err) || err.end > source.length || err.start < cursor) {
			continue;
		}
		placed.push({ err, number });
		placedNumbers.add(number);
		cursor = err.end;
	}

	const segments: PlacementPdfHighlightSegment[] = [];
	let pos = 0;
	for (const { err, number } of placed) {
		if (err.start > pos) {
			segments.push({
				kind: "text",
				text: sanitizePdfText(source.slice(pos, err.start)),
			});
		}
		segments.push({
			kind: "error",
			text: sanitizePdfText(source.slice(err.start, err.end)),
			number,
			category: err.category,
		});
		pos = err.end;
	}
	if (pos < source.length) {
		segments.push({
			kind: "text",
			text: sanitizePdfText(source.slice(pos)),
		});
	}

	const errors: PlacementPdfNumberedError[] = sorted.map(({ err, number }) => ({
		number,
		id: err.id,
		category: err.category,
		categoryLabel: CATEGORY_LABELS[err.category] ?? err.category,
		quote: sanitizePdfText(err.quote),
		correction: sanitizePdfText(err.correction),
		explanation: sanitizePdfText(err.explanation),
		located: placedNumbers.has(number),
	}));

	return { segments, errors };
}

function buildWritingSection(
	submission: PlacementSubmissionDetail,
): PlacementPdfWritingSection {
	const rubric = submission.writingRubric;
	const score = submission.writingScore;
	const isIelts = rubric
		? isIeltsWritingRubric(rubric)
		: score !== null && Number.isFinite(score) && !Number.isInteger(score);

	const totalText =
		score !== null && Number.isFinite(score)
			? isIelts
				? `Band ${formatBand(score)}/9`
				: `${score}/15`
			: null;

	let criteria: PlacementPdfRubricCriterion[] | null = null;
	if (rubric) {
		if (isIeltsWritingRubric(rubric)) {
			criteria = PLACEMENT_WRITING_RUBRIC.map(({ key, label, desc }) => {
				const value = rubric[key];
				const rawComment = submission.writingCriterionComments?.[key] ?? "";
				return {
					key,
					label,
					desc,
					valueText: Number.isFinite(value) ? `${formatBand(value)}/9` : "—/9",
					comment: sanitizePdfText(rawComment).trim(),
				};
			});
		} else {
			criteria = PLACEMENT_LEGACY_WRITING_RUBRIC.map(({ key, label, desc }) => {
				const value = rubric[key];
				return {
					key,
					label,
					desc,
					valueText: Number.isFinite(value) ? `${value}/5` : "—/5",
					comment: "",
				};
			});
		}
	}

	const rawText = submission.writingText ?? "";
	const { segments, errors } = buildAnnotatedSkillData(
		rawText,
		submission.writingErrors,
		"writing",
	);
	const sanitizedText = sanitizePdfText(rawText);

	return {
		isIelts,
		totalText,
		criteria,
		text: sanitizedText,
		wordCount: Number.isFinite(submission.writingWordCount)
			? Math.max(0, Math.round(submission.writingWordCount))
			: 0,
		segments,
		errors,
		hasContent: Boolean(
			totalText || criteria || sanitizedText.trim() || errors.length > 0,
		),
	};
}

function buildSpeakingSection(
	submission: PlacementSubmissionDetail,
): PlacementPdfSpeakingSection {
	const rubric = submission.speakingRubric;
	const score = submission.speakingScore;
	const isIelts = rubric
		? isIeltsSpeakingRubric(rubric)
		: score !== null && Number.isFinite(score) && !Number.isInteger(score);

	const skippedNotice =
		submission.speakingStatus === "skipped" && score === null
			? PDF_SKIPPED_SPEAKING_TEXT
			: null;

	const totalText =
		score !== null && Number.isFinite(score)
			? isIelts
				? `Band ${formatBand(score)}/9`
				: `${score}/20`
			: null;

	let criteria: PlacementPdfRubricCriterion[] | null = null;
	if (rubric) {
		if (isIeltsSpeakingRubric(rubric)) {
			criteria = PLACEMENT_SPEAKING_RUBRIC.map(({ key, label, desc }) => {
				const value = rubric[key];
				const rawComment = submission.speakingCriterionComments?.[key] ?? "";
				return {
					key,
					label,
					desc,
					valueText: Number.isFinite(value) ? `${formatBand(value)}/9` : "—/9",
					comment: sanitizePdfText(rawComment).trim(),
				};
			});
		} else {
			criteria = PLACEMENT_LEGACY_SPEAKING_RUBRIC.map(
				({ key, label, desc }) => {
					const value = rubric[key];
					return {
						key,
						label,
						desc,
						valueText: Number.isFinite(value) ? `${value}/5` : "—/5",
						comment: "",
					};
				},
			);
		}
	}

	const rawTranscript = submission.speakingTranscript ?? "";
	const { segments, errors } = buildAnnotatedSkillData(
		rawTranscript,
		submission.speakingErrors,
		"speaking",
	);
	const sanitizedTranscript = sanitizePdfText(rawTranscript);

	return {
		status: submission.speakingStatus,
		skippedNotice,
		isIelts,
		totalText,
		criteria,
		transcript: sanitizedTranscript,
		segments,
		errors,
		hasContent: Boolean(
			skippedNotice ||
				totalText ||
				criteria ||
				sanitizedTranscript.trim() ||
				errors.length > 0,
		),
	};
}

function resolveBandAdvice(submission: PlacementSubmissionDetail): string {
	const bands = Array.isArray(submission.snapshot?.bands)
		? submission.snapshot.bands
		: [];
	if (!submission.finalBandLevel) return "";
	return (
		bands.find((b) => b.cefr === submission.finalBandLevel)?.advice?.trim() ??
		""
	);
}

function resolveBandCourseLabel(submission: PlacementSubmissionDetail): string {
	const bands = Array.isArray(submission.snapshot?.bands)
		? submission.snapshot.bands
		: [];
	const matched = submission.finalBandLevel
		? bands.find((b) => b.cefr === submission.finalBandLevel)
		: submission.finalCourse
			? bands.find((b) => b.course === submission.finalCourse)
			: undefined;
	return matched?.displayCourse?.trim() || matched?.courseLabel?.trim() || "";
}

/**
 * Dựng dữ liệu phiếu kết quả PDF từ `PlacementSubmissionDetail`.
 * Không đưa SĐT, email, nháp AI hay bảng đáp án trắc nghiệm vào phiếu.
 */
export function buildPlacementResultPdfModel(
	submission: PlacementSubmissionDetail,
): PlacementResultPdfModel {
	const studentName =
		sanitizePdfText(submission.studentName ?? "").trim() || "Học viên";
	const cefr = sanitizePdfText(submission.finalBandLevel ?? "").trim() || "—";
	const recommendedCourse =
		sanitizePdfText(
			submission.finalDisplayCourse?.trim() ||
				resolveBandCourseLabel(submission) ||
				submission.finalCourse?.trim() ||
				"",
		).trim() || "—";
	const overallScorePct =
		submission.finalScorePct !== null &&
		Number.isFinite(submission.finalScorePct)
			? `${Math.round(submission.finalScorePct)}%`
			: "—";

	const objectiveSkills: PlacementPdfObjectiveSkill[] = [
		{
			key: "listening",
			label: "Listening",
			scoreText: formatObjectiveSectionScore(submission.objective?.listening),
		},
		{
			key: "vocabGrammar",
			label: "Grammar & Vocabulary",
			scoreText: formatObjectiveSectionScore(
				submission.objective?.vocabGrammar,
			),
		},
		{
			key: "reading",
			label: "Reading",
			scoreText: formatObjectiveSectionScore(submission.objective?.reading),
		},
	];

	const feedbackBlocks: PlacementPdfFeedbackBlock[] = [];
	const teacherFeedback = sanitizePdfText(
		submission.teacherFeedback ?? "",
	).trim();
	if (teacherFeedback) {
		feedbackBlocks.push({
			key: "teacherFeedback",
			title: "Nhận xét của cô",
			body: teacherFeedback,
		});
	}
	const bandAdvice = sanitizePdfText(resolveBandAdvice(submission)).trim();
	if (bandAdvice) {
		feedbackBlocks.push({
			key: "bandAdvice",
			title: "Lời khuyên theo trình độ",
			body: bandAdvice,
		});
	}
	const finalNote = sanitizePdfText(submission.finalNote ?? "").trim();
	if (finalNote) {
		feedbackBlocks.push({
			key: "finalNote",
			title: "Ghi chú thêm",
			body: finalNote,
		});
	}

	return {
		filename: buildPlacementPdfFilename(submission.studentName),
		brandName: PDF_BRAND_NAME,
		reportTitle: PDF_REPORT_TITLE,
		studentName,
		submittedDate: formatPlacementPdfDate(submission.submittedAt),
		gradedDate: formatPlacementPdfDate(submission.gradedAt),
		overview: {
			cefr,
			recommendedCourse,
			overallScorePct,
		},
		objectiveSkills,
		writing: buildWritingSection(submission),
		speaking: buildSpeakingSection(submission),
		feedbackBlocks,
		footerSupportText: PDF_FOOTER_SUPPORT_TEXT,
	};
}
