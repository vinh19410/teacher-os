import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization";

export const workspaceSettings = sqliteTable("workspace_settings", {
	orgId: text("org_id")
		.primaryKey()
		.references(() => organization.id, { onDelete: "cascade" }),
	defaultUnitPrice: text("default_unit_price").notNull().default("400.000đ"),
	tplReminder: text("tpl_reminder")
		.notNull()
		.default(
			"Chào phụ huynh, mai ({{date}}) học viên {{student_name}} có buổi học lúc {{time}} hình thức {{mode}}. Link: {{zoom_link}}. Nhắc em chuẩn bị bài nhé ạ.",
		),
	tplDebt: text("tpl_debt")
		.notNull()
		.default(
			"Phụ huynh ơi, học phí gói của {{student_name}} còn nợ {{amount}}. Giáo viên gửi QR MoMo {{qr_link}}. Nhờ phụ huynh thanh toán giúp ạ.",
		),
	tplReport: text("tpl_report")
		.notNull()
		.default(
			"Tuần này {{student_name}} học {{sessions}} buổi, chuyên cần {{attendance}}. Band gần nhất: {{latest_band}}. Việc ở nhà: {{homework}}. Chi tiết: {{report_link}}",
		),
	absenceNoticeHours: text("absence_notice_hours")
		.notNull()
		.default("2 giờ trước buổi học"),
	unexcusedDeduct: text("unexcused_deduct").notNull().default("Có, trừ 1 buổi"),
	maxAbsencesBeforeAlert: integer("max_absences_before_alert")
		.notNull()
		.default(2),
	reminderSchedule: text("reminder_schedule")
		.notNull()
		.default("T−24h và T−1h"),
	overdueDebtReminder: text("overdue_debt_reminder")
		.notNull()
		.default("Sau 3 ngày và 7 ngày"),
	packageEndReminder: text("package_end_reminder")
		.notNull()
		.default("Khi còn 3 buổi"),
	preferredChannel: text("preferred_channel")
		.notNull()
		.default("Zalo trước, email dự phòng"),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
});
