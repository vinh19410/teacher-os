import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
	type ClassSession,
	formatSessionDate,
	sessionAttendanceState,
	sessionStudents,
} from "@/lib/class-sessions";
import type { KernelAction } from "@/lib/data-actions";
import type { KernelCommandResult } from "@/lib/repos/kernel";
import { todayISOVietnam } from "@/lib/week-grid";

/**
 * Roster check-in for group sessions (issue #91): one row per attending
 * student, at most one button per sid (sequential head only). No bulk action —
 * each click POSTs exactly one enrollment lesson id. The session prop is the
 * LIVE session from the table (re-resolved every render), so rows flip to
 * badges as check-ins land without reopening.
 */
export function SessionAttendanceModal({
	session,
	studentById,
	run,
	isPending,
	busy,
	readOnly = false,
	onClose,
}: {
	session: ClassSession | null;
	studentById: (id: string) => { name: string } | undefined;
	run: (
		key: string,
		action: KernelAction,
		successText: string,
	) => Promise<KernelCommandResult>;
	isPending: (key: string) => boolean;
	busy: boolean;
	readOnly?: boolean;
	onClose: () => void;
}) {
	const closeRef = useRef<HTMLButtonElement>(null);

	const attendance =
		session === null
			? null
			: sessionAttendanceState(session, todayISOVietnam());
	const bySid = new Map((attendance?.sids ?? []).map((s) => [s.sid, s]));
	// Aggregate states carry no per-sid entries — every attending sid renders
	// with the aggregate badge ("future" would only appear if a future roster
	// view ever opens this modal; keep it honest with "Sắp tới").
	const fallbackDisplay =
		attendance?.kind === "cancelled"
			? "cancelled"
			: attendance?.kind === "future"
				? "upcoming"
				: attendance?.kind === "completed"
					? "completed"
					: readOnly
						? "unmarked"
						: "completed";
	const roster = session === null ? [] : sessionStudents(session);

	return (
		<Modal
			open={session !== null}
			onClose={onClose}
			title={
				session
					? `${readOnly ? "Xem điểm danh" : "Điểm danh"} — ${formatSessionDate(session.dateISO)}`
					: readOnly
						? "Xem điểm danh"
						: "Điểm danh"
			}
			footer={
				<Button
					type="button"
					variant="secondary"
					size="sm"
					ref={closeRef}
					onClick={onClose}
				>
					Đóng
				</Button>
			}
		>
			{roster.map((sid) => {
				const entry = bySid.get(sid);
				const display = entry?.display ?? fallbackDisplay;
				const enrollmentLessonId = entry?.enrollmentLessonId ?? null;
				return (
					<div
						key={sid}
						className="flex items-center justify-between gap-3 border-border border-b py-3 last:border-b-0"
					>
						<span className="font-medium text-sm">
							{studentById(sid)?.name ?? "Học viên"}
						</span>
						{!readOnly && display === "check-in" && enrollmentLessonId ? (
							<Button
								type="button"
								size="sm"
								disabled={busy || isPending(enrollmentLessonId)}
								onClick={(e) => {
									e.stopPropagation();
									// The modal focus trap skips disabled buttons — move
									// focus to Đóng before this button flips to "Đang lưu…".
									closeRef.current?.focus();
									void run(
										enrollmentLessonId,
										{ type: "check-in", lessonId: enrollmentLessonId },
										"Đã điểm danh.",
									);
								}}
								onKeyDown={(e) => {
									if (e.key === " " || e.key === "Enter") e.stopPropagation();
								}}
							>
								{isPending(enrollmentLessonId) ? "Đang lưu…" : "Điểm danh"}
							</Button>
						) : display === "completed" ? (
							<Badge variant="success" dot>
								Đã học
							</Badge>
						) : display === "cancelled" ? (
							<Badge variant="danger">Đã hủy</Badge>
						) : display === "absent" ? (
							<Badge variant="secondary">Vắng</Badge>
						) : readOnly && attendance?.kind !== "future" ? (
							<Badge variant="muted">Chưa điểm danh</Badge>
						) : (
							<Badge variant="accent">Sắp tới</Badge>
						)}
					</div>
				);
			})}
		</Modal>
	);
}
