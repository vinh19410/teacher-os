import { queryOptions } from "@tanstack/react-query";
import {
	type DashboardReminders,
	dashboardRemindersResponseSchema,
} from "@teacher-os/api/contracts";
import { HttpError } from "@/lib/kernel-load-state";
import { getApiBaseUrl } from "./api-base-url";

/** Base key của bộ đếm thẻ nhắc việc (TOS-6 #439). */
export const remindersBaseQueryKey = [
	"kernel",
	"dashboard",
	"reminders",
] as const;

/**
 * Key gắn `dataUpdatedAt` của kernel snapshot. Refresh sau action kernel
 * chạy `exact: true` trên `kernelQueryKey = ["kernel"]` (data-provider.tsx,
 * grading/$attemptId) nên prefix KHÔNG tự phủ key con — đưa timestamp vào
 * key là cách nối bộ đếm vào vòng đời snapshot: snapshot mới → key mới →
 * TanStack Query tự refetch.
 */
export const remindersQueryKey = (kernelDataUpdatedAt: number) =>
	[...remindersBaseQueryKey, kernelDataUpdatedAt] as const;

export async function fetchDashboardReminders(
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<DashboardReminders> {
	const res = await fetch(`${baseUrl}/api/dashboard/reminders`, {
		credentials: "include",
		signal,
	});
	if (!res.ok) {
		throw new HttpError(
			res.status,
			`Failed to load dashboard reminders: ${res.status}`,
		);
	}
	return dashboardRemindersResponseSchema.parse(await res.json());
}

export function dashboardRemindersQueryOptions(
	baseUrl = getApiBaseUrl(),
	kernelDataUpdatedAt = 0,
) {
	return queryOptions({
		queryKey: remindersQueryKey(kernelDataUpdatedAt),
		queryFn: ({ signal }) => fetchDashboardReminders(baseUrl, signal),
	});
}
