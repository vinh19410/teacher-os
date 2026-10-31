import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization";

/**
 * Bộ đề kiểm tra đầu vào (`/kiem-tra-dau-vao/`, issue #515) — một org một đề
 * (D5). `draft` là JSON `PlacementContent` giáo viên đang sửa; `published` là
 * snapshot JSON `PlacementSnapshot` dựng tại thời điểm bấm Phát hành (D6).
 *
 * CAS trên `revision` chặn sửa đồng thời (409); `published_revision` ghi lại
 * `revision` tại lúc Phát hành gần nhất để tính chính xác cờ `dirty`.
 */
export const placementTest = sqliteTable("placement_test", {
	orgId: text("org_id")
		.primaryKey()
		.references(() => organization.id, { onDelete: "cascade" }),
	draft: text("draft"),
	published: text("published"),
	revision: integer("revision").notNull().default(0),
	publishedRevision: integer("published_revision"),
	publishedVersion: integer("published_version").notNull().default(0),
	publishedAt: integer("published_at", { mode: "timestamp_ms" }),
	publishedBy: text("published_by"),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
});

/**
 * Metadata file audio của bộ đề kiểm tra đầu vào (D8). Object thật nằm ở
 * bucket `LIBRARY_AUDIO` với key `placement/<orgId>/<id>`. Mỗi lần upload
 * sinh `id` (UUID) mới, bất biến, nên route công khai trả `Cache-Control:
 * immutable` được; file mồ côi > 24 giờ được dọn nền sau khi Phát hành (D11).
 */
export const placementTestAudio = sqliteTable(
	"placement_test_audio",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		objectKey: text("object_key").notNull(),
		name: text("name").notNull(),
		contentType: text("content_type").notNull(),
		size: integer("size").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("placement_test_audio_org_id_idx").on(table.orgId)],
);
