import {
	type ProvisionStudentOptions,
	provisionStudentForUser as provisionAuthStudentForUser,
} from "@teacher-os/auth/student-provisioning";
import type { Db } from "./app";

export type { ProvisionStudentOptions };

/**
 * Provision a student record for a verified user into the single active org
 * (delegating to `@teacher-os/auth/student-provisioning`).
 * Kept as a real async function wrapper so `vi.spyOn` in tests intercepts it cleanly.
 */
export async function provisionStudentForUser(
	db: Db,
	user: { name?: string | null; email: string },
	options?: ProvisionStudentOptions,
): Promise<void> {
	await provisionAuthStudentForUser(db, user, options);
}
