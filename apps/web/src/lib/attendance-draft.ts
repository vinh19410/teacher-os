import type {
	AttendanceStatus,
	DailyAttendanceResponse,
	SessionAttendanceSave,
} from "@teacher-os/api/contracts";

export type DailyAttendanceSession =
	DailyAttendanceResponse["sessions"][number];
export type DailyAttendanceStudent = DailyAttendanceSession["students"][number];

export interface AttendanceDraftEntry {
	attendance: AttendanceStatus | null;
	note: string;
}

export interface AttendanceDraftState {
	order: string[];
	entries: Record<string, AttendanceDraftEntry>;
}

export type AttendanceDraftAction =
	| { type: "set"; lessonId: string; attendance: AttendanceStatus }
	| { type: "setNote"; lessonId: string; note: string }
	| { type: "reset"; students: readonly DailyAttendanceStudent[] }
	| { type: "markAllPresent" };

const MAX_NOTE_LENGTH = 255;

export function createAttendanceDraft(
	students: readonly DailyAttendanceStudent[],
): AttendanceDraftState {
	const order: string[] = [];
	const entries: Record<string, AttendanceDraftEntry> = {};

	for (const s of students) {
		if (!s.lessonId) continue;
		order.push(s.lessonId);
		entries[s.lessonId] = {
			attendance: s.attendance,
			note: s.note,
		};
	}

	return { order, entries };
}

export function setDraftAttendance(
	state: AttendanceDraftState,
	lessonId: string,
	attendance: AttendanceStatus,
): AttendanceDraftState {
	const current = state.entries[lessonId];
	if (!current) return state;
	return {
		...state,
		entries: {
			...state.entries,
			[lessonId]: {
				...current,
				attendance,
			},
		},
	};
}

export function setDraftNote(
	state: AttendanceDraftState,
	lessonId: string,
	note: string,
): AttendanceDraftState {
	const current = state.entries[lessonId];
	if (!current) return state;
	return {
		...state,
		entries: {
			...state.entries,
			[lessonId]: {
				...current,
				note: note.slice(0, MAX_NOTE_LENGTH),
			},
		},
	};
}

export function missingAttendanceLessonIds(
	state: AttendanceDraftState,
): string[] {
	return state.order.filter(
		(lessonId) => state.entries[lessonId]?.attendance == null,
	);
}

export function toSaveEntries(
	state: AttendanceDraftState,
): SessionAttendanceSave["entries"] {
	const out: SessionAttendanceSave["entries"] = [];
	for (const lessonId of state.order) {
		const entry = state.entries[lessonId];
		if (!entry || entry.attendance === null) {
			throw new Error(`missing attendance for lesson ${lessonId}`);
		}
		out.push({
			lessonId,
			attendance: entry.attendance,
			note: entry.note.trim(),
		});
	}
	return out;
}

/** Điền `present` cho mọi dòng chưa chọn (`attendance === null`), giữ nguyên
 * lựa chọn có sẵn và ghi chú. Trả về đúng tham chiếu `state` khi không có dòng
 * nào đổi để component không re-render vô ích. Helper thuần để hộp xác nhận
 * "Gán Có mặt và lưu" tính entries trực tiếp, không phụ thuộc vòng render
 * (cấm pattern dispatch-then-read: `toSaveEntries` sẽ throw trên state stale). */
export function markAllPresentState(
	state: AttendanceDraftState,
): AttendanceDraftState {
	let changed = false;
	const nextEntries: Record<string, AttendanceDraftEntry> = {
		...state.entries,
	};
	for (const lessonId of state.order) {
		const current = nextEntries[lessonId];
		if (current && current.attendance === null) {
			nextEntries[lessonId] = { ...current, attendance: "present" };
			changed = true;
		}
	}
	return changed ? { ...state, entries: nextEntries } : state;
}

export function attendanceDraftReducer(
	state: AttendanceDraftState,
	action: AttendanceDraftAction,
): AttendanceDraftState {
	switch (action.type) {
		case "set":
			return setDraftAttendance(state, action.lessonId, action.attendance);
		case "setNote":
			return setDraftNote(state, action.lessonId, action.note);
		case "reset":
			return createAttendanceDraft(action.students);
		case "markAllPresent":
			return markAllPresentState(state);
	}
}
