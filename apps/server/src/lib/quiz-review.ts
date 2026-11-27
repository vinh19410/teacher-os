import {
	type AssignmentQuestion,
	type QuizAttemptItem,
	type StudentQuizGroup,
	studentQuizGroupSchema,
	type TeacherAutoSubmissionQuestion,
} from "@teacher-os/api/contracts";
import {
	gradeQuiz,
	type QuizGrade,
	resolveSummaryAnswerKeys,
} from "@teacher-os/api/lib/grade-quiz";
import { inferQuestionTypes } from "@teacher-os/api/lib/infer-question-types";

export function parseStudentQuizGroups(
	raw: string | null | undefined,
): StudentQuizGroup[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		const checked = studentQuizGroupSchema.array().safeParse(parsed);
		return checked.success ? checked.data : [];
	} catch {
		return [];
	}
}

export function buildQuizReviewEvaluation(input: {
	questions: AssignmentQuestion[];
	answers: Record<string, string>;
	promptType: string;
	isPractice: boolean;
}): {
	grade: QuizGrade;
	items: QuizAttemptItem[];
	questions: TeacherAutoSubmissionQuestion[];
} {
	const gradingPromptType = input.isPractice
		? undefined
		: input.promptType || undefined;
	const grade = gradeQuiz(input.questions, input.answers, {
		promptType: gradingPromptType,
	});
	const summaryKeys = resolveSummaryAnswerKeys(input.questions, {
		promptType: gradingPromptType,
	});
	const detailPromptType = input.isPractice ? "" : input.promptType;
	const effectiveTypes = inferQuestionTypes(input.questions, detailPromptType);

	const items: QuizAttemptItem[] = input.questions.map((question, index) => {
		const given = input.answers[String(index)];
		return {
			verdict: grade.verdicts[index] ?? "skipped",
			key: summaryKeys[index] ?? question.answer,
			answer: given !== undefined && given.trim().length > 0 ? given : null,
		};
	});

	const questions: TeacherAutoSubmissionQuestion[] = input.questions.map(
		(question, index) => {
			const given = input.answers[String(index)];
			return {
				stem: question.stem,
				opts: question.opts,
				type: effectiveTypes[index] ?? detailPromptType,
				pin: question.pin ?? null,
				...(question.answerSet ? { answerSet: question.answerSet } : {}),
				key: question.answer,
				alts: question.alts,
				verdict: grade.verdicts[index] ?? "skipped",
				answer: given !== undefined && given.trim().length > 0 ? given : null,
				...(question.explanation ? { explanation: question.explanation } : {}),
			};
		},
	);

	return { grade, items, questions };
}
