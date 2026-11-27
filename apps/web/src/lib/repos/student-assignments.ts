import { hasGradableTask } from "@teacher-os/api/lib/ielts-band";
import {
	hasValidGradedBand,
	normalizeObjectiveScore,
} from "@teacher-os/api/lib/objective-score";
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
	/** Class row: ISO datetime hạn nộp (null trên dữ liệu cũ); grading row: null. */
	dueAt: string | null;
	/** class row: từ target.submittedAt; grading row: null. */
	submittedAt: string | null;
	/** class row: true khi đã nộp (`submittedAt != null || attemptId != null`,
	 * gồm cả flip-first); grading row: false. */
	submitted: boolean;
	/** class row: attemptId để mở /grading/$attemptId (null khi chưa nộp); grading row: null. */
	attemptId: string | null;
	/** class row: true nếu bài cần chấm tay (Writing/Speaking/Hybrid); grading row: false. */
	gradable: boolean;
	/** class row: Band tổng IELTS hợp lệ (0–9, bước 0.5) đi kèm gradedAt hợp lệ;
	 * null khi chưa chấm hoặc dữ liệu không hợp lệ; grading row: null. */
	band: number | null;
	/** class row: ISO datetime lần chấm gần nhất đi kèm band hợp lệ;
	 * null khi chưa chấm hoặc dữ liệu không hợp lệ; grading row: null. */
	gradedAt: string | null;
	/** class row: số câu đúng tự chấm hợp lệ (`0 <= correctCount <= totalQuestions`);
	 * null khi chưa nộp hoặc đề không có câu trắc nghiệm; grading row: null. */
	correctCount: number | null;
	/** class row: tổng số câu hỏi tự chấm hợp lệ (`> 0`);
	 * null khi chưa nộp hoặc đề không có câu trắc nghiệm; grading row: null. */
	totalQuestions: number | null;
	/** class row: đề có phần tự luận (Writing/Speaking/hybrid) cần giáo viên chấm;
	 * grading row: false. */
	hasGradableTask: boolean;
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
		const promptGradable =
			typeof ca.hasGradableTask === "boolean"
				? ca.hasGradableTask
				: prompt
					? hasGradableTask(prompt)
					: null;
		for (const target of ca.targets) {
			if (target.studentId !== studentId) continue;
			const attemptId =
				typeof target.attemptId === "string" &&
				target.attemptId.trim().length > 0
					? target.attemptId
					: null;
			const submitted = target.submittedAt !== null || attemptId !== null;
			const hasGrade = submitted && hasValidGradedBand(target);
			const gradable = promptGradable ?? hasGrade;
			const objective = submitted
				? normalizeObjectiveScore(target.correctCount, target.totalQuestions)
				: null;
			rows.push({
				key: `ca:${ca.id}`,
				kind: "class",
				id: ca.id,
				title: ca.title,
				typeLabel,
				className,
				due: ca.due,
				dueAt: ca.dueAt ?? null,
				submittedAt: target.submittedAt,
				submitted,
				attemptId,
				gradable,
				band: hasGrade ? target.band : null,
				gradedAt: hasGrade ? target.gradedAt : null,
				correctCount: objective?.correctCount ?? null,
				totalQuestions: objective?.totalQuestions ?? null,
				hasGradableTask: gradable,
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
			dueAt: null,
			submittedAt: null,
			submitted: false,
			attemptId: null,
			gradable: false,
			band: null,
			gradedAt: null,
			correctCount: null,
			totalQuestions: null,
			hasGradableTask: false,
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
		const rawTx = x.dueAt ? Date.parse(x.dueAt) : Number.POSITIVE_INFINITY;
		const rawTy = y.dueAt ? Date.parse(y.dueAt) : Number.POSITIVE_INFINITY;
		const tx = Number.isNaN(rawTx) ? Number.POSITIVE_INFINITY : rawTx;
		const ty = Number.isNaN(rawTy) ? Number.POSITIVE_INFINITY : rawTy;
		if (tx !== ty) return tx < ty ? -1 : 1;
		return x.key.localeCompare(y.key);
	});
}
