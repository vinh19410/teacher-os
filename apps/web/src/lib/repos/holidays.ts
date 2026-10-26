/**
 * Holiday repos (TOS-11) — preview/apply Lịch nghỉ chung. Response parse qua
 * zod wire schema trước khi render (planHash gắn lần preview gần nhất — I7).
 * Sau apply, caller invalidate snapshot kernel (`refresh()`) để lịch tải lại.
 */

import type { HolidayDraft } from "@teacher-os/api/contracts";
import {
	type HolidayApplyResult,
	type HolidayPreview,
	holidayApplyResultSchema,
	holidayPreviewResponseSchema,
	type KernelSnapshot,
} from "@teacher-os/api/contracts";
import { getApiBaseUrl } from "./api-base-url";

async function postJson<T>(
	path: string,
	body: unknown,
	baseUrl: string = getApiBaseUrl(),
): Promise<T> {
	const res = await fetch(`${baseUrl}${path}`, {
		method: "POST",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	const raw: unknown = await res.json().catch(() => null);
	if (!res.ok) {
		const error =
			raw != null &&
			typeof raw === "object" &&
			"error" in raw &&
			typeof raw.error === "string"
				? raw.error
				: "request-failed";
		throw Object.assign(new Error(error), {
			holidayErrorCode: error,
			status: res.status,
		});
	}
	return raw as T;
}

/** Gọi preview — 404/422/400 đều ném Error với `holidayErrorCode`. */
export async function previewHoliday(
	draft: HolidayDraft,
	baseUrl: string = getApiBaseUrl(),
): Promise<HolidayPreview> {
	const raw = await postJson<unknown>("/api/holidays/preview", draft, baseUrl);
	return holidayPreviewResponseSchema.parse(raw);
}

/** Áp dụng — gửi kèm `planHash` của lần preview đã xác nhận (I7). */
export async function applyHoliday(
	draft: HolidayDraft,
	planHash: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<HolidayApplyResult> {
	const raw = await postJson<unknown>(
		"/api/holidays",
		{
			...draft,
			planHash,
		},
		baseUrl,
	);
	return holidayApplyResultSchema.parse(raw);
}

/** Shift của một block lịch tuần: `(classId, originalDate)` → `makeupDate`. */
export function makeupDateForShift(
	snapshot: Pick<KernelSnapshot, "holidayShifts">,
	classId: string,
	dateISO: string | null,
): string | null {
	if (!dateISO) return null;
	const hit = (snapshot.holidayShifts ?? []).find(
		(shift) => shift.classId === classId && shift.originalDate === dateISO,
	);
	return hit?.makeupDate ?? null;
}

/** Tên kỳ nghỉ của một block lịch tuần: ưu tiên khớp `holidayId` từ dòng
 * shift của đúng `(classId, dateISO)`, fallback theo khoảng ngày. */
export function holidayNameForDate(
	snapshot: Pick<KernelSnapshot, "holidays" | "holidayShifts">,
	classId: string,
	dateISO: string | null,
): string | null {
	if (!dateISO) return null;
	const shift = (snapshot.holidayShifts ?? []).find(
		(s) => s.classId === classId && s.originalDate === dateISO,
	);
	if (shift?.holidayId) {
		const byId = (snapshot.holidays ?? []).find(
			(h) => h.id === shift.holidayId,
		);
		if (byId) return byId.name;
	}
	const hit = (snapshot.holidays ?? []).find(
		(h) => h.fromDate <= dateISO && dateISO <= h.toDate,
	);
	return hit?.name ?? null;
}
