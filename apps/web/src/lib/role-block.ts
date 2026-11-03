let blocked = false;
let blockReason: string | undefined;
const listeners = new Set<() => void>();

/**
 * Role-block exit (plan #260, #513, #524): any 403 carrying
 * `ACCOUNT_STUDENT_ROLE`, `ACCOUNT_TEACHER_NOT_ALLOWED`, or
 * `ACCOUNT_TEACHER_EMAIL_UNVERIFIED` — read or write path — marks the document
 * role-blocked exactly once; DataProvider swaps the workspace for the
 * blocked view via `useSyncExternalStore`.
 */
export function markRoleBlocked(reason?: string): void {
	if (blocked) {
		if (blockReason === undefined && reason !== undefined) {
			blockReason = reason;
		}
		return;
	}
	blocked = true;
	blockReason = reason;
	for (const listener of listeners) listener();
}

export function isRoleBlocked(): boolean {
	return blocked;
}

export function getRoleBlockReason(): string | undefined {
	return blockReason;
}

export function resetRoleBlockedForTest(): void {
	blocked = false;
	blockReason = undefined;
	listeners.clear();
}

export function subscribeRoleBlocked(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
