import type { StudentAssignment } from "@teacher-os/api/contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { useMemo, useState } from "react";
import { AssignmentRow } from "@/components/overview/assignment-row";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import {
	type AssignmentDisplayStatus,
	deriveAssignmentStatus,
} from "@/lib/assignment-status";
import { cn } from "@/lib/cn";

export type FilterTab = "all" | "due-soon" | "overdue" | "submitted";

export const ASSIGNMENT_FILTER_TABS: readonly FilterTab[] = [
	"all",
	"due-soon",
	"overdue",
	"submitted",
];

const TABS: Array<{ id: FilterTab; label: string }> = [
	{ id: "all", label: "Tất cả" },
	{ id: "due-soon", label: "Sắp đến hạn" },
	{ id: "overdue", label: "Quá hạn" },
	{ id: "submitted", label: "Đã nộp" },
];

export function AssignmentList({
	id,
	assignments,
	showClassName = true,
	activeTab: controlledTab,
	onTabChange,
	hideHeading = false,
	className = "mt-10",
	todayISO,
	nowMs,
}: {
	id?: string;
	assignments: StudentAssignment[];
	showClassName?: boolean;
	activeTab?: FilterTab;
	onTabChange?: (tab: FilterTab) => void;
	hideHeading?: boolean;
	className?: string;
	todayISO?: string;
	nowMs?: number;
}) {
	const [internalTab, setInternalTab] = useState<FilterTab>("all");
	const activeTab = controlledTab ?? internalTab;
	const categorized = useMemo(() => {
		const effectiveNowMs = nowMs ?? Date.now();
		const effectiveTodayISO =
			todayISO ?? vietnamTodayISO(new Date(effectiveNowMs));
		const listWithStatus = assignments.map((a) => ({
			assignment: a,
			derived: deriveAssignmentStatus(a, effectiveTodayISO, effectiveNowMs),
		}));

		// Sort: by sortOrder ascending (overdue 0 -> due-soon 1 -> not-submitted 2 -> submitted 3 -> graded 4)
		listWithStatus.sort((x, y) => x.derived.sortOrder - y.derived.sortOrder);

		const counts: Record<FilterTab, number> = {
			all: listWithStatus.length,
			"due-soon": 0,
			overdue: 0,
			submitted: 0,
		};

		for (const item of listWithStatus) {
			const s: AssignmentDisplayStatus = item.derived.status;
			if (s === "due-soon") counts["due-soon"]++;
			else if (s === "overdue") counts.overdue++;
			else if (s === "submitted" || s === "graded") counts.submitted++;
		}

		return { list: listWithStatus, counts };
	}, [assignments, todayISO, nowMs]);

	const filtered = useMemo(() => {
		if (activeTab === "all") return categorized.list;
		if (activeTab === "due-soon") {
			return categorized.list.filter((x) => x.derived.status === "due-soon");
		}
		if (activeTab === "overdue") {
			return categorized.list.filter((x) => x.derived.status === "overdue");
		}
		if (activeTab === "submitted") {
			return categorized.list.filter(
				(x) =>
					x.derived.status === "submitted" || x.derived.status === "graded",
			);
		}
		return categorized.list;
	}, [activeTab, categorized.list]);

	return (
		<section
			id={id}
			aria-labelledby={hideHeading ? undefined : "assignments-heading"}
			className={className}
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				{!hideHeading && (
					<h2
						id="assignments-heading"
						className="font-semibold text-foreground text-lg tracking-tight"
					>
						Bài tập
					</h2>
				)}

				<div
					role="tablist"
					aria-label="Lọc bài tập theo trạng thái"
					className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-muted p-1 text-sm"
				>
					{TABS.map((tab) => {
						const isSelected = activeTab === tab.id;
						const count = categorized.counts[tab.id];

						return (
							<button
								key={tab.id}
								type="button"
								role="tab"
								aria-selected={isSelected}
								onClick={() => {
									setInternalTab(tab.id);
									onTabChange?.(tab.id);
								}}
								className={cn(
									"inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
									isSelected
										? "bg-card font-medium text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<span>{tab.label}</span>
								<span
									aria-hidden="true"
									className={cn(
										"font-mono text-xs tabular-nums",
										isSelected ? "text-foreground" : "text-muted-foreground",
									)}
								>
									{count}
								</span>
							</button>
						);
					})}
				</div>
			</div>

			{/* Danh sách bài tập hoặc trạng thái trống — không dùng overflow-hidden
			 * để giữ nguyên 4px --focus-ring trên Link của AssignmentRow. */}
			<div className="mt-4">
				{filtered.length === 0 ? (
					<OverviewEmptyState
						icon="book"
						title={
							activeTab === "all"
								? "Chưa có bài tập nào"
								: "Không có bài tập trong mục này"
						}
						description={
							activeTab === "all"
								? "Giáo viên chưa giao bài tập nào cho bạn."
								: "Bạn đã hoàn thành các bài tập liên quan."
						}
					/>
				) : (
					<div className="rounded-xl border bg-card shadow-sm">
						<ul className="divide-y divide-border">
							{filtered.map(({ assignment, derived }) => (
								<li
									key={assignment.id}
									className="first:[&>a]:rounded-t-xl last:[&>a]:rounded-b-xl"
								>
									<AssignmentRow
										assignment={assignment}
										derived={derived}
										showClassName={showClassName}
									/>
								</li>
							))}
						</ul>
					</div>
				)}
			</div>
		</section>
	);
}
