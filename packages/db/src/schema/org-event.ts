import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization";

/**
 * Sự kiện vận hành của org (TOS-14 / #447) — nằm ngoài lịch lớp: không tính
 * buổi dạy, không đụng điểm danh hay nhắc việc, chỉ hiển thị trên lịch.
 */
export const orgEvent = sqliteTable(
	"org_event",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		date: text("date").notNull(),
		startTime: text("start_time").notNull(),
		endTime: text("end_time").notNull(),
		note: text("note").notNull().default(""),
		createdByUserId: text("created_by_user_id").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("org_event_org_date_idx").on(table.orgId, table.date)],
);
