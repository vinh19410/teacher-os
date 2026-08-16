import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import { dayDates } from "@/lib/mock-data";

export function LessonModal({
	lessonId,
	onClose,
}: {
	lessonId: string | null;
	onClose: () => void;
}) {
	const { lessonById, studentById, dispatch } = useData();
	const lesson = lessonId ? lessonById(lessonId) : undefined;
	const student = lesson ? studentById(lesson.sid) : undefined;

	if (!lesson) return null;

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
							onClick={() => {
								dispatch({ type: "cancel-lesson", lessonId: lesson.id });
								onClose();
							}}
						>
							Hủy buổi
						</Button>
						<Button
							size="sm"
							onClick={() => {
								dispatch({ type: "check-in", lessonId: lesson.id });
								onClose();
							}}
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
