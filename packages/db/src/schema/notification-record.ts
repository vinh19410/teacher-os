import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { organization } from "./organization";
import { student } from "./student";

/** Trạng thái vòng đời 1 thông báo: xếp hàng → gửi → học viên đọc, hoặc gửi lỗi. */
export type NotificationStatus = "queued" | "sent" | "read" | "failed";

/**
 * 1 dòng = 1 thông báo cho 1 học viên, phục vụ cả email lẫn in-app
 * (plan TOS-21 D1). Cột failed/retry_count/last_error có sẵn cho TOS-22/23.
 */
export const notificationRecord = sqliteTable(
	"notification_record",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		studentId: text("student_id")
			.notNull()
			.references(() => student.id, { onDelete: "cascade" }),
		eventType: text("event_type").notNull(),
		eventGroup: text("event_group").notNull(),
		/** Khóa chống gửi trùng, unique theo org (vd "grade:task-1"). */
		idempotencyKey: text("idempotency_key").notNull(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		linkPath: text("link_path").notNull().default(""),
		refType: text("ref_type").notNull().default(""),
		refId: text("ref_id").notNull().default(""),
		/** "email,in_app" hoặc "in_app". */
		channels: text("channels").notNull().default("in_app"),
		/** Snapshot email học viên lúc gửi. */
		recipientEmail: text("recipient_email"),
		senderName: text("sender_name").notNull().default(""),
		replyToEmail: text("reply_to_email"),
		status: text("status")
			.$type<NotificationStatus>()
			.notNull()
			.default("queued"),
		retryCount: integer("retry_count").notNull().default(0),
		lastError: text("last_error"),
		sentAt: integer("sent_at", { mode: "timestamp_ms" }),
		readAt: integer("read_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("notification_record_org_idempotency_key").on(
			table.orgId,
			table.idempotencyKey,
		),
		index("notification_record_org_created_idx").on(
			table.orgId,
			table.createdAt,
			table.id,
		),
		index("notification_record_org_student_created_idx").on(
			table.orgId,
			table.studentId,
			table.createdAt,
		),
	],
);
