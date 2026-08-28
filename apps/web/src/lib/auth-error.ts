/** Resolve a displayable message from any better-auth/better-fetch error
 * shape without throwing. The QC #125 incident shipped because auth failures
 * were invisible; a differently-shaped error object must not be able to break
 * the toast path itself, so every read here is guarded and the caller's
 * fallback copy is the last resort. */
export function authErrorMessage(error: unknown, fallback: string): string {
	if (typeof error === "string" && error.trim()) return error;
	if (error && typeof error === "object") {
		const record = error as Record<string, unknown>;
		for (const key of ["message", "statusText"] as const) {
			const value = record[key];
			if (typeof value === "string" && value.trim()) return value;
		}
	}
	return fallback;
}
