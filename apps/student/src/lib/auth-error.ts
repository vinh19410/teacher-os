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
