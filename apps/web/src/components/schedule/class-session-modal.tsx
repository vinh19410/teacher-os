import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KernelSubmitNotice } from "@/components/modals/kernel-submit-notice";
import {
	LessonEditForm,
	type LessonEditValues,
} from "@/components/schedule/lesson-edit-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
	findClassOccurrence,
	formatSessionDate,
	occurrenceSidStates,
} from "@/lib/class-sessions";
import { useData } from "@/lib/data-store";
import { lessonDayLabel } from "@/lib/format-schedule";
import type { Lesson } from "@/lib/mock-data";
import {
	fallbackSidStates,
	findSessionRows,
	type SessionRef,
} from "@/lib/schedule-week";
import { useDirectKernelAction } from "@/lib/use-direct-kernel-action";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { todayISOVietnam } from "@/lib/week-grid";

export interface ClassSessionModalRef extends SessionRef {
	columnDateISO?: string;
}

export function ClassSessionModal({
	sessionRef,
	onClose,
}: {
	sessionRef: ClassSessionModalRef | null;
	onClose: () => void;
}) {
	const { data, studentById, classById } = useData();
	const { run, isPending, busy } = useDirectKernelAction();
	const {
		saving,
		error,
		notice,
		submitBlocked,
		run: runEdit,
		reconcile,
		reset: resetEditState,
	} = useKernelFormSubmit();

	const [editingLessonId, setEditingLessonId] = useState<string | null>(null);

	const rows = sessionRef ? findSessionRows(data.lessons, sessionRef) : [];
	const cls = sessionRef ? classById(sessionRef.classId) : undefined;
	const open = sessionRef !== null && rows.length > 0;

	// Reset edit form state when opening a new session modal
	useEffect(() => {
		if (!open) return;
		setEditingLessonId(null);
		resetEditState();
	}, [open, resetEditState]);

	if (!open || rows.length === 0) return null;

	const firstRow = rows[0];
	const effectiveDateISO =
		sessionRef?.dateISO ?? sessionRef?.columnDateISO ?? null;
	const dateDisplay = effectiveDateISO
		? formatSessionDate(effectiveDateISO)
		: lessonDayLabel(sessionRef.day);

	const title = cls?.name
		? `${cls.name} — ${dateDisplay}`
		: `Buổi học — ${dateDisplay}`;

	const submitEdit = async (lesson: Lesson, values: LessonEditValues) => {
		const result = await runEdit({
			type: "lesson-edit",
			lessonId: lesson.id,
			payload: values,
		});
		if (result?.kind === "refreshed") {
			toast.success("Đã sửa buổi học.");
			setEditingLessonId(null);
		}
	};

	const cancelEdit = async () => {
		if (saving || (submitBlocked && !(await reconcile()))) return;
		resetEditState();
		setEditingLessonId(null);
	};

	const restoreDialogFocus = () => {
		requestAnimationFrame(() => {
			const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
			if (!dialog || dialog.contains(document.activeElement)) return;
			dialog.querySelector<HTMLElement>('[aria-label="Đóng"]')?.focus();
		});
	};

	const runRowAction = async (
		lessonId: string,
		action: { type: "check-in" | "cancel-lesson"; lessonId: string },
		successText: string,
	) => {
		await run(lessonId, action, successText);
		restoreDialogFocus();
	};

	const editingLesson = editingLessonId
		? rows.find((r) => r.id === editingLessonId)
		: null;

	// Each student's state at THIS occurrence. Legacy undated entries bundle a
	// whole course, so reading `rows` directly would show an arbitrary week's
	// row (and write to it); the occurrence model picks the right row instead.
	const todayISO = todayISOVietnam();
	const lookup = cls
		? findClassOccurrence(cls, data.lessons, {
				dateISO: sessionRef.dateISO,
				columnDateISO: sessionRef.columnDateISO,
				time: sessionRef.time,
			})
		: null;
	const sidStates =
		lookup?.kind === "found"
			? occurrenceSidStates(lookup.session, todayISO)
			: fallbackSidStates(rows, todayISO);

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title={title}
		>
			<div className="flex flex-col gap-4">
				{/* Session Metadata */}
				<div className="flex flex-col gap-3 border-line-soft border-b border-solid pb-4">
					<div className="flex flex-col gap-1">
						<span className="font-medium text-muted-fg text-xs">Thời gian</span>
						<div className="font-mono text-meta text-xs">
							{dateDisplay} · {firstRow.time} ({firstRow.dur} phút)
						</div>
					</div>

					{firstRow.topic && (
						<div className="flex flex-col gap-1">
							<span className="font-medium text-muted-fg text-xs">Chủ đề</span>
							<div className="text-sm">{firstRow.topic}</div>
						</div>
					)}

					{firstRow.zoom && (
						<div className="flex flex-col gap-1">
							<span className="font-medium text-muted-fg text-xs">
								Link Zoom/Meet
							</span>
							<div className="break-all font-mono text-meta text-xs">
								{firstRow.zoom}
							</div>
						</div>
					)}
				</div>

				{/* Dated edits apply to the whole occurrence; legacy edits target one row. */}
				{editingLesson && editingLesson.status === "upcoming" ? (
					<div className="flex flex-col gap-2">
						<div className="font-medium text-muted-fg text-xs">
							{editingLesson.date ? (
								"Sửa buổi học cho cả lớp (tất cả học viên)"
							) : (
								<>
									Sửa buổi cho:{" "}
									{studentById(editingLesson.sid)?.name ?? "Học viên"}
								</>
							)}
						</div>
						{notice && (
							<KernelSubmitNotice
								notice={notice}
								onReconcile={() => void reconcile()}
								disabled={saving}
							/>
						)}
						{error && (
							<div role="alert" className="mb-2 text-danger text-xs">
								{error}
							</div>
						)}
						<LessonEditForm
							key={editingLesson.id}
							lesson={editingLesson}
							saving={saving}
							submitBlocked={submitBlocked}
							onSubmit={(values) => void submitEdit(editingLesson, values)}
							onCancel={() => void cancelEdit()}
						/>
					</div>
				) : (
					/* Student Rows List */
					<div className="flex flex-col gap-3">
						<div className="font-medium text-muted-fg text-xs">
							Danh sách học viên ({sidStates.length})
						</div>
						<div className="flex flex-col divide-y divide-line-soft">
							{sidStates.map((state) => {
								const student = studentById(state.sid);
								const studentName = student?.name ?? `Học viên #${state.sid}`;
								const targetId = state.targetLessonId;
								const isRowPending = targetId !== null && isPending(targetId);

								return (
									// biome-ignore lint/a11y/useSemanticElements: role="group" with aria-label is used to scope per-student action controls in UI and e2e
									<div
										key={state.sid}
										role="group"
										aria-label={studentName}
										className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
									>
										<div className="flex min-w-0 items-center gap-3">
											<div className="flex flex-col">
												<span className="font-medium text-fg text-sm">
													{studentName}
												</span>
												{student?.phone && (
													<span className="font-mono text-[11px] text-muted-fg">
														{student.phone}
													</span>
												)}
											</div>
										</div>

										<div className="flex items-center gap-2">
											{state.status === "completed" ? (
												<Badge variant="success" dot>
													Hoàn thành
												</Badge>
											) : state.status === "cancelled" ? (
												<Badge variant="danger">Đã hủy</Badge>
											) : state.status === "absent" ? (
												<Badge variant="danger">Vắng mặt</Badge>
											) : (
												<Badge variant="accent">Sắp tới</Badge>
											)}

											{targetId !== null && state.canCancelEdit && (
												<div className="ml-2 flex items-center gap-1.5">
													<Button
														variant="secondary"
														size="sm"
														disabled={busy || isRowPending || saving}
														onClick={() => {
															resetEditState();
															setEditingLessonId(targetId);
														}}
													>
														{rows.find((r) => r.id === targetId)?.date
															? "Sửa buổi học"
															: "Sửa"}
													</Button>
													<Button
														variant="secondary"
														size="sm"
														disabled={busy || isRowPending || saving}
														onClick={() =>
															void runRowAction(
																targetId,
																{ type: "cancel-lesson", lessonId: targetId },
																"Đã hủy buổi học.",
															)
														}
													>
														Hủy
													</Button>
													{state.canCheckIn && (
														<Button
															size="sm"
															disabled={busy || isRowPending || saving}
															onClick={() =>
																void runRowAction(
																	targetId,
																	{ type: "check-in", lessonId: targetId },
																	"Đã điểm danh.",
																)
															}
														>
															Điểm danh
														</Button>
													)}
												</div>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}

				{/* Modal Footer */}
				<div className="flex justify-end border-line-soft border-t border-solid pt-4">
					<Button
						variant="secondary"
						size="sm"
						onClick={onClose}
						disabled={saving}
					>
						Đóng
					</Button>
				</div>
			</div>
		</Modal>
	);
}
