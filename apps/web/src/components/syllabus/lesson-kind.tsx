import { Badge } from "@/components/ui/badge";
import type { SyllabusLesson, SyllabusLessonKind } from "@/lib/mock-data";

const LESSON_KINDS: readonly SyllabusLessonKind[] = [
	"lesson",
	"midterm",
	"final",
];

/**
 * Nguồn sự thật duy nhất cho điều kiện "buổi thi" — badge và row tint ở
 * syllabus detail cùng dùng để kind lạ/undefined không bao giờ highlight
 * (fallback pattern `lessonDotClassFor`, issue #154).
 */
export function isTestSessionKind(
	kind: SyllabusLesson["kind"] | undefined,
): kind is "midterm" | "final" {
	return kind === "midterm" || kind === "final";
}

/** Giá trị lạ → null (không crash, không nhãn); lesson thường → null. */
export function lessonKindLabel(kind: SyllabusLesson["kind"]): string | null {
	if (!LESSON_KINDS.includes(kind)) return null;
	const labels: Record<SyllabusLessonKind, string | null> = {
		lesson: null,
		midterm: "Thi giữa kỳ",
		final: "Thi cuối kỳ",
	};
	return labels[kind];
}

/** Badge warn cho buổi thi; buổi thường/kind lạ → không render gì. */
export function LessonKindBadge({ kind }: { kind: SyllabusLesson["kind"] }) {
	if (!isTestSessionKind(kind)) return null;
	return (
		<Badge variant="warn" dot>
			{lessonKindLabel(kind)}
		</Badge>
	);
}
