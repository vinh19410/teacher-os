/**
 * Offline backfill CLI (issue #98 Phase 1 / runbook Step B). Reads the two
 * wrangler dump files, plans per-class date stamps with the shared skeleton
 * core, prints idempotent UPDATE SQL on stdout and a conformance summary
 * (with NULL-stay reasons — archive them to the issue) on stderr. Within each
 * enrollment+weekday bucket completed lessons take the earliest dates, then
 * cancelled, then the rest (mirrors the legacy renderer). The lessons dump
 * MUST include `l.status` (the CLI throws without it) and every emitted UPDATE
 * is guarded by `date IS NULL AND status = <dump status>`:
 *
 *   npx -y tsx apps/server/scripts/backfill-date.ts classes.json lessons.json \
 *     > backfill.sql 2> summary.txt
 *
 * No D1 access here; operators apply the stdout themselves.
 */
import { readFileSync } from "node:fs";
import {
	type BackfillClassInput,
	buildBackfillPlan,
	emitBackfillSql,
} from "@teacher-os/api/skeleton";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import {
	futureCompletedUpdates,
	type LessonDumpRow,
	toBackfillLessonInputs,
} from "../src/backfill-dump";

interface ClassDumpRow {
	id: string;
	schedule: string;
	start_date: string;
	sessions_total: number;
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
	const lessonInputs = toBackfillLessonInputs(lessons);

	const plan = buildBackfillPlan(classInputs, lessonInputs);
	for (const entry of plan.classes) {
		console.error(
			entry.conforms
				? `${entry.classId} STAMPED`
				: `${entry.classId} NULL (${entry.reason})`,
		);
	}
	for (const u of futureCompletedUpdates(plan.updates, vietnamTodayISO())) {
		console.error(
			`FUTURE_COMPLETED lesson=${u.id} date=${u.date} — completed lesson stamped after today; review before applying`,
		);
	}
	process.stdout.write(`${emitBackfillSql(plan.updates)}\n`);
}

main();
