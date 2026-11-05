import { createFileRoute, redirect } from "@tanstack/react-router";
import {
	attemptSummaryHref,
	QuizTakeError,
	QuizTakeView,
} from "@/components/quiz/quiz-take-view";
import { isHttpError, studentQueryClient } from "@/lib/query-client";
import {
	quizAttemptEssayMirrorKey,
	quizAttemptMirrorKey,
} from "@/lib/quiz-attempt-store";
import type { QuizTakeSource } from "@/lib/repos/quiz";
import { quizDetailQueryOptions } from "@/lib/repos/quiz";

export const Route = createFileRoute("/_auth/learn/quizzes/$assignmentId")({
	loader: async ({ params: { assignmentId } }) => {
		const source: QuizTakeSource = { kind: "assignment", id: assignmentId };
		const detail = await studentQueryClient.ensureQueryData(
			quizDetailQueryOptions(source),
		);
		// Đã nộp (tab khác / lượt vào trước) → thẳng summary, không vào take.
		if (detail.attempt?.status === "submitted") {
			// Mirror của attempt đã đóng là rác — xoá ngay kẻo tích tụ
			// (code-review F6: orphan key sau cross-tab submit).
			try {
				localStorage.removeItem(quizAttemptMirrorKey(detail.attempt.id));
				localStorage.removeItem(quizAttemptEssayMirrorKey(detail.attempt.id));
			} catch {
				// Storage hỏng/blocked — redirect vẫn ưu tiên.
			}
			throw redirect({ href: attemptSummaryHref(detail.attempt.id) });
		}
		// Snapshot answers lúc LOAD — baseline cho resume reconciliation;
		// refetch sau đó không dùng lại (đè answers cục bộ mới hơn của học viên).
		// Đề Writing (#304) autosave vào cột `essay` riêng, không vào map
		// `answers` — resume baseline lấy từ đó với key `0`.
		return {
			serverAnswers:
				detail.skill === "writing"
					? detail.attempt?.essay
						? { "0": detail.attempt.essay }
						: {}
					: (detail.attempt?.answers ?? {}),
			serverEssay: detail.writing ? (detail.attempt?.essay ?? "") : "",
		};
	},
	component: TakeAssignmentPage,
	errorComponent: QuizTakeError,
});

/** Route luồng giao bài — body dùng chung QuizTakeView với route tự luyện. */
function TakeAssignmentPage() {
	const { assignmentId } = Route.useParams();
	const { serverAnswers, serverEssay } = Route.useLoaderData();
	return (
		<QuizTakeView
			source={{ kind: "assignment", id: assignmentId }}
			serverAnswers={serverAnswers}
			serverEssay={serverEssay}
		/>
	);
}
