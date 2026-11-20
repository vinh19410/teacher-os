import {
	DEFAULT_LIBRARY_TEST_PAGE_SIZE,
	type LibrarySkill,
	type LibraryTestListCounts,
	type LibraryTestListItem,
	type LibraryTestPageSize,
	parseLibraryTestPageParam,
	parseLibraryTestPageSizeParam,
} from "@teacher-os/api/library-contracts";

/**
 * Bộ lọc và trạng thái phân trang danh sách bộ đề — sống trong URL
 * (`?skill=&status=&q=&page=&pageSize=`) theo mẫu `/assignments` của web:
 * giá trị mặc định không lên URL, giá trị lạ rơi về mặc định khi đọc lại.
 */

export type SkillFilter = "all" | LibrarySkill;
export type StatusFilter = "all" | "draft" | "ready";

export interface LibraryTestFilters {
	skill: SkillFilter;
	status: StatusFilter;
	q: string;
	page: number;
	pageSize: LibraryTestPageSize;
}

export type LibrarySearchParams = {
	skill?: string;
	status?: string;
	q?: string;
	page?: string;
	pageSize?: string;
};

export const DEFAULT_FILTERS: LibraryTestFilters = {
	skill: "all",
	status: "all",
	q: "",
	page: 1,
	pageSize: DEFAULT_LIBRARY_TEST_PAGE_SIZE,
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

function toParamString(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}
	return undefined;
}

/**
 * `validateSearch` của route: chấp nhận cả string lẫn số hữu hạn cho
 * `page`/`pageSize`/`q` (TanStack Router có thể parse query số thành number),
 * chuẩn hóa sâu hơn ở `normalizeFilters`.
 */
export function parseLibrarySearch(
	input: Record<string, unknown>,
): LibrarySearchParams {
	return {
		skill: typeof input.skill === "string" ? input.skill : undefined,
		status: typeof input.status === "string" ? input.status : undefined,
		q: toParamString(input.q),
		page: toParamString(input.page),
		pageSize: toParamString(input.pageSize),
	};
}

const isSkillFilter = (value: string): value is SkillFilter =>
	SKILL_CHIPS.some((chip) => chip.id === value);

const isStatusFilter = (value: string): value is StatusFilter =>
	STATUS_CHIPS.some((chip) => chip.id === value);

/** Giá trị lạ → mặc định; q trim; page/pageSize parse theo contract. */
export function normalizeFilters(
	search: LibrarySearchParams,
): LibraryTestFilters {
	return {
		skill: search.skill && isSkillFilter(search.skill) ? search.skill : "all",
		status:
			search.status && isStatusFilter(search.status) ? search.status : "all",
		q: typeof search.q === "string" ? search.q.trim() : "",
		page: parseLibraryTestPageParam(search.page) ?? 1,
		pageSize:
			parseLibraryTestPageSizeParam(search.pageSize) ??
			DEFAULT_LIBRARY_TEST_PAGE_SIZE,
	};
}

/** Mặc định không lên URL — link chia sẻ chỉ mang filter và trang thật. */
export function filtersToSearch(
	filters: LibraryTestFilters,
): LibrarySearchParams {
	return {
		...(filters.skill !== "all" ? { skill: filters.skill } : {}),
		...(filters.status !== "all" ? { status: filters.status } : {}),
		...(filters.q.trim() !== "" ? { q: filters.q.trim() } : {}),
		...(filters.page > 1 ? { page: String(filters.page) } : {}),
		...(filters.pageSize !== DEFAULT_LIBRARY_TEST_PAGE_SIZE
			? { pageSize: String(filters.pageSize) }
			: {}),
	};
}

/** Có bộ lọc nào đang bật ngoài trạng thái mặc định hay không. */
export function hasActiveFilters(filters: LibraryTestFilters): boolean {
	return (
		filters.skill !== "all" ||
		filters.status !== "all" ||
		filters.q.trim() !== ""
	);
}

/** Chuyển số đếm facet từ server sang map theo nhãn hiển thị của `ChipFilter`. */
export function countsToChipCounts(
	counts: LibraryTestListCounts | undefined,
	dimension: "skill" | "status",
): Record<string, number> | undefined {
	if (!counts) return undefined;
	if (dimension === "skill") {
		return {
			[SKILL_LABELS.reading]: counts.skill.reading,
			[SKILL_LABELS.listening]: counts.skill.listening,
		};
	}
	return {
		[STATUS_LABELS.draft]: counts.status.draft,
		[STATUS_LABELS.ready]: counts.status.ready,
	};
}

/**
 * Xây danh sách nút trang có dấu ba chấm (`"ellipsis"`):
 * - `totalPages <= 1` → `[1]`
 * - `totalPages <= 7` → `[1..totalPages]`
 * - `totalPages > 7` → luôn giữ trang đầu/cuối, cửa sổ quanh trang hiện tại,
 *   không bao giờ thay một trang đơn lẻ bằng dấu ba chấm và không trùng số trang.
 */
export function buildPageItems(
	currentPage: number,
	totalPages: number,
): Array<number | "ellipsis"> {
	if (totalPages <= 1) return [1];
	if (totalPages <= 7) {
		return Array.from({ length: totalPages }, (_, index) => index + 1);
	}
	const current = Math.min(Math.max(1, Math.trunc(currentPage)), totalPages);
	let start: number;
	let end: number;
	if (current <= 3) {
		start = 2;
		end = 4;
	} else if (current >= totalPages - 2) {
		start = totalPages - 3;
		end = totalPages - 1;
	} else {
		start = current - 1;
		end = current + 1;
	}

	const items: Array<number | "ellipsis"> = [1];
	if (start === 3) {
		items.push(2);
	} else if (start > 3) {
		items.push("ellipsis");
	}
	for (let page = start; page <= end; page += 1) {
		items.push(page);
	}
	if (end === totalPages - 2) {
		items.push(totalPages - 1);
	} else if (end < totalPages - 2) {
		items.push("ellipsis");
	}
	items.push(totalPages);
	return items;
}

/** Khoảng thứ tự mục đang hiển thị (1-indexed), trả `{ start: 0, end: 0 }` khi rỗng hoặc vượt trang. */
export function pageItemRange(
	page: number,
	pageSize: number,
	total: number,
): { start: number; end: number } {
	if (total <= 0 || pageSize <= 0 || page < 1) {
		return { start: 0, end: 0 };
	}
	const totalPages = Math.ceil(total / pageSize);
	if (page > totalPages) {
		return { start: 0, end: 0 };
	}
	return {
		start: (page - 1) * pageSize + 1,
		end: Math.min(page * pageSize, total),
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
	filters: Pick<LibraryTestFilters, "skill" | "status" | "q">,
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
	filters: Pick<LibraryTestFilters, "skill" | "status" | "q">,
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
	filters: Pick<LibraryTestFilters, "skill" | "status" | "q">,
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
