import { queryOptions } from "@tanstack/react-query";
import {
	type DailyAttendanceResponse,
	dailyAttendanceResponseSchema,
	type SessionAttendanceSave,
} from "@teacher-os/api/contracts";
import { HttpError } from "@/lib/kernel-load-state";
import { getApiBaseUrl } from "./api-base-url";

export const dailyAttendanceBaseQueryKey = [
	"kernel",
	"attendance",
	"daily",
] as const;

export const dailyAttendanceQueryKey = (date: string) =>
	[...dailyAttendanceBaseQueryKey, date] as const;

export class DailyAttendanceApiError extends HttpError {
	readonly reason?: string;
	readonly missing?: string[];

	constructor(
		status: number,
		message: string,
		opts: { reason?: string; missing?: string[] } = {},
	) {
		super(status, message);
		this.name = "DailyAttendanceApiError";
		this.reason = opts.reason;
		this.missing = opts.missing;
	}
}

async function throwAttendanceHttpError(
	res: Response,
	action: string,
): Promise<never> {
	let reason: string | undefined;
	let missing: string[] | undefined;
	try {
		const body = (await res.json()) as {
			reason?: unknown;
			error?: unknown;
			missing?: unknown;
		};
		if (typeof body?.reason === "string") {
			reason = body.reason;
		} else if (typeof body?.error === "string") {
			reason = body.error;
		}
		if (Array.isArray(body?.missing)) {
			missing = body.missing.filter((x): x is string => typeof x === "string");
		}
	} catch {
		// Non-JSON error body
	}
	throw new DailyAttendanceApiError(
		res.status,
		`Failed to ${action}: ${res.status}`,
		{ reason, missing },
	);
}

export async function fetchDailyAttendance(
	date: string,
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<DailyAttendanceResponse> {
	const res = await fetch(
		`${baseUrl}/api/attendance/daily?date=${encodeURIComponent(date)}`,
		{
			credentials: "include",
			signal,
		},
	);
	if (!res.ok) {
		await throwAttendanceHttpError(res, "load daily attendance");
	}
	return dailyAttendanceResponseSchema.parse(await res.json());
}

export function dailyAttendanceQuery(
	date: string,
	baseUrl: string = getApiBaseUrl(),
) {
	return queryOptions({
		queryKey: dailyAttendanceQueryKey(date),
		queryFn: ({ signal }) => fetchDailyAttendance(date, baseUrl, signal),
	});
}

export async function saveSessionAttendance(
	classId: string,
	date: string,
	entries: SessionAttendanceSave["entries"],
	baseUrl: string = getApiBaseUrl(),
): Promise<{ updated: number; recorded: boolean }> {
	const res = await fetch(
		`${baseUrl}/api/classes/${encodeURIComponent(classId)}/sessions/${encodeURIComponent(date)}/attendance`,
		{
			method: "PUT",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ entries }),
		},
	);
	if (!res.ok) {
		await throwAttendanceHttpError(res, "save session attendance");
	}
	return (await res.json()) as { updated: number; recorded: boolean };
}
