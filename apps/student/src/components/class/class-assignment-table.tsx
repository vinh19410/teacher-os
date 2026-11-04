import { Link } from "@tanstack/react-router";
import type { StudentAssignment } from "@teacher-os/api/contracts";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { useMemo } from "react";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { Badge } from "@/components/ui/badge";
import { deriveAssignmentStatus } from "@/lib/assignment-status";

/**
 * Bảng bài tập của lớp theo design v2 (`StudentClass.tsx` → `Table`):
 * cột Bài tập | Hạn | Trạng thái | Hành động.
 */
export function ClassAssignmentTable({
	assignments,
	todayISO,
	nowMs,
}: {
	assignments: StudentAssignment[];
	todayISO?: string;
	nowMs?: number;
}) {
	const rows = useMemo(() => {
		const list = assignments.map((assignment) => ({
			assignment,
			derived: deriveAssignmentStatus(assignment, todayISO, nowMs),
		}));
		list.sort((a, b) => a.derived.sortOrder - b.derived.sortOrder);
		return list;
	}, [assignments, todayISO, nowMs]);

	if (rows.length === 0) {
		return (
			<OverviewEmptyState
				icon="book"
				title="Chưa có bài tập nào"
				description="Giáo viên chưa giao bài tập nào cho bạn."
			/>
		);
	}

	return (
		<div className="no-scrollbar relative w-full overflow-x-auto rounded-md border bg-card">
			<table className="w-full caption-bottom text-sm">
				<thead className="[&_tr]:border-b">
					<tr>
						<th className="h-10 whitespace-nowrap px-3 text-left align-middle font-medium text-muted-foreground">
							Bài tập
						</th>
						<th className="h-10 whitespace-nowrap px-3 text-left align-middle font-medium text-muted-foreground">
							Hạn
						</th>
						<th className="h-10 whitespace-nowrap px-3 text-left align-middle font-medium text-muted-foreground">
							Trạng thái
						</th>
						<th className="h-10 whitespace-nowrap px-3 text-right align-middle font-medium text-muted-foreground">
							<span className="sr-only">Hành động</span>
						</th>
					</tr>
				</thead>
				<tbody className="[&>tr:last-child]:border-0 [&>tr]:border-b [&>tr]:transition-colors [&>tr]:hover:bg-muted/50 [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle">
					{rows.map(({ assignment, derived }) => {
						const dueCell = derived.dueText.replace(/^Hạn:\s*/, "") || "—";
						const isSubmitted = Boolean(assignment.submittedAt);
						const actionLabel = isSubmitted
							? derived.status === "graded"
								? "Nhận xét"
								: "Xem lại"
							: "Làm ngay";

						return (
							<tr key={assignment.id}>
								<td className="font-medium text-foreground">
									{assignment.title}
								</td>
								<td className="whitespace-nowrap text-muted-foreground tabular-nums">
									{dueCell}
								</td>
								<td className="whitespace-nowrap">
									{derived.status === "graded" ? (
										<span className="font-medium text-foreground tabular-nums">
											{derived.statusLabel}
										</span>
									) : derived.status === "submitted" ? (
										<Badge
											variant="secondary"
											className={
												derived.isLate ? "bg-warn-soft text-warn" : undefined
											}
										>
											{derived.statusLabel}
										</Badge>
									) : derived.status === "overdue" ? (
										<Badge variant="destructive">{derived.statusLabel}</Badge>
									) : (
										<Badge variant="default">{derived.statusLabel}</Badge>
									)}
								</td>
								<td className="whitespace-nowrap text-right">
									{assignment.source === "class_assignment" && (
										<Link
											to="/learn/quizzes/$assignmentId"
											params={{ assignmentId: assignment.id }}
											aria-label={
												isSubmitted
													? `Xem lại kết quả: ${assignment.title}`
													: `Làm bài: ${assignment.title}`
											}
											className={buttonVariants({
												variant: isSubmitted ? "outline" : "default",
												size: "sm",
											})}
										>
											{actionLabel}
										</Link>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
