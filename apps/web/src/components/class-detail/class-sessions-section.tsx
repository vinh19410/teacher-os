import { ChevronDown, ChevronRight, Clock } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { AttendanceSummary } from "@/components/class-detail/attendance-summary";
import {
	type OccurrenceActionResult,
	type OccurrenceEditPayload,
	SessionActionsModal,
} from "@/components/class-detail/session-actions-modal";
import { SessionAttendanceModal } from "@/components/class-detail/session-attendance-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Section } from "@/components/ui/section";
import {
	buildClassSessions,
	formatSessionDate,
	sessionAttendanceState,
	sessionAttendanceTally,
	sessionLessonInfo,
	sessionRowTargets,
	sessionStatus,
	sessionStudents,
	sessionTimeRange,
} from "@/lib/class-sessions";
import { cn } from "@/lib/cn";
import type { KernelAction } from "@/lib/data-actions";
import { lessonDayLabel } from "@/lib/format-schedule";
import type {
	ClassGroup,
	ClassSessionItem,
	Lesson,
	Student,
	Syllabus,
} from "@/lib/mock-data";
import type { KernelCommandResult } from "@/lib/repos/kernel";
import { todayISOVietnam } from "@/lib/week-grid";

/** Space/Enter must not bubble past a CTA (parity with the roster modal). */
const stopActionKeyPropagation = (e: KeyboardEvent<HTMLButtonElement>) => {
	if (e.key === " " || e.key === "Enter") e.stopPropagation();
};

/**
 * Tab "Buổi học & luyện tập" — cột Sessions (#391, #520): danh sách buổi dạng card
 * `li[data-testid="session-row"]` thay cho bảng (#89). Giữ nguyên toàn bộ
 * hành vi ghi từ bảng cũ: check-in 1-click cho lớp 1:1 (#91), modal điểm
 * danh roster cho nhóm, modal Điều chỉnh (hoàn thành/huỷ/dời), chi tiết bài
 * học mở rộng, và bảng weekday cho lịch legacy không suy ra được ngày
 * (`sessions === null`). Render đủ N buổi — không cắt danh sách (spec đếm
 * buổi thật).
 */
export function ClassSessionsSection({
	cls,
	lessons,
	legacyLessons,
	syllabus,
	studentById,
	run,
	onComplete,
	onCancelOccurrence,
	onSaveEdit,
	isPending,
	busy,
	classSessions,
	onAddSession,
	onDeleteOccurrence,
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
	) => Promise<KernelCommandResult>;
	/** #98 threaded write surface — toasts live at the route, not here. */
	onComplete: (dateISO: string) => Promise<OccurrenceActionResult>;
	onCancelOccurrence: (dateISO: string) => Promise<OccurrenceActionResult>;
	onSaveEdit: (
		dateISO: string,
		payload: OccurrenceEditPayload,
	) => Promise<OccurrenceActionResult>;
	classSessions?: ClassSessionItem[];
	onAddSession?: () => void;
	onDeleteOccurrence?: (dateISO: string) => Promise<OccurrenceActionResult>;
	isPending: (key: string) => boolean;
	busy: boolean;
}) {
	const [expandedDetails, setExpandedDetails] = useState<Set<number>>(
		new Set(),
	);
	const [modalIndex, setModalIndex] = useState<number | null>(null);
	// Identity-keyed (N4): a numeric index would dangle once a successful
	// moveDate reorders the chronology under an open dialog.
	const [actionsDateISO, setActionsDateISO] = useState<string | null>(null);

	// Issue #649: manual = lớp tạo không template (`schedulingMode: "manual"`)
	// hoặc đã có buổi thủ công. `sessionsTotal === 0` không phải tín hiệu —
	// deploy skew (server cũ) không gửi schedulingMode và lớp auto legacy
	// phải giữ nguyên projection #121.
	const isManual =
		cls.schedulingMode === "manual" || (classSessions?.length ?? 0) > 0;

	const sessions = buildClassSessions({
		schedule: cls.schedule,
		startDate: cls.startDate,
		lessons,
		sessionsTotal: cls.sessionsTotal,
		manual: isManual,
		classSessions,
	});
	// Projection mode: zero real rows for an auto-scheduled class means every displayed
	// session is a schedule projection (display-only).
	const isProjected = !isManual && lessons.length === 0 && sessions !== null;

	if (sessions === null) {
		return (
			<Section title="Sessions">
				<div className="overflow-x-auto">
					<DataTable
						headers={["Ngày", "Giờ", "Chủ đề", "Trạng thái"]}
						emptyMessage="Chưa có buổi học nào được ghi nhận."
						rows={legacyLessons.map((l) => ({
							cells: [
								<span key="d" className="text-muted-foreground text-xs">
									{lessonDayLabel(l.day)}
								</span>,
								<span key="t" className="tabular-nums">
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
						}))}
					/>
				</div>
			</Section>
		);
	}
	if (sessions !== null && sessions.length === 0) {
		return (
			<Section
				title="Sessions"
				action={
					onAddSession ? (
						<Button variant="outline" size="sm" onClick={onAddSession}>
							+ Thêm buổi
						</Button>
					) : undefined
				}
			>
				<div className="rounded-lg border border-border border-dashed p-8 text-center">
					<p className="font-semibold text-sm">Chưa có buổi học nào</p>
					<p className="mt-1 text-muted-foreground text-xs">
						Lớp chưa có giáo trình mẫu. Bạn có thể thêm buổi học thủ công để bắt
						đầu giảng dạy.
					</p>
					{onAddSession && (
						<div className="mt-4 flex justify-center">
							<Button size="sm" onClick={onAddSession}>
								+ Thêm buổi học
							</Button>
						</div>
					)}
				</div>
			</Section>
		);
	}

	const toggleDetails = (index: number) => {
		setExpandedDetails((prev) => {
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
	const actionsSession =
		sessions.find((s) => s.dateISO === actionsDateISO) ?? null;

	return (
		<>
			<Section
				title="Sessions"
				count={sessions.length}
				action={
					!syllabus && onAddSession ? (
						<Button variant="outline" size="sm" onClick={onAddSession}>
							+ Thêm buổi
						</Button>
					) : undefined
				}
			>
				<ol className="grid gap-2">
					{sessions.map((s) => {
						const attendees = sessionStudents(s);
						const attendance = sessionAttendanceState(s, todayISO);
						const isGroupSession = attendees.length >= 2;
						const checkInId =
							attendance.sids.find((x) => x.display === "check-in")
								?.enrollmentLessonId ?? null;
						const info = sessionLessonInfo(s, syllabus);
						const isExpanded = expandedDetails.has(s.index);
						const hasDetails = Boolean(
							info.materials || info.objectives || info.lessonId,
						);
						const status = sessionStatus(s);
						// Tally điểm danh qua helper thuần (#391): completed = có mặt,
						// absent = vắng (dữ liệu thật của row dated v2), còn lại =
						// chưa điểm danh.
						const tally = sessionAttendanceTally(s, todayISO);
						const { marked: markedCount, absent: absentCount } = tally;
						// Buổi quá khứ chưa hoàn thành: hiện tally; amber khi chưa có
						// dữ liệu điểm danh nào.
						const isPast =
							!isProjected &&
							status === "upcoming" &&
							s.dateISO < todayISO &&
							attendees.length > 0;
						const isPastUnmarked = isPast && markedCount + absentCount === 0;
						// Link attendance cho buổi ĐÃ TỚI NGÀY (kể cả hôm nay — gate
						// action trong modal vẫn chặn check-in sớm qua
						// sessionIsEligibleDate) hoặc đã học. Buổi `holiday` (TOS-11)
						// không diễn ra — không có CTA điểm danh.
						const dateArrived =
							!isProjected &&
							status !== "cancelled" &&
							status !== "holiday" &&
							s.dateISO <= todayISO &&
							attendees.length > 0;
						const hasAdjust =
							!isProjected &&
							(sessionRowTargets(s).length > 0 ||
								isManual ||
								s.topic !== undefined);

						return (
							<li
								key={`session-${s.dateISO}-${s.index}`}
								data-testid="session-row"
								className={cn(
									"flex flex-wrap items-center gap-3 rounded-lg border p-3",
									isPastUnmarked && "border-warn/50 bg-warn-soft",
								)}
							>
								<span
									className={cn(
										"grid size-9 shrink-0 place-items-center rounded-md font-semibold text-sm tabular-nums",
										status === "completed"
											? "bg-primary text-primary-foreground"
											: "bg-muted text-muted-foreground",
									)}
								>
									{/* Buổi `holiday` không tiêu thụ số buổi (TOS-11 I4) — index 0. */}
									{s.index > 0 ? s.index : "—"}
								</span>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-1.5">
										{hasDetails ? (
											<button
												type="button"
												onClick={() => toggleDetails(s.index)}
												className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
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
										<span className="text-muted-foreground text-xs">
											{formatSessionDate(s.dateISO)} · {sessionTimeRange(s)}
										</span>
										{info.moduleTitle && (
											<span
												className="inline-flex max-w-[140px] items-center truncate rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums"
												title={info.moduleTitle}
											>
												{info.moduleTitle}
											</span>
										)}
									</div>
									<div className="mt-0.5 truncate font-medium text-sm">
										{info.title ?? "—"}
									</div>
									{(status === "completed" || dateArrived) &&
										isGroupSession && (
											<button
												type="button"
												// #403: selector ổn định cho harness design:compare
												// (t-attendance appSteps) — phân biệt với nút commit
												// check-in 1:1 cùng text "Điểm danh".
												data-testid={`session-attendance-open-${s.index}`}
												disabled={busy}
												onClick={() => setModalIndex(s.index)}
												className="mt-0.5 inline-flex items-center gap-1 font-medium text-xs underline-offset-4 hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
											>
												{status === "completed" ||
												(tally.unmarked === 0 && markedCount + absentCount > 0)
													? "Sửa điểm danh"
													: "Điểm danh"}{" "}
												→
											</button>
										)}
								</div>
								{isProjected ? (
									<span className="shrink-0 text-muted-foreground text-xs">
										Dự kiến
									</span>
								) : status === "cancelled" ? (
									<span className="shrink-0 font-medium text-muted-foreground text-xs">
										Đã hủy
									</span>
								) : status === "holiday" ? (
									<span className="inline-flex shrink-0 items-center rounded-md border border-warn/50 bg-warn-soft px-1.5 py-0.5 font-medium text-warn text-xs">
										Nghỉ lễ — Đã dời lịch
									</span>
								) : status === "completed" ||
									isPast ||
									(tally.unmarked === 0 && markedCount + absentCount > 0) ? (
									<AttendanceSummary
										tally={tally}
										total={attendees.length - tally.cancelled}
									/>
								) : (
									<span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
										<Clock className="size-3.5" />
										Sắp tới
									</span>
								)}
								{attendance.kind === "actionable" &&
									checkInId !== null &&
									!isGroupSession && (
										// #91: check-in 1-click 1:1 — KHÔNG phụ thuộc hasAdjust:
										// sessionRowTargets chỉ trả row v2, legacy 1:1 vẫn phải
										// có nút (regression bắt được ở review #391).
										<Button
											type="button"
											size="sm"
											disabled={busy || isPending(checkInId)}
											onClick={() => {
												void run(
													checkInId,
													{ type: "check-in", lessonId: checkInId },
													"Đã điểm danh.",
												);
											}}
											onKeyDown={stopActionKeyPropagation}
										>
											{isPending(checkInId) ? "Đang lưu…" : "Điểm danh"}
										</Button>
									)}
								{hasAdjust && (
									<Button
										type="button"
										variant="secondary"
										size="sm"
										disabled={busy}
										onClick={() => setActionsDateISO(s.dateISO)}
										onKeyDown={stopActionKeyPropagation}
									>
										Điều chỉnh
									</Button>
								)}
								{hasDetails && isExpanded && (
									<div className="w-full border-border border-t pt-2 text-muted-foreground text-xs">
										<div className="pl-9">
											<span className="font-medium">Tài liệu: </span>
											<span>{info.materials || "Chưa có tài liệu"}</span>
										</div>
										<div className="pl-9">
											<span className="font-medium">Mục tiêu: </span>
											<span>{info.objectives || "Chưa có mục tiêu"}</span>
										</div>
									</div>
								)}
							</li>
						);
					})}
				</ol>
			</Section>
			<SessionAttendanceModal
				session={modalSession}
				studentById={studentById}
				run={run}
				isPending={isPending}
				busy={busy}
				onClose={() => setModalIndex(null)}
			/>
			<SessionActionsModal
				key={actionsDateISO ?? "no-session-actions"}
				session={actionsSession}
				studentById={studentById}
				onClose={() => setActionsDateISO(null)}
				onComplete={onComplete}
				onCancelOccurrence={onCancelOccurrence}
				onSaveEdit={onSaveEdit}
				onDeleteOccurrence={onDeleteOccurrence}
			/>
		</>
	);
}
