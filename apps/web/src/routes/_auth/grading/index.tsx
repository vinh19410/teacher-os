import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import type { GradingQueueItem } from "@teacher-os/api/contracts";
import { formatBand } from "@teacher-os/api/lib/ielts-band";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { partOf, skillOf } from "@/components/assignments/assignment-presets";
import { fmtDue, fmtWhen } from "@/components/assignments/assignment-status";
import { StatusTag } from "@/components/assignments/status-tag";
import { normalizeVi } from "@/components/command-search/search-index";
import { AiDraftStatusBadge } from "@/components/grading/ai-draft-panel";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { DataTable } from "@/components/ui/data-table";
import { inputCls } from "@/components/ui/field";
import { PageHead } from "@/components/ui/page-head";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { initialsFromName } from "@/lib/initials";
import { isHttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";
import { gradingQueueQueryOptions } from "@/lib/repos/grading";

export type GradingModeFilter = "all" | "assignment" | "practice";
export type GradingSkillFilter = "all" | "writing" | "speaking";
export type GradingStatusFilter = "all" | "awaiting" | "graded";

export interface GradingSearch {
	q?: string;
	mode?: "assignment" | "practice";
	skill?: "writing" | "speaking";
	status?: "awaiting" | "graded";
}

/**
 * Chuẩn hóa search params (?q=&mode=&skill=&status=) cho /grading (#383).
 * Giá trị lạ hoặc mặc định rơi về `undefined` để URL chia sẻ luôn sạch.
 */
export function validateGradingSearch(input: {
	q?: string | number;
	mode?: string;
	skill?: string;
	status?: string;
}): GradingSearch {
	const rawQ =
		typeof input.q === "string"
			? input.q
			: typeof input.q === "number"
				? String(input.q)
				: "";
	const q = rawQ.trim().length > 0 ? rawQ : undefined;
	const mode =
		input.mode === "assignment" || input.mode === "practice"
			? input.mode
			: undefined;
	const skill =
		input.skill === "writing" || input.skill === "speaking"
			? input.skill
			: undefined;
	const status =
		input.status === "awaiting" || input.status === "graded"
			? input.status
			: undefined;
	return { q, mode, skill, status };
}

export const Route = createFileRoute("/_auth/grading/")({
	validateSearch: validateGradingSearch,
	component: GradingQueueRoute,
});

const MODE_FILTERS: ReadonlyArray<{
	label: string;
	id: GradingModeFilter;
}> = [
	{ label: "Tất cả", id: "all" },
	{ label: "Bài tập lớp", id: "assignment" },
	{ label: "Luyện tập", id: "practice" },
];
const MODE_OPTIONS = MODE_FILTERS.map((f) => f.label);

const SKILL_FILTERS: ReadonlyArray<{
	label: string;
	id: GradingSkillFilter;
}> = [
	{ label: "Tất cả", id: "all" },
	{ label: "Writing", id: "writing" },
	{ label: "Speaking", id: "speaking" },
];
const SKILL_OPTIONS = SKILL_FILTERS.map((f) => f.label);

const STATUS_FILTERS: ReadonlyArray<{
	label: string;
	id: GradingStatusFilter;
}> = [
	{ label: "Tất cả", id: "all" },
	{ label: "Chờ chấm", id: "awaiting" },
	{ label: "Đã chấm", id: "graded" },
];
const STATUS_OPTIONS = STATUS_FILTERS.map((f) => f.label);

const GRADE_LINK_BUTTON_CLASS =
	"inline-flex items-center whitespace-nowrap rounded-full bg-primary px-[14px] py-[6px] font-medium text-primary-foreground text-xs hover:bg-accent focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

function filtersToSearch(
	q: string,
	mode: GradingModeFilter,
	skill: GradingSkillFilter,
	status: GradingStatusFilter,
): GradingSearch {
	const trimmed = q.trim();
	return {
		...(trimmed ? { q } : {}),
		...(mode !== "all" ? { mode } : {}),
		...(skill !== "all" ? { skill } : {}),
		...(status !== "all" ? { status } : {}),
	};
}

export function GradingQueueRoute() {
	const navigate = useNavigate();
	const searchParams = useSearch({ from: "/_auth/grading/" });
	const { data, error, isPending } = useQuery(gradingQueueQueryOptions());

	useEffect(() => {
		if (isHttpError(error) && error.status === 401) {
			reauth();
		}
	}, [error]);

	const modeFilter: GradingModeFilter = searchParams.mode ?? "all";
	const skillFilter: GradingSkillFilter = searchParams.skill ?? "all";
	const statusFilter: GradingStatusFilter = searchParams.status ?? "all";

	const [query, setQuery] = useState(() => searchParams.q ?? "");
	const lastEmittedQuery = useRef(query);

	const activeFilterCount =
		(modeFilter !== "all" ? 1 : 0) +
		(skillFilter !== "all" ? 1 : 0) +
		(statusFilter !== "all" ? 1 : 0) +
		(query.trim() !== "" ? 1 : 0);
	const hasActiveFilter = activeFilterCount > 0;

	const [filtersOpen, setFiltersOpen] = useState(
		() =>
			typeof window === "undefined" ||
			window.innerWidth >= 1024 ||
			hasActiveFilter,
	);

	function applyFilters(next: {
		q: string;
		mode: GradingModeFilter;
		skill: GradingSkillFilter;
		status: GradingStatusFilter;
	}) {
		lastEmittedQuery.current = next.q;
		void navigate({
			to: "/grading",
			search: filtersToSearch(next.q, next.mode, next.skill, next.status),
			replace: true,
		});
	}

	useEffect(() => {
		const urlQ = searchParams.q ?? "";
		if (urlQ !== lastEmittedQuery.current) {
			lastEmittedQuery.current = urlQ;
			setQuery(urlQ);
		}
	}, [searchParams.q]);

	useEffect(() => {
		const timer = setTimeout(() => {
			if (query === lastEmittedQuery.current) return;
			lastEmittedQuery.current = query;
			void navigate({
				to: "/grading",
				search: filtersToSearch(query, modeFilter, skillFilter, statusFilter),
				replace: true,
			});
		}, 300);
		return () => clearTimeout(timer);
	}, [query, modeFilter, skillFilter, statusFilter, navigate]);

	const items = data?.items ?? [];
	const qNorm = useMemo(() => normalizeVi(query.trim()), [query]);

	// Counts chéo nhóm: mỗi nhóm chip đếm trên tập đã áp dụng các bộ lọc của nhóm KHÁC.
	const { modeChipCounts, skillChipCounts, statusChipCounts, filteredItems } =
		useMemo(() => {
			const modeCounts: Record<string, number> = {
				"Bài tập lớp": 0,
				"Luyện tập": 0,
			};
			const skillCounts: Record<string, number> = {
				Writing: 0,
				Speaking: 0,
			};
			const statusCounts: Record<string, number> = {
				"Chờ chấm": 0,
				"Đã chấm": 0,
			};
			const filtered: GradingQueueItem[] = [];

			for (const item of items) {
				if (
					qNorm &&
					!normalizeVi(item.student.name).includes(qNorm) &&
					!normalizeVi(item.title).includes(qNorm) &&
					!normalizeVi(item.className).includes(qNorm)
				) {
					continue;
				}
				const matchMode = modeFilter === "all" || item.mode === modeFilter;
				const matchSkill = skillFilter === "all" || item.skill === skillFilter;
				const matchStatus =
					statusFilter === "all" ||
					(statusFilter === "graded"
						? item.grade !== null
						: item.grade === null);

				if (matchSkill && matchStatus) {
					const modeLabel =
						item.mode === "practice" ? "Luyện tập" : "Bài tập lớp";
					modeCounts[modeLabel] = (modeCounts[modeLabel] ?? 0) + 1;
				}
				if (matchMode && matchStatus) {
					const skillLabel = item.skill === "writing" ? "Writing" : "Speaking";
					skillCounts[skillLabel] = (skillCounts[skillLabel] ?? 0) + 1;
				}
				if (matchMode && matchSkill) {
					const statusLabel = item.grade !== null ? "Đã chấm" : "Chờ chấm";
					statusCounts[statusLabel] = (statusCounts[statusLabel] ?? 0) + 1;
				}
				if (matchMode && matchSkill && matchStatus) {
					filtered.push(item);
				}
			}

			return {
				modeChipCounts: modeCounts,
				skillChipCounts: skillCounts,
				statusChipCounts: statusCounts,
				filteredItems: filtered,
			};
		}, [items, qNorm, modeFilter, skillFilter, statusFilter]);

	const awaitingCount = useMemo(
		() => items.filter((item) => item.grade === null).length,
		[items],
	);

	const selectedModeLabel =
		MODE_FILTERS.find((f) => f.id === modeFilter)?.label ?? "Tất cả";
	const selectedSkillLabel =
		SKILL_FILTERS.find((f) => f.id === skillFilter)?.label ?? "Tất cả";
	const selectedStatusLabel =
		STATUS_FILTERS.find((f) => f.id === statusFilter)?.label ?? "Tất cả";

	if (isPending) {
		return (
			<Card variant="white" className="mt-10">
				Đang tải danh sách bài nộp…
			</Card>
		);
	}

	if (error) {
		return (
			<Card variant="white" className="mx-auto mt-10 max-w-md text-center">
				<p className="text-foreground text-sm">
					Không tải được hàng chờ chấm. Thử tải lại trang.
				</p>
			</Card>
		);
	}

	return (
		<div className="min-w-0">
			<PageHead
				kicker={`${awaitingCount} bài chờ chấm · ${items.length} bài đã nộp`}
				title="Chấm bài"
				lead="Danh sách bài Writing và Speaking học viên đã nộp từ lớp học và tự luyện."
			/>

			{items.length === 0 ? (
				<Card
					variant="white"
					className="p-8 text-center"
					data-testid="grading-empty-state"
				>
					<h2 className="font-semibold text-foreground text-lg">
						Chưa có bài nộp cần chấm
					</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
						Khi học viên nộp bài Writing hoặc Speaking từ lớp học hay mục Luyện
						tập, bài nộp sẽ xuất hiện tại đây để giáo viên chấm điểm và nhận
						xét.
					</p>
				</Card>
			) : (
				<div className="flex min-w-0 flex-col gap-4">
					<Card className="flex flex-col gap-4 p-5">
						<div className="flex items-center justify-between border-border border-b pb-3 lg:hidden">
							<button
								type="button"
								onClick={() => setFiltersOpen((v) => !v)}
								aria-expanded={filtersOpen}
								aria-controls="grading-filters-body"
								className="flex items-center gap-1.5 font-medium text-foreground text-sm"
							>
								Bộ lọc
								{activeFilterCount > 0 && (
									<span className="rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground leading-4">
										{activeFilterCount}
									</span>
								)}
								<ChevronDown
									aria-hidden="true"
									className={cn(
										"size-4 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150",
										filtersOpen && "rotate-180",
									)}
								/>
							</button>
							<p aria-hidden="true" className="text-muted-foreground text-xs">
								{filteredItems.length}/{items.length} bài nộp
							</p>
						</div>

						<div
							id="grading-filters-body"
							className={cn(
								"flex flex-col gap-4",
								!filtersOpen && "hidden lg:flex",
							)}
						>
							<div>
								<input
									type="text"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="Tìm theo học viên, tiêu đề đề hoặc lớp…"
									aria-label="Tìm theo học viên, tiêu đề đề hoặc lớp"
									className={inputCls}
								/>
							</div>

							<div className="flex flex-wrap gap-6">
								<div className="flex flex-col gap-1.5">
									<span className="font-medium text-muted-foreground text-xs">
										Nguồn bài
									</span>
									<ChipFilter
										options={MODE_OPTIONS}
										value={selectedModeLabel}
										onChange={(label) => {
											const next =
												MODE_FILTERS.find((f) => f.label === label)?.id ??
												"all";
											applyFilters({
												q: query,
												mode: next,
												skill: skillFilter,
												status: statusFilter,
											});
										}}
										ariaLabel="Nguồn bài"
										counts={modeChipCounts}
									/>
								</div>

								<div className="flex flex-col gap-1.5">
									<span className="font-medium text-muted-foreground text-xs">
										Kỹ năng
									</span>
									<ChipFilter
										options={SKILL_OPTIONS}
										value={selectedSkillLabel}
										onChange={(label) => {
											const next =
												SKILL_FILTERS.find((f) => f.label === label)?.id ??
												"all";
											applyFilters({
												q: query,
												mode: modeFilter,
												skill: next,
												status: statusFilter,
											});
										}}
										ariaLabel="Kỹ năng"
										counts={skillChipCounts}
									/>
								</div>

								<div className="flex flex-col gap-1.5">
									<span className="font-medium text-muted-foreground text-xs">
										Trạng thái
									</span>
									<ChipFilter
										options={STATUS_OPTIONS}
										value={selectedStatusLabel}
										onChange={(label) => {
											const next =
												STATUS_FILTERS.find((f) => f.label === label)?.id ??
												"all";
											applyFilters({
												q: query,
												mode: modeFilter,
												skill: skillFilter,
												status: next,
											});
										}}
										ariaLabel="Trạng thái"
										counts={statusChipCounts}
									/>
								</div>
							</div>

							<div className="flex flex-wrap items-center justify-between gap-2 border-border border-t pt-3">
								<p
									aria-live="polite"
									className="text-muted-foreground text-xs tabular-nums"
								>
									Đang hiển thị {filteredItems.length} / {items.length} bài nộp
								</p>
								{hasActiveFilter && (
									<Button
										variant="secondary"
										size="sm"
										onClick={() => {
											setQuery("");
											applyFilters({
												q: "",
												mode: "all",
												skill: "all",
												status: "all",
											});
										}}
									>
										Xóa bộ lọc
									</Button>
								)}
							</div>
						</div>
					</Card>

					{filteredItems.length === 0 ? (
						<Card variant="white" className="p-8 text-center">
							<p className="text-muted-foreground text-sm">
								Không có bài nộp nào phù hợp với bộ lọc.
							</p>
						</Card>
					) : (
						<div className="min-w-0" data-testid="grading-queue-table">
							<DataTable
								headers={[
									"Học viên",
									"Đề bài",
									"Nguồn / Lớp",
									"Nộp lúc",
									"Trạng thái",
									"",
								]}
								emptyMessage="Chưa có bài nộp."
								rows={filteredItems.map((item) => {
									const skillMeta = skillOf(item.skill);
									const partMeta = item.part
										? partOf(item.skill, item.part)
										: null;
									return {
										cells: [
											<div
												key="student"
												className="flex items-center gap-2.5 whitespace-nowrap"
											>
												<Avatar
													text={initialsFromName(item.student.name)}
													size="sm"
												/>
												<span className="font-medium text-sm">
													{item.student.name}
												</span>
											</div>,
											<div key="title" className="min-w-[180px]">
												<div className="font-medium text-sm">{item.title}</div>
												<div className="text-muted-foreground text-xs">
													{skillMeta.name}
													{partMeta ? ` · ${partMeta.label}` : ""}
												</div>
											</div>,
											<div key="source" className="whitespace-nowrap">
												{item.mode === "practice" ? (
													<Tag>Luyện tập</Tag>
												) : (
													<div>
														<div className="font-medium text-sm">
															{item.className}
														</div>
														{item.due && (
															<div className="text-muted-foreground text-xs">
																Hạn {fmtDue(item.due)}
															</div>
														)}
													</div>
												)}
											</div>,
											<span
												key="submitted"
												className="whitespace-nowrap text-muted-foreground text-xs tabular-nums"
											>
												{fmtWhen(item.submittedAt)}
											</span>,
											<div
												key="status"
												className="flex items-center gap-1.5 whitespace-nowrap"
											>
												{item.grade ? (
													<StatusTag tone="ok">
														{`Đã chấm · Band ${formatBand(item.grade.band)}`}
													</StatusTag>
												) : (
													<StatusTag tone="warn">Chờ chấm</StatusTag>
												)}
												{item.aiStatus !== null &&
													item.aiStatus !== undefined && (
														<AiDraftStatusBadge status={item.aiStatus} />
													)}
											</div>,
											<div
												key="action"
												className="whitespace-nowrap text-right"
											>
												{item.grade ? (
													<Link
														to="/grading/$attemptId"
														params={{ attemptId: item.attemptId }}
														aria-label={`Xem / sửa điểm của ${item.student.name}`}
														className="font-medium text-primary text-xs hover:text-primary"
													>
														Xem / sửa điểm
													</Link>
												) : (
													<Link
														to="/grading/$attemptId"
														params={{ attemptId: item.attemptId }}
														aria-label={`Chấm bài của ${item.student.name}`}
														className={GRADE_LINK_BUTTON_CLASS}
													>
														Chấm bài
													</Link>
												)}
											</div>,
										],
									};
								})}
							/>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
