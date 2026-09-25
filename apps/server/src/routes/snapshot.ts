/**
 * Org-scoped kernel snapshot loader — shared by the kernel routes and the
 * assignments sub-router (kept in its own module to avoid a circular import
 * between the two route files).
 */
import {
	CLASS_TYPES,
	type ClassType,
	type KernelSnapshot,
} from "@teacher-os/api/contracts";
import { assignment } from "@teacher-os/db/schema/assignment";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import { classTable } from "@teacher-os/db/schema/class";
import {
	classAssignment,
	classAssignmentTarget,
} from "@teacher-os/db/schema/class-assignment";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import { invoice } from "@teacher-os/db/schema/invoice";
import { lesson } from "@teacher-os/db/schema/lesson";
import { sessionPackage } from "@teacher-os/db/schema/session-package";
import { student } from "@teacher-os/db/schema/student";
import {
	syllabus,
	syllabusLesson,
	syllabusModule,
} from "@teacher-os/db/schema/syllabus";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../app";
import { loadCommentBank, loadNotifs, loadReports } from "./reporting/loaders";

/** Shared explicit projection for the list endpoint and kernel snapshot. */
export async function loadInvoices(
	db: Db,
	orgId: string,
): Promise<KernelSnapshot["invoices"]> {
	return db
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
		})
		.from(invoice)
		.innerJoin(
			student,
			and(eq(invoice.studentId, student.id), eq(invoice.orgId, student.orgId)),
		)
		.where(eq(invoice.orgId, orgId))
		.orderBy(asc(invoice.createdAt), asc(invoice.id));
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
		return parsed.filter((item): item is string => typeof item === "string");
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
): Promise<KernelSnapshot> {
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
	] = await Promise.all([
		db
			.select()
			.from(student)
			.where(eq(student.orgId, orgId))
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
			.where(eq(assignmentPrompt.orgId, orgId))
			.orderBy(asc(assignmentPrompt.createdAt), asc(assignmentPrompt.id)),
		loadInvoices(db, orgId),
		loadReports(db, orgId),
		loadNotifs(db, orgId),
		loadCommentBank(db, orgId),
	]);

	// #208: headers BEFORE targets, strictly sequential — a write landing
	// between the two reads can only orphan targets (dropped below), never
	// emit a header with `targets: []` (red-team F10).
	const classAssignmentRows = await db
		.select()
		.from(classAssignment)
		.where(eq(classAssignment.orgId, orgId))
		.orderBy(desc(classAssignment.createdAt), desc(classAssignment.id));
	const classAssignmentTargetRows = await db
		.select()
		.from(classAssignmentTarget)
		.where(eq(classAssignmentTarget.orgId, orgId));
	const targetsByAssignment = new Map<
		string,
		KernelSnapshot["classAssignments"][number]["targets"]
	>();
	for (const target of classAssignmentTargetRows) {
		const list = targetsByAssignment.get(target.assignmentId) ?? [];
		list.push({
			studentId: target.studentId,
			submittedAt: target.submittedAt,
		});
		targetsByAssignment.set(target.assignmentId, list);
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
			topic: row.topic,
			zoom: row.zoom,
		})),
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
			note: row.note,
			createdAt: row.createdAt.toISOString(),
			targets: targetsByAssignment.get(row.id) ?? [],
		})),
	};
}
