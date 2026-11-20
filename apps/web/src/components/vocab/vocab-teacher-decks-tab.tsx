import type {
	KernelVocabDeckRow,
	KernelVocabGroupRow,
} from "@teacher-os/api/contracts";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { isVocabDeckOversized } from "./vocab-clone-batches";

const SEARCH_DEBOUNCE_MS = 300;

function formatDeckLessonMeta(
	lessonNumber: number | null | undefined,
	topic: string | null | undefined,
): string | null {
	const cleanTopic = topic?.trim() ?? "";
	const hasLesson =
		typeof lessonNumber === "number" &&
		Number.isInteger(lessonNumber) &&
		lessonNumber >= 1;
	if (hasLesson && cleanTopic) {
		return `Buổi ${String(lessonNumber).padStart(2, "0")} · ${cleanTopic}`;
	}
	if (hasLesson) {
		return `Buổi ${String(lessonNumber).padStart(2, "0")}`;
	}
	return cleanTopic || null;
}

export interface VocabTeacherDecksTabProps {
	targetClassId: string | null;
	vocabDecks: ReadonlyArray<KernelVocabDeckRow>;
	vocabGroups: ReadonlyArray<KernelVocabGroupRow>;
	classes: ReadonlyArray<{ id: string; name: string }>;
	selectedDecks: ReadonlyMap<string, number>;
	disabled?: boolean;
	onToggleDeck: (deck: { id: string; wordCount: number }) => void;
	onToggleFilteredSelection: (
		decks: ReadonlyArray<{ id: string; wordCount: number }>,
	) => void;
}

/**
 * Tab "Bộ từ đã tạo" trong dialog thêm bộ từ vựng:
 * liệt kê các bộ từ thuộc nguồn khác với đích (`classId !== targetClassId`),
 * hỗ trợ lọc kết hợp theo nguồn ("Riêng" / "Lớp ..."), nhóm bộ từ, và tìm kiếm
 * debounce 300ms; nhận diện bộ đã sao chép qua `sourceDeckId`, và cho phép chọn
 * cộng dồn theo nhóm lọc để tự động chia lượt gửi khi sao chép số lượng lớn.
 */
export function VocabTeacherDecksTab({
	targetClassId,
	vocabDecks,
	vocabGroups,
	classes,
	selectedDecks,
	disabled = false,
	onToggleDeck,
	onToggleFilteredSelection,
}: VocabTeacherDecksTabProps) {
	const isHubMode = targetClassId === null;
	const [searchInput, setSearchInput] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [sourceFilter, setSourceFilter] = useState("all");
	const [groupFilter, setGroupFilter] = useState("all");

	useEffect(() => {
		if (searchInput.trim().length === 0) {
			setDebouncedQuery("");
			return;
		}
		const timer = window.setTimeout(() => {
			setDebouncedQuery(searchInput);
		}, SEARCH_DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [searchInput]);

	const classNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const cls of classes) {
			map.set(cls.id, cls.name);
		}
		return map;
	}, [classes]);

	const groupNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const group of vocabGroups) {
			map.set(group.id, group.name);
		}
		return map;
	}, [vocabGroups]);

	const candidateDecks = useMemo(
		() => vocabDecks.filter((deck) => (deck.classId ?? null) !== targetClassId),
		[vocabDecks, targetClassId],
	);

	const existingSourceDeckIds = useMemo(() => {
		const ids = new Set<string>();
		for (const deck of vocabDecks) {
			if ((deck.classId ?? null) === targetClassId && deck.sourceDeckId) {
				ids.add(deck.sourceDeckId);
			}
		}
		return ids;
	}, [vocabDecks, targetClassId]);

	const sourceOptions = useMemo(() => {
		let hasIndependent = false;
		const distinctClasses = new Map<string, string>();
		for (const deck of candidateDecks) {
			if (deck.classId == null) {
				hasIndependent = true;
			} else if (!distinctClasses.has(deck.classId)) {
				distinctClasses.set(
					deck.classId,
					classNameById.get(deck.classId) ?? deck.classId,
				);
			}
		}
		const sortedClasses = [...distinctClasses.entries()]
			.map(([id, name]) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name, "vi"));

		const options: Array<{ value: string; label: string }> = [
			{ value: "all", label: "Tất cả nguồn" },
		];
		if (hasIndependent) {
			options.push({ value: "independent", label: "Riêng" });
		}
		for (const cls of sortedClasses) {
			options.push({ value: `class:${cls.id}`, label: `Lớp ${cls.name}` });
		}
		return options;
	}, [candidateDecks, classNameById]);

	const effectiveSourceFilter = sourceOptions.some(
		(option) => option.value === sourceFilter,
	)
		? sourceFilter
		: "all";

	const groupOptions = useMemo(() => {
		let hasUngrouped = false;
		const distinctGroups = new Map<string, string>();
		for (const deck of candidateDecks) {
			const groupId = deck.groupId ?? null;
			const resolvedName = groupId ? groupNameById.get(groupId) : undefined;
			if (!groupId || !resolvedName) {
				hasUngrouped = true;
			} else if (!distinctGroups.has(groupId)) {
				distinctGroups.set(groupId, resolvedName);
			}
		}
		const sortedGroups = [...distinctGroups.entries()]
			.map(([id, name]) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name, "vi"));

		const options: Array<{ value: string; label: string }> = [
			{ value: "all", label: "Tất cả nhóm" },
		];
		for (const group of sortedGroups) {
			options.push({ value: `group:${group.id}`, label: group.name });
		}
		if (hasUngrouped) {
			options.push({ value: "ungrouped", label: "Chưa phân nhóm" });
		}
		return options;
	}, [candidateDecks, groupNameById]);

	const effectiveGroupFilter = groupOptions.some(
		(option) => option.value === groupFilter,
	)
		? groupFilter
		: "all";

	const filteredDecks = useMemo(() => {
		const q = debouncedQuery.trim().toLowerCase();
		return candidateDecks.filter((deck) => {
			if (effectiveSourceFilter === "independent") {
				if (deck.classId !== null) return false;
			} else if (effectiveSourceFilter.startsWith("class:")) {
				const filterClassId = effectiveSourceFilter.slice("class:".length);
				if (deck.classId !== filterClassId) return false;
			}

			const resolvedGroupName = deck.groupId
				? (groupNameById.get(deck.groupId) ?? null)
				: null;
			if (effectiveGroupFilter === "ungrouped") {
				if (resolvedGroupName !== null) return false;
			} else if (effectiveGroupFilter.startsWith("group:")) {
				const filterGroupId = effectiveGroupFilter.slice("group:".length);
				if (deck.groupId !== filterGroupId || resolvedGroupName === null) {
					return false;
				}
			}

			if (!q) return true;
			const sourceLabel =
				deck.classId === null
					? "Riêng"
					: `Lớp ${classNameById.get(deck.classId) ?? deck.classId}`;
			return (
				deck.title.toLowerCase().includes(q) ||
				(deck.topic?.toLowerCase().includes(q) ?? false) ||
				sourceLabel.toLowerCase().includes(q) ||
				(resolvedGroupName?.toLowerCase().includes(q) ?? false)
			);
		});
	}, [
		candidateDecks,
		classNameById,
		debouncedQuery,
		effectiveGroupFilter,
		effectiveSourceFilter,
		groupNameById,
	]);

	const selectableFilteredDecks = useMemo(
		() => filteredDecks.filter((deck) => !isVocabDeckOversized(deck.wordCount)),
		[filteredDecks],
	);

	const allFilteredSelected =
		selectableFilteredDecks.length > 0 &&
		selectableFilteredDecks.every((deck) => selectedDecks.has(deck.id));

	const hasActiveFilters =
		searchInput.trim().length > 0 ||
		effectiveSourceFilter !== "all" ||
		effectiveGroupFilter !== "all";

	const handleClearFilters = () => {
		setSearchInput("");
		setDebouncedQuery("");
		setSourceFilter("all");
		setGroupFilter("all");
	};

	if (candidateDecks.length === 0) {
		return (
			<div
				data-testid="vocab-teacher-decks-tab"
				className="rounded-md border border-border px-4 py-8 text-center"
			>
				<p className="text-muted-foreground text-sm">
					{isHubMode
						? "Chưa có bộ từ đã tạo nào từ các lớp học khác để thêm vào hub."
						: "Chưa có bộ từ đã tạo nào từ lớp khác hoặc kho riêng để sao chép."}
				</p>
				<p className="mt-1 text-muted-foreground text-xs">
					Hãy tạo bộ từ mới hoặc chuyển sang tab Thư viện hệ thống để chọn bài
					có sẵn.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-3" data-testid="vocab-teacher-decks-tab">
			<div className="flex flex-col gap-2">
				<Input
					data-testid="vocab-teacher-deck-search"
					value={searchInput}
					onChange={(e) => setSearchInput(e.target.value)}
					placeholder="Tìm bộ từ theo tên, chủ đề, nhóm, lớp..."
					aria-label="Tìm bộ từ đã tạo"
					disabled={disabled}
					className="min-w-0"
				/>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<Select
						data-testid="vocab-teacher-source-filter"
						aria-label="Lọc theo nguồn bộ từ"
						value={effectiveSourceFilter}
						onChange={(e) => setSourceFilter(e.target.value)}
						disabled={disabled}
						className="min-w-0"
					>
						{sourceOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</Select>
					<Select
						data-testid="vocab-teacher-group-filter"
						aria-label="Lọc theo nhóm bộ từ"
						value={effectiveGroupFilter}
						onChange={(e) => setGroupFilter(e.target.value)}
						disabled={disabled}
						className="min-w-0"
					>
						{groupOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</Select>
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-2">
				<span
					aria-live="polite"
					className="font-mono text-muted-foreground text-xs tabular-nums"
				>
					{filteredDecks.length} bộ từ
				</span>
				<div className="flex flex-wrap items-center gap-2">
					{hasActiveFilters && filteredDecks.length > 0 ? (
						<Button
							size="sm"
							variant="ghost"
							type="button"
							data-testid="vocab-teacher-clear-filters"
							disabled={disabled}
							onClick={handleClearFilters}
						>
							Xóa bộ lọc
						</Button>
					) : null}
					{filteredDecks.length > 0 ? (
						<Button
							size="sm"
							variant="secondary"
							type="button"
							data-testid="vocab-teacher-select-all"
							disabled={disabled || selectableFilteredDecks.length === 0}
							onClick={() => onToggleFilteredSelection(selectableFilteredDecks)}
						>
							{allFilteredSelected ? "Bỏ chọn nhóm lọc" : "Chọn tất cả"}
						</Button>
					) : null}
				</div>
			</div>

			{filteredDecks.length === 0 ? (
				<div className="space-y-2 rounded-md border border-border px-4 py-8 text-center">
					<p className="text-muted-foreground text-sm">
						Không tìm thấy bộ từ phù hợp.
					</p>
					<Button
						size="sm"
						variant="secondary"
						type="button"
						data-testid="vocab-teacher-clear-filters"
						disabled={disabled}
						onClick={handleClearFilters}
					>
						Xóa bộ lọc
					</Button>
				</div>
			) : (
				<div className="max-h-[340px] divide-y divide-border overflow-y-auto rounded-md border border-border">
					{filteredDecks.map((deck) => {
						const oversized = isVocabDeckOversized(deck.wordCount);
						const checked = selectedDecks.has(deck.id);
						const alreadyInDestination = existingSourceDeckIds.has(deck.id);
						const sourceLabel =
							deck.classId === null
								? "Riêng"
								: `Lớp ${classNameById.get(deck.classId) ?? deck.classId}`;
						const resolvedGroupName = deck.groupId
							? (groupNameById.get(deck.groupId) ?? null)
							: null;
						const lessonMeta = formatDeckLessonMeta(
							deck.lessonNumber,
							deck.topic,
						);

						return (
							<label
								key={deck.id}
								data-testid={`vocab-teacher-deck-${deck.id}`}
								className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 ${
									oversized || disabled
										? "cursor-not-allowed bg-muted/30"
										: checked
											? "cursor-pointer bg-muted"
											: "cursor-pointer hover:bg-muted/50"
								}`}
							>
								<div className="flex min-w-0 flex-1 items-start gap-3">
									<input
										type="checkbox"
										data-testid={`vocab-teacher-deck-checkbox-${deck.id}`}
										checked={checked}
										disabled={disabled || oversized}
										onChange={() => {
											if (disabled || oversized) return;
											onToggleDeck(deck);
										}}
										className="mt-0.5 size-4 flex-none accent-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
									/>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium text-foreground text-sm">
											{deck.title}
										</p>
										<div className="mt-1 flex flex-wrap items-center gap-1.5">
											<span
												data-testid={`vocab-teacher-source-badge-${deck.id}`}
												className={`rounded-md px-1.5 py-0.5 text-muted-foreground text-xs ${
													checked
														? "border border-border bg-background"
														: "bg-muted"
												}`}
											>
												{sourceLabel}
											</span>
											{resolvedGroupName ? (
												<span
													data-testid={`vocab-teacher-group-badge-${deck.id}`}
													className="rounded-md border border-border bg-secondary px-1.5 py-0.5 text-foreground text-xs"
												>
													{resolvedGroupName}
												</span>
											) : null}
											{lessonMeta ? (
												<span
													data-testid={`vocab-teacher-lesson-meta-${deck.id}`}
													className={`rounded-md px-1.5 py-0.5 text-muted-foreground text-xs ${
														checked
															? "border border-border bg-background"
															: "bg-muted"
													}`}
												>
													{lessonMeta}
												</span>
											) : null}
											{alreadyInDestination ? (
												<span
													data-testid={`vocab-teacher-existing-chip-${deck.id}`}
													className="rounded-md border border-border bg-secondary px-1.5 py-0.5 font-medium text-foreground text-xs"
												>
													{isHubMode ? "Đã có trong hub" : "Đã có trong lớp"}
												</span>
											) : null}
											{oversized ? (
												<span
													data-testid={`vocab-teacher-oversized-badge-${deck.id}`}
													className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-muted-foreground text-xs"
												>
													<span
														aria-hidden="true"
														className="size-1.5 rounded-full bg-warn"
													/>
													Vượt 499 từ/bộ
												</span>
											) : null}
										</div>
									</div>
								</div>
								<span className="flex-none font-mono text-muted-foreground text-xs tabular-nums">
									{deck.wordCount} từ
								</span>
							</label>
						);
					})}
				</div>
			)}
		</div>
	);
}
