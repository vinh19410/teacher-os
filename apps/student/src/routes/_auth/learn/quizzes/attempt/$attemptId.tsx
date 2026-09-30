import {
	createFileRoute,
	Outlet,
	redirect,
	useChildMatches,
} from "@tanstack/react-router";
import { useEffect } from "react";
import Loader from "@/components/loader";
import { AttemptCompactList } from "@/components/quiz/attempt-compact-list";
import { AttemptReviewError } from "@/components/quiz/attempt-review-error";
import { AttemptScoreCard } from "@/components/quiz/attempt-score-card";
import { QuizRuntimeHeader } from "@/components/quiz/quiz-runtime-header";
import { isHttpError, studentQueryClient } from "@/lib/query-client";
import { formatAttemptDuration, formatVietnamSubmittedAt } from "@/lib/attempt-format";
import {
	attemptSummaryQueryOptions,
	useAttemptSummary,
} from "@/lib/repos/quiz";

export const Route = createFileRoute(
	"/_auth/learn/quizzes/attempt/$attemptId",
)({
	loader: async ({ params: { attemptId } }) => {
		try {
			await studentQueryClient.ensureQueryData(
				attemptSummaryQueryOptions(attemptId),
			);
		} catch (error) {
			// 409 = attempt còn in_progress (RT#6) — không render partial. Body
			// 409 không mang assignmentId nên không dựng được URL take screen;
			// overview là điểm hạ cánh an toàn (row bài tập dẫn về take).
			if (isHttpError(error) && error.status === 409) {
				throw redirect({ to: "/" });
			}
			throw error;
		}
	},
	component: AttemptRouteView,
	errorComponent: AttemptReviewError,
});

/**
 * Route cha của .../detail — URL summary vẽ màn kết quả, URL .../detail nhả
 * Outlet cho route con (màn soi chi tiết) tự vẽ.
 */
function AttemptRouteView() {
	const hasChildMatch = useChildMatches().length > 0;
	if (hasChildMatch) return <Outlet />;
	return <AttemptSummaryPage />;
}

function AttemptSummaryPage() {
	const { attemptId } = Route.useParams();
	const summaryQuery = useAttemptSummary(attemptId);
	const summary = summaryQuery.data;

	// Phòng hờ: refetch trả 409 (domain không cho submitted quay lại
	// in_progress, nhưng không render partial theo RT#6).
	useEffect(() => {
		if (isHttpError(summaryQuery.error) && summaryQuery.error.status === 409) {
			window.location.assign("/");
		}
	}, [summaryQuery.error]);

	if (summaryQuery.isPending || !summary) {
		return <Loader />;
	}

	const duration = formatAttemptDuration(
		summary.startedAt,
		summary.submittedAt,
	);

	return (
		<div className="flex min-h-svh flex-col bg-surface/30">
			<QuizRuntimeHeader
				title={summary.title}
				saveState={null}
				onSubmitClick={null}
			/>
			<main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-6">
				<p className="text-muted-fg text-sm">
					Bạn đã nộp bài lúc{" "}
					<span className="font-medium text-fg">
						{formatVietnamSubmittedAt(summary.submittedAt)}
					</span>
					{duration && (
						<>
							{" · hoàn thành trong "}
							<span className="font-medium text-fg">{duration}</span>
						</>
					)}
					.
				</p>

				<div className="mt-4">
					<AttemptScoreCard
						correctCount={summary.correctCount}
						wrongCount={summary.wrongCount}
						skippedCount={summary.skippedCount}
						totalCount={summary.totalCount}
						attemptId={attemptId}
					/>
				</div>

				<h2 className="mt-6 mb-2 font-display font-semibold text-fg">
					Bảng đáp án
				</h2>
				<AttemptCompactList items={summary.items} />
			</main>
		</div>
	);
}
