import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization";

/** Cùng union với `LeadStatus` ở @teacher-os/api lead-contracts (#506) —
 * db không phụ thuộc api, mirror kiểu như notification-record. */
export type LeadStatus = "new" | "contacted" | "enrolled" | "dropped";

/**
 * Lead từ form đăng ký công khai (msmy.io.vn → POST /public/leads, #506).
 * KHÔNG phải student (plan D1): lifecycle riêng new → contacted →
 * enrolled | dropped, không có portal identity. `ip_hash` là HMAC của IP
 * chống spam — không bao giờ trả client hay log thô.
 */
export const lead = sqliteTable(
	"lead",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		/** SĐT đã chuẩn hóa `0xxxxxxxxx` — khóa dedupe 24h theo org (D7). */
		phone: text("phone").notNull(),
		email: text("email").notNull().default(""),
		birthDate: text("birth_date").notNull().default(""),
		course: text("course").notNull().default(""),
		studyMode: text("study_mode").notNull().default(""),
		studyDays: text("study_days").notNull().default(""),
		timeSlot: text("time_slot").notNull().default(""),
		note: text("note").notNull().default(""),
		/** Kết quả test đầu vào tự điền từ quiz trên trang profile. */
		placement: text("placement").notNull().default(""),
		teacherNote: text("teacher_note").notNull().default(""),
		source: text("source").notNull().default("profile"),
		status: text("status").$type<LeadStatus>().notNull().default("new"),
		ipHash: text("ip_hash").notNull().default(""),
		submitCount: integer("submit_count").notNull().default(1),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		statusChangedAt: integer("status_changed_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		index("lead_org_status_created_idx").on(
			table.orgId,
			table.status,
			table.createdAt,
		),
		index("lead_org_phone_updated_idx").on(
			table.orgId,
			table.phone,
			table.updatedAt,
		),
		index("lead_ip_updated_idx").on(table.ipHash, table.updatedAt),
	],
);
