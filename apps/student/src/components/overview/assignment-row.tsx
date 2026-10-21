import { Link } from "@tanstack/react-router";
import type { StudentAssignment } from "@teacher-os/api/contracts";
import { deriveAssignmentStatus } from "@/lib/assignment-status";

export function AssignmentRow({
	assignment,
	showClassName = true,
}: {
	assignment: StudentAssignment;
	/** Ẩn tên lớp khi row đã nằm trong trang của chính lớp đó. */
	showClassName?: boolean;
}) {
	const derived = deriveAssignmentStatus(assignment);

	const rowContent = (
		<div className="flex flex-col gap-2 rounded-md rounded-md border border-input bg-transparent p-4 transition-colors sm:flex-row sm:items-center sm:justify-between">
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2">
					<h4 className="truncate font-medium text-[15px] text-foreground">
						{assignment.title}
					</h4>
				</div>
				<div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[12px] text-muted-foreground">
					{showClassName && assignment.className && (
						<>
							<span className="font-sans text-[13px] text-muted-foreground">
								{assignment.className}
							</span>
							<span aria-hidden="true">·</span>
						</>
					)}
					<span>{derived.dueText}</span>
				</div>
			</div>

			<div className="flex items-center gap-3">
				<span
					className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${derived.badgeClass}`}
				>
					{derived.statusLabel}
				</span>
			</div>
		</div>
	);

	// Link CHỈ row class_assignment (RT#10) — row từ nguồn chấm giữ render
	// cũ (không href, tránh 404 take). Chưa nộp → take screen; đã nộp → take
	// screen cũng vào được: loader redirect sang summary của attempt (row
	// không mang attemptId trên wire).
	if (assignment.source !== "class_assignment") {
		return rowContent;
	}
	return (
		<Link
			to="/learn/quizzes/$assignmentId"
			params={{ assignmentId: assignment.id }}
			aria-label={
				assignment.submittedAt
					? `Xem lại kết quả: ${assignment.title}`
					: `Làm bài: ${assignment.title}`
			}
			className="block rounded-[var(--radius-md)] focus-visible:outline-2 focus-visible:outline-hot"
		>
			{rowContent}
		</Link>
	);
}
