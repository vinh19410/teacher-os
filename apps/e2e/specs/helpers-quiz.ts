/**
 * Direct-DB seeding for the student quiz take & review E2E (#283, RT#12).
 * Driving the teacher authoring UI (signup → rich-editor prompt → invite →
 * verify → onboarding) blows the 120s per-test budget; the `seedStudent`
 * precedent (Decision D6) seeds kernel rows straight into local.db instead.
 * Only the STUDENT auth is real (portal signup + mail-log verification).
 *
 * One fixture = one org containing a class + active enrollment + student
 * + N ready reading prompts, each wired as a class_assignment with exactly
 * one target row for the student — the minimum surface the student portal
 * overview and the quiz endpoints read.
 */
import { type Client, createClient } from "@libsql/client";
import { addDaysISO, vietnamTodayISO } from "./helpers";

/** Mirror of the authoring data shape (`AssignmentQuestion` in contracts). */
export interface QuizSeedQuestion {
	stem: string;
	opts: string[] | null;
	answer: string;
	alts: string;
	/** Dạng bài riêng của câu (đề trộn dạng) — fallback type prompt. */
	type?: string;
}

export interface QuizSeedPrompt {
	/** Snapshot title on class_assignment (and prompt title). */
	title: string;
	skill: string;
	part: string;
	type: string;
	note: string;
	/** Rich-text HTML rendered above the questions (reading passage). */
	passage: string;
	/** Đề bài rich-text HTML (#304 — Writing prompt-only cần nội dung đề). */
	prompt?: string;
	intro?: string;
	/** Cue card Speaking Part 2 (#305) — mặc định "". */
	cueTopic?: string;
	/** Bullet cue card, mỗi dòng một ý — mặc định "". */
	cuePoints?: string;
	questions: QuizSeedQuestion[];
}

export interface QuizSeedLesson {
	/** yyyy-mm-dd; the weekday (`lesson.day`, Monday = 1) derives from it. */
	date: string;
	time: string;
	dur: number;
	status: "upcoming" | "completed" | "absent" | "cancelled";
	topic: string;
}

export interface QuizFixture {
	orgId: string;
	classId: string;
	studentId: string;
	/** Parallel to `prompts`: class_assignment ids, one per prompt. */
	assignmentIds: string[];
	/** Set when `invitedClassName` was passed. */
	invitedClassId: string | null;
}

function openDb(): Client {
	const c = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	return c;
}

export async function seedQuizFixture(opts: {
	orgName: string;
	className: string;
	studentName: string;
	studentEmail: string;
	prompts: QuizSeedPrompt[];
	/** Seed vào org có sẵn (org của giáo viên đăng ký qua UI) — bỏ qua insert organization. */
	orgId?: string;
	/** Org-owning teacher (user + membership role 'teacher'). */
	teacher?: { name: string; email: string };
	/** Lesson rows of the student's enrollment in the seeded class. */
	lessons?: QuizSeedLesson[];
	/** Second class in the same org with an 'invited' enrollment. */
	invitedClassName?: string;
}): Promise<QuizFixture> {
	const db = openDb();
	await db.execute("PRAGMA busy_timeout = 5000;");
	try {
		const orgId = opts.orgId ?? crypto.randomUUID();
		const classId = crypto.randomUUID();
		const studentId = crypto.randomUUID();
		const now = Date.now();
		const due = addDaysISO(vietnamTodayISO(), 30);

		if (!opts.orgId) {
			await db.execute({
				sql: "INSERT INTO organization (id, name, created_at) VALUES (?,?,?)",
				args: [orgId, opts.orgName, now],
			});
		}
		await db.execute({
			sql: "INSERT INTO class (id, org_id, name, created_at) VALUES (?,?,?,?)",
			args: [classId, orgId, opts.className, now],
		});
		// onboarding_completed_at is set so the verified student lands straight
		// on the overview instead of the wizard (wizard is not under test).
		await db.execute({
			sql: `INSERT INTO student (id, org_id, name, email, onboarding_completed_at, created_at)
				VALUES (?,?,?,?,?,?)`,
			args: [studentId, orgId, opts.studentName, opts.studentEmail, now, now],
		});
		const enrollmentId = crypto.randomUUID();
		await db.execute({
			sql: `INSERT INTO enrollment (id, org_id, class_id, student_id, status, created_at)
				VALUES (?,?,?,?, 'active', ?)`,
			args: [enrollmentId, orgId, classId, studentId, now],
		});

		if (opts.teacher) {
			const userId = crypto.randomUUID();
			await db.execute({
				sql: `INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at)
					VALUES (?,?,?, 1, 'teacher', ?, ?)`,
				args: [userId, opts.teacher.name, opts.teacher.email, now, now],
			});
			await db.execute({
				sql: `INSERT INTO membership (id, org_id, user_id, role, created_at)
					VALUES (?,?,?, 'teacher', ?)`,
				args: [crypto.randomUUID(), orgId, userId, now],
			});
		}

		for (const l of opts.lessons ?? []) {
			const weekday = new Date(`${l.date}T00:00:00Z`).getUTCDay();
			await db.execute({
				sql: `INSERT INTO lesson (id, org_id, class_id, enrollment_id, day, time, dur, date, status, topic, created_at)
					VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
				args: [
					crypto.randomUUID(),
					orgId,
					classId,
					enrollmentId,
					weekday === 0 ? 7 : weekday,
					l.time,
					l.dur,
					l.date,
					l.status,
					l.topic,
					now,
				],
			});
		}

		let invitedClassId: string | null = null;
		if (opts.invitedClassName) {
			invitedClassId = crypto.randomUUID();
			await db.execute({
				sql: "INSERT INTO class (id, org_id, name, created_at) VALUES (?,?,?,?)",
				args: [invitedClassId, orgId, opts.invitedClassName, now + 1],
			});
			await db.execute({
				sql: `INSERT INTO enrollment (id, org_id, class_id, student_id, status, created_at)
					VALUES (?,?,?,?, 'invited', ?)`,
				args: [crypto.randomUUID(), orgId, invitedClassId, studentId, now],
			});
		}

		const assignmentIds: string[] = [];
		for (const prompt of opts.prompts) {
			const promptId = crypto.randomUUID();
			const assignmentId = crypto.randomUUID();
			await db.execute({
				sql: `INSERT INTO assignment_prompt (
						id, org_id, task, genre, skill, part, type, title, band, source,
						prompt, intro, passage, transcript, cue_topic, cue_points,
						audio_name, image_url, questions, option_bank, note, status, created_at
					) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'ready', ?)`,
				args: [
					promptId,
					orgId,
					// Legacy columns — the server writes "task2"/"" for non-writing.
					"task2",
					"",
					prompt.skill,
					prompt.part,
					prompt.type,
					prompt.title,
					"7.0",
					"",
					// Đề bài (writing prompt-only #304) — mặc định "" như cũ.
					prompt.prompt ?? "",
					prompt.intro ?? "",
					prompt.passage,
					"",
					prompt.cueTopic ?? "",
					prompt.cuePoints ?? "",
					"",
					"",
					JSON.stringify(prompt.questions),
					"[]",
					prompt.note,
					now,
				],
			});
			await db.execute({
				sql: `INSERT INTO class_assignment (id, org_id, class_id, prompt_id, title, due, note, created_at)
					VALUES (?,?,?,?,?,?, '', ?)`,
				args: [assignmentId, orgId, classId, promptId, prompt.title, due, now],
			});
			await db.execute({
				sql: `INSERT INTO class_assignment_target (id, org_id, assignment_id, student_id, submitted_at)
					VALUES (?,?,?,?, NULL)`,
				args: [crypto.randomUUID(), orgId, assignmentId, studentId],
			});
			assignmentIds.push(assignmentId);
		}

		return { orgId, classId, studentId, assignmentIds, invitedClassId };
	} finally {
		db.close();
	}
}

/**
 * Seed một attempt Writing đã nộp (#319): `quiz_attempt` status submitted kèm
 * essay + stamp `class_assignment_target.submittedAt` (cột TEXT ISO — khác
 * `quiz_attempt.*_at` là integer ms) để tab Bài tập hiện "Đã nộp" và nút
 * "Chấm bài". Trả về attemptId cho URL `/grading/<id>`.
 */
export async function seedSubmittedEssay(opts: {
	orgId: string;
	assignmentId: string;
	studentId: string;
	essay: string;
}): Promise<string> {
	const db = openDb();
	await db.execute("PRAGMA busy_timeout = 5000;");
	try {
		const attemptId = crypto.randomUUID();
		await db.execute({
			sql: `INSERT INTO quiz_attempt
					(id, org_id, assignment_id, student_id, status, questions_snapshot, answers, essay, started_at, submitted_at)
				VALUES (?,?,?,?,'submitted','[]','{}',?,?,?)`,
			args: [
				attemptId,
				opts.orgId,
				opts.assignmentId,
				opts.studentId,
				opts.essay,
				Date.now() - 600_000,
				Date.now(),
			],
		});
		await db.execute({
			sql: `UPDATE class_assignment_target SET submitted_at = ?
				WHERE assignment_id = ? AND student_id = ?`,
			args: [new Date().toISOString(), opts.assignmentId, opts.studentId],
		});
		return attemptId;
	} finally {
		db.close();
	}
}
