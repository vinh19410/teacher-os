/**
 * Offline backfill CLI (issue #98 Phase 1 / runbook Step B). Reads the two
 * wrangler dump files, plans per-class date stamps with the shared skeleton
 * core, prints idempotent UPDATE SQL on stdout and a conformance summary
 * (with NULL-stay reasons — archive them to the issue) on stderr:
 *
 *   npx -y tsx apps/server/scripts/backfill-date.ts classes.json lessons.json \
 *     > backfill.sql 2> summary.txt
 *
 * No D1 access here; operators apply the stdout themselves.
 */
import { readFileSync } from "node:fs";
import {
	type BackfillClassInput,
	type BackfillLessonInput,
	buildBackfillPlan,
	emitBackfillSql,
} from "@teacher-os/api/skeleton";

interface ClassDumpRow {
	id: string;
	schedule: string;
	start_date: string;
	sessions_total: number;
}

interface LessonDumpRow {
	id: string;
	class_id: string;
	enrollment_id: string;
	day: number;
	time: string;
	created_at_ms: number;
	seq: number;
}

function main(): void {
	const [, , classesPath, lessonsPath] = process.argv;
	if (!classesPath || !lessonsPath) {
		console.error(
			"usage: tsx apps/server/scripts/backfill-date.ts <classes.json> <lessons.json>",
		);
		process.exit(2);
	}
	const classes = JSON.parse(
		readFileSync(classesPath, "utf8"),
	) as ClassDumpRow[];
	const lessons = JSON.parse(
		readFileSync(lessonsPath, "utf8"),
	) as LessonDumpRow[];

	const classInputs: BackfillClassInput[] = classes.map((c) => ({
		classId: c.id,
		scheduleRaw: c.schedule,
		startDateRaw: c.start_date ?? "",
		total: c.sessions_total ?? 0,
	}));
	const lessonInputs: BackfillLessonInput[] = lessons.map((l) => ({
		id: l.id,
		classId: l.class_id,
		enrollmentId: l.enrollment_id,
		day: l.day,
		time: l.time,
		createdAtMs: Number(l.created_at_ms) || 0,
		seq: Number(l.seq) || 0,
	}));

	const plan = buildBackfillPlan(classInputs, lessonInputs);
	for (const entry of plan.classes) {
		console.error(
			entry.conforms
				? `${entry.classId} STAMPED`
				: `${entry.classId} NULL (${entry.reason})`,
		);
	}
	process.stdout.write(`${emitBackfillSql(plan.updates)}\n`);
}

main();
