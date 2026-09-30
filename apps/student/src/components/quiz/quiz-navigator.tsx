import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
	countAnswered,
	isAnsweredValue,
	type QuizPart,
} from "@/lib/quiz-parts";

export function QuizNavigator({
	parts,
	answers,
	current,
	onSelect,
}: {
	parts: QuizPart[];
	/** Answers học viên keyed theo `q` — quyết định fill của nút số câu. */
	answers: Record<number, string>;
	/** Câu hiện đang highlight (null = chưa chọn câu nào). */
	current: number | null;
	onSelect: (q: number) => void;
}) {
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

	return (
		<footer className="sticky bottom-0 z-20 border-line border-t bg-bg/95 backdrop-blur">
			<div className="mx-auto w-full max-w-[720px] px-4 py-3">
				<p
					role="status"
					data-testid="navigator-progress"
					aria-live="polite"
					className="mb-2 text-[13px] text-muted-fg"
				>
					Đã trả lời {answeredCount}/{allQuestions.length} câu
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
							return (
								<button
									type="button"
									key={question.q}
									data-question={question.q}
									data-answered={answered}
									aria-label={`Câu ${question.number}${answered ? " — đã trả lời" : " — chưa trả lời"}`}
									aria-current={isCurrent ? "true" : undefined}
									onClick={() => onSelect(question.q)}
									className={cn(
										"flex size-9 items-center justify-center rounded-md border font-mono text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-accent-blue",
										answered
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
