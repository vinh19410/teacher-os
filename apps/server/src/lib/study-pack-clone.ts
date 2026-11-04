import {
	type AssignmentQuestion,
	assignmentQuestionSchema,
	STUDY_PACK_SKILLS,
	type StudyPackDetailView,
	type StudyPackItemInput,
	type StudyPackItemView,
	type StudyPackSkill,
	type StudyPackSourceKind,
	type StudyPackSummaryView,
} from "@teacher-os/api/contracts";
import {
	type LibraryQuestionGroup,
	libraryQuestionGroupSchema,
} from "@teacher-os/api/library-contracts";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import {
	libraryTest,
	libraryTestPart,
} from "@teacher-os/db/schema/library-test";
import {
	libraryExercise,
	type studyPack,
	studyPackItem,
} from "@teacher-os/db/schema/study-pack";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../app";

/** 22 columns × 4 rows = 88 binds <= 100 D1 bind limit. */
export const D1_PROMPT_CLONE_INSERT_CHUNK = 4;
/** 7 columns × 10 rows = 70 binds <= 100 D1 bind limit. */
export const D1_PACK_ITEM_INSERT_CHUNK = 10;
/** Standard D1 inArray chunk limit (#366 RT-F2). */
export const D1_IN_ARRAY_CHUNK = 50;

function isStudyPackSkill(skill: string): skill is StudyPackSkill {
	return (STUDY_PACK_SKILLS as readonly string[]).includes(skill);
}

export interface StudyPackItemSourceRef {
	sourceKind: StudyPackSourceKind | string;
	sourceId: string;
}

export interface ResolvedStudyPackItemMeta {
	sourceKind: StudyPackSourceKind;
	sourceId: string;
	title: string;
	skill: StudyPackSkill;
	part: string;
	type: string;
	status: string;
}

export type ValidateStudyPackItemsResult =
	| {
			ok: true;
			metadataByKey: Map<string, ResolvedStudyPackItemMeta>;
	  }
	| {
			ok: false;
			status: 404 | 422;
			error: string;
	  };

export type MaterializePromptsResult =
	| {
			ok: true;
			promptIdBySourceKey: Map<string, string>;
			metadataByKey: Map<string, ResolvedStudyPackItemMeta>;
			items: Array<
				ResolvedStudyPackItemMeta & {
					promptId: string;
				}
			>;
	  }
	| {
			ok: false;
			status: 404 | 422;
			error: string;
	  };

export function studyPackSourceKey(
	sourceKind: string,
	sourceId: string,
): string {
	return `${sourceKind}:${sourceId}`;
}

function parseJsonArray(raw: string): unknown[] {
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function parseStringArray(raw: string): string[] {
	return parseJsonArray(raw).filter(
		(item): item is string => typeof item === "string",
	);
}

function parseQuestions(raw: string): AssignmentQuestion[] {
	const parsed = assignmentQuestionSchema
		.array()
		.safeParse(parseJsonArray(raw));
	const questions = parsed.success
		? parsed.data
		: parseJsonArray(raw).flatMap((entry) => {
				const single = assignmentQuestionSchema.safeParse(entry);
				return single.success ? [single.data] : [];
			});
	return questions.map((q) => ({ ...q, opts: q.opts ?? null }));
}

function parseGroups(raw: string): LibraryQuestionGroup[] {
	const parsed = libraryQuestionGroupSchema
		.array()
		.safeParse(parseJsonArray(raw));
	if (parsed.success) return parsed.data;
	return parseJsonArray(raw).flatMap((entry) => {
		const single = libraryQuestionGroupSchema.safeParse(entry);
		return single.success ? [single.data] : [];
	});
}

function formatLibraryPartTitle(
	partTitle: string,
	testTitle: string,
	partSlot: string,
): string {
	const trimmed = partTitle.trim();
	if (trimmed.length > 0) return trimmed;
	return `${testTitle} — ${partSlot.toUpperCase()}`;
}

function flattenLibraryTestPart(
	part: typeof libraryTestPart.$inferSelect,
	testTitle: string,
): {
	title: string;
	type: string;
	intro: string;
	questions: AssignmentQuestion[];
	optionBank: string[];
} {
	const title = formatLibraryPartTitle(part.title, testTitle, part.part);
	const questions = parseQuestions(part.questions).map((question) => ({
		...question,
	}));
	const partOptionBank = parseStringArray(part.optionBank);
	const groups = parseGroups(part.groups);

	if (groups.length === 0) {
		return {
			title,
			type: part.type,
			intro: part.intro,
			questions,
			optionBank: partOptionBank,
		};
	}

	for (const group of groups) {
		const end = Math.min(questions.length, group.startIndex + group.count);
		for (let i = Math.max(0, group.startIndex); i < end; i += 1) {
			const current = questions[i];
			if (!current) continue;
			questions[i] = {
				...current,
				type: current.type || group.type,
			};
		}
	}

	const introParts = [
		part.intro.trim(),
		...groups.map((group) => group.instruction.trim()),
	].filter((piece) => piece.length > 0);
	const intro = introParts.join("\n");

	const optionBank =
		partOptionBank.length > 0
			? partOptionBank
			: [
					...new Set(
						groups.flatMap((group) =>
							group.optionBank.map((item) => item.trim()).filter(Boolean),
						),
					),
				].slice(0, 8);

	const resolvedType = part.type.trim() || groups[0]?.type || "tfng";

	return {
		title,
		type: resolvedType,
		intro,
		questions,
		optionBank,
	};
}

/**
 * Resolve metadata for study pack items without failing on missing/draft items
 * (used when rendering existing pack details).
 */
export async function resolveStudyPackItemMetadata(
	db: Db,
	orgId: string | null,
	items: readonly StudyPackItemSourceRef[],
): Promise<
	Map<
		string,
		{
			title: string;
			skill: string;
			part: string;
			type: string;
			status: string;
		}
	>
> {
	const map = new Map<
		string,
		{
			title: string;
			skill: string;
			part: string;
			type: string;
			status: string;
		}
	>();
	if (items.length === 0) return map;

	const orgPromptIds = [
		...new Set(
			items
				.filter((item) => item.sourceKind === "org_prompt")
				.map((item) => item.sourceId),
		),
	];
	const libraryPartIds = [
		...new Set(
			items
				.filter((item) => item.sourceKind === "library_test_part")
				.map((item) => item.sourceId),
		),
	];
	const exerciseIds = [
		...new Set(
			items
				.filter((item) => item.sourceKind === "library_exercise")
				.map((item) => item.sourceId),
		),
	];

	if (orgId !== null && orgPromptIds.length > 0) {
		for (let i = 0; i < orgPromptIds.length; i += D1_IN_ARRAY_CHUNK) {
			const slice = orgPromptIds.slice(i, i + D1_IN_ARRAY_CHUNK);
			const rows = await db
				.select({
					id: assignmentPrompt.id,
					title: assignmentPrompt.title,
					skill: assignmentPrompt.skill,
					part: assignmentPrompt.part,
					type: assignmentPrompt.type,
					status: assignmentPrompt.status,
				})
				.from(assignmentPrompt)
				.where(
					and(
						eq(assignmentPrompt.orgId, orgId),
						inArray(assignmentPrompt.id, slice),
					),
				);
			for (const row of rows) {
				map.set(studyPackSourceKey("org_prompt", row.id), {
					title: row.title,
					skill: row.skill,
					part: row.part,
					type: row.type,
					status: row.status,
				});
			}
		}
	}

	if (libraryPartIds.length > 0) {
		for (let i = 0; i < libraryPartIds.length; i += D1_IN_ARRAY_CHUNK) {
			const slice = libraryPartIds.slice(i, i + D1_IN_ARRAY_CHUNK);
			const rows = await db
				.select({
					id: libraryTestPart.id,
					part: libraryTestPart.part,
					type: libraryTestPart.type,
					title: libraryTestPart.title,
					groups: libraryTestPart.groups,
					testTitle: libraryTest.title,
					testSkill: libraryTest.skill,
					testStatus: libraryTest.status,
				})
				.from(libraryTestPart)
				.innerJoin(libraryTest, eq(libraryTestPart.testId, libraryTest.id))
				.where(inArray(libraryTestPart.id, slice));
			for (const row of rows) {
				const groups = parseGroups(row.groups);
				map.set(studyPackSourceKey("library_test_part", row.id), {
					title: formatLibraryPartTitle(row.title, row.testTitle, row.part),
					skill: row.testSkill,
					part: row.part,
					type: row.type.trim() || groups[0]?.type || "tfng",
					status: row.testStatus,
				});
			}
		}
	}

	if (exerciseIds.length > 0) {
		for (let i = 0; i < exerciseIds.length; i += D1_IN_ARRAY_CHUNK) {
			const slice = exerciseIds.slice(i, i + D1_IN_ARRAY_CHUNK);
			const rows = await db
				.select({
					id: libraryExercise.id,
					title: libraryExercise.title,
					skill: libraryExercise.skill,
					part: libraryExercise.part,
					type: libraryExercise.type,
					status: libraryExercise.status,
				})
				.from(libraryExercise)
				.where(inArray(libraryExercise.id, slice));
			for (const row of rows) {
				map.set(studyPackSourceKey("library_exercise", row.id), {
					title: row.title,
					skill: row.skill,
					part: row.part,
					type: row.type,
					status: row.status,
				});
			}
		}
	}

	return map;
}

/**
 * Validate all study pack items and return their resolved metadata.
 */
export async function validateStudyPackItems(
	db: Db,
	orgId: string | null,
	items: readonly StudyPackItemSourceRef[],
): Promise<ValidateStudyPackItemsResult> {
	const metadataByKey = new Map<string, ResolvedStudyPackItemMeta>();
	if (items.length === 0) {
		return { ok: true, metadataByKey };
	}

	for (const item of items) {
		if (
			item.sourceKind !== "org_prompt" &&
			item.sourceKind !== "library_test_part" &&
			item.sourceKind !== "library_exercise"
		) {
			return {
				ok: false,
				status: 422,
				error: "invalid sourceKind",
			};
		}
		if (orgId === null && item.sourceKind === "org_prompt") {
			return {
				ok: false,
				status: 422,
				error: "system pack cannot reference org_prompt",
			};
		}
	}

	const orgPromptIds = [
		...new Set(
			items
				.filter((item) => item.sourceKind === "org_prompt")
				.map((item) => item.sourceId),
		),
	];
	const libraryPartIds = [
		...new Set(
			items
				.filter((item) => item.sourceKind === "library_test_part")
				.map((item) => item.sourceId),
		),
	];
	const exerciseIds = [
		...new Set(
			items
				.filter((item) => item.sourceKind === "library_exercise")
				.map((item) => item.sourceId),
		),
	];

	if (orgId !== null && orgPromptIds.length > 0) {
		const foundById = new Map<
			string,
			{
				id: string;
				title: string;
				skill: string;
				part: string;
				type: string;
				status: string;
			}
		>();
		for (let i = 0; i < orgPromptIds.length; i += D1_IN_ARRAY_CHUNK) {
			const slice = orgPromptIds.slice(i, i + D1_IN_ARRAY_CHUNK);
			const rows = await db
				.select({
					id: assignmentPrompt.id,
					title: assignmentPrompt.title,
					skill: assignmentPrompt.skill,
					part: assignmentPrompt.part,
					type: assignmentPrompt.type,
					status: assignmentPrompt.status,
				})
				.from(assignmentPrompt)
				.where(
					and(
						eq(assignmentPrompt.orgId, orgId),
						inArray(assignmentPrompt.id, slice),
					),
				);
			for (const row of rows) {
				foundById.set(row.id, row);
			}
		}

		for (const id of orgPromptIds) {
			const row = foundById.get(id);
			if (!row) {
				return {
					ok: false,
					status: 404,
					error: "org_prompt not found",
				};
			}
			if (row.status !== "ready") {
				return {
					ok: false,
					status: 422,
					error: "org_prompt must be ready",
				};
			}
			if (!isStudyPackSkill(row.skill)) {
				return {
					ok: false,
					status: 422,
					error: `skill ${row.skill} is not supported in study packs`,
				};
			}
			metadataByKey.set(studyPackSourceKey("org_prompt", row.id), {
				sourceKind: "org_prompt",
				sourceId: row.id,
				title: row.title,
				skill: row.skill as StudyPackSkill,
				part: row.part,
				type: row.type,
				status: row.status,
			});
		}
	}

	if (libraryPartIds.length > 0) {
		const foundById = new Map<
			string,
			{
				id: string;
				part: string;
				type: string;
				title: string;
				groups: string;
				testTitle: string;
				testSkill: string;
				testStatus: string;
			}
		>();
		for (let i = 0; i < libraryPartIds.length; i += D1_IN_ARRAY_CHUNK) {
			const slice = libraryPartIds.slice(i, i + D1_IN_ARRAY_CHUNK);
			const rows = await db
				.select({
					id: libraryTestPart.id,
					part: libraryTestPart.part,
					type: libraryTestPart.type,
					title: libraryTestPart.title,
					groups: libraryTestPart.groups,
					testTitle: libraryTest.title,
					testSkill: libraryTest.skill,
					testStatus: libraryTest.status,
				})
				.from(libraryTestPart)
				.innerJoin(libraryTest, eq(libraryTestPart.testId, libraryTest.id))
				.where(inArray(libraryTestPart.id, slice));
			for (const row of rows) {
				foundById.set(row.id, row);
			}
		}

		for (const id of libraryPartIds) {
			const row = foundById.get(id);
			if (!row) {
				return {
					ok: false,
					status: 404,
					error: "library_test_part not found",
				};
			}
			if (row.testSkill === "listening") {
				return {
					ok: false,
					status: 422,
					error: "listening library parts are not supported in study packs yet",
				};
			}
			if (row.testSkill !== "reading") {
				return {
					ok: false,
					status: 422,
					error: `skill ${row.testSkill} is not supported for library_test_part`,
				};
			}
			if (row.testStatus !== "ready") {
				return {
					ok: false,
					status: 422,
					error: "library_test_part must belong to a ready test",
				};
			}
			const groups = parseGroups(row.groups);
			metadataByKey.set(studyPackSourceKey("library_test_part", row.id), {
				sourceKind: "library_test_part",
				sourceId: row.id,
				title: formatLibraryPartTitle(row.title, row.testTitle, row.part),
				skill: "reading",
				part: row.part,
				type: row.type.trim() || groups[0]?.type || "tfng",
				status: row.testStatus,
			});
		}
	}

	if (exerciseIds.length > 0) {
		const foundById = new Map<
			string,
			{
				id: string;
				title: string;
				skill: string;
				part: string;
				type: string;
				status: string;
			}
		>();
		for (let i = 0; i < exerciseIds.length; i += D1_IN_ARRAY_CHUNK) {
			const slice = exerciseIds.slice(i, i + D1_IN_ARRAY_CHUNK);
			const rows = await db
				.select({
					id: libraryExercise.id,
					title: libraryExercise.title,
					skill: libraryExercise.skill,
					part: libraryExercise.part,
					type: libraryExercise.type,
					status: libraryExercise.status,
				})
				.from(libraryExercise)
				.where(inArray(libraryExercise.id, slice));
			for (const row of rows) {
				foundById.set(row.id, row);
			}
		}

		for (const id of exerciseIds) {
			const row = foundById.get(id);
			if (!row) {
				return {
					ok: false,
					status: 404,
					error: "library_exercise not found",
				};
			}
			if (row.status !== "ready") {
				return {
					ok: false,
					status: 422,
					error: "library_exercise must be ready",
				};
			}
			if (!isStudyPackSkill(row.skill)) {
				return {
					ok: false,
					status: 422,
					error: `skill ${row.skill} is not supported in study packs`,
				};
			}
			metadataByKey.set(studyPackSourceKey("library_exercise", row.id), {
				sourceKind: "library_exercise",
				sourceId: row.id,
				title: row.title,
				skill: row.skill as StudyPackSkill,
				part: row.part,
				type: row.type,
				status: row.status,
			});
		}
	}

	return { ok: true, metadataByKey };
}

/**
 * Idempotently materialize library sources into org-scoped `assignment_prompt(ready)`
 * rows with `library_ref = "${sourceKind}:${sourceId}"`.
 */
export async function materializePrompts(
	db: Db,
	orgId: string,
	items: readonly StudyPackItemSourceRef[],
): Promise<MaterializePromptsResult> {
	const validated = await validateStudyPackItems(db, orgId, items);
	if (!validated.ok) return validated;

	const promptIdBySourceKey = new Map<string, string>();
	for (const item of items) {
		if (item.sourceKind === "org_prompt") {
			promptIdBySourceKey.set(
				studyPackSourceKey("org_prompt", item.sourceId),
				item.sourceId,
			);
		}
	}

	const libraryPartIds = [
		...new Set(
			items
				.filter((item) => item.sourceKind === "library_test_part")
				.map((item) => item.sourceId),
		),
	];
	const exerciseIds = [
		...new Set(
			items
				.filter((item) => item.sourceKind === "library_exercise")
				.map((item) => item.sourceId),
		),
	];

	const toInsert: Array<typeof assignmentPrompt.$inferInsert> = [];
	const libraryRefs: string[] = [];

	if (libraryPartIds.length > 0) {
		for (let i = 0; i < libraryPartIds.length; i += D1_IN_ARRAY_CHUNK) {
			const slice = libraryPartIds.slice(i, i + D1_IN_ARRAY_CHUNK);
			const rows = await db
				.select({
					partRow: libraryTestPart,
					testTitle: libraryTest.title,
					testSkill: libraryTest.skill,
				})
				.from(libraryTestPart)
				.innerJoin(libraryTest, eq(libraryTestPart.testId, libraryTest.id))
				.where(inArray(libraryTestPart.id, slice));
			for (const { partRow, testTitle, testSkill } of rows) {
				const libraryRef = studyPackSourceKey("library_test_part", partRow.id);
				libraryRefs.push(libraryRef);
				const flattened = flattenLibraryTestPart(partRow, testTitle);
				toInsert.push({
					id: crypto.randomUUID(),
					orgId,
					task: "task2",
					genre: "",
					skill: testSkill,
					part: partRow.part,
					type: flattened.type,
					title: flattened.title,
					band: partRow.band,
					source: partRow.source,
					prompt: "",
					intro: flattened.intro,
					passage: partRow.passage,
					transcript: partRow.transcript,
					cueTopic: "",
					cuePoints: "",
					audioName: partRow.audioName ?? "",
					imageUrl: partRow.imageUrl,
					questions: JSON.stringify(flattened.questions),
					optionBank: JSON.stringify(flattened.optionBank),
					note: partRow.note,
					status: "ready",
					libraryRef,
				});
			}
		}
	}

	if (exerciseIds.length > 0) {
		for (let i = 0; i < exerciseIds.length; i += D1_IN_ARRAY_CHUNK) {
			const slice = exerciseIds.slice(i, i + D1_IN_ARRAY_CHUNK);
			const rows = await db
				.select()
				.from(libraryExercise)
				.where(inArray(libraryExercise.id, slice));
			for (const row of rows) {
				const libraryRef = studyPackSourceKey("library_exercise", row.id);
				libraryRefs.push(libraryRef);
				toInsert.push({
					id: crypto.randomUUID(),
					orgId,
					task: "task2",
					genre: "",
					skill: row.skill,
					part: row.part,
					type: row.type,
					title: row.title,
					band: row.band,
					source: "",
					prompt: "",
					intro: row.intro,
					passage: row.passage,
					transcript: "",
					cueTopic: "",
					cuePoints: "",
					audioName: "",
					imageUrl: "",
					questions: row.questions,
					optionBank: row.optionBank,
					note: row.note,
					status: "ready",
					libraryRef,
				});
			}
		}
	}

	for (let i = 0; i < toInsert.length; i += D1_PROMPT_CLONE_INSERT_CHUNK) {
		const chunk = toInsert.slice(i, i + D1_PROMPT_CLONE_INSERT_CHUNK);
		await db.insert(assignmentPrompt).values(chunk).onConflictDoNothing();
	}

	if (libraryRefs.length > 0) {
		for (let i = 0; i < libraryRefs.length; i += D1_IN_ARRAY_CHUNK) {
			const slice = libraryRefs.slice(i, i + D1_IN_ARRAY_CHUNK);
			const persisted = await db
				.select({
					id: assignmentPrompt.id,
					libraryRef: assignmentPrompt.libraryRef,
				})
				.from(assignmentPrompt)
				.where(
					and(
						eq(assignmentPrompt.orgId, orgId),
						inArray(assignmentPrompt.libraryRef, slice),
					),
				);
			for (const row of persisted) {
				if (row.libraryRef) {
					promptIdBySourceKey.set(row.libraryRef, row.id);
				}
			}
		}
	}

	const materializedItems: Array<
		ResolvedStudyPackItemMeta & { promptId: string }
	> = [];
	for (const item of items) {
		const key = studyPackSourceKey(item.sourceKind, item.sourceId);
		const meta = validated.metadataByKey.get(key);
		const promptId = promptIdBySourceKey.get(key);
		if (!meta || !promptId) {
			return {
				ok: false,
				status: 422,
				error: "failed to materialize study pack prompt",
			};
		}
		materializedItems.push({
			...meta,
			promptId,
		});
	}

	return {
		ok: true,
		promptIdBySourceKey,
		metadataByKey: validated.metadataByKey,
		items: materializedItems,
	};
}

export function toStudyPackSummaryView(
	row: typeof studyPack.$inferSelect,
	itemRows: ReadonlyArray<{ dayIndex: number }>,
): StudyPackSummaryView {
	const dayCount =
		itemRows.length > 0
			? Math.max(...itemRows.map((item) => item.dayIndex))
			: 0;
	return {
		id: row.id,
		orgId: row.orgId,
		scope: row.orgId === null ? "system" : "org",
		title: row.title,
		description: row.description,
		status: row.status === "ready" ? "ready" : "draft",
		sourcePackId: row.sourcePackId,
		dayCount,
		itemCount: itemRows.length,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export async function loadStudyPackSummaries(
	db: Db,
	packRows: ReadonlyArray<typeof studyPack.$inferSelect>,
): Promise<StudyPackSummaryView[]> {
	if (packRows.length === 0) return [];
	const packIds = packRows.map((row) => row.id);
	const allItems: Array<{ packId: string; dayIndex: number }> = [];
	for (let i = 0; i < packIds.length; i += D1_IN_ARRAY_CHUNK) {
		const slice = packIds.slice(i, i + D1_IN_ARRAY_CHUNK);
		const rows = await db
			.select({
				packId: studyPackItem.packId,
				dayIndex: studyPackItem.dayIndex,
			})
			.from(studyPackItem)
			.where(inArray(studyPackItem.packId, slice));
		allItems.push(...rows);
	}
	const itemsByPack = new Map<string, Array<{ dayIndex: number }>>();
	for (const item of allItems) {
		const list = itemsByPack.get(item.packId) ?? [];
		list.push(item);
		itemsByPack.set(item.packId, list);
	}
	return packRows.map((row) =>
		toStudyPackSummaryView(row, itemsByPack.get(row.id) ?? []),
	);
}

export async function loadStudyPackDetailFromRow(
	db: Db,
	row: typeof studyPack.$inferSelect,
): Promise<StudyPackDetailView> {
	const itemRows = await db
		.select()
		.from(studyPackItem)
		.where(eq(studyPackItem.packId, row.id))
		.orderBy(
			asc(studyPackItem.dayIndex),
			asc(studyPackItem.position),
			asc(studyPackItem.id),
		);
	const metaMap = await resolveStudyPackItemMetadata(db, row.orgId, itemRows);
	const items: StudyPackItemView[] = itemRows.map((item) => {
		const meta = metaMap.get(
			studyPackSourceKey(item.sourceKind, item.sourceId),
		);
		return {
			id: item.id,
			dayIndex: item.dayIndex,
			position: item.position,
			sourceKind: item.sourceKind as StudyPackSourceKind,
			sourceId: item.sourceId,
			title: meta?.title ?? "",
			skill: meta?.skill ?? "reading",
			part: meta?.part ?? "",
			type: meta?.type ?? "",
			status: meta?.status ?? "draft",
			note: item.note,
		};
	});
	return {
		...toStudyPackSummaryView(row, itemRows),
		items,
	};
}

export function buildPackItemTupleKey(
	dayIndex: number,
	sourceKind: string,
	sourceId: string,
): string {
	return `${dayIndex}:${sourceKind}:${sourceId}`;
}

export function buildStudyPackItemInsertStatements(
	db: Db,
	packId: string,
	items: readonly StudyPackItemInput[],
	existingIdByTuple?: ReadonlyMap<string, string>,
): BatchItem<"sqlite">[] {
	const nextPositionByDay = new Map<number, number>();
	const values: Array<typeof studyPackItem.$inferInsert> = items.map((item) => {
		const position = nextPositionByDay.get(item.dayIndex) ?? 0;
		nextPositionByDay.set(item.dayIndex, position + 1);
		const preservedId = existingIdByTuple?.get(
			buildPackItemTupleKey(item.dayIndex, item.sourceKind, item.sourceId),
		);
		return {
			id: preservedId ?? crypto.randomUUID(),
			packId,
			dayIndex: item.dayIndex,
			position,
			sourceKind: item.sourceKind,
			sourceId: item.sourceId,
			note: item.note,
		};
	});

	const statements: BatchItem<"sqlite">[] = [];
	for (let i = 0; i < values.length; i += D1_PACK_ITEM_INSERT_CHUNK) {
		const chunk = values.slice(i, i + D1_PACK_ITEM_INSERT_CHUNK);
		statements.push(db.insert(studyPackItem).values(chunk));
	}
	return statements;
}
