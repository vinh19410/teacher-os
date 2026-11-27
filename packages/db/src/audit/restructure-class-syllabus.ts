/**
 * Pipeline audit & tái cấu trúc giáo trình của một lớp học (`syllabus` bản copy
 * `class_id = <classId>`) về đúng 2 chặng (`syllabus_module`), giữ nguyên toàn bộ
 * `syllabus_lesson.id`, thứ tự phẳng buổi 1..N, tiến độ `status`, liên kết tài liệu
 * `syllabus_lesson_material`, và ánh xạ buổi dạy `lesson` / `class_session`.
 *
 * Nguyên tắc an toàn:
 * - Mặc định read-only (`dry-run`); không ghi bất kỳ dòng nào nếu chưa có `spec`
 *   hợp lệ và chạy qua `applyRestructureClassSyllabusPlan`.
 * - Chỉ thao tác trên bản copy giáo trình của đúng một lớp (`syllabus.class_id =
 *   cls.id`), TUYỆT ĐỐI không sửa template dùng chung (`syllabus.class_id IS NULL`)
 *   hay lớp học khác.
 * - KHÔNG bao giờ xoá `syllabus_lesson`: toàn bộ buổi học hiện có được `UPDATE`
 *   chuyển `module_id` sang 2 chặng đích (kèm `position`, `title`, `objectives`,
 *   `kind` nếu chỉ định) TRƯỚC khi xoá các `syllabus_module` dư thừa.
 * - Trước khi chạy `DELETE FROM syllabus_module`, kiểm tra live rằng không còn bất
 *   kỳ dòng `syllabus_lesson` nào trỏ vào các module sắp xoá (chặn tuyệt đối
 *   `ON DELETE CASCADE` ngoài ý muốn lên `syllabus_lesson` / `syllabus_lesson_material`).
 * - Trước khi ghi, chạy live preflight check đối chiếu nguyên trạng module/lesson/
 *   material links để chặn race condition phát sinh sau bước `dry-run`.
 * - Chụp preimage JSON đầy đủ + sinh rollback SQL khôi phục chính xác 100% theo
 *   thứ tự FK trước khi apply, và đối chiếu SHA-256 content parity sau khi apply.
 */
import { createHash, randomUUID } from "node:crypto";
import {
	createD1VocabPromoteRunner,
	createLibsqlVocabPromoteRunner,
	normalizeVocabLabel,
	resolveTargetTeacherOrgId,
	resolveVocabD1Database,
	type SqlStatement,
	type VocabPromoteSqlRunner,
} from "../seed/promote-vocab";
import { redactSensitive } from "./orphan-materials";

export type RestructureSqlRunner = VocabPromoteSqlRunner;

const REQUIRED_TABLES = [
	"class",
	"syllabus",
	"syllabus_module",
	"syllabus_lesson",
	"syllabus_lesson_material",
	"lesson",
	"class_session",
] as const;

const MODULE_TITLE_MAX = 500;
const FIELD_TEXT_MAX = 10_000;
const VALID_LESSON_KINDS = new Set(["lesson", "midterm", "final"]);
const ID_CHUNK_SIZE = 70;

export type LessonTitleMode =
	| "keep"
	| "module-title"
	| "lesson-colon-module"
	| "module-suffix-if-multi";

export type ObjectivesMode =
	| "keep"
	| "prepend-module-description"
	| "append-module-description";

export type LessonKind = "lesson" | "midterm" | "final";

export interface RestructureStageSpec {
	title: string;
	description?: string;
	/** Danh sách số thứ tự buổi học phẳng (1-based) thuộc chặng này. */
	lessonOrdinals?: number[];
	/** Khoảng số thứ tự buổi học phẳng (1-based, bao gồm cả 2 đầu [start, end]). */
	lessonRange?: [number, number];
}

export interface LessonOverrideSpec {
	/** Số thứ tự buổi học phẳng (1-based). */
	ordinal: number;
	title?: string;
	objectives?: string;
	kind?: LessonKind;
}

export interface RestructureClassSyllabusSpec {
	/** Optimistic concurrency guard: số module hiện tại kỳ vọng. */
	expectedCurrentModules?: number;
	/** Optimistic concurrency guard: số buổi giáo trình hiện tại kỳ vọng. */
	expectedCurrentLessons?: number;
	/** Optimistic concurrency guard: tên giáo trình hiện tại kỳ vọng. */
	expectedSyllabusName?: string;
	/** Bắt buộc đúng 2 chặng đích. */
	stages: [RestructureStageSpec, RestructureStageSpec];
	/** Cách xây dựng tiêu đề buổi học mới khi hạ nội dung module cũ xuống buổi học. */
	lessonTitleMode: LessonTitleMode;
	/** Cách xử lý mô tả module cũ đối với mục tiêu buổi học (`objectives`). */
	objectivesMode?: ObjectivesMode;
	/** Ghi đè thủ công cho từng buổi học cụ thể (1-based ordinal). */
	lessonOverrides?: LessonOverrideSpec[];
	/** Đồng bộ `syllabus.total_lessons` theo tổng số buổi thực tế (mặc định: true). */
	syncTotalLessons?: boolean;
}

export interface ClassRowSummary {
	id: string;
	orgId: string;
	name: string;
	level: string;
	type: string;
	mode: string;
	status: string;
	schedulingMode: string;
	syllabusId: string | null;
	sessionsTotal: number;
	sessionsDone: number;
}

export interface SyllabusRow {
	id: string;
	orgId: string;
	name: string;
	level: string;
	type: string;
	skills: string;
	description: string;
	totalLessons: number;
	classId: string | null;
	sourceTemplateId: string | null;
	createdAt: number;
}

export interface SyllabusModuleRow {
	id: string;
	orgId: string;
	syllabusId: string;
	title: string;
	description: string;
	position: number;
	createdAt: number;
}

export interface SyllabusLessonRow {
	id: string;
	orgId: string;
	moduleId: string;
	title: string;
	objectives: string;
	materials: string;
	kind: string;
	status: string;
	position: number;
	createdAt: number;
}

export interface SyllabusLessonMaterialRow {
	orgId: string;
	syllabusLessonId: string;
	materialId: string;
	position: number;
	createdAt: number;
}

export interface FlatLessonAuditEntry {
	/** Số thứ tự phẳng 1-based (buổi N ↔ bài N). */
	ordinal: number;
	lesson: SyllabusLessonRow;
	moduleIndex: number;
	moduleId: string;
	moduleTitle: string;
	moduleDescription: string;
	moduleLessonCount: number;
	lessonIndexInModule: number;
	bankMaterialCount: number;
}

export interface AuditedModuleEntry {
	moduleIndex: number;
	module: SyllabusModuleRow;
	lessons: FlatLessonAuditEntry[];
}

export interface SourceTemplateAuditSummary {
	id: string;
	exists: boolean;
	name: string | null;
	moduleCount: number;
	lessonCount: number;
}

export interface ScheduledSessionAuditSummary {
	totalLessonRows: number;
	distinctDatedSessions: number;
	teachingDatesCount: number;
	holidayDatesCount: number;
	nonEmptyLessonTopicRows: number;
	classSessionCount: number;
	nonEmptyClassSessionTopics: number;
}

export interface ClassSyllabusAuditResult {
	targetOrgId: string;
	matchedVia:
		| "class_id"
		| "exact_normalized"
		| "punctuation_normalized"
		| "token_subset";
	classInfo: ClassRowSummary;
	pointerMatchesCopy: boolean;
	syllabus: SyllabusRow;
	sourceTemplate: SourceTemplateAuditSummary | null;
	modules: AuditedModuleEntry[];
	flatLessons: FlatLessonAuditEntry[];
	materialLinks: SyllabusLessonMaterialRow[];
	scheduledSessions: ScheduledSessionAuditSummary;
	stateHash: string;
}

export interface PlannedTargetModule {
	id: string;
	action: "reuse" | "insert";
	stageIndex: 0 | 1;
	title: string;
	description: string;
	position: 0 | 1;
	createdAt: number;
	previousModule: SyllabusModuleRow | null;
}

export interface PlannedLessonChange {
	ordinal: number;
	lessonId: string;
	fromModuleId: string;
	fromModuleIndex: number;
	fromModuleTitle: string;
	fromPosition: number;
	fromTitle: string;
	fromObjectives: string;
	fromKind: string;
	toStageIndex: 0 | 1;
	toModuleId: string;
	toPosition: number;
	toTitle: string;
	toObjectives: string;
	toKind: string;
	status: string;
	materials: string;
	createdAt: number;
	bankMaterialCount: number;
}

export interface RestructureClassSyllabusPreimage {
	capturedAt: string;
	targetOrgId: string;
	classId: string;
	classSyllabusIdPointer: string | null;
	syllabus: SyllabusRow;
	modules: SyllabusModuleRow[];
	lessons: SyllabusLessonRow[];
	materialLinks: SyllabusLessonMaterialRow[];
	stateHash: string;
}

export interface RestructureClassSyllabusPlan {
	audit: ClassSyllabusAuditResult;
	spec: RestructureClassSyllabusSpec;
	targetModules: [PlannedTargetModule, PlannedTargetModule];
	deletedModules: SyllabusModuleRow[];
	lessonChanges: PlannedLessonChange[];
	updateTotalLessonsTo: number | null;
	preimage: RestructureClassSyllabusPreimage;
	/** Statements cập nhật/chèn 2 module đích + re-parent toàn bộ lesson (chạy TRƯỚC delete). */
	upsertAndMoveStatements: SqlStatement[];
	/** Statements xoá các module cũ dư thừa (CHỈ chạy sau live guard xác nhận 0 lesson còn trỏ vào). */
	deleteObsoleteModuleStatements: SqlStatement[];
	/** Statement cập nhật `syllabus.total_lessons` nếu cần. */
	syllabusMetaStatements: SqlStatement[];
	/** Toàn bộ rollback SQL theo đúng thứ tự FK. */
	rollbackStatements: SqlStatement[];
	expectedHash: string;
	consumed?: boolean;
}

export interface VerifyRestructureClassSyllabusResult {
	ok: boolean;
	moduleCount: number;
	lessonCount: number;
	materialLinkCount: number;
	expectedMaterialLinkCount: number;
	totalLessonsColumn: number;
	expectedTotalLessonsColumn: number;
	flatOrderPreserved: boolean;
	expectedHash: string;
	actualHash: string;
	mismatches: string[];
}

export function normalizeClassName(value: string): string {
	return normalizeVocabLabel(value).replace(/\s+/g, " ");
}

export function normalizeClassNamePunctuationFree(value: string): string {
	return normalizeVocabLabel(value)
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim()
		.replace(/\s+/g, " ");
}

function toNullableString(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	return String(value);
}

function toInt(value: unknown, fallback = 0): number {
	const n = Number(value);
	return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function collapseSingleLine(value: string, maxLen = 180): string {
	const clean = value.replace(/\s+/g, " ").trim();
	if (clean.length <= maxLen) return clean;
	return `${clean.slice(0, maxLen - 1)}…`;
}

async function queryRowsInIdChunks(
	runner: RestructureSqlRunner,
	ids: readonly string[],
	sqlBuilder: (placeholders: string) => string,
	extraPrefixParams: readonly unknown[] = [],
): Promise<Array<Record<string, unknown>>> {
	if (ids.length === 0) return [];
	const uniqueIds = [...new Set(ids)];
	const out: Array<Record<string, unknown>> = [];
	for (let i = 0; i < uniqueIds.length; i += ID_CHUNK_SIZE) {
		const chunk = uniqueIds.slice(i, i + ID_CHUNK_SIZE);
		const placeholders = chunk.map(() => "?").join(", ");
		const rows = await runner.queryRows(sqlBuilder(placeholders), [
			...extraPrefixParams,
			...chunk,
		]);
		out.push(...rows);
	}
	return out;
}

async function assertRequiredTablesExist(
	runner: RestructureSqlRunner,
): Promise<void> {
	const placeholders = REQUIRED_TABLES.map(() => "?").join(", ");
	const rows = await runner.queryRows(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`,
		[...REQUIRED_TABLES],
	);
	const present = new Set(rows.map((r) => String(r.name)));
	const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
	if (missing.length > 0) {
		throw new Error(
			`Target database is missing required curriculum table(s): ${missing.join(", ")}`,
		);
	}
}

export function computeCurriculumStateHash(input: {
	syllabusId: string;
	totalLessons: number;
	modules: ReadonlyArray<{
		id: string;
		title: string;
		description: string;
		position: number;
	}>;
	lessons: ReadonlyArray<{
		id: string;
		moduleId: string;
		title: string;
		objectives: string;
		materials: string;
		kind: string;
		status: string;
		position: number;
	}>;
	materialLinks: ReadonlyArray<{
		syllabusLessonId: string;
		materialId: string;
		position: number;
	}>;
}): string {
	const sortedLinks = [...input.materialLinks].sort((a, b) => {
		if (a.syllabusLessonId !== b.syllabusLessonId) {
			return a.syllabusLessonId < b.syllabusLessonId ? -1 : 1;
		}
		if (a.position !== b.position) return a.position - b.position;
		return a.materialId < b.materialId
			? -1
			: a.materialId > b.materialId
				? 1
				: 0;
	});

	const canonical = {
		syllabusId: input.syllabusId,
		totalLessons: input.totalLessons,
		modules: input.modules.map((m) => ({
			id: m.id,
			title: m.title,
			description: m.description,
			position: m.position,
		})),
		lessons: input.lessons.map((l) => ({
			id: l.id,
			moduleId: l.moduleId,
			title: l.title,
			objectives: l.objectives,
			materials: l.materials,
			kind: l.kind,
			status: l.status,
			position: l.position,
		})),
		materialLinks: sortedLinks.map((lnk) => ({
			syllabusLessonId: lnk.syllabusLessonId,
			materialId: lnk.materialId,
			position: lnk.position,
		})),
	};
	return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function parseClassRow(row: Record<string, unknown>): ClassRowSummary {
	return {
		id: String(row.id),
		orgId: String(row.org_id),
		name: String(row.name ?? ""),
		level: String(row.level ?? ""),
		type: String(row.type ?? ""),
		mode: String(row.mode ?? ""),
		status: String(row.status ?? ""),
		schedulingMode: String(row.scheduling_mode ?? ""),
		syllabusId: toNullableString(row.syllabus_id),
		sessionsTotal: toInt(row.sessions_total, 0),
		sessionsDone: toInt(row.sessions_done, 0),
	};
}

function parseSyllabusRow(row: Record<string, unknown>): SyllabusRow {
	return {
		id: String(row.id),
		orgId: String(row.org_id),
		name: String(row.name ?? ""),
		level: String(row.level ?? ""),
		type: String(row.type ?? ""),
		skills: String(row.skills ?? "[]"),
		description: String(row.description ?? ""),
		totalLessons: toInt(row.total_lessons, 0),
		classId: toNullableString(row.class_id),
		sourceTemplateId: toNullableString(row.source_template_id),
		createdAt: toInt(row.created_at, 0),
	};
}

function parseModuleRow(row: Record<string, unknown>): SyllabusModuleRow {
	return {
		id: String(row.id),
		orgId: String(row.org_id),
		syllabusId: String(row.syllabus_id),
		title: String(row.title ?? ""),
		description: String(row.description ?? ""),
		position: toInt(row.position, 0),
		createdAt: toInt(row.created_at, 0),
	};
}

function parseLessonRow(row: Record<string, unknown>): SyllabusLessonRow {
	return {
		id: String(row.id),
		orgId: String(row.org_id),
		moduleId: String(row.module_id),
		title: String(row.title ?? ""),
		objectives: String(row.objectives ?? ""),
		materials: String(row.materials ?? ""),
		kind: String(row.kind ?? "lesson"),
		status: String(row.status ?? "upcoming"),
		position: toInt(row.position, 0),
		createdAt: toInt(row.created_at, 0),
	};
}

function parseMaterialLinkRow(
	row: Record<string, unknown>,
): SyllabusLessonMaterialRow {
	return {
		orgId: String(row.org_id),
		syllabusLessonId: String(row.syllabus_lesson_id),
		materialId: String(row.material_id),
		position: toInt(row.position, 0),
		createdAt: toInt(row.created_at, 0),
	};
}

async function resolveTargetClass(
	runner: RestructureSqlRunner,
	options: {
		targetOrgId: string;
		classId?: string;
		className?: string;
	},
): Promise<{
	classInfo: ClassRowSummary;
	matchedVia: ClassSyllabusAuditResult["matchedVia"];
}> {
	const classId = options.classId?.trim();
	const className = options.className?.trim();
	if (!classId && !className) {
		throw new Error("Specify either --class <name> or --class-id <id>.");
	}

	if (classId) {
		const rows = await runner.queryRows(
			`SELECT id, org_id, name, level, type, mode, status, scheduling_mode, syllabus_id, sessions_total, sessions_done
			   FROM class
			  WHERE id = ? AND org_id = ?`,
			[classId, options.targetOrgId],
		);
		if (rows.length === 0) {
			throw new Error("Target class ID not found in target organization.");
		}
		return {
			classInfo: parseClassRow(rows[0] as Record<string, unknown>),
			matchedVia: "class_id",
		};
	}

	const allRows = await runner.queryRows(
		`SELECT id, org_id, name, level, type, mode, status, scheduling_mode, syllabus_id, sessions_total, sessions_done
		   FROM class
		  WHERE org_id = ?
		  ORDER BY created_at ASC, id ASC`,
		[options.targetOrgId],
	);
	const allClasses = allRows.map(parseClassRow);

	const queryExact = normalizeClassName(className ?? "");
	const exactMatches = allClasses.filter(
		(c) => normalizeClassName(c.name) === queryExact,
	);
	if (exactMatches.length === 1) {
		return {
			classInfo: exactMatches[0] as ClassRowSummary,
			matchedVia: "exact_normalized",
		};
	}
	if (exactMatches.length > 1) {
		throw new Error(
			`Ambiguous exact match: ${exactMatches.length} classes match the given name in target organization. Pass --class-id to disambiguate.`,
		);
	}

	const queryPunctFree = normalizeClassNamePunctuationFree(className ?? "");
	const punctMatches = allClasses.filter(
		(c) => normalizeClassNamePunctuationFree(c.name) === queryPunctFree,
	);
	if (punctMatches.length === 1) {
		return {
			classInfo: punctMatches[0] as ClassRowSummary,
			matchedVia: "punctuation_normalized",
		};
	}
	if (punctMatches.length > 1) {
		throw new Error(
			`Ambiguous punctuation-free match: ${punctMatches.length} classes match in target organization. Pass --class-id to disambiguate.`,
		);
	}

	const queryTokens = queryPunctFree.split(" ").filter((t) => t.length > 0);
	const tokenMatches =
		queryTokens.length > 0
			? allClasses.filter((c) => {
					const classTokens = new Set(
						normalizeClassNamePunctuationFree(c.name).split(" "),
					);
					return queryTokens.every((t) => classTokens.has(t));
				})
			: [];
	if (tokenMatches.length === 1) {
		return {
			classInfo: tokenMatches[0] as ClassRowSummary,
			matchedVia: "token_subset",
		};
	}
	if (tokenMatches.length > 1) {
		throw new Error(
			`Ambiguous token match: ${tokenMatches.length} classes contain all query tokens in target organization. Pass --class-id to disambiguate.`,
		);
	}

	throw new Error(
		`Class not found in target organization (searched ${allClasses.length} class(es)).`,
	);
}

/**
 * Audit read-only toàn bộ cây giáo trình (`syllabus`, `syllabus_module`,
 * `syllabus_lesson`, `syllabus_lesson_material`) và bối cảnh buổi học thực tế
 * (`lesson`, `class_session`) của đúng một lớp học.
 */
export async function auditClassSyllabus(
	runner: RestructureSqlRunner,
	options: {
		targetOrgId: string;
		classId?: string;
		className?: string;
	},
): Promise<ClassSyllabusAuditResult> {
	await assertRequiredTablesExist(runner);

	const { classInfo, matchedVia } = await resolveTargetClass(runner, options);

	const syllabusRows = await runner.queryRows(
		`SELECT id, org_id, name, level, type, skills, description, total_lessons, class_id, source_template_id, created_at
		   FROM syllabus
		  WHERE class_id = ? AND org_id = ?`,
		[classInfo.id, options.targetOrgId],
	);
	if (syllabusRows.length === 0) {
		throw new Error(
			"Target class does not have its own curriculum copy (syllabus.class_id = class.id).",
		);
	}
	if (syllabusRows.length > 1) {
		throw new Error(
			`Invariant violation: found ${syllabusRows.length} syllabus copies for target class.`,
		);
	}

	const syllabusRow = parseSyllabusRow(
		syllabusRows[0] as Record<string, unknown>,
	);
	if (syllabusRow.classId !== classInfo.id) {
		throw new Error(
			"Safety invariant violation: resolved syllabus row is not owned by target class.",
		);
	}

	const [moduleRowsRaw, scheduledLessonRowsRaw, classSessionRowsRaw] =
		await Promise.all([
			runner.queryRows(
				`SELECT id, org_id, syllabus_id, title, description, position, created_at
				   FROM syllabus_module
				  WHERE syllabus_id = ? AND org_id = ?
				  ORDER BY position ASC, created_at ASC, id ASC`,
				[syllabusRow.id, options.targetOrgId],
			),
			runner.queryRows(
				`SELECT date, status, topic
				   FROM lesson
				  WHERE org_id = ? AND class_id = ?`,
				[options.targetOrgId, classInfo.id],
			),
			runner.queryRows(
				`SELECT date, topic
				   FROM class_session
				  WHERE org_id = ? AND class_id = ?`,
				[options.targetOrgId, classInfo.id],
			),
		]);

	const modulesRaw = moduleRowsRaw.map(parseModuleRow);
	const moduleIds = modulesRaw.map((m) => m.id);

	const lessonRowsRaw =
		moduleIds.length > 0
			? await queryRowsInIdChunks(
					runner,
					moduleIds,
					(ph) =>
						`SELECT id, org_id, module_id, title, objectives, materials, kind, status, position, created_at
						   FROM syllabus_lesson
						  WHERE org_id = ? AND module_id IN (${ph})
						  ORDER BY position ASC, created_at ASC, id ASC`,
					[options.targetOrgId],
				)
			: [];
	const lessonsRaw = lessonRowsRaw.map(parseLessonRow);

	const lessonsByModuleId = new Map<string, SyllabusLessonRow[]>();
	for (const l of lessonsRaw) {
		const list = lessonsByModuleId.get(l.moduleId) ?? [];
		list.push(l);
		lessonsByModuleId.set(l.moduleId, list);
	}
	// Đảm bảo sort chuẩn bên trong từng module kể cả khi query chạy qua nhiều chunk.
	for (const list of lessonsByModuleId.values()) {
		list.sort((a, b) => {
			if (a.position !== b.position) return a.position - b.position;
			if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
			return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
		});
	}

	const allLessonIds = lessonsRaw.map((l) => l.id);
	const materialLinkRowsRaw =
		allLessonIds.length > 0
			? await queryRowsInIdChunks(
					runner,
					allLessonIds,
					(ph) =>
						`SELECT org_id, syllabus_lesson_id, material_id, position, created_at
						   FROM syllabus_lesson_material
						  WHERE org_id = ? AND syllabus_lesson_id IN (${ph})
						  ORDER BY position ASC, created_at ASC, material_id ASC`,
					[options.targetOrgId],
				)
			: [];
	const materialLinks = materialLinkRowsRaw.map(parseMaterialLinkRow);
	const materialCountByLessonId = new Map<string, number>();
	for (const lnk of materialLinks) {
		materialCountByLessonId.set(
			lnk.syllabusLessonId,
			(materialCountByLessonId.get(lnk.syllabusLessonId) ?? 0) + 1,
		);
	}

	const auditedModules: AuditedModuleEntry[] = [];
	const flatLessons: FlatLessonAuditEntry[] = [];
	let ordinal = 0;
	for (const [mIdx, mod] of modulesRaw.entries()) {
		const modLessons = lessonsByModuleId.get(mod.id) ?? [];
		const auditedLessons: FlatLessonAuditEntry[] = [];
		for (const [lIdx, les] of modLessons.entries()) {
			ordinal += 1;
			const entry: FlatLessonAuditEntry = {
				ordinal,
				lesson: les,
				moduleIndex: mIdx,
				moduleId: mod.id,
				moduleTitle: mod.title,
				moduleDescription: mod.description,
				moduleLessonCount: modLessons.length,
				lessonIndexInModule: lIdx,
				bankMaterialCount: materialCountByLessonId.get(les.id) ?? 0,
			};
			auditedLessons.push(entry);
			flatLessons.push(entry);
		}
		auditedModules.push({
			moduleIndex: mIdx,
			module: mod,
			lessons: auditedLessons,
		});
	}

	// Read-only source template summary (chỉ để báo cáo ngữ cảnh, không bao giờ sửa).
	let sourceTemplate: SourceTemplateAuditSummary | null = null;
	if (syllabusRow.sourceTemplateId) {
		const tplRows = await runner.queryRows(
			`SELECT id, name
			   FROM syllabus
			  WHERE id = ? AND org_id = ? AND class_id IS NULL`,
			[syllabusRow.sourceTemplateId, options.targetOrgId],
		);
		if (tplRows.length === 0) {
			sourceTemplate = {
				id: syllabusRow.sourceTemplateId,
				exists: false,
				name: null,
				moduleCount: 0,
				lessonCount: 0,
			};
		} else {
			const [tplModCountRows, tplLesCountRows] = await Promise.all([
				runner.queryRows(
					"SELECT COUNT(*) AS cnt FROM syllabus_module WHERE syllabus_id = ? AND org_id = ?",
					[syllabusRow.sourceTemplateId, options.targetOrgId],
				),
				runner.queryRows(
					`SELECT COUNT(*) AS cnt
					   FROM syllabus_lesson l
					   INNER JOIN syllabus_module m ON m.id = l.module_id
					  WHERE m.syllabus_id = ? AND m.org_id = ? AND l.org_id = ?`,
					[
						syllabusRow.sourceTemplateId,
						options.targetOrgId,
						options.targetOrgId,
					],
				),
			]);
			sourceTemplate = {
				id: syllabusRow.sourceTemplateId,
				exists: true,
				name: String(tplRows[0]?.name ?? ""),
				moduleCount: toInt(tplModCountRows[0]?.cnt, 0),
				lessonCount: toInt(tplLesCountRows[0]?.cnt, 0),
			};
		}
	}

	// Tổng hợp scheduled sessions (non-PII)
	const byDate = new Map<string, string[]>();
	let nonEmptyLessonTopicRows = 0;
	for (const r of scheduledLessonRowsRaw) {
		const topic = String(r.topic ?? "").trim();
		if (topic.length > 0) nonEmptyLessonTopicRows += 1;
		const date = toNullableString(r.date);
		if (!date) continue;
		const statuses = byDate.get(date) ?? [];
		statuses.push(String(r.status ?? ""));
		byDate.set(date, statuses);
	}
	let teachingDatesCount = 0;
	let holidayDatesCount = 0;
	for (const statuses of byDate.values()) {
		if (statuses.length > 0 && statuses.every((st) => st === "holiday")) {
			holidayDatesCount += 1;
		} else {
			teachingDatesCount += 1;
		}
	}
	let nonEmptyClassSessionTopics = 0;
	for (const r of classSessionRowsRaw) {
		if (String(r.topic ?? "").trim().length > 0) {
			nonEmptyClassSessionTopics += 1;
		}
	}

	const stateHash = computeCurriculumStateHash({
		syllabusId: syllabusRow.id,
		totalLessons: syllabusRow.totalLessons,
		modules: modulesRaw,
		lessons: flatLessons.map((f) => f.lesson),
		materialLinks,
	});

	return {
		targetOrgId: options.targetOrgId,
		matchedVia,
		classInfo,
		pointerMatchesCopy: classInfo.syllabusId === syllabusRow.id,
		syllabus: syllabusRow,
		sourceTemplate,
		modules: auditedModules,
		flatLessons,
		materialLinks,
		scheduledSessions: {
			totalLessonRows: scheduledLessonRowsRaw.length,
			distinctDatedSessions: byDate.size,
			teachingDatesCount,
			holidayDatesCount,
			nonEmptyLessonTopicRows,
			classSessionCount: classSessionRowsRaw.length,
			nonEmptyClassSessionTopics,
		},
		stateHash,
	};
}

function expandStageOrdinals(
	stage: RestructureStageSpec,
	stageLabel: string,
): number[] {
	const hasList = Array.isArray(stage.lessonOrdinals);
	const hasRange = Array.isArray(stage.lessonRange);
	if (hasList && hasRange) {
		throw new Error(
			`${stageLabel}: specify either lessonOrdinals or lessonRange, not both.`,
		);
	}
	if (!hasList && !hasRange) {
		throw new Error(
			`${stageLabel}: must specify lessonOrdinals or lessonRange.`,
		);
	}
	if (hasRange) {
		const [start, end] = stage.lessonRange as [number, number];
		if (
			!Number.isInteger(start) ||
			!Number.isInteger(end) ||
			start < 1 ||
			end < start
		) {
			throw new Error(
				`${stageLabel}: invalid lessonRange [${String(start)}, ${String(end)}].`,
			);
		}
		const out: number[] = [];
		for (let n = start; n <= end; n++) out.push(n);
		return out;
	}
	const list = stage.lessonOrdinals as number[];
	for (const n of list) {
		if (!Number.isInteger(n) || n < 1) {
			throw new Error(
				`${stageLabel}: invalid lesson ordinal "${String(n)}" (must be integer >= 1).`,
			);
		}
	}
	return [...list];
}

export function parseRestructureSpecJson(
	rawJson: string,
): RestructureClassSyllabusSpec {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawJson);
	} catch (err) {
		throw new Error(
			`Invalid spec JSON: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Spec JSON must be a JSON object.");
	}
	const obj = parsed as Record<string, unknown>;

	if (!Array.isArray(obj.stages) || obj.stages.length !== 2) {
		throw new Error(
			`Spec must contain exactly 2 stages in "stages" (received ${Array.isArray(obj.stages) ? obj.stages.length : typeof obj.stages}).`,
		);
	}

	const validTitleModes = new Set<LessonTitleMode>([
		"keep",
		"module-title",
		"lesson-colon-module",
		"module-suffix-if-multi",
	]);
	const lessonTitleMode = obj.lessonTitleMode as LessonTitleMode;
	if (!validTitleModes.has(lessonTitleMode)) {
		throw new Error(
			`Invalid lessonTitleMode "${String(obj.lessonTitleMode)}". Expected one of: keep, module-title, lesson-colon-module, module-suffix-if-multi.`,
		);
	}

	const validObjModes = new Set<ObjectivesMode>([
		"keep",
		"prepend-module-description",
		"append-module-description",
	]);
	const objectivesMode =
		obj.objectivesMode === undefined
			? "keep"
			: (obj.objectivesMode as ObjectivesMode);
	if (!validObjModes.has(objectivesMode)) {
		throw new Error(
			`Invalid objectivesMode "${String(obj.objectivesMode)}". Expected one of: keep, prepend-module-description, append-module-description.`,
		);
	}

	const parseStage = (raw: unknown, idx: number): RestructureStageSpec => {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
			throw new Error(`stages[${idx}] must be an object.`);
		}
		const s = raw as Record<string, unknown>;
		const title = typeof s.title === "string" ? s.title.trim() : "";
		if (title.length === 0) {
			throw new Error(`stages[${idx}].title must be a non-empty string.`);
		}
		if (title.length > MODULE_TITLE_MAX) {
			throw new Error(
				`stages[${idx}].title exceeds ${MODULE_TITLE_MAX} characters.`,
			);
		}
		const description =
			typeof s.description === "string" ? s.description.trim() : "";
		if (description.length > FIELD_TEXT_MAX) {
			throw new Error(
				`stages[${idx}].description exceeds ${FIELD_TEXT_MAX} characters.`,
			);
		}
		const stage: RestructureStageSpec = { title, description };
		if (s.lessonOrdinals !== undefined) {
			if (!Array.isArray(s.lessonOrdinals)) {
				throw new Error(`stages[${idx}].lessonOrdinals must be an array.`);
			}
			stage.lessonOrdinals = s.lessonOrdinals as number[];
		}
		if (s.lessonRange !== undefined) {
			if (!Array.isArray(s.lessonRange) || s.lessonRange.length !== 2) {
				throw new Error(
					`stages[${idx}].lessonRange must be a 2-element tuple [start, end].`,
				);
			}
			stage.lessonRange = s.lessonRange as [number, number];
		}
		return stage;
	};

	const stages: [RestructureStageSpec, RestructureStageSpec] = [
		parseStage(obj.stages[0], 0),
		parseStage(obj.stages[1], 1),
	];

	const lessonOverrides: LessonOverrideSpec[] = [];
	if (obj.lessonOverrides !== undefined) {
		if (!Array.isArray(obj.lessonOverrides)) {
			throw new Error("lessonOverrides must be an array when provided.");
		}
		const seenOrdinals = new Set<number>();
		for (const [i, item] of obj.lessonOverrides.entries()) {
			if (!item || typeof item !== "object" || Array.isArray(item)) {
				throw new Error(`lessonOverrides[${i}] must be an object.`);
			}
			const row = item as Record<string, unknown>;
			if (
				typeof row.ordinal !== "number" ||
				!Number.isInteger(row.ordinal) ||
				row.ordinal < 1
			) {
				throw new Error(
					`lessonOverrides[${i}].ordinal must be an integer >= 1.`,
				);
			}
			if (seenOrdinals.has(row.ordinal)) {
				throw new Error(`Duplicate ordinal ${row.ordinal} in lessonOverrides.`);
			}
			seenOrdinals.add(row.ordinal);

			const override: LessonOverrideSpec = { ordinal: row.ordinal };
			if (row.title !== undefined) {
				if (typeof row.title !== "string" || row.title.trim().length === 0) {
					throw new Error(
						`lessonOverrides[${i}].title must be a non-empty string.`,
					);
				}
				if (row.title.trim().length > MODULE_TITLE_MAX) {
					throw new Error(
						`lessonOverrides[${i}].title exceeds ${MODULE_TITLE_MAX} characters.`,
					);
				}
				override.title = row.title.trim();
			}
			if (row.objectives !== undefined) {
				if (typeof row.objectives !== "string") {
					throw new Error(`lessonOverrides[${i}].objectives must be a string.`);
				}
				if (row.objectives.length > FIELD_TEXT_MAX) {
					throw new Error(
						`lessonOverrides[${i}].objectives exceeds ${FIELD_TEXT_MAX} characters.`,
					);
				}
				override.objectives = row.objectives;
			}
			if (row.kind !== undefined) {
				if (typeof row.kind !== "string" || !VALID_LESSON_KINDS.has(row.kind)) {
					throw new Error(
						`lessonOverrides[${i}].kind must be one of: lesson, midterm, final.`,
					);
				}
				override.kind = row.kind as LessonKind;
			}
			lessonOverrides.push(override);
		}
	}

	const spec: RestructureClassSyllabusSpec = {
		stages,
		lessonTitleMode,
		objectivesMode,
		syncTotalLessons:
			obj.syncTotalLessons === undefined ? true : Boolean(obj.syncTotalLessons),
	};
	if (lessonOverrides.length > 0) spec.lessonOverrides = lessonOverrides;
	if (obj.expectedCurrentModules !== undefined) {
		if (
			typeof obj.expectedCurrentModules !== "number" ||
			!Number.isInteger(obj.expectedCurrentModules) ||
			obj.expectedCurrentModules < 0
		) {
			throw new Error("expectedCurrentModules must be a non-negative integer.");
		}
		spec.expectedCurrentModules = obj.expectedCurrentModules;
	}
	if (obj.expectedCurrentLessons !== undefined) {
		if (
			typeof obj.expectedCurrentLessons !== "number" ||
			!Number.isInteger(obj.expectedCurrentLessons) ||
			obj.expectedCurrentLessons < 1
		) {
			throw new Error("expectedCurrentLessons must be a positive integer.");
		}
		spec.expectedCurrentLessons = obj.expectedCurrentLessons;
	}
	if (obj.expectedSyllabusName !== undefined) {
		if (typeof obj.expectedSyllabusName !== "string") {
			throw new Error("expectedSyllabusName must be a string.");
		}
		spec.expectedSyllabusName = obj.expectedSyllabusName.trim();
	}

	return spec;
}

function computeNewLessonTitle(
	entry: FlatLessonAuditEntry,
	mode: LessonTitleMode,
): string {
	const currentTitle = entry.lesson.title.trim();
	const oldModTitle = entry.moduleTitle.trim();

	if (mode === "keep") return entry.lesson.title;
	if (mode === "module-title") {
		return oldModTitle.length > 0 ? oldModTitle : currentTitle;
	}
	if (mode === "lesson-colon-module") {
		if (oldModTitle.length === 0) return currentTitle;
		if (currentTitle.length === 0) return oldModTitle;
		if (
			normalizeClassName(currentTitle).includes(normalizeClassName(oldModTitle))
		) {
			return currentTitle;
		}
		return `${currentTitle}: ${oldModTitle}`;
	}
	// module-suffix-if-multi
	if (oldModTitle.length === 0) return currentTitle;
	if (entry.moduleLessonCount <= 1) return oldModTitle;
	if (currentTitle.length === 0) {
		return `${oldModTitle} (Phần ${entry.lessonIndexInModule + 1}/${entry.moduleLessonCount})`;
	}
	if (
		normalizeClassName(currentTitle).includes(normalizeClassName(oldModTitle))
	) {
		return currentTitle;
	}
	return `${oldModTitle} — ${currentTitle}`;
}

function computeNewLessonObjectives(
	entry: FlatLessonAuditEntry,
	mode: ObjectivesMode,
): string {
	const currentObj = entry.lesson.objectives;
	const modDesc = entry.moduleDescription.trim();
	if (mode === "keep" || modDesc.length === 0) return currentObj;
	if (currentObj.trim().length === 0) return modDesc;
	if (normalizeClassName(currentObj).includes(normalizeClassName(modDesc))) {
		return currentObj;
	}
	if (mode === "prepend-module-description") {
		return `${modDesc}\n${currentObj}`;
	}
	return `${currentObj}\n${modDesc}`;
}

/**
 * Xây dựng kế hoạch tái cấu trúc về đúng 2 chặng kèm preimage + rollback SQL.
 * Fail-closed khi:
 * - Optimistic concurrency guard không khớp
 * - Không phải phân hoạch liên tiếp 1..L qua 2 chặng (bảo toàn thứ tự buổi N ↔ bài N)
 * - Một trong 2 chặng không có buổi học nào
 * - Tiêu đề/mục tiêu sau biến đổi vượt giới hạn hợp đồng API
 */
export function buildRestructureClassSyllabusPlan(
	audit: ClassSyllabusAuditResult,
	spec: RestructureClassSyllabusSpec,
	options?: { nowMs?: number; generateId?: () => string },
): RestructureClassSyllabusPlan {
	const nowMs = options?.nowMs ?? Date.now();
	const genId = options?.generateId ?? (() => randomUUID());

	if (audit.syllabus.classId !== audit.classInfo.id) {
		throw new Error(
			"Refusing to restructure a syllabus that is not the target class's own copy.",
		);
	}
	if (audit.flatLessons.length === 0) {
		throw new Error("Cannot restructure a class curriculum with 0 lessons.");
	}

	if (
		spec.expectedCurrentModules !== undefined &&
		audit.modules.length !== spec.expectedCurrentModules
	) {
		throw new Error(
			`Precondition mismatch: expectedCurrentModules=${spec.expectedCurrentModules}, actual=${audit.modules.length}.`,
		);
	}
	if (
		spec.expectedCurrentLessons !== undefined &&
		audit.flatLessons.length !== spec.expectedCurrentLessons
	) {
		throw new Error(
			`Precondition mismatch: expectedCurrentLessons=${spec.expectedCurrentLessons}, actual=${audit.flatLessons.length}.`,
		);
	}
	if (
		spec.expectedSyllabusName !== undefined &&
		normalizeClassName(audit.syllabus.name) !==
			normalizeClassName(spec.expectedSyllabusName)
	) {
		throw new Error(
			`Precondition mismatch: expectedSyllabusName="${spec.expectedSyllabusName}", actual="${audit.syllabus.name}".`,
		);
	}

	const stage0Ordinals = expandStageOrdinals(spec.stages[0], "stages[0]");
	const stage1Ordinals = expandStageOrdinals(spec.stages[1], "stages[1]");
	if (stage0Ordinals.length === 0 || stage1Ordinals.length === 0) {
		throw new Error("Both stages must contain at least 1 lesson.");
	}

	const combined = [...stage0Ordinals, ...stage1Ordinals];
	const totalLessons = audit.flatLessons.length;
	if (combined.length !== totalLessons) {
		throw new Error(
			`Stages cover ${combined.length} lesson(s), but curriculum has ${totalLessons} lesson(s). Every lesson 1..${totalLessons} must be assigned exactly once.`,
		);
	}
	// Bắt buộc giữ nguyên trình tự phẳng 1..L để buổi N ↔ bài N không bao giờ dịch chuyển.
	for (let i = 0; i < totalLessons; i++) {
		if (combined[i] !== i + 1) {
			throw new Error(
				`Stages must partition lessons 1..${totalLessons} in strict ascending contiguous order to preserve session mapping (mismatch at slot ${i + 1}: received ${combined[i]}).`,
			);
		}
	}

	const overrideByOrdinal = new Map<number, LessonOverrideSpec>();
	for (const ov of spec.lessonOverrides ?? []) {
		if (ov.ordinal < 1 || ov.ordinal > totalLessons) {
			throw new Error(
				`lessonOverrides ordinal ${ov.ordinal} is out of range 1..${totalLessons}.`,
			);
		}
		overrideByOrdinal.set(ov.ordinal, ov);
	}

	const existingModules = audit.modules.map((m) => m.module);
	const targetModules: [PlannedTargetModule, PlannedTargetModule] = [0, 1].map(
		(idx) => {
			const stageIdx = idx as 0 | 1;
			const stage = spec.stages[stageIdx];
			const reused = existingModules[stageIdx] ?? null;
			return {
				id: reused ? reused.id : genId(),
				action: reused ? ("reuse" as const) : ("insert" as const),
				stageIndex: stageIdx,
				title: stage.title.trim(),
				description: (stage.description ?? "").trim(),
				position: stageIdx,
				createdAt: reused ? reused.createdAt : nowMs + stageIdx,
				previousModule: reused,
			};
		},
	) as [PlannedTargetModule, PlannedTargetModule];

	const keptModuleIds = new Set(targetModules.map((m) => m.id));
	const deletedModules = existingModules.filter(
		(m) => !keptModuleIds.has(m.id),
	);

	const stage0Set = new Set(stage0Ordinals);
	const stagePositionCounters: [number, number] = [0, 0];
	const objectivesMode = spec.objectivesMode ?? "keep";
	const lessonChanges: PlannedLessonChange[] = [];

	for (const entry of audit.flatLessons) {
		const toStageIndex: 0 | 1 = stage0Set.has(entry.ordinal) ? 0 : 1;
		const toModule = targetModules[toStageIndex];
		const toPosition = stagePositionCounters[toStageIndex];
		stagePositionCounters[toStageIndex] += 1;

		const override = overrideByOrdinal.get(entry.ordinal);
		const computedTitle =
			override?.title ??
			computeNewLessonTitle(entry, spec.lessonTitleMode).trim();
		if (computedTitle.length === 0) {
			throw new Error(
				`Computed title for lesson #${entry.ordinal} is empty; provide lessonOverrides or choose another lessonTitleMode.`,
			);
		}
		if (computedTitle.length > MODULE_TITLE_MAX) {
			throw new Error(
				`Computed title for lesson #${entry.ordinal} exceeds ${MODULE_TITLE_MAX} characters.`,
			);
		}
		const computedObjectives =
			override?.objectives ?? computeNewLessonObjectives(entry, objectivesMode);
		if (computedObjectives.length > FIELD_TEXT_MAX) {
			throw new Error(
				`Computed objectives for lesson #${entry.ordinal} exceeds ${FIELD_TEXT_MAX} characters.`,
			);
		}
		const computedKind = override?.kind ?? entry.lesson.kind;
		if (!VALID_LESSON_KINDS.has(computedKind)) {
			throw new Error(
				`Invalid kind "${computedKind}" for lesson #${entry.ordinal}.`,
			);
		}

		lessonChanges.push({
			ordinal: entry.ordinal,
			lessonId: entry.lesson.id,
			fromModuleId: entry.lesson.moduleId,
			fromModuleIndex: entry.moduleIndex,
			fromModuleTitle: entry.moduleTitle,
			fromPosition: entry.lesson.position,
			fromTitle: entry.lesson.title,
			fromObjectives: entry.lesson.objectives,
			fromKind: entry.lesson.kind,
			toStageIndex,
			toModuleId: toModule.id,
			toPosition,
			toTitle: computedTitle,
			toObjectives: computedObjectives,
			toKind: computedKind,
			status: entry.lesson.status,
			materials: entry.lesson.materials,
			createdAt: entry.lesson.createdAt,
			bankMaterialCount: entry.bankMaterialCount,
		});
	}

	const syncTotalLessons = spec.syncTotalLessons ?? true;
	const updateTotalLessonsTo =
		syncTotalLessons && audit.syllabus.totalLessons !== totalLessons
			? totalLessons
			: null;

	// 1. Apply statements — Phase A: đảm bảo 2 module đích + re-parent toàn bộ syllabus_lesson.
	const upsertAndMoveStatements: SqlStatement[] = [];
	for (const mod of targetModules) {
		if (mod.action === "insert") {
			upsertAndMoveStatements.push({
				sql: `INSERT INTO syllabus_module (id, org_id, syllabus_id, title, description, position, created_at)
				      VALUES (?, ?, ?, ?, ?, ?, ?)`,
				args: [
					mod.id,
					audit.targetOrgId,
					audit.syllabus.id,
					mod.title,
					mod.description,
					mod.position,
					mod.createdAt,
				],
			});
		} else {
			upsertAndMoveStatements.push({
				sql: `UPDATE syllabus_module
				         SET title = ?, description = ?, position = ?
				       WHERE id = ? AND syllabus_id = ? AND org_id = ?`,
				args: [
					mod.title,
					mod.description,
					mod.position,
					mod.id,
					audit.syllabus.id,
					audit.targetOrgId,
				],
			});
		}
	}

	for (const ch of lessonChanges) {
		upsertAndMoveStatements.push({
			sql: `UPDATE syllabus_lesson
			         SET module_id = ?, position = ?, title = ?, objectives = ?, kind = ?
			       WHERE id = ? AND org_id = ?`,
			args: [
				ch.toModuleId,
				ch.toPosition,
				ch.toTitle,
				ch.toObjectives,
				ch.toKind,
				ch.lessonId,
				audit.targetOrgId,
			],
		});
	}

	// 2. Apply statements — Phase B: xoá các module cũ dư thừa (chunked <= 70 IDs).
	const deleteObsoleteModuleStatements: SqlStatement[] = [];
	for (let i = 0; i < deletedModules.length; i += ID_CHUNK_SIZE) {
		const chunk = deletedModules.slice(i, i + ID_CHUNK_SIZE);
		const placeholders = chunk.map(() => "?").join(", ");
		deleteObsoleteModuleStatements.push({
			sql: `DELETE FROM syllabus_module WHERE syllabus_id = ? AND org_id = ? AND id IN (${placeholders})`,
			args: [audit.syllabus.id, audit.targetOrgId, ...chunk.map((m) => m.id)],
		});
	}

	// 3. Apply statements — Phase C: cập nhật syllabus.total_lessons nếu lệch.
	const syllabusMetaStatements: SqlStatement[] = [];
	if (updateTotalLessonsTo !== null) {
		syllabusMetaStatements.push({
			sql: "UPDATE syllabus SET total_lessons = ? WHERE id = ? AND class_id = ? AND org_id = ?",
			args: [
				updateTotalLessonsTo,
				audit.syllabus.id,
				audit.classInfo.id,
				audit.targetOrgId,
			],
		});
	}

	// 4. Rollback SQL theo đúng thứ tự FK:
	//    (a) Re-insert mọi module đã xoá
	//    (b) Khôi phục title/description/position của các module được reuse
	//    (c) Khôi phục toàn bộ syllabus_lesson về module_id/position/title/objectives/kind cũ
	//    (d) Xoá các module mới chèn (nếu có) SAU khi lesson đã trả về module cũ
	//    (e) Khôi phục syllabus.total_lessons nếu đã đổi
	const rollbackStatements: SqlStatement[] = [];
	for (const delMod of deletedModules) {
		rollbackStatements.push({
			sql: `INSERT OR IGNORE INTO syllabus_module (id, org_id, syllabus_id, title, description, position, created_at)
			      VALUES (?, ?, ?, ?, ?, ?, ?)`,
			args: [
				delMod.id,
				delMod.orgId,
				delMod.syllabusId,
				delMod.title,
				delMod.description,
				delMod.position,
				delMod.createdAt,
			],
		});
	}
	for (const mod of targetModules) {
		if (mod.action === "reuse" && mod.previousModule) {
			rollbackStatements.push({
				sql: `UPDATE syllabus_module
				         SET title = ?, description = ?, position = ?
				       WHERE id = ? AND syllabus_id = ? AND org_id = ?`,
				args: [
					mod.previousModule.title,
					mod.previousModule.description,
					mod.previousModule.position,
					mod.previousModule.id,
					mod.previousModule.syllabusId,
					mod.previousModule.orgId,
				],
			});
		}
	}
	for (const ch of lessonChanges) {
		rollbackStatements.push({
			sql: `UPDATE syllabus_lesson
			         SET module_id = ?, position = ?, title = ?, objectives = ?, kind = ?
			       WHERE id = ? AND org_id = ?`,
			args: [
				ch.fromModuleId,
				ch.fromPosition,
				ch.fromTitle,
				ch.fromObjectives,
				ch.fromKind,
				ch.lessonId,
				audit.targetOrgId,
			],
		});
	}
	for (const mod of targetModules) {
		if (mod.action === "insert") {
			rollbackStatements.push({
				sql: "DELETE FROM syllabus_module WHERE id = ? AND syllabus_id = ? AND org_id = ?",
				args: [mod.id, audit.syllabus.id, audit.targetOrgId],
			});
		}
	}
	if (updateTotalLessonsTo !== null) {
		rollbackStatements.push({
			sql: "UPDATE syllabus SET total_lessons = ? WHERE id = ? AND class_id = ? AND org_id = ?",
			args: [
				audit.syllabus.totalLessons,
				audit.syllabus.id,
				audit.classInfo.id,
				audit.targetOrgId,
			],
		});
	}

	const expectedTotalLessons =
		updateTotalLessonsTo ?? audit.syllabus.totalLessons;
	const expectedHash = computeCurriculumStateHash({
		syllabusId: audit.syllabus.id,
		totalLessons: expectedTotalLessons,
		modules: targetModules.map((m) => ({
			id: m.id,
			title: m.title,
			description: m.description,
			position: m.position,
		})),
		lessons: lessonChanges.map((ch) => ({
			id: ch.lessonId,
			moduleId: ch.toModuleId,
			title: ch.toTitle,
			objectives: ch.toObjectives,
			materials: ch.materials,
			kind: ch.toKind,
			status: ch.status,
			position: ch.toPosition,
		})),
		materialLinks: audit.materialLinks,
	});

	const preimage: RestructureClassSyllabusPreimage = {
		capturedAt: new Date(nowMs).toISOString(),
		targetOrgId: audit.targetOrgId,
		classId: audit.classInfo.id,
		classSyllabusIdPointer: audit.classInfo.syllabusId,
		syllabus: audit.syllabus,
		modules: existingModules,
		lessons: audit.flatLessons.map((f) => f.lesson),
		materialLinks: audit.materialLinks,
		stateHash: audit.stateHash,
	};

	return {
		audit,
		spec,
		targetModules,
		deletedModules,
		lessonChanges,
		updateTotalLessonsTo,
		preimage,
		upsertAndMoveStatements,
		deleteObsoleteModuleStatements,
		syllabusMetaStatements,
		rollbackStatements,
		expectedHash,
	};
}

/**
 * Thực thi kế hoạch tái cấu trúc với live preflight guard + pre-DELETE zero-lesson guard.
 */
export async function applyRestructureClassSyllabusPlan(
	runner: RestructureSqlRunner,
	plan: RestructureClassSyllabusPlan,
): Promise<{ statementsExecuted: number }> {
	if (plan.consumed) {
		throw new Error(
			"RestructureClassSyllabusPlan has already been consumed; rebuild a fresh plan before retrying.",
		);
	}
	plan.consumed = true;

	// Live preflight check: đảm bảo DB chưa bị thay đổi kể từ lúc audit/build plan.
	const live = await auditClassSyllabus(runner, {
		targetOrgId: plan.audit.targetOrgId,
		classId: plan.audit.classInfo.id,
	});
	if (live.syllabus.id !== plan.audit.syllabus.id) {
		throw new Error(
			"Live preflight failed: class curriculum syllabus ID changed since audit.",
		);
	}
	if (live.stateHash !== plan.audit.stateHash) {
		throw new Error(
			"Live preflight failed: curriculum state changed since audit (stateHash mismatch). Re-run dry-run before applying.",
		);
	}

	let statementsExecuted = 0;

	// Phase A: cập nhật/chèn 2 module đích + re-parent toàn bộ buổi học.
	if (plan.upsertAndMoveStatements.length > 0) {
		await runner.run(plan.upsertAndMoveStatements);
		statementsExecuted += plan.upsertAndMoveStatements.length;
	}

	// Phase B: live guard trước khi xoá module cũ — BẮT BUỘC 0 lesson còn trỏ vào module sắp xoá.
	if (plan.deletedModules.length > 0) {
		const obsoleteIds = plan.deletedModules.map((m) => m.id);
		const remainingRows = await queryRowsInIdChunks(
			runner,
			obsoleteIds,
			(ph) =>
				`SELECT id FROM syllabus_lesson WHERE org_id = ? AND module_id IN (${ph})`,
			[plan.audit.targetOrgId],
		);
		if (remainingRows.length > 0) {
			throw new Error(
				`Safety abort before DELETE syllabus_module: ${remainingRows.length} syllabus_lesson row(s) still reference obsolete module(s).`,
			);
		}
		await runner.run(plan.deleteObsoleteModuleStatements);
		statementsExecuted += plan.deleteObsoleteModuleStatements.length;
	}

	// Phase C: đồng bộ syllabus.total_lessons nếu cần.
	if (plan.syllabusMetaStatements.length > 0) {
		await runner.run(plan.syllabusMetaStatements);
		statementsExecuted += plan.syllabusMetaStatements.length;
	}

	return { statementsExecuted };
}

/**
 * Xác thực hậu kiểm sau khi apply: đối chiếu số chặng = 2, bảo toàn 100% lesson ID
 * theo đúng thứ tự phẳng 1..L, bảo toàn 100% syllabus_lesson_material, và khớp SHA-256.
 */
export async function verifyRestructuredClassSyllabus(
	runner: RestructureSqlRunner,
	plan: RestructureClassSyllabusPlan,
): Promise<VerifyRestructureClassSyllabusResult> {
	const after = await auditClassSyllabus(runner, {
		targetOrgId: plan.audit.targetOrgId,
		classId: plan.audit.classInfo.id,
	});
	const mismatches: string[] = [];

	if (after.modules.length !== 2) {
		mismatches.push(
			`Expected exactly 2 syllabus_module rows, found ${after.modules.length}.`,
		);
	}
	if (after.flatLessons.length !== plan.lessonChanges.length) {
		mismatches.push(
			`Lesson count mismatch: actual=${after.flatLessons.length}, expected=${plan.lessonChanges.length}.`,
		);
	}
	if (after.materialLinks.length !== plan.audit.materialLinks.length) {
		mismatches.push(
			`syllabus_lesson_material count mismatch: actual=${after.materialLinks.length}, expected=${plan.audit.materialLinks.length}.`,
		);
	}

	const expectedTotalLessons =
		plan.updateTotalLessonsTo ?? plan.audit.syllabus.totalLessons;
	if (after.syllabus.totalLessons !== expectedTotalLessons) {
		mismatches.push(
			`syllabus.total_lessons mismatch: actual=${after.syllabus.totalLessons}, expected=${expectedTotalLessons}.`,
		);
	}

	let flatOrderPreserved =
		after.flatLessons.length === plan.lessonChanges.length;
	if (flatOrderPreserved) {
		for (let i = 0; i < plan.lessonChanges.length; i++) {
			const expected = plan.lessonChanges[i] as PlannedLessonChange;
			const actual = after.flatLessons[i] as FlatLessonAuditEntry;
			if (actual.lesson.id !== expected.lessonId) {
				flatOrderPreserved = false;
				mismatches.push(`Flattened lesson order shifted at slot #${i + 1}.`);
				break;
			}
		}
	}

	if (after.stateHash !== plan.expectedHash) {
		mismatches.push(
			`Content parity SHA-256 mismatch: actual=${after.stateHash.slice(0, 12)}..., expected=${plan.expectedHash.slice(0, 12)}....`,
		);
	}

	return {
		ok: mismatches.length === 0,
		moduleCount: after.modules.length,
		lessonCount: after.flatLessons.length,
		materialLinkCount: after.materialLinks.length,
		expectedMaterialLinkCount: plan.audit.materialLinks.length,
		totalLessonsColumn: after.syllabus.totalLessons,
		expectedTotalLessonsColumn: expectedTotalLessons,
		flatOrderPreserved,
		expectedHash: plan.expectedHash,
		actualHash: after.stateHash,
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

export function formatRestructureRollbackSql(
	plan: RestructureClassSyllabusPlan,
): string {
	const lines = [
		"-- Rollback SQL for class syllabus 2-stage restructure",
		`-- Captured at: ${plan.preimage.capturedAt}`,
		`-- Syllabus: "${plan.audit.syllabus.name}"`,
		`-- Scope: originalModules=${plan.preimage.modules.length}, lessons=${plan.preimage.lessons.length}, materialLinks=${plan.preimage.materialLinks.length}`,
		"-- Note: preserves all syllabus_lesson IDs and syllabus_lesson_material links.",
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

export function formatClassSyllabusAuditReport(
	audit: ClassSyllabusAuditResult,
	options?: { publicLogs?: boolean },
): string {
	const publicLogs = options?.publicLogs ?? false;
	const classHeader = publicLogs
		? `matchedVia=${audit.matchedVia}`
		: `class="${audit.classInfo.name}" [classId=${audit.classInfo.id}, orgId=${audit.targetOrgId}, matchedVia=${audit.matchedVia}]`;
	const syllabusIdPart = publicLogs ? "" : ` [syllabusId=${audit.syllabus.id}]`;

	const lines: string[] = [
		`=== Class Curriculum Audit (${classHeader}) ===`,
		`Class meta: type=${audit.classInfo.type || "(empty)"}, level=${audit.classInfo.level || "(empty)"}, mode=${audit.classInfo.mode || "(empty)"}, status=${audit.classInfo.status || "(empty)"}, schedulingMode=${audit.classInfo.schedulingMode || "(empty)"}, sessionsTotal=${audit.classInfo.sessionsTotal}, sessionsDone=${audit.classInfo.sessionsDone}, pointerMatchesCopy=${audit.pointerMatchesCopy}`,
		`Syllabus: "${audit.syllabus.name}"${syllabusIdPart} (type=${audit.syllabus.type || "(empty)"}, level=${audit.syllabus.level || "(empty)"}, totalLessonsCol=${audit.syllabus.totalLessons}, actualModules=${audit.modules.length}, actualLessons=${audit.flatLessons.length}, bankMaterialLinks=${audit.materialLinks.length}, stateHash=${audit.stateHash.slice(0, 12)})`,
	];

	if (audit.syllabus.description.trim().length > 0) {
		lines.push(
			`Syllabus description: "${collapseSingleLine(audit.syllabus.description, 240)}"`,
		);
	}

	if (audit.sourceTemplate) {
		const tplStatus = audit.sourceTemplate.exists
			? `"${audit.sourceTemplate.name}" (modules=${audit.sourceTemplate.moduleCount}, lessons=${audit.sourceTemplate.lessonCount})`
			: "missing (deleted)";
		lines.push(`Source template (read-only, untouched): ${tplStatus}`);
	} else {
		lines.push("Source template: none");
	}

	lines.push(
		`Scheduled sessions (read-only): lessonRows=${audit.scheduledSessions.totalLessonRows}, distinctDates=${audit.scheduledSessions.distinctDatedSessions} (teaching=${audit.scheduledSessions.teachingDatesCount}, holiday=${audit.scheduledSessions.holidayDatesCount}), nonEmptyLessonTopics=${audit.scheduledSessions.nonEmptyLessonTopicRows}, classSessions=${audit.scheduledSessions.classSessionCount}, nonEmptyClassSessionTopics=${audit.scheduledSessions.nonEmptyClassSessionTopics}`,
	);
	lines.push("");
	lines.push(
		`-- Current Modules (${audit.modules.length}) & Lessons (${audit.flatLessons.length}) --`,
	);

	for (const modEntry of audit.modules) {
		const m = modEntry.module;
		const modIdPart = publicLogs ? "" : ` id=${m.id}`;
		const descPart =
			m.description.trim().length > 0
				? ` | desc="${collapseSingleLine(m.description, 160)}"`
				: "";
		lines.push(
			`  [M${modEntry.moduleIndex + 1}] pos=${m.position}${modIdPart} | lessons=${modEntry.lessons.length} | title="${collapseSingleLine(m.title, 200)}"${descPart}`,
		);
		for (const lesEntry of modEntry.lessons) {
			const l = lesEntry.lesson;
			const lesIdPart = publicLogs ? "" : ` id=${l.id}`;
			const objPart =
				l.objectives.trim().length > 0
					? ` | objectives="${collapseSingleLine(l.objectives, 160)}"`
					: "";
			const matNotePart =
				l.materials.trim().length > 0
					? ` | materialsTextLen=${l.materials.trim().length}`
					: "";
			lines.push(
				`      [#${lesEntry.ordinal}] pos=${l.position}${lesIdPart} | kind=${l.kind} | status=${l.status} | bankMaterials=${lesEntry.bankMaterialCount} | title="${collapseSingleLine(l.title, 180)}"${objPart}${matNotePart}`,
			);
		}
	}

	return lines.join("\n");
}

export function formatRestructurePlanPreview(
	plan: RestructureClassSyllabusPlan,
	options?: { publicLogs?: boolean },
): string {
	const publicLogs = options?.publicLogs ?? false;
	const lines: string[] = [
		"=== Planned 2-Stage Restructure Preview ===",
		`Summary: modules ${plan.audit.modules.length} -> 2 (reuse=${plan.targetModules.filter((m) => m.action === "reuse").length}, insert=${plan.targetModules.filter((m) => m.action === "insert").length}, delete=${plan.deletedModules.length}), lessons=${plan.lessonChanges.length} (IDs & 1..N order preserved), bankMaterialLinks=${plan.audit.materialLinks.length} (preserved), lessonTitleMode=${plan.spec.lessonTitleMode}, objectivesMode=${plan.spec.objectivesMode ?? "keep"}, expectedHash=${plan.expectedHash.slice(0, 12)}`,
	];

	if (plan.updateTotalLessonsTo !== null) {
		lines.push(
			`Syllabus meta: total_lessons ${plan.audit.syllabus.totalLessons} -> ${plan.updateTotalLessonsTo}`,
		);
	}

	for (const stage of plan.targetModules) {
		const stageLessons = plan.lessonChanges.filter(
			(ch) => ch.toStageIndex === stage.stageIndex,
		);
		const idPart = publicLogs ? "" : ` id=${stage.id}`;
		const descPart =
			stage.description.length > 0
				? ` | desc="${collapseSingleLine(stage.description, 160)}"`
				: "";
		lines.push(
			`  [Stage ${stage.stageIndex + 1}] (${stage.action}${idPart}) pos=${stage.position} | lessons=${stageLessons.length} | title="${collapseSingleLine(stage.title, 200)}"${descPart}`,
		);
		for (const ch of stageLessons) {
			const titleChanged = ch.fromTitle !== ch.toTitle;
			const objChanged = ch.fromObjectives !== ch.toObjectives;
			const kindChanged = ch.fromKind !== ch.toKind;
			const titlePart = titleChanged
				? `title: "${collapseSingleLine(ch.fromTitle, 100)}" -> "${collapseSingleLine(ch.toTitle, 140)}"`
				: `title: "${collapseSingleLine(ch.toTitle, 140)}" (unchanged)`;
			const objPart = objChanged
				? ` | objectives updated (len ${ch.fromObjectives.length} -> ${ch.toObjectives.length})`
				: "";
			const kindPart = kindChanged
				? ` | kind: ${ch.fromKind} -> ${ch.toKind}`
				: "";
			lines.push(
				`      [#${ch.ordinal}] (from M${ch.fromModuleIndex + 1} -> S${ch.toStageIndex + 1} pos=${ch.toPosition}) ${titlePart}${objPart}${kindPart}`,
			);
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
