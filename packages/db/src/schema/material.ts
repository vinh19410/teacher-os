import { sql } from "drizzle-orm";
import {
	type AnySQLiteColumn,
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { classTable } from "./class";
import { organization } from "./organization";
import { syllabusLesson } from "./syllabus";

/**
 * Thư mục của ngân hàng tài liệu, dùng chung cho mọi giáo viên trong org.
 * `parentId` NULL là thư mục gốc. Tên duy nhất trong cùng một cha (coalesce
 * vì SQLite coi mọi NULL là khác nhau trong unique index). Độ sâu tối đa (5)
 * và chống vòng lặp được khóa nguyên tử bằng SQL `WITH RECURSIVE` ngay trong route (#646).
 * FK cha là NO ACTION: thư mục chỉ xoá được khi rỗng, còn xoá org thì
 * cascade dọn cả cây trong cùng một câu lệnh.
 */
export const materialFolder = sqliteTable(
	"material_folder",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		parentId: text("parent_id").references(
			(): AnySQLiteColumn => materialFolder.id,
			{ onDelete: "no action" },
		),
		name: text("name").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("material_folder_org_parent_idx").on(table.orgId, table.parentId),
		uniqueIndex("material_folder_org_parent_name_uq").on(
			table.orgId,
			sql`coalesce(${table.parentId}, '')`,
			table.name,
		),
	],
);

/**
 * Tài liệu trong ngân hàng của org: `file` (tài liệu), `media` (audio/video)
 * — cả hai có object trong bucket private `materials` theo key
 * `<orgId>/<materialId>` — hoặc `link` (URL http/https ngoài). `objectKey` và
 * `createdBy` là cột teacher-only, không bao giờ chiếu sang /api/student.
 * Tài liệu đang gắn vào buổi học không xoá được (FK từ `lesson_material`).
 */
export const material = sqliteTable(
	"material",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		folderId: text("folder_id").references(() => materialFolder.id, {
			onDelete: "no action",
		}),
		title: text("title").notNull(),
		description: text("description").notNull().default(""),
		kind: text("kind").notNull(), // "file" | "link" | "media"
		url: text("url"),
		objectKey: text("object_key"),
		mimeType: text("mime_type"),
		sizeBytes: integer("size_bytes"),
		originalName: text("original_name"),
		createdBy: text("created_by").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("material_org_folder_idx").on(table.orgId, table.folderId),
		index("material_org_kind_idx").on(table.orgId, table.kind),
		check(
			"material_kind_shape",
			sql`(${table.kind} = 'link' and ${table.url} is not null and ${table.objectKey} is null) or (${table.kind} in ('file', 'media') and ${table.objectKey} is not null and ${table.url} is null)`,
		),
	],
);

/**
 * Tài liệu gắn vào một buổi học. Buổi học là nhóm dòng `lesson` cùng
 * (classId, date) nên liên kết theo cặp đó, không theo từng dòng lesson;
 * dời buổi (`sessions/:date/edit` với moveDate) kéo theo `date` ở đây.
 * Xoá lớp cascade dọn liên kết; FK tới `material` là NO ACTION để tài liệu
 * đang dùng không xoá được.
 */
export const lessonMaterial = sqliteTable(
	"lesson_material",
	{
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		classId: text("class_id")
			.notNull()
			.references(() => classTable.id, { onDelete: "cascade" }),
		/** Ngày buổi học yyyy-mm-dd — cùng giá trị `lesson.date`. */
		date: text("date").notNull(),
		materialId: text("material_id")
			.notNull()
			.references(() => material.id, { onDelete: "no action" }),
		position: integer("position").notNull().default(0),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		primaryKey({
			name: "lesson_material_pk",
			columns: [table.classId, table.date, table.materialId],
		}),
		index("lesson_material_material_idx").on(table.materialId),
		index("lesson_material_org_idx").on(table.orgId),
	],
);

/**
 * Tài liệu ngân hàng gắn vào một bài học giáo trình (template dùng chung hoặc
 * bản copy của lớp, issue #655). Bài học là slot không có ngày nên không dùng
 * `lesson_material` (bảng đó định danh theo (classId, date)); hiển thị ở buổi
 * dạy được resolve theo vị trí buổi N ↔ bài N, cùng mapping với topic. Copy
 * template → lớp copy cả links (remap `syllabusLessonId`, giữ `materialId` —
 * ngân hàng là tài nguyên org dùng chung). FK tới `material` là NO ACTION để
 * tài liệu đang dùng không xoá được; FK bài học cascade dọn link khi xoá
 * bài/module/syllabus.
 */
export const syllabusLessonMaterial = sqliteTable(
	"syllabus_lesson_material",
	{
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		syllabusLessonId: text("syllabus_lesson_id")
			.notNull()
			.references(() => syllabusLesson.id, { onDelete: "cascade" }),
		materialId: text("material_id")
			.notNull()
			.references(() => material.id, { onDelete: "no action" }),
		position: integer("position").notNull().default(0),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		primaryKey({
			name: "syllabus_lesson_material_pk",
			columns: [table.syllabusLessonId, table.materialId],
		}),
		index("syllabus_lesson_material_material_idx").on(table.materialId),
		index("syllabus_lesson_material_org_idx").on(table.orgId),
	],
);
