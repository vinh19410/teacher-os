/**
 * Sự kiện vận hành (TOS-14, #447) — POST/DELETE /api/events với cập nhật
 * snapshot TẠI CHỖ trong cache ['kernel'] (D6: sự kiện hiển thị ≤2 giây,
 * không refetch toàn bộ snapshot). Không đi qua kernel command bus vì events
 * không phải KernelAction; conventions fetch/401/timeout mirror postKernelCommand.
 */

import type { QueryClient } from "@tanstack/react-query";
import type { KernelEventRow, OrgEventDraft } from "@teacher-os/api/contracts";
import { HttpError } from "../kernel-load-state";
import { reauth } from "../reauth";
import { getApiBaseUrl } from "./api-base-url";
import { kernelQueryKey } from "./kernel";

const REQUEST_TIMEOUT_MS = 15000;

async function parseErrorReason(res: Response): Promise<string | undefined> {
	try {
		const json: unknown = await res.json();
		if (typeof json === "object" && json !== null && !Array.isArray(json)) {
			const record = json as Record<string, unknown>;
			const candidate = record.error ?? record.reason;
			if (typeof candidate === "string") return candidate;
		}
	} catch {
		// Body rác: reason stays undefined; status still classifies.
	}
	return undefined;
}

/** Chèn/sửa mảng events trong snapshot đang cache mà không refetch (D6). */
function mutateCachedEvents(
	queryClient: QueryClient,
	mutate: (events: KernelEventRow[]) => KernelEventRow[],
): void {
	queryClient.setQueryData<Record<string, unknown>>(
		kernelQueryKey,
		(snapshot) => {
			if (!snapshot) return snapshot;
			const events = Array.isArray(snapshot.events)
				? (snapshot.events as KernelEventRow[])
				: [];
			const next = [...mutate(events)].sort(
				(a, b) =>
					a.date.localeCompare(b.date) ||
					a.startTime.localeCompare(b.startTime) ||
					a.id.localeCompare(b.id),
			);
			return { ...snapshot, events: next };
		},
	);
}

/** Tạo sự kiện; thành công thì append row trả về vào snapshot cache. */
export async function createEvent(
	queryClient: QueryClient,
	draft: OrgEventDraft,
	baseUrl: string = getApiBaseUrl(),
): Promise<KernelEventRow> {
	const res = await fetch(`${baseUrl}/api/events`, {
		method: "POST",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(draft),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (res.status === 401) {
		reauth();
		throw new HttpError(401, "POST /api/events failed: 401");
	}
	if (!res.ok) {
		const reason = await parseErrorReason(res);
		throw new HttpError(res.status, `POST /api/events failed: ${res.status}`, {
			reason,
		});
	}
	let created: unknown;
	try {
		created = await res.json();
	} catch {
		throw new HttpError(502, "POST /api/events returned a non-JSON body");
	}
	if (
		typeof created !== "object" ||
		created === null ||
		typeof (created as KernelEventRow).id !== "string"
	) {
		throw new HttpError(502, "POST /api/events returned an unexpected body");
	}
	const row = created as KernelEventRow;
	mutateCachedEvents(queryClient, (events) => [...events, row]);
	return row;
}

/** Xoá sự kiện; 200 thì remove khỏi snapshot cache ngay (D6). */
export async function deleteEvent(
	queryClient: QueryClient,
	id: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<void> {
	const res = await fetch(`${baseUrl}/api/events/${encodeURIComponent(id)}`, {
		method: "DELETE",
		credentials: "include",
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (res.status === 401) {
		reauth();
		throw new HttpError(401, `DELETE /api/events/${id} failed: 401`);
	}
	if (!res.ok) {
		const reason = await parseErrorReason(res);
		throw new HttpError(
			res.status,
			`DELETE /api/events/${id} failed: ${res.status}`,
			{ reason },
		);
	}
	mutateCachedEvents(queryClient, (events) =>
		events.filter((event) => event.id !== id),
	);
}
