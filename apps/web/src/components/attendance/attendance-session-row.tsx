import { Link } from "@tanstack/react-router";
import type { SessionAttendanceSave } from "@teacher-os/api/contracts";
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
	markAllPresentState,
	missingAttendanceLessonIds,
	toSaveEntries,
} from "@/lib/attendance-draft";
import { cn } from "@/lib/cn";
import { AttendanceStatusPicker } from "./attendance-status-picker";
import { FillMissingConfirm } from "./fill-missing-confirm";

export interface AttendanceSessionRowProps {
	session: DailyAttendanceSession;
	expanded: boolean;
	onToggle: () => void;
	isFutureDate: boolean;
	saving?: boolean;
	serverError?: string | null;
	onSave: (entries: SessionAttendanceSave["entries"]) => void | Promise<void>;
	/** TOS-8 D3: ca vừa được auto-advance mở — focus picker đầu tiên sau khi mount. */
	autoFocusBulk?: boolean;
	/** Báo route xoá cờ auto-focus để re-render sau không giành lại focus. */
	onBulkFocusSettled?: () => void;
	/** Có MỘT ca bất kỳ đang lưu (red-team CR-Bugs F1): disable Lưu/điền
	 * nhanh/modal của TẤT CẢ các ca để không nuốt save im lặng cross-row. */
	busy?: boolean;
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
	autoFocusBulk = false,
	onBulkFocusSettled,
	busy = false,
}: AttendanceSessionRowProps) {
	// Saving của chính ca này hoặc một ca khác đang bay — mọi nút ghi đều khoá
	// để tránh double-PUT và dead-click nuốt save im lặng (CR-Bugs F1/FAIL-3).
	const lockSaving = saving || busy;
	const isReadOnly = isFutureDate || Boolean(session.classPaused);
	const [draft, dispatch] = useReducer(
		attendanceDraftReducer,
		session.students,
		createAttendanceDraft,
	);
	const [validationClicked, setValidationClicked] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [focusFirstMissingAfterClose, setFocusFirstMissingAfterClose] =
		useState(false);
	const bodyRef = useRef<HTMLDivElement>(null);
	const firstRadioByLessonRef = useRef<
		Record<string, HTMLButtonElement | null>
	>({});

	// TOS-8 D3: ca vừa lưu xong được auto-advance mở — cuộn thẻ về gần nhất
	// (chỉ cuộn khi nằm ngoài khung nhìn) và focus picker trạng thái đầu tiên,
	// KHÔNG phải nút điền nhanh (tránh Enter mặc định đậu trên thao tác ghi
	// hàng loạt — red-team SEC-4). Sau đó báo route xoá cờ auto-focus. Guard
	// ref chống chạy lại khi effect reset nháp (theo dõi session.students) tạo
	// lại draft.order ngay sau mount.
	const settledForBulkRef = useRef(false);
	useEffect(() => {
		if (!autoFocusBulk || !expanded) {
			settledForBulkRef.current = false;
			return;
		}
		if (settledForBulkRef.current) return;
		settledForBulkRef.current = true;
		// jsdom không cài scrollIntoView — gọi tuỳ chọn để test không nổ.
		bodyRef.current?.scrollIntoView?.({ block: "nearest" });
		const firstLessonId = draft.order[0];
		if (firstLessonId) {
			firstRadioByLessonRef.current[firstLessonId]?.focus();
		}
		onBulkFocusSettled?.();
	}, [autoFocusBulk, expanded, draft.order, onBulkFocusSettled]);

	// TOS-8 D2 + kongming điều kiện 3: cleanup focus của `Modal` trả focus về
	// nút lưu, nên "Quay lại chỉnh"/Esc phải focus dòng thiếu đầu tiên SAU khi
	// modal đã đóng (cờ xử lý trong effect này).
	useEffect(() => {
		if (confirmOpen || !focusFirstMissingAfterClose) return;
		setFocusFirstMissingAfterClose(false);
		setValidationClicked(true);
		const firstMissingId = missingAttendanceLessonIds(draft)[0];
		if (firstMissingId) {
			firstRadioByLessonRef.current[firstMissingId]?.focus();
		}
	}, [confirmOpen, focusFirstMissingAfterClose, draft]);

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

	const focusFirstMissing = () => {
		setValidationClicked(true);
		const firstMissingId = missingAttendanceLessonIds(draft)[0];
		if (firstMissingId) {
			firstRadioByLessonRef.current[firstMissingId]?.focus();
		}
	};

	const handleSubmit = () => {
		if (isReadOnly || lockSaving || session.mode === "legacy") return;
		const currentMissing = missingAttendanceLessonIds(draft);
		if (currentMissing.length > 0) {
			// TOS-8 D2: ca chưa recorded → hỏi xác nhận "Gán Có mặt và lưu".
			// Ca recorded còn dòng "Chưa rõ" → giữ hành vi TOS-7 (không bulk đè lịch sử).
			if (!session.recorded) {
				setConfirmOpen(true);
				return;
			}
			focusFirstMissing();
			return;
		}
		setValidationClicked(false);
		void onSave(toSaveEntries(draft));
	};

	// KHÔNG dispatch-then-read (red-team SEC-1): tính entries từ snapshot
	// `draft` hiện tại qua helper thuần — `toSaveEntries` sẽ throw nếu đọc
	// state closure sau dispatch. Dispatch chỉ để sync UI.
	const handleConfirmFillAndSave = () => {
		const next = markAllPresentState(draft);
		setConfirmOpen(false);
		setValidationClicked(false);
		void onSave(toSaveEntries(next));
		dispatch({ type: "markAllPresent" });
	};

	const handleCancelConfirm = () => {
		// Focus dòng thiếu diễn ra trong effect sau khi modal đóng.
		setFocusFirstMissingAfterClose(true);
		setConfirmOpen(false);
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
					{session.classPaused && <Badge variant="muted">Tạm dừng</Badge>}
					{session.mode === "legacy" && (
						<Badge variant="outline">Lớp chưa gắn lịch ngày</Badge>
					)}
					{session.recorded ? (
						<Badge variant="success" dot>
							{session.mode === "dated"
								? `Đã điểm danh (${presentCount}/${totalStudents} có mặt)`
								: "Đã điểm danh"}
						</Badge>
					) : !session.classPaused ? (
						<Badge variant="warn" dot>
							Chưa điểm danh
						</Badge>
					) : null}
				</div>
			</button>

			{expanded && (
				<div ref={bodyRef} className="border-border border-t px-4 py-4">
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
									to="/classes/$classId"
									params={{ classId: session.classId }}
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
							{session.classPaused && (
								<p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
									Lớp đang tạm dừng — chỉ xem lịch sử điểm danh.
								</p>
							)}
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
										disabled={lockSaving || isReadOnly}
										onClick={handleSubmit}
									>
										Thử lại
									</Button>
								</div>
							)}

							{/* TOS-8 D1: điền nhanh chỉ điền ô trống; disabled khi ca đã
						recorded (không bulk đè lịch sử "Chưa rõ"), ngày tương lai,
						lớp tạm dừng, đang lưu, hoặc không còn ai trống. Lớp legacy không render
						(cả nhánh dated này không chạy với legacy). */}
							<Button
								type="button"
								variant="secondary"
								disabled={
									lockSaving ||
									isReadOnly ||
									session.recorded ||
									missingIds.length === 0
								}
								onClick={() => dispatch({ type: "markAllPresent" })}
								className="min-h-[44px] w-full lg:min-h-9 lg:w-auto"
							>
								Đánh dấu tất cả Có mặt
							</Button>

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
												disabled={lockSaving || isReadOnly}
												firstRadioRef={(el) => {
													firstRadioByLessonRef.current[lessonId] = el;
												}}
											/>

											<Input
												type="text"
												maxLength={255}
												value={draftEntry.note}
												disabled={lockSaving || isReadOnly}
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

							{/* TOS-8: <lg hai nút xếp chồng full-width, ô bấm ≥ 44px. */}
							<div className="flex flex-col gap-2 border-border border-t pt-3 lg:flex-row lg:items-center lg:justify-end">
								<Button
									type="button"
									disabled={lockSaving || isReadOnly}
									onClick={handleSubmit}
									className="min-h-[44px] w-full lg:min-h-9 lg:w-auto"
								>
									{saving ? "Đang lưu…" : "Lưu điểm danh ca học"}
								</Button>
							</div>

							<FillMissingConfirm
								open={confirmOpen}
								count={missingIds.length}
								saving={lockSaving}
								onConfirm={handleConfirmFillAndSave}
								onCancel={handleCancelConfirm}
							/>
						</div>
					)}
				</div>
			)}
		</Card>
	);
}
