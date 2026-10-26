/**
 * Notification logs read repo (#454, plan TOS-21 phase 5) — fetch GET
 * /api/notification-logs với bộ lọc sống URL (q/event/status/page), parse
 * bằng contract schema, ném HttpError khi response không ok (chuẩn repos/grading).
 */
import { queryOptions } from "@tanstack/react-query";
import {
	type NotificationLogQuery,
	notificationLogResponseSchema,
} from "@teacher-os/api/contracts";
import { HttpError } from "@/lib/kernel-load-state";
import { getApiBaseUrl } from "./api-base-url";

export const NOTIFICATION_LOGS_PAGE_SIZE = 20;

/** Query key đổi theo bộ lọc — mỗi tổ hợp q/event/status/page 1 cache slot. */
export const notificationLogsQueryKey = (params: NotificationLogQuery) =>
	["kernel", "notification-logs", params] as const;

export async function fetchNotificationLogs(
	params: NotificationLogQuery,
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
) {
	const url = new URL(`${baseUrl}/api/notification-logs`);
	if (params.q?.trim()) url.searchParams.set("q", params.q.trim());
	if (params.event) url.searchParams.set("event", params.event);
	if (params.status) url.searchParams.set("status", params.status);
	if (params.page && params.page > 1) {
		url.searchParams.set("page", String(params.page));
	}
	const res = await fetch(url, {
		credentials: "include",
		signal,
	});
	if (!res.ok) {
		throw new HttpError(
			res.status,
			`Failed to load notification logs: ${res.status}`,
		);
	}
	return notificationLogResponseSchema.parse(await res.json());
}

export function notificationLogsQueryOptions(params: NotificationLogQuery) {
	return queryOptions({
		queryKey: notificationLogsQueryKey(params),
		queryFn: ({ signal }) => fetchNotificationLogs(params, undefined, signal),
	});
}
