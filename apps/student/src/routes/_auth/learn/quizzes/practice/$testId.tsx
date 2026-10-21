import { createFileRoute, redirect } from "@tanstack/react-router";
import {
	attemptSummaryHref,
	QuizTakeError,
	QuizTakeView,
} from "@/components/quiz/quiz-take-view";
import { studentQueryClient } from "@/lib/query-client";
import { quizAttemptMirrorKey } from "@/lib/quiz-attempt-store";
import { type QuizTakeSource, quizDetailQueryOptions } from "@/lib/repos/quiz";

export const Route = createFileRoute("/_auth/learn/quizzes/practice/$testId")({
	loader: async ({ params: { testId } }) => {
		// Cùng luồng với route giao bài — chỉ nguồn đề khác (practice #378).
		const source: QuizTakeSource = { kind: "practice", testId };
		const detail = await studentQueryClient.ensureQueryData(
			quizDetailQueryOptions(source),
		);
		// Lượt đang làm đã nộp ở tab khác → thẳng summary. Practice làm lại
		// được nên KHÔNG redirect khi chưa có lượt in_progress (attempt null).
		if (detail.attempt?.status === "submitted") {
			try {
				localStorage.removeItem(quizAttemptMirrorKey(detail.attempt.id));
			} catch {
				// Storage hỏng/blocked — redirect vẫn ưu tiên.
			}
			throw redirect({ href: attemptSummaryHref(detail.attempt.id) });
		}
		return {
			serverAnswers:
				detail.skill === "writing"
					? detail.attempt?.essay
						? { "0": detail.attempt.essay }
						: {}
					: (detail.attempt?.answers ?? {}),
		};
	},
	component: TakePracticePage,
	errorComponent: QuizTakeError,
});

function TakePracticePage() {
	const { testId } = Route.useParams();
	const { serverAnswers } = Route.useLoaderData();
	return (
		<QuizTakeView
			source={{ kind: "practice", testId }}
			serverAnswers={serverAnswers}
		/>
	);
}
