import type { QuizAttemptDetail, QuizVerdict } from "@teacher-os/api/contracts";
import {
	createFileRoute,
	Link,
	redirect,
} from "@tanstack/react-router";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import Loader from "@/components/loader";
import { AttemptReviewError } from "@/components/quiz/attempt-review-error";
import { QuizNavigator } from "@/components/quiz/quiz-navigator";
import { QuizPaper } from "@/components/quiz/quiz-paper";
import { scrollToQuestion } from "@/components/quiz/quiz-question-item";
import { isHttpError, studentQueryClient } from "@/lib/query-client";
import { buildQuizParts } from "@/lib/quiz-parts";
import {
	attemptDetailQueryOptions,
	quizDetailQueryOptions,
	useAttemptDetail,
	useStudentQuizDetail,
} from "@/lib/repos/quiz";

export const Route = createFileRoute(
	"/_auth/learn/quizzes/attempt/$attemptId/detail",
)({
	loader: async ({ params: { attemptId } }) => {
		let attemptDetail: QuizAttemptDetail;
		try {
			attemptDetail = await studentQueryClient.ensureQueryData(
				attemptDetailQueryOptions(attemptId),
			);
		} catch (error) {
			// Cùng gate 409 in_progress (RT#6) với summary — redirect, không
			// render partial. Body 409 không mang assignmentId (xem route cha).
			if (isHttpError(error) && error.status === 409) {
				throw redirect({ to: "/" });
			}
			throw error;
		}
		// Paper chrome (passage/prompt/optionBank/type) từ prompt hiện tại;
		// questions vẫn lấy từ snapshot của attempt — server chấm theo
		// snapshot (RT#3) và GET quiz đã trả questions snapshot khi có attempt.
		await studentQueryClient.ensureQueryData(
			quizDetailQueryOptions(attemptDetail.assignmentId),
		);
	},
	component: AttemptDetailPage,
	errorComponent: AttemptReviewError,
});

function AttemptDetailPage() {
	const { attemptId } = Route.useParams();
	const attemptQuery = useAttemptDetail(attemptId);
	const attempt = attemptQuery.data;

	// Phòng hờ 409 sau refetch — không render partial (RT#6).
	useEffect(() => {
		if (isHttpError(attemptQuery.error) && attemptQuery.error.status === 409) {
			window.location.assign("/");
		}
	}, [attemptQuery.error]);

	if (attemptQuery.isPending || !attempt) {
		return <Loader />;
	}
	return <AttemptDetailScreen attempt={attempt} />;
}

function AttemptDetailScreen({ attempt }: { attempt: QuizAttemptDetail }) {
	const quizQuery = useStudentQuizDetail(attempt.assignmentId);
	const [currentQuestion, setCurrentQuestion] = useState<number | null>(null);

	const parts = useMemo(() => buildQuizParts(attempt.questions), [attempt.questions]);
	const answers = useMemo(
		() =>
			Object.fromEntries(
				attempt.questions.map((question, q) => [q, question.answer ?? ""]),
			),
		[attempt.questions],
	);
	const review = useMemo(
		() =>
			Object.fromEntries(
				attempt.questions.map((question, q) => [
					q,
					{
						verdict: question.verdict,
						key: question.key,
						alts: question.alts,
						answer: question.answer,
						note: attempt.note,
					},
				]),
			),
		[attempt],
	);
	const verdicts = useMemo<Record<string, QuizVerdict>>(
		() =>
			Object.fromEntries(
				attempt.questions.map((question, q) => [q, question.verdict]),
			),
		[attempt.questions],
	);

	if (quizQuery.isPending || !quizQuery.data) {
		return <Loader />;
	}

	return (
		<div className="flex min-h-svh flex-col bg-surface/30">
			<header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-line border-b bg-bg/95 px-4 backdrop-blur">
				<div className="flex min-w-0 items-center gap-2">
					<Link to="/" className={cn(buttonVariants({ variant: "ghost" }))}>
						Thoát
					</Link>
					<Link
						to="/learn/quizzes/attempt/$attemptId"
						params={{ attemptId: attempt.id }}
						aria-label="Quay lại trang kết quả"
						className="rounded-md px-2 py-1 text-accent-blue text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent-blue"
					>
						← Kết quả
					</Link>
					<h1 className="truncate font-display font-semibold text-[15px] tracking-tight">
						{attempt.title}
					</h1>
				</div>
			</header>
			<main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-6">
				<QuizPaper
					detail={quizQuery.data}
					parts={parts}
					answers={answers}
					onAnswer={() => undefined}
					currentQuestion={currentQuestion}
					mode="review"
					review={review}
				/>
			</main>
			<QuizNavigator
				parts={parts}
				answers={answers}
				current={currentQuestion}
				onSelect={(q) => {
					setCurrentQuestion(q);
					scrollToQuestion(q);
				}}
				mode="review"
				verdicts={verdicts}
			/>
		</div>
	);
}
