import type { StudentAssignment } from "@teacher-os/api/contracts";
import { useMemo, useState } from "react";
import { AssignmentRow } from "@/components/overview/assignment-row";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import {
	type AssignmentDisplayStatus,
	deriveAssignmentStatus,
} from "@/lib/assignment-status";

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
	assignments,
	showClassName = true,
	activeTab: controlledTab,
	onTabChange,
	hideHeading = false,
	className = "mt-10",
}: {
	assignments: StudentAssignment[];
	showClassName?: boolean;
	activeTab?: FilterTab;
	onTabChange?: (tab: FilterTab) => void;
	hideHeading?: boolean;
	className?: string;
}) {
	const [internalTab, setInternalTab] = useState<FilterTab>("all");
	const activeTab = controlledTab ?? internalTab;
	const categorized = useMemo(() => {
		const listWithStatus = assignments.map((a) => ({
			assignment: a,
			derived: deriveAssignmentStatus(a),
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
	}, [assignments]);

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
		<section className={className}>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				{!hideHeading && (
					<h2 className="font-display font-extrabold text-[20px] text-fg tracking-[-0.02em]">
						Bài tập
					</h2>
				)}

				{/* Filter Tabs — segmented theo design Tabs: nền sunk, tab chọn
				 * = raise + chữ cam. */}
				<div
					role="tablist"
					aria-label="Lọc bài tập theo trạng thái"
					className="neu-in inline-flex flex-wrap items-center gap-1 rounded-lg p-1.5 text-[13px]"
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
								className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none ${
									isSelected
										? "neu-sm font-medium text-hot"
										: "text-muted-fg hover:text-fg"
								}`}
							>
								<span>{tab.label}</span>
								<span
									aria-hidden="true"
									className={`rounded-full px-1.5 py-0.2 font-mono text-[11px] ${
										isSelected ? "text-hot" : "text-muted-fg"
									}`}
								>
									{count}
								</span>
							</button>
						);
					})}
				</div>
			</div>

			{/* List or Empty State */}
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
					<div className="space-y-2.5">
						{filtered.map(({ assignment }) => (
							<AssignmentRow
								key={assignment.id}
								assignment={assignment}
								showClassName={showClassName}
							/>
						))}
					</div>
				)}
			</div>
		</section>
	);
}
