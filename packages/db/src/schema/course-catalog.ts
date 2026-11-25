import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { organization } from "./organization";

/**
 * Cờ đánh dấu tổ chức đã được khởi tạo danh mục khóa học mặc định (Giao Tiếp
 * 3 khóa, IELTS 4 khóa) — đảm bảo seed idempotent và không tự mọc lại nếu chủ
 * trung tâm chủ động xóa toàn bộ danh mục về sau.
 */
export const courseCatalogSeed = sqliteTable("course_catalog_seed", {
	orgId: text("org_id")
		.primaryKey()
		.references(() => organization.id, { onDelete: "cascade" }),
	seededAt: integer("seeded_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
});

/**
 * Nhóm khóa học master data theo tổ chức (ví dụ: Giao Tiếp, IELTS).
 */
export const courseCategory = sqliteTable(
	"course_category",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		sortOrder: integer("sort_order").notNull().default(0),
		isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("course_category_org_sort_idx").on(
			table.orgId,
			table.sortOrder,
			table.id,
		),
		// SQLite `lower()` chỉ hạ chữ cái ASCII; tầng ứng dụng vẫn giữ
		// `normalizeCourseNameKey` để chuẩn hóa Unicode tiếng Việt & khoảng trắng.
		uniqueIndex("course_category_org_name_uq").on(
			table.orgId,
			sql`lower(trim(${table.name}))`,
		),
	],
);

/**
 * Khóa học thuộc một nhóm khóa học theo tổ chức.
 */
export const course = sqliteTable(
	"course",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		categoryId: text("category_id")
			.notNull()
			.references(() => courseCategory.id, { onDelete: "restrict" }),
		name: text("name").notNull(),
		sortOrder: integer("sort_order").notNull().default(0),
		isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("course_org_category_sort_idx").on(
			table.orgId,
			table.categoryId,
			table.sortOrder,
			table.id,
		),
		// SQLite `lower()` chỉ hạ chữ cái ASCII; tầng ứng dụng vẫn giữ
		// `normalizeCourseNameKey` để chuẩn hóa Unicode tiếng Việt & khoảng trắng.
		uniqueIndex("course_org_category_name_uq").on(
			table.orgId,
			table.categoryId,
			sql`lower(trim(${table.name}))`,
		),
	],
);
