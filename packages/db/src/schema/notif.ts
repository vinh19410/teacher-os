import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization";

export type NotifDot = "accent" | "danger" | "warn";

/** Read-only notification feed for the current product surface. */
export const notif = sqliteTable(
	"notif",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		text: text("text").notNull(),
		time: text("time").notNull().default(""),
		channel: text("channel").notNull().default(""),
		dot: text("dot").$type<NotifDot>().notNull().default("accent"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("notif_org_created_idx").on(table.orgId, table.createdAt, table.id),
	],
);
