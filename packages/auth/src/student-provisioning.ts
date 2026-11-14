import {
	membership,
	organization,
	student,
	studentInvitation,
	user,
} from "@teacher-os/db/schema/index";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

export interface ProvisionStudentOptions {
	teacherEmails?: string[];
}

type ProvisioningSqliteDb = BaseSQLiteDatabase<
	"async",
	unknown,
	Record<string, never>
>;

const ACTIVE_MANAGER_ROLES = ["owner", "teacher", "admin"];

async function acceptPendingInvitations(
	db: ProvisioningSqliteDb,
	email: string,
): Promise<void> {
	await db
		.update(studentInvitation)
		.set({ status: "accepted", updatedAt: new Date() })
		.where(
			and(
				sql`lower(trim(${studentInvitation.email})) = ${email}`,
				eq(studentInvitation.status, "pending"),
			),
		);
}

async function resolveTargetOrganization(
	db: ProvisioningSqliteDb,
	teacherEmails?: string[],
): Promise<{ id: string } | null> {
	const normalizedTeacherEmails = (teacherEmails ?? [])
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);

	// Tier 1: Org owned/managed by one of the configured TEACHER_EMAILS
	if (normalizedTeacherEmails.length > 0) {
		const [teacherOrg] = await db
			.select({ id: organization.id })
			.from(organization)
			.innerJoin(membership, eq(membership.orgId, organization.id))
			.innerJoin(user, eq(user.id, membership.userId))
			.where(
				and(
					inArray(membership.role, ACTIVE_MANAGER_ROLES),
					inArray(
						sql<string>`lower(trim(${user.email}))`,
						normalizedTeacherEmails,
					),
				),
			)
			.orderBy(asc(organization.createdAt), asc(organization.id))
			.limit(1);

		if (teacherOrg) {
			return teacherOrg;
		}
	}

	// Tier 2: Earliest org with an active manager membership (skips unowned seed orgs)
	const [managedOrg] = await db
		.select({ id: organization.id })
		.from(organization)
		.innerJoin(membership, eq(membership.orgId, organization.id))
		.where(inArray(membership.role, ACTIVE_MANAGER_ROLES))
		.orderBy(asc(organization.createdAt), asc(organization.id))
		.limit(1);

	if (managedOrg) {
		return managedOrg;
	}

	// Tier 3: Earliest organization fallback for unit/E2E harnesses without memberships
	const [fallbackOrg] = await db
		.select({ id: organization.id })
		.from(organization)
		.orderBy(asc(organization.createdAt), asc(organization.id))
		.limit(1);

	return fallbackOrg ?? null;
}

/**
 * Provision a student record for a verified student user into the single active
 * organization, auto-accepting any pending invitations for that email.
 * Fail-open: swallows errors & race collisions, logs, and never throws.
 */
export async function provisionStudentForUser(
	rawDb: object,
	userInput: { name?: string | null; email: string },
	options?: ProvisionStudentOptions,
): Promise<void> {
	const email = userInput.email?.trim().toLowerCase();
	if (!email) {
		return;
	}

	const fallbackName = email.split("@")[0] || "Học viên";
	const name = userInput.name?.trim() || fallbackName;
	const db = rawDb as ProvisioningSqliteDb;

	try {
		const existing = await db
			.select({ id: student.id })
			.from(student)
			.where(sql`lower(trim(${student.email})) = ${email}`)
			.limit(1);

		if (existing.length > 0) {
			await acceptPendingInvitations(db, email);
			return;
		}

		const targetOrg = await resolveTargetOrganization(
			db,
			options?.teacherEmails,
		);
		if (!targetOrg) {
			return;
		}

		await db.insert(student).values({
			id: crypto.randomUUID(),
			orgId: targetOrg.id,
			name,
			email,
			phone: "",
			zalo: "",
			parentName: "",
			parentPhone: "",
		});

		await acceptPendingInvitations(db, email);
	} catch (err) {
		console.error("provisionStudentForUser failed or collided", {
			email,
			error: err,
		});
	}
}
