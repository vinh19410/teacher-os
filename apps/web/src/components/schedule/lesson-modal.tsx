import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import { dayDates } from "@/lib/mock-data";
import { useDirectKernelAction } from "@/lib/use-direct-kernel-action";

export function LessonModal({
	lessonId,
	onClose,
}: {
	lessonId: string | null;
	onClose: () => void;
}) {
	const { lessonById, studentById } = useData();
	const { run, isPending, busy } = useDirectKernelAction();
	const lesson = lessonId ? lessonById(lessonId) : undefined;
	const student = lesson ? studentById(lesson.sid) : undefined;

	if (!lesson) return null;

	// Closing the modal is user navigation, not a success signal — the action
	// keeps running and its outcome lands in a toast.
	const act = (action: Parameters<typeof run>[1], successText: string) => {
		void run(lesson.id, action, successText);
		onClose();
	};

	return (
		<Modal
			open={lessonId !== null}
			onClose={onClose}
			title={`${student?.name ?? ""} — ${lesson.type}`}
		>
			<div className="flex flex-col gap-1">
				<span className="font-medium text-muted-fg text-xs">Thời gian</span>
				<div className="font-mono text-meta text-xs">
					T{lesson.day + 1} {dayDates[lesson.day - 1]}/08 · {lesson.time} (
					{lesson.dur} phút)
				</div>
			</div>
			<div className="flex flex-col gap-1">
				<span className="font-medium text-muted-fg text-xs">Chủ đề</span>
				<div className="text-sm">{lesson.topic}</div>
			</div>
			<div className="flex flex-col gap-1">
				<span className="font-medium text-muted-fg text-xs">Trạng thái</span>
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
								act({ type: "check-in", lessonId: lesson.id }, "Đã điểm danh.")
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
		</Modal>
	);
}
