/**
 * Pipeline import bộ từ vựng từ file Excel (.xlsx) vào `vocab_group`,
 * `vocab_deck`, `vocab_word` (ngân hàng từ vựng độc lập `class_id = NULL`)
 * với ID tất định (idempotent), chụp preimage backup, sinh rollback SQL,
 * và xác minh parity SHA-256.
 *
 * Nguyên tắc an toàn:
 * - Tái sử dụng `vocab_group` có sẵn trong org đích nếu trùng `normalized_name`
 *   (ví dụ giáo viên đã tạo sẵn nhóm "IELTS BRIDGE" trên web), tránh tạo trùng
 *   hoặc lỗi xung đột.
 * - Chặn fail-closed khi phát hiện đụng tiêu đề bộ từ khác ID trong cùng nhóm,
 *   đụng ID khác org, đụng deck đang gắn lớp học (`class_id IS NOT NULL`), hoặc
 *   đụng word thuộc deck ngoài phạm vi import.
 * - Giữ nguyên `audio_key` / `audio_url` nếu từ đã tồn tại và giáo viên đã tải
 *   âm thanh lên trước đó (không ghi đè thành NULL khi chạy lại).
 * - Không bao giờ chạm tới `vocab_card`, `vocab_review_log`, `vocab_suggestion`
 *   hay bất kỳ bộ từ nào ngoài phạm vi import.
 */
import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import {
	buildChunkedUpsertStatements,
	computeVocabContentHash,
	normalizeVocabLabel,
	type PromoteVocabPlan,
	queryByIdsInChunks,
	type SqlStatement,
	type TablePromoteDiff,
	type VocabDeckRow,
	type VocabGroupRow,
	type VocabPromotePreimage,
	type VocabPromoteSqlRunner,
	type VocabWordRow,
} from "./promote-vocab";
import { readXlsxSheetRowsFromFile } from "./xlsx-reader";

const RESERVED_LIBRARY_ID_PREFIX_REGEX = /^(libcourse|libdeck|libword)-/i;
const GENERIC_READING_TOPIC_NORMALIZED = "reading passages";

export interface ParsedImportWord {
	id: string;
	word: string;
	entryType: "word" | "chunk";
	ipa: string | null;
	pos: string | null;
	translation: string;
	example: string | null;
	sortOrder: number;
}

export interface ParsedImportDeck {
	id: string;
	week: number;
	skill: string;
	rawTopic: string;
	title: string;
	lessonNumber: number | null;
	topic: string;
	lang: string;
	words: ParsedImportWord[];
}

export interface ParsedVocabImportDataset {
	sourceKey: string;
	groupName: string;
	normalizedGroupName: string;
	defaultGroupId: string;
	decks: ParsedImportDeck[];
	stats: {
		deckCount: number;
		totalWords: number;
		wordCount: number;
		chunkCount: number;
	};
}

/**
 * Generates a deterministic RFC 4122 version-5-formatted UUID from a canonical key.
 * Guaranteed 36 chars, URL-safe, and never collides with `libcourse-/libdeck-/libword-`.
 */
export function deterministicVocabUuid(canonicalKey: string): string {
	const digest = createHash("sha256").update(canonicalKey, "utf8").digest();
	const bytes = Uint8Array.from(digest.subarray(0, 16));
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
		"",
	);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Derives a stable kebab-case source slug from an input file path so IDs do not
 * depend on the checkout directory.
 */
export function deriveSourceKeyFromPath(filePath: string): string {
	const stem = basename(filePath, extname(filePath))
		.trim()
		.normalize("NFC")
		.toLocaleLowerCase("vi");
	const slug = stem.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	if (slug.length === 0) {
		throw new Error(
			`Unable to derive non-empty source key from "${filePath}".`,
		);
	}
	return slug;
}

/**
 * Classifies an English vocabulary entry as `"word"` (single token) or
 * `"chunk"` (multi-word phrase containing whitespace).
 */
export function classifyVocabEntryType(word: string): "word" | "chunk" {
	return /\s/.test(word.trim()) ? "chunk" : "word";
}

/**
 * Formats deck title & topic for a `(week, skill, rawTopic)` split:
 * - Generic `"Reading Passages"` -> `"Week 01 – Reading"`
 * - Specific topic -> `"Week 01 – Writing Task 2: Studying Abroad"`
 * - `topic` metadata -> `"<Skill> · <Topic>"`
 * - `lessonNumber` -> `null` (so UI never displays "Buổi 01" for Week 1)
 */
export function formatWeekSkillDeckMeta(
	week: number,
	skill: string,
	rawTopic: string,
): { title: string; topic: string } {
	const cleanSkill = skill.trim().normalize("NFC");
	const cleanTopic = rawTopic.trim().normalize("NFC");
	const weekLabel = `Week ${String(week).padStart(2, "0")}`;

	const isGenericReadingTopic =
		cleanTopic.length === 0 ||
		normalizeVocabLabel(cleanTopic) === GENERIC_READING_TOPIC_NORMALIZED;

	const title = isGenericReadingTopic
		? `${weekLabel} – ${cleanSkill}`
		: `${weekLabel} – ${cleanSkill}: ${cleanTopic}`;

	const topic =
		cleanTopic.length > 0 ? `${cleanSkill} · ${cleanTopic}` : cleanSkill;

	return {
		title: title.slice(0, 200),
		topic: topic.slice(0, 200),
	};
}

function normalizeHeader(raw: string): string {
	return raw.trim().normalize("NFC").toLowerCase().replace(/\s+/g, " ");
}

function findHeaderColumn(
	headers: readonly string[],
	aliases: readonly string[],
): number {
	for (const alias of aliases) {
		const idx = headers.indexOf(alias);
		if (idx !== -1) return idx;
	}
	return -1;
}

/**
 * Parses rows from the `"Tổng hợp"` worksheet into deterministic grouped decks
 * (`Week × Skill`) ready for production DB planning.
 */
export function parseWeekSkillVocabSheet(
	rows: readonly (readonly string[])[],
	options: {
		groupName: string;
		sourceKey: string;
		lang?: string;
	},
): ParsedVocabImportDataset {
	const groupName = options.groupName.trim().normalize("NFC");
	if (groupName.length === 0 || groupName.length > 100) {
		throw new Error(
			`Invalid group name "${options.groupName}": must be 1..100 characters after trimming.`,
		);
	}
	const sourceKey = options.sourceKey.trim().toLowerCase();
	if (sourceKey.length === 0) {
		throw new Error("sourceKey must be a non-empty string.");
	}
	const lang = options.lang?.trim() || "en";

	if (rows.length < 2) {
		throw new Error(
			"Worksheet must contain a header row and at least one data row.",
		);
	}

	const headerRow = rows[0] ?? [];
	const headers = headerRow.map(normalizeHeader);

	const colWeek = findHeaderColumn(headers, ["week", "tuần", "tuan"]);
	const colSkill = findHeaderColumn(headers, ["skill", "kỹ năng", "ky nang"]);
	const colTopic = findHeaderColumn(headers, ["topic", "chủ đề", "chu de"]);
	const colWord = findHeaderColumn(headers, [
		"word / phrase",
		"word/phrase",
		"word / chunk",
		"word/chunk",
		"word",
		"từ vựng",
	]);
	const colIpa = findHeaderColumn(headers, ["ipa"]);
	const colMeaning = findHeaderColumn(headers, [
		"meaning (nghĩa)",
		"meaning",
		"vietnamese",
		"nghĩa tiếng việt",
		"nghĩa",
		"translation",
	]);
	const colPos = findHeaderColumn(headers, [
		"part of speech",
		"pos",
		"từ loại",
	]);
	const colExample = findHeaderColumn(headers, [
		"example",
		"ví dụ",
		"sentence",
	]);

	const missingCols: string[] = [];
	if (colWeek === -1) missingCols.push("Week");
	if (colSkill === -1) missingCols.push("Skill");
	if (colWord === -1) missingCols.push("Word / Phrase");
	if (colMeaning === -1) missingCols.push("Meaning (Nghĩa)");
	if (missingCols.length > 0) {
		throw new Error(
			`Worksheet is missing required column(s): ${missingCols.join(", ")}. Found headers: [${headerRow.join(", ")}]`,
		);
	}

	const normalizedGroupName = normalizeVocabLabel(groupName);
	const defaultGroupId = deterministicVocabUuid(
		`teacher-os:vocab-import:v1:group:${normalizedGroupName}`,
	);

	interface DeckDraft {
		id: string;
		week: number;
		skill: string;
		rawTopic: string;
		title: string;
		topic: string;
		words: ParsedImportWord[];
		seenWords: Set<string>;
	}

	const deckDrafts = new Map<string, DeckDraft>();
	const errors: string[] = [];
	let wordCount = 0;
	let chunkCount = 0;

	for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
		const row = rows[rowIdx] ?? [];
		const excelLine = rowIdx + 1;
		const cell = (idx: number) =>
			idx >= 0 ? (row[idx] ?? "").trim().normalize("NFC") : "";

		const rawWeek = cell(colWeek);
		const skill = cell(colSkill);
		const rawTopic = cell(colTopic);
		const word = cell(colWord);
		const ipa = cell(colIpa);
		const translation = cell(colMeaning);
		const pos = cell(colPos);
		const example = cell(colExample);

		if (!/^\d+$/.test(rawWeek)) {
			errors.push(
				`Row ${excelLine}: invalid Week "${rawWeek}" (expected positive integer).`,
			);
			continue;
		}
		const week = Number.parseInt(rawWeek, 10);
		if (week < 1 || week > 9999) {
			errors.push(
				`Row ${excelLine}: Week ${week} out of allowed range 1..9999.`,
			);
			continue;
		}
		if (skill.length === 0) {
			errors.push(`Row ${excelLine}: missing Skill.`);
			continue;
		}
		if (word.length === 0 || word.length > 200) {
			errors.push(`Row ${excelLine}: Word/Phrase must be 1..200 chars.`);
			continue;
		}
		if (translation.length === 0 || translation.length > 500) {
			errors.push(`Row ${excelLine}: Meaning must be 1..500 chars.`);
			continue;
		}
		if (ipa.length > 200) {
			errors.push(`Row ${excelLine}: IPA exceeds 200 chars.`);
			continue;
		}
		if (pos.length > 100) {
			errors.push(`Row ${excelLine}: Part of speech exceeds 100 chars.`);
			continue;
		}
		if (example.length > 1000) {
			errors.push(`Row ${excelLine}: Example exceeds 1000 chars.`);
			continue;
		}

		const normalizedSkill = normalizeVocabLabel(skill);
		const deckKey = `w${week}:${normalizedSkill}`;
		let draft = deckDrafts.get(deckKey);
		if (!draft) {
			const deckId = deterministicVocabUuid(
				`teacher-os:vocab-import:v1:deck:${sourceKey}:${normalizedGroupName}:${deckKey}`,
			);
			const { title, topic } = formatWeekSkillDeckMeta(week, skill, rawTopic);
			draft = {
				id: deckId,
				week,
				skill,
				rawTopic,
				title,
				topic,
				words: [],
				seenWords: new Set<string>(),
			};
			deckDrafts.set(deckKey, draft);
		} else if (
			rawTopic.length > 0 &&
			draft.rawTopic.length > 0 &&
			normalizeVocabLabel(rawTopic) !== normalizeVocabLabel(draft.rawTopic)
		) {
			errors.push(
				`Row ${excelLine}: conflicting Topic "${rawTopic}" inside Week ${week} / ${skill} (expected "${draft.rawTopic}").`,
			);
			continue;
		}

		const normalizedWord = normalizeVocabLabel(word);
		if (draft.seenWords.has(normalizedWord)) {
			errors.push(
				`Row ${excelLine}: duplicate word "${word}" in Week ${week} / ${skill}.`,
			);
			continue;
		}
		draft.seenWords.add(normalizedWord);

		const entryType = classifyVocabEntryType(word);
		if (entryType === "chunk") {
			chunkCount++;
		} else {
			wordCount++;
		}

		const wordId = deterministicVocabUuid(
			`teacher-os:vocab-import:v1:word:${draft.id}:${normalizedWord}`,
		);
		draft.words.push({
			id: wordId,
			word,
			entryType,
			ipa: ipa.length > 0 ? ipa : null,
			pos: pos.length > 0 ? pos : null,
			translation,
			example: example.length > 0 ? example : null,
			sortOrder: draft.words.length,
		});
	}

	if (errors.length > 0) {
		throw new Error(
			`Worksheet validation failed with ${errors.length} error(s):\n${errors.slice(0, 20).join("\n")}`,
		);
	}

	const decks: ParsedImportDeck[] = [...deckDrafts.values()].map((d) => ({
		id: d.id,
		week: d.week,
		skill: d.skill,
		rawTopic: d.rawTopic,
		title: d.title,
		lessonNumber: null,
		topic: d.topic,
		lang,
		words: d.words,
	}));

	if (decks.length === 0) {
		throw new Error(
			"Worksheet produced 0 vocabulary decks; refusing empty import.",
		);
	}

	for (const d of decks) {
		if (RESERVED_LIBRARY_ID_PREFIX_REGEX.test(d.id)) {
			throw new Error(
				`Internal error: deck ID "${d.id}" uses reserved library prefix.`,
			);
		}
		for (const w of d.words) {
			if (RESERVED_LIBRARY_ID_PREFIX_REGEX.test(w.id)) {
				throw new Error(
					`Internal error: word ID "${w.id}" uses reserved library prefix.`,
				);
			}
		}
	}

	return {
		sourceKey,
		groupName,
		normalizedGroupName,
		defaultGroupId,
		decks,
		stats: {
			deckCount: decks.length,
			totalWords: wordCount + chunkCount,
			wordCount,
			chunkCount,
		},
	};
}

export async function loadVocabImportDatasetFromXlsx(options: {
	filePath: string;
	sheetName: string;
	groupName: string;
	sourceKey?: string;
	lang?: string;
}): Promise<ParsedVocabImportDataset> {
	const rows = await readXlsxSheetRowsFromFile(
		options.filePath,
		options.sheetName,
	);
	const sourceKey =
		options.sourceKey?.trim() || deriveSourceKeyFromPath(options.filePath);
	return parseWeekSkillVocabSheet(rows, {
		groupName: options.groupName,
		sourceKey,
		lang: options.lang,
	});
}

function compareById(a: { id: string }, b: { id: string }): number {
	if (a.id < b.id) return -1;
	if (a.id > b.id) return 1;
	return 0;
}

function toNullableString(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	return String(value);
}

function toNullableNumber(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	const n = Number(value);
	return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toTimestampMs(value: unknown, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function parseGroupRow(
	row: Record<string, unknown>,
	nowMs: number,
): VocabGroupRow {
	const name = String(row.name ?? "");
	const normalized =
		row.normalized_name !== null && row.normalized_name !== undefined
			? String(row.normalized_name)
			: normalizeVocabLabel(name);
	return {
		id: String(row.id),
		orgId: String(row.org_id),
		name,
		normalizedName: normalized,
		createdAt: toTimestampMs(row.created_at, nowMs),
		updatedAt: toTimestampMs(row.updated_at, nowMs),
	};
}

function parseDeckRow(
	row: Record<string, unknown>,
	nowMs: number,
): VocabDeckRow {
	return {
		id: String(row.id),
		orgId: String(row.org_id),
		classId: toNullableString(row.class_id),
		groupId: toNullableString(row.group_id),
		title: String(row.title ?? ""),
		lessonNumber: toNullableNumber(row.lesson_number),
		topic: toNullableString(row.topic),
		lang: String(row.lang ?? "en"),
		sourceLibraryDeckId: toNullableString(row.source_library_deck_id),
		sourceDeckId: toNullableString(row.source_deck_id),
		createdAt: toTimestampMs(row.created_at, nowMs),
		updatedAt: toTimestampMs(row.updated_at, nowMs),
	};
}

function parseWordRow(
	row: Record<string, unknown>,
	nowMs: number,
): VocabWordRow {
	const rawEntryType = String(row.entry_type ?? "word");
	return {
		id: String(row.id),
		deckId: String(row.deck_id),
		word: String(row.word ?? ""),
		entryType: rawEntryType === "chunk" ? "chunk" : "word",
		ipa: toNullableString(row.ipa),
		pos: toNullableString(row.pos),
		translation: String(row.translation ?? ""),
		example: toNullableString(row.example),
		audioKey: toNullableString(row.audio_key),
		audioUrl: toNullableString(row.audio_url),
		sortOrder: toNullableNumber(row.sort_order) ?? 0,
		createdAt: toTimestampMs(row.created_at, nowMs),
		updatedAt: toTimestampMs(row.updated_at, nowMs),
	};
}

function isGroupContentEqual(a: VocabGroupRow, b: VocabGroupRow): boolean {
	return (
		a.id === b.id &&
		a.orgId === b.orgId &&
		a.name === b.name &&
		a.normalizedName === b.normalizedName
	);
}

function isDeckContentEqual(a: VocabDeckRow, b: VocabDeckRow): boolean {
	return (
		a.id === b.id &&
		a.orgId === b.orgId &&
		a.classId === b.classId &&
		a.groupId === b.groupId &&
		a.title === b.title &&
		a.lessonNumber === b.lessonNumber &&
		a.topic === b.topic &&
		a.lang === b.lang &&
		a.sourceLibraryDeckId === b.sourceLibraryDeckId &&
		a.sourceDeckId === b.sourceDeckId
	);
}

function isWordContentEqual(a: VocabWordRow, b: VocabWordRow): boolean {
	return (
		a.id === b.id &&
		a.deckId === b.deckId &&
		a.word === b.word &&
		a.entryType === b.entryType &&
		a.ipa === b.ipa &&
		a.pos === b.pos &&
		a.translation === b.translation &&
		a.example === b.example &&
		a.audioKey === b.audioKey &&
		a.audioUrl === b.audioUrl &&
		a.sortOrder === b.sortOrder
	);
}

export interface BuildImportVocabPlanResult {
	plan: PromoteVocabPlan;
	reusedExistingGroup: boolean;
	orderedDecks: ParsedImportDeck[];
}

/**
 * Builds an idempotent, preimage-backed `PromoteVocabPlan` for importing
 * `dataset` into `targetOrgId` on the target database.
 */
export async function buildImportVocabPlan(
	dataset: ParsedVocabImportDataset,
	targetRunner: VocabPromoteSqlRunner,
	options: {
		targetOrgId: string;
		nowMs?: number;
	},
): Promise<BuildImportVocabPlanResult> {
	const targetOrgId = options.targetOrgId.trim();
	if (!targetOrgId) {
		throw new Error("targetOrgId is required to build a vocab import plan.");
	}
	const nowMs = options.nowMs ?? Date.now();

	// 1. Verify target organization exists
	const orgRows = await targetRunner.queryRows(
		"SELECT id, name FROM organization WHERE id = ?",
		[targetOrgId],
	);
	if (orgRows.length === 0) {
		throw new Error(
			`Target organization "${targetOrgId}" does not exist in target D1.`,
		);
	}

	// 2. Resolve target vocab_group: reuse existing group in targetOrgId by normalized_name if present
	const existingOrgGroupsRows = await targetRunner.queryRows(
		"SELECT id, org_id, name, normalized_name, created_at, updated_at FROM vocab_group WHERE org_id = ? AND normalized_name = ?",
		[targetOrgId, dataset.normalizedGroupName],
	);
	const matchedExistingGroup = existingOrgGroupsRows[0]
		? parseGroupRow(existingOrgGroupsRows[0], nowMs)
		: null;

	const reusedExistingGroup = matchedExistingGroup !== null;
	const resolvedGroupId = matchedExistingGroup
		? matchedExistingGroup.id
		: dataset.defaultGroupId;

	const existingGroupByIdRows = await queryByIdsInChunks(
		targetRunner,
		"vocab_group",
		"id, org_id, name, normalized_name, created_at, updated_at",
		"id",
		[resolvedGroupId],
	);
	const existingGroupById = new Map<string, VocabGroupRow>();
	for (const r of existingGroupByIdRows) {
		const parsed = parseGroupRow(r, nowMs);
		existingGroupById.set(parsed.id, parsed);
	}
	const existingGroupRow = existingGroupById.get(resolvedGroupId);
	if (existingGroupRow && existingGroupRow.orgId !== targetOrgId) {
		throw new Error(
			`Safety gate: vocab_group id "${resolvedGroupId}" already exists under a different organization.`,
		);
	}

	const targetGroup: VocabGroupRow = {
		id: resolvedGroupId,
		orgId: targetOrgId,
		name: dataset.groupName,
		normalizedName: dataset.normalizedGroupName,
		createdAt: existingGroupRow ? existingGroupRow.createdAt : nowMs,
		updatedAt: nowMs,
	};
	const targetGroups: VocabGroupRow[] = [targetGroup];

	// 3. Inspect existing decks by deterministic ID + check for title collision within the same group
	const deckIds = dataset.decks.map((d) => d.id);
	const includedDeckIdSet = new Set(deckIds);
	const existingDeckRows = await queryByIdsInChunks(
		targetRunner,
		"vocab_deck",
		"id, org_id, class_id, group_id, title, lesson_number, topic, lang, source_library_deck_id, source_deck_id, created_at, updated_at",
		"id",
		deckIds,
	);
	const existingDeckById = new Map<string, VocabDeckRow>();
	for (const r of existingDeckRows) {
		const parsed = parseDeckRow(r, nowMs);
		existingDeckById.set(parsed.id, parsed);
	}

	for (const d of dataset.decks) {
		const existing = existingDeckById.get(d.id);
		if (existing && existing.orgId !== targetOrgId) {
			throw new Error(
				`Safety gate: vocab_deck id "${d.id}" ("${d.title}") already exists under a different organization.`,
			);
		}
		if (existing && existing.classId !== null) {
			throw new Error(
				`Safety gate: vocab_deck id "${d.id}" ("${d.title}") is bound to a class; refusing to convert into a bank deck.`,
			);
		}
	}

	if (reusedExistingGroup) {
		const existingDecksInGroupRows = await targetRunner.queryRows(
			"SELECT id, title FROM vocab_deck WHERE org_id = ? AND group_id = ? AND class_id IS NULL",
			[targetOrgId, resolvedGroupId],
		);
		const existingTitleToId = new Map<string, string>();
		for (const row of existingDecksInGroupRows) {
			const existingId = String(row.id);
			const normalizedTitle = normalizeVocabLabel(String(row.title ?? ""));
			if (!includedDeckIdSet.has(existingId)) {
				existingTitleToId.set(normalizedTitle, existingId);
			}
		}
		for (const d of dataset.decks) {
			const collisionId = existingTitleToId.get(normalizeVocabLabel(d.title));
			if (collisionId) {
				throw new Error(
					`Safety gate: vocab_deck "${d.title}" already exists in group "${dataset.groupName}" under a different ID. Resolve or rename the existing deck before importing to avoid duplicates.`,
				);
			}
		}
	}

	// 4. Inspect existing words by deterministic ID (and preserve any teacher-uploaded audio)
	const allParsedWords = dataset.decks.flatMap((d) =>
		d.words.map((w) => ({ deckId: d.id, word: w })),
	);
	const existingWordRows = await queryByIdsInChunks(
		targetRunner,
		"vocab_word",
		"id, deck_id, word, entry_type, ipa, pos, translation, example, audio_key, audio_url, sort_order, created_at, updated_at",
		"id",
		allParsedWords.map((item) => item.word.id),
	);
	const existingWordById = new Map<string, VocabWordRow>();
	for (const r of existingWordRows) {
		const parsed = parseWordRow(r, nowMs);
		existingWordById.set(parsed.id, parsed);
	}
	for (const { word } of allParsedWords) {
		const existing = existingWordById.get(word.id);
		if (existing && !includedDeckIdSet.has(existing.deckId)) {
			throw new Error(
				`Safety gate: vocab_word id "${word.id}" ("${word.word}") already exists under a different deck outside this import scope.`,
			);
		}
	}

	// 5. Build target rows preserving exact Week/Skill display order via created_at
	const targetDecks: VocabDeckRow[] = dataset.decks
		.map((d, deckIdx) => {
			const existing = existingDeckById.get(d.id);
			const createdAt = existing ? existing.createdAt : nowMs + deckIdx * 1000;
			return {
				id: d.id,
				orgId: targetOrgId,
				classId: null,
				groupId: resolvedGroupId,
				title: d.title,
				lessonNumber: d.lessonNumber,
				topic: d.topic,
				lang: d.lang,
				sourceLibraryDeckId: existing ? existing.sourceLibraryDeckId : null,
				sourceDeckId: existing ? existing.sourceDeckId : null,
				createdAt,
				updatedAt: nowMs,
			};
		})
		.sort(compareById);

	const deckCreatedAtById = new Map(
		targetDecks.map((d) => [d.id, d.createdAt]),
	);
	const targetWords: VocabWordRow[] = allParsedWords
		.map(({ deckId, word }) => {
			const existing = existingWordById.get(word.id);
			const deckCreatedAt = deckCreatedAtById.get(deckId) ?? nowMs;
			return {
				id: word.id,
				deckId,
				word: word.word,
				entryType: word.entryType,
				ipa: word.ipa,
				pos: word.pos,
				translation: word.translation,
				example: word.example,
				audioKey: existing ? existing.audioKey : null,
				audioUrl: existing ? existing.audioUrl : null,
				sortOrder: word.sortOrder,
				createdAt: existing
					? existing.createdAt
					: deckCreatedAt + word.sortOrder,
				updatedAt: nowMs,
			};
		})
		.sort(compareById);

	// 6. Compute diffs
	const computeDiff = <T extends { id: string }>(
		targets: readonly T[],
		existingMap: Map<string, T>,
		isEqual: (a: T, b: T) => boolean,
	): TablePromoteDiff => {
		let toInsert = 0;
		let toUpdate = 0;
		let unchanged = 0;
		for (const item of targets) {
			const prev = existingMap.get(item.id);
			if (!prev) {
				toInsert++;
			} else if (isEqual(prev, item)) {
				unchanged++;
			} else {
				toUpdate++;
			}
		}
		return { total: targets.length, toInsert, toUpdate, unchanged };
	};

	const diff = {
		group: computeDiff(targetGroups, existingGroupById, isGroupContentEqual),
		deck: computeDiff(targetDecks, existingDeckById, isDeckContentEqual),
		word: computeDiff(targetWords, existingWordById, isWordContentEqual),
	};

	// 7. Build parameterized idempotent UPSERT statements (<= 90 params/query for D1)
	const upsertStatements: SqlStatement[] = [
		...buildChunkedUpsertStatements({
			table: "vocab_group",
			columns: [
				"id",
				"org_id",
				"name",
				"normalized_name",
				"created_at",
				"updated_at",
			],
			updateColumns: ["org_id", "name", "normalized_name", "updated_at"],
			rows: targetGroups,
			toParams: (g) => [
				g.id,
				g.orgId,
				g.name,
				g.normalizedName,
				g.createdAt,
				g.updatedAt,
			],
		}),
		...buildChunkedUpsertStatements({
			table: "vocab_deck",
			columns: [
				"id",
				"org_id",
				"class_id",
				"group_id",
				"title",
				"lesson_number",
				"topic",
				"lang",
				"source_library_deck_id",
				"source_deck_id",
				"created_at",
				"updated_at",
			],
			updateColumns: [
				"org_id",
				"group_id",
				"title",
				"lesson_number",
				"topic",
				"lang",
				"source_library_deck_id",
				"source_deck_id",
				"updated_at",
			],
			rows: targetDecks,
			toParams: (d) => [
				d.id,
				d.orgId,
				d.classId,
				d.groupId,
				d.title,
				d.lessonNumber,
				d.topic,
				d.lang,
				d.sourceLibraryDeckId,
				d.sourceDeckId,
				d.createdAt,
				d.updatedAt,
			],
		}),
		...buildChunkedUpsertStatements({
			table: "vocab_word",
			columns: [
				"id",
				"deck_id",
				"word",
				"entry_type",
				"ipa",
				"pos",
				"translation",
				"example",
				"audio_key",
				"audio_url",
				"sort_order",
				"created_at",
				"updated_at",
			],
			updateColumns: [
				"deck_id",
				"word",
				"entry_type",
				"ipa",
				"pos",
				"translation",
				"example",
				"audio_key",
				"audio_url",
				"sort_order",
				"updated_at",
			],
			rows: targetWords,
			toParams: (w) => [
				w.id,
				w.deckId,
				w.word,
				w.entryType,
				w.ipa,
				w.pos,
				w.translation,
				w.example,
				w.audioKey,
				w.audioUrl,
				w.sortOrder,
				w.createdAt,
				w.updatedAt,
			],
		}),
	];

	// 8. Build exact rollback statements (restore modified parents -> delete new children)
	const rollbackStatements: SqlStatement[] = [];
	const insertedWordIds: string[] = [];
	const insertedDeckIds: string[] = [];
	const insertedGroupIds: string[] = [];

	for (const g of targetGroups) {
		const prev = existingGroupById.get(g.id);
		if (!prev) {
			insertedGroupIds.push(g.id);
		} else if (!isGroupContentEqual(prev, g)) {
			rollbackStatements.push({
				sql: "UPDATE vocab_group SET org_id = ?, name = ?, normalized_name = ?, updated_at = ? WHERE id = ?",
				args: [
					prev.orgId,
					prev.name,
					prev.normalizedName,
					prev.updatedAt,
					prev.id,
				],
			});
		}
	}
	for (const d of targetDecks) {
		const prev = existingDeckById.get(d.id);
		if (!prev) {
			insertedDeckIds.push(d.id);
		} else if (!isDeckContentEqual(prev, d)) {
			rollbackStatements.push({
				sql: "UPDATE vocab_deck SET org_id = ?, group_id = ?, title = ?, lesson_number = ?, topic = ?, lang = ?, source_library_deck_id = ?, source_deck_id = ?, updated_at = ? WHERE id = ?",
				args: [
					prev.orgId,
					prev.groupId,
					prev.title,
					prev.lessonNumber,
					prev.topic,
					prev.lang,
					prev.sourceLibraryDeckId,
					prev.sourceDeckId,
					prev.updatedAt,
					prev.id,
				],
			});
		}
	}
	for (const w of targetWords) {
		const prev = existingWordById.get(w.id);
		if (!prev) {
			insertedWordIds.push(w.id);
		} else if (!isWordContentEqual(prev, w)) {
			rollbackStatements.push({
				sql: "UPDATE vocab_word SET deck_id = ?, word = ?, entry_type = ?, ipa = ?, pos = ?, translation = ?, example = ?, audio_key = ?, audio_url = ?, sort_order = ?, updated_at = ? WHERE id = ?",
				args: [
					prev.deckId,
					prev.word,
					prev.entryType,
					prev.ipa,
					prev.pos,
					prev.translation,
					prev.example,
					prev.audioKey,
					prev.audioUrl,
					prev.sortOrder,
					prev.updatedAt,
					prev.id,
				],
			});
		}
	}

	const pushChunkedDeletes = (table: string, ids: readonly string[]) => {
		const chunkSize = 80;
		for (let i = 0; i < ids.length; i += chunkSize) {
			const chunk = ids.slice(i, i + chunkSize);
			rollbackStatements.push({
				sql: `DELETE FROM ${table} WHERE id IN (${chunk.map(() => "?").join(", ")})`,
				args: chunk,
			});
		}
	};
	pushChunkedDeletes("vocab_word", insertedWordIds);
	pushChunkedDeletes("vocab_deck", insertedDeckIds);
	pushChunkedDeletes("vocab_group", insertedGroupIds);

	const preimage: VocabPromotePreimage = {
		capturedAt: new Date(nowMs).toISOString(),
		targetOrgId,
		groups: [...existingGroupById.values()].sort(compareById),
		decks: [...existingDeckById.values()].sort(compareById),
		words: [...existingWordById.values()].sort(compareById),
	};

	const contentHash = computeVocabContentHash({
		groups: targetGroups,
		decks: targetDecks,
		words: targetWords,
	});

	return {
		plan: {
			targetOrgId,
			relocateFromOrgId: null,
			targetGroups,
			targetDecks,
			targetWords,
			audioTransfers: [],
			diff,
			preimage,
			upsertStatements,
			rollbackStatements,
			contentHash,
		},
		reusedExistingGroup,
		orderedDecks: dataset.decks,
	};
}
