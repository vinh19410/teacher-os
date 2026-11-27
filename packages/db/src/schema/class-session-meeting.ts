import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { classTable } from "./class";
import { organization } from "./organization";

/**
 * Zoom meeting & cloud recording cho một buổi học `(classId, date)`.
 *
 * Keyed by `(classId, date)` (matching `lesson_material`) so both `auto` classes
 * (which materialize `N` `lesson` rows per occurrence, or 0 rows before
 * enrollment) and `manual` classes (`class_session`) share one authoritative
 * meeting & recording record per physical session.
 *
 * `joinUrl` được mirror vào `class_session.zoom` / `lesson.zoom` để biến nhắc
 * lịch `{{zoom_link}}` dùng tiếp.
 */
export const classSessionMeeting = sqliteTable(
	"class_session_meeting",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		classId: text("class_id")
			.notNull()
			.references(() => classTable.id, { onDelete: "cascade" }),
		/** Occurrence identity yyyy-mm-dd (Asia/Ho_Chi_Minh). */
		date: text("date").notNull(),
		joinUrl: text("join_url").notNull().default(""),
		/** ID số của Zoom meeting, lưu dạng chuỗi. */
		zoomMeetingId: text("zoom_meeting_id"),
		recordingPassword: text("recording_password"),
		recordingUrl: text("recording_url").notNull().default(""),
		/** `none | pending | ready | failed | expired` */
		recordingStatus: text("recording_status").notNull().default("none"),
		recordingError: text("recording_error"),
		recordingSyncedAt: integer("recording_synced_at", { mode: "timestamp_ms" }),
		/** Key object trong bucket R2 private `recordings` — tuyệt đối không lộ ra client. */
		recordingStorageKey: text("recording_storage_key"),
		recordingSizeBytes: integer("recording_size_bytes"),
		recordingMimeType: text("recording_mime_type"),
		recordingUploadedAt: integer("recording_uploaded_at", {
			mode: "timestamp_ms",
		}),
		/** Thời điểm tự động xóa khỏi R2 (recordingUploadedAt + 90 ngày). */
		recordingExpiresAt: integer("recording_expires_at", {
			mode: "timestamp_ms",
		}),
		/** Trạng thái dọn bản gốc trên Zoom Cloud (`none | pending | trashed | failed`). */
		recordingZoomTrashStatus: text("recording_zoom_trash_status")
			.notNull()
			.default("none"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("class_session_meeting_class_date_uq").on(
			table.classId,
			table.date,
		),
		index("class_session_meeting_org_idx").on(table.orgId),
		index("class_session_meeting_recording_idx").on(
			table.recordingStatus,
			table.date,
		),
		index("class_session_meeting_recording_expires_idx").on(
			table.recordingExpiresAt,
		),
	],
);
