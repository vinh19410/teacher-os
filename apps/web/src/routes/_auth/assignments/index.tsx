import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { canPublishGrade } from "@teacher-os/auth/role";
import { Copy, Filter, Inbox, Pencil, Search, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AssignPromptToClassesModal } from "@/components/assignments/assign-prompt-to-classes-modal";
import {
	type AssignmentBankFilters,
	type AssignmentSortKey,
	type AssignmentStatusFilter,
	buildDuplicatePromptPayload,
	computeBankStats,
	computeFilterCounts,
	filterAndSortPrompts,
	filtersToSearch,
	fmtBandDisplay,
	promptEffectiveStatusKey,
	promptSkillPartType,
	resolveAssignmentFilters,
	stripUnsafeSearchChars,
	validateAssignmentsSearch,
} from "@/components/assignments/assignment-bank-helpers";
import {
	partOf,
	SKILLS,
	type SkillId,
	selectedTypeOf,
	skillOf,
} from "@/components/assignments/assignment-presets";
import {
	fmtDayMonth,
	promptStatus,
} from "@/components/assignments/assignment-status";
import { CreateAssignmentMenu } from "@/components/assignments/create-assignment-menu";
import { DeleteDraftPromptModal } from "@/components/assignments/delete-draft-prompt-modal";
import {
	type PreviewTabKey,
	PromptPreviewPanel,
} from "@/components/assignments/prompt-preview-panel";
import {
	PromptStatusBadge,
	type PromptStatusBadgeTone,
} from "@/components/assignments/prompt-status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputCls } from "@/components/ui/field";
import { PageHead } from "@/components/ui/page-head";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import type { AssignmentPrompt } from "@/lib/mock-data";

export const Route = createFileRoute("/_auth/assignments/")({
	validateSearch: validateAssignmentsSearch,
	component: AssignmentsRoute,
});

const WIDE_MQ = "(min-width: 1360px)";

const STATUS_OPTIONS: ReadonlyArray<{
	value: AssignmentStatusFilter;
	label: string;
}> = [
	{ value: "all", label: "Tất cả" },
	{ value: "ready", label: "Sẵn sàng, chưa giao" },
	{ value: "used", label: "Đang giao cho lớp" },
	{ value: "draft", label: "Bản nháp" },
];

const SORT_OPTIONS: ReadonlyArray<{
	value: AssignmentSortKey;
	label: string;
}> = [
	{ value: "new", label: "Mới thêm" },
	{ value: "used", label: "Giao nhiều nhất" },
	{ value: "bandDesc", label: "Band cao → thấp" },
	{ value: "bandAsc", label: "Band thấp → cao" },
	{ value: "az", label: "Tên A → Z" },
];

const SKILL_TABS: ReadonlyArray<{ id: "all" | SkillId; label: string }> = [
	{ id: "all", label: "Tất cả" },
	...SKILLS.map((s) => ({ id: s.id, label: s.name })),
];

function getInitialWide(): boolean {
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function"
	) {
		return true;
	}
	return window.matchMedia(WIDE_MQ).matches;
}

export function AssignmentsRoute() {
	const navigate = useNavigate();
	const { data, dispatch } = useData();
	const searchParams = useSearch({ from: "/_auth/assignments/" });

	const filters = useMemo(
		() => resolveAssignmentFilters(searchParams),
		[searchParams],
	);

	const [query, setQuery] = useState(() => filters.q);
	const lastEmittedQuery = useRef(query);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const rowTitleRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
	const drawerTriggerIdRef = useRef<string | null>(null);
	const pendingSelectAfterDupRef = useRef<string | null>(null);

	const [isWide, setIsWide] = useState<boolean>(getInitialWide);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [previewTab, setPreviewTab] = useState<PreviewTabKey>("prompt");
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [filtersOpen, setFiltersOpen] = useState(
		() =>
			filters.part !== "all" ||
			filters.status !== "all" ||
			filters.sort !== "new",
	);
	const [assignModalPrompt, setAssignModalPrompt] =
		useState<AssignmentPrompt | null>(null);
	const [deleteModalPrompt, setDeleteModalPrompt] =
		useState<AssignmentPrompt | null>(null);
	const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

	const canManage =
		data.viewer?.role === undefined || canPublishGrade(data.viewer.role);

	const classes = data.classes ?? [];
	const classAssignments = data.classAssignments ?? [];

	useEffect(() => {
		if (
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function"
		) {
			return;
		}
		const mql = window.matchMedia(WIDE_MQ);
		const sync = () => {
			setIsWide(mql.matches);
			if (mql.matches) {
				setDrawerOpen(false);
			}
		};
		sync();
		mql.addEventListener("change", sync);
		return () => mql.removeEventListener("change", sync);
	}, []);

	// Sync external URL changes (back/forward) into controlled search input.
	useEffect(() => {
		const urlQ = filters.q;
		if (urlQ !== lastEmittedQuery.current) {
			lastEmittedQuery.current = urlQ;
			setQuery(urlQ);
		}
	}, [filters.q]);

	function updateUrlFilters(next: AssignmentBankFilters) {
		lastEmittedQuery.current = stripUnsafeSearchChars(next.q).trim();
		navigate({
			to: "/assignments",
			search: filtersToSearch(next),
			replace: true,
			resetScroll: false,
		});
	}

	// Debounce query input -> URL (300ms).
	useEffect(() => {
		const trimmed = stripUnsafeSearchChars(query).trim();
		const timer = setTimeout(() => {
			if (trimmed === lastEmittedQuery.current) return;
			lastEmittedQuery.current = trimmed;
			navigate({
				to: "/assignments",
				search: filtersToSearch({ ...filters, q: trimmed }),
				replace: true,
				resetScroll: false,
			});
		}, 300);
		return () => clearTimeout(timer);
	}, [query, filters, navigate]);

	// Global `/` shortcut to focus search input when safe.
	useEffect(() => {
		const onKeyDown = (ev: KeyboardEvent) => {
			if (ev.key !== "/" || ev.metaKey || ev.ctrlKey || ev.altKey) return;
			const target = ev.target as HTMLElement | null;
			if (
				target?.closest(
					'input, select, textarea, [contenteditable="true"], [role="dialog"]',
				)
			) {
				return;
			}
			if (document.querySelector('[role="dialog"]')) return;
			if (searchInputRef.current) {
				ev.preventDefault();
				searchInputRef.current.focus();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	const usedClassesByPromptId = useMemo(() => {
		const map = new Map<string, Set<string>>();
		for (const ca of classAssignments) {
			const set = map.get(ca.promptId) ?? new Set<string>();
			set.add(ca.classId);
			map.set(ca.promptId, set);
		}
		return map;
	}, [classAssignments]);

	const stats = useMemo(
		() => computeBankStats(data.assignmentPrompts, usedClassesByPromptId),
		[data.assignmentPrompts, usedClassesByPromptId],
	);

	const counts = useMemo(
		() =>
			computeFilterCounts(
				data.assignmentPrompts,
				query,
				filters.status,
				usedClassesByPromptId,
			),
		[data.assignmentPrompts, query, filters.status, usedClassesByPromptId],
	);

	const effectiveFilters = useMemo(
		() => ({ ...filters, q: query }),
		[filters, query],
	);

	const filteredPrompts = useMemo(
		() =>
			filterAndSortPrompts(
				data.assignmentPrompts,
				effectiveFilters,
				usedClassesByPromptId,
			),
		[data.assignmentPrompts, effectiveFilters, usedClassesByPromptId],
	);

	const isDrawerActiveRef = useRef(false);
	isDrawerActiveRef.current = !isWide && drawerOpen;

	// Handle selection after duplicate creation once refreshed snapshot arrives.
	useEffect(() => {
		const targetId = pendingSelectAfterDupRef.current;
		if (!targetId) return;
		const exists = data.assignmentPrompts.some((p) => p.id === targetId);
		if (!exists) return;
		pendingSelectAfterDupRef.current = null;
		setSelectedId(targetId);
		setPreviewTab("prompt");
		if (!isDrawerActiveRef.current) {
			requestAnimationFrame(() => {
				rowTitleRefs.current.get(targetId)?.focus();
			});
		}
	}, [data.assignmentPrompts]);

	const activePrompt = useMemo(() => {
		if (filteredPrompts.length === 0) return null;
		const match = selectedId
			? filteredPrompts.find((p) => p.id === selectedId)
			: undefined;
		if (match) return match;
		return isWide ? (filteredPrompts[0] ?? null) : null;
	}, [filteredPrompts, selectedId, isWide]);

	const totalPrompts = data.assignmentPrompts.length;
	const extraActiveCount =
		(filters.part !== "all" ? 1 : 0) +
		(filters.status !== "all" ? 1 : 0) +
		(filters.sort !== "new" ? 1 : 0);

	const activeChips = useMemo(() => {
		const list: Array<{
			key: "q" | "skill" | "part" | "status";
			label: string;
		}> = [];
		const trimmedQ = query.trim();
		if (trimmedQ) list.push({ key: "q", label: `“${trimmedQ}”` });
		if (filters.skill !== "all") {
			list.push({ key: "skill", label: skillOf(filters.skill).name });
		}
		if (filters.part !== "all" && filters.skill !== "all") {
			list.push({
				key: "part",
				label: partOf(filters.skill, filters.part).label,
			});
		}
		if (filters.status !== "all") {
			const statusLabel =
				STATUS_OPTIONS.find((o) => o.value === filters.status)?.label ??
				filters.status;
			list.push({ key: "status", label: statusLabel });
		}
		return list;
	}, [query, filters.skill, filters.part, filters.status]);

	function clearAllFilters(focusSearch = false) {
		setQuery("");
		updateUrlFilters({
			q: "",
			skill: "all",
			part: "all",
			status: "all",
			sort: filters.sort,
		});
		if (focusSearch) {
			requestAnimationFrame(() => searchInputRef.current?.focus());
		}
	}

	function removeChip(key: "q" | "skill" | "part" | "status") {
		if (key === "q") {
			setQuery("");
			updateUrlFilters({ ...filters, q: "" });
		} else if (key === "skill") {
			updateUrlFilters({ ...filters, q: query, skill: "all", part: "all" });
		} else if (key === "part") {
			updateUrlFilters({ ...filters, q: query, part: "all" });
		} else {
			updateUrlFilters({ ...filters, q: query, status: "all" });
		}
	}

	function handleSelectPrompt(promptId: string, openDrawerOnNarrow: boolean) {
		setSelectedId(promptId);
		setPreviewTab("prompt");
		if (!isWide && openDrawerOnNarrow) {
			drawerTriggerIdRef.current = promptId;
			setDrawerOpen(true);
		}
	}

	function handleCloseDrawer() {
		setDrawerOpen(false);
		const returnId = drawerTriggerIdRef.current ?? selectedId;
		if (returnId) {
			requestAnimationFrame(() => rowTitleRefs.current.get(returnId)?.focus());
		}
	}

	function handlePartSelectChange(val: string) {
		if (val === "all") {
			updateUrlFilters({ ...filters, q: query, part: "all" });
			return;
		}
		const [nextSkill, nextPart] = val.split(":");
		if (!nextSkill || !nextPart) return;
		updateUrlFilters({
			...filters,
			q: query,
			skill: nextSkill as SkillId,
			part: nextPart,
		});
	}

	async function handleDuplicate(prompt: AssignmentPrompt) {
		if (duplicatingId) return;
		const built = buildDuplicatePromptPayload(prompt);
		if (!built.ok) {
			toast.error(built.error);
			return;
		}
		setDuplicatingId(prompt.id);
		try {
			const res = await dispatch({
				type: "create-assignment-prompt",
				payload: built.payload,
			});
			if (res.kind === "refreshed" && res.id) {
				pendingSelectAfterDupRef.current = res.id;
				if (filters.status !== "all" && filters.status !== "draft") {
					updateUrlFilters({ ...filters, q: query, status: "all" });
				}
				toast.success("Đã tạo bản sao ở dạng bản nháp");
			} else if (res.kind === "committed") {
				toast.info(
					"Đã lưu bản sao nhưng chưa tải lại được danh sách — hãy tải lại trang.",
				);
			} else {
				toast.error("Không thể nhân bản đề này. Vui lòng thử lại.");
			}
		} finally {
			setDuplicatingId(null);
		}
	}

	function handleRowKeyDown(
		ev: React.KeyboardEvent<HTMLButtonElement>,
		index: number,
	) {
		if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
		ev.preventDefault();
		const nextIdx =
			ev.key === "ArrowDown"
				? Math.min(filteredPrompts.length - 1, index + 1)
				: Math.max(0, index - 1);
		const nextPrompt = filteredPrompts[nextIdx];
		if (!nextPrompt) return;
		if (isWide) {
			setSelectedId(nextPrompt.id);
			setPreviewTab("prompt");
		}
		rowTitleRefs.current.get(nextPrompt.id)?.focus();
	}

	const partSelectValue =
		filters.part !== "all" && filters.skill !== "all"
			? `${filters.skill}:${filters.part}`
			: "all";

	const kpiTiles: ReadonlyArray<{
		key: AssignmentStatusFilter;
		value: number;
		label: string;
		hint: string;
	}> = [
		{
			key: "all",
			value: stats.all,
			label: "Đề trong ngân hàng",
			hint: "Xem tất cả",
		},
		{
			key: "used",
			value: stats.used,
			label: "Đang giao cho lớp",
			hint: "Đề đã có lớp nhận",
		},
		{
			key: "ready",
			value: stats.ready,
			label: "Sẵn sàng, chưa giao",
			hint: "Có thể giao ngay",
		},
		{
			key: "draft",
			value: stats.draft,
			label: "Bản nháp",
			hint: "Cần hoàn thiện trước khi giao",
		},
	];

	return (
		<div>
			<PageHead
				title="Bài tập"
				lead="Ngân hàng đề của bạn. Lọc, xem trước như học viên thấy, rồi giao thẳng cho lớp."
				action={
					<>
						<Button
							type="button"
							variant="outline"
							onClick={() => navigate({ to: "/assignments/packs" })}
						>
							Bộ đề tự học
						</Button>
						<CreateAssignmentMenu
							onCreateSingle={() => navigate({ to: "/assignments/new" })}
							onCreateTest={() => navigate({ to: "/assignments/tests/new" })}
						/>
					</>
				}
			/>

			{totalPrompts === 0 ? (
				<Card
					variant="white"
					className="grid justify-items-center gap-2 p-10 text-center"
				>
					<Inbox
						aria-hidden="true"
						className="mb-1 size-8 text-muted-foreground"
					/>
					<h2 className="font-semibold text-foreground text-lg">
						Ngân hàng đề đang trống
					</h2>
					<p className="max-w-md text-muted-foreground text-sm">
						Tạo bài lẻ cho từng phần thi, hoặc ghép thành đề thi nhiều phần, rồi
						giao cho lớp ngay tại đây.
					</p>
					<div className="mt-3">
						<Button
							type="button"
							onClick={() => navigate({ to: "/assignments/new" })}
						>
							Tạo bài tập đầu tiên
						</Button>
					</div>
				</Card>
			) : (
				<>
					{/* 4 KPI Filter Tiles */}
					<section
						aria-label="Tổng quan ngân hàng đề"
						className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3"
					>
						{kpiTiles.map((tile) => {
							const active = filters.status === tile.key;
							return (
								<button
									key={tile.key}
									type="button"
									aria-pressed={active}
									onClick={() =>
										updateUrlFilters({
											...filters,
											q: query,
											status: tile.key,
										})
									}
									className={cn(
										"grid gap-0.5 rounded-xl border bg-card p-3 text-left shadow-xs outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 md:p-4",
										active
											? "border-primary ring-1 ring-primary"
											: "border-border",
									)}
								>
									<span className="font-medium font-mono text-2xl text-foreground tabular-nums leading-tight">
										{tile.value}
									</span>
									<span className="text-muted-foreground text-sm">
										{tile.label}
									</span>
									<span className="hidden text-muted-foreground text-xs sm:block">
										{tile.hint}
									</span>
								</button>
							);
						})}
					</section>

					{/* Toolbar */}
					<section aria-label="Bộ lọc" className="mb-4 grid gap-3">
						<div className="flex flex-wrap items-center gap-2">
							<div className="relative order-first flex basis-full items-center md:order-none md:max-w-[420px] md:flex-1 md:basis-72">
								<Search
									aria-hidden="true"
									className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
								/>
								<input
									ref={searchInputRef}
									type="search"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Escape" && query) {
											e.stopPropagation();
											setQuery("");
											updateUrlFilters({ ...filters, q: "" });
										}
									}}
									placeholder="Tìm theo tên đề, dạng đề hoặc nguồn"
									aria-label="Tìm đề"
									autoComplete="off"
									className={cn(inputCls, "h-10 pr-10 pl-9")}
								/>
								{!query ? (
									<span
										aria-hidden="true"
										className="pointer-events-none absolute right-2.5 rounded border border-border px-1.5 font-mono text-muted-foreground text-xs leading-[18px]"
									>
										/
									</span>
								) : (
									<button
										type="button"
										aria-label="Xóa từ khóa"
										onClick={() => {
											setQuery("");
											updateUrlFilters({ ...filters, q: "" });
											searchInputRef.current?.focus();
										}}
										className="absolute right-1.5 inline-grid size-7 place-items-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
									>
										<X aria-hidden="true" className="size-4" />
									</button>
								)}
							</div>

							<Button
								type="button"
								variant="outline"
								className="h-10 md:hidden"
								aria-expanded={filtersOpen}
								aria-controls="assignment-filters-extra"
								onClick={() => setFiltersOpen((v) => !v)}
							>
								<Filter aria-hidden="true" className="size-4" />
								<span>Bộ lọc</span>
								{extraActiveCount > 0 && (
									<span
										aria-hidden="true"
										className="rounded-full bg-primary px-1.5 font-mono text-primary-foreground text-xs leading-[18px]"
									>
										{extraActiveCount}
									</span>
								)}
							</Button>

							<div
								id="assignment-filters-extra"
								className={cn(
									"w-full gap-2 md:flex md:w-auto md:flex-wrap md:items-center",
									filtersOpen ? "grid grid-cols-1" : "hidden",
								)}
							>
								<div className="flex items-center gap-2 rounded-md border border-input bg-background pl-3 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
									<label
										htmlFor="assignment-part-select"
										className="shrink-0 whitespace-nowrap text-muted-foreground text-sm"
									>
										Phần thi
									</label>
									<select
										id="assignment-part-select"
										aria-label="Phần thi"
										value={partSelectValue}
										onChange={(e) => handlePartSelectChange(e.target.value)}
										className="select-chevron h-10 min-w-0 flex-1 cursor-pointer bg-transparent py-1 pr-9 pl-1 font-medium text-sm outline-none md:max-w-[220px]"
									>
										<option value="all">Tất cả phần</option>
										{filters.skill === "all"
											? SKILLS.map((s) => (
													<optgroup key={s.id} label={s.name}>
														{s.parts.map((p) => (
															<option
																key={`${s.id}:${p.id}`}
																value={`${s.id}:${p.id}`}
															>
																{p.label} (
																{counts.byPart.get(`${s.id}:${p.id}`) ?? 0})
															</option>
														))}
													</optgroup>
												))
											: skillOf(filters.skill).parts.map((p) => (
													<option
														key={`${filters.skill}:${p.id}`}
														value={`${filters.skill}:${p.id}`}
													>
														{p.label} (
														{counts.byPart.get(`${filters.skill}:${p.id}`) ?? 0}
														)
													</option>
												))}
									</select>
								</div>

								<div className="flex items-center gap-2 rounded-md border border-input bg-background pl-3 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
									<label
										htmlFor="assignment-status-select"
										className="shrink-0 whitespace-nowrap text-muted-foreground text-sm"
									>
										Trạng thái
									</label>
									<select
										id="assignment-status-select"
										aria-label="Trạng thái"
										value={filters.status}
										onChange={(e) =>
											updateUrlFilters({
												...filters,
												q: query,
												status: e.target.value as AssignmentStatusFilter,
											})
										}
										className="select-chevron h-10 min-w-0 flex-1 cursor-pointer bg-transparent py-1 pr-9 pl-1 font-medium text-sm outline-none md:max-w-[220px]"
									>
										{STATUS_OPTIONS.map((opt) => (
											<option key={opt.value} value={opt.value}>
												{opt.label}
											</option>
										))}
									</select>
								</div>

								<div className="flex items-center gap-2 rounded-md border border-input bg-background pl-3 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
									<label
										htmlFor="assignment-sort-select"
										className="shrink-0 whitespace-nowrap text-muted-foreground text-sm"
									>
										Sắp xếp
									</label>
									<select
										id="assignment-sort-select"
										aria-label="Sắp xếp"
										value={filters.sort}
										onChange={(e) =>
											updateUrlFilters({
												...filters,
												q: query,
												sort: e.target.value as AssignmentSortKey,
											})
										}
										className="select-chevron h-10 min-w-0 flex-1 cursor-pointer bg-transparent py-1 pr-9 pl-1 font-medium text-sm outline-none md:max-w-[200px]"
									>
										{SORT_OPTIONS.map((opt) => (
											<option key={opt.value} value={opt.value}>
												{opt.label}
											</option>
										))}
									</select>
								</div>
							</div>
						</div>

						{/* Horizontal scrollable skill tabs */}
						<fieldset
							aria-label="Kỹ năng"
							className="no-scrollbar m-0 flex w-fit min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-md border-0 bg-muted p-1"
						>
							{SKILL_TABS.map((tab) => {
								const pressed = filters.skill === tab.id;
								const n =
									tab.id === "all"
										? counts.all
										: (counts.bySkill.get(tab.id) ?? 0);
								return (
									<button
										key={tab.id}
										type="button"
										aria-pressed={pressed}
										onClick={() =>
											updateUrlFilters({
												...filters,
												q: query,
												skill: tab.id,
												part: "all",
											})
										}
										className={cn(
											"inline-flex min-h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm px-3 font-medium text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
											pressed
												? "bg-background text-foreground shadow-xs ring-1 ring-border"
												: "text-muted-foreground hover:text-foreground",
										)}
									>
										<span>{tab.label}</span>
										<span
											aria-hidden="true"
											className="font-mono text-muted-foreground text-xs tabular-nums"
										>
											{n}
										</span>
									</button>
								);
							})}
						</fieldset>

						{/* Active filter chips + single live result count */}
						<div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
							<div className="flex flex-wrap items-center gap-2">
								{activeChips.map((chip) => (
									<span
										key={chip.key}
										className="inline-flex min-h-7 items-center gap-1 rounded-full border border-border bg-muted pr-1 pl-3 font-medium text-foreground text-xs"
									>
										<span>{chip.label}</span>
										<button
											type="button"
											aria-label={`Bỏ lọc ${chip.label}`}
											onClick={() => removeChip(chip.key)}
											className="inline-grid size-5 place-items-center rounded-full text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
										>
											<X aria-hidden="true" className="size-3" />
										</button>
									</span>
								))}
								{activeChips.length > 0 && (
									<button
										type="button"
										onClick={() => clearAllFilters(true)}
										className="rounded-xs px-2 py-1 font-medium text-foreground text-xs underline underline-offset-3 outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
									>
										Xóa bộ lọc
									</button>
								)}
							</div>
							<p aria-live="polite" className="text-muted-foreground text-sm">
								Hiện{" "}
								<strong className="font-semibold text-foreground tabular-nums">
									{filteredPrompts.length}
								</strong>{" "}
								/ {totalPrompts} đề
							</p>
						</div>
					</section>

					{/* Master-Detail Workspace */}
					<div
						className={cn(
							"grid grid-cols-[minmax(0,1fr)] items-start gap-5 2xl:gap-6",
							activePrompt &&
								isWide &&
								"2xl:grid-cols-[minmax(0,1fr)_392px] min-[1360px]:grid-cols-[minmax(0,1fr)_360px]",
						)}
					>
						<section aria-label="Danh sách đề">
							<div className="@container overflow-hidden rounded-xl border border-border bg-card shadow-sm">
								{filteredPrompts.length === 0 ? (
									<div className="grid justify-items-center gap-2 px-6 py-12 text-center">
										<Search
											aria-hidden="true"
											className="mb-1 size-8 text-muted-foreground"
										/>
										<h2 className="font-semibold text-foreground text-lg">
											Không có đề khớp bộ lọc
										</h2>
										<p className="max-w-md text-muted-foreground text-sm">
											Thử từ khóa ngắn hơn, chọn kỹ năng khác, hoặc xóa bộ lọc
											để xem lại toàn bộ ngân hàng.
										</p>
										<div className="mt-3">
											<Button
												type="button"
												variant="outline"
												onClick={() => clearAllFilters(true)}
											>
												Xóa bộ lọc
											</Button>
										</div>
									</div>
								) : (
									<>
										<div
											aria-hidden="true"
											className="@[640px]:grid hidden min-h-10 @[640px]:grid-cols-[minmax(0,1fr)_128px_48px_136px_80px] items-center gap-3 border-border border-b bg-muted px-4 font-medium text-muted-foreground text-xs"
										>
											<span>Đề</span>
											<span>Kỹ năng · Phần</span>
											<span>Band</span>
											<span>Trạng thái</span>
											<span className="text-right">Thao tác</span>
										</div>
										<ul aria-label="Đề trong ngân hàng">
											{filteredPrompts.map((prompt, index) => {
												const {
													skill: pSkill,
													part: pPart,
													type: pType,
												} = promptSkillPartType(prompt);
												const skill = skillOf(pSkill);
												const part = partOf(pSkill, pPart);
												const type = selectedTypeOf(pSkill, pPart, pType);
												const usedCount =
													usedClassesByPromptId.get(prompt.id)?.size ?? 0;
												const statusInfo = promptStatus(
													prompt.status,
													usedCount,
												);
												const statusKey = promptEffectiveStatusKey(
													prompt,
													usedCount,
												);
												const badgeTone: PromptStatusBadgeTone =
													statusKey === "ready"
														? "ready"
														: statusKey === "used"
															? "used"
															: "draft";
												const isSelected = activePrompt?.id === prompt.id;
												const isDraft = prompt.status === "draft";
												const bandDisplay = fmtBandDisplay(prompt.band);
												const titleId = `prompt-title-${prompt.id}`;
												const createdDM = fmtDayMonth(prompt.createdAt);
												const subParts = [
													type?.label ?? "Chưa chọn dạng",
													prompt.source.trim() || null,
													createdDM ? `thêm ${createdDM}` : null,
													prompt.writing != null ? "kèm Writing" : null,
												].filter(Boolean);

												return (
													// biome-ignore lint/a11y/useKeyWithClickEvents: row selection is accessible via the embedded title button (Enter/Space/Arrow keys)
													<li
														key={prompt.id}
														onClick={() => handleSelectPrompt(prompt.id, true)}
														className={cn(
															"group grid @[640px]:min-h-[68px] cursor-pointer @[640px]:grid-cols-[minmax(0,1fr)_128px_48px_136px_80px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-border border-t px-4 py-3 transition-colors first:border-t-0 hover:bg-muted/70",
															isSelected &&
																"bg-muted shadow-[inset_3px_0_0_var(--primary)]",
														)}
													>
														{/* Title + sub */}
														<div className="grid min-w-0 gap-0.5">
															<h3 className="min-w-0 truncate font-semibold text-foreground text-sm">
																<button
																	ref={(el) => {
																		if (el) {
																			rowTitleRefs.current.set(prompt.id, el);
																		} else {
																			rowTitleRefs.current.delete(prompt.id);
																		}
																	}}
																	type="button"
																	id={titleId}
																	aria-current={isSelected ? "true" : undefined}
																	onClick={(ev) => {
																		ev.stopPropagation();
																		handleSelectPrompt(prompt.id, true);
																	}}
																	onKeyDown={(ev) =>
																		handleRowKeyDown(ev, index)
																	}
																	className="block w-full truncate rounded-xs text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
																>
																	{prompt.title}
																</button>
															</h3>
															<p className="truncate text-muted-foreground text-xs">
																{subParts.join(" · ")}
															</p>
														</div>

														{/* Skill & Part (desktop) */}
														<div className="@[640px]:grid hidden text-sm">
															<span className="truncate text-foreground">
																{skill.name}
															</span>
															<span className="truncate text-muted-foreground text-xs">
																{part.label}
															</span>
														</div>

														{/* Band (desktop) */}
														<div className="@[640px]:block hidden font-mono text-foreground text-sm tabular-nums">
															{bandDisplay}
														</div>

														{/* Status (desktop) */}
														<div className="@[640px]:block hidden">
															<PromptStatusBadge
																tone={badgeTone}
																label={statusInfo.label}
															/>
														</div>

														{/* Quick actions */}
														<div className="flex items-center justify-end gap-0.5">
															{!isDraft && canManage && (
																<button
																	type="button"
																	aria-label="Giao cho lớp"
																	aria-describedby={titleId}
																	title="Giao cho lớp"
																	onClick={(ev) => {
																		ev.stopPropagation();
																		setAssignModalPrompt(prompt);
																	}}
																	className={cn(
																		"inline-grid size-9 place-items-center rounded-md text-muted-foreground @[640px]:opacity-0 outline-none transition-all hover:bg-foreground/10 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 @[640px]:group-focus-within:opacity-100 @[640px]:group-hover:opacity-100",
																		isSelected && "@[640px]:opacity-100",
																	)}
																>
																	<Send aria-hidden="true" className="size-4" />
																</button>
															)}
															{isDraft && (
																<button
																	type="button"
																	aria-label="Hoàn thiện bản nháp"
																	aria-describedby={titleId}
																	title="Hoàn thiện bản nháp"
																	onClick={(ev) => {
																		ev.stopPropagation();
																		navigate({
																			to: "/assignments/new",
																			search: { promptId: prompt.id },
																		});
																	}}
																	className={cn(
																		"inline-grid size-9 place-items-center rounded-md text-muted-foreground @[640px]:opacity-0 outline-none transition-all hover:bg-foreground/10 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 @[640px]:group-focus-within:opacity-100 @[640px]:group-hover:opacity-100",
																		isSelected && "@[640px]:opacity-100",
																	)}
																>
																	<Pencil
																		aria-hidden="true"
																		className="size-4"
																	/>
																</button>
															)}
															<button
																type="button"
																aria-label="Nhân bản"
																aria-describedby={titleId}
																title="Nhân bản"
																disabled={duplicatingId === prompt.id}
																onClick={(ev) => {
																	ev.stopPropagation();
																	void handleDuplicate(prompt);
																}}
																className={cn(
																	"inline-grid size-9 place-items-center rounded-md text-muted-foreground @[640px]:opacity-0 outline-none transition-all hover:bg-foreground/10 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 @[640px]:group-focus-within:opacity-100 @[640px]:group-hover:opacity-100",
																	isSelected && "@[640px]:opacity-100",
																)}
															>
																<Copy aria-hidden="true" className="size-4" />
															</button>
														</div>

														{/* Mobile meta */}
														<div className="col-span-full flex @[640px]:hidden flex-wrap items-center gap-2 text-muted-foreground text-xs">
															<span>
																{skill.name} · {part.label}
															</span>
															<span className="whitespace-nowrap font-mono tabular-nums">
																Band {bandDisplay}
															</span>
															<PromptStatusBadge
																tone={badgeTone}
																label={statusInfo.label}
															/>
														</div>
													</li>
												);
											})}
										</ul>
									</>
								)}
							</div>
						</section>

						{/* Preview panel (split >= 1360px, slide-over drawer < 1360px) */}
						<PromptPreviewPanel
							prompt={activePrompt}
							classAssignments={classAssignments}
							classes={classes}
							activeTab={previewTab}
							onTabChange={setPreviewTab}
							isWide={isWide}
							drawerOpen={drawerOpen}
							onCloseDrawer={handleCloseDrawer}
							canManage={canManage}
							duplicating={duplicatingId !== null}
							onAssign={(p) => setAssignModalPrompt(p)}
							onEdit={(p) =>
								navigate({
									to: "/assignments/new",
									search: { promptId: p.id },
								})
							}
							onPreviewFull={(p) =>
								navigate({
									to: "/assignments/preview",
									search: { id: p.id },
								})
							}
							onDuplicate={(p) => void handleDuplicate(p)}
							onDeleteDraft={(p) => setDeleteModalPrompt(p)}
						/>
					</div>
				</>
			)}

			<AssignPromptToClassesModal
				open={assignModalPrompt !== null}
				prompt={assignModalPrompt}
				classes={classes}
				classAssignments={classAssignments}
				onClose={() => setAssignModalPrompt(null)}
				onAssigned={() => {
					if (assignModalPrompt) {
						setSelectedId(assignModalPrompt.id);
					}
					setPreviewTab("history");
				}}
			/>

			<DeleteDraftPromptModal
				open={deleteModalPrompt !== null}
				prompt={deleteModalPrompt}
				onClose={() => setDeleteModalPrompt(null)}
				onDeleted={(deletedId) => {
					const currentIndex = filteredPrompts.findIndex(
						(p) => p.id === deletedId,
					);
					const remaining = filteredPrompts.filter((p) => p.id !== deletedId);
					const nextTarget =
						(currentIndex >= 0 ? remaining[currentIndex] : undefined) ??
						(currentIndex > 0 ? remaining[currentIndex - 1] : undefined) ??
						remaining[0] ??
						null;
					drawerTriggerIdRef.current = null;
					setDeleteModalPrompt(null);
					if (drawerOpen) setDrawerOpen(false);
					if (selectedId === deletedId) {
						setSelectedId(isWide && nextTarget ? nextTarget.id : null);
					}
					requestAnimationFrame(() => {
						if (nextTarget) {
							rowTitleRefs.current.get(nextTarget.id)?.focus();
						} else {
							searchInputRef.current?.focus();
						}
					});
				}}
			/>
		</div>
	);
}
