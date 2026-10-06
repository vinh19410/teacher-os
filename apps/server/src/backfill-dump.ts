/**
 * Pure helpers for the offline backfill CLI (`scripts/backfill-date.ts`):
 * validate the wrangler lesson dump and flag settled lessons the plan would
 * stamp into the future. Kept under `src/` so they are unit-tested.
 */
import type {
	BackfillLessonInput,
	BackfillUpdate,
} from "@teacher-os/api/skeleton";

export interface LessonDumpRow {
	id: string;
	class_id: string;
	enrollment_id: string;
	day: number;
	time: string;
	created_at_ms: number;
	seq: number;
	status: string;
}

const KNOWN_STATUSES = new Set([
	"upcoming",
	"completed",
	"cancelled",
	"absent",
]);

/**
 * Map dump rows to planner input. Throws when `status` is missing or unknown:
 * a dump taken with the pre-status query would otherwise rank every row equal
 * and silently reproduce the createdAt-only stamping this planner replaced.
 */
export function toBackfillLessonInputs(
	rows: LessonDumpRow[],
): BackfillLessonInput[] {
	return rows.map((l) => {
		if (typeof l.status !== "string" || !KNOWN_STATUSES.has(l.status)) {
			throw new Error(
				`lesson ${l.id}: dump row has missing or unknown status (${JSON.stringify(l.status)}) — re-run the dump query with l.status`,
			);
		}
		return {
			id: l.id,
			classId: l.class_id,
			enrollmentId: l.enrollment_id,
			day: l.day,
			time: l.time,
			createdAtMs: Number(l.created_at_ms) || 0,
			seq: Number(l.seq) || 0,
			status: l.status,
		};
	});
}

/**
 * Completed lessons the plan stamps after `todayISO` — the teacher settled
 * more sessions than have elapsed on the skeleton. Surfaced for the operator
 * before applying; never auto-corrected.
 */
export function futureCompletedUpdates(
	updates: BackfillUpdate[],
	todayISO: string,
): BackfillUpdate[] {
	return updates.filter((u) => u.status === "completed" && u.date > todayISO);
}
