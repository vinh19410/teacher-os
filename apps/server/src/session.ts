import type { createAuth } from "@teacher-os/auth";

export interface SessionUser {
	userId: string;
	userName: string;
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Resolve the Better-Auth session behind a request's headers.
 * Returns null when there is no valid session; callers decide 401 vs skip.
 * The caller owns the auth instance so tests and the E2E boot shim can share
 * one instance instead of the old construct-per-request behavior.
 */
export async function getSessionUser(
	auth: Auth,
	headers: Headers,
): Promise<SessionUser | null> {
	const session = await auth.api.getSession({ headers });
	if (!session?.user) {
		return null;
	}
	return { userId: session.user.id, userName: session.user.name };
}
