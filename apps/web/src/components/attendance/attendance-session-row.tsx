import type { SessionAttendanceSave } from "@teacher-os/api/contracts";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import {
	attendanceDraftReducer,
	createAttendanceDraft,
	type DailyAttendanceSession,
	missingAttendanceLessonIds,
	toSaveEntries,
} from "@/lib/attendance-draft";
import { cn } from "@/lib/cn";
import { AttendanceStatusPicker } from "./attendance-status-picker";

export interface AttendanceSessionRowProps {
	session: DailyAttendanceSession;
	expanded: boolean;
	onToggle: () => void;
	isFutureDate: boolean;
	saving?: boolean;
	serverError?: string | null;
	onSave: (entries: SessionAttendanceSave["entries"]) => void | Promise<void>;
}

function formatTimeWindow(time: string, dur: number): string {
	const [hhRaw, mmRaw] = time.split(":");
	const hh = Number(hhRaw);
	const mm = Number(mmRaw);
	if (Number.isNaN(hh) || Number.isNaN(mm)) return time;
	const total = (((hh * 60 + mm + dur) % 1440) + 1440) % 1440;
	const endH = String(Math.floor(total / 60)).padStart(2, "0");
	const endM = String(total % 60).padStart(2, "0");
	return `${time} – ${endH}:${endM}`;
}

export function AttendanceSessionRow({
	session,
	expanded,
	onToggle,
	isFutureDate,
	saving = false,
	serverError = null,
	onSave,
}: AttendanceSessionRowProps) {
	const [draft, dispatch] = useReducer(
		attendanceDraftReducer,
		session.students,
		createAttendanceDraft,
	);
	const [validationClicked, setValidationClicked] = useState(false);
	const firstRadioByLessonRef = useRef<Record<string, HTMLButtonElement | null>>(
		{},
	);

	// Khi dữ liệu server của ca thay đổi (vd sau refetch 409 hoặc đổi ngày), đồng bộ lại nháp.
	useEffect(() => {
		dispatch({ type: "reset", students: session.students });
		setValidationClicked(false);
	}, [session.students]);

	const missingIds = missingAttendanceLessonIds(draft);
	const highlightedMissingSet = new Set(validationClicked ? missingIds : []);

	const presentCount = session.students.filter(
		(s) => s.attendance === "present" || s.attendance === "late",
	).length;
	const totalStudents = session.students.length;

	const handleSubmit = () => {
		if (isFutureDate || saving || session.mode === "legacy") return;
		const currentMissing = missingAttendanceLessonIds(draft);
		if (currentMissing.length > 0) {
			setValidationClicked(true);
			const firstMissingId = currentMissing[0];
			if (firstMissingId) {
				firstRadioByLessonRef.current[firstMissingId]?.focus();
			}
			return;
		}
		setValidationClicked(false);
		void onSave(toSaveEntries(draft));
	};

	const timeLabel = formatTimeWindow(session.time, session.dur);

	return (
		<Card className="overflow-hidden py-0">
			<button
				type="button"
				aria-expanded={expanded}
				onClick={onToggle}
				className={cn(
					"flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-accent/50",
					"focus-visible:ring-[3px] focus-visible:ring-ring/50",
				)}
			>
				<div className="flex min-w-0 items-center gap-2.5">
					{expanded ? (
						<ChevronDown
							aria-hidden="true"
							className="size-4 shrink-0 text-muted-foreground"
						/>
					) : (
						<ChevronRight
							aria-hidden="true"
							className="size-4 shrink-0 text-muted-foreground"
						/>
					)}
					<div className="min-w-0">
						<span className="font-medium text-foreground text-sm tabular-nums">
							{timeLabel}
						</span>
						<span className="mx-1.5 text-muted-foreground">·</span>
						<span className="font-semibold text-foreground text-sm">
							{session.className}
						</span>
						<span className="mx-1.5 text-muted-foreground">·</span>
						<span className="text-muted-foreground text-xs tabular-nums">
							Sĩ số {totalStudents} HV
						</span>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{session.mode === "legacy" && (
						<Badge variant="outline">Lớp chưa gắn lịch ngày</Badge>
					)}
					{session.recorded ? (
						<Badge variant="success" dot>
							{session.mode === "dated"
								? `Đã điểm danh (${presentCount}/${totalStudents} có mặt)`
								: "Đã điểm danh"}
						</Badge>
					) : (
						<Badge variant="warn" dot>
							Chưa điểm danh
						</Badge>
					)}
				</div>
			</button>

			{expanded && (
				<div className="border-border border-t px-4 py-4">
					{session.mode === "legacy" ? (
						<div className="space-y-4">
							<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3.5 py-2.5">
								<div className="space-y-0.5">
									<p className="font-medium text-foreground text-xs">
										Lớp chưa gắn lịch ngày
									</p>
									<p className="text-muted-foreground text-xs">
										Lớp này đang dùng lịch theo thứ cố định. Vui lòng mở trang
										lớp để điểm danh từng học viên theo luồng hiện tại.
									</p>
								</div>
								<Link
									to="/classes/$id"
									params={{ id: session.classId }}
									className={cn(
										"inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-accent",
										"focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
									)}
								>
									Mở lớp để điểm danh →
								</Link>
							</div>

							<ul className="divide-y divide-border rounded-md border border-border">
								{session.students.map((student, idx) => (
									<li
										key={student.studentId}
										className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
									>
										<div className="flex items-center gap-2.5">
											<span className="w-6 text-muted-foreground text-xs tabular-nums">
												{String(idx + 1).padStart(2, "0")}
											</span>
											<span className="font-medium text-foreground">
												{student.studentName}
											</span>
										</div>
										<span className="text-muted-foreground text-xs">
											Chỉ xem
										</span>
									</li>
								))}
							</ul>
						</div>
					) : (
						<div className="space-y-4">
							{isFutureDate && (
								<p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
									Chưa đến ngày học
								</p>
							)}

							{validationClicked && missingIds.length > 0 && (
								<div
									role="alert"
									className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 font-medium text-warn text-xs"
								>
									Còn {missingIds.length} học viên chưa chọn trạng thái
								</div>
							)}

							{serverError && (
								<div
									role="alert"
									className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs"
								>
									<span>{serverError}</span>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={saving || isFutureDate}
										onClick={handleSubmit}
									>
										Thử lại
									</Button>
								</div>
							)}

							<div className="hidden border-border border-b pb-2 font-medium text-muted-foreground text-xs lg:grid lg:grid-cols-[2.5rem_minmax(10rem,1.2fr)_minmax(19rem,2fr)_minmax(12rem,1.4fr)] lg:items-center lg:gap-3">
								<span>#</span>
								<span>Học viên</span>
								<span>Trạng thái điểm danh</span>
								<span>Ghi chú học vụ</span>
							</div>

							<div className="space-y-2.5 lg:space-y-0 lg:divide-y lg:divide-border">
								{session.students.map((student, idx) => {
									const lessonId = student.lessonId;
									if (!lessonId) return null;
									const draftEntry = draft.entries[lessonId] ?? {
										attendance: student.attendance,
										note: student.note,
									};
									const isMissingHighlighted =
										highlightedMissingSet.has(lessonId);
									const isLegacyUnknown =
										session.recorded &&
										student.attendance === null &&
										draftEntry.attendance === null;

									return (
										<div
											key={lessonId}
											data-lesson-id={lessonId}
											className={cn(
												"grid grid-cols-1 gap-2.5 rounded-lg border border-border p-3 lg:grid-cols-[2.5rem_minmax(10rem,1.2fr)_minmax(19rem,2fr)_minmax(12rem,1.4fr)] lg:items-center lg:gap-3 lg:rounded-none lg:border-0 lg:px-1 lg:py-2.5",
												isMissingHighlighted &&
													"border-warn bg-warn/5 ring-1 ring-warn lg:rounded-md lg:px-2",
											)}
										>
											<div className="flex items-center justify-between lg:contents">
												<span className="font-medium text-muted-foreground text-xs tabular-nums">
													{String(idx + 1).padStart(2, "0")}
												</span>
												<div className="min-w-0 flex-1 pl-2 lg:pl-0">
													<span className="block truncate font-medium text-foreground text-sm">
														{student.studentName}
													</span>
													{isLegacyUnknown && (
														<span className="mt-0.5 inline-block text-[11px] text-warn">
															Chưa rõ (điểm danh cũ)
														</span>
													)}
												</div>
											</div>

											<AttendanceStatusPicker
												value={draftEntry.attendance}
												onChange={(attendance) =>
													dispatch({
														type: "set",
														lessonId,
														attendance,
													})
												}
												ariaLabel={`Trạng thái điểm danh của ${student.studentName}`}
												disabled={saving || isFutureDate}
												firstRadioRef={(el) => {
													firstRadioByLessonRef.current[lessonId] = el;
												}}
											/>

											<Input
												type="text"
												maxLength={255}
												value={draftEntry.note}
												disabled={saving || isFutureDate}
												aria-label={`Ghi chú học vụ của ${student.studentName}`}
												placeholder="Ghi chú học vụ (≤ 255 ký tự)…"
												onChange={(e) =>
													dispatch({
														type: "setNote",
														lessonId,
														note: e.target.value,
													})
												}
											/>
										</div>
									);
								})}
							</div>

							<div className="flex items-center justify-end border-border border-t pt-3">
								<Button
									type="button"
									disabled={saving || isFutureDate}
									onClick={handleSubmit}
								>
									{saving ? "Đang lưu…" : "Lưu điểm danh ca học"}
								</Button>
							</div>
						</div>
					)}
				</div>
			)}
		</Card>
	);
}
