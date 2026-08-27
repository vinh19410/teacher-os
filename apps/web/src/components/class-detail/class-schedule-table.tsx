import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, type KeyboardEvent, useState } from "react";
import { SessionAttendanceModal } from "@/components/class-detail/session-attendance-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import {
	buildClassSessions,
	formatSessionDate,
	sessionAttendanceState,
	sessionLessonInfo,
	sessionStudents,
	sessionTimeRange,
} from "@/lib/class-sessions";
import type { KernelAction } from "@/lib/data-actions";
import { lessonDayLabel } from "@/lib/format-schedule";
import type { ClassGroup, Lesson, Student, Syllabus } from "@/lib/mock-data";
import { todayISOVietnam } from "@/lib/week-grid";

const thClass =
	"border-line border-b px-4 py-3 text-left font-medium font-mono text-[11px] text-muted-fg uppercase tracking-[0.04em]";

/** Space/Enter must not bubble past a CTA (parity with the roster modal). */
const stopActionKeyPropagation = (e: KeyboardEvent<HTMLButtonElement>) => {
	if (e.key === " " || e.key === "Enter") e.stopPropagation();
};

/**
 * Tab "Buổi học" (issue #83 / #89): one row per session in true chronological order
 * when the class schedule + startDate can be derived — concrete date + time
 * range in one cell, the syllabus-mapped topic with module badge and expandable
 * lesson details (materials + objectives), and the in-order-prefix status.
 * Classes the helper cannot derive truthfully (legacy free-text schedule,
 * missing startDate, rows edited away from the schedule via lesson-edit) render
 * the original weekday-grouped 4-column table.
 *
 * Issue #93 removes the in-table Học viên column: student lists live in the
 * roster tab, and per-session attendance still opens the roster modal (#91)
 * when a group session is actionable.
 *
 * Issue #91 adds the in-place check-in CTA: 1:1 classes get a one-click button
 * on the sequential-head occurrence; group classes open the roster modal.
 * Exactly one POST per click, always an enrollment lesson id — never a
 * syllabus id and never an iteration over the slot-bag rows. The action hook
 * lives on the route; `run`/`isPending`/`busy` are threaded in as props so
 * notes and attendance share one pending key.
 */
export function ClassScheduleTable({
	cls,
	lessons,
	legacyLessons,
	syllabus,
	studentById,
	run,
	isPending,
	busy,
}: {
	cls: ClassGroup;
	/** Class-scoped rows (`classId`), not the student-scoped `classLessons`. */
	lessons: Lesson[];
	/** Student-scoped rows — exactly what the legacy fallback rendered. */
	legacyLessons: Lesson[];
	syllabus: Syllabus | null;
	studentById: (id: string) => Student | undefined;
	run: (
		key: string,
		action: KernelAction,
		successText: string,
	) => Promise<void>;
	isPending: (key: string) => boolean;
	busy: boolean;
}) {
	const [expandedIndices, setExpandedIndices] = useState<Set<number>>(
		new Set(),
	);
	const [modalIndex, setModalIndex] = useState<number | null>(null);

	const sessions = buildClassSessions({
		schedule: cls.schedule,
		startDate: cls.startDate,
		lessons,
	});

	if (sessions === null) {
		return (
			<Card className="p-0">
				<DataTable
					headers={["Ngày", "Giờ", "Chủ đề", "Trạng thái"]}
					rows={legacyLessons.map((l) => {
						return {
							cells: [
								<span key="d" className="font-mono text-meta text-xs">
									{lessonDayLabel(l.day)}
								</span>,
								<span key="t" className="font-mono">
									{l.time}
								</span>,
								l.topic,
								l.status === "completed" ? (
									<Badge key="b" variant="success" dot>
										Đã học
									</Badge>
								) : l.status === "cancelled" ? (
									<Badge key="b" variant="danger">
										Đã hủy
									</Badge>
								) : (
									<Badge key="b" variant="accent">
										Sắp tới
									</Badge>
								),
							],
						};
					})}
				/>
			</Card>
		);
	}

	const toggleExpand = (index: number) => {
		setExpandedIndices((prev) => {
			const next = new Set(prev);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	};

	// Date gate anchored to Vietnam time — once per render, never a UTC slice.
	const todayISO = todayISOVietnam();
	// Live session behind the roster modal: re-resolved from the derived list
	// on every render so checked-in rows flip to badges without a snapshot.
	const modalSession = sessions.find((s) => s.index === modalIndex) ?? null;

	return (
		<Card className="p-0">
			<div className="w-full overflow-x-auto">
				<table className="w-full border-collapse text-sm">
					<thead>
						<tr>
							<th className={thClass}>Ngày & Giờ</th>
							<th className={thClass}>Chủ đề</th>
							<th className={thClass}>Trạng thái</th>
						</tr>
					</thead>
					<tbody>
						{sessions.map((s) => {
							const attendees = sessionStudents(s);
							const attendance = sessionAttendanceState(s, todayISO);
							// Group classes open the roster modal; 1:1 classes check in in place.
							const isGroupSession = attendees.length >= 2;
							const checkInId =
								attendance.sids.find((x) => x.display === "check-in")
									?.enrollmentLessonId ?? null;
							const info = sessionLessonInfo(s, syllabus);
							const isExpanded = expandedIndices.has(s.index);
							const hasDetails = Boolean(
								info.materials || info.objectives || info.lessonId,
							);

							return (
								<Fragment key={`session-${s.index}`}>
									<tr className="border-line-soft border-b transition-colors duration-[150ms]">
										<td className="px-4 py-3 text-left">
											<span className="font-mono text-meta text-xs">
												{formatSessionDate(s.dateISO)} · {sessionTimeRange(s)}
											</span>
										</td>
										<td className="px-4 py-3 text-left">
											<div className="flex items-center gap-2">
												{hasDetails ? (
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															toggleExpand(s.index);
														}}
														className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-fg hover:bg-surface hover:text-fg focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
														aria-label={
															isExpanded
																? "Thu gọn chi tiết bài học"
																: "Mở rộng chi tiết bài học"
														}
														aria-expanded={isExpanded}
													>
														{isExpanded ? (
															<ChevronDown className="h-3.5 w-3.5" />
														) : (
															<ChevronRight className="h-3.5 w-3.5" />
														)}
													</button>
												) : (
													<span className="w-5 shrink-0" />
												)}
												<div className="flex flex-wrap items-center gap-1.5">
													{info.moduleTitle && (
														<span
															className="inline-flex max-w-[140px] items-center truncate rounded-md border border-line-soft bg-surface-warm/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-fg"
															title={info.moduleTitle}
														>
															{info.moduleTitle}
														</span>
													)}
													<span className="font-medium text-sm">
														{info.title ?? "—"}
													</span>
												</div>
											</div>
										</td>
										<td className="px-4 py-3 text-left">
											{attendance.kind === "completed" ? (
												<Badge variant="success" dot>
													Đã học
												</Badge>
											) : attendance.kind === "cancelled" ? (
												<Badge variant="danger">Đã hủy</Badge>
											) : attendance.kind === "actionable" &&
												checkInId !== null &&
												!isGroupSession ? (
												<Button
													type="button"
													size="sm"
													disabled={busy || isPending(checkInId)}
													onClick={(e) => {
														e.stopPropagation();
														void run(
															checkInId,
															{
																type: "check-in",
																lessonId: checkInId,
															},
															"Đã điểm danh.",
														);
													}}
													onKeyDown={stopActionKeyPropagation}
												>
													{isPending(checkInId) ? "Đang lưu…" : "Điểm danh"}
												</Button>
											) : attendance.kind === "actionable" && isGroupSession ? (
												<Button
													type="button"
													size="sm"
													disabled={busy}
													onClick={(e) => {
														e.stopPropagation();
														setModalIndex(s.index);
													}}
													onKeyDown={stopActionKeyPropagation}
												>
													Điểm danh
												</Button>
											) : (
												<Badge variant="accent">Sắp tới</Badge>
											)}
										</td>
									</tr>
									{hasDetails && isExpanded && (
										<tr
											key={`details-${s.index}`}
											className="border-line-soft border-b bg-surface-warm/30 text-xs"
											aria-label="Chi tiết lesson"
										>
											<td colSpan={3} className="px-6 py-3">
												<div className="space-y-1.5 pl-7">
													<div>
														<span className="font-medium text-muted-fg">
															Tài liệu:{" "}
														</span>
														<span className="text-fg-2">
															{info.materials || "Chưa có tài liệu"}
														</span>
													</div>
													<div>
														<span className="font-medium text-muted-fg">
															Mục tiêu:{" "}
														</span>
														<span className="text-fg-2">
															{info.objectives || "Chưa có mục tiêu"}
														</span>
													</div>
												</div>
											</td>
										</tr>
									)}
								</Fragment>
							);
						})}
					</tbody>
				</table>
			</div>
			<SessionAttendanceModal
				session={modalSession}
				studentById={studentById}
				run={run}
				isPending={isPending}
				busy={busy}
				onClose={() => setModalIndex(null)}
			/>
		</Card>
	);
}
