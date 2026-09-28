let blocked = false;
const listeners = new Set<() => void>();

/**
 * Role-block exit (plan #260): any 403 carrying
 * `ACCOUNT_STUDENT_ROLE` — read or write path — marks the document
 * role-blocked exactly once; DataProvider swaps the workspace for the
 * blocked view via `useSyncExternalStore`. Like `reauth`, it is a one-way
 * exit: a stale student session never becomes usable again.
 */
export function markRoleBlocked(): void {
	if (blocked) return;
	blocked = true;
	for (const listener of listeners) listener();
}

export function isRoleBlocked(): boolean {
	return blocked;
}

export function subscribeRoleBlocked(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
