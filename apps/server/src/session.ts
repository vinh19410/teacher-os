import { createAuth } from "@teacher-os/auth";

export interface SessionUser {
	userId: string;
	userName: string;
}

/**
 * Resolve the Better-Auth session behind a request's headers.
 * Returns null when there is no valid session; callers decide 401 vs skip.
 */
export async function getSessionUser(
	headers: Headers,
): Promise<SessionUser | null> {
	const auth = createAuth();
	const session = await auth.api.getSession({ headers });
	if (!session?.user) {
		return null;
	}
	return { userId: session.user.id, userName: session.user.name };
}
