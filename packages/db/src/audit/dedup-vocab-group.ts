/**
 * Pipeline audit & xoá bộ từ vựng bị trùng trong một `vocab_group`
 * (mặc định nhắm tới "Communication English Level 2") trên SQLite/LibSQL
 * hoặc Cloudflare D1 (staging / production).
 *
 * Nguyên tắc an toàn:
 * - Mặc định read-only (`dry-run`); ghi dữ liệu chỉ qua `applyDedupVocabGroupPlan`
 *   sau khi đã chụp preimage JSON backup + sinh rollback SQL chính xác.
 * - Chỉ quét bank decks (`class_id IS NULL`) trong đúng `(org_id, group_id)` đích;
 *   không bao giờ xoá class decks (`class_id IS NOT NULL`) hay `vocab_group` hay
 *   `vocab_review_log`.
 * - Trong mỗi cụm trùng tiêu đề chuẩn hoá (`trim + NFC + collapse whitespace + lowercase vi`),
 *   ưu tiên giữ lại bản có:
 *     1. Tổng hoạt động học viên (`vocab_card` + `vocab_suggestion`) cao nhất
 *     2. Số deck khác clone từ nó (`source_deck_id`) cao nhất
 *     3. Số lượng từ vựng (`vocab_word`) nhiều nhất
 *     4. Số từ có audio R2 (`audio_key`) nhiều nhất
 *     5. Tạo sớm nhất (`created_at ASC, id ASC`)
 * - Fail-closed cho từng bản ứng viên xoá: bỏ qua (không xoá) nếu có bất kỳ dấu hiệu nào:
 *     - Có `vocab_card` (học viên đã học)
 *     - Có `vocab_suggestion` (đã gợi ý cho học viên)
 *     - Tập từ vựng khác bản giữ lại (`wordsSignature` khác nhau)
 *     - Có `audio_key` riêng mà bản giữ lại không có
 *     - Khác `lang` hoặc xung đột `lesson_number` (cả hai đều khác NULL nhưng khác giá trị)
 * - Tự động repoint `vocab_deck.source_deck_id` trên các deck sống sót đang trỏ vào
 *   bản trùng bị xoá sang bản giữ lại (hoặc NULL nếu chính bản giữ lại tự trỏ vào bản trùng).
 * - Trước khi thực thi DELETE, chạy live preflight check lại `vocab_card` và
 *   `vocab_suggestion` để chặn race condition phát sinh sau bước dry-run.
 * - Không xoá R2 audio objects để giữ khả năng rollback SQL toàn vẹn 100%.
 */
import { createHash } from "node:crypto";
import {
	createD1VocabPromoteRunner,
	createLibsqlVocabPromoteRunner,
	normalizeVocabLabel,
	resolveTargetTeacherOrgId,
	resolveVocabD1Database,
	type SqlStatement,
	type VocabDeckRow,
	type VocabGroupRow,
	type VocabPromoteSqlRunner,
	type VocabWordRow,
} from "../seed/promote-vocab";
import { redactSensitive } from "./orphan-materials";

export type DedupSkipReason =
	| "has_vocab_cards"
	| "has_vocab_suggestions"
	| "word_content_mismatch"
	| "has_unique_audio"
	| "lang_mismatch"
	| "lesson_number_mismatch";

export interface DedupDeckInspection {
	deck: VocabDeckRow;
	normalizedTitle: string;
	words: VocabWordRow[];
	wordCount: number;
	audioKeyCount: number;
	cardCount: number;
	suggestionCount: number;
	cloneRefCount: number;
	wordsSignature: string;
	coreWordsSignature: string;
}

export interface DedupCandidateDecision {
	inspection: DedupDeckInspection;
	action: "delete" | "skip";
	skipReasons: DedupSkipReason[];
}

export interface DedupDuplicateCluster {
	normalizedTitle: string;
	keeper: DedupDeckInspection;
	candidates: DedupCandidateDecision[];
	deletableCount: number;
	skippedCount: number;
}

export interface RepointDeckRecord {
	deckId: string;
	orgId: string;
	classId: string | null;
	title: string;
	fromSourceDeckId: string;
	toSourceDeckId: string | null;
	previousUpdatedAt: number;
}

export interface DedupVocabGroupAuditResult {
	targetOrgId: string;
	group: VocabGroupRow;
	totalBankDecks: number;
	totalClassDecks: number;
	uniqueTitleCount: number;
	clusters: DedupDuplicateCluster[];
	repointedDecks: RepointDeckRecord[];
	summary: {
		duplicateClusters: number;
		totalExtraDecks: number;
		deletableDecks: number;
		deletableWords: number;
		skippedDecks: number;
		repointedDecks: number;
	};
}

export interface DedupVocabGroupPreimage {
	capturedAt: string;
	targetOrgId: string;
	group: VocabGroupRow;
	keepers: Array<{
		id: string;
		title: string;
		lessonNumber: number | null;
		wordCount: number;
		wordsSignature: string;
	}>;
	deletedDecks: VocabDeckRow[];
	deletedWords: VocabWordRow[];
	repointedDecks: RepointDeckRecord[];
	skippedDecks: Array<{
		id: string;
		title: string;
		wordCount: number;
		cardCount: number;
		suggestionCount: number;
		skipReasons: DedupSkipReason[];
	}>;
}

export interface DedupVocabGroupPlan {
	audit: DedupVocabGroupAuditResult;
	nowMs: number;
	keeperIds: string[];
	deletableDeckIds: string[];
	deletableWordIds: string[];
	preimage: DedupVocabGroupPreimage;
	applyStatements: SqlStatement[];
	rollbackStatements: SqlStatement[];
	consumed?: boolean;
}

export interface VerifyDedupVocabGroupResult {
	ok: boolean;
	remainingDeletedDecks: number;
	remainingDeletedWords: number;
	remainingKeepers: number;
	expectedKeepers: number;
	remainingClassDecks: number;
	expectedClassDecks: number;
	remainingDeletableAfterReaudit: number;
	mismatches: string[];
}

export function normalizeDeckTitleForDedup(value: string): string {
	return normalizeVocabLabel(value).replace(/\s+/g, " ");
}

function normalizeCompareText(value: string): string {
	return value.trim().normalize("NFC").replace(/\s+/g, " ");
}

function normalizeOptionalCompareText(value: string | null): string | null {
	if (value === null) return null;
	const normalized = normalizeCompareText(value);
	return normalized.length > 0 ? normalized : null;
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
	const entryType: "word" | "chunk" =
		rawEntryType === "chunk" ? "chunk" : "word";
	return {
		id: String(row.id),
		deckId: String(row.deck_id),
		word: String(row.word ?? ""),
		entryType,
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

function compareById(a: { id: string }, b: { id: string }): number {
	if (a.id < b.id) return -1;
	if (a.id > b.id) return 1;
	return 0;
}

function buildChunkedUpsertStatements<T>(options: {
	table: string;
	columns: readonly string[];
	updateColumns: readonly string[];
	rows: readonly T[];
	toParams: (row: T) => unknown[];
	maxParamsPerStatement?: number;
}): SqlStatement[] {
	if (options.rows.length === 0) return [];
	const maxParams = options.maxParamsPerStatement ?? 90;
	const colsPerRow = options.columns.length;
	const rowsPerChunk = Math.max(1, Math.floor(maxParams / colsPerRow));
	const rowPlaceholder = `(${options.columns.map(() => "?").join(", ")})`;
	const updateClause = options.updateColumns
		.map((col) => `${col} = excluded.${col}`)
		.join(", ");

	const statements: SqlStatement[] = [];
	for (let i = 0; i < options.rows.length; i += rowsPerChunk) {
		const chunk = options.rows.slice(i, i + rowsPerChunk);
		const placeholders = chunk.map(() => rowPlaceholder).join(", ");
		const args: unknown[] = [];
		for (const row of chunk) {
			args.push(...options.toParams(row));
		}
		statements.push({
			sql: `INSERT INTO ${options.table} (${options.columns.join(", ")}) VALUES ${placeholders} ON CONFLICT(id) DO UPDATE SET ${updateClause}`,
			args,
		});
	}
	return statements;
}

/**
 * Hash toàn bộ nội dung học thuật của tập từ vựng trong một deck (không phụ thuộc
 * vào UUID hay `created_at` hay `sort_order`). Dùng để đảm bảo bản định xoá
 * không chứa thông tin từ vựng khác bản giữ lại.
 */
export function computeDeckWordsSignature(words: readonly VocabWordRow[]): {
	wordsSignature: string;
	coreWordsSignature: string;
} {
	const fullEntries = words
		.map((w) =>
			JSON.stringify([
				normalizeCompareText(w.word),
				w.entryType,
				normalizeOptionalCompareText(w.ipa),
				normalizeOptionalCompareText(w.pos),
				normalizeCompareText(w.translation),
				normalizeOptionalCompareText(w.example),
				normalizeOptionalCompareText(w.audioUrl),
			]),
		)
		.sort();

	const coreEntries = words
		.map((w) =>
			JSON.stringify([
				normalizeVocabLabel(w.word),
				normalizeVocabLabel(w.translation),
			]),
		)
		.sort();

	const fullHash = createHash("sha256");
	for (const entry of fullEntries) {
		fullHash.update(`${entry}\n`);
	}

	const coreHash = createHash("sha256");
	for (const entry of coreEntries) {
		coreHash.update(`${entry}\n`);
	}

	return {
		wordsSignature: fullHash.digest("hex"),
		coreWordsSignature: coreHash.digest("hex"),
	};
}

/**
 * Thứ tự ưu tiên giữ lại bản tốt nhất trong một cụm trùng tiêu đề:
 * 1. Hoạt động học viên (`cardCount + suggestionCount`) cao hơn
 * 2. Số deck khác clone từ nó (`cloneRefCount`) cao hơn
 * 3. Số lượng từ vựng (`wordCount`) nhiều hơn
 * 4. Số audio R2 (`audioKeyCount`) nhiều hơn
 * 5. Tạo sớm nhất (`createdAt ASC`, tie-break `id ASC`)
 */
export function compareKeeperPriority(
	a: DedupDeckInspection,
	b: DedupDeckInspection,
): number {
	const activityA = a.cardCount + a.suggestionCount;
	const activityB = b.cardCount + b.suggestionCount;
	if (activityA !== activityB) return activityB - activityA;

	if (a.cloneRefCount !== b.cloneRefCount) {
		return b.cloneRefCount - a.cloneRefCount;
	}

	if (a.wordCount !== b.wordCount) {
		return b.wordCount - a.wordCount;
	}

	if (a.audioKeyCount !== b.audioKeyCount) {
		return b.audioKeyCount - a.audioKeyCount;
	}

	if (a.deck.createdAt !== b.deck.createdAt) {
		return a.deck.createdAt - b.deck.createdAt;
	}

	return compareById(a.deck, b.deck);
}

async function queryRowsInIdChunks(
	runner: VocabPromoteSqlRunner,
	ids: readonly string[],
	buildSql: (placeholders: string) => string,
	prefixArgs: readonly unknown[] = [],
	chunkSize = 75,
): Promise<Array<Record<string, unknown>>> {
	const uniqueIds = [...new Set(ids)];
	if (uniqueIds.length === 0) return [];
	const rows: Array<Record<string, unknown>> = [];
	for (let i = 0; i < uniqueIds.length; i += chunkSize) {
		const chunk = uniqueIds.slice(i, i + chunkSize);
		const placeholders = chunk.map(() => "?").join(", ");
		const part = await runner.queryRows(buildSql(placeholders), [
			...prefixArgs,
			...chunk,
		]);
		rows.push(...part);
	}
	return rows;
}

function hasUniqueAudioKey(
	candidate: DedupDeckInspection,
	keeper: DedupDeckInspection,
): boolean {
	const keeperAudioKeys = new Set<string>();
	for (const w of keeper.words) {
		const key = w.audioKey?.trim();
		if (key) keeperAudioKeys.add(key);
	}
	for (const w of candidate.words) {
		const key = w.audioKey?.trim();
		if (key && !keeperAudioKeys.has(key)) {
			return true;
		}
	}
	return false;
}

function evaluateCandidateSkipReasons(
	candidate: DedupDeckInspection,
	keeper: DedupDeckInspection,
): DedupSkipReason[] {
	const reasons: DedupSkipReason[] = [];
	if (candidate.cardCount > 0) {
		reasons.push("has_vocab_cards");
	}
	if (candidate.suggestionCount > 0) {
		reasons.push("has_vocab_suggestions");
	}
	if (candidate.wordsSignature !== keeper.wordsSignature) {
		reasons.push("word_content_mismatch");
	}
	if (hasUniqueAudioKey(candidate, keeper)) {
		reasons.push("has_unique_audio");
	}
	if (
		normalizeVocabLabel(candidate.deck.lang) !==
		normalizeVocabLabel(keeper.deck.lang)
	) {
		reasons.push("lang_mismatch");
	}
	if (
		candidate.deck.lessonNumber !== null &&
		keeper.deck.lessonNumber !== null &&
		candidate.deck.lessonNumber !== keeper.deck.lessonNumber
	) {
		reasons.push("lesson_number_mismatch");
	}
	return reasons;
}

/**
 * Quét read-only các bộ từ vựng bank (`class_id IS NULL`) trong một `vocab_group`
 * thuộc `targetOrgId`, gom trùng theo tiêu đề chuẩn hoá và phân loại `delete` / `skip`
 * theo các quy tắc fail-closed.
 */
export async function auditDedupVocabGroup(
	runner: VocabPromoteSqlRunner,
	options: {
		targetOrgId: string;
		groupName?: string;
		groupId?: string;
		nowMs?: number;
	},
): Promise<DedupVocabGroupAuditResult> {
	const targetOrgId = options.targetOrgId.trim();
	if (!targetOrgId) {
		throw new Error("targetOrgId is required for vocab group dedup audit.");
	}
	const wantedGroupName = options.groupName?.trim() ?? "";
	const wantedGroupId = options.groupId?.trim() ?? "";
	if (!wantedGroupName && !wantedGroupId) {
		throw new Error("Either groupName or groupId is required.");
	}

	const nowMs = options.nowMs ?? Date.now();

	// 1. Verify target organization exists
	const orgRows = await runner.queryRows(
		"SELECT id FROM organization WHERE id = ?",
		[targetOrgId],
	);
	if (orgRows.length === 0) {
		throw new Error(
			"Target organization does not exist in the target database.",
		);
	}

	// 2. Resolve target vocab_group in targetOrgId
	const allOrgGroupRows = await runner.queryRows(
		"SELECT id, org_id, name, normalized_name, created_at, updated_at FROM vocab_group WHERE org_id = ? ORDER BY created_at ASC, id ASC",
		[targetOrgId],
	);
	const allOrgGroups = allOrgGroupRows.map((r) => parseGroupRow(r, nowMs));

	let targetGroup: VocabGroupRow | undefined;
	if (wantedGroupId) {
		targetGroup = allOrgGroups.find((g) => g.id === wantedGroupId);
		if (!targetGroup) {
			throw new Error(
				`Target vocab_group ID not found in target organization (available groups: ${allOrgGroups.length}).`,
			);
		}
	} else {
		const normalizedWanted = normalizeVocabLabel(wantedGroupName);
		const matches = allOrgGroups.filter(
			(g) =>
				g.normalizedName === normalizedWanted ||
				normalizeVocabLabel(g.name) === normalizedWanted,
		);
		if (matches.length === 0) {
			const availableNames = allOrgGroups.map((g) => `"${g.name}"`).join(", ");
			throw new Error(
				`No vocab_group matching "${wantedGroupName}" found in target organization (available: ${availableNames || "none"}).`,
			);
		}
		if (matches.length > 1) {
			throw new Error(
				`Ambiguous vocab_group name "${wantedGroupName}": found ${matches.length} matching groups in target organization; pass --group-id to disambiguate.`,
			);
		}
		targetGroup = matches[0];
	}

	if (!targetGroup) {
		throw new Error("Failed to resolve target vocab_group.");
	}

	// 3. Count class decks in this group (never deleted; reported & verified intact)
	const classDeckCountRows = await runner.queryRows(
		"SELECT COUNT(*) AS cnt FROM vocab_deck WHERE org_id = ? AND group_id = ? AND class_id IS NOT NULL",
		[targetOrgId, targetGroup.id],
	);
	const totalClassDecks = Number(classDeckCountRows[0]?.cnt ?? 0);

	// 4. Load all bank decks (class_id IS NULL) in targetGroup
	const bankDeckRows = await runner.queryRows(
		`SELECT id, org_id, class_id, group_id, title, lesson_number, topic, lang,
		        source_library_deck_id, source_deck_id, created_at, updated_at
		   FROM vocab_deck
		  WHERE org_id = ? AND group_id = ? AND class_id IS NULL
		  ORDER BY lesson_number IS NULL ASC, lesson_number ASC, created_at ASC, id ASC`,
		[targetOrgId, targetGroup.id],
	);
	const bankDecks = bankDeckRows.map((r) => parseDeckRow(r, nowMs));
	const bankDeckIds = bankDecks.map((d) => d.id);

	// 5. Load all words, vocab_card counts, vocab_suggestion counts, and clone references
	const [wordRows, cardCountRows, suggestionCountRows, cloneRefRows] =
		await Promise.all([
			queryRowsInIdChunks(
				runner,
				bankDeckIds,
				(ph) =>
					`SELECT id, deck_id, word, entry_type, ipa, pos, translation, example, audio_key, audio_url, sort_order, created_at, updated_at
					   FROM vocab_word
					  WHERE deck_id IN (${ph})
					  ORDER BY sort_order ASC, created_at ASC, id ASC`,
			),
			queryRowsInIdChunks(
				runner,
				bankDeckIds,
				(ph) =>
					`SELECT w.deck_id AS deck_id, COUNT(c.id) AS card_count
					   FROM vocab_word w
					   INNER JOIN vocab_card c ON c.word_id = w.id
					  WHERE w.deck_id IN (${ph})
					    AND c.word_id NOT LIKE 'libword-%'
					  GROUP BY w.deck_id`,
			),
			queryRowsInIdChunks(
				runner,
				bankDeckIds,
				(ph) =>
					`SELECT deck_id, COUNT(*) AS suggestion_count
					   FROM vocab_suggestion
					  WHERE deck_id IN (${ph})
					  GROUP BY deck_id`,
			),
			queryRowsInIdChunks(
				runner,
				bankDeckIds,
				(ph) =>
					`SELECT id, org_id, class_id, title, source_deck_id, updated_at
					   FROM vocab_deck
					  WHERE org_id = ? AND source_deck_id IN (${ph})
					  ORDER BY created_at ASC, id ASC`,
				[targetOrgId],
			),
		]);

	const wordsByDeckId = new Map<string, VocabWordRow[]>();
	for (const r of wordRows) {
		const word = parseWordRow(r, nowMs);
		const list = wordsByDeckId.get(word.deckId) ?? [];
		list.push(word);
		wordsByDeckId.set(word.deckId, list);
	}

	const cardCountByDeckId = new Map<string, number>();
	for (const r of cardCountRows) {
		cardCountByDeckId.set(String(r.deck_id), Number(r.card_count ?? 0));
	}

	const suggestionCountByDeckId = new Map<string, number>();
	for (const r of suggestionCountRows) {
		suggestionCountByDeckId.set(
			String(r.deck_id),
			Number(r.suggestion_count ?? 0),
		);
	}

	const cloneRefCountBySourceDeckId = new Map<string, number>();
	const cloneRefsBySourceDeckId = new Map<
		string,
		Array<{
			id: string;
			orgId: string;
			classId: string | null;
			title: string;
			sourceDeckId: string;
			updatedAt: number;
		}>
	>();
	for (const r of cloneRefRows) {
		const sourceDeckId = String(r.source_deck_id ?? "");
		if (!sourceDeckId) continue;
		cloneRefCountBySourceDeckId.set(
			sourceDeckId,
			(cloneRefCountBySourceDeckId.get(sourceDeckId) ?? 0) + 1,
		);
		const bucket = cloneRefsBySourceDeckId.get(sourceDeckId) ?? [];
		bucket.push({
			id: String(r.id),
			orgId: String(r.org_id),
			classId: toNullableString(r.class_id),
			title: String(r.title ?? ""),
			sourceDeckId,
			updatedAt: toTimestampMs(r.updated_at, nowMs),
		});
		cloneRefsBySourceDeckId.set(sourceDeckId, bucket);
	}

	// 6. Group bank decks by normalizedTitle
	const decksByNormalizedTitle = new Map<string, DedupDeckInspection[]>();
	for (const deck of bankDecks) {
		const normalizedTitle = normalizeDeckTitleForDedup(deck.title);
		const words = (wordsByDeckId.get(deck.id) ?? []).sort(compareById);
		const audioKeyCount = words.filter(
			(w) => w.audioKey !== null && w.audioKey.trim().length > 0,
		).length;
		const { wordsSignature, coreWordsSignature } =
			computeDeckWordsSignature(words);

		const inspection: DedupDeckInspection = {
			deck,
			normalizedTitle,
			words,
			wordCount: words.length,
			audioKeyCount,
			cardCount: cardCountByDeckId.get(deck.id) ?? 0,
			suggestionCount: suggestionCountByDeckId.get(deck.id) ?? 0,
			cloneRefCount: cloneRefCountBySourceDeckId.get(deck.id) ?? 0,
			wordsSignature,
			coreWordsSignature,
		};

		const group = decksByNormalizedTitle.get(normalizedTitle) ?? [];
		group.push(inspection);
		decksByNormalizedTitle.set(normalizedTitle, group);
	}

	// 7. Build duplicate clusters and determine keeper vs delete/skip
	const clusters: DedupDuplicateCluster[] = [];
	const deletableDeckToKeeperId = new Map<string, string>();
	let totalExtraDecks = 0;
	let deletableDecks = 0;
	let deletableWords = 0;
	let skippedDecks = 0;

	const sortedTitleEntries = [...decksByNormalizedTitle.entries()].sort(
		([, aList], [, bList]) => {
			const aFirst = aList[0]?.deck;
			const bFirst = bList[0]?.deck;
			const aLesson = aFirst?.lessonNumber ?? Number.MAX_SAFE_INTEGER;
			const bLesson = bFirst?.lessonNumber ?? Number.MAX_SAFE_INTEGER;
			if (aLesson !== bLesson) return aLesson - bLesson;
			return (aFirst?.title ?? "").localeCompare(bFirst?.title ?? "");
		},
	);

	for (const [normalizedTitle, inspections] of sortedTitleEntries) {
		if (inspections.length < 2) continue;

		const prioritized = [...inspections].sort(compareKeeperPriority);
		const keeper = prioritized[0];
		if (!keeper) continue;

		const candidates: DedupCandidateDecision[] = [];
		let clusterDeletable = 0;
		let clusterSkipped = 0;

		for (const candidate of prioritized.slice(1)) {
			totalExtraDecks++;
			const skipReasons = evaluateCandidateSkipReasons(candidate, keeper);
			if (skipReasons.length === 0) {
				candidates.push({
					inspection: candidate,
					action: "delete",
					skipReasons: [],
				});
				deletableDeckToKeeperId.set(candidate.deck.id, keeper.deck.id);
				clusterDeletable++;
				deletableDecks++;
				deletableWords += candidate.wordCount;
			} else {
				candidates.push({
					inspection: candidate,
					action: "skip",
					skipReasons,
				});
				clusterSkipped++;
				skippedDecks++;
			}
		}

		clusters.push({
			normalizedTitle,
			keeper,
			candidates,
			deletableCount: clusterDeletable,
			skippedCount: clusterSkipped,
		});
	}

	// 8. Compute surviving decks whose source_deck_id references a deletable duplicate
	const repointedDecks: RepointDeckRecord[] = [];
	const seenRepointDeckIds = new Set<string>();
	for (const [deletableId, keeperId] of deletableDeckToKeeperId.entries()) {
		const refs = cloneRefsBySourceDeckId.get(deletableId) ?? [];
		for (const ref of refs) {
			// Skip decks that are themselves scheduled for deletion
			if (deletableDeckToKeeperId.has(ref.id)) continue;
			if (seenRepointDeckIds.has(ref.id)) continue;
			seenRepointDeckIds.add(ref.id);

			// Avoid self-referential source_deck_id if the keeper itself was cloned from the deleted duplicate
			const targetSourceId = ref.id === keeperId ? null : keeperId;
			repointedDecks.push({
				deckId: ref.id,
				orgId: ref.orgId,
				classId: ref.classId,
				title: ref.title,
				fromSourceDeckId: deletableId,
				toSourceDeckId: targetSourceId,
				previousUpdatedAt: ref.updatedAt,
			});
		}
	}
	repointedDecks.sort((a, b) => a.deckId.localeCompare(b.deckId));

	return {
		targetOrgId,
		group: targetGroup,
		totalBankDecks: bankDecks.length,
		totalClassDecks,
		uniqueTitleCount: decksByNormalizedTitle.size,
		clusters,
		repointedDecks,
		summary: {
			duplicateClusters: clusters.length,
			totalExtraDecks,
			deletableDecks,
			deletableWords,
			skippedDecks,
			repointedDecks: repointedDecks.length,
		},
	};
}

/**
 * Xây dựng kế hoạch xoá trùng kèm preimage JSON + apply SQL + rollback SQL chính xác.
 */
export function buildDedupVocabGroupPlan(
	audit: DedupVocabGroupAuditResult,
	options?: { nowMs?: number },
): DedupVocabGroupPlan {
	const nowMs = options?.nowMs ?? Date.now();
	const deletedDecks: VocabDeckRow[] = [];
	const deletedWords: VocabWordRow[] = [];
	const skippedDecks: DedupVocabGroupPreimage["skippedDecks"] = [];
	const keepers: DedupVocabGroupPreimage["keepers"] = [];

	for (const cluster of audit.clusters) {
		keepers.push({
			id: cluster.keeper.deck.id,
			title: cluster.keeper.deck.title,
			lessonNumber: cluster.keeper.deck.lessonNumber,
			wordCount: cluster.keeper.wordCount,
			wordsSignature: cluster.keeper.wordsSignature,
		});
		for (const decision of cluster.candidates) {
			if (decision.action === "delete") {
				deletedDecks.push(decision.inspection.deck);
				deletedWords.push(...decision.inspection.words);
			} else {
				skippedDecks.push({
					id: decision.inspection.deck.id,
					title: decision.inspection.deck.title,
					wordCount: decision.inspection.wordCount,
					cardCount: decision.inspection.cardCount,
					suggestionCount: decision.inspection.suggestionCount,
					skipReasons: decision.skipReasons,
				});
			}
		}
	}

	deletedDecks.sort(compareById);
	deletedWords.sort(compareById);
	keepers.sort(compareById);
	skippedDecks.sort(compareById);

	const deletableDeckIds = deletedDecks.map((d) => d.id);
	const deletableWordIds = deletedWords.map((w) => w.id);
	const keeperIds = keepers.map((k) => k.id);

	// 1. Build apply statements:
	//    (a) Repoint surviving decks' source_deck_id -> keeper (or NULL if self)
	//    (b) Defensive DELETE vocab_suggestion for deletable decks
	//    (c) DELETE vocab_word for deletable decks
	//    (d) DELETE vocab_deck scoped strictly to (org_id, group_id, class_id IS NULL, id IN ...)
	const applyStatements: SqlStatement[] = [];

	for (const repoint of audit.repointedDecks) {
		applyStatements.push({
			sql: "UPDATE vocab_deck SET source_deck_id = ?, updated_at = ? WHERE id = ? AND org_id = ? AND source_deck_id = ?",
			args: [
				repoint.toSourceDeckId,
				nowMs,
				repoint.deckId,
				repoint.orgId,
				repoint.fromSourceDeckId,
			],
		});
	}

	const deleteChunkSize = 70;
	for (let i = 0; i < deletableDeckIds.length; i += deleteChunkSize) {
		const chunk = deletableDeckIds.slice(i, i + deleteChunkSize);
		const ph = chunk.map(() => "?").join(", ");
		applyStatements.push({
			sql: `DELETE FROM vocab_suggestion WHERE deck_id IN (${ph})`,
			args: chunk,
		});
	}
	for (let i = 0; i < deletableDeckIds.length; i += deleteChunkSize) {
		const chunk = deletableDeckIds.slice(i, i + deleteChunkSize);
		const ph = chunk.map(() => "?").join(", ");
		applyStatements.push({
			sql: `DELETE FROM vocab_word WHERE deck_id IN (${ph})`,
			args: chunk,
		});
	}
	for (let i = 0; i < deletableDeckIds.length; i += deleteChunkSize) {
		const chunk = deletableDeckIds.slice(i, i + deleteChunkSize);
		const ph = chunk.map(() => "?").join(", ");
		applyStatements.push({
			sql: `DELETE FROM vocab_deck WHERE org_id = ? AND group_id = ? AND class_id IS NULL AND id IN (${ph})`,
			args: [audit.targetOrgId, audit.group.id, ...chunk],
		});
	}

	// 2. Build exact rollback statements (strict parent -> child -> restore repoint order):
	const rollbackStatements: SqlStatement[] = [
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
			rows: deletedDecks,
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
				"created_at",
				"updated_at",
			],
			rows: deletedWords,
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
		...audit.repointedDecks.map((repoint) => ({
			sql: "UPDATE vocab_deck SET source_deck_id = ?, updated_at = ? WHERE id = ? AND org_id = ?",
			args: [
				repoint.fromSourceDeckId,
				repoint.previousUpdatedAt,
				repoint.deckId,
				repoint.orgId,
			],
		})),
	];

	const preimage: DedupVocabGroupPreimage = {
		capturedAt: new Date(nowMs).toISOString(),
		targetOrgId: audit.targetOrgId,
		group: audit.group,
		keepers,
		deletedDecks,
		deletedWords,
		repointedDecks: audit.repointedDecks,
		skippedDecks,
	};

	return {
		audit,
		nowMs,
		keeperIds,
		deletableDeckIds,
		deletableWordIds,
		preimage,
		applyStatements,
		rollbackStatements,
	};
}

/**
 * Thực thi kế hoạch xoá trùng với live preflight safety check trước khi ghi.
 */
export async function applyDedupVocabGroupPlan(
	runner: VocabPromoteSqlRunner,
	plan: DedupVocabGroupPlan,
): Promise<{ statementsExecuted: number }> {
	if (plan.consumed) {
		throw new Error(
			"DedupVocabGroupPlan has already been applied; rebuild from a fresh audit before retrying.",
		);
	}
	plan.consumed = true;

	if (plan.deletableDeckIds.length === 0) {
		return { statementsExecuted: 0 };
	}

	// Live preflight check right before writing: abort fail-closed if any target
	// duplicate acquired vocab_card, vocab_suggestion, or became a class deck.
	const [liveDeckRows, liveCardRows, liveSuggestionRows] = await Promise.all([
		queryRowsInIdChunks(
			runner,
			plan.deletableDeckIds,
			(ph) =>
				`SELECT id, org_id, group_id, class_id FROM vocab_deck WHERE id IN (${ph})`,
		),
		queryRowsInIdChunks(
			runner,
			plan.deletableDeckIds,
			(ph) =>
				`SELECT w.deck_id AS deck_id, COUNT(c.id) AS card_count
				   FROM vocab_word w
				   INNER JOIN vocab_card c ON c.word_id = w.id
				  WHERE w.deck_id IN (${ph})
				    AND c.word_id NOT LIKE 'libword-%'
				  GROUP BY w.deck_id`,
		),
		queryRowsInIdChunks(
			runner,
			plan.deletableDeckIds,
			(ph) =>
				`SELECT deck_id, COUNT(*) AS suggestion_count
				   FROM vocab_suggestion
				  WHERE deck_id IN (${ph})
				  GROUP BY deck_id`,
		),
	]);

	for (const row of liveDeckRows) {
		if (
			String(row.org_id) !== plan.audit.targetOrgId ||
			String(row.group_id ?? "") !== plan.audit.group.id ||
			row.class_id !== null
		) {
			throw new Error(
				"Preflight safety gate failed: a target duplicate deck changed org, group, or became class-bound since audit; aborting with no writes.",
			);
		}
	}

	const liveCardTotal = liveCardRows.reduce(
		(acc, r) => acc + Number(r.card_count ?? 0),
		0,
	);
	if (liveCardTotal > 0) {
		throw new Error(
			`Preflight safety gate failed: ${liveCardTotal} vocab_card row(s) now exist on decks scheduled for deletion; aborting with no writes.`,
		);
	}

	const liveSuggestionTotal = liveSuggestionRows.reduce(
		(acc, r) => acc + Number(r.suggestion_count ?? 0),
		0,
	);
	if (liveSuggestionTotal > 0) {
		throw new Error(
			`Preflight safety gate failed: ${liveSuggestionTotal} vocab_suggestion row(s) now exist on decks scheduled for deletion; aborting with no writes.`,
		);
	}

	await runner.run(plan.applyStatements);
	return { statementsExecuted: plan.applyStatements.length };
}

/**
 * Xác thực trạng thái DB sau khi thực thi xoá trùng.
 */
export async function verifyDedupVocabGroup(
	runner: VocabPromoteSqlRunner,
	plan: DedupVocabGroupPlan,
): Promise<VerifyDedupVocabGroupResult> {
	const nowMs = Date.now();
	const mismatches: string[] = [];

	const [
		remainingDeckRows,
		remainingWordRows,
		keeperDeckRows,
		keeperWordRows,
		classDeckCountRows,
		repointedRows,
	] = await Promise.all([
		queryRowsInIdChunks(
			runner,
			plan.deletableDeckIds,
			(ph) => `SELECT id FROM vocab_deck WHERE id IN (${ph})`,
		),
		queryRowsInIdChunks(
			runner,
			plan.deletableDeckIds,
			(ph) => `SELECT id FROM vocab_word WHERE deck_id IN (${ph})`,
		),
		queryRowsInIdChunks(
			runner,
			plan.keeperIds,
			(ph) =>
				`SELECT id, org_id, group_id, class_id, title FROM vocab_deck WHERE id IN (${ph})`,
		),
		queryRowsInIdChunks(
			runner,
			plan.keeperIds,
			(ph) =>
				`SELECT id, deck_id, word, entry_type, ipa, pos, translation, example, audio_key, audio_url, sort_order, created_at, updated_at
				   FROM vocab_word
				  WHERE deck_id IN (${ph})`,
		),
		runner.queryRows(
			"SELECT COUNT(*) AS cnt FROM vocab_deck WHERE org_id = ? AND group_id = ? AND class_id IS NOT NULL",
			[plan.audit.targetOrgId, plan.audit.group.id],
		),
		queryRowsInIdChunks(
			runner,
			plan.audit.repointedDecks.map((r) => r.deckId),
			(ph) => `SELECT id, source_deck_id FROM vocab_deck WHERE id IN (${ph})`,
		),
	]);

	if (remainingDeckRows.length > 0) {
		mismatches.push(
			`${remainingDeckRows.length} deleted vocab_deck row(s) still exist.`,
		);
	}
	if (remainingWordRows.length > 0) {
		mismatches.push(
			`${remainingWordRows.length} vocab_word row(s) belonging to deleted decks still exist.`,
		);
	}
	if (keeperDeckRows.length !== plan.keeperIds.length) {
		mismatches.push(
			`Keeper deck count mismatch: actual=${keeperDeckRows.length}, expected=${plan.keeperIds.length}.`,
		);
	}

	// Verify keeper words content parity remained untouched
	const actualKeeperWordsByDeckId = new Map<string, VocabWordRow[]>();
	for (const r of keeperWordRows) {
		const w = parseWordRow(r, nowMs);
		const list = actualKeeperWordsByDeckId.get(w.deckId) ?? [];
		list.push(w);
		actualKeeperWordsByDeckId.set(w.deckId, list);
	}
	for (const expectedKeeper of plan.preimage.keepers) {
		const actualWords = actualKeeperWordsByDeckId.get(expectedKeeper.id) ?? [];
		const { wordsSignature } = computeDeckWordsSignature(actualWords);
		if (
			actualWords.length !== expectedKeeper.wordCount ||
			wordsSignature !== expectedKeeper.wordsSignature
		) {
			mismatches.push(
				`Keeper deck "${expectedKeeper.title}" words changed unexpectedly (actual=${actualWords.length}, expected=${expectedKeeper.wordCount}).`,
			);
		}
	}

	const remainingClassDecks = Number(classDeckCountRows[0]?.cnt ?? 0);
	if (remainingClassDecks !== plan.audit.totalClassDecks) {
		mismatches.push(
			`Class deck count changed: actual=${remainingClassDecks}, expected=${plan.audit.totalClassDecks}.`,
		);
	}

	// Verify all repointed decks point to expected targetSourceDeckId
	const actualSourceByDeckId = new Map<string, string | null>();
	for (const r of repointedRows) {
		actualSourceByDeckId.set(String(r.id), toNullableString(r.source_deck_id));
	}
	for (const expectedRepoint of plan.audit.repointedDecks) {
		const actual = actualSourceByDeckId.get(expectedRepoint.deckId) ?? null;
		if (actual !== expectedRepoint.toSourceDeckId) {
			mismatches.push(
				`Repointed deck "${expectedRepoint.title}" source_deck_id mismatch after apply.`,
			);
		}
	}

	// Re-audit to confirm idempotency (0 deletable decks remain)
	const reaudit = await auditDedupVocabGroup(runner, {
		targetOrgId: plan.audit.targetOrgId,
		groupId: plan.audit.group.id,
	});
	if (reaudit.summary.deletableDecks !== 0) {
		mismatches.push(
			`Re-audit still found ${reaudit.summary.deletableDecks} deletable duplicate deck(s).`,
		);
	}

	return {
		ok: mismatches.length === 0,
		remainingDeletedDecks: remainingDeckRows.length,
		remainingDeletedWords: remainingWordRows.length,
		remainingKeepers: keeperDeckRows.length,
		expectedKeepers: plan.keeperIds.length,
		remainingClassDecks,
		expectedClassDecks: plan.audit.totalClassDecks,
		remainingDeletableAfterReaudit: reaudit.summary.deletableDecks,
		mismatches,
	};
}

function sqlLiteral(value: unknown): string {
	if (value === null || value === undefined) return "NULL";
	if (typeof value === "number") {
		return Number.isFinite(value) ? String(Math.trunc(value)) : "0";
	}
	return `'${String(value).replace(/'/g, "''")}'`;
}

export function formatDedupRollbackSql(plan: DedupVocabGroupPlan): string {
	const lines = [
		"-- Rollback SQL for vocab_group duplicate deck removal",
		`-- Captured at: ${plan.preimage.capturedAt}`,
		`-- Group: "${plan.audit.group.name}"`,
		`-- Scope: deletedDecks=${plan.preimage.deletedDecks.length}, deletedWords=${plan.preimage.deletedWords.length}, repointedDecks=${plan.preimage.repointedDecks.length}`,
		"-- Note: does not touch vocab_review_log or R2 objects.",
		"",
	];
	for (const stmt of plan.rollbackStatements) {
		const args = stmt.args ?? [];
		let argIdx = 0;
		const rendered = stmt.sql.replace(/\?/g, () => {
			const val = args[argIdx];
			argIdx++;
			return sqlLiteral(val);
		});
		lines.push(`${rendered};`);
	}
	lines.push("");
	return lines.join("\n");
}

function formatTimestampIso(ms: number): string {
	return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : "unknown";
}

export function formatDedupAuditReport(
	audit: DedupVocabGroupAuditResult,
	options?: { publicLogs?: boolean },
): string {
	const publicLogs = options?.publicLogs ?? false;
	const groupIdPart = publicLogs
		? ""
		: ` [groupId=${audit.group.id}, orgId=${audit.targetOrgId}]`;
	const lines: string[] = [
		`=== Vocab Group Duplicate Audit: "${audit.group.name}"${groupIdPart} ===`,
		`Inventory: bankDecks=${audit.totalBankDecks}, uniqueTitles=${audit.uniqueTitleCount}, classDecks=${audit.totalClassDecks} (untouched)`,
		`Duplicates: clusters=${audit.summary.duplicateClusters}, extraDecks=${audit.summary.totalExtraDecks}, deletableDecks=${audit.summary.deletableDecks}, deletableWords=${audit.summary.deletableWords}, skippedDecks=${audit.summary.skippedDecks}, repointedDecks=${audit.summary.repointedDecks}`,
	];

	if (audit.clusters.length === 0) {
		lines.push(
			"Result: không tìm thấy bộ từ vựng bị trùng nào trong nhóm này.",
		);
		return lines.join("\n");
	}

	lines.push("");
	lines.push("-- Duplicate Clusters --");
	for (const [clusterIdx, cluster] of audit.clusters.entries()) {
		const lessonPart =
			cluster.keeper.deck.lessonNumber !== null
				? `L${cluster.keeper.deck.lessonNumber} `
				: "";
		const totalInCluster = 1 + cluster.candidates.length;
		lines.push(
			`  [${clusterIdx + 1}] ${lessonPart}"${cluster.keeper.deck.title}" — copies=${totalInCluster} (keep=1, delete=${cluster.deletableCount}, skip=${cluster.skippedCount})`,
		);

		const keeperIdPart = publicLogs ? "" : ` id=${cluster.keeper.deck.id}`;
		lines.push(
			`      KEEP:${keeperIdPart} words=${cluster.keeper.wordCount}, audio=${cluster.keeper.audioKeyCount}, cards=${cluster.keeper.cardCount}, suggestions=${cluster.keeper.suggestionCount}, clones=${cluster.keeper.cloneRefCount}, created=${formatTimestampIso(cluster.keeper.deck.createdAt)}`,
		);

		for (const [candIdx, decision] of cluster.candidates.entries()) {
			const c = decision.inspection;
			const tag =
				decision.action === "delete"
					? "DELETE"
					: `SKIP[${decision.skipReasons.join(",")}]`;
			const candIdPart = publicLogs
				? ` copy#${candIdx + 1}`
				: ` id=${c.deck.id}`;
			const lessonDiffPart =
				c.deck.lessonNumber !== cluster.keeper.deck.lessonNumber
					? `, lesson=${c.deck.lessonNumber ?? "null"}`
					: "";
			const coreNote =
				decision.skipReasons.includes("word_content_mismatch") &&
				c.coreWordsSignature === cluster.keeper.coreWordsSignature
					? " (same word+translation, metadata differs)"
					: "";
			lines.push(
				`      ${tag}:${candIdPart} words=${c.wordCount}, audio=${c.audioKeyCount}, cards=${c.cardCount}, suggestions=${c.suggestionCount}, clones=${c.cloneRefCount}${lessonDiffPart}, created=${formatTimestampIso(c.deck.createdAt)}${coreNote}`,
			);
		}
	}

	if (audit.repointedDecks.length > 0) {
		lines.push("");
		lines.push(
			`-- Repointed source_deck_id (${audit.repointedDecks.length}) --`,
		);
		for (const [idx, r] of audit.repointedDecks.entries()) {
			const kind = r.classId !== null ? "class-deck" : "bank-deck";
			const detail = publicLogs
				? `#${idx + 1} (${kind}) "${r.title}" -> ${r.toSourceDeckId ? "keeper" : "NULL"}`
				: `id=${r.deckId} (${kind}) "${r.title}": ${r.fromSourceDeckId} -> ${r.toSourceDeckId ?? "NULL"}`;
			lines.push(`  - ${detail}`);
		}
	}

	return lines.join("\n");
}

export {
	createD1VocabPromoteRunner,
	createLibsqlVocabPromoteRunner,
	redactSensitive,
	resolveTargetTeacherOrgId,
	resolveVocabD1Database,
};
