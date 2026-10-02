import type {
	EnrollmentStatus,
	StudentAssignment,
	StudentClass,
	StudentClassLesson,
	StudentNextSession,
	StudentTeacher,
} from "@teacher-os/api/contracts";
import { formatSchedule } from "@teacher-os/api/format-schedule";
import {
	classAssignment,
	classAssignmentTarget,
	classTable,
	enrollment,
	lesson,
	membership,
	user,
} from "@teacher-os/db/schema/index";
import { and, asc, desc, eq, gte, isNotNull } from "drizzle-orm";
import type { Db } from "../app";

/** Cột lớp + enrollment mà overview và trang chi tiết lớp cùng select. */
export const studentClassColumns = {
	id: classTable.id,
	name: classTable.name,
	level: classTable.level,
	mode: classTable.mode,
	schedule: classTable.schedule,
	sessionsDone: classTable.sessionsDone,
	sessionsTotal: classTable.sessionsTotal,
	status: classTable.status,
	enrollmentId: enrollment.id,
	enrollmentStatus: enrollment.status,
};

interface StudentClassRow {
	id: string;
	name: string;
	level: string;
	mode: string;
	schedule: string;
	sessionsDone: number;
	sessionsTotal: number;
	status: string;
	enrollmentId: string;
	enrollmentStatus: string;
}

/**
 * Giáo viên phụ trách lớp. Giả định mỗi org có đúng một giáo viên (bootstrap
 * tạo một membership 'teacher' khi giáo viên đăng nhập lần đầu), nên lấy
 * membership giáo viên sớm nhất. Khi có giáo viên theo từng lớp thì chuyển
 * sang cột trên `class` và đổi helper này.
 */
export async function loadOrgTeacher(
	db: Db,
	orgId: string,
): Promise<StudentTeacher | null> {
	const [row] = await db
		.select({ name: user.name, email: user.email, image: user.image })
		.from(membership)
		.innerJoin(user, eq(membership.userId, user.id))
		.where(and(eq(membership.orgId, orgId), eq(membership.role, "teacher")))
		.orderBy(asc(membership.createdAt), asc(membership.id))
		.limit(1);
	return row ? { name: row.name, email: row.email, image: row.image } : null;
}

/** Buổi gần nhất từ hôm nay trở đi của lớp (bỏ qua lớp legacy `date` null). */
export async function loadNextSession(
	db: Db,
	orgId: string,
	classId: string,
	todayISO: string,
): Promise<StudentNextSession | null> {
	const [first] = await db
		.select({ date: lesson.date, time: lesson.time, topic: lesson.topic })
		.from(lesson)
		.where(
			and(
				eq(lesson.orgId, orgId),
				eq(lesson.classId, classId),
				isNotNull(lesson.date),
				gte(lesson.date, todayISO),
			),
		)
		.orderBy(asc(lesson.date), asc(lesson.day), asc(lesson.time))
		.limit(1);
	return first?.date != null
		? { date: first.date, time: first.time, topic: first.topic }
		: null;
}

export function toStudentClass(
	row: StudentClassRow,
	nextSession: StudentNextSession | null,
	teacher: StudentTeacher | null,
): StudentClass {
	return {
		id: row.id,
		name: row.name,
		level: row.level,
		mode: row.mode,
		schedule: formatSchedule(row.schedule),
		sessionsDone: row.sessionsDone,
		sessionsTotal: row.sessionsTotal,
		status: row.status,
		enrollmentId: row.enrollmentId,
		// DB lưu text; lifecycle chỉ ghi 'invited' | 'active' (schema enrollment).
		enrollmentStatus: row.enrollmentStatus as EnrollmentStatus,
		nextSession,
		teacher,
	};
}

/**
 * Bài tập giáo viên giao cho học viên qua lớp (class_assignment targets),
 * mới nhất trước. `classId` thu hẹp về một lớp cho trang chi tiết lớp.
 */
export async function loadClassAssignmentItems(
	db: Db,
	orgId: string,
	studentId: string,
	classId?: string,
): Promise<StudentAssignment[]> {
	const targetRows = await db
		.select({
			id: classAssignment.id,
			title: classAssignment.title,
			classId: classAssignment.classId,
			className: classTable.name,
			due: classAssignment.due,
			submittedAt: classAssignmentTarget.submittedAt,
		})
		.from(classAssignmentTarget)
		.innerJoin(
			classAssignment,
			eq(classAssignmentTarget.assignmentId, classAssignment.id),
		)
		.leftJoin(classTable, eq(classAssignment.classId, classTable.id))
		.where(
			and(
				eq(classAssignmentTarget.orgId, orgId),
				eq(classAssignmentTarget.studentId, studentId),
				classId === undefined
					? undefined
					: eq(classAssignment.classId, classId),
			),
		)
		.orderBy(desc(classAssignment.createdAt));

	return targetRows.map((row) => ({
		id: row.id,
		title: row.title,
		source: "class_assignment" as const,
		classId: row.classId,
		className: row.className ?? null,
		due: row.due,
		submittedAt: row.submittedAt ?? null,
		scores: null,
	}));
}

/** Hạng trạng thái trong một slot legacy: buổi đã diễn ra trước, rồi buổi
 * huỷ, rồi buổi sắp tới — cùng quy ước prefix của app giáo viên
 * (`apps/web/src/lib/class-sessions.ts`). */
const LEGACY_STATUS_RANK: Record<string, number> = {
	completed: 0,
	absent: 0,
	cancelled: 1,
	upcoming: 2,
};

/**
 * Thứ tự hiển thị buổi học của một enrollment. Lớp có ngày: theo ngày (row
 * đã sắp sẵn bởi query). Lớp legacy (`date` null theo cả lớp): row không có
 * danh tính buổi, nên nhóm theo slot (thứ + giờ), sắp trong slot theo hạng
 * trạng thái, rồi xen kẽ các slot (T2, T4, T2, T4…) để danh sách gần đúng
 * trình tự thời gian thay vì dồn hết buổi Thứ Hai lên trước.
 */
export function orderStudentLessons(
	lessons: StudentClassLesson[],
): StudentClassLesson[] {
	if (lessons.every((l) => l.date != null)) return lessons;

	const slots = new Map<string, StudentClassLesson[]>();
	for (const l of lessons) {
		const key = `${l.day}|${l.time}`;
		const slot = slots.get(key) ?? [];
		slot.push(l);
		slots.set(key, slot);
	}
	const rank = (l: StudentClassLesson) => LEGACY_STATUS_RANK[l.status] ?? 2;
	const ordered = [...slots.values()].map((slot) =>
		slot.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id)),
	);

	const result: StudentClassLesson[] = [];
	for (let i = 0; result.length < lessons.length; i++) {
		for (const slot of ordered) {
			const l = slot[i];
			if (l) result.push(l);
		}
	}
	return result;
}
