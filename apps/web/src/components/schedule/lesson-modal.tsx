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
import { useData } from "@/lib/data-store";
import { lessonDayLabel } from "@/lib/format-schedule";
import { useDirectKernelAction } from "@/lib/use-direct-kernel-action";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { formatDayMonth } from "@/lib/week-grid";

export function LessonModal({
	lessonId,
	dateIso,
	onClose,
}: {
	lessonId: string | null;
	/** ISO date of the clicked week cell — the real date of this slot in the
	 * week the user is viewing (weekly-recurring slots have no date column). */
	dateIso: string | null;
	onClose: () => void;
}) {
	const { lessonById, studentById } = useData();
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
	const [editing, setEditing] = useState(false);
	const lesson = lessonId ? lessonById(lessonId) : undefined;
	const student = lesson ? studentById(lesson.sid) : undefined;
	const open = lessonId !== null && lesson !== undefined;

	// The modal stays mounted across lessons — without this reset, closing an
	// edit session on lesson A would leak the form (and its submit error /
	// notice state) into lesson B (same trap the grade-modal reset guards
	// against). `open` alone is the trigger: the UI opens one lesson per open
	// cycle, so every open transitions false→true and re-runs this effect.
	useEffect(() => {
		if (!open) return;
		setEditing(false);
		resetEditState();
	}, [open, resetEditState]);

	if (!lesson) return null;

	// Closing the modal is user navigation, not a success signal — the action
	// keeps running and its outcome lands in a toast.
	const act = (action: Parameters<typeof run>[1], successText: string) => {
		void run(lesson.id, action, successText);
		onClose();
	};

	// The edit submit is a form flow, not a direct action: it awaits the
	// outcome and only closes on "refreshed" — every other result keeps the
	// form (and the typed input) on screen with an honest notice.
	const submitEdit = async (values: LessonEditValues) => {
		const result = await runEdit({
			type: "lesson-edit",
			lessonId: lesson.id,
			payload: values,
		});
		if (result?.kind === "refreshed") {
			toast.success("Đã sửa buổi học.");
			setEditing(false);
			onClose();
		}
	};

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title={`${student?.name ?? ""} — ${lesson.type}`}
		>
			{editing && lesson.status === "upcoming" ? (
				<>
					{notice && (
						<KernelSubmitNotice
							notice={notice}
							onReconcile={() => void reconcile()}
							disabled={saving}
						/>
					)}
					{error && (
						<div role="alert" className="mb-3 text-danger text-xs">
							{error}
						</div>
					)}
					<LessonEditForm
						key={lesson.id}
						lesson={lesson}
						saving={saving}
						submitBlocked={submitBlocked}
						onSubmit={(values) => void submitEdit(values)}
						onCancel={() => setEditing(false)}
					/>
				</>
			) : (
				<>
					<div className="flex flex-col gap-1">
						<span className="font-medium text-muted-fg text-xs">Thời gian</span>
						<div className="font-mono text-meta text-xs">
							{dateIso
								? `${lessonDayLabel(lesson.day)}, ${formatDayMonth(dateIso)}`
								: lessonDayLabel(lesson.day)}{" "}
							· {lesson.time} ({lesson.dur} phút)
						</div>
					</div>
					<div className="flex flex-col gap-1">
						<span className="font-medium text-muted-fg text-xs">Chủ đề</span>
						<div className="text-sm">{lesson.topic}</div>
					</div>
					<div className="flex flex-col gap-1">
						<span className="font-medium text-muted-fg text-xs">
							Trạng thái
						</span>
						{lesson.status === "completed" ? (
							<Badge variant="success" dot>
								Hoàn thành
							</Badge>
						) : lesson.status === "cancelled" ? (
							<Badge variant="danger">Đã hủy</Badge>
						) : (
							<Badge variant="accent">Sắp tới</Badge>
						)}
					</div>
					{lesson.zoom && (
						<div className="flex flex-col gap-1">
							<span className="font-medium text-muted-fg text-xs">
								Link Zoom/Meet
							</span>
							<div className="break-all font-mono text-meta text-xs">
								{lesson.zoom}
							</div>
						</div>
					)}
					<div className="flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
						{lesson.status === "upcoming" ? (
							<>
								<Button
									variant="secondary"
									size="sm"
									disabled={busy || isPending(lesson.id)}
									onClick={() => setEditing(true)}
								>
									Sửa buổi
								</Button>
								<Button
									variant="secondary"
									size="sm"
									disabled={busy || isPending(lesson.id)}
									onClick={() =>
										act(
											{ type: "cancel-lesson", lessonId: lesson.id },
											"Đã hủy buổi học.",
										)
									}
								>
									Hủy buổi
								</Button>
								<Button
									size="sm"
									disabled={busy || isPending(lesson.id)}
									onClick={() =>
										act(
											{ type: "check-in", lessonId: lesson.id },
											"Đã điểm danh.",
										)
									}
								>
									Điểm danh
								</Button>
							</>
						) : (
							<Button variant="secondary" size="sm" onClick={onClose}>
								Đóng
							</Button>
						)}
					</div>
				</>
			)}
		</Modal>
	);
}
