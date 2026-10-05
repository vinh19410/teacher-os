import { SKILLS } from "@/components/assignments/assignment-presets";
import type { KernelHydratedData, Scores } from "@/lib/mock-data";

export interface StudentAssignmentRow {
	/** React key ổn định: `ca:<classAssignmentId>` | `grading:<assignmentId>`. */
	key: string;
	kind: "class" | "grading";
	id: string;
	title: string;
	/** Cột "Loại": class row = tên skill từ prompt (null khi prompt/skill không
	 * tra được); grading row = legacy `type` (null khi rỗng). */
	typeLabel: string | null;
	/** Tên lớp chứa bài giao; "" khi class không tra được hoặc là grading row. */
	className: string;
	/** Class row: ISO yyyy-mm-dd. Grading row có thể "" hoặc định dạng legacy
	 * (vd "20/08") — bảng `assignment` không có contract ISO. */
	due: string;
	/** class row: từ target.submittedAt; grading row: null. */
	submittedAt: string | null;
	/** grading row: "graded" | "late" | "not-submitted"; class row: null. */
	gradingStatus: string | null;
	scores: Scores | null;
}

/** id → tên skill, lookup strict: id lạ (skill ngoài catalog) → undefined,
 * không fallback im lặng như `skillOf`. */
const SKILL_LABELS = new Map<string, string>(
	SKILLS.map((skill) => [skill.id as string, skill.name]),
);

const ISO_DUE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mọi bài tập của một học viên, merge cả hai nguồn (#317):
 * - class row: mỗi `class_assignment_target` khớp `studentId` (flow giao bài
 *   #208; liên kết thẳng student, không qua enrollment — parity với student
 *   portal `student.ts`)
 * - grading row: legacy `assignment` theo `sid` (dữ liệu lịch sử, frozen)
 * Sort theo `due` ISO tăng dần (hạn gần nhất lên đầu); `due` rỗng/không ISO
 * (grading legacy) xuống cuối; tie-break bằng `key`.
 */
export function studentAssignmentRows(
	data: Pick<
		KernelHydratedData,
		"assignments" | "classAssignments" | "classes" | "assignmentPrompts"
	>,
	studentId: string,
): StudentAssignmentRow[] {
	const rows: StudentAssignmentRow[] = [];

	for (const ca of data.classAssignments) {
		const prompt = data.assignmentPrompts.find((p) => p.id === ca.promptId);
		const typeLabel = prompt?.skill
			? (SKILL_LABELS.get(prompt.skill) ?? null)
			: null;
		const className = data.classes.find((c) => c.id === ca.classId)?.name ?? "";
		for (const target of ca.targets) {
			if (target.studentId !== studentId) continue;
			rows.push({
				key: `ca:${ca.id}`,
				kind: "class",
				id: ca.id,
				title: ca.title,
				typeLabel,
				className,
				due: ca.due,
				submittedAt: target.submittedAt,
				gradingStatus: null,
				scores: null,
			});
		}
	}

	for (const a of data.assignments) {
		if (a.sid !== studentId) continue;
		rows.push({
			key: `grading:${a.id}`,
			kind: "grading",
			id: a.id,
			title: a.title,
			typeLabel: a.type === "" ? null : a.type,
			className: "",
			due: a.due,
			submittedAt: null,
			gradingStatus: a.status,
			scores: a.scores,
		});
	}

	return rows.sort((x, y) => {
		const dx = ISO_DUE.test(x.due) ? x.due : null;
		const dy = ISO_DUE.test(y.due) ? y.due : null;
		if (dx === null && dy === null) return x.key.localeCompare(y.key);
		if (dx === null) return 1;
		if (dy === null) return -1;
		if (dx !== dy) return dx < dy ? -1 : 1;
		return x.key.localeCompare(y.key);
	});
}
