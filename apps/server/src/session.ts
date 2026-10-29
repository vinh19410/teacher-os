import type { Auth } from "@teacher-os/auth";
import { resolveUserRole } from "@teacher-os/auth/role";

export interface SessionUser {
	userId: string;
	userName: string;
	email?: string;
	emailVerified?: boolean;
	/** Auth app-role resolved from `user.role` (plan #260, admin ở plan #413). */
	role: "teacher" | "student" | "admin";
}

export type { Auth };

/**
 * Resolve the Better-Auth session behind a request's headers.
 * Returns null when there is no valid session; callers decide 401 vs skip.
 * The caller owns the auth instance so tests and the E2E boot shim can share
 * one instance instead of the old construct-per-request behavior.
 * `assumeEmailVerified` (staging QA only, infra blocks it on prod) reports
 * every user as verified, including accounts created before the flag.
 */
export async function getSessionUser(
	auth: Auth,
	headers: Headers,
	assumeEmailVerified = false,
): Promise<SessionUser | null> {
	const session = await auth.api.getSession({ headers });
	if (!session?.user) {
		return null;
	}
	return {
		userId: session.user.id,
		userName: session.user.name,
		email: session.user.email,
		emailVerified: assumeEmailVerified || Boolean(session.user.emailVerified),
		role: resolveUserRole((session.user as { role?: string | null }).role),
	};
}
