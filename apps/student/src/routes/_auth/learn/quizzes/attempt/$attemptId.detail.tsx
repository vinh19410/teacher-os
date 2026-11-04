import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import type { QuizAttemptDetail, QuizVerdict } from "@teacher-os/api/contracts";
import { buildQuizParts } from "@teacher-os/api/lib/quiz-parts";
import { countWords } from "@teacher-os/api/lib/word-count";
import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { EssayWithHighlights } from "@teacher-os/ui/components/quiz/essay-with-highlights";
import { QuizNavigator } from "@teacher-os/ui/components/quiz/quiz-navigator";
import { QuizPaper } from "@teacher-os/ui/components/quiz/quiz-paper";
import { scrollToQuestion } from "@teacher-os/ui/components/quiz/quiz-question-item";
import {
	isReadingSplitPane,
	QuizReadingSplitLayout,
} from "@teacher-os/ui/components/quiz/quiz-reading-layout";
import { useEffect, useMemo, useState } from "react";
import Loader from "@/components/loader";
import { AttemptGradeCard } from "@/components/quiz/attempt-grade-card";
import { AttemptReviewError } from "@/components/quiz/attempt-review-error";
import { cn } from "@/lib/cn";
import { isHttpError, studentQueryClient } from "@/lib/query-client";
import {
	attemptDetailQueryOptions,
	type QuizTakeSource,
	quizDetailQueryOptions,
	useAttemptDetail,
	useStudentQuizDetail,
} from "@/lib/repos/quiz";

/** Nguồn chrome paper cho review: cặp `practice`/`testId` khi là lượt tự
 * luyện (#378), mặc định là lượt giao bài theo `assignmentId`. */
function attemptTakeSource(
	attempt: Pick<QuizAttemptDetail, "assignmentId" | "practice" | "testId">,
): QuizTakeSource {
	return attempt.practice === true && attempt.testId
		? { kind: "practice", testId: attempt.testId }
		: { kind: "assignment", id: attempt.assignmentId };
}

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
		// Lượt tự luyện (#378) lấy chrome từ route practice qua testId.
		await studentQueryClient.ensureQueryData(
			quizDetailQueryOptions(attemptTakeSource(attemptDetail)),
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
	const quizQuery = useStudentQuizDetail(attemptTakeSource(attempt));
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
	// Đề Writing (#304): bài nộp nằm ở `essay` (không phải answers map) —
	// inject key "0" để nhánh Writing của QuizPaper review hiện đúng bài đã
	// nộp thay vì textarea trống khi học viên mở thẳng URL .../detail.
	const reviewAnswers = useMemo(
		() =>
			attempt.questions.length === 0 && attempt.essay != null
				? { ...answers, 0: attempt.essay }
				: answers,
		[answers, attempt.essay, attempt.questions.length],
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
						// #358: giải thích riêng của câu (chỉ có sau nộp) — review
						// item ưu tiên field này, fallback note chung của đề.
						...(question.explanation
							? { explanation: question.explanation }
							: {}),
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
			answers={reviewAnswers}
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

	const hybridWriting = attempt.writing ?? quizQuery.data.writing ?? null;
	const showHybridWritingReview =
		hybridWriting !== null ||
		(attempt.questions.length > 0 && attempt.essay != null);
	const hybridEssay = attempt.essay ?? "";
	const hybridGrade = attempt.grade ?? null;
	const hybridReviewSection = showHybridWritingReview ? (
		<section
			aria-labelledby="detail-hybrid-writing-heading"
			className="mt-8 flex flex-col gap-3 border-border border-t pt-6"
			data-testid="detail-hybrid-writing-section"
		>
			<h2 id="detail-hybrid-writing-heading" className="font-semibold">
				Phần 2 · Writing
				{hybridWriting
					? ` (${hybridWriting.part === "task1" ? "Task 1" : "Task 2"})`
					: ""}
			</h2>
			{hybridWriting && !isEmptyRichText(hybridWriting.prompt) && (
				<RichTextBody
					text={hybridWriting.prompt}
					className="text-sm leading-[1.55]"
				/>
			)}
			<p className="font-mono text-muted-foreground text-sm">
				{countWords(hybridEssay)} từ
			</p>
			<div className="whitespace-pre-wrap border-border border-l-2 pl-5 text-lg leading-[1.9]">
				{hybridEssay.trim() === "" ? (
					<span className="text-muted-foreground">Bạn đã nộp bài trống.</span>
				) : (
					<EssayWithHighlights
						essay={hybridEssay}
						annotations={attempt.annotations ?? []}
						inlineNotes
					/>
				)}
			</div>
			{hybridGrade ? (
				<AttemptGradeCard
					grade={hybridGrade}
					skill="writing"
					part={attempt.part ?? hybridWriting?.part ?? ""}
				/>
			) : (
				<p className="text-muted-foreground text-sm">
					Giáo viên sẽ chấm bài viết của bạn.
				</p>
			)}
		</section>
	) : null;
	return (
		<div className="flex min-h-svh flex-col bg-muted/30">
			<header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-border border-b bg-background/95 px-4 backdrop-blur">
				<div className="flex min-w-0 items-center gap-2">
					<Link to="/" className={cn(buttonVariants({ variant: "ghost" }))}>
						Thoát
					</Link>
					<Link
						to="/learn/quizzes/attempt/$attemptId"
						params={{ attemptId: attempt.id }}
						aria-label="Quay lại trang kết quả"
						className="rounded-md px-2 py-1 text-primary text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-hot"
					>
						← Kết quả
					</Link>
					<h1 className="truncate font-semibold text-[15px] tracking-tight">
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
							answers={reviewAnswers}
							onAnswer={() => undefined}
							currentQuestion={currentQuestion}
							mode="review"
							review={review}
							hidePassage
						/>
						{hybridReviewSection}
					</div>
				</QuizReadingSplitLayout>
			) : (
				<>
					<main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-6">
						<QuizPaper
							detail={quizQuery.data}
							parts={parts}
							answers={reviewAnswers}
							onAnswer={() => undefined}
							currentQuestion={currentQuestion}
							mode="review"
							review={review}
						/>
						{hybridReviewSection}
					</main>
					{navigator}
				</>
			)}
		</div>
	);
}
