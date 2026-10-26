/**
 * Lessons read repo (Wave 4) — owns the kernel→display mapping for the
 * schedule module. The kernel row carries classId+enrollmentId (invariant 2);
 * `sid` is resolved through the enrollment because the 5 screens still read
 * `l.sid`. Pure by design: no provider import here, so unit tests stay
 * independent of the env-validated runtime. Status writes go through the
 * Wave 0 command bus (check-in / cancel-lesson).
 */
import type {
	AttendanceStatus,
	KernelSnapshot,
} from "@teacher-os/api/contracts";
import type { Lesson, LessonStatus, LessonType } from "@/lib/mock-data";

const LESSON_TYPES: readonly LessonType[] = [
	"1:1",
	"1:2",
	"trial",
	"mock",
	"review",
];
const LESSON_STATUSES: readonly LessonStatus[] = [
	"completed",
	"upcoming",
	"cancelled",
	"absent",
];

function coerceType(value: string): LessonType {
	return (LESSON_TYPES as readonly string[]).includes(value)
		? (value as LessonType)
		: "1:1";
}

function coerceStatus(value: string): LessonStatus {
	return (LESSON_STATUSES as readonly string[]).includes(value)
		? (value as LessonStatus)
		: "upcoming";
}

const ATTENDANCE_VALUES: readonly string[] = [
	"present",
	"late",
	"excused",
	"unexcused",
];

function coerceAttendance(
	value: AttendanceStatus | string | null | undefined,
): AttendanceStatus | null {
	return value != null &&
		(ATTENDANCE_VALUES as readonly string[]).includes(value)
		? (value as AttendanceStatus)
		: null;
}

export function mapLessons(snapshot: KernelSnapshot): Lesson[] {
	const studentByEnrollment = new Map<string, string>();
	for (const row of snapshot.enrollments) {
		studentByEnrollment.set(row.id, row.studentId);
	}

	const lessons: Lesson[] = [];
	for (const row of snapshot.lessons) {
		const sid = studentByEnrollment.get(row.enrollmentId);
		// FK cascade means this only happens on a broken row — hide it rather
		// than render a nameless card that breaks the 5 `l.sid` consumers.
		if (!sid) continue;
		lessons.push({
			id: row.id,
			classId: row.classId,
			sid,
			day: row.day,
			time: row.time,
			dur: row.dur,
			date: row.date ?? null,
			type: coerceType(row.type),
			status: coerceStatus(row.status),
			attendance: coerceAttendance(row.attendance),
			attendanceNote: row.attendanceNote ?? null,
			topic: row.topic,
			zoom: row.zoom,
		});
	}
	return lessons;
}
