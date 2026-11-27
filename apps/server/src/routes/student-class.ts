import {
	type ClassStatus,
	type EnrollmentStatus,
	MAX_PACK_DAYS,
	RECORDING_STATUSES,
	type RecordingSource,
	type RecordingStatus,
	type StudentAssignment,
	type StudentClass,
	type StudentClassLesson,
	type StudentNextSession,
	type StudentTeacher,
	studentAssignmentScoresSchema,
} from "@teacher-os/api/contracts";
import { formatSchedule } from "@teacher-os/api/format-schedule";
import { isSafeMaterialUrl } from "@teacher-os/api/material-contracts";
import {
	vietnamSessionEndMs,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";
import { isValidZoomJoinUrl } from "@teacher-os/api/zoom-window";
import {
	assignmentPrompt,
	classAssignment,
	classAssignmentTarget,
	classSessionMeeting,
	classStudyPack,
	classTable,
	enrollment,
	lesson,
	membership,
	quizAttempt,
	studyPackItem,
	user,
} from "@teacher-os/db/schema/index";
import { and, asc, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "../app";
import {
	accessibleAssignmentFilter,
	overviewAssignmentFilter,
	visibleAssignmentFilter,
} from "../lib/assignment-visibility";
import {
	computeStudyPackSchedule,
	extractPackItemIdFromAssignmentId,
} from "../lib/study-pack-assign";
import { D1_IN_ARRAY_CHUNK } from "../lib/study-pack-clone";
import { loadExistingHolidayDates } from "./holidays";

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

export { isValidZoomJoinUrl };

/**
 * Buổi tới của lớp: buổi có ngày đầu tiên từ hôm nay (giờ VN) trở đi mà
 * CHƯA qua giờ kết thúc (date + time + dur). Bỏ qua buổi hôm nay đã qua giờ
 * (#395, đồng bộ `isLessonEnded` client #393 — predicate thuần thời gian,
 * không lọc `status`). Lớp legacy (`date` null) không có Buổi tới.
 *
 * Không bao giờ trả raw `joinUrl` — chỉ gắn `hasZoom: true` và `dur` để client
 * gọi endpoint `/zoom-join` kiểm tra khung giờ ở server.
 */
export async function loadNextSession(
	db: Db,
	orgId: string,
	classId: string,
	now: Date,
	enrollmentId?: string,
): Promise<StudentNextSession | null> {
	const todayISO = vietnamTodayISO(now);
	const rows = await db
		.select({
			date: lesson.date,
			time: lesson.time,
			dur: lesson.dur,
			topic: lesson.topic,
			status: lesson.status,
			zoom: lesson.zoom,
		})
		.from(lesson)
		.where(
			and(
				eq(lesson.orgId, orgId),
				eq(lesson.classId, classId),
				...(enrollmentId ? [eq(lesson.enrollmentId, enrollmentId)] : []),
				isNotNull(lesson.date),
				gte(lesson.date, todayISO),
			),
		)
		.orderBy(asc(lesson.date), asc(lesson.day), asc(lesson.time));
	for (const row of rows) {
		if (row.date == null) continue;
		const end = vietnamSessionEndMs(row.date, row.time, row.dur);
		// time lệch format (end == null) → không đoán, coi là chưa kết thúc
		// (phòng thủ invariant vỡ, nhất quán NaN→false với client #393).
		if (end == null || end > now.getTime()) {
			let rawJoinUrl = "";
			if (row.status !== "cancelled" && row.status !== "holiday") {
				const lessonZoom = row.zoom?.trim() ?? "";
				if (lessonZoom) {
					rawJoinUrl = lessonZoom;
				} else {
					const [meeting] = await db
						.select({ joinUrl: classSessionMeeting.joinUrl })
						.from(classSessionMeeting)
						.where(
							and(
								eq(classSessionMeeting.orgId, orgId),
								eq(classSessionMeeting.classId, classId),
								eq(classSessionMeeting.date, row.date),
							),
						)
						.limit(1);
					rawJoinUrl = meeting?.joinUrl?.trim() ?? "";
				}
			}
			const hasZoom = isValidZoomJoinUrl(rawJoinUrl);
			return {
				date: row.date,
				time: row.time,
				...(row.dur > 0 ? { dur: row.dur } : {}),
				topic: row.topic,
				...(hasZoom ? { hasZoom: true } : {}),
			};
		}
	}
	return null;
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
		status: (row.status === "paused"
			? "paused"
			: "active") satisfies ClassStatus,
		enrollmentId: row.enrollmentId,
		// DB lưu text; lifecycle chỉ ghi 'invited' | 'active' (schema enrollment).
		enrollmentStatus: row.enrollmentStatus as EnrollmentStatus,
		nextSession,
		teacher,
	};
}

export type ClassAssignmentLoadMode =
	| "overview"
	| "class_detail"
	| "session_detail";

/**
 * Bài tập giáo viên giao cho học viên qua lớp (class_assignment targets),
 * mới nhất trước. `classId` thu hẹp về một lớp cho trang chi tiết lớp.
 */
export async function loadClassAssignmentItems(
	db: Db,
	orgId: string,
	studentId: string,
	classId?: string,
	now: Date = new Date(),
	options?: { mode?: ClassAssignmentLoadMode },
): Promise<StudentAssignment[]> {
	const mode: ClassAssignmentLoadMode = options?.mode ?? "overview";
	const visibilityPredicate =
		mode === "class_detail"
			? accessibleAssignmentFilter(now)
			: mode === "session_detail"
				? visibleAssignmentFilter(now)
				: overviewAssignmentFilter(now);

	const targetRows = await db
		.select({
			id: classAssignment.id,
			title: classAssignment.title,
			classId: classAssignment.classId,
			className: classTable.name,
			due: classAssignment.due,
			dueAt: classAssignment.dueAt,
			availableAt: classAssignment.availableAt,
			classStudyPackId: classAssignment.classStudyPackId,
			studyPackPackId: classStudyPack.packId,
			studyPackTitle: classStudyPack.title,
			studyPackStatus: classStudyPack.status,
			studyPackStartDate: classStudyPack.startDate,
			sessionDate: classAssignment.sessionDate,
			submittedAt: classAssignmentTarget.submittedAt,
			// TOS-30 #478: skill của đề — cổng học viên phân biệt nhãn chờ
			// chấm giáo viên (Writing/Speaking) với bài tự chấm.
			skill: assignmentPrompt.skill,
			writingPart: assignmentPrompt.writingPart,
			// TOS-30 #478: điểm/bài đã "Chốt trả bài" — phân biệt đã chấm với
			// đang chờ (scores luôn null trước PR #482 nên nhãn chờ chấm dính
			// mãi cả sau publish).
			gradeScores: quizAttempt.gradeScores,
			gradedAt: quizAttempt.gradedAt,
			attemptStatus: quizAttempt.status,
			attemptSubmittedAt: quizAttempt.submittedAt,
		})
		.from(classAssignmentTarget)
		.innerJoin(
			classAssignment,
			and(
				eq(classAssignment.id, classAssignmentTarget.assignmentId),
				eq(classAssignment.orgId, orgId),
			),
		)
		.innerJoin(
			assignmentPrompt,
			and(
				eq(assignmentPrompt.id, classAssignment.promptId),
				eq(assignmentPrompt.orgId, orgId),
			),
		)
		.leftJoin(classTable, eq(classAssignment.classId, classTable.id))
		.leftJoin(
			classStudyPack,
			and(
				eq(classStudyPack.id, classAssignment.classStudyPackId),
				eq(classStudyPack.orgId, orgId),
			),
		)
		.leftJoin(
			quizAttempt,
			and(
				eq(quizAttempt.orgId, orgId),
				eq(quizAttempt.assignmentId, classAssignment.id),
				eq(quizAttempt.studentId, classAssignmentTarget.studentId),
			),
		)
		.where(
			and(
				eq(classAssignmentTarget.orgId, orgId),
				eq(classAssignmentTarget.studentId, studentId),
				visibilityPredicate,
				classId === undefined
					? undefined
					: eq(classAssignment.classId, classId),
			),
		)
		.orderBy(desc(classAssignment.createdAt));

	const packItemMetaById = new Map<
		string,
		{ dayIndex: number; position: number }
	>();
	const fallbackDayIndexByAssignmentId = new Map<string, number>();
	const fallbackPositionByAssignmentId = new Map<string, number>();

	if (mode === "class_detail") {
		const uniquePackIds = [
			...new Set(
				targetRows
					.map((r) => r.studyPackPackId)
					.filter((id): id is string => Boolean(id)),
			),
		];
		for (let i = 0; i < uniquePackIds.length; i += D1_IN_ARRAY_CHUNK) {
			const slice = uniquePackIds.slice(i, i + D1_IN_ARRAY_CHUNK);
			const itemRows = await db
				.select({
					id: studyPackItem.id,
					dayIndex: studyPackItem.dayIndex,
					position: studyPackItem.position,
				})
				.from(studyPackItem)
				.where(inArray(studyPackItem.packId, slice));
			for (const itemRow of itemRows) {
				packItemMetaById.set(itemRow.id, {
					dayIndex: itemRow.dayIndex,
					position: itemRow.position,
				});
			}
		}

		// Lazy fallback chỉ chạy khi có ít nhất 1 bài bộ đề thiếu item trong studyPackItem
		// (ví dụ template pack đã bị chỉnh sửa/xoá item sau khi gán vào lớp).
		const missingMetaRows = targetRows.filter((row) => {
			if (!row.classStudyPackId) return false;
			const itemId = extractPackItemIdFromAssignmentId(
				row.classStudyPackId,
				row.id,
			);
			return !itemId || !packItemMetaById.has(itemId);
		});

		if (missingMetaRows.length > 0) {
			const missingMetaIds = new Set(missingMetaRows.map((row) => row.id));
			const fallbackClassIds = [
				...new Set(missingMetaRows.map((row) => row.classId)),
			];
			const holidaysByClass = await loadExistingHolidayDates(
				db,
				orgId,
				fallbackClassIds,
			);
			const dayIndexByPackAndDate = new Map<string, Map<string, number>>();
			const matchedRowsByPack = new Map<string, typeof targetRows>();
			const missingRowsByPackAndDue = new Map<string, typeof targetRows>();

			for (const row of targetRows) {
				if (!row.classStudyPackId) continue;
				const list = matchedRowsByPack.get(row.classStudyPackId) ?? [];
				list.push(row);
				matchedRowsByPack.set(row.classStudyPackId, list);

				if (missingMetaIds.has(row.id)) {
					const key = `${row.classStudyPackId}|${row.due}`;
					const dueList = missingRowsByPackAndDue.get(key) ?? [];
					dueList.push(row);
					missingRowsByPackAndDue.set(key, dueList);
				}
			}

			for (const [classPackId, packRows] of matchedRowsByPack) {
				const firstRow = packRows[0];
				if (
					!firstRow?.studyPackStartDate ||
					!/^\d{4}-\d{2}-\d{2}$/.test(firstRow.studyPackStartDate)
				) {
					continue;
				}
				const classHolidays =
					holidaysByClass.get(firstRow.classId) ?? new Map<string, string>();
				const schedule = computeStudyPackSchedule(
					firstRow.studyPackStartDate,
					MAX_PACK_DAYS,
					classHolidays,
				);
				const dateMap = new Map<string, number>();
				for (const [dayIdx, dateISO] of schedule.dateByDayIndex) {
					dateMap.set(dateISO, dayIdx);
				}
				// Ưu tiên ánh xạ ngày từ item còn khớp trong studyPackItem (nếu có)
				for (const row of packRows) {
					const itemId = extractPackItemIdFromAssignmentId(classPackId, row.id);
					const meta = itemId ? packItemMetaById.get(itemId) : undefined;
					if (meta && row.due) {
						dateMap.set(row.due, meta.dayIndex);
					}
				}
				dayIndexByPackAndDate.set(classPackId, dateMap);
			}

			for (const [, group] of missingRowsByPackAndDue) {
				const sortedGroup = [...group].sort((a, b) => a.id.localeCompare(b.id));
				for (let idx = 0; idx < sortedGroup.length; idx += 1) {
					const row = sortedGroup[idx];
					if (!row?.classStudyPackId) continue;
					const resolvedDay = dayIndexByPackAndDate
						.get(row.classStudyPackId)
						?.get(row.due);
					if (resolvedDay !== undefined) {
						fallbackDayIndexByAssignmentId.set(row.id, resolvedDay);
						fallbackPositionByAssignmentId.set(row.id, idx);
					}
				}
			}
		}
	}

	return targetRows.map((row) => {
		// Chỉ lộ `scores` khi ĐÚNG shape IELTS Writing (Speaking lưu key
		// fluency/pronunciation — safeParse fail → null; trạng thái "đã chấm"
		// của Speaking do `gradedAt` lo, tránh vỡ zod ở client).
		const parsedScores = studentAssignmentScoresSchema.safeParse(
			row.gradeScores,
		);
		const itemId = row.classStudyPackId
			? extractPackItemIdFromAssignmentId(row.classStudyPackId, row.id)
			: null;
		const packItemMeta = itemId ? packItemMetaById.get(itemId) : undefined;
		const resolvedDayIndex =
			packItemMeta?.dayIndex ?? fallbackDayIndexByAssignmentId.get(row.id);
		const resolvedPosition =
			packItemMeta?.position ?? fallbackPositionByAssignmentId.get(row.id);
		const normalizedPackStatus =
			row.studyPackStatus === "active" || row.studyPackStatus === "cancelled"
				? row.studyPackStatus
				: null;

		return {
			id: row.id,
			title: row.title,
			source: "class_assignment" as const,
			classId: row.classId,
			className: row.className ?? null,
			due: row.due,
			dueAt: row.dueAt ? row.dueAt.toISOString() : null,
			submittedAt:
				row.attemptStatus === "submitted" && row.attemptSubmittedAt
					? row.attemptSubmittedAt.toISOString()
					: (row.submittedAt ?? null),
			scores: parsedScores.success ? parsedScores.data : null,
			skill: row.skill,
			gradedAt: row.gradedAt ? row.gradedAt.toISOString() : null,
			...(row.writingPart !== null ? { hasWriting: true } : {}),
			...(row.sessionDate != null ? { sessionDate: row.sessionDate } : {}),
			...(row.classStudyPackId != null
				? {
						classStudyPackId: row.classStudyPackId,
						studyPackTitle: row.studyPackTitle ?? null,
						studyPackStatus: normalizedPackStatus,
					}
				: {}),
			...(row.availableAt != null
				? { availableAt: row.availableAt.toISOString() }
				: {}),
			...(mode === "class_detail" && resolvedDayIndex !== undefined
				? {
						studyPackDayIndex: resolvedDayIndex,
						studyPackPosition: resolvedPosition ?? 0,
					}
				: {}),
		};
	});
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

export interface ClassSessionMeetingProjection {
	classId: string;
	date: string;
	joinUrl: string;
	recordingUrl: string;
	recordingPassword: string | null;
	recordingStatus: string;
	recordingStorageKey?: string | null;
	recordingExpiresAt?: Date | null;
}

const VALID_RECORDING_STATUSES = new Set<string>(RECORDING_STATUSES);

/**
 * Gắn `hasZoom` (kiểm tra `lesson.zoom`, fallback `class_session_meeting.joinUrl` —
 * không bao giờ trả raw `joinUrl` trên payload danh sách/chi tiết) và metadata
 * recording (nguồn R2 hoặc link ngoài, hạn 90 ngày, trạng thái hết hạn) vào item
 * buổi học của học viên — tuyệt đối không lộ `recordingStorageKey`,
 * `recordingError` hay `recordingZoomTrashStatus`.
 * Buổi đã `cancelled` hoặc `holiday`, hoặc buổi legacy chưa gắn ngày (`date == null`),
 * không đánh dấu `hasZoom`.
 */
export function toStudentClassLessonWithMeeting(
	row: {
		id: string;
		date: string | null;
		day: number;
		time: string;
		dur: number;
		status: string;
		topic: string;
		zoom?: string;
	},
	meeting?: ClassSessionMeetingProjection,
	now: Date = new Date(),
): StudentClassLesson {
	const isInactive = row.status === "cancelled" || row.status === "holiday";
	const rawJoinUrl = !isInactive
		? row.zoom?.trim() || meeting?.joinUrl?.trim() || ""
		: "";
	const hasZoom = row.date != null && isValidZoomJoinUrl(rawJoinUrl);

	const isExpiredKey = Boolean(
		meeting?.recordingStorageKey &&
			meeting.recordingExpiresAt &&
			meeting.recordingExpiresAt.getTime() <= now.getTime(),
	);
	const hasRecordingVideo =
		!isInactive && Boolean(meeting?.recordingStorageKey) && !isExpiredKey;
	const rawRecStatus = isExpiredKey ? "expired" : meeting?.recordingStatus;
	const recordingStatus =
		!isInactive &&
		rawRecStatus &&
		rawRecStatus !== "none" &&
		VALID_RECORDING_STATUSES.has(rawRecStatus)
			? (rawRecStatus as RecordingStatus)
			: undefined;
	const isExpired = recordingStatus === "expired" || isExpiredKey;
	const rawRecordingUrl =
		!isInactive && !hasRecordingVideo && !isExpired
			? meeting?.recordingUrl?.trim() || ""
			: "";
	const recordingUrl =
		rawRecordingUrl && isSafeMaterialUrl(rawRecordingUrl)
			? rawRecordingUrl
			: "";
	const recordingPassword =
		recordingUrl && meeting?.recordingPassword ? meeting.recordingPassword : "";
	const recordingSource: RecordingSource | undefined = hasRecordingVideo
		? "r2"
		: recordingUrl
			? "external"
			: undefined;
	const recordingExpiresAt =
		!isInactive &&
		(hasRecordingVideo || recordingStatus === "expired") &&
		meeting?.recordingExpiresAt
			? meeting.recordingExpiresAt.toISOString()
			: undefined;

	return {
		id: row.id,
		date: row.date,
		day: row.day,
		time: row.time,
		dur: row.dur,
		status: row.status,
		topic: row.topic,
		...(hasZoom ? { hasZoom: true } : {}),
		...(recordingUrl ? { recordingUrl } : {}),
		...(recordingPassword ? { recordingPassword } : {}),
		...(recordingStatus ? { recordingStatus } : {}),
		...(recordingSource ? { recordingSource } : {}),
		...(recordingExpiresAt ? { recordingExpiresAt } : {}),
		...(hasRecordingVideo ? { hasRecordingVideo: true } : {}),
	};
}
