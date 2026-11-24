import {
	DEFAULT_LIBRARY_TEST_PAGE_SIZE,
	type LibrarySkill,
	type LibraryTestListCounts,
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
	page?: number;
	pageSize?: LibraryTestPageSize;
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
 * `validateSearch` của route: giữ `page` và `pageSize` dạng `number` để
 * TanStack Router serialize URL sạch (`?page=2&pageSize=10`, không bọc dấu
 * ngoặc kép `%22`), đồng thời chấp nhận cả string lẫn number khi đọc vào.
 */
export function parseLibrarySearch(
	input: Record<string, unknown>,
): LibrarySearchParams {
	const rawPage = toParamString(input.page);
	const rawPageSize = toParamString(input.pageSize);
	const parsedPage = parseLibraryTestPageParam(rawPage);
	const parsedPageSize = parseLibraryTestPageSizeParam(rawPageSize);
	return {
		skill: typeof input.skill === "string" ? input.skill : undefined,
		status: typeof input.status === "string" ? input.status : undefined,
		q: toParamString(input.q),
		page: parsedPage ?? undefined,
		pageSize: parsedPageSize ?? undefined,
	};
}

const isSkillFilter = (value: string): value is SkillFilter =>
	SKILL_CHIPS.some((chip) => chip.id === value);

const isStatusFilter = (value: string): value is StatusFilter =>
	STATUS_CHIPS.some((chip) => chip.id === value);

/** Giá trị lạ → mặc định; q trim; page/pageSize parse theo contract. */
export function normalizeFilters(search: {
	skill?: string;
	status?: string;
	q?: string;
	page?: number | string;
	pageSize?: number | string;
}): LibraryTestFilters {
	return {
		skill: search.skill && isSkillFilter(search.skill) ? search.skill : "all",
		status:
			search.status && isStatusFilter(search.status) ? search.status : "all",
		q: typeof search.q === "string" ? search.q.trim() : "",
		page: parseLibraryTestPageParam(toParamString(search.page)) ?? 1,
		pageSize:
			parseLibraryTestPageSizeParam(toParamString(search.pageSize)) ??
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
		...(filters.page > 1 ? { page: filters.page } : {}),
		...(filters.pageSize !== DEFAULT_LIBRARY_TEST_PAGE_SIZE
			? { pageSize: filters.pageSize }
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

/** "02/10/2026 14:30" — ngày cập nhật trong bảng. */
export function fmtDateTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
