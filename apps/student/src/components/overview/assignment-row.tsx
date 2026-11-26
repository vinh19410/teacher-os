import { Link } from "@tanstack/react-router";
import type { StudentAssignment } from "@teacher-os/api/contracts";
import {
	type DerivedAssignmentStatus,
	deriveAssignmentStatus,
} from "@/lib/assignment-status";
import { cn } from "@/lib/cn";
import { formatAssignmentSkillLabel } from "@/lib/student-overview-selectors";

function statusToneClass(derived: DerivedAssignmentStatus): string {
	switch (derived.status) {
		case "overdue":
			return "text-destructive";
		case "due-soon":
			return "text-warn";
		case "graded":
			return "text-success";
		case "submitted":
			return derived.isLate ? "text-warn" : "text-success";
		default:
			return "text-muted-foreground";
	}
}

export function AssignmentRow({
	assignment,
	derived: precomputedDerived,
	todayISO,
	nowMs,
	showClassName = true,
}: {
	assignment: StudentAssignment;
	derived?: DerivedAssignmentStatus;
	todayISO?: string;
	nowMs?: number;
	/** Ẩn tên lớp khi row đã nằm trong trang của chính lớp đó. */
	showClassName?: boolean;
}) {
	const derived =
		precomputedDerived ?? deriveAssignmentStatus(assignment, todayISO, nowMs);
	const skillLabel = formatAssignmentSkillLabel(assignment.skill);
	const isInteractive = assignment.source === "class_assignment";
	const metaParts: string[] = [];
	if (showClassName && assignment.className) {
		metaParts.push(assignment.className);
	}
	if (skillLabel) {
		metaParts.push(skillLabel);
	}

	const rowContent = (
		<div className="grid grid-cols-1 gap-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-5 sm:py-4">
			<div className="min-w-0 space-y-0.5">
				<p className="truncate font-medium text-foreground text-sm">
					{assignment.title}
				</p>
				{metaParts.length > 0 ? (
					<p className="truncate text-muted-foreground text-xs">
						{metaParts.join(" · ")}
					</p>
				) : null}
			</div>

			<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:justify-end">
				<div className="flex flex-col gap-0.5 sm:items-end sm:text-right">
					{derived.dueText ? (
						<span className="font-mono text-foreground text-xs tabular-nums sm:text-sm">
							{derived.dueText}
						</span>
					) : null}
					<span
						className={cn(
							"inline-flex items-center gap-1.5 font-medium text-xs",
							statusToneClass(derived),
						)}
					>
						<span
							aria-hidden="true"
							className="size-1.5 shrink-0 rounded-full bg-current"
						/>
						<span>{derived.statusLabel}</span>
					</span>
				</div>

				{isInteractive ? (
					<span
						aria-hidden="true"
						className="inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-card px-3 font-medium text-foreground text-xs shadow-xs"
					>
						{assignment.submittedAt ? "Xem kết quả" : "Làm bài"}
					</span>
				) : null}
			</div>
		</div>
	);

	// Link CHỈ row class_assignment — row từ nguồn chấm giữ render tĩnh
	// (không href, tránh 404 take). Chưa nộp → take screen; đã nộp → take
	// screen tự redirect sang summary của attempt.
	if (!isInteractive) {
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
			className="block transition-colors hover:bg-muted/50 focus-visible:relative focus-visible:z-10 focus-visible:rounded-xl focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
		>
			{rowContent}
		</Link>
	);
}
