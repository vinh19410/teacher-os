/**
 * Org-scoped kernel snapshot loader — shared by the kernel routes and the
 * assignments sub-router (kept in its own module to avoid a circular import
 * between the two route files).
 */
import {
	CLASS_TYPES,
	type ClassType,
	type KernelLessonRow,
	type KernelSnapshot,
} from "@teacher-os/api/contracts";
import { canAccessFinance } from "@teacher-os/auth/role";
import { assignment } from "@teacher-os/db/schema/assignment";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import {
	assignmentTest,
	assignmentTestPart,
} from "@teacher-os/db/schema/assignment-test";
import { classTable } from "@teacher-os/db/schema/class";
import {
	classAssignment,
	classAssignmentTarget,
} from "@teacher-os/db/schema/class-assignment";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import { invoice } from "@teacher-os/db/schema/invoice";
import { lesson } from "@teacher-os/db/schema/lesson";
import { orgEvent } from "@teacher-os/db/schema/org-event";
import {
	holidaySessionCancel,
	holidaySessionShift,
	organizationHoliday,
} from "@teacher-os/db/schema/organization-holiday";
import { quizAttempt } from "@teacher-os/db/schema/quiz-attempt";
import { sessionPackage } from "@teacher-os/db/schema/session-package";
import { student } from "@teacher-os/db/schema/student";
import {
	syllabus,
	syllabusLesson,
	syllabusModule,
} from "@teacher-os/db/schema/syllabus";
import {
	vocabDeck,
	vocabSuggestion,
	vocabWord,
} from "@teacher-os/db/schema/vocab";
import { and, asc, desc, eq, isNull, notLike } from "drizzle-orm";
import type { Db } from "../app";
import { toQuizAttemptGrade } from "../lib/quiz-grade";
import { loadCommentBank, loadNotifs, loadReports } from "./reporting/loaders";

/** Shared explicit projection for the list endpoint and kernel snapshot. */
export async function loadInvoices(
	db: Db,
	orgId: string,
): Promise<KernelSnapshot["invoices"]> {
	const rows = await db
		.select({
			id: invoice.id,
			studentId: invoice.studentId,
			due: invoice.due,
			note: invoice.note,
			enrollmentId: invoice.enrollmentId,
			amount: invoice.amount,
			status: invoice.status,
			date: invoice.date,
			type: invoice.type,
			method: invoice.method,
			paidAmount: invoice.paidAmount,
			createdAt: invoice.createdAt,
		})
		.from(invoice)
		.innerJoin(
			student,
			and(eq(invoice.studentId, student.id), eq(invoice.orgId, student.orgId)),
		)
		.where(eq(invoice.orgId, orgId))
		.orderBy(asc(invoice.createdAt), asc(invoice.id));
	// #343 — `timestamp_ms` lands as a JS Date; the wire convention is an
	// explicit ISO string (same as the other createdAt projections below).
	return rows.map((row) => ({
		...row,
		createdAt: row.createdAt.toISOString(),
	}));
}

/** Sự kiện vận hành của org (TOS-14 / #447) — tách riêng khỏi lesson. */
export async function loadEvents(
	db: Db,
	orgId: string,
): Promise<KernelSnapshot["events"]> {
	const rows = await db
		.select()
		.from(orgEvent)
		.where(eq(orgEvent.orgId, orgId))
		.orderBy(asc(orgEvent.date), asc(orgEvent.startTime), asc(orgEvent.id));
	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		date: row.date,
		startTime: row.startTime,
		endTime: row.endTime,
		note: row.note,
		createdByUserId: row.createdByUserId,
		createdAt: row.createdAt.toISOString(),
	}));
}

/**
 * `class.skills` is a JSON array string; corrupted or legacy values fall
 * back to an empty array so the snapshot shape stays `string[]`.
 */
function parseSkills(raw: string): string[] {
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((s) => typeof s === "string")
			: [];
	} catch {
		return [];
	}
}

/** Phase-04 FR1 — pin guard: a valid pin is an object with numeric 0–100
 * percents; anything else (legacy rows, corrupt JSON) falls back to null so
 * the snapshot shape stays `pin | null` (never `undefined` — the web shape
 * guards check for null). */
export function parsePin(raw: unknown): { x: number; y: number } | null {
	if (!raw || typeof raw !== "object") return null;
	const record = raw as Record<string, unknown>;
	const { x, y } = record;
	return typeof x === "number" &&
		Number.isFinite(x) &&
		x >= 0 &&
		x <= 100 &&
		typeof y === "number" &&
		Number.isFinite(y) &&
		y >= 0 &&
		y <= 100
		? { x, y }
		: null;
}

function parseQuestions(
	raw: string,
	rowId: string,
): KernelSnapshot["assignmentPrompts"][number]["questions"] {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			console.warn(
				`[kernel] invalid assignment prompt questions JSON for row ${rowId}`,
			);
			return [];
		}
		return parsed.flatMap((item) => {
			if (!item || typeof item !== "object") return [];
			const record = item as Record<string, unknown>;
			return [
				{
					stem: typeof record.stem === "string" ? record.stem : "",
					opts: Array.isArray(record.opts)
						? record.opts.filter(
								(option): option is string => typeof option === "string",
							)
						: null,
					answer: typeof record.answer === "string" ? record.answer : "",
					alts: typeof record.alts === "string" ? record.alts : "",
					// Per-question type (#286) — forward như pin: write path persist
					// field này trong cùng JSON, đây là read path duy nhất; strip nó
					// thì mọi edit/Apply qua test-builder xoá âm thầm type đã soạn.
					type: typeof record.type === "string" ? record.type : null,
					// Phase-04 FR7 — forward the pin or the image labels vanish on
					// the first reload (the write path persists them inside this
					// same JSON; this destructure is the only read path).
					pin: parsePin(record.pin),
					// TOS-26 (#472): forward explanation khi có để giải thích đáp án
					// không bị rơi lúc load snapshot ngân hàng đề.
					...(typeof record.explanation === "string"
						? { explanation: record.explanation }
						: {}),
				},
			];
		});
	} catch {
		console.warn(
			`[kernel] invalid assignment prompt questions JSON for row ${rowId}`,
		);
		return [];
	}
}

/** Phase-02 FR7 — same guard style as parseQuestions: legacy rows carry the
 * `"[]"` column default; corrupted JSON or non-string items fall back to []
 * so the snapshot shape stays `string[]`. */
function parseOptionBank(
	raw: string,
	rowId: string,
): KernelSnapshot["assignmentPrompts"][number]["optionBank"] {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			console.warn(
				`[kernel] invalid assignment prompt option bank JSON for row ${rowId}`,
			);
			return [];
		}
		// Read-path defense in depth: the contract caps banks at 8 on write;
		// a corrupt row with more items would render empty `bankLabel`s.
		return parsed
			.filter((item): item is string => typeof item === "string")
			.slice(0, 8);
	} catch {
		console.warn(
			`[kernel] invalid assignment prompt option bank JSON for row ${rowId}`,
		);
		return [];
	}
}

/** DB text column guard: unknown type values fall back to "ielts". */
const knownClassTypes = new Set<string>(CLASS_TYPES);

/** Shared by the kernel routes and the assignments sub-router. */
export async function loadSnapshot(
	db: Db,
	orgId: string,
	opts?: { role?: string },
): Promise<KernelSnapshot> {
	const viewerRole = opts?.role ?? "teacher";
	const financeAllowed = canAccessFinance(viewerRole);
	const [
		studentRows,
		classRows,
		enrollmentRows,
		packageRows,
		syllabusRows,
		moduleRows,
		lessonRows,
		scheduledRows,
		assignmentRows,
		assignmentPromptRows,
		invoiceRows,
		reportRows,
		notifRows,
		commentBankRows,
		assignmentTestRows,
		assignmentTestPartRows,
		vocabDeckRows,
		vocabWordDeckIds,
		vocabSuggestionRows,
		holidayRows,
		holidayShiftRows,
		holidayCancelRows,
		eventRows,
	] = await Promise.all([
		db
			.select()
			.from(student)
			.where(
				and(eq(student.orgId, orgId), notLike(student.id, "demo-student:%")),
			)
			.orderBy(asc(student.createdAt)),
		db
			.select()
			.from(classTable)
			.where(eq(classTable.orgId, orgId))
			.orderBy(asc(classTable.createdAt)),
		db
			.select()
			.from(enrollment)
			.where(eq(enrollment.orgId, orgId))
			.orderBy(asc(enrollment.createdAt)),
		db
			.select({
				id: sessionPackage.id,
				enrollmentId: sessionPackage.enrollmentId,
				classId: enrollment.classId,
				studentId: sessionPackage.studentId,
				total: sessionPackage.total,
				price: sessionPackage.price,
				mode: sessionPackage.mode,
				start: sessionPackage.start,
				expiry: sessionPackage.expiry,
				status: sessionPackage.status,
				createdAt: sessionPackage.createdAt,
			})
			.from(sessionPackage)
			// LEFT JOIN (issue #104): parked packages have no enrollment yet but
			// must still reach the snapshot; classId then comes out null. The
			// org predicate on the join keeps a hypothetical cross-org
			// enrollment_id from leaking a classId across tenants.
			.leftJoin(
				enrollment,
				and(
					eq(sessionPackage.enrollmentId, enrollment.id),
					eq(enrollment.orgId, sessionPackage.orgId),
				),
			)
			.where(eq(sessionPackage.orgId, orgId))
			.orderBy(asc(sessionPackage.createdAt)),
		db
			.select()
			.from(syllabus)
			.where(eq(syllabus.orgId, orgId))
			.orderBy(asc(syllabus.createdAt)),
		db
			.select()
			.from(syllabusModule)
			.where(eq(syllabusModule.orgId, orgId))
			.orderBy(asc(syllabusModule.position), asc(syllabusModule.createdAt)),
		db
			.select()
			.from(syllabusLesson)
			.where(eq(syllabusLesson.orgId, orgId))
			.orderBy(asc(syllabusLesson.position), asc(syllabusLesson.createdAt)),
		db
			.select()
			.from(lesson)
			.where(eq(lesson.orgId, orgId))
			.orderBy(asc(lesson.day), asc(lesson.time), asc(lesson.createdAt)),
		db
			.select()
			.from(assignment)
			.where(eq(assignment.orgId, orgId))
			.orderBy(asc(assignment.createdAt)),
		db
			.select()
			.from(assignmentPrompt)
			.where(
				and(
					eq(assignmentPrompt.orgId, orgId),
					notLike(assignmentPrompt.id, "demo-prompt:%"),
					isNull(assignmentPrompt.libraryRef),
				),
			)
			.orderBy(asc(assignmentPrompt.createdAt), asc(assignmentPrompt.id)),
		financeAllowed ? loadInvoices(db, orgId) : Promise.resolve([]),
		loadReports(db, orgId),
		loadNotifs(db, orgId),
		loadCommentBank(db, orgId),
		db
			.select()
			.from(assignmentTest)
			.where(
				and(
					eq(assignmentTest.orgId, orgId),
					notLike(assignmentTest.id, "demo-test:%"),
				),
			)
			.orderBy(asc(assignmentTest.createdAt), asc(assignmentTest.id)),
		db
			.select({
				testId: assignmentTestPart.testId,
				promptId: assignmentTestPart.promptId,
				part: assignmentTestPart.part,
				position: assignmentTestPart.position,
				qStartOverride: assignmentTestPart.qStartOverride,
			})
			.from(assignmentTestPart)
			// Org scope qua join với test (part không có orgId — schema
			// phase-01); KHÔNG join prompt: DTO test không nhúng
			// passage/transcript, UI tự tra assignmentPrompts theo promptId.
			.innerJoin(
				assignmentTest,
				eq(assignmentTestPart.testId, assignmentTest.id),
			)
			.where(
				and(
					eq(assignmentTest.orgId, orgId),
					notLike(assignmentTest.id, "demo-test:%"),
				),
			)
			.orderBy(asc(assignmentTestPart.position)),
		db
			.select()
			.from(vocabDeck)
			.where(eq(vocabDeck.orgId, orgId))
			.orderBy(asc(vocabDeck.createdAt), asc(vocabDeck.id)),
		db
			.select({ deckId: vocabWord.deckId })
			.from(vocabWord)
			.innerJoin(vocabDeck, eq(vocabWord.deckId, vocabDeck.id))
			.where(eq(vocabDeck.orgId, orgId)),
		db
			.select({
				id: vocabSuggestion.id,
				deckId: vocabSuggestion.deckId,
				studentId: vocabSuggestion.studentId,
				note: vocabSuggestion.note,
				createdAt: vocabSuggestion.createdAt,
			})
			.from(vocabSuggestion)
			.where(
				and(
					eq(vocabSuggestion.orgId, orgId),
					eq(vocabSuggestion.status, "pending"),
				),
			)
			.orderBy(asc(vocabSuggestion.createdAt), asc(vocabSuggestion.id)),
		db
			.select({
				id: organizationHoliday.id,
				name: organizationHoliday.name,
				fromDate: organizationHoliday.fromDate,
				toDate: organizationHoliday.toDate,
				scope: organizationHoliday.scope,
				mode: organizationHoliday.mode,
			})
			.from(organizationHoliday)
			.where(eq(organizationHoliday.orgId, orgId))
			.orderBy(asc(organizationHoliday.fromDate)),
		db
			.select({
				holidayId: holidaySessionShift.holidayId,
				classId: holidaySessionShift.classId,
				originalDate: holidaySessionShift.originalDate,
				makeupDate: holidaySessionShift.makeupDate,
			})
			.from(holidaySessionShift)
			.where(eq(holidaySessionShift.orgId, orgId)),
		db
			.select({
				holidayId: holidaySessionCancel.holidayId,
				classId: holidaySessionCancel.classId,
				date: holidaySessionCancel.date,
			})
			.from(holidaySessionCancel)
			.where(eq(holidaySessionCancel.orgId, orgId)),
		loadEvents(db, orgId),
	]);

	// #208: headers BEFORE targets, strictly sequential — a write landing
	// between the two reads can only orphan targets (dropped below), never
	// emit a header with `targets: []` (red-team F10).
	const classAssignmentRows = await db
		.select()
		.from(classAssignment)
		.where(
			and(
				eq(classAssignment.orgId, orgId),
				isNull(classAssignment.classStudyPackId),
			),
		)
		.orderBy(desc(classAssignment.createdAt), desc(classAssignment.id));
	const classAssignmentTargetRows = await db
		.select({
			id: classAssignmentTarget.id,
			orgId: classAssignmentTarget.orgId,
			assignmentId: classAssignmentTarget.assignmentId,
			studentId: classAssignmentTarget.studentId,
			submittedAt: classAssignmentTarget.submittedAt,
		})
		.from(classAssignmentTarget)
		.innerJoin(
			classAssignment,
			and(
				eq(classAssignment.id, classAssignmentTarget.assignmentId),
				eq(classAssignment.orgId, orgId),
				isNull(classAssignment.classStudyPackId),
			),
		)
		.where(eq(classAssignmentTarget.orgId, orgId));
	// Trạng thái chấm theo target: chỉ attempt đã nộp của LUỢT GIAO, chỉ 5
	// cột nhẹ (không kéo essay/answers/snapshot đề). Phase 10 (#378): attempt
	// `mode='practice'` không gắn target và không được lọt bảng điểm lớp —
	// không lọc sẽ sinh key "null:<studentId>" rác trong attemptByTarget.
	// #533: loại trừ bài bộ đề tự học (`isNull(classAssignment.classStudyPackId)`) ở tầng SQL.
	const submittedAttemptRows = await db
		.select({
			id: quizAttempt.id,
			assignmentId: quizAttempt.assignmentId,
			studentId: quizAttempt.studentId,
			gradeScores: quizAttempt.gradeScores,
			gradedAt: quizAttempt.gradedAt,
		})
		.from(quizAttempt)
		.innerJoin(
			classAssignment,
			and(
				eq(classAssignment.id, quizAttempt.assignmentId),
				eq(classAssignment.orgId, orgId),
				isNull(classAssignment.classStudyPackId),
			),
		)
		.where(
			and(
				eq(quizAttempt.orgId, orgId),
				eq(quizAttempt.status, "submitted"),
				eq(quizAttempt.mode, "assignment"),
			),
		);
	const attemptByTarget = new Map(
		submittedAttemptRows.map((row) => [
			`${row.assignmentId}:${row.studentId}`,
			row,
		]),
	);
	const targetsByAssignment = new Map<
		string,
		KernelSnapshot["classAssignments"][number]["targets"]
	>();
	for (const target of classAssignmentTargetRows) {
		const list = targetsByAssignment.get(target.assignmentId) ?? [];
		const attempt = attemptByTarget.get(
			`${target.assignmentId}:${target.studentId}`,
		);
		// Một nguồn duy nhất quyết định "đã chấm" — cùng hàm với API chấm và
		// summary học viên.
		const graded = attempt
			? toQuizAttemptGrade({
					gradeScores: attempt.gradeScores,
					gradeFeedback: "",
					gradedAt: attempt.gradedAt,
				})
			: null;
		list.push({
			studentId: target.studentId,
			submittedAt: target.submittedAt,
			attemptId: attempt?.id ?? null,
			gradedAt: graded?.gradedAt ?? null,
			band: graded?.band ?? null,
		});
		targetsByAssignment.set(target.assignmentId, list);
	}

	// Full-test builder: parts group theo testId (mẫu targetsByAssignment),
	// thứ tự position do query đảm bảo.
	const partsByTest = new Map<
		string,
		KernelSnapshot["assignmentTests"][number]["parts"]
	>();
	for (const part of assignmentTestPartRows) {
		const list = partsByTest.get(part.testId) ?? [];
		list.push({
			testId: part.testId,
			promptId: part.promptId,
			part: part.part,
			position: part.position,
			qStartOverride: part.qStartOverride ?? null,
		});
		partsByTest.set(part.testId, list);
	}

	const lessonsByModule = new Map<
		string,
		KernelSnapshot["syllabi"][number]["modules"][number]["lessons"]
	>();
	for (const lesson of lessonRows) {
		const list = lessonsByModule.get(lesson.moduleId) ?? [];
		list.push({
			id: lesson.id,
			title: lesson.title,
			objectives: lesson.objectives,
			materials: lesson.materials,
			kind: lesson.kind,
			status: lesson.status,
		});
		lessonsByModule.set(lesson.moduleId, list);
	}
	const modulesBySyllabus = new Map<
		string,
		KernelSnapshot["syllabi"][number]["modules"]
	>();
	for (const mod of moduleRows) {
		const list = modulesBySyllabus.get(mod.syllabusId) ?? [];
		list.push({
			id: mod.id,
			title: mod.title,
			description: mod.description,
			lessons: lessonsByModule.get(mod.id) ?? [],
		});
		modulesBySyllabus.set(mod.syllabusId, list);
	}

	return {
		students: studentRows.map((row) => ({
			id: row.id,
			name: row.name,
			phone: row.phone,
			email: row.email,
			zalo: row.zalo,
			parentName: row.parentName,
			parentPhone: row.parentPhone,
			portalLinked: row.onboardingCompletedAt != null,
		})),
		classes: classRows.map((row) => ({
			id: row.id,
			name: row.name,
			level: row.level,
			type: knownClassTypes.has(row.type) ? (row.type as ClassType) : "ielts",
			skills: parseSkills(row.skills),
			mode: row.mode,
			syllabusId: row.syllabusId,
			schedule: row.schedule,
			sessionsTotal: row.sessionsTotal,
			sessionsDone: row.sessionsDone,
			status: row.status,
			startDate: row.startDate,
			tuitionFee: row.tuitionFee ?? null,
			notes: row.notes,
		})),
		enrollments: enrollmentRows.map((row) => ({
			id: row.id,
			classId: row.classId,
			studentId: row.studentId,
			status: row.status,
			createdAt: row.createdAt.toISOString(),
		})),
		packages: packageRows.map((row) => ({
			id: row.id,
			enrollmentId: row.enrollmentId,
			classId: row.classId,
			studentId: row.studentId,
			total: row.total,
			price: row.price,
			mode: row.mode,
			start: row.start,
			expiry: row.expiry,
			status: row.status,
			createdAt: row.createdAt.toISOString(),
		})),
		syllabi: syllabusRows.map((row) => ({
			id: row.id,
			name: row.name,
			level: row.level,
			type: knownClassTypes.has(row.type) ? (row.type as ClassType) : "ielts",
			skills: parseSkills(row.skills),
			description: row.description,
			classId: row.classId,
			sourceTemplateId: row.sourceTemplateId,
			totalLessons: row.totalLessons,
			modules: modulesBySyllabus.get(row.id) ?? [],
		})),
		lessons: scheduledRows.map((row) => ({
			id: row.id,
			classId: row.classId,
			enrollmentId: row.enrollmentId,
			day: row.day,
			time: row.time,
			dur: row.dur,
			date: row.date ?? null,
			type: row.type,
			status: row.status,
			attendance: (row.attendance ?? null) as KernelLessonRow["attendance"],
			attendanceNote: (row.attendanceNote ??
				null) as KernelLessonRow["attendanceNote"],
			topic: row.topic,
			zoom: row.zoom,
		})),
		events: eventRows,
		assignments: assignmentRows.map((row) => ({
			id: row.id,
			studentId: row.studentId,
			title: row.title,
			type: row.type,
			due: row.due,
			status: row.status,
			scores: row.scores,
		})),
		invoices: invoiceRows,
		reports: reportRows,
		assignmentPrompts: assignmentPromptRows.map(
			({
				id,
				task,
				genre,
				skill,
				part,
				type,
				title,
				band,
				source,
				prompt,
				intro,
				passage,
				transcript,
				cueTopic,
				cuePoints,
				audioName,
				imageUrl,
				questions,
				optionBank,
				note,
				status,
				createdAt,
			}) => ({
				id,
				task,
				genre,
				skill,
				part,
				type,
				title,
				band,
				source,
				prompt,
				intro,
				passage,
				transcript,
				cueTopic,
				cuePoints,
				audioName,
				// Legacy rows predate image_url; defensive default matches the
				// parseQuestions style for corrupted/missing values.
				imageUrl: typeof imageUrl === "string" ? imageUrl : "",
				questions: parseQuestions(questions, id),
				// Phase-02 FR7: legacy rows predate option_bank — parseOptionBank
				// defaults corrupted/missing values to [].
				optionBank: parseOptionBank(optionBank, id),
				note,
				status,
				createdAt: createdAt.toISOString(),
			}),
		),
		notifs: notifRows,
		commentBank: commentBankRows,
		classAssignments: classAssignmentRows.map((row) => ({
			id: row.id,
			classId: row.classId,
			promptId: row.promptId,
			title: row.title,
			due: row.due,
			dueAt: row.dueAt ? row.dueAt.toISOString() : null,
			note: row.note,
			createdAt: row.createdAt.toISOString(),
			targets: targetsByAssignment.get(row.id) ?? [],
		})),
		// Full-test builder (phase-02 Task 2.3): org-scoped load + parts đã
		// group; test chưa ghép part nào giữ `parts: []`.
		assignmentTests: assignmentTestRows.map((row) => ({
			id: row.id,
			title: row.title,
			description: row.description ?? null,
			skill: row.skill,
			timeLimitSeconds: row.timeLimitSeconds ?? null,
			collection: row.collection ?? null,
			testGroup: row.testGroup ?? null,
			status: row.status,
			parts: partsByTest.get(row.id) ?? [],
		})),
		vocabDecks: vocabDeckRows.map((row) => ({
			id: row.id,
			classId: row.classId,
			title: row.title,
			lang: row.lang,
			wordCount: vocabWordDeckIds.filter((w) => w.deckId === row.id).length,
			createdAt: row.createdAt.toISOString(),
			sourceLibraryDeckId: row.sourceLibraryDeckId ?? null,
		})),
		vocabSuggestions: vocabSuggestionRows.map((row) => ({
			id: row.id,
			deckId: row.deckId,
			studentId: row.studentId,
			note: row.note ?? null,
			createdAt: row.createdAt.toISOString(),
		})),
		holidays: holidayRows.map((row) => ({
			id: row.id,
			name: row.name,
			fromDate: row.fromDate,
			toDate: row.toDate,
			scope: row.scope === "classes" ? "classes" : "org",
			mode: row.mode === "cancel" ? "cancel" : "shift",
		})),
		holidayShifts: holidayShiftRows.map((row) => ({
			holidayId: row.holidayId,
			classId: row.classId,
			originalDate: row.originalDate,
			makeupDate: row.makeupDate,
		})),
		holidayCancels: holidayCancelRows.map((row) => ({
			holidayId: row.holidayId,
			classId: row.classId,
			date: row.date,
		})),
		viewer: {
			role: viewerRole,
			canAccessFinance: financeAllowed,
		},
	};
}
