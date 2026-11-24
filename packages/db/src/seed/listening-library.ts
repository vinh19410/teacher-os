import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { headR2Object, putR2ObjectBytes } from "./r2-audio";
import type { SqlRunner } from "./vocab-library";

export const LISTENING_TEST_ID_PREFIX = "lib-listen-";
export const LISTENING_PART_ID_PREFIX = "lib-listen-part-";
export const LISTENING_AUDIO_R2_PREFIX = "library-listening/";
export const LISTENING_IMAGE_R2_PREFIX = "library-images/";
export const DEFAULT_STAGING_IMAGE_BASE_URL =
	"https://api.staging.teacheros.io.vn/public/library-images";

export const DEFAULT_LISTENING_DATA_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../../../docs/listening_ielts",
);

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_D1_CHUNK_BYTES = 45_000;
const LETTERS_20 = [
	"A",
	"B",
	"C",
	"D",
	"E",
	"F",
	"G",
	"H",
	"I",
	"J",
	"K",
	"L",
	"M",
	"N",
	"O",
	"P",
	"Q",
	"R",
	"S",
	"T",
] as const;

const ALLOWED_IMAGE_EXT_MIME: Readonly<Record<string, string>> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
};

const BANK_REQUIRED_TYPES = new Set([
	"match2",
	"matching",
	"info",
	"match_names",
	"features",
	"map",
]);

const OPTIONAL_BANK_TYPES = new Set(["summary", "flow"]);

const STEP_IELTS_RE = /step[\s-]?ielts/i;
const IMAGE_FILENAME_RE = /^[a-zA-Z0-9_-]{1,128}\.(png|jpg|jpeg|webp|gif)$/;

export interface RawListeningOptionObject {
	label?: string;
	text?: string;
}

export type RawListeningOption = string | RawListeningOptionObject;

export interface RawListeningQuestion {
	number: number;
	text?: string;
	options?: RawListeningOption[];
	answer?: string;
	quotes?: string[];
	explanation?: string;
}

export interface RawListeningGroup {
	range?: string;
	type: string;
	instructions?: string;
	instructions_html?: string;
	body?: string;
	body_html?: string;
	body_table?: string[][];
	options?: RawListeningOption[];
	questions?: RawListeningQuestion[];
}

export interface RawListeningFile {
	id: string;
	url?: string;
	title: string;
	source?: string;
	section: number;
	time_minutes?: number;
	question_range?: string;
	audio_url: string;
	transcript?: string;
	body?: string;
	question_groups: RawListeningGroup[];
	images?: string[];
}

export interface TransformedListeningQuestion {
	stem: string;
	opts: string[] | null;
	answer: string;
	alts: string;
	type: string;
	pin: null;
	explanation?: string;
	answerSet?: string;
}

export interface TransformedListeningGroup {
	id: string;
	type: string;
	instruction: string;
	startIndex: number;
	count: number;
	optionBank: string[];
	answersInline: boolean;
	splitContent: boolean;
	dragDrop: boolean;
}

export interface ListeningLibraryImportItem {
	fileName: string;
	sourceId: string;
	testId: string;
	partId: string;
	title: string;
	description: string;
	collection: string;
	testGroup: string;
	timeLimitSeconds: number;
	status: "ready" | "draft";
	draftReasons: string[];
	part: {
		part: string;
		type: string;
		title: string;
		band: "6.0" | "6.5" | "7.0" | "7.5";
		source: string;
		intro: string;
		passage: string;
		transcript: string;
		imageUrl: string;
		questions: TransformedListeningQuestion[];
		optionBank: string[];
		groups: TransformedListeningGroup[];
		note: string;
		audioKey: string;
		audioName: string;
		audioContentType: string;
		audioSize: number;
	};
	media: {
		audioSourceUrl: string;
		audioKey: string;
		imageSourceUrl: string | null;
		imageKey: string | null;
		imageContentType: string | null;
	};
}

export interface ParsedListeningLibraryDataset {
	items: ListeningLibraryImportItem[];
	readyCount: number;
	draftCount: number;
	totalQuestions: number;
	totalGroups: number;
	totalAudioFiles: number;
	totalImageFiles: number;
	typeDistribution: Record<string, number>;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function htmlToPlainLength(html: string): number {
	return html
		.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote|pre)>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/gi, " ")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/&amp;/gi, "&")
		.replace(/\s+/g, " ")
		.trim().length;
}

function plainTextToHtml(text: string): string {
	const lines = text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	if (lines.length === 0) return "";
	return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

function sanitizeSourceBodyHtml(rawHtml: string): string {
	return rawHtml
		.replace(/<img\b[^>]*>/gi, "")
		.replace(/\[(\d+)\]/g, "<strong>($1)</strong>")
		.trim();
}

function buildGroupInstructionHtml(group: RawListeningGroup): string {
	const instrText = (group.instructions ?? "").trim();
	const instrHtml = plainTextToHtml(instrText);
	const bodyHtml = group.body_html
		? sanitizeSourceBodyHtml(group.body_html)
		: "";
	if (!bodyHtml) return instrHtml;

	const combined = instrHtml ? `${instrHtml}${bodyHtml}` : bodyHtml;
	// Respect libraryQuestionGroupSchema richTextField(5000) -> rawMax 12500
	if (combined.length <= 12_500 && htmlToPlainLength(combined) <= 5_000) {
		return combined;
	}
	return instrHtml;
}

function normalizeCollectionAndGroup(
	rawSource: string | undefined,
	section: number,
): { collection: string; testGroup: string; partSource: string } {
	const source = (rawSource ?? "Other sources").trim() || "Other sources";
	const cambridge = /^C(\d+)T(\d+)$/i.exec(source);
	if (cambridge) {
		const book = cambridge[1];
		const testNum = cambridge[2];
		return {
			collection: `Cambridge IELTS ${book}`,
			testGroup: `Test ${testNum}`,
			partSource: `Cambridge IELTS ${book} Test ${testNum} — Section ${section}`,
		};
	}
	return {
		collection: source,
		testGroup: `Section ${section}`,
		partSource: `${source} — Section ${section}`,
	};
}

function resolveGroupType(group: RawListeningGroup, section: number): string {
	const rawType = (group.type ?? "").trim().toUpperCase();
	switch (rawType) {
		case "NOTE_COMPLETION":
			return "notes";
		case "TABLE_COMPLETION":
			return "tablecomp";
		case "FORM_COMPLETION":
			return "form";
		case "SENTENCE_COMPLETION":
			return "sent4";
		case "SUMMARY_COMPLETION":
			return "summary";
		case "FLOWCHART_COMPLETION":
			return "flow";
		case "FILL_BLANK":
			return "fill_blank";
		case "SHORT_ANSWER":
			return "shortans";
		case "DIAGRAM_LABEL":
			return "diagram";
		case "MAP_LABELLING":
			return "map";
		case "MULTIPLE_CHOICE_MANY":
			return "mcq_many";
		case "MULTIPLE_CHOICE_ONE": {
			const hasFourOpts = (group.questions ?? []).some(
				(q) => (q.options?.length ?? 0) >= 4,
			);
			if (hasFourOpts) return "mcq";
			return section <= 2 ? "mcq1" : "mcq3";
		}
		case "MATCHING":
			return "matching";
		case "MATCHING_INFORMATION":
			return "info";
		case "MATCHING_NAMES":
			return "match_names";
		case "MATCHING_FEATURES":
			return "features";
		case "TRUE/FALSE/NOT GIVEN":
			return "tfng";
		default:
			throw new Error(`Unsupported listening question group type: ${rawType}`);
	}
}

function extractOptionText(opt: RawListeningOption): string {
	if (typeof opt === "string") return opt.trim();
	return (opt.text ?? opt.label ?? "").trim();
}

function normalizeQuestionStem(
	q: RawListeningQuestion,
	group: RawListeningGroup,
	previousRawText: string | null,
): string {
	let raw = (q.text ?? "").trim();
	if (!raw) {
		const bodyLines = (group.body ?? "")
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);
		const numToken = `[${q.number}]`;
		const matchingLine = bodyLines.find((line) => line.includes(numToken));
		raw = matchingLine ?? `Question ${q.number}: ____`;
	}

	// Replace this question's own `[N]` marker with `____`, and any other `[M]` with `(M)`.
	const ownRe = new RegExp(`\\[${q.number}\\]`, "g");
	let stem = raw.replace(ownRe, "____").replace(/\[(\d+)\]/g, "($1)");

	// Ensure at most one `____` cloze marker per question stem (contract max 1 blank per question).
	const markerMatches = [...stem.matchAll(/_{4,}/g)];
	if (markerMatches.length >= 2) {
		const isSecond =
			/\[second blank\]/i.test(stem) ||
			(previousRawText !== null && previousRawText === raw);
		const keepIndex = isSecond ? markerMatches.length - 1 : 0;
		let seen = 0;
		stem = stem.replace(/_{4,}/g, () => {
			const idx = seen;
			seen += 1;
			return idx === keepIndex ? "____" : "…";
		});
	}

	stem = stem.replace(/\s+/g, " ").trim();
	if (!stem) {
		stem = `Question ${q.number}: ____`;
	}
	if (stem.length > 500) {
		stem = `${stem.slice(0, 497).trimEnd()}...`;
	}
	return stem;
}

function buildQuestionExplanation(q: RawListeningQuestion): string | undefined {
	const parts: string[] = [];
	const exp = (q.explanation ?? "").trim();
	if (exp) {
		parts.push(`<p>${escapeHtml(exp)}</p>`);
	}
	const quotes = (q.quotes ?? [])
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
	for (const quote of quotes) {
		parts.push(`<blockquote>${escapeHtml(quote)}</blockquote>`);
	}
	if (parts.length === 0) return undefined;

	// Trim within assignmentQuestionSchema explanation richTextField(2000) (rawMax 5000).
	let html = "";
	for (const chunk of parts) {
		const candidate = html ? `${html}${chunk}` : chunk;
		if (candidate.length <= 4_800 && htmlToPlainLength(candidate) <= 1_900) {
			html = candidate;
		} else {
			if (!html) {
				const truncated = escapeHtml(
					(exp || quotes[0] || "").slice(0, 1_750).trimEnd(),
				);
				html = `<p>${truncated}…</p>`;
			}
			break;
		}
	}
	return html || undefined;
}

function splitAnswerAndAlts(
	rawAnswer: string,
	groupType: string,
	hasOptionBank: boolean,
): { answer: string; alts: string } {
	const trimmed = rawAnswer.trim();
	const isChoiceLike =
		groupType === "mcq" ||
		groupType === "mcq1" ||
		groupType === "mcq3" ||
		groupType === "mcq_many" ||
		groupType === "tfng" ||
		BANK_REQUIRED_TYPES.has(groupType) ||
		(OPTIONAL_BANK_TYPES.has(groupType) && hasOptionBank);

	if (isChoiceLike) {
		return { answer: trimmed.toUpperCase(), alts: "" };
	}

	const segments = trimmed
		.split(" / ")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	const primary = (segments[0] ?? trimmed).slice(0, 200);
	const altText = segments.slice(1).join(" / ").slice(0, 500);
	return { answer: primary, alts: altText };
}

function resolveImageInfo(
	raw: RawListeningFile,
	imageBaseUrl: string,
): {
	imageSourceUrl: string | null;
	imageKey: string | null;
	imageUrl: string;
	imageContentType: string | null;
} {
	const firstImg = (raw.images ?? []).find(
		(u) => typeof u === "string" && u.trim().length > 0,
	);
	if (!firstImg) {
		return {
			imageSourceUrl: null,
			imageKey: null,
			imageUrl: "",
			imageContentType: null,
		};
	}
	const trimmed = firstImg.trim();
	const pathname = (() => {
		try {
			return new URL(trimmed).pathname;
		} catch {
			return trimmed;
		}
	})();
	const rawBase = basename(pathname);
	const rawExt = extname(rawBase).toLowerCase() || ".png";
	const ext = Object.hasOwn(ALLOWED_IMAGE_EXT_MIME, rawExt) ? rawExt : ".png";
	const safeFileName = IMAGE_FILENAME_RE.test(rawBase)
		? rawBase
		: `${raw.id.replace(/[^a-zA-Z0-9_-]/g, "")}${ext}`;
	const normalizedBaseUrl = imageBaseUrl.replace(/\/+$/, "");
	return {
		imageSourceUrl: trimmed,
		imageKey: `${LISTENING_IMAGE_R2_PREFIX}${safeFileName}`,
		imageUrl: `${normalizedBaseUrl}/${safeFileName}`,
		imageContentType: ALLOWED_IMAGE_EXT_MIME[ext] ?? "image/png",
	};
}

function makeAudioFileName(fileName: string, sourceId: string): string {
	const stem = fileName
		.replace(/\.json$/i, "")
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 120);
	return `${stem || sourceId}.mp3`;
}

function validateTransformedItem(item: ListeningLibraryImportItem): string[] {
	const reasons: string[] = [];
	if (!item.part.questions.length) {
		reasons.push("part has no questions");
	}
	const hasImageGroup = item.part.groups.some(
		(g) => g.type === "map" || g.type === "diagram",
	);
	if (hasImageGroup && !item.part.imageUrl.startsWith("https://")) {
		reasons.push("image-based group missing https imageUrl");
	}

	for (const group of item.part.groups) {
		const slice = item.part.questions.slice(
			group.startIndex,
			group.startIndex + group.count,
		);
		const needsBank =
			BANK_REQUIRED_TYPES.has(group.type) ||
			(OPTIONAL_BANK_TYPES.has(group.type) && group.optionBank.length > 0);
		if (needsBank) {
			if (group.optionBank.length < 2 || group.optionBank.length > 20) {
				reasons.push(
					`group ${group.id} (${group.type}): optionBank must have 2..20 items (got ${group.optionBank.length})`,
				);
			}
			const allowedLabels = LETTERS_20.slice(0, group.optionBank.length);
			for (const [offset, q] of slice.entries()) {
				const qNum = group.startIndex + offset + 1;
				if (!allowedLabels.includes(q.answer as (typeof LETTERS_20)[number])) {
					reasons.push(
						`Q${qNum} answer "${q.answer}" outside optionBank [${allowedLabels[0] ?? "?"}-${allowedLabels.at(-1) ?? "?"}]`,
					);
				}
			}
		} else if (group.optionBank.length > 0) {
			reasons.push(`group ${group.id} (${group.type}): unexpected optionBank`);
		}

		if (group.type === "mcq_many") {
			if (slice.length < 2) {
				reasons.push(`group ${group.id}: mcq_many needs >= 2 questions`);
			}
			for (const [offset, q] of slice.entries()) {
				const qNum = group.startIndex + offset + 1;
				const opts = q.opts ?? [];
				const idx = LETTERS_20.slice(0, 8).indexOf(
					q.answer as (typeof LETTERS_20)[number],
				);
				if (opts.length < 2 || opts.length > 8) {
					reasons.push(
						`Q${qNum}: mcq_many opts count ${opts.length} out of 2..8`,
					);
				}
				if (idx < 0 || idx >= opts.length || !(opts[idx] ?? "").trim()) {
					reasons.push(`Q${qNum}: mcq_many answer "${q.answer}" outside opts`);
				}
			}
		}

		if (
			group.type === "mcq" ||
			group.type === "mcq1" ||
			group.type === "mcq3"
		) {
			const maxOpts = group.type === "mcq" ? 4 : 3;
			for (const [offset, q] of slice.entries()) {
				const qNum = group.startIndex + offset + 1;
				const opts = q.opts ?? [];
				if (opts.length < 2 || opts.length > maxOpts) {
					reasons.push(
						`Q${qNum}: ${group.type} opts count ${opts.length} out of 2..${maxOpts}`,
					);
				}
				const valid = LETTERS_20.slice(0, opts.length);
				if (!valid.includes(q.answer as (typeof LETTERS_20)[number])) {
					reasons.push(
						`Q${qNum}: ${group.type} answer "${q.answer}" outside opts`,
					);
				}
			}
		}

		if (group.type === "tfng") {
			for (const [offset, q] of slice.entries()) {
				const qNum = group.startIndex + offset + 1;
				if (!["TRUE", "FALSE", "NOT GIVEN"].includes(q.answer)) {
					reasons.push(`Q${qNum}: invalid tfng answer "${q.answer}"`);
				}
			}
		}
	}

	// Guard against Step IELTS branding leakage in any persisted metadata field.
	for (const [field, val] of [
		["title", item.title],
		["description", item.description],
		["collection", item.collection],
		["testGroup", item.testGroup],
		["part.title", item.part.title],
		["part.source", item.part.source],
		["part.note", item.part.note],
	] as const) {
		if (STEP_IELTS_RE.test(val)) {
			reasons.push(`branding leak in ${field}`);
		}
	}

	return reasons;
}

export function transformListeningFile(
	raw: RawListeningFile,
	fileName: string,
	options?: { imageBaseUrl?: string },
): ListeningLibraryImportItem {
	const imageBaseUrl = options?.imageBaseUrl ?? DEFAULT_STAGING_IMAGE_BASE_URL;
	const sourceId = raw.id.trim();
	if (!sourceId) {
		throw new Error(`[${fileName}] missing id`);
	}
	const section = Number(raw.section);
	if (!Number.isInteger(section) || section < 1 || section > 4) {
		throw new Error(`[${fileName}] invalid section: ${String(raw.section)}`);
	}
	const slot = `s${section}`;
	const title = raw.title.trim().slice(0, 200);
	const { collection, testGroup, partSource } = normalizeCollectionAndGroup(
		raw.source,
		section,
	);
	const imageInfo = resolveImageInfo(raw, imageBaseUrl);

	const questions: TransformedListeningQuestion[] = [];
	const groups: TransformedListeningGroup[] = [];

	for (const [gi, rawGroup] of (raw.question_groups ?? []).entries()) {
		const groupType = resolveGroupType(rawGroup, section);
		const rawQuestions = rawGroup.questions ?? [];
		if (rawQuestions.length === 0) continue;

		const rawGroupOpts = rawGroup.options ?? [];
		const optionBank = rawGroupOpts
			.map(extractOptionText)
			.filter((text) => text.length > 0)
			.map((text) => text.slice(0, 200))
			.slice(0, 20);
		const hasBank = optionBank.length > 0;
		const startIndex = questions.length;
		const answerSet = groupType === "mcq_many" ? `set-${gi + 1}` : undefined;

		let prevRawText: string | null = null;
		for (const q of rawQuestions) {
			const stem = normalizeQuestionStem(q, rawGroup, prevRawText);
			prevRawText = (q.text ?? "").trim();

			const qOptsRaw = q.options ?? [];
			const opts =
				groupType === "mcq" ||
				groupType === "mcq1" ||
				groupType === "mcq3" ||
				groupType === "mcq_many"
					? qOptsRaw
							.map(extractOptionText)
							.map((text) => text.slice(0, 500))
							.slice(0, 8)
					: null;

			const { answer, alts } = splitAnswerAndAlts(
				q.answer ?? "",
				groupType,
				hasBank,
			);
			const explanation = buildQuestionExplanation(q);

			const entry: TransformedListeningQuestion = {
				stem,
				opts,
				answer,
				alts,
				type: groupType,
				pin: null,
				...(explanation ? { explanation } : {}),
				...(answerSet ? { answerSet } : {}),
			};
			questions.push(entry);
		}

		groups.push({
			id: `g${gi + 1}`,
			type: groupType,
			instruction: buildGroupInstructionHtml(rawGroup),
			startIndex,
			count: rawQuestions.length,
			optionBank:
				BANK_REQUIRED_TYPES.has(groupType) ||
				(OPTIONAL_BANK_TYPES.has(groupType) && hasBank)
					? optionBank
					: [],
			answersInline: false,
			splitContent: false,
			dragDrop: false,
		});
	}

	const firstGroupType = groups[0]?.type ?? "notes";
	const timeMinutes = Number(raw.time_minutes) || 10;
	const timeLimitSeconds = Math.max(60, Math.min(4 * 3600, timeMinutes * 60));
	const audioKey = `${LISTENING_AUDIO_R2_PREFIX}${sourceId}.mp3`;
	const audioName = makeAudioFileName(fileName, sourceId);
	const transcript = (raw.transcript ?? "").trim().slice(0, 10_000);

	const item: ListeningLibraryImportItem = {
		fileName,
		sourceId,
		testId: `${LISTENING_TEST_ID_PREFIX}${sourceId}`,
		partId: `${LISTENING_PART_ID_PREFIX}${sourceId}-${slot}`,
		title,
		description: `Section ${section} · ${questions.length} câu hỏi`,
		collection,
		testGroup,
		timeLimitSeconds,
		status: "ready",
		draftReasons: [],
		part: {
			part: slot,
			type: firstGroupType,
			title: `Section ${section}: ${title}`.slice(0, 200),
			band: "7.0",
			source: partSource.slice(0, 200),
			intro: "",
			passage: "",
			transcript,
			imageUrl: imageInfo.imageUrl,
			questions,
			optionBank: [],
			groups,
			note: "",
			audioKey,
			audioName,
			audioContentType: "audio/mpeg",
			audioSize: 0,
		},
		media: {
			audioSourceUrl: (raw.audio_url ?? "").trim(),
			audioKey,
			imageSourceUrl: imageInfo.imageSourceUrl,
			imageKey: imageInfo.imageKey,
			imageContentType: imageInfo.imageContentType,
		},
	};

	const reasons = validateTransformedItem(item);
	if (reasons.length > 0) {
		item.status = "draft";
		item.draftReasons = reasons;
		item.part.note = `<p>Tự động giữ ở trạng thái nháp do lỗi dữ liệu nguồn: ${escapeHtml(reasons.join("; "))}</p>`;
	}

	return item;
}

export function loadListeningLibraryDataset(options?: {
	dataDir?: string;
	imageBaseUrl?: string;
	limit?: number;
}): ParsedListeningLibraryDataset {
	const dataDir = options?.dataDir ?? DEFAULT_LISTENING_DATA_DIR;
	const entries = readdirSync(dataDir)
		.filter((name) => name.endsWith(".json") && name !== "_index.json")
		.sort((a, b) => a.localeCompare(b));
	const selected =
		options?.limit && options.limit > 0
			? entries.slice(0, options.limit)
			: entries;

	const items: ListeningLibraryImportItem[] = [];
	const seenIds = new Set<string>();
	const typeDistribution: Record<string, number> = {};
	let readyCount = 0;
	let draftCount = 0;
	let totalQuestions = 0;
	let totalGroups = 0;
	const uniqueImages = new Set<string>();

	for (const fileName of selected) {
		const fullPath = join(dataDir, fileName);
		const raw = JSON.parse(readFileSync(fullPath, "utf8")) as RawListeningFile;
		const item = transformListeningFile(raw, fileName, {
			imageBaseUrl: options?.imageBaseUrl,
		});
		if (seenIds.has(item.testId)) {
			throw new Error(
				`Duplicate listening test id "${item.testId}" in ${fileName}`,
			);
		}
		seenIds.add(item.testId);
		items.push(item);

		if (item.status === "ready") readyCount += 1;
		else draftCount += 1;

		totalQuestions += item.part.questions.length;
		totalGroups += item.part.groups.length;
		for (const group of item.part.groups) {
			typeDistribution[group.type] = (typeDistribution[group.type] ?? 0) + 1;
		}
		if (item.media.imageKey) {
			uniqueImages.add(item.media.imageKey);
		}
	}

	return {
		items,
		readyCount,
		draftCount,
		totalQuestions,
		totalGroups,
		totalAudioFiles: items.length,
		totalImageFiles: uniqueImages.size,
		typeDistribution,
	};
}

function sqlLiteral(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "NULL";
	if (typeof value === "number") {
		return Number.isFinite(value) ? String(Math.trunc(value)) : "0";
	}
	return `'${value.replace(/'/g, "''")}'`;
}

export function buildListeningLibraryUpsertStatements(
	items: readonly ListeningLibraryImportItem[],
	options?: { nowMs?: number },
): string[] {
	const nowMs = options?.nowMs ?? Date.now();
	const statements: string[] = [];

	for (const item of items) {
		statements.push(
			`INSERT INTO library_test (id, title, description, skill, time_limit_seconds, collection, test_group, status, created_by, created_at, updated_at) VALUES (${sqlLiteral(item.testId)}, ${sqlLiteral(item.title)}, ${sqlLiteral(item.description)}, 'listening', ${sqlLiteral(item.timeLimitSeconds)}, ${sqlLiteral(item.collection)}, ${sqlLiteral(item.testGroup)}, ${sqlLiteral(item.status)}, 'system-import', ${sqlLiteral(nowMs)}, ${sqlLiteral(nowMs)}) ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, time_limit_seconds = excluded.time_limit_seconds, collection = excluded.collection, test_group = excluded.test_group, status = excluded.status, updated_at = excluded.updated_at;`,
		);

		const p = item.part;
		statements.push(
			`INSERT INTO library_test_part (id, test_id, part, type, title, band, source, intro, passage, transcript, image_url, questions, option_bank, groups, note, audio_key, audio_name, audio_content_type, audio_size, audio_uploaded_at, updated_at) VALUES (${sqlLiteral(item.partId)}, ${sqlLiteral(item.testId)}, ${sqlLiteral(p.part)}, ${sqlLiteral(p.type)}, ${sqlLiteral(p.title)}, ${sqlLiteral(p.band)}, ${sqlLiteral(p.source)}, ${sqlLiteral(p.intro)}, ${sqlLiteral(p.passage)}, ${sqlLiteral(p.transcript)}, ${sqlLiteral(p.imageUrl)}, ${sqlLiteral(JSON.stringify(p.questions))}, ${sqlLiteral(JSON.stringify(p.optionBank))}, ${sqlLiteral(JSON.stringify(p.groups))}, ${sqlLiteral(p.note)}, ${sqlLiteral(p.audioKey)}, ${sqlLiteral(p.audioName)}, ${sqlLiteral(p.audioContentType)}, ${sqlLiteral(p.audioSize)}, ${sqlLiteral(nowMs)}, ${sqlLiteral(nowMs)}) ON CONFLICT(test_id, part) DO UPDATE SET type = excluded.type, title = excluded.title, band = excluded.band, source = excluded.source, intro = excluded.intro, passage = excluded.passage, transcript = excluded.transcript, image_url = excluded.image_url, questions = excluded.questions, option_bank = excluded.option_bank, groups = excluded.groups, note = excluded.note, audio_key = excluded.audio_key, audio_name = excluded.audio_name, audio_content_type = excluded.audio_content_type, audio_size = excluded.audio_size, audio_uploaded_at = excluded.audio_uploaded_at, updated_at = excluded.updated_at;`,
		);
	}

	return statements;
}

export async function upsertListeningLibraryToDb(
	runner: SqlRunner,
	items: readonly ListeningLibraryImportItem[],
	options?: {
		maxChunkBytes?: number;
		nowMs?: number;
		onProgress?: (done: number, total: number) => void;
	},
): Promise<{ statementsExecuted: number }> {
	const statements = buildListeningLibraryUpsertStatements(items, {
		nowMs: options?.nowMs,
	});
	const maxChunkBytes = options?.maxChunkBytes ?? DEFAULT_D1_CHUNK_BYTES;

	let batch: string[] = [];
	let batchBytes = 0;
	let executed = 0;

	const flush = async () => {
		if (batch.length === 0) return;
		await runner.run(batch);
		executed += batch.length;
		options?.onProgress?.(executed, statements.length);
		batch = [];
		batchBytes = 0;
	};

	for (const stmt of statements) {
		const stmtBytes = Buffer.byteLength(stmt, "utf8");
		if (batch.length > 0 && batchBytes + stmtBytes > maxChunkBytes) {
			await flush();
		}
		batch.push(stmt);
		batchBytes += stmtBytes;
		if (stmtBytes >= maxChunkBytes) {
			await flush();
		}
	}
	await flush();

	return { statementsExecuted: executed };
}

export interface ListeningLibraryVerifyResult {
	ok: boolean;
	expectedTests: number;
	actualTests: number;
	expectedReady: number;
	actualReady: number;
	expectedDraft: number;
	actualDraft: number;
	expectedParts: number;
	actualParts: number;
	partsWithAudio: number;
	stepIeltsMatches: number;
}

export async function verifyListeningLibraryInDb(
	runner: SqlRunner,
	dataset: ParsedListeningLibraryDataset,
): Promise<ListeningLibraryVerifyResult> {
	if (!runner.queryRows) {
		throw new Error("SqlRunner.queryRows is required for verification.");
	}
	const testRows = await runner.queryRows(
		`SELECT status, COUNT(*) AS n FROM library_test WHERE id LIKE '${LISTENING_TEST_ID_PREFIX}%' GROUP BY status;`,
	);
	let actualReady = 0;
	let actualDraft = 0;
	for (const row of testRows) {
		const status = String(row.status ?? "");
		const n = Number(row.n ?? 0);
		if (status === "ready") actualReady += n;
		else if (status === "draft") actualDraft += n;
	}
	const actualTests = actualReady + actualDraft;

	const partRows = await runner.queryRows(
		`SELECT COUNT(*) AS total, SUM(CASE WHEN audio_key IS NOT NULL AND audio_key != '' THEN 1 ELSE 0 END) AS with_audio FROM library_test_part WHERE id LIKE '${LISTENING_PART_ID_PREFIX}%';`,
	);
	const actualParts = Number(partRows[0]?.total ?? 0);
	const partsWithAudio = Number(partRows[0]?.with_audio ?? 0);

	const stepRows = await runner.queryRows(
		`SELECT COUNT(*) AS n FROM library_test WHERE id LIKE '${LISTENING_TEST_ID_PREFIX}%' AND (lower(coalesce(collection,'')) LIKE '%step%ielts%' OR lower(coalesce(description,'')) LIKE '%step%ielts%');`,
	);
	const stepIeltsMatches = Number(stepRows[0]?.n ?? 0);

	const ok =
		actualTests === dataset.items.length &&
		actualReady === dataset.readyCount &&
		actualDraft === dataset.draftCount &&
		actualParts === dataset.items.length &&
		partsWithAudio === dataset.items.length &&
		stepIeltsMatches === 0;

	return {
		ok,
		expectedTests: dataset.items.length,
		actualTests,
		expectedReady: dataset.readyCount,
		actualReady,
		expectedDraft: dataset.draftCount,
		actualDraft,
		expectedParts: dataset.items.length,
		actualParts,
		partsWithAudio,
		stepIeltsMatches,
	};
}

export interface MediaSyncTask {
	kind: "audio" | "image";
	objectKey: string;
	sourceUrl: string;
	contentType: string;
	maxBytes: number;
	item?: ListeningLibraryImportItem;
}

export interface SyncListeningMediaResult {
	audioTotal: number;
	audioExisting: number;
	audioUploaded: number;
	imageTotal: number;
	imageExisting: number;
	imageUploaded: number;
	failed: Array<{ objectKey: string; error: string }>;
}

async function fetchBytesWithRetry(
	url: string,
	maxBytes: number,
	fetchImpl: typeof fetch,
	maxAttempts = 3,
): Promise<Uint8Array> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const res = await fetchImpl(url, {
				method: "GET",
				signal: AbortSignal.timeout(60_000),
			});
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			const bytes = new Uint8Array(await res.arrayBuffer());
			if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
				throw new Error(`Invalid byte length ${bytes.byteLength}`);
			}
			return bytes;
		} catch (err) {
			lastError = err;
			if (attempt < maxAttempts) {
				await new Promise((r) => setTimeout(r, 1000 * attempt));
			}
		}
	}
	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function runPool<T>(
	tasks: readonly T[],
	concurrency: number,
	worker: (task: T, index: number) => Promise<void>,
): Promise<void> {
	let cursor = 0;
	const limit = Math.max(1, Math.min(concurrency, tasks.length || 1));
	await Promise.all(
		Array.from({ length: limit }, async () => {
			while (true) {
				const idx = cursor;
				cursor += 1;
				if (idx >= tasks.length) return;
				const task = tasks[idx];
				if (task !== undefined) {
					await worker(task, idx);
				}
			}
		}),
	);
}

/**
 * Syncs all required listening MP3 audio files and map/diagram images to R2
 * (`teacher-os-library-audio-staging-*`). Checks existence via `headR2Object`
 * first so re-runs skip already-uploaded objects idempotently.
 */
export async function syncListeningMediaToR2(options: {
	items: readonly ListeningLibraryImportItem[];
	accountId: string;
	apiToken: string;
	bucketName: string;
	dryRun?: boolean;
	concurrency?: number;
	fetchImpl?: typeof fetch;
	writeLog?: (line: string) => void;
}): Promise<SyncListeningMediaResult> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const concurrency = options.concurrency ?? 8;
	const writeLog = options.writeLog ?? ((line: string) => console.log(line));

	const tasks: MediaSyncTask[] = [];
	const seenImages = new Set<string>();

	for (const item of options.items) {
		tasks.push({
			kind: "audio",
			objectKey: item.media.audioKey,
			sourceUrl: item.media.audioSourceUrl,
			contentType: "audio/mpeg",
			maxBytes: MAX_AUDIO_BYTES,
			item,
		});
		if (
			item.media.imageKey &&
			item.media.imageSourceUrl &&
			!seenImages.has(item.media.imageKey)
		) {
			seenImages.add(item.media.imageKey);
			tasks.push({
				kind: "image",
				objectKey: item.media.imageKey,
				sourceUrl: item.media.imageSourceUrl,
				contentType: item.media.imageContentType ?? "image/png",
				maxBytes: MAX_IMAGE_BYTES,
			});
		}
	}

	const result: SyncListeningMediaResult = {
		audioTotal: options.items.length,
		audioExisting: 0,
		audioUploaded: 0,
		imageTotal: seenImages.size,
		imageExisting: 0,
		imageUploaded: 0,
		failed: [],
	};

	let completed = 0;
	await runPool(tasks, concurrency, async (task) => {
		try {
			const head = await headR2Object({
				accountId: options.accountId,
				bucketName: options.bucketName,
				objectKey: task.objectKey,
				apiToken: options.apiToken,
				fetchImpl,
			});
			if (head.exists && (head.size === null || head.size > 0)) {
				if (task.kind === "audio") {
					result.audioExisting += 1;
					if (task.item && typeof head.size === "number") {
						task.item.part.audioSize = head.size;
					}
				} else {
					result.imageExisting += 1;
				}
			} else if (!options.dryRun) {
				const bytes = await fetchBytesWithRetry(
					task.sourceUrl,
					task.maxBytes,
					fetchImpl,
				);
				await putR2ObjectBytes({
					accountId: options.accountId,
					bucketName: options.bucketName,
					objectKey: task.objectKey,
					apiToken: options.apiToken,
					bytes,
					contentType: task.contentType,
					fetchImpl,
				});
				if (task.kind === "audio") {
					result.audioUploaded += 1;
					if (task.item) {
						task.item.part.audioSize = bytes.byteLength;
					}
				} else {
					result.imageUploaded += 1;
				}
			}
		} catch (err) {
			result.failed.push({
				objectKey: task.objectKey,
				error: err instanceof Error ? err.message : String(err),
			});
		} finally {
			completed += 1;
			if (completed % 50 === 0 || completed === tasks.length) {
				writeLog(
					`[listening-media] progress ${completed}/${tasks.length} (audio: ${result.audioExisting} existing, ${result.audioUploaded} uploaded | images: ${result.imageExisting} existing, ${result.imageUploaded} uploaded | failed: ${result.failed.length})`,
				);
			}
		}
	});

	return result;
}
