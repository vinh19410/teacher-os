import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type {
	VocabOverview,
	VocabSuggestionItem,
} from "@teacher-os/api/contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { StudentShell } from "@/components/layout/student-shell";
import Loader from "@/components/loader";
import {
	deriveVocabLibrarySummary,
	VocabCoursesCta,
	type VocabLibrarySummary,
} from "@/components/vocab/vocab-courses-cta";
import { VocabDeckCard } from "@/components/vocab/vocab-deck-card";
import { VocabMemoryCard } from "@/components/vocab/vocab-memory-card";
import {
	buildVocabOverviewSearch,
	filterVocabDecks,
	parseVocabOverviewSearch,
	resolveVocabHeroState,
	VOCAB_DECK_FILTERS,
	VOCAB_MEMORY_LEVELS,
	type VocabDeckFilter,
	type VocabMemoryLevel,
	type VocabOverviewSearchState,
} from "@/components/vocab/vocab-overview-helpers";
import { VocabSuggestionList } from "@/components/vocab/vocab-suggestion-list";
import { VocabTodayHero } from "@/components/vocab/vocab-today-hero";
import { cn } from "@/lib/cn";
import { useStudentMe } from "@/lib/repos/student";
import {
	acceptVocabSuggestion,
	dismissVocabSuggestion,
	useVocabLibraryCourses,
	useVocabOverview,
} from "@/lib/repos/vocab";

export const Route = createFileRoute("/_auth/practice/vocabulary/")({
	validateSearch: (search: Record<string, unknown>): VocabOverviewSearchState =>
		parseVocabOverviewSearch(search),
	component: VocabOverviewPage,
});

const DECK_FILTER_LABELS: Record<VocabDeckFilter, string> = {
	all: "Tất cả",
	due: "Đến hạn",
	learning: "Đang học",
	done: "Đã thuộc hết",
};

export interface VocabOverviewContentProps {
	data: VocabOverview;
	librarySummary: VocabLibrarySummary | null;
	busySuggestionId: string | null;
	suggestionError: string | null;
	onAcceptSuggestion: (suggestion: VocabSuggestionItem) => void;
	onDismissSuggestion: (suggestion: VocabSuggestionItem) => void;
	onExpired: () => void;
	searchState?: VocabOverviewSearchState;
	onSearchChange?: (
		updater: (prev: VocabOverviewSearchState) => VocabOverviewSearchState,
	) => void;
	todayISO?: string;
}

function VocabOverviewPage() {
	const meQuery = useStudentMe();
	const overviewQuery = useVocabOverview();
	const libraryCoursesQuery = useVocabLibraryCourses();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const searchState = Route.useSearch();

	const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null);
	const busySuggestionRef = useRef(false);
	const [suggestionError, setSuggestionError] = useState<string | null>(null);

	const [nowMs, setNowMs] = useState(() => Date.now());
	const todayISO = vietnamTodayISO(new Date(nowMs));
	const prevTodayIsoRef = useRef(todayISO);

	useEffect(() => {
		const tick = () => setNowMs(Date.now());
		const timerId = window.setInterval(tick, 60_000);
		const handleVisibilityChange = () => {
			if (!document.hidden) {
				tick();
			}
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			window.clearInterval(timerId);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, []);

	useEffect(() => {
		if (prevTodayIsoRef.current !== todayISO) {
			prevTodayIsoRef.current = todayISO;
			void queryClient.invalidateQueries({
				queryKey: ["student", "vocab-overview"],
			});
		}
	}, [queryClient, todayISO]);

	const handleSearchChange = useCallback(
		(updater: (prev: VocabOverviewSearchState) => VocabOverviewSearchState) => {
			void navigate({
				to: "/practice/vocabulary",
				search: (prev) =>
					buildVocabOverviewSearch(
						updater(parseVocabOverviewSearch(prev as Record<string, unknown>)),
					),
				replace: true,
				resetScroll: false,
			});
		},
		[navigate],
	);

	const handleAcceptSuggestion = async (suggestion: VocabSuggestionItem) => {
		if (busySuggestionRef.current) return;
		busySuggestionRef.current = true;
		setBusySuggestionId(suggestion.id);
		setSuggestionError(null);
		try {
			await acceptVocabSuggestion(suggestion.id);
			await queryClient.invalidateQueries({
				queryKey: ["student", "vocab-overview"],
			});
			await navigate({
				to: "/practice/vocabulary/$deckId",
				params: { deckId: suggestion.deckId },
			});
		} catch {
			setSuggestionError("Không thể mở bộ từ gợi ý. Vui lòng thử lại.");
		} finally {
			busySuggestionRef.current = false;
			setBusySuggestionId(null);
		}
	};

	const handleDismissSuggestion = async (suggestion: VocabSuggestionItem) => {
		if (busySuggestionRef.current) return;
		busySuggestionRef.current = true;
		setBusySuggestionId(suggestion.id);
		setSuggestionError(null);
		try {
			await dismissVocabSuggestion(suggestion.id);
			await queryClient.invalidateQueries({
				queryKey: ["student", "vocab-overview"],
			});
			toast.success(`Đã ẩn gợi ý “${suggestion.title}”.`);
		} catch {
			setSuggestionError("Không thể ẩn gợi ý. Vui lòng thử lại.");
		} finally {
			busySuggestionRef.current = false;
			setBusySuggestionId(null);
		}
	};

	if (
		meQuery.isLoading ||
		overviewQuery.isLoading ||
		libraryCoursesQuery.isLoading
	) {
		return <Loader />;
	}

	const me = meQuery.data;
	const data = overviewQuery.data;

	if (!data) {
		return (
			<StudentShell userName={me?.student.name} userEmail={me?.user.email}>
				<div className="rounded-xl border bg-card p-6 text-center shadow-sm">
					<p className="text-muted-foreground text-sm">
						Không tải được dữ liệu từ vựng. Vui lòng thử lại.
					</p>
				</div>
			</StudentShell>
		);
	}

	const librarySummary = libraryCoursesQuery.isSuccess
		? deriveVocabLibrarySummary(libraryCoursesQuery.data.courses)
		: null;

	return (
		<StudentShell userName={me?.student.name} userEmail={me?.user.email}>
			<VocabOverviewContent
				data={data}
				librarySummary={librarySummary}
				busySuggestionId={busySuggestionId}
				suggestionError={suggestionError}
				onAcceptSuggestion={(s) => void handleAcceptSuggestion(s)}
				onDismissSuggestion={(s) => void handleDismissSuggestion(s)}
				onExpired={() => void overviewQuery.refetch()}
				searchState={searchState}
				onSearchChange={handleSearchChange}
				todayISO={todayISO}
			/>
		</StudentShell>
	);
}

export function VocabOverviewContent({
	data,
	librarySummary,
	busySuggestionId,
	suggestionError,
	onAcceptSuggestion,
	onDismissSuggestion,
	onExpired,
	searchState,
	onSearchChange,
	todayISO,
}: VocabOverviewContentProps) {
	const [localSearch, setLocalSearch] = useState<VocabOverviewSearchState>({});
	const activeSearch = searchState ?? localSearch;
	const deckFilter: VocabDeckFilter = activeSearch.f ?? "all";
	const activeLevel: VocabMemoryLevel | null = activeSearch.lv ?? null;
	const urlQuery = activeSearch.q ?? "";

	const [draft, setDraft] = useState(urlQuery);
	const lastEmittedRef = useRef(urlQuery);
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const memorySectionRef = useRef<HTMLElement>(null);

	const updateSearch = useCallback(
		(updater: (prev: VocabOverviewSearchState) => VocabOverviewSearchState) => {
			if (onSearchChange) {
				onSearchChange(updater);
			} else {
				setLocalSearch((prev) => buildVocabOverviewSearch(updater(prev)));
			}
		},
		[onSearchChange],
	);
	const updateSearchRef = useRef(updateSearch);
	updateSearchRef.current = updateSearch;

	// Đồng bộ khi URL thay đổi từ bên ngoài (Back/Forward hoặc reload) mà không ghi đè lúc người dùng đang gõ.
	useEffect(() => {
		if (urlQuery === lastEmittedRef.current) return;
		lastEmittedRef.current = urlQuery;
		setDraft(urlQuery);
	}, [urlQuery]);

	useEffect(() => {
		const trimmed = draft.trim();
		if (trimmed === lastEmittedRef.current) return;
		debounceTimerRef.current = setTimeout(() => {
			debounceTimerRef.current = null;
			lastEmittedRef.current = trimmed;
			updateSearchRef.current((prev) => ({
				...prev,
				q: trimmed || undefined,
			}));
		}, 300);
		return () => {
			if (debounceTimerRef.current !== null) {
				clearTimeout(debounceTimerRef.current);
				debounceTimerRef.current = null;
			}
		};
	}, [draft]);

	const cancelPendingSearchDebounce = useCallback(() => {
		if (debounceTimerRef.current !== null) {
			clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = null;
		}
	}, []);

	const handleToggleLevel = useCallback(
		(level: VocabMemoryLevel) => {
			updateSearch((prev) => ({
				...prev,
				lv: prev.lv === level ? undefined : level,
			}));
		},
		[updateSearch],
	);

	const handleClearLevel = useCallback(() => {
		const prevLevel = activeLevel;
		updateSearch((prev) => ({ ...prev, lv: undefined }));
		if (prevLevel !== null) {
			const targetBtn = memorySectionRef.current?.querySelector<HTMLElement>(
				`[data-vocab-level="${prevLevel}"]`,
			);
			targetBtn?.focus();
		}
	}, [activeLevel, updateSearch]);

	const handleDeckFilterChange = useCallback(
		(nextFilter: VocabDeckFilter) => {
			updateSearch((prev) => ({
				...prev,
				f: nextFilter === "all" ? undefined : nextFilter,
			}));
		},
		[updateSearch],
	);

	const handleClearQuery = useCallback(() => {
		cancelPendingSearchDebounce();
		lastEmittedRef.current = "";
		setDraft("");
		updateSearch((prev) => ({ ...prev, q: undefined }));
		searchInputRef.current?.focus();
	}, [cancelPendingSearchDebounce, updateSearch]);

	const handleResetFilters = useCallback(() => {
		cancelPendingSearchDebounce();
		lastEmittedRef.current = "";
		setDraft("");
		updateSearch(() => ({}));
		searchInputRef.current?.focus();
	}, [cancelPendingSearchDebounce, updateSearch]);

	const resolvedTodayISO = todayISO ?? vietnamTodayISO();
	const heroState = useMemo(
		() => resolveVocabHeroState(data, librarySummary),
		[data, librarySummary],
	);

	const filteredDecks = useMemo(
		() =>
			filterVocabDecks(data.decks, {
				filter: deckFilter,
				level: activeLevel,
				query: draft,
			}),
		[activeLevel, data.decks, deckFilter, draft],
	);

	const activeLevelMeta =
		activeLevel !== null ? VOCAB_MEMORY_LEVELS[activeLevel - 1] : undefined;

	const filterEmptyMessage = useMemo(() => {
		const trimmed = draft.trim();
		if (trimmed) {
			return `Không có bộ từ nào khớp “${trimmed}”.`;
		}
		if (deckFilter === "due") {
			return "Không có bộ từ nào đến hạn ôn. Bạn đang theo kịp lịch ôn!";
		}
		if (deckFilter === "done") {
			return "Chưa có bộ từ nào thuộc hết. Cứ ôn đều, bộ đầu tiên sẽ sớm về đích.";
		}
		return "Không có bộ từ nào khớp bộ lọc.";
	}, [deckFilter, draft]);

	return (
		<div
			data-testid="vocab-overview-page"
			className="mx-auto max-w-5xl space-y-10"
		>
			<header className="space-y-1">
				<h1 className="font-bold text-2xl text-foreground tracking-tight md:text-3xl">
					Từ vựng
				</h1>
				<p className="text-muted-foreground text-sm sm:text-base">
					Ôn đúng lúc bạn sắp quên — mỗi ngày vài phút là đủ.
				</p>
			</header>

			<section aria-label="Việc hôm nay">
				<VocabTodayHero
					heroState={heroState}
					streak={data.streak}
					streakDays={data.streakDays}
					todayISO={resolvedTodayISO}
					onExpired={onExpired}
				/>
			</section>

			<section
				ref={memorySectionRef}
				aria-labelledby="vocab-memory-heading"
				className="space-y-4"
			>
				<div>
					<h2
						id="vocab-memory-heading"
						className="font-semibold text-foreground text-xl tracking-tight"
					>
						Trí nhớ của bạn
					</h2>
					<p className="text-muted-foreground text-sm">
						Mỗi lần ôn đúng, từ lên một cấp. Bấm vào một cấp để xem bộ từ có từ
						ở cấp đó.
					</p>
				</div>
				<VocabMemoryCard
					learnedCount={data.learnedCount}
					matureCount={data.matureCount}
					retention={data.retention}
					levelDistribution={data.levelDistribution}
					activeLevel={activeLevel}
					onToggleLevel={handleToggleLevel}
				/>
			</section>

			<VocabSuggestionList
				suggestions={data.suggestions}
				busyId={busySuggestionId}
				errorMsg={suggestionError}
				onAccept={onAcceptSuggestion}
				onDismiss={onDismissSuggestion}
			/>

			<section aria-labelledby="vocab-decks-heading" className="space-y-4">
				<h2
					id="vocab-decks-heading"
					className="font-semibold text-foreground text-xl tracking-tight"
				>
					Bộ từ đang học
				</h2>

				{data.decks.length === 0 ? (
					<div
						data-testid="vocab-decks-empty"
						className="rounded-xl border border-input border-dashed p-6 text-center text-muted-foreground text-sm"
					>
						Bạn chưa có bộ từ nào.{" "}
						{librarySummary
							? "Mở mục Khóa học từ vựng bên dưới để bắt đầu học ngay, hoặc đợi giáo viên giao bộ từ cho lớp của bạn."
							: "Đợi giáo viên giao bộ từ cho lớp của bạn."}
					</div>
				) : (
					<>
						<div className="flex flex-wrap items-end justify-between gap-3">
							<div className="grid min-w-0 flex-1 basis-60 gap-1.5 sm:max-w-sm">
								<label
									htmlFor="vocab-deck-search"
									className="font-medium text-foreground text-sm"
								>
									Tìm bộ từ
								</label>
								<div className="relative flex items-center">
									<Search
										aria-hidden="true"
										className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
									/>
									<input
										ref={searchInputRef}
										id="vocab-deck-search"
										data-testid="vocab-deck-search"
										type="search"
										autoComplete="off"
										maxLength={200}
										placeholder="Ví dụ: environment"
										value={draft}
										onChange={(e) => setDraft(e.target.value)}
										className="min-h-11 w-full rounded-lg border border-input bg-background py-2 pr-9 pl-9 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm [&::-webkit-search-cancel-button]:appearance-none"
									/>
									{draft ? (
										<button
											type="button"
											aria-label="Xóa tìm kiếm bộ từ"
											onClick={handleClearQuery}
											className="absolute right-2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
										>
											<X aria-hidden="true" className="size-4" />
										</button>
									) : null}
								</div>
							</div>

							<fieldset className="inline-flex min-w-0 max-w-full flex-wrap gap-0.5 rounded-lg border-0 bg-muted p-1">
								<legend className="sr-only">Lọc bộ từ</legend>
								{VOCAB_DECK_FILTERS.map((filterKey) => {
									const pressed = deckFilter === filterKey;
									return (
										<button
											key={filterKey}
											type="button"
											data-testid={`vocab-deck-filter-${filterKey}`}
											aria-pressed={pressed}
											onClick={() => handleDeckFilterChange(filterKey)}
											className={cn(
												"min-h-9 rounded-md px-3 text-sm transition-colors duration-150 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
												pressed
													? "bg-background font-semibold text-foreground shadow-xs"
													: "text-muted-foreground hover:text-foreground",
											)}
										>
											{DECK_FILTER_LABELS[filterKey]}
										</button>
									);
								})}
							</fieldset>
						</div>

						{activeLevelMeta ? (
							<div className="flex flex-wrap items-center gap-2 text-sm">
								<span className="text-foreground">
									Đang xem bộ từ có từ ở cấp{" "}
									<strong>{activeLevelMeta.name}</strong>
								</span>
								<button
									type="button"
									data-testid="vocab-clear-level-filter"
									onClick={handleClearLevel}
									className={cn(
										buttonVariants({ variant: "ghost", size: "sm" }),
										"min-h-8 gap-1",
									)}
								>
									<X aria-hidden="true" className="size-3.5" />
									Bỏ lọc
								</button>
							</div>
						) : null}

						<p aria-live="polite" className="sr-only">
							Có {filteredDecks.length} bộ từ phù hợp
						</p>

						{filteredDecks.length === 0 ? (
							<div
								data-testid="vocab-decks-filter-empty"
								className="flex flex-col items-center gap-3 rounded-xl border border-input border-dashed p-6 text-center text-muted-foreground text-sm"
							>
								<span>{filterEmptyMessage}</span>
								<button
									type="button"
									data-testid="vocab-reset-filters"
									onClick={handleResetFilters}
									className={buttonVariants({ variant: "outline", size: "sm" })}
								>
									Xem tất cả bộ từ
								</button>
							</div>
						) : (
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								{filteredDecks.map((deck) => (
									<VocabDeckCard
										key={deck.deckId}
										deck={deck}
										activeLevel={activeLevel}
									/>
								))}
							</div>
						)}
					</>
				)}
			</section>

			<VocabCoursesCta summary={librarySummary} />
		</div>
	);
}
