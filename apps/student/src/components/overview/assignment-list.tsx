import type { StudentAssignment } from "@teacher-os/api/contracts";
import { useMemo, useState } from "react";
import { AssignmentRow } from "@/components/overview/assignment-row";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import {
	type AssignmentDisplayStatus,
	deriveAssignmentStatus,
} from "@/lib/assignment-status";

type FilterTab = "all" | "due-soon" | "overdue" | "submitted";

const TABS: Array<{ id: FilterTab; label: string }> = [
	{ id: "all", label: "Tất cả" },
	{ id: "due-soon", label: "Sắp đến hạn" },
	{ id: "overdue", label: "Quá hạn" },
	{ id: "submitted", label: "Đã nộp" },
];

export function AssignmentList({
	assignments,
}: {
	assignments: StudentAssignment[];
}) {
	const [activeTab, setActiveTab] = useState<FilterTab>("all");

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
		<section className="mt-10">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<h2 className="font-[620] font-display text-[20px] text-fg tracking-tight">
					Bài tập
				</h2>

				{/* Filter Tabs */}
				<div
					role="tablist"
					aria-label="Lọc bài tập theo trạng thái"
					className="flex flex-wrap items-center gap-1 rounded-[var(--radius-pill)] bg-surface p-1 text-[13px]"
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
								onClick={() => setActiveTab(tab.id)}
								className={`flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1.5 font-[510] transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none ${
									isSelected
										? "bg-bg font-[590] text-fg shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
										: "text-muted-fg hover:text-fg"
								}`}
							>
								<span>{tab.label}</span>
								<span
									className={`rounded-full px-1.5 py-0.2 text-[11px] ${
										isSelected
											? "bg-surface text-fg"
											: "bg-surface-warm text-muted-fg"
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
							<AssignmentRow key={assignment.id} assignment={assignment} />
						))}
					</div>
				)}
			</div>
		</section>
	);
}
