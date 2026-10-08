import type { QuizVerdict } from "@teacher-os/api/contracts";
import {
	countAnswered,
	isAnsweredValue,
	type QuizPart,
} from "@teacher-os/api/lib/quiz-parts";
import { cn } from "@teacher-os/ui/lib/utils";

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

/**
 * Thanh điều hướng câu hỏi: một dải phẳng chứa toàn bộ nút số câu theo thứ
 * tự (flex-wrap, trái → phải), trải full chiều ngang của vùng chứa — không
 * chia tab theo nhóm câu. Dưới lg, đề dài bị giới hạn 30svh và cuộn nội bộ
 * để không chiếm quá nửa màn hình điện thoại; từ lg trở lên hiện đủ.
 */
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
	const allQuestions = parts.flatMap((part) => part.questions);
	const answeredCount = countAnswered(answers, allQuestions);
	const verdictCount = (verdict: QuizVerdict): number =>
		allQuestions.filter((question) => verdicts?.[question.q] === verdict)
			.length;

	return (
		<footer className="sticky bottom-0 z-20 max-h-[30svh] overflow-y-auto border-line border-t bg-bg/95 backdrop-blur lg:max-h-none lg:overflow-visible">
			<div className="w-full px-4 py-3">
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
				<div className="flex flex-wrap gap-1.5">
					{allQuestions.map((question) => {
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
									"flex size-9 items-center justify-center rounded-md border font-mono text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-hot",
									verdict
										? VERDICT_BUTTON_CLASSES[verdict]
										: answered
											? "border-transparent bg-primary text-primary-foreground"
											: "border-line bg-surface text-fg hover:border-fg-2",
									isCurrent && "outline-2 outline-hot outline-offset-1",
								)}
							>
								{question.number}
							</button>
						);
					})}
				</div>
			</div>
		</footer>
	);
}
