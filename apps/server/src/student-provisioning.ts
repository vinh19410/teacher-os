import {
	organization,
	student,
	studentInvitation,
} from "@teacher-os/db/schema/index";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "./app";

/**
 * Provision a student record for a verified user on their first student portal login.
 * Decisions D1, D2, D3, D7:
 * - D1: Provisioned at student portal bridge middleware, not in auth hook.
 * - D2: Target org = earliest global organization (created_at ASC, id ASC).
 * - D3: Only provisions if 0 rows match lower(trim(email)).
 * - D7: Fail-open: swallow errors & race collisions, log, never throw.
 */
export async function provisionStudentForUser(
	db: Db,
	user: { name?: string | null; email: string },
): Promise<void> {
	const email = user.email?.trim().toLowerCase();
	if (!email) {
		return;
	}

	try {
		const existing = await db
			.select({ id: student.id })
			.from(student)
			.where(sql`lower(trim(${student.email})) = ${email}`)
			.limit(1);

		if (existing.length > 0) {
			return;
		}

		// Do not auto-provision to earliest org if pending invitations exist for this email
		const pending = await db
			.select({ id: studentInvitation.id })
			.from(studentInvitation)
			.where(
				and(
					sql`lower(trim(${studentInvitation.email})) = ${email}`,
					eq(studentInvitation.status, "pending"),
				),
			)
			.limit(1);

		if (pending.length > 0) {
			return;
		}

		const earliestOrg = await db
			.select({ id: organization.id })
			.from(organization)
			.orderBy(asc(organization.createdAt), asc(organization.id))
			.limit(1);

		const targetOrg = earliestOrg[0];
		if (!targetOrg) {
			return;
		}

		const orgId = targetOrg.id;
		const id = crypto.randomUUID();

		await db.insert(student).values({
			id,
			orgId,
			name: user.name ?? "",
			email,
			phone: "",
			zalo: "",
			parentName: "",
			parentPhone: "",
		});
	} catch (err) {
		// Unique constraint violation or transient error: swallow & log per D7
		console.error("provisionStudentForUser failed or collided", {
			email,
			error: err,
		});
	}
}
