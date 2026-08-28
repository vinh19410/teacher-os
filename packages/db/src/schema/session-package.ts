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
import { student } from "./student";

/**
 * Package = entitlement owned by a student (issue #104): `studentId` is the
 * source of truth; `enrollmentId` is the optional class attachment, so a
 * package can exist before the student joins a class ("parked" package — at
 * most one per student, enforced by a partial unique index). No done/remaining
 * columns: both derive from completed lessons later; check-in must never write
 * here.
 */
export const sessionPackage = sqliteTable(
	"session_package",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		studentId: text("student_id")
			.notNull()
			.references(() => student.id, { onDelete: "cascade" }),
		enrollmentId: text("enrollment_id").references(() => enrollment.id, {
			onDelete: "cascade",
		}),
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
		index("session_package_org_student_idx").on(table.orgId, table.studentId),
		uniqueIndex("session_package_parked_student_uq")
			.on(table.studentId)
			.where(sql`${table.enrollmentId} is null`),
	],
);
