import type { QuizVerdict } from "@teacher-os/api/contracts";
import {
	countAnswered,
	isAnsweredValue,
	type QuizPart,
} from "@teacher-os/api/lib/quiz-parts";
import { formatEssayWordMilestone } from "@teacher-os/ui/components/quiz/quiz-essay-footer";
import {
	VERDICT_BADGE_CLASSES,
	VERDICT_SOLID_CLASSES,
	VerdictIcon,
} from "@teacher-os/ui/components/quiz/quiz-verdict";
import { cn } from "@teacher-os/ui/lib/utils";
import { useMemo, useRef } from "react";

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
	writingProgress = null,
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
	/** Tiến độ đếm từ phần Writing của bài gộp (#574) — dính cùng khối sticky. */
	writingProgress?: {
		wordCount: number;
		minWords: number | null;
	} | null;
}) {
	const reviewMode = mode === "review";
	const allQuestions = parts.flatMap((part) => part.questions);
	const answeredCount = countAnswered(answers, allQuestions);
	const verdictCount = (verdict: QuizVerdict): number =>
		allQuestions.filter((question) => verdicts?.[question.q] === verdict)
			.length;
	const writingWordCount = writingProgress?.wordCount ?? 0;
	const writingMinWords = writingProgress?.minWords ?? null;
	const belowWritingMin =
		writingMinWords !== null && writingWordCount < writingMinWords;
	const writingAnnounce = useMemo(
		() =>
			writingProgress != null
				? formatEssayWordMilestone(writingWordCount, writingMinWords)
				: null,
		[writingProgress, writingWordCount, writingMinWords],
	);
	const writingAnnounceRef = useRef<string>("");
	if (writingAnnounce !== null) writingAnnounceRef.current = writingAnnounce;

	return (
		<footer className="sticky bottom-0 z-20 max-h-[30svh] overflow-y-auto border-border border-t bg-background/95 backdrop-blur lg:max-h-none lg:overflow-visible">
			{!reviewMode && writingProgress != null && (
				<div className="border-border border-b px-4 py-1.5 font-mono text-muted-foreground text-xs">
					<div className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-2">
						<span>Phần 2 · Writing</span>
						<span data-testid="hybrid-essay-word-count">
							<span
								className={cn(
									"font-medium",
									belowWritingMin ? "text-primary" : "text-foreground",
								)}
							>
								{writingWordCount}
							</span>
							{" từ"}
							{writingMinWords !== null && ` · tối thiểu ${writingMinWords}`}
						</span>
					</div>
					<span role="status" className="sr-only">
						{writingAnnounceRef.current}
					</span>
				</div>
			)}
			<div className="w-full px-4 py-3">
				<p
					role="status"
					data-testid="navigator-progress"
					aria-live="polite"
					className="mb-2 font-mono text-muted-foreground text-xs"
				>
					{reviewMode ? (
						<>
							Đúng{" "}
							<span className="text-verdict-correct">
								{verdictCount("correct")}
							</span>{" "}
							câu · Sai{" "}
							<span className="text-verdict-wrong">
								{verdictCount("wrong")}
							</span>{" "}
							· Bỏ qua {verdictCount("skipped")}
						</>
					) : (
						`Đã trả lời ${answeredCount}/${allQuestions.length} câu`
					)}
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
									"relative flex size-9 items-center justify-center rounded-md border font-mono text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
									verdict
										? VERDICT_SOLID_CLASSES[verdict]
										: answered
											? "border-transparent bg-primary text-primary-foreground"
											: "border-border bg-background text-foreground hover:bg-accent",
									isCurrent && "ring-2 ring-primary ring-offset-1",
								)}
							>
								{question.number}
								{verdict && (
									<VerdictIcon
										verdict={verdict}
										// stroke màu verdict trên chấm --bg: kế thừa
										// currentColor (--verdict-on == --bg) sẽ vô hình.
										className={cn(
											"absolute -top-1 -right-1 size-2.5 rounded-full bg-background p-px",
											VERDICT_BADGE_CLASSES[verdict],
										)}
									/>
								)}
							</button>
						);
					})}
				</div>
			</div>
		</footer>
	);
}
