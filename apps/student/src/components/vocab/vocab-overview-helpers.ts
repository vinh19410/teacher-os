import type {
	VocabOverview,
	VocabOverviewDeck,
} from "@teacher-os/api/contracts";
import { addDaysISO } from "@teacher-os/api/vietnam-date";
import { normalizeVietnameseSearch } from "@/components/class/class-detail-helpers";
import type { VocabLibrarySummary } from "./vocab-courses-cta";

export const SEC_PER_REVIEW_WORD = 15;

export const VOCAB_DECK_FILTERS = ["all", "due", "learning", "done"] as const;
export type VocabDeckFilter = (typeof VOCAB_DECK_FILTERS)[number];

export type VocabMemoryLevel = 1 | 2 | 3 | 4 | 5;

export interface VocabMemoryLevelMeta {
	level: VocabMemoryLevel;
	name: string;
	hint: string;
	bgClass: string;
}

export const VOCAB_MEMORY_LEVELS: readonly VocabMemoryLevelMeta[] = [
	{
		level: 1,
		name: "Mới gặp",
		hint: "vừa học, dễ quên",
		bgClass: "bg-vocab-lv-1",
	},
	{
		level: 2,
		name: "Đang nhớ",
		hint: "nhớ được vài ngày",
		bgClass: "bg-vocab-lv-2",
	},
	{
		level: 3,
		name: "Nhớ khá",
		hint: "nhớ được 1–2 tuần",
		bgClass: "bg-vocab-lv-3",
	},
	{
		level: 4,
		name: "Vững",
		hint: "nhớ được cả tháng",
		bgClass: "bg-vocab-lv-4",
	},
	{
		level: 5,
		name: "Thành thạo",
		hint: "gần như không quên",
		bgClass: "bg-vocab-lv-5",
	},
] as const;

export interface VocabOverviewSearchState {
	f?: Exclude<VocabDeckFilter, "all">;
	lv?: VocabMemoryLevel;
	q?: string;
}

const CONTROL_OR_BIDI_RE = /[\p{Cc}\p{Cf}]/gu;
const QUERY_MAX_LEN = 200;

function parseDeckFilter(
	raw: unknown,
): Exclude<VocabDeckFilter, "all"> | undefined {
	if (raw === "due" || raw === "learning" || raw === "done") {
		return raw;
	}
	return undefined;
}

function parseMemoryLevel(raw: unknown): VocabMemoryLevel | undefined {
	let n: number;
	if (typeof raw === "number") {
		n = raw;
	} else if (typeof raw === "string" && /^[1-5]$/.test(raw.trim())) {
		n = Number.parseInt(raw.trim(), 10);
	} else {
		return undefined;
	}
	if (Number.isInteger(n) && n >= 1 && n <= 5) {
		return n as VocabMemoryLevel;
	}
	return undefined;
}

function parseSearchQuery(raw: unknown): string | undefined {
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
		.slice(0, QUERY_MAX_LEN);
	return cleaned.length > 0 ? cleaned : undefined;
}

/** Chuẩn hóa query params cho `/practice/vocabulary` (bỏ giá trị mặc định & control/Bidi). */
export function parseVocabOverviewSearch(
	search: Record<string, unknown>,
): VocabOverviewSearchState {
	const next: VocabOverviewSearchState = {};
	const f = parseDeckFilter(search.f);
	if (f) next.f = f;
	const lv = parseMemoryLevel(search.lv);
	if (lv) next.lv = lv;
	const q = parseSearchQuery(search.q);
	if (q) next.q = q;
	return next;
}

export function buildVocabOverviewSearch(
	state: VocabOverviewSearchState,
): VocabOverviewSearchState {
	return parseVocabOverviewSearch(state as Record<string, unknown>);
}

/** Số từ đã thuộc (Level 2..5) của một bộ từ. */
export function getVocabDeckLearnedCount(
	deck: Pick<VocabOverviewDeck, "levelDistribution">,
): number {
	const [, l2, l3, l4, l5] = deck.levelDistribution;
	return l2 + l3 + l4 + l5;
}

/** Phần trăm tiến độ đã thuộc (`0..100`), bảo vệ chia cho 0 khi `total === 0`. */
export function getVocabDeckProgressPercent(
	deck: Pick<VocabOverviewDeck, "total" | "levelDistribution">,
): number {
	if (deck.total <= 0) return 0;
	const learned = getVocabDeckLearnedCount(deck);
	return Math.min(100, Math.round((learned / deck.total) * 100));
}

/** Chỉ đánh dấu "Đã thuộc hết" khi bộ có từ, đã thuộc toàn bộ, và không còn từ đến hạn hay từ mới. */
export function isVocabDeckDone(
	deck: Pick<
		VocabOverviewDeck,
		"total" | "newCount" | "dueCount" | "levelDistribution"
	>,
): boolean {
	if (deck.total <= 0) return false;
	return (
		getVocabDeckLearnedCount(deck) >= deck.total &&
		deck.dueCount === 0 &&
		deck.newCount === 0
	);
}

export function getVocabDeckStatus(
	deck: Pick<
		VocabOverviewDeck,
		"total" | "newCount" | "dueCount" | "levelDistribution"
	>,
): Exclude<VocabDeckFilter, "all"> {
	if (deck.dueCount > 0) return "due";
	if (isVocabDeckDone(deck)) return "done";
	return "learning";
}

export function sortVocabDecks(
	decks: readonly VocabOverviewDeck[],
): VocabOverviewDeck[] {
	return [...decks].sort(
		(a, b) => b.dueCount - a.dueCount || b.newCount - a.newCount,
	);
}

export function filterVocabDecks(
	decks: readonly VocabOverviewDeck[],
	criteria: {
		filter: VocabDeckFilter;
		level: VocabMemoryLevel | null;
		query: string;
	},
): VocabOverviewDeck[] {
	const normalizedQuery = normalizeVietnameseSearch(criteria.query);
	const filtered = decks.filter((deck) => {
		if (
			criteria.filter !== "all" &&
			getVocabDeckStatus(deck) !== criteria.filter
		) {
			return false;
		}
		if (
			criteria.level !== null &&
			(deck.levelDistribution[criteria.level - 1] ?? 0) <= 0
		) {
			return false;
		}
		if (!normalizedQuery) return true;
		const haystack = normalizeVietnameseSearch(
			`${deck.title} ${formatVocabDeckSourceLabel(deck)}`,
		);
		return haystack.includes(normalizedQuery);
	});
	return sortVocabDecks(filtered);
}

export function formatVocabDeckSourceLabel(
	deck: Pick<VocabOverviewDeck, "source" | "className">,
): string {
	if (deck.source === "suggested") return "Gợi ý";
	if (deck.source === "library") {
		return deck.className ? `Khóa ${deck.className}` : "Khóa học";
	}
	return deck.className ? `Lớp ${deck.className}` : "Lớp học";
}

export type VocabHeroState =
	| {
			kind: "no-decks";
			subtitle: string;
	  }
	| {
			kind: "due";
			dueCount: number;
			estimatedMinutes: number;
			dueDecksCount: number;
			totalNewCount: number;
			topDueDeck: VocabOverviewDeck;
			topNewDeck: VocabOverviewDeck | null;
	  }
	| {
			kind: "new-only";
			totalNewCount: number;
			newDecksCount: number;
			topNewDeck: VocabOverviewDeck;
	  }
	| {
			kind: "caught-up";
			nextDueAt: number;
			upcomingCount: number | null;
			totalNewCount: number;
			topNewDeck: VocabOverviewDeck | null;
	  }
	| {
			kind: "empty-decks";
	  };

/** Phân giải 5 trạng thái Hero ("Hôm nay") không ném lỗi khi dữ liệu lệch hoặc rỗng. */
export function resolveVocabHeroState(
	data: Pick<
		VocabOverview,
		"dueCount" | "nextDueAt" | "upcomingCount" | "decks" | "suggestions"
	>,
	librarySummary: VocabLibrarySummary | null,
): VocabHeroState {
	if (data.decks.length === 0) {
		const hasSuggestions = data.suggestions.length > 0;
		let subtitle: string;
		if (hasSuggestions && librarySummary) {
			subtitle =
				"Chọn một gợi ý bên dưới hoặc khám phá Thư viện từ vựng ở cuối trang.";
		} else if (hasSuggestions) {
			subtitle =
				"Chọn một gợi ý bên dưới để bắt đầu học, hoặc đợi giáo viên giao bộ từ cho lớp của bạn.";
		} else if (librarySummary) {
			subtitle =
				"Mở mục Thư viện từ vựng ở cuối trang để bắt đầu học ngay, hoặc đợi giáo viên giao bộ từ cho lớp của bạn.";
		} else {
			subtitle = "Đợi giáo viên giao bộ từ cho lớp của bạn.";
		}
		return { kind: "no-decks", subtitle };
	}

	const sorted = sortVocabDecks(data.decks);
	const totalNewCount = data.decks.reduce((sum, d) => sum + d.newCount, 0);
	const dueDecksCount = data.decks.filter((d) => d.dueCount > 0).length;
	const newDecksCount = data.decks.filter((d) => d.newCount > 0).length;
	const topDueDeck = sorted.find((d) => d.dueCount > 0) ?? null;
	const topNewDeck = sorted.find((d) => d.newCount > 0) ?? null;

	if (data.dueCount > 0 && topDueDeck) {
		return {
			kind: "due",
			dueCount: data.dueCount,
			estimatedMinutes: Math.max(
				1,
				Math.round((data.dueCount * SEC_PER_REVIEW_WORD) / 60),
			),
			dueDecksCount,
			totalNewCount,
			topDueDeck,
			topNewDeck,
		};
	}

	if (data.dueCount === 0 && data.nextDueAt !== null) {
		return {
			kind: "caught-up",
			nextDueAt: data.nextDueAt,
			upcomingCount: data.upcomingCount,
			totalNewCount,
			topNewDeck,
		};
	}

	if (data.dueCount === 0 && totalNewCount > 0 && topNewDeck) {
		return {
			kind: "new-only",
			totalNewCount,
			newDecksCount,
			topNewDeck,
		};
	}

	return { kind: "empty-decks" };
}

export interface StreakWeekDay {
	iso: string;
	shortLabel: string;
	fullLabel: string;
	done: boolean;
	isToday: boolean;
}

const SHORT_WEEKDAY_LABELS = [
	"CN",
	"T2",
	"T3",
	"T4",
	"T5",
	"T6",
	"T7",
] as const;

const FULL_WEEKDAY_LABELS = [
	"Chủ Nhật",
	"Thứ Hai",
	"Thứ Ba",
	"Thứ Tư",
	"Thứ Năm",
	"Thứ Sáu",
	"Thứ Bảy",
] as const;

/** Dựng dải 7 ngày gần nhất theo mốc `todayISO` (UTC+7), độc lập với múi giờ trình duyệt/OS. */
export function buildStreakWeekDays(
	todayISO: string,
	streakDays: readonly boolean[],
): StreakWeekDay[] {
	const result: StreakWeekDay[] = [];
	for (let i = 0; i < 7; i++) {
		const offset = i - 6;
		const iso = addDaysISO(todayISO, offset);
		const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
		const isToday = offset === 0;
		result.push({
			iso,
			shortLabel: isToday ? "Nay" : (SHORT_WEEKDAY_LABELS[dow] ?? ""),
			fullLabel: isToday ? "Hôm nay" : (FULL_WEEKDAY_LABELS[dow] ?? ""),
			done: Boolean(streakDays[i]),
			isToday,
		});
	}
	return result;
}
