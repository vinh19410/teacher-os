import type {
	LibrarySkill,
	LibraryTestListItem,
} from "@teacher-os/api/library-contracts";

/**
 * Bộ lọc trang danh sách bộ đề — sống trong URL (`?skill=&status=&q=`)
 * theo mẫu `/assignments` của web: giá trị mặc định không lên URL, giá trị
 * lạ rơi về mặc định khi đọc lại. Toàn bộ lọc chạy phía client sau khi
 * fetch danh sách (server hỗ trợ param nhưng client cần số đếm chip theo
 * từng chiều lọc — cùng cách web làm với badge đếm).
 */

export type SkillFilter = "all" | LibrarySkill;
export type StatusFilter = "all" | "draft" | "ready";

export interface LibraryTestFilters {
	skill: SkillFilter;
	status: StatusFilter;
	q: string;
}

export const DEFAULT_FILTERS: LibraryTestFilters = {
	skill: "all",
	status: "all",
	q: "",
};

/** Chip skill — nhãn tiếng Việt, id khớp `LIBRARY_SKILLS`. */
export const SKILL_CHIPS: ReadonlyArray<{ id: SkillFilter; label: string }> = [
	{ id: "all", label: "Tất cả" },
	{ id: "reading", label: "Reading" },
	{ id: "listening", label: "Listening" },
];

export const STATUS_CHIPS: ReadonlyArray<{ id: StatusFilter; label: string }> =
	[
		{ id: "all", label: "Tất cả" },
		{ id: "draft", label: "Nháp" },
		{ id: "ready", label: "Đã xuất bản" },
	];

/** Nhãn hiển thị cho ô trạng thái trong bảng. */
export const SKILL_LABELS: Record<SkillFilter, string> = {
	all: "Tất cả",
	reading: "Reading",
	listening: "Listening",
};

export const STATUS_LABELS: Record<StatusFilter, string> = {
	all: "Tất cả",
	draft: "Nháp",
	ready: "Đã xuất bản",
};

/** `validateSearch` của route: giữ nguyên string, chuẩn hóa ở normalizeFilters. */
export function parseLibrarySearch(input: {
	skill?: string;
	status?: string;
	q?: string;
}): { skill?: string; status?: string; q?: string } {
	return {
		skill: typeof input.skill === "string" ? input.skill : undefined,
		status: typeof input.status === "string" ? input.status : undefined,
		q: typeof input.q === "string" ? input.q : undefined,
	};
}

const isSkillFilter = (value: string): value is SkillFilter =>
	SKILL_CHIPS.some((chip) => chip.id === value);

const isStatusFilter = (value: string): value is StatusFilter =>
	STATUS_CHIPS.some((chip) => chip.id === value);

/** Giá trị lạ → mặc định; q trim. */
export function normalizeFilters(search: {
	skill?: string;
	status?: string;
	q?: string;
}): LibraryTestFilters {
	return {
		skill: search.skill && isSkillFilter(search.skill) ? search.skill : "all",
		status:
			search.status && isStatusFilter(search.status) ? search.status : "all",
		q: typeof search.q === "string" ? search.q.trim() : "",
	};
}

/** Mặc định không lên URL — link chia sẻ chỉ mang filter thật. */
export function filtersToSearch(filters: LibraryTestFilters): {
	skill?: string;
	status?: string;
	q?: string;
} {
	return {
		...(filters.skill !== "all" ? { skill: filters.skill } : {}),
		...(filters.status !== "all" ? { status: filters.status } : {}),
		...(filters.q.trim() !== "" ? { q: filters.q.trim() } : {}),
	};
}

/** Tìm kiếm theo tiêu đề / bộ sưu tập / nhóm, không phân biệt hoa thường. */
export function matchesQuery(item: LibraryTestListItem, q: string): boolean {
	const needle = q.trim().toLowerCase();
	if (needle === "") return true;
	return (
		item.title.toLowerCase().includes(needle) ||
		(item.collection ?? "").toLowerCase().includes(needle) ||
		(item.testGroup ?? "").toLowerCase().includes(needle)
	);
}

export function matchesFilters(
	item: LibraryTestListItem,
	filters: LibraryTestFilters,
): boolean {
	if (filters.skill !== "all" && item.skill !== filters.skill) return false;
	if (filters.status !== "all" && item.status !== filters.status) return false;
	return matchesQuery(item, filters.q);
}

/**
 * Đếm chip: đếm theo một chiều trong khi giữ các chiều còn lại — cùng cách
 * `/assignments` tính `matchCounts` để badge phản ánh "bấm chip này sẽ có
 * bao nhiêu đề". `dimension` là chiều cần đếm.
 */
export function countBy(
	items: LibraryTestListItem[],
	filters: LibraryTestFilters,
	dimension: "skill" | "status",
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const item of items) {
		const matchesOther =
			dimension === "skill"
				? matchesQuery(item, filters.q) &&
					(filters.status === "all" || item.status === filters.status)
				: matchesQuery(item, filters.q) &&
					(filters.skill === "all" || item.skill === filters.skill);
		if (!matchesOther) continue;
		const key = dimension === "skill" ? item.skill : item.status;
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

/** Chip counts keyed theo nhãn hiển thị cho `ChipFilter.counts`. */
export function chipCounts(
	items: LibraryTestListItem[],
	filters: LibraryTestFilters,
	dimension: "skill" | "status",
): Record<string, number> {
	const byId = countBy(items, filters, dimension);
	const chips = dimension === "skill" ? SKILL_CHIPS : STATUS_CHIPS;
	const counts: Record<string, number> = {};
	for (const chip of chips) {
		if (chip.id === "all") continue;
		counts[chip.label] = byId[chip.id] ?? 0;
	}
	return counts;
}

/** "02/10/2026 14:30" — ngày cập nhật trong bảng. */
export function fmtDateTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
