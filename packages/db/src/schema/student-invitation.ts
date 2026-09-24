import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { organization } from "./organization";

export const studentInvitation = sqliteTable(
	"student_invitation",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		inviterUserId: text("inviter_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		status: text("status")
			.$type<"pending" | "accepted" | "rejected" | "canceled">()
			.notNull()
			.default("pending"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("student_invitation_org_idx").on(table.orgId),
		index("student_invitation_email_idx").on(table.email),
		uniqueIndex("student_invitation_org_email_pending_uq")
			.on(table.orgId, sql`lower(trim(${table.email}))`)
			.where(sql`status = 'pending'`),
	],
);
