import { countWords } from "@teacher-os/api/lib/word-count";
import { cn } from "@teacher-os/ui/lib/utils";
import { useMemo, useRef } from "react";

/**
 * Footer sticky của take screen Writing (#304) — cùng khung + testid với
 * `QuizNavigator` (helper e2e `openPaper` chờ `navigator-progress`), thay
 * navigator số câu bằng đếm từ kèm mục tiêu IELTS.
 */
export function QuizEssayFooter({
	text,
	minWords,
}: {
	text: string;
	/** Mục tiêu tối thiểu theo part (150/250); null = không hiện mục tiêu. */
	minWords: number | null;
}) {
	const wordCount = countWords(text);
	const belowMin = minWords !== null && wordCount < minWords;

	// RT red-team F: KHÔNG announce số từ mỗi keystroke — SR sẽ bị cắt ngang
	// hàng trăm lần trong một bài 250+ từ. Vùng role="status" riêng chỉ đổi
	// nội dung tại mốc (đạt/tụt dưới mục tiêu, mỗi 50 từ).
	const announce = useMemo(() => {
		if (minWords === null) {
			return wordCount % 50 === 0 && wordCount > 0
				? `Đã viết ${wordCount} từ`
				: null;
		}
		if (belowMin) {
			return wordCount > 0 && wordCount % 50 === 0
				? `${wordCount} từ — chưa đạt tối thiểu ${minWords} từ`
				: null;
		}
		return wordCount === minWords ? `Đã đạt tối thiểu ${minWords} từ` : null;
	}, [wordCount, minWords, belowMin]);
	const announceRef = useRef<string>("");
	if (announce !== null) announceRef.current = announce;

	return (
		<footer className="sticky bottom-0 z-20 border-line border-t bg-bg/95 backdrop-blur">
			<div className="mx-auto w-full max-w-[720px] px-4 py-3">
				{/* Contract e2e: giữ testid navigator-progress như QuizNavigator.
				 * KHÔNG role="status" ở đây — nội dung đổi mỗi keystroke sẽ spam
				 * SR (code-review F1); announce chỉ ở span sr-only milestone dưới. */}
				<p
					data-testid="navigator-progress"
					className="font-mono text-fg-2 text-xs"
				>
					<span
						data-testid="essay-word-count"
						className={cn("font-medium", belowMin ? "text-hot" : "text-fg")}
					>
						{wordCount}
					</span>
					{" từ"}
					{minWords !== null && ` · tối thiểu ${minWords}`}
				</p>
				<span role="status" className="sr-only">
					{announceRef.current}
				</span>
			</div>
		</footer>
	);
}
