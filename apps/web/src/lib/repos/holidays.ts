/**
 * Holiday repos (TOS-11) — preview/apply Lịch nghỉ chung. Response parse qua
 * zod wire schema trước khi render (planHash gắn lần preview gần nhất — I7).
 * Sau apply, caller invalidate snapshot kernel (`refresh()`) để lịch tải lại.
 */

import type { HolidayDraft } from "@teacher-os/api/contracts";
import {
	type HolidayApplyResult,
	type HolidayDeleteResult,
	type HolidayPreview,
	holidayApplyResultSchema,
	holidayDeleteResultSchema,
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
		const record =
			raw != null && typeof raw === "object"
				? (raw as Record<string, unknown>)
				: null;
		const code =
			record && typeof record.code === "string" ? record.code : undefined;
		const error =
			record && typeof record.error === "string"
				? record.error
				: "request-failed";
		const errorCode = code ?? error;
		throw Object.assign(new Error(errorCode), {
			holidayErrorCode: errorCode,
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

/** Hoàn tác kỳ nghỉ tương lai (TOS-13): `DELETE /api/holidays/:id`.
 * 409 `makeup-touched` mang theo `touched: {classId, makeupDate}[]` trên Error. */
export async function deleteHoliday(
	holidayId: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<HolidayDeleteResult> {
	const res = await fetch(
		`${baseUrl}/api/holidays/${encodeURIComponent(holidayId)}`,
		{
			method: "DELETE",
			credentials: "include",
		},
	);
	const raw: unknown = await res.json().catch(() => null);
	if (!res.ok) {
		const error =
			raw != null &&
			typeof raw === "object" &&
			"error" in raw &&
			typeof raw.error === "string"
				? raw.error
				: "request-failed";
		const touched =
			raw != null &&
			typeof raw === "object" &&
			"touched" in raw &&
			Array.isArray(raw.touched)
				? raw.touched.filter(
						(
							item,
						): item is {
							classId: string;
							makeupDate: string;
						} =>
							item != null &&
							typeof item === "object" &&
							"classId" in item &&
							typeof item.classId === "string" &&
							"makeupDate" in item &&
							typeof item.makeupDate === "string",
					)
				: [];
		throw Object.assign(new Error(error), {
			holidayErrorCode: error,
			status: res.status,
			touched,
		});
	}
	return holidayDeleteResultSchema.parse(raw);
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
		(h) => h.mode !== "cancel" && h.fromDate <= dateISO && dateISO <= h.toDate,
	);
	return hit?.name ?? null;
}

/** Tên kỳ nghỉ đã hủy buổi (TOS-13): chỉ khớp khi `(classId, dateISO)` nằm
 * trong `holidayCancels` — buổi GV hủy tay không có dòng nên trả `null`. */
export function cancelledByHolidayName(
	snapshot: Pick<KernelSnapshot, "holidays" | "holidayCancels">,
	classId: string,
	dateISO: string | null,
): string | null {
	if (!dateISO) return null;
	const cancel = (snapshot.holidayCancels ?? []).find(
		(c) => c.classId === classId && c.date === dateISO,
	);
	if (!cancel) return null;
	if (cancel.holidayId) {
		const byId = (snapshot.holidays ?? []).find(
			(h) => h.id === cancel.holidayId,
		);
		if (byId) return byId.name;
	}
	const hit = (snapshot.holidays ?? []).find(
		(h) => h.mode === "cancel" && h.fromDate <= dateISO && dateISO <= h.toDate,
	);
	return hit?.name ?? null;
}
