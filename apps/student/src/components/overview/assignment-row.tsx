import type { StudentAssignment } from "@teacher-os/api/contracts";
import { deriveAssignmentStatus } from "@/lib/assignment-status";

export function AssignmentRow({
	assignment,
}: {
	assignment: StudentAssignment;
}) {
	const derived = deriveAssignmentStatus(assignment);

	return (
		<div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-line bg-surface/30 p-4 transition-[border-color,background] hover:border-line-hover hover:bg-surface sm:flex-row sm:items-center sm:justify-between">
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2">
					<h4 className="truncate font-[590] text-[15px] text-fg">
						{assignment.title}
					</h4>
				</div>
				<div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-fg">
					{assignment.className && (
						<>
							<span>{assignment.className}</span>
							<span aria-hidden="true">·</span>
						</>
					)}
					<span>{derived.dueText}</span>
				</div>
			</div>

			<div className="flex items-center gap-3">
				<span
					className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-[590] text-[12px] tracking-tight ${derived.badgeClass}`}
				>
					{derived.statusLabel}
				</span>
			</div>
		</div>
	);
}
