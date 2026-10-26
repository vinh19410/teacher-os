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
 * Kỳ nghỉ chung của tổ chức (TOS-11, FR-selfomy-alignment-007): một dòng =
 * một kỳ nghỉ với phạm vi toàn tổ chức hoặc lớp chọn lọc và phương thức
 * `shift` (dời buổi +1 vào cuối khóa) / `cancel` (TOS-13).
 *
 * Buổi gốc bị dời có `lesson.status = "holiday"` (không trừ buổi, không điểm
 * danh); buổi bù là dòng `lesson` `upcoming` thường. `notify` là cờ "Gửi
 * thông báo" ở hộp thoại; `notifiedAt` do TOS-19 set khi Email/In-app cho
 * học viên đã gửi — null = chưa gửi, không set lúc apply.
 */
export const organizationHoliday = sqliteTable(
	"organization_holiday",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		/** 2–100 ký tự sau trim (contract `holidayDraftSchema`). */
		name: text("name").notNull(),
		/** yyyy-mm-dd, tính cả hai đầu; ≤ 30 ngày. */
		fromDate: text("from_date").notNull(),
		toDate: text("to_date").notNull(),
		/** "org" = toàn tổ chức | "classes" = các lớp trong organization_holiday_class. */
		scope: text("scope").notNull(),
		/** "shift" (TOS-11) | "cancel" (TOS-13). */
		mode: text("mode").notNull(),
		notify: integer("notify", { mode: "boolean" }).notNull().default(true),
		/** TOS-19 set khi đã gửi Email/In-app cho học viên; null = chưa gửi. */
		notifiedAt: integer("notified_at", { mode: "timestamp_ms" }),
		createdByUserId: text("created_by_user_id").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("organization_holiday_org_dates_idx").on(table.orgId, table.fromDate),
	],
);

/** Lớp áp dụng khi `scope = "classes"`; không có dòng khi scope = "org". */
export const organizationHolidayClass = sqliteTable(
	"organization_holiday_class",
	{
		id: text("id").primaryKey(),
		holidayId: text("holiday_id")
			.notNull()
			.references(() => organizationHoliday.id, { onDelete: "cascade" }),
		classId: text("class_id")
			.notNull()
			.references(() => classTable.id, { onDelete: "cascade" }),
	},
	(table) => [
		uniqueIndex("organization_holiday_class_holiday_class_uq").on(
			table.holidayId,
			table.classId,
		),
	],
);

/**
 * Cặp buổi gốc → buổi bù (TOS-11 D2): nguồn duy nhất cho nhãn "Đã dời sang
 * dd/MM" trên lịch và cho hoàn tác (TOS-13) — không đoán ngược từ `lesson`.
 *
 * Unique `(classId, originalDate)` — một buổi gốc chỉ bị dời một lần;
 * uniqueIndex `(classId, makeupDate)` — hai buổi bù không được rơi vào cùng
 * một ngày của cùng một lớp (red-team C3: hai apply đồng thời).
 */
export const holidaySessionShift = sqliteTable(
	"holiday_session_shift",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		holidayId: text("holiday_id")
			.notNull()
			.references(() => organizationHoliday.id, { onDelete: "cascade" }),
		classId: text("class_id")
			.notNull()
			.references(() => classTable.id, { onDelete: "cascade" }),
		/** yyyy-mm-dd của buổi gốc (đã chuyển `status = "holiday"`). */
		originalDate: text("original_date").notNull(),
		/** yyyy-mm-dd buổi bù cuối khóa (thứ + khung giờ chuẩn của lớp). */
		makeupDate: text("makeup_date").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("holiday_session_shift_class_original_uq").on(
			table.classId,
			table.originalDate,
		),
		uniqueIndex("holiday_session_shift_class_makeup_uq").on(
			table.classId,
			table.makeupDate,
		),
		index("holiday_session_shift_org_idx").on(table.orgId),
		index("holiday_session_shift_holiday_idx").on(table.holidayId),
	],
);
