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
		/** `none | pending | ready | failed` */
		recordingStatus: text("recording_status").notNull().default("none"),
		recordingError: text("recording_error"),
		recordingSyncedAt: integer("recording_synced_at", { mode: "timestamp_ms" }),
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
	],
);
