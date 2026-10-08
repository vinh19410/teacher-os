import { Badge } from "@/components/ui/badge";
import type { SyllabusLesson } from "@/lib/mock-data";

export const lessonDotClass: Record<SyllabusLesson["status"], string> = {
	done: "bg-success",
	current: "bg-hot shadow-[0_0_0_3px_var(--accent-soft)]",
	upcoming: "bg-line",
};

/** A status persisted outside the union must not yield "class undefined". */
export function lessonDotClassFor(status: SyllabusLesson["status"]): string {
	return lessonDotClass[status] ?? lessonDotClass.upcoming;
}

export function LessonStatusBadge({
	status,
}: {
	status: SyllabusLesson["status"];
}) {
	if (status === "done")
		return (
			<Badge variant="success" dot>
				Đã dạy
			</Badge>
		);
	if (status === "current") return <Badge variant="accent">Đang học</Badge>;
	return <Badge variant="muted">Sắp tới</Badge>;
}
