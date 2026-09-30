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
	intro?: string;
	questions: QuizSeedQuestion[];
}

export interface QuizFixture {
	orgId: string;
	classId: string;
	studentId: string;
	/** Parallel to `prompts`: class_assignment ids, one per prompt. */
	assignmentIds: string[];
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
}): Promise<QuizFixture> {
	const db = openDb();
	await db.execute("PRAGMA busy_timeout = 5000;");
	try {
		const orgId = crypto.randomUUID();
		const classId = crypto.randomUUID();
		const studentId = crypto.randomUUID();
		const now = Date.now();
		const due = addDaysISO(vietnamTodayISO(), 30);

		await db.execute({
			sql: "INSERT INTO organization (id, name, created_at) VALUES (?,?,?)",
			args: [orgId, opts.orgName, now],
		});
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
		await db.execute({
			sql: `INSERT INTO enrollment (id, org_id, class_id, student_id, status, created_at)
				VALUES (?,?,?,?, 'active', ?)`,
			args: [crypto.randomUUID(), orgId, classId, studentId, now],
		});

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
					"",
					prompt.intro ?? "",
					prompt.passage,
					"",
					"",
					"",
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

		return { orgId, classId, studentId, assignmentIds };
	} finally {
		db.close();
	}
}
