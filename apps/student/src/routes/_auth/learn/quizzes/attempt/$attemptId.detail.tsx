import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import type { QuizAttemptDetail, QuizVerdict } from "@teacher-os/api/contracts";
import { buildQuizParts } from "@teacher-os/api/lib/quiz-parts";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { QuizNavigator } from "@teacher-os/ui/components/quiz/quiz-navigator";
import { QuizPaper } from "@teacher-os/ui/components/quiz/quiz-paper";
import { scrollToQuestion } from "@teacher-os/ui/components/quiz/quiz-question-item";
import { useEffect, useMemo, useState } from "react";
import Loader from "@/components/loader";
import { AttemptReviewError } from "@/components/quiz/attempt-review-error";
import {
	isReadingSplitPane,
	QuizReadingSplitLayout,
} from "@/components/quiz/quiz-reading-layout";
import { cn } from "@/lib/cn";
import { isHttpError, studentQueryClient } from "@/lib/query-client";
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

	// Attempt detail đã mang type từng câu (server resolve fallback
	// prompt.type); promptType ở đây là fallback kép khi payload cũ thiếu.
	const parts = useMemo(
		() =>
			buildQuizParts(
				attempt.questions,
				quizQuery.data?.type ?? "",
				quizQuery.data?.intro ?? "",
			),
		[attempt.questions, quizQuery.data?.type, quizQuery.data?.intro],
	);
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
	const verdicts = useMemo<Record<number, QuizVerdict>>(
		() =>
			Object.fromEntries(
				attempt.questions.map((question, q) => [q, question.verdict]),
			),
		[attempt.questions],
	);

	if (quizQuery.isPending || !quizQuery.data) {
		return <Loader />;
	}

	const navigator = (
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
	);
	// Cùng layout split-pane như take screen — học viên soi bài thấy đúng
	// cấu trúc đã làm (reading + passage).
	const splitPane = isReadingSplitPane(
		quizQuery.data.skill,
		quizQuery.data.passage,
	);

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
			{splitPane ? (
				<QuizReadingSplitLayout
					passage={quizQuery.data.passage}
					navigator={navigator}
				>
					<div className="mx-auto w-full max-w-[720px]">
						<QuizPaper
							detail={quizQuery.data}
							parts={parts}
							answers={answers}
							onAnswer={() => undefined}
							currentQuestion={currentQuestion}
							mode="review"
							review={review}
							hidePassage
						/>
					</div>
				</QuizReadingSplitLayout>
			) : (
				<>
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
					{navigator}
				</>
			)}
		</div>
	);
}
