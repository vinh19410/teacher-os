import type {
	QuizVerdict,
	TeacherAutoSubmission,
} from "@teacher-os/api/contracts";
import { buildQuizPartsFromGroups } from "@teacher-os/api/lib/quiz-parts";
import { AttemptCompactList } from "@teacher-os/ui/components/quiz/attempt-compact-list";
import { AttemptScoreCard } from "@teacher-os/ui/components/quiz/attempt-score-card";
import { QuizNavigator } from "@teacher-os/ui/components/quiz/quiz-navigator";
import { QuizPaper } from "@teacher-os/ui/components/quiz/quiz-paper";
import { scrollToQuestion } from "@teacher-os/ui/components/quiz/quiz-question-item";
import type { QuizReviewInfo } from "@teacher-os/ui/components/quiz/quiz-review-item";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { gradingAudioUrl } from "@/lib/repos/grading";

const TEACHER_ANSWER_LABEL = "Học viên trả lời";

/**
 * Hiển thị bài làm tự chấm (Reading / Listening / Grammar / Vocabulary) ở chế
 * độ chỉ đọc trên /grading/$attemptId (#978): paper + đáp án học viên + đáp
 * án đúng + giải thích, thẻ tổng điểm, bảng đáp án compact và audio/transcript
 * (Listening).
 */
export function AutoSubmissionView({
	submission,
}: {
	submission: TeacherAutoSubmission;
}) {
	const [currentQuestion, setCurrentQuestion] = useState<number | null>(null);
	const [audioError, setAudioError] = useState(false);
	const [audioRetry, setAudioRetry] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset local state when viewing a different attempt
	useEffect(() => {
		setCurrentQuestion(null);
		setAudioError(false);
		setAudioRetry(0);
	}, [submission.attemptId]);

	const hasAudio = submission.detail.hasAudio === true;
	const baseAudioSrc = hasAudio ? gradingAudioUrl(submission.attemptId) : null;
	const audioSrc = baseAudioSrc
		? audioRetry > 0
			? `${baseAudioSrc}?retry=${audioRetry}`
			: baseAudioSrc
		: null;

	const parts = useMemo(
		() =>
			buildQuizPartsFromGroups(
				submission.questions,
				submission.groups,
				submission.detail.type,
				submission.detail.intro,
			),
		[
			submission.questions,
			submission.groups,
			submission.detail.type,
			submission.detail.intro,
		],
	);

	const answers = useMemo(
		() =>
			Object.fromEntries(
				submission.questions.map((question, index) => [
					index,
					question.answer ?? "",
				]),
			),
		[submission.questions],
	);

	const review = useMemo<Record<number, QuizReviewInfo>>(
		() =>
			Object.fromEntries(
				submission.questions.map((question, index) => [
					index,
					{
						verdict: question.verdict,
						key: question.key,
						alts: question.alts,
						answer: question.answer,
						note: submission.detail.note,
						answerLabel: TEACHER_ANSWER_LABEL,
						selectedMarkLabel: "Học viên chọn",
						...(question.explanation
							? { explanation: question.explanation }
							: {}),
					},
				]),
			),
		[submission.questions, submission.detail.note],
	);

	const verdicts = useMemo<Record<number, QuizVerdict>>(
		() =>
			Object.fromEntries(
				submission.questions.map((question, index) => [
					index,
					question.verdict,
				]),
			),
		[submission.questions],
	);

	return (
		<div
			data-testid="auto-submission-view"
			className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start"
		>
			<div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
				<Card className="min-w-0 overflow-hidden p-4 sm:p-6">
					<QuizPaper
						detail={submission.detail}
						parts={parts}
						answers={answers}
						onAnswer={() => undefined}
						currentQuestion={currentQuestion}
						mode="review"
						review={review}
						audioSrc={audioSrc}
						audioCrossOrigin="use-credentials"
						audioError={audioError}
						onAudioError={() => setAudioError(true)}
						onAudioRetry={() => {
							setAudioError(false);
							setAudioRetry((count) => count + 1);
						}}
						transcript={submission.transcript}
					/>
				</Card>
				<div className="overflow-hidden rounded-xl border bg-card [&>footer]:static [&>footer]:border-t-0">
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
			</div>
			<aside className="order-1 flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:order-2">
				<AttemptScoreCard
					correctCount={submission.correctCount}
					wrongCount={submission.wrongCount}
					skippedCount={submission.skippedCount}
					totalCount={submission.totalCount}
				/>
				<AttemptCompactList items={submission.items} />
			</aside>
		</div>
	);
}
