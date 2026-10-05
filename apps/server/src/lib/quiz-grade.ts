import {
	type QuizAttemptGrade,
	speakingGradeScoresSchema,
	writingGradeScoresSchema,
} from "@teacher-os/api/contracts";
import {
	type GradableSkill,
	ieltsOverallBand,
} from "@teacher-os/api/lib/ielts-band";

/** Cột grade_* → wire; null khi chưa chấm (thiếu scores hoặc gradedAt). */
export function toQuizAttemptGrade(row: {
	gradeScores: Record<string, number> | null;
	gradeFeedback: string;
	gradedAt: Date | null;
}): QuizAttemptGrade | null {
	if (!row.gradeScores || !row.gradedAt) return null;
	const values = Object.values(row.gradeScores);
	if (values.length === 0) return null;
	return {
		scores: row.gradeScores,
		band: ieltsOverallBand(values),
		feedback: row.gradeFeedback,
		gradedAt: row.gradedAt.toISOString(),
	};
}

/** Scores đúng bộ 4 tiêu chí của skill (strict) — null nếu sai. */
export function parseGradeScores(
	skill: GradableSkill,
	scores: unknown,
): Record<string, number> | null {
	const schema =
		skill === "writing" ? writingGradeScoresSchema : speakingGradeScoresSchema;
	const parsed = schema.safeParse(scores);
	return parsed.success ? parsed.data : null;
}
