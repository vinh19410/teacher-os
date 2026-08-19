import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { organization } from "./organization";

/** Teacher-authored reusable feedback. Text may contain sensitive education data. */
export const commentBank = sqliteTable(
	"comment_bank",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		operationId: text("operation_id").notNull(),
		tag: text("tag").notNull().default("chung"),
		text: text("text").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("comment_bank_org_operation_uidx").on(
			table.orgId,
			table.operationId,
		),
		index("comment_bank_org_created_idx").on(
			table.orgId,
			table.createdAt,
			table.id,
		),
	],
);
