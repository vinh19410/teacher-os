import type { QuizVerdict } from "@teacher-os/api/contracts";
import type { QuizGrade } from "@teacher-os/api/lib/grade-quiz";
import { buildQuizParts } from "@teacher-os/api/lib/quiz-parts";
import { AttemptCompactList } from "@teacher-os/ui/components/quiz/attempt-compact-list";
import { AttemptScoreCard } from "@teacher-os/ui/components/quiz/attempt-score-card";
import { QuizNavigator } from "@teacher-os/ui/components/quiz/quiz-navigator";
import { QuizPaper } from "@teacher-os/ui/components/quiz/quiz-paper";
import { scrollToQuestion } from "@teacher-os/ui/components/quiz/quiz-question-item";
import type { QuizReviewInfo } from "@teacher-os/ui/components/quiz/quiz-review-item";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { QuizSimulation } from "@/lib/assignment-quiz-sim";

/**
 * Tab "Làm thử & Soi bài" của trang preview giáo viên (#285) — thuần
 * presentational: state (answers/grade) sống ở route qua `useQuizSimulation`
 * nên component này unmount khi đổi tab vẫn không mất bài làm. Take render
 * từ `sim.takeQuestions` (đã strip key); review chỉ xuất hiện sau "nộp" và
 * chấm client-side bằng `gradeQuiz` với `sim.fullQuestions` (full key) —
 * giáo viên là chủ sở hữu đề nên review lộ key là hành vi đúng.
 */
export function PreviewQuizSimulation({
	sim,
	answers,
	grade,
	onAnswer,
	onSubmit,
	onReset,
}: {
	sim: QuizSimulation;
	answers: Record<number, string>;
	grade: QuizGrade | null;
	onAnswer: (q: number, value: string) => void;
	onSubmit: () => void;
	onReset: () => void;
}) {
	// sim được dựng lại mỗi render ở route nên memo theo identity không bao giờ
	// hit — buildQuizParts là map thuần rẻ, gọi trực tiếp cho đúng. Type prompt
	// từ paper chrome của sim làm fallback cho câu chưa khai type riêng; intro
	// truyền vào để instruction theo cụm Questions X–Y hiển thị như take (#301).
	const parts = buildQuizParts(
		sim.takeQuestions,
		sim.detail.type,
		sim.detail.intro,
	);
	const [currentQuestion, setCurrentQuestion] = useState<number | null>(null);
	const selectQuestion = (q: number) => {
		setCurrentQuestion(q);
		scrollToQuestion(q);
	};

	if (grade) {
		// Review — mirror composition của detail route student: score card +
		// compact list + paper mode review (inputs disabled qua fieldset) +
		// navigator theo verdict. Note đề dùng chung cho mọi câu (prompt-level).
		const perQuestion = sim.fullQuestions.map((question, q) => ({
			verdict: grade.verdicts[q] ?? "skipped",
			key: question.answer,
			alts: question.alts,
			answer: answers[q]?.trim() ? (answers[q] as string) : null,
			...(question.explanation ? { explanation: question.explanation } : {}),
		}));
		const review = Object.fromEntries(
			perQuestion.map((info, q): [number, QuizReviewInfo] => [
				q,
				{ ...info, note: sim.note },
			]),
		);
		const verdicts = Object.fromEntries(
			grade.verdicts.map((verdict, q): [number, QuizVerdict] => [q, verdict]),
		);
		const items = perQuestion.map(({ verdict, key, answer }) => ({
			verdict,
			key,
			answer,
		}));
		return (
			<div className="flex flex-col gap-5">
				<AttemptScoreCard
					correctCount={grade.correctCount}
					wrongCount={grade.wrongCount}
					skippedCount={grade.skippedCount}
					totalCount={grade.totalCount}
					action={
						<Button variant="secondary" className="mt-5" onClick={onReset}>
							Làm lại
						</Button>
					}
				/>
				<AttemptCompactList items={items} />
				<QuizPaper
					detail={sim.detail}
					parts={parts}
					answers={answers}
					onAnswer={() => undefined}
					currentQuestion={currentQuestion}
					mode="review"
					review={review}
				/>
				<QuizNavigator
					parts={parts}
					answers={answers}
					current={currentQuestion}
					onSelect={selectQuestion}
					mode="review"
					verdicts={verdicts}
				/>
			</div>
		);
	}

	// Take — như học viên: paper interactive + navigator + nộp bài.
	const allQuestions = parts.flatMap((part) => part.questions);
	const answeredCount = allQuestions.filter(({ q }) =>
		(answers[q] ?? "").trim(),
	).length;
	return (
		<div className="flex flex-col gap-5">
			<QuizPaper
				detail={sim.detail}
				parts={parts}
				answers={answers}
				onAnswer={onAnswer}
				currentQuestion={currentQuestion}
			/>
			<div className="flex items-center justify-between gap-3">
				<span className="text-muted-foreground text-xs">
					Bản mô phỏng — bài làm không được lưu.
				</span>
				<Button onClick={onSubmit}>
					Nộp bài ({answeredCount}/{allQuestions.length} câu)
				</Button>
			</div>
			<QuizNavigator
				parts={parts}
				answers={answers}
				current={currentQuestion}
				onSelect={selectQuestion}
			/>
		</div>
	);
}
