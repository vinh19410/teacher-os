import { useEffect, useState } from "react";
import type { QuizVerdict } from "@teacher-os/api/contracts";
import { cn } from "@/lib/cn";
import {
	countAnswered,
	isAnsweredValue,
	type QuizPart,
} from "@/lib/quiz-parts";

/** Nút số câu tô màu theo verdict (review mode) thay vì theo answered. */
const VERDICT_BUTTON_CLASSES: Record<QuizVerdict, string> = {
	correct: "border-success/40 bg-success-soft text-success",
	wrong: "border-danger/40 bg-danger-soft text-danger",
	skipped: "border-line bg-surface text-muted-fg",
};

const VERDICT_ARIA_LABELS: Record<QuizVerdict, string> = {
	correct: "đúng",
	wrong: "sai",
	skipped: "bỏ qua",
};

export function QuizNavigator({
	parts,
	answers,
	current,
	onSelect,
	mode = "take",
	verdicts,
}: {
	parts: QuizPart[];
	/** Answers học viên keyed theo `q` — quyết định fill của nút số câu. */
	answers: Record<number, string>;
	/** Câu hiện đang highlight (null = chưa chọn câu nào). */
	current: number | null;
	onSelect: (q: number) => void;
	/** review = chấm xong: màu nút theo `verdicts`, status line đếm verdict. */
	mode?: "take" | "review";
	/** Verdict theo `q` (0-based) từ detail payload — bắt buộc khi review. */
	verdicts?: Record<number, QuizVerdict>;
}) {
	const reviewMode = mode === "review";
	const [activePartIndex, setActivePartIndex] = useState(0);
	const currentPartIndex = parts.findIndex((part) =>
		part.questions.some((question) => question.q === current),
	);
	useEffect(() => {
		if (currentPartIndex >= 0) setActivePartIndex(currentPartIndex);
	}, [currentPartIndex]);
	const safeActiveIndex = activePartIndex < parts.length ? activePartIndex : 0;
	const activePart = parts[safeActiveIndex];
	const allQuestions = parts.flatMap((part) => part.questions);
	const answeredCount = countAnswered(answers, allQuestions);
	const verdictCount = (verdict: QuizVerdict): number =>
		allQuestions.filter((question) => verdicts?.[question.q] === verdict)
			.length;

	return (
		<footer className="sticky bottom-0 z-20 border-line border-t bg-bg/95 backdrop-blur">
			<div className="mx-auto w-full max-w-[720px] px-4 py-3">
				<p
					role="status"
					data-testid="navigator-progress"
					aria-live="polite"
					className="mb-2 text-[13px] text-muted-fg"
				>
					{reviewMode
						? `Đúng ${verdictCount("correct")} câu · Sai ${verdictCount("wrong")} · Bỏ qua ${verdictCount("skipped")}`
						: `Đã trả lời ${answeredCount}/${allQuestions.length} câu`}
				</p>
				{parts.length > 1 && (
					<div
						role="tablist"
						aria-label="Các phần của đề"
						className="mb-2 flex flex-wrap gap-1.5"
					>
						{parts.map((part, index) => (
							<button
								type="button"
								key={part.id}
								role="tab"
								aria-selected={index === safeActiveIndex}
								onClick={() => {
									setActivePartIndex(index);
									const first = part.questions[0];
									if (first) onSelect(first.q);
								}}
								className={cn(
									"rounded-md border px-2.5 py-1 font-medium text-xs transition-colors",
									index === safeActiveIndex
										? "border-accent-blue bg-accent-soft text-accent-blue"
										: "border-line bg-surface text-muted-fg hover:border-fg-2",
								)}
							>
								{part.label}
							</button>
						))}
					</div>
				)}
				{activePart && (
					<div className="flex flex-wrap gap-1.5">
						{activePart.questions.map((question) => {
							const answered = isAnsweredValue(answers[question.q]);
							const isCurrent = current === question.q;
							const verdict = reviewMode
								? (verdicts?.[question.q] ?? null)
								: null;
							return (
								<button
									type="button"
									key={question.q}
									data-question={question.q}
									data-answered={answered}
									data-verdict={verdict ?? undefined}
									aria-label={`Câu ${question.number}${
										verdict
											? ` — ${VERDICT_ARIA_LABELS[verdict]}`
											: answered
												? " — đã trả lời"
												: " — chưa trả lời"
									}`}
									aria-current={isCurrent ? "true" : undefined}
									onClick={() => onSelect(question.q)}
									className={cn(
										"flex size-9 items-center justify-center rounded-md border font-mono text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-accent-blue",
										verdict
											? VERDICT_BUTTON_CLASSES[verdict]
											: answered
												? "border-transparent bg-primary text-primary-foreground"
												: "border-line bg-surface text-fg hover:border-fg-2",
										isCurrent &&
											"outline-2 outline-accent-blue outline-offset-1",
									)}
								>
									{question.number}
								</button>
							);
						})}
					</div>
				)}
			</div>
		</footer>
	);
}
