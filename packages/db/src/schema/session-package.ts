import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { enrollment } from "./enrollment";
import { organization } from "./organization";

/**
 * Package = entitlement attached to one enrollment — invariant 6.
 * No done/remaining columns: both derive from completed lessons later;
 * check-in must never write here.
 */
export const sessionPackage = sqliteTable(
	"session_package",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		enrollmentId: text("enrollment_id")
			.notNull()
			.references(() => enrollment.id, { onDelete: "cascade" }),
		total: integer("total").notNull(),
		price: integer("price").notNull().default(0),
		mode: text("mode").notNull().default("Online"),
		start: text("start").notNull().default(""),
		expiry: text("expiry").notNull().default(""),
		status: text("status").notNull().default("active"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("session_package_enrollment_uq").on(table.enrollmentId),
		index("session_package_org_idx").on(table.orgId),
	],
);
