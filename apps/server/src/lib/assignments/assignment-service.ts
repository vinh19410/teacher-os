import {
	ASSIGNMENT_PART_TYPES,
	ASSIGNMENT_PROMPT_ERROR_CODES,
	ASSIGNMENT_TEST_ERROR_CODES,
	ASSIGNMENT_TEST_PRESETS,
	type AssignmentPromptCreate,
	type AssignmentPromptUpdate,
	type AssignmentSkill,
	type AssignmentTestCreate,
	type AssignmentTestPartsSet,
	type AssignmentTestUpdate,
	answerKindByType,
	assignmentQuestionSchema,
	effectiveAnswerChoices,
	type KernelAssignmentPromptRow,
	type KernelAssignmentTestPartRow,
	type KernelAssignmentTestRow,
	mcqOptionsIssue,
} from "@teacher-os/api/contracts";
import { isAutoGradableSkill } from "@teacher-os/api/lib/ielts-band";
import {
	isLibrarySkill,
	librarySkillTypes,
} from "@teacher-os/api/library-contracts";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import {
	assignmentTest,
	assignmentTestPart,
} from "@teacher-os/db/schema/assignment-test";
import { classAssignment } from "@teacher-os/db/schema/class-assignment";
import { quizAttempt } from "@teacher-os/db/schema/quiz-attempt";
import { studyPack, studyPackItem } from "@teacher-os/db/schema/study-pack";
import { and, asc, desc, eq, inArray, isNull, notLike, or } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import type { Db } from "../../app";
import { parseOptionBank, parseQuestions } from "../../routes/snapshot";

const promptQuestionsSchema = z.array(assignmentQuestionSchema);

export type AssignmentServiceFailure = {
	ok: false;
	status: 400 | 404 | 409 | 500;
	error: string;
	code?: string;
	question?: number;
};

export type AssignmentServiceSuccess<T> = { ok: true; data: T };

export type AssignmentServiceResult<T> =
	| AssignmentServiceSuccess<T>
	| AssignmentServiceFailure;

export interface AssignmentPromptDetail extends KernelAssignmentPromptRow {
	isContentLocked: boolean;
	isWritingLocked: boolean;
	hasLibraryRef: boolean;
}

export interface AssignmentPromptSummary {
	id: string;
	title: string;
	skill: string;
	part: string;
	type: string;
	band: string;
	level: string;
	source: string;
	status: string;
	questionCount: number;
	hasWritingSection: boolean;
	hasAudio: boolean;
	hasImage: boolean;
	createdAt: string;
}

export interface AssignmentTestPartDetail extends KernelAssignmentTestPartRow {
	promptTitle: string;
	promptType: string;
	promptStatus: string;
	promptBand: string;
}

export interface AssignmentTestDetail
	extends Omit<KernelAssignmentTestRow, "parts"> {
	parts: AssignmentTestPartDetail[];
	isPartsLocked: boolean;
}

export interface AssignmentTestSummary {
	id: string;
	title: string;
	description: string | null;
	skill: string;
	timeLimitSeconds: number | null;
	collection: string | null;
	testGroup: string | null;
	status: string;
	partCount: number;
	slotsTotal: number;
	slotsFilled: string[];
}

function mapPromptRow(row: {
	id: string;
	task: string;
	genre: string;
	skill: string;
	part: string;
	type: string;
	title: string;
	band: string;
	level: string;
	source: string;
	prompt: string;
	intro: string;
	passage: string;
	transcript: string;
	cueTopic: string;
	cuePoints: string;
	audioName: string;
	audioUrl: string;
	imageUrl: string;
	questions: string;
	optionBank: string;
	note: string;
	status: string;
	writingPart: string | null;
	writingType: string | null;
	writingPrompt: string;
	createdAt: Date;
}): KernelAssignmentPromptRow {
	return {
		id: row.id,
		task: row.task,
		genre: row.genre,
		skill: row.skill,
		part: row.part,
		type: row.type,
		title: row.title,
		band: row.band,
		level: typeof row.level === "string" ? row.level : "",
		source: row.source,
		prompt: row.prompt,
		intro: row.intro,
		passage: row.passage,
		transcript: row.transcript,
		cueTopic: row.cueTopic,
		cuePoints: row.cuePoints,
		audioName: row.audioName,
		audioUrl: typeof row.audioUrl === "string" ? row.audioUrl : "",
		imageUrl: typeof row.imageUrl === "string" ? row.imageUrl : "",
		questions: parseQuestions(row.questions, row.id),
		optionBank: parseOptionBank(row.optionBank, row.id),
		note: row.note,
		status: row.status,
		writing: row.writingPart
			? {
					part: row.writingPart,
					type: row.writingType ?? "",
					prompt: row.writingPrompt ?? "",
				}
			: null,
		createdAt: row.createdAt.toISOString(),
	};
}

async function hasPromptContentAttempt(
	db: Db,
	orgId: string,
	promptId: string,
): Promise<boolean> {
	const [attempt] = await db
		.select({ id: quizAttempt.id })
		.from(quizAttempt)
		.leftJoin(classAssignment, eq(quizAttempt.assignmentId, classAssignment.id))
		.leftJoin(assignmentTest, eq(quizAttempt.testId, assignmentTest.id))
		.leftJoin(
			assignmentTestPart,
			eq(assignmentTestPart.testId, assignmentTest.id),
		)
		.where(
			and(
				eq(quizAttempt.orgId, orgId),
				or(
					eq(classAssignment.promptId, promptId),
					eq(assignmentTestPart.promptId, promptId),
				),
			),
		)
		.limit(1);
	return Boolean(attempt);
}

async function isPromptWritingSectionLocked(
	db: Db,
	orgId: string,
	promptId: string,
	checkInTestAndPack: boolean,
): Promise<boolean> {
	const [assigned, inTest, inPack] = await Promise.all([
		db
			.select({ id: classAssignment.id })
			.from(classAssignment)
			.where(
				and(
					eq(classAssignment.promptId, promptId),
					eq(classAssignment.orgId, orgId),
				),
			)
			.limit(1),
		checkInTestAndPack
			? db
					.select({ id: assignmentTestPart.id })
					.from(assignmentTestPart)
					.innerJoin(
						assignmentTest,
						and(
							eq(assignmentTest.id, assignmentTestPart.testId),
							eq(assignmentTest.orgId, orgId),
						),
					)
					.where(eq(assignmentTestPart.promptId, promptId))
					.limit(1)
			: Promise.resolve([]),
		checkInTestAndPack
			? db
					.select({ id: studyPackItem.id })
					.from(studyPackItem)
					.innerJoin(
						studyPack,
						and(
							eq(studyPack.id, studyPackItem.packId),
							eq(studyPack.orgId, orgId),
						),
					)
					.where(
						and(
							eq(studyPackItem.sourceKind, "org_prompt"),
							eq(studyPackItem.sourceId, promptId),
						),
					)
					.limit(1)
			: Promise.resolve([]),
	]);
	return assigned.length > 0 || inTest.length > 0 || inPack.length > 0;
}

export async function createAssignmentPrompt(
	db: Db,
	orgId: string,
	data: AssignmentPromptCreate,
): Promise<AssignmentServiceResult<{ id: string }>> {
	const [created] = await db
		.insert(assignmentPrompt)
		.values({
			id: crypto.randomUUID(),
			orgId,
			task: data.skill === "writing" ? data.part : "task2",
			genre: data.skill === "writing" ? data.type : "",
			skill: data.skill,
			part: data.part,
			type: data.type,
			title: data.title,
			band: data.band,
			level: data.level ?? "",
			source: data.source,
			prompt: data.prompt,
			intro: data.intro,
			passage: data.passage,
			transcript: data.transcript,
			cueTopic: data.cueTopic,
			cuePoints: data.cuePoints,
			audioName: data.audioName,
			audioUrl: data.audioUrl ?? "",
			imageUrl: data.imageUrl,
			questions: JSON.stringify(data.questions),
			optionBank: JSON.stringify(data.optionBank),
			note: data.note,
			status: data.status,
			writingPart: data.writing?.part ?? null,
			writingType: data.writing?.type ?? null,
			writingPrompt: data.writing?.prompt ?? "",
		})
		.returning({ id: assignmentPrompt.id });
	if (!created) {
		return { ok: false, status: 500, error: "prompt write conflict" };
	}
	return { ok: true, data: created };
}

export async function updateAssignmentPrompt(
	db: Db,
	orgId: string,
	promptId: string,
	data: AssignmentPromptUpdate,
): Promise<AssignmentServiceResult<{ id: string }>> {
	const [row] = await db
		.select({
			skill: assignmentPrompt.skill,
			part: assignmentPrompt.part,
			type: assignmentPrompt.type,
			genre: assignmentPrompt.genre,
			status: assignmentPrompt.status,
			prompt: assignmentPrompt.prompt,
			intro: assignmentPrompt.intro,
			passage: assignmentPrompt.passage,
			transcript: assignmentPrompt.transcript,
			cueTopic: assignmentPrompt.cueTopic,
			cuePoints: assignmentPrompt.cuePoints,
			audioName: assignmentPrompt.audioName,
			audioUrl: assignmentPrompt.audioUrl,
			imageUrl: assignmentPrompt.imageUrl,
			note: assignmentPrompt.note,
			questions: assignmentPrompt.questions,
			optionBank: assignmentPrompt.optionBank,
			writingPart: assignmentPrompt.writingPart,
			writingType: assignmentPrompt.writingType,
			writingPrompt: assignmentPrompt.writingPrompt,
			libraryRef: assignmentPrompt.libraryRef,
		})
		.from(assignmentPrompt)
		.where(
			and(eq(assignmentPrompt.id, promptId), eq(assignmentPrompt.orgId, orgId)),
		);
	if (!row) {
		return { ok: false, status: 404, error: "prompt not found" };
	}

	const slotTypes =
		ASSIGNMENT_PART_TYPES[row.skill as AssignmentSkill]?.types[row.part] ?? [];
	const partTypes =
		(row.libraryRef ?? "").trim().length > 0 && isLibrarySkill(row.skill)
			? [...new Set([...slotTypes, ...librarySkillTypes(row.skill)])]
			: slotTypes;
	const effectiveStatus = data.status ?? row.status;
	const effectiveType = data.type !== undefined ? data.type : row.type;
	if (effectiveStatus === "ready") {
		if (!effectiveType || !partTypes.includes(effectiveType)) {
			return { ok: false, status: 400, error: "invalid type" };
		}
	} else if (row.skill === "writing") {
		if (effectiveType && !partTypes.includes(effectiveType)) {
			return { ok: false, status: 400, error: "invalid type" };
		}
	} else if (!effectiveType || !partTypes.includes(effectiveType)) {
		return { ok: false, status: 400, error: "invalid type" };
	}

	if (data.questions !== undefined) {
		const effectivePromptType = data.type ?? row.type;
		for (const [index, question] of data.questions.entries()) {
			if (question.type && !partTypes.includes(question.type)) {
				return {
					ok: false,
					status: 400,
					error: "invalid question type",
					question: index,
				};
			}
			const kind =
				answerKindByType[question.type ?? effectivePromptType] ?? null;
			if (!kind) continue;
			if (mcqOptionsIssue(kind, question.opts)) {
				return {
					ok: false,
					status: 400,
					error: "invalid mcq options",
					question: index,
				};
			}
			if (
				question.answer &&
				!effectiveAnswerChoices(kind, question.opts).includes(question.answer)
			) {
				return {
					ok: false,
					status: 400,
					error: "invalid answer choice",
					question: index,
				};
			}
		}
	}
	if (
		data.questions?.length &&
		row.skill !== "reading" &&
		row.skill !== "listening" &&
		row.skill !== "grammar" &&
		row.skill !== "vocabulary"
	) {
		return {
			ok: false,
			status: 400,
			error: "questions only apply to reading or listening",
		};
	}
	if (data.audioUrl?.trim() && row.skill !== "listening") {
		return {
			ok: false,
			status: 400,
			error: "audioUrl only applies to listening prompts",
		};
	}

	let writingChanged = false;
	if (data.writing !== undefined) {
		if (data.writing !== null && !isAutoGradableSkill(row.skill)) {
			return {
				ok: false,
				status: 400,
				error: "writing section only applies to auto-graded skills",
			};
		}
		const nextW = data.writing;
		const curW = row.writingPart
			? {
					part: row.writingPart,
					type: row.writingType ?? "",
					prompt: row.writingPrompt ?? "",
				}
			: null;
		writingChanged =
			nextW === null || curW === null
				? nextW !== curW
				: nextW.part.trim() !== curW.part.trim() ||
					nextW.type.trim() !== curW.type.trim() ||
					nextW.prompt.trim() !== curW.prompt.trim();
		if (writingChanged) {
			const locked = await isPromptWritingSectionLocked(
				db,
				orgId,
				promptId,
				nextW !== null,
			);
			if (locked) {
				return {
					ok: false,
					status: 409,
					error: "writing section locked",
					code: ASSIGNMENT_PROMPT_ERROR_CODES.WRITING_SECTION_LOCKED,
				};
			}
		}
	}

	let contentChanged = writingChanged;
	for (const [stored, incoming] of [
		[row.type, data.type],
		[row.prompt, data.prompt],
		[row.intro, data.intro],
		[row.passage, data.passage],
		[row.transcript, data.transcript],
		[row.cueTopic, data.cueTopic],
		[row.cuePoints, data.cuePoints],
		[row.audioName, data.audioName],
		[row.audioUrl, data.audioUrl],
		[row.imageUrl, data.imageUrl],
		[row.note, data.note],
	] as const) {
		if (
			incoming !== undefined &&
			(incoming ?? "").trim() !== (stored ?? "").trim()
		) {
			contentChanged = true;
			break;
		}
	}
	if (!contentChanged && data.questions !== undefined) {
		const normalizeQuestions = (value: unknown) => {
			const parsed = promptQuestionsSchema.safeParse(value);
			if (!parsed.success) return JSON.stringify(value);
			return JSON.stringify(
				parsed.data.map((q) => ({
					stem: q.stem,
					opts: q.opts ?? null,
					answer: q.answer,
					alts: q.alts,
					...(q.type ? { type: q.type } : {}),
					...(q.pin != null ? { pin: { x: q.pin.x, y: q.pin.y } } : {}),
					...(q.explanation !== undefined
						? { explanation: q.explanation }
						: {}),
					...(q.answerSet ? { answerSet: q.answerSet } : {}),
				})),
			);
		};
		let storedQuestions: unknown;
		try {
			storedQuestions = row.questions ? JSON.parse(row.questions) : [];
		} catch {
			storedQuestions = [];
		}
		contentChanged =
			normalizeQuestions(storedQuestions) !==
			normalizeQuestions(data.questions);
	}
	if (!contentChanged && data.optionBank !== undefined) {
		contentChanged =
			JSON.stringify(
				parseOptionBank(row.optionBank, promptId).map((item) => item.trim()),
			) !== JSON.stringify(data.optionBank.map((item) => item.trim()));
	}
	if (contentChanged) {
		if (await hasPromptContentAttempt(db, orgId, promptId)) {
			return {
				ok: false,
				status: 409,
				error: "prompt content locked",
				code: ASSIGNMENT_PROMPT_ERROR_CODES.CONTENT_LOCKED,
			};
		}
	}

	const updates: Partial<typeof assignmentPrompt.$inferInsert> = {};
	if (data.title !== undefined) updates.title = data.title;
	if (data.band !== undefined) updates.band = data.band;
	if (data.level !== undefined) updates.level = data.level;
	if (data.source !== undefined) updates.source = data.source;
	if (data.status !== undefined) updates.status = data.status;

	if (contentChanged) {
		if (data.type !== undefined) {
			updates.type = data.type;
			updates.genre = row.skill === "writing" ? data.type : "";
		}
		if (data.prompt !== undefined) updates.prompt = data.prompt;
		if (data.intro !== undefined) updates.intro = data.intro;
		if (data.passage !== undefined) updates.passage = data.passage;
		if (data.transcript !== undefined) updates.transcript = data.transcript;
		if (data.cueTopic !== undefined) updates.cueTopic = data.cueTopic;
		if (data.cuePoints !== undefined) updates.cuePoints = data.cuePoints;
		if (data.audioName !== undefined) updates.audioName = data.audioName;
		if (data.audioUrl !== undefined) updates.audioUrl = data.audioUrl;
		if (data.imageUrl !== undefined) updates.imageUrl = data.imageUrl;
		if (data.note !== undefined) updates.note = data.note;
		if (data.questions !== undefined)
			updates.questions = JSON.stringify(data.questions);
		if (data.optionBank !== undefined)
			updates.optionBank = JSON.stringify(data.optionBank);
		if (data.writing !== undefined) {
			if (data.writing === null) {
				updates.writingPart = null;
				updates.writingType = null;
				updates.writingPrompt = "";
			} else {
				updates.writingPart = data.writing.part;
				updates.writingType = data.writing.type;
				updates.writingPrompt = data.writing.prompt;
			}
		}
	}

	if (Object.keys(updates).length === 0) {
		return { ok: true, data: { id: promptId } };
	}
	const updated = await db
		.update(assignmentPrompt)
		.set(updates)
		.where(
			and(eq(assignmentPrompt.id, promptId), eq(assignmentPrompt.orgId, orgId)),
		)
		.returning({ id: assignmentPrompt.id });
	if (!updated[0]) {
		return { ok: false, status: 404, error: "prompt not found" };
	}
	return { ok: true, data: { id: promptId } };
}

export async function listAssignmentPrompts(
	db: Db,
	orgId: string,
	opts: {
		skill?: AssignmentSkill;
		part?: string;
		status?: "draft" | "ready";
		query?: string;
		limit: number;
		offset: number;
	},
): Promise<{
	items: AssignmentPromptSummary[];
	total: number;
	hasMore: boolean;
	nextOffset?: number;
}> {
	const conditions = [
		eq(assignmentPrompt.orgId, orgId),
		isNull(assignmentPrompt.libraryRef),
		notLike(assignmentPrompt.id, "demo-prompt:%"),
	];
	if (opts.skill) conditions.push(eq(assignmentPrompt.skill, opts.skill));
	if (opts.part) conditions.push(eq(assignmentPrompt.part, opts.part));
	if (opts.status) conditions.push(eq(assignmentPrompt.status, opts.status));

	const rows = await db
		.select({
			id: assignmentPrompt.id,
			title: assignmentPrompt.title,
			skill: assignmentPrompt.skill,
			part: assignmentPrompt.part,
			type: assignmentPrompt.type,
			band: assignmentPrompt.band,
			level: assignmentPrompt.level,
			source: assignmentPrompt.source,
			status: assignmentPrompt.status,
			questions: assignmentPrompt.questions,
			writingPart: assignmentPrompt.writingPart,
			audioName: assignmentPrompt.audioName,
			audioUrl: assignmentPrompt.audioUrl,
			imageUrl: assignmentPrompt.imageUrl,
			createdAt: assignmentPrompt.createdAt,
		})
		.from(assignmentPrompt)
		.where(and(...conditions))
		.orderBy(desc(assignmentPrompt.createdAt), desc(assignmentPrompt.id));

	const needle = opts.query?.trim().toLowerCase() ?? "";
	const filtered = needle
		? rows.filter(
				(row) =>
					row.title.toLowerCase().includes(needle) ||
					row.source.toLowerCase().includes(needle) ||
					row.type.toLowerCase().includes(needle),
			)
		: rows;

	const total = filtered.length;
	const sliced = filtered.slice(opts.offset, opts.offset + opts.limit);
	const items: AssignmentPromptSummary[] = sliced.map((row) => ({
		id: row.id,
		title: row.title,
		skill: row.skill,
		part: row.part,
		type: row.type,
		band: row.band,
		level: row.level ?? "",
		source: row.source,
		status: row.status,
		questionCount: parseQuestions(row.questions, row.id).length,
		hasWritingSection: Boolean(row.writingPart),
		hasAudio: Boolean(row.audioName.trim() || row.audioUrl.trim()),
		hasImage: Boolean(row.imageUrl.trim()),
		createdAt: row.createdAt.toISOString(),
	}));
	const hasMore = opts.offset + items.length < total;
	return {
		items,
		total,
		hasMore,
		...(hasMore ? { nextOffset: opts.offset + items.length } : {}),
	};
}

export async function getAssignmentPromptDetail(
	db: Db,
	orgId: string,
	promptId: string,
): Promise<AssignmentPromptDetail | null> {
	const [row] = await db
		.select()
		.from(assignmentPrompt)
		.where(
			and(eq(assignmentPrompt.id, promptId), eq(assignmentPrompt.orgId, orgId)),
		)
		.limit(1);
	if (!row) return null;
	const [isContentLocked, isWritingLocked] = await Promise.all([
		hasPromptContentAttempt(db, orgId, promptId),
		row.writingPart
			? isPromptWritingSectionLocked(db, orgId, promptId, true)
			: Promise.resolve(false),
	]);
	return {
		...mapPromptRow(row),
		isContentLocked,
		isWritingLocked,
		hasLibraryRef: Boolean((row.libraryRef ?? "").trim()),
	};
}

async function validateTestPartsForSkill(
	db: Db,
	orgId: string,
	skill: string,
	parts: AssignmentTestPartsSet,
): Promise<
	AssignmentServiceResult<{
		preset: { slots: { part: string; label: string }[] };
	}>
> {
	const preset = ASSIGNMENT_TEST_PRESETS[skill as AssignmentSkill];
	if (!preset) {
		return { ok: false, status: 400, error: "invalid test skill" };
	}
	for (const item of parts) {
		if (!preset.slots.some((slot) => slot.part === item.part)) {
			return { ok: false, status: 400, error: "invalid part slot for skill" };
		}
	}
	const promptIds = [...new Set(parts.map((item) => item.promptId))];
	const promptRows = promptIds.length
		? await db
				.select({
					id: assignmentPrompt.id,
					skill: assignmentPrompt.skill,
					part: assignmentPrompt.part,
					writingPart: assignmentPrompt.writingPart,
				})
				.from(assignmentPrompt)
				.where(
					and(
						eq(assignmentPrompt.orgId, orgId),
						inArray(assignmentPrompt.id, promptIds),
					),
				)
		: [];
	const promptsById = new Map(promptRows.map((row) => [row.id, row]));
	for (const item of parts) {
		const prompt = promptsById.get(item.promptId);
		if (!prompt) return { ok: false, status: 400, error: "prompt not found" };
		if (prompt.skill !== skill) {
			return { ok: false, status: 400, error: "prompt skill mismatch" };
		}
		if (prompt.part !== item.part) {
			return { ok: false, status: 400, error: "prompt part mismatch" };
		}
		if (prompt.writingPart !== null) {
			return {
				ok: false,
				status: 400,
				error: "hybrid prompt cannot be attached to test",
			};
		}
	}
	return { ok: true, data: { preset } };
}

export async function createAssignmentTest(
	db: Db,
	orgId: string,
	data: AssignmentTestCreate,
	initialParts?: AssignmentTestPartsSet,
): Promise<AssignmentServiceResult<{ id: string }>> {
	const testId = crypto.randomUUID();
	if (initialParts && initialParts.length > 0) {
		const check = await validateTestPartsForSkill(
			db,
			orgId,
			data.skill,
			initialParts,
		);
		if (!check.ok) return check;
		const { preset } = check.data;
		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db.insert(assignmentTest).values({
				id: testId,
				orgId,
				title: data.title,
				description: data.description ?? null,
				skill: data.skill,
				timeLimitSeconds: data.timeLimitSeconds,
				collection: data.collection ?? null,
				testGroup: data.testGroup ?? null,
				status: "draft",
			}),
			...initialParts.map((item) =>
				db.insert(assignmentTestPart).values({
					id: crypto.randomUUID(),
					testId,
					promptId: item.promptId,
					part: item.part,
					position: preset.slots.findIndex((slot) => slot.part === item.part),
					qStartOverride: item.qStartOverride ?? null,
				}),
			),
		];
		await db.batch(statements);
		return { ok: true, data: { id: testId } };
	}

	const [created] = await db
		.insert(assignmentTest)
		.values({
			id: testId,
			orgId,
			title: data.title,
			description: data.description ?? null,
			skill: data.skill,
			timeLimitSeconds: data.timeLimitSeconds,
			collection: data.collection ?? null,
			testGroup: data.testGroup ?? null,
			status: "draft",
		})
		.returning({ id: assignmentTest.id });
	if (!created) {
		return { ok: false, status: 500, error: "test write conflict" };
	}
	return { ok: true, data: created };
}

export async function updateAssignmentTest(
	db: Db,
	orgId: string,
	testId: string,
	data: AssignmentTestUpdate,
): Promise<AssignmentServiceResult<{ id: string }>> {
	const [row] = await db
		.select({ skill: assignmentTest.skill })
		.from(assignmentTest)
		.where(and(eq(assignmentTest.id, testId), eq(assignmentTest.orgId, orgId)));
	if (!row) {
		return { ok: false, status: 404, error: "test not found" };
	}
	if (data.skill !== undefined && data.skill !== row.skill) {
		return { ok: false, status: 400, error: "skill is immutable" };
	}

	const updates: Partial<typeof assignmentTest.$inferInsert> = {};
	if (data.title !== undefined) updates.title = data.title;
	if (data.description !== undefined) updates.description = data.description;
	if (data.timeLimitSeconds !== undefined)
		updates.timeLimitSeconds = data.timeLimitSeconds;
	if (data.collection !== undefined) updates.collection = data.collection;
	if (data.testGroup !== undefined) updates.testGroup = data.testGroup;
	if (data.status !== undefined) updates.status = data.status;

	if (Object.keys(updates).length === 0) {
		return { ok: true, data: { id: testId } };
	}
	const updated = await db
		.update(assignmentTest)
		.set(updates)
		.where(and(eq(assignmentTest.id, testId), eq(assignmentTest.orgId, orgId)))
		.returning({ id: assignmentTest.id });
	if (!updated[0]) {
		return { ok: false, status: 404, error: "test not found" };
	}
	return { ok: true, data: { id: testId } };
}

export async function setAssignmentTestParts(
	db: Db,
	orgId: string,
	testId: string,
	parts: AssignmentTestPartsSet,
): Promise<AssignmentServiceResult<{ id: string }>> {
	const [test] = await db
		.select({ skill: assignmentTest.skill })
		.from(assignmentTest)
		.where(and(eq(assignmentTest.id, testId), eq(assignmentTest.orgId, orgId)));
	if (!test) {
		return { ok: false, status: 404, error: "test not found" };
	}

	const check = await validateTestPartsForSkill(db, orgId, test.skill, parts);
	if (!check.ok) return check;
	const { preset } = check.data;

	const existingParts = await db
		.select({
			part: assignmentTestPart.part,
			promptId: assignmentTestPart.promptId,
			qStartOverride: assignmentTestPart.qStartOverride,
		})
		.from(assignmentTestPart)
		.where(eq(assignmentTestPart.testId, testId));

	const existingMap = new Map(
		existingParts.map((p) => [
			p.part,
			{ promptId: p.promptId, qStartOverride: p.qStartOverride ?? null },
		]),
	);
	const incomingMap = new Map(
		parts.map((p) => [
			p.part,
			{ promptId: p.promptId, qStartOverride: p.qStartOverride ?? null },
		]),
	);

	let partsChanged = existingMap.size !== incomingMap.size;
	if (!partsChanged) {
		for (const [part, incoming] of incomingMap) {
			const existing = existingMap.get(part);
			if (
				!existing ||
				existing.promptId !== incoming.promptId ||
				existing.qStartOverride !== incoming.qStartOverride
			) {
				partsChanged = true;
				break;
			}
		}
	}

	if (!partsChanged) {
		return { ok: true, data: { id: testId } };
	}

	const [attempt] = await db
		.select({ id: quizAttempt.id })
		.from(quizAttempt)
		.where(and(eq(quizAttempt.orgId, orgId), eq(quizAttempt.testId, testId)))
		.limit(1);

	if (attempt) {
		return {
			ok: false,
			status: 409,
			error: "test parts locked",
			code: ASSIGNMENT_TEST_ERROR_CODES.PARTS_LOCKED,
		};
	}

	const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
		db.delete(assignmentTestPart).where(eq(assignmentTestPart.testId, testId)),
		...parts.map((item) =>
			db.insert(assignmentTestPart).values({
				id: crypto.randomUUID(),
				testId,
				promptId: item.promptId,
				part: item.part,
				position: preset.slots.findIndex((slot) => slot.part === item.part),
				qStartOverride: item.qStartOverride ?? null,
			}),
		),
	];
	await db.batch(statements);
	return { ok: true, data: { id: testId } };
}

export async function listAssignmentTests(
	db: Db,
	orgId: string,
	opts: {
		skill?: AssignmentSkill;
		status?: "draft" | "ready";
		query?: string;
		limit: number;
		offset: number;
	},
): Promise<{
	items: AssignmentTestSummary[];
	total: number;
	hasMore: boolean;
	nextOffset?: number;
}> {
	const conditions = [
		eq(assignmentTest.orgId, orgId),
		isNull(assignmentTest.libraryRef),
		notLike(assignmentTest.id, "demo-test:%"),
	];
	if (opts.skill) conditions.push(eq(assignmentTest.skill, opts.skill));
	if (opts.status) conditions.push(eq(assignmentTest.status, opts.status));

	const testRows = await db
		.select()
		.from(assignmentTest)
		.where(and(...conditions))
		.orderBy(desc(assignmentTest.createdAt), desc(assignmentTest.id));

	const needle = opts.query?.trim().toLowerCase() ?? "";
	const filtered = needle
		? testRows.filter(
				(row) =>
					row.title.toLowerCase().includes(needle) ||
					(row.collection ?? "").toLowerCase().includes(needle) ||
					(row.testGroup ?? "").toLowerCase().includes(needle),
			)
		: testRows;

	const total = filtered.length;
	const sliced = filtered.slice(opts.offset, opts.offset + opts.limit);
	const testIds = sliced.map((r) => r.id);
	const partRows = testIds.length
		? await db
				.select({
					testId: assignmentTestPart.testId,
					part: assignmentTestPart.part,
					position: assignmentTestPart.position,
				})
				.from(assignmentTestPart)
				.where(inArray(assignmentTestPart.testId, testIds))
				.orderBy(asc(assignmentTestPart.position))
		: [];
	const partsByTest = new Map<string, string[]>();
	for (const p of partRows) {
		const list = partsByTest.get(p.testId) ?? [];
		list.push(p.part);
		partsByTest.set(p.testId, list);
	}

	const items: AssignmentTestSummary[] = sliced.map((row) => {
		const slotsFilled = partsByTest.get(row.id) ?? [];
		const preset = ASSIGNMENT_TEST_PRESETS[row.skill as AssignmentSkill];
		return {
			id: row.id,
			title: row.title,
			description: row.description ?? null,
			skill: row.skill,
			timeLimitSeconds: row.timeLimitSeconds ?? null,
			collection: row.collection ?? null,
			testGroup: row.testGroup ?? null,
			status: row.status,
			partCount: slotsFilled.length,
			slotsTotal: preset?.slots.length ?? 0,
			slotsFilled,
		};
	});
	const hasMore = opts.offset + items.length < total;
	return {
		items,
		total,
		hasMore,
		...(hasMore ? { nextOffset: opts.offset + items.length } : {}),
	};
}

export async function getAssignmentTestDetail(
	db: Db,
	orgId: string,
	testId: string,
): Promise<AssignmentTestDetail | null> {
	const [row] = await db
		.select()
		.from(assignmentTest)
		.where(and(eq(assignmentTest.id, testId), eq(assignmentTest.orgId, orgId)))
		.limit(1);
	if (!row) return null;

	const [partRows, attempt] = await Promise.all([
		db
			.select({
				id: assignmentTestPart.id,
				testId: assignmentTestPart.testId,
				part: assignmentTestPart.part,
				promptId: assignmentTestPart.promptId,
				position: assignmentTestPart.position,
				qStartOverride: assignmentTestPart.qStartOverride,
				promptTitle: assignmentPrompt.title,
				promptType: assignmentPrompt.type,
				promptStatus: assignmentPrompt.status,
				promptBand: assignmentPrompt.band,
			})
			.from(assignmentTestPart)
			.innerJoin(
				assignmentPrompt,
				eq(assignmentPrompt.id, assignmentTestPart.promptId),
			)
			.where(
				and(
					eq(assignmentTestPart.testId, testId),
					eq(assignmentPrompt.orgId, orgId),
				),
			)
			.orderBy(asc(assignmentTestPart.position)),
		db
			.select({ id: quizAttempt.id })
			.from(quizAttempt)
			.where(and(eq(quizAttempt.orgId, orgId), eq(quizAttempt.testId, testId)))
			.limit(1),
	]);

	return {
		id: row.id,
		title: row.title,
		description: row.description ?? null,
		skill: row.skill,
		timeLimitSeconds: row.timeLimitSeconds ?? null,
		collection: row.collection ?? null,
		testGroup: row.testGroup ?? null,
		status: row.status,
		parts: partRows.map((p) => ({
			id: p.id,
			testId: p.testId,
			part: p.part,
			promptId: p.promptId,
			position: p.position,
			qStartOverride: p.qStartOverride ?? null,
			promptTitle: p.promptTitle,
			promptType: p.promptType,
			promptStatus: p.promptStatus,
			promptBand: p.promptBand,
		})),
		isPartsLocked: Boolean(attempt[0]),
	};
}
