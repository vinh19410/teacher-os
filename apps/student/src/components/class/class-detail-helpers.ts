import type {
	StudentAssignment,
	StudentClassLesson,
} from "@teacher-os/api/contracts";
import {
	isSafeMaterialUrl,
	MATERIAL_MIME,
	type StudentClassMaterialView,
} from "@teacher-os/api/material-contracts";
import {
	formatVietnamTimeHHMM,
	vietnamDateKeyOf,
	vietnamDateTimeMs,
	vietnamSessionEndMs,
} from "@teacher-os/api/vietnam-date";
import { evaluateZoomJoinWindow } from "@teacher-os/api/zoom-window";

export const CLASS_TAB_IDS = ["journey", "assignments", "materials"] as const;
export type ClassTabId = (typeof CLASS_TAB_IDS)[number];

export const JOURNEY_FILTERS = ["all", "done", "ahead"] as const;
export type JourneyFilter = (typeof JOURNEY_FILTERS)[number];

export const ASSIGNMENT_TAB_FILTERS = [
	"all",
	"todo",
	"submitted",
	"graded",
] as const;
export type AssignmentTabFilter = (typeof ASSIGNMENT_TAB_FILTERS)[number];

export const MATERIAL_KIND_FILTERS = ["all", "file", "media", "link"] as const;
export type MaterialKindFilter = (typeof MATERIAL_KIND_FILTERS)[number];

export interface ClassDetailSearchState {
	tab?: ClassTabId;
	jf?: JourneyFilter;
	af?: AssignmentTabFilter;
	mk?: MaterialKindFilter;
	mq?: string;
}

export const STRICT_ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STRICT_TIME_HHMM_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const CONTROL_OR_BIDI_RE = /[\p{Cc}\p{Cf}]/gu;
const MATERIAL_QUERY_MAX_LEN = 200;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function parseAllowedEnum<T extends string>(
	raw: unknown,
	allowed: readonly T[],
): T | undefined {
	return typeof raw === "string" && (allowed as readonly string[]).includes(raw)
		? (raw as T)
		: undefined;
}

/**
 * Chuẩn hóa query tìm kiếm từ URL (xử lý TanStack Router `JSON.parse` chuyển
 * `?mq=18` thành số, chặn object/array/boolean, loại bỏ ký tự điều khiển và
 * Bidi override `U+202E` để bảo vệ cả hiển thị lẫn `reauth()` `returnUrl`).
 */
function parseSearchQueryString(raw: unknown): string | undefined {
	let text: string;
	if (typeof raw === "string") {
		text = raw;
	} else if (typeof raw === "number" && Number.isFinite(raw)) {
		text = String(raw);
	} else {
		return undefined;
	}
	const cleaned = text
		.replace(CONTROL_OR_BIDI_RE, "")
		.trim()
		.slice(0, MATERIAL_QUERY_MAX_LEN);
	return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Parse và chuẩn hóa query params của `/classes/$classId`: loại bỏ giá trị mặc
 * định (`journey`, `all`, `""`) và loại luôn tham số không thuộc tab hiện tại.
 */
export function parseClassDetailSearch(
	search: Record<string, unknown>,
): ClassDetailSearchState {
	const rawTab = parseAllowedEnum(search.tab, CLASS_TAB_IDS);
	const activeTab: ClassTabId = rawTab ?? "journey";
	const next: ClassDetailSearchState = {};

	if (activeTab !== "journey") {
		next.tab = activeTab;
	}

	switch (activeTab) {
		case "journey": {
			const jf = parseAllowedEnum(search.jf, JOURNEY_FILTERS);
			if (jf && jf !== "all") {
				next.jf = jf;
			}
			break;
		}
		case "assignments": {
			const af = parseAllowedEnum(search.af, ASSIGNMENT_TAB_FILTERS);
			if (af && af !== "all") {
				next.af = af;
			}
			break;
		}
		case "materials": {
			const mk = parseAllowedEnum(search.mk, MATERIAL_KIND_FILTERS);
			if (mk && mk !== "all") {
				next.mk = mk;
			}
			const mq = parseSearchQueryString(search.mq);
			if (mq) {
				next.mq = mq;
			}
			break;
		}
	}

	return next;
}

/** Chuẩn hóa `ClassDetailSearchState` trước khi đẩy lên URL (bỏ mặc định & lệch tab). */
export function buildClassDetailSearch(
	state: ClassDetailSearchState,
): ClassDetailSearchState {
	return parseClassDetailSearch(state as Record<string, unknown>);
}

/**
 * Chuỗi đếm ngược hoàn chỉnh tới buổi học theo giờ Việt Nam (UTC+7):
 * - Trước giờ bắt đầu: `"Bắt đầu sau X ngày Y giờ"` / `"Bắt đầu sau Y giờ Z phút"` / `"Bắt đầu sau Z phút"` (tối thiểu 1 phút).
 * - Đang trong buổi (`start <= now < end`): `"Đang diễn ra"`.
 * - Đã kết thúc hoặc lịch không hợp lệ: `null`.
 */
export function formatSessionCountdown(
	date: string | null | undefined,
	time: string,
	dur: number,
	nowMs: number,
): string | null {
	const trimmedDate = date?.trim() ?? "";
	const trimmedTime = time.trim();
	if (
		!STRICT_ISO_DATE_RE.test(trimmedDate) ||
		!STRICT_TIME_HHMM_RE.test(trimmedTime) ||
		!Number.isFinite(dur) ||
		dur <= 0 ||
		!Number.isFinite(nowMs)
	) {
		return null;
	}
	const startMs = vietnamDateTimeMs(trimmedDate, trimmedTime);
	const endMs = vietnamSessionEndMs(trimmedDate, trimmedTime, dur);
	if (!Number.isFinite(startMs) || endMs == null || !Number.isFinite(endMs)) {
		return null;
	}
	if (nowMs >= endMs) {
		return null;
	}
	if (nowMs >= startMs) {
		return "Đang diễn ra";
	}

	const diffMs = startMs - nowMs;

	if (diffMs >= DAY_MS) {
		const days = Math.floor(diffMs / DAY_MS);
		const hours = Math.floor((diffMs % DAY_MS) / HOUR_MS);
		return hours > 0
			? `Bắt đầu sau ${days} ngày ${hours} giờ`
			: `Bắt đầu sau ${days} ngày`;
	}

	const totalMinutes = Math.max(1, Math.round(diffMs / MINUTE_MS));
	if (totalMinutes >= 24 * 60) {
		return "Bắt đầu sau 1 ngày";
	}
	if (totalMinutes < 60) {
		return `Bắt đầu sau ${totalMinutes} phút`;
	}
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes > 0
		? `Bắt đầu sau ${hours} giờ ${minutes} phút`
		: `Bắt đầu sau ${hours} giờ`;
}

/**
 * Thời điểm mở phòng Zoom (`HH:mm` nếu cùng ngày hôm nay, `HH:mm dd/mm` nếu
 * khác ngày) khi hiện tại còn sớm hơn cửa sổ `[start - 30 phút, end)`.
 * Trả `null` khi đã tới giờ mở, đã kết thúc hoặc lịch không hợp lệ.
 */
export function formatZoomOpenAtLabel(input: {
	date: string | null | undefined;
	time: string;
	dur: number;
	todayISO: string;
	nowMs: number;
}): string | null {
	const evaluated = evaluateZoomJoinWindow({
		date: input.date,
		time: input.time,
		dur: input.dur,
		nowMs: input.nowMs,
	});
	if (evaluated.status !== "too_early") {
		return null;
	}
	const openDate = new Date(evaluated.openMs);
	const hhmm = formatVietnamTimeHHMM(openDate);
	if (!hhmm) return null;
	const openDateISO = vietnamDateKeyOf(openDate);
	if (openDateISO === input.todayISO) {
		return hhmm;
	}
	const [, mm, dd] = openDateISO.split("-");
	return dd && mm ? `${hhmm} ${dd}/${mm}` : hhmm;
}

/** Chuẩn hóa văn bản tìm kiếm tiếng Việt không dấu, không phân biệt hoa/thường. */
export function normalizeVietnameseSearch(raw: string): string {
	return raw
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(/[đĐ]/g, "d")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

/** Nhãn định dạng ngắn gọn cho từng dòng tài liệu từ dữ liệu thật (`MATERIAL_MIME` + `kind`). */
export function formatMaterialTypeLabel(
	material: Pick<StudentClassMaterialView, "kind" | "mimeType">,
): string {
	if (material.kind === "link") return "Liên kết";
	const normalizedMime = material.mimeType?.trim().toLowerCase() ?? "";
	const entry = Object.hasOwn(MATERIAL_MIME, normalizedMime)
		? MATERIAL_MIME[normalizedMime]
		: undefined;
	if (material.kind === "media") {
		const mediaPrefix = normalizedMime.startsWith("video/") ? "Video" : "Audio";
		return entry ? `${mediaPrefix} · ${entry.label}` : mediaPrefix;
	}
	return entry ? entry.label : "Tài liệu";
}

/** Trích hostname an toàn cho liên kết `http:`/`https:`, trả `null` nếu URL không hợp lệ. */
export function extractSafeHostname(
	url: string | null | undefined,
): string | null {
	const raw = url?.trim() ?? "";
	if (!raw || !isSafeMaterialUrl(raw)) return null;
	try {
		return new URL(raw).hostname || null;
	} catch {
		return null;
	}
}

/**
 * Ánh xạ `date -> Buổi N` (1-based) bỏ qua buổi `holiday` và lớp legacy `date: null`,
 * khớp tuyệt đối cách đánh số của `ClassLessonList` và `GET /sessions/:date`.
 */
export function buildSessionNumberByDate(
	lessons: readonly StudentClassLesson[],
): Map<string, number> {
	const map = new Map<string, number>();
	let teachingIndex = 0;
	for (const lesson of lessons) {
		if (lesson.status === "holiday") continue;
		teachingIndex += 1;
		if (lesson.date && !map.has(lesson.date)) {
			map.set(lesson.date, teachingIndex);
		}
	}
	return map;
}

export function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

/** Cuộn phần tử vào giữa viewport (tôn trọng `prefers-reduced-motion`) rồi chuyển focus. */
export function scrollElementToCenterAndFocus(
	el: HTMLElement,
	reduceMotion = prefersReducedMotion(),
): void {
	el.scrollIntoView?.({
		behavior: reduceMotion ? "auto" : "smooth",
		block: "center",
	});
	el.focus({ preventScroll: true });
}

/**
 * Xác định ngày dự kiến (YYYY-MM-DD, giờ VN UTC+7) cho bài tập lớp.
 * Ưu tiên `due`, fallback sang `availableAt` rồi `dueAt`; trả `null` nếu thiếu
 * hoặc không parse được để tránh `RangeError` ở `vietnamDateKeyOf`.
 */
export function resolveAssignmentExpectedDateISO(
	assignment: Pick<StudentAssignment, "due" | "availableAt" | "dueAt">,
): string | null {
	const trimmedDue = assignment.due.trim();
	if (STRICT_ISO_DATE_RE.test(trimmedDue)) {
		return trimmedDue;
	}
	for (const raw of [assignment.availableAt, assignment.dueAt]) {
		if (typeof raw !== "string") continue;
		const trimmed = raw.trim();
		if (!trimmed) continue;
		const ms = Date.parse(trimmed);
		if (Number.isFinite(ms)) {
			return vietnamDateKeyOf(new Date(ms));
		}
	}
	return null;
}

/**
 * Chỉ trả `true` cho bài thuộc bộ đề tự học có ngày dự kiến sau `todayISO`.
 * Bài giao tay (`classStudyPackId == null`) luôn trả `false`.
 */
export function isStudyPackUpcoming(
	assignment: Pick<
		StudentAssignment,
		"classStudyPackId" | "due" | "availableAt" | "dueAt"
	>,
	todayISO: string,
): boolean {
	if (!assignment.classStudyPackId) return false;
	const expected = resolveAssignmentExpectedDateISO(assignment);
	return expected !== null && expected > todayISO;
}

/**
 * Bài giao tay hoặc bài bộ đề tự học đến hạn hôm nay / quá hạn / không rõ ngày.
 * Dùng cho `TodoBanner` và phân nhóm `Cần làm hôm nay & quá hạn`.
 */
export function isClassAssignmentDueNow(
	assignment: Pick<
		StudentAssignment,
		"classStudyPackId" | "due" | "availableAt" | "dueAt"
	>,
	todayISO: string,
): boolean {
	return !isStudyPackUpcoming(assignment, todayISO);
}
