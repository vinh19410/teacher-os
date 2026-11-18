import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { classTable } from "./class";
import { organization } from "./organization";

/**
 * Google Calendar / Meet / Recording metadata for a physical class occurrence
 * `(classId, date)`.
 *
 * Keyed by `(classId, date)` (matching `lesson_material`) so both `auto` classes
 * (which materialize `N` `lesson` rows per occurrence, or 0 rows before
 * enrollment) and `manual` classes (`class_session`) share one authoritative
 * meeting & recording record per physical session.
 *
 * `meetUrl` is mirrored into `class_session.zoom` and `lesson.zoom` for
 * backward compatibility with reminders (`{{zoom_link}}`) and existing UI.
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
		meetUrl: text("meet_url").notNull().default(""),
		googleCalendarEventId: text("google_calendar_event_id"),
		/** Meet REST API v2 space resource name, e.g. `spaces/abc-defg-hij`. */
		googleMeetSpaceName: text("google_meet_space_name"),
		/** Meet code, e.g. `abc-defg-hij`. */
		googleMeetCode: text("google_meet_code"),
		/** Teacher user id whose Google Workspace account owns the event/space. */
		googleOwnerUserId: text("google_owner_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		recordingUrl: text("recording_url").notNull().default(""),
		recordingFileId: text("recording_file_id"),
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
