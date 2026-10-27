import type { ReviewedQuestion } from "@teacher-os/api/contracts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

/**
 * Thẻ một câu bóc tách (phase-03, read-only): số thứ tự, stem, các lựa chọn
 * (nếu có), đáp án + giải thích. Câu model tự chấm thấp (needsReview do
 * server tính) có Badge vàng token warning + viền cảnh báo để giáo viên
 * rà soát lại — KHÔNG thêm màu mới ngoài --warn.
 */
export function QuestionReviewCard({
	question,
	index,
}: {
	question: ReviewedQuestion;
	index: number;
}) {
	return (
		<article
			data-testid="question-card"
			className={cn(
				"rounded-lg border bg-card p-4 text-card-foreground shadow-sm",
				question.needsReview ? "border-warn" : "border-border",
			)}
		>
			<div className="mb-1 flex items-start justify-between gap-2">
				<h3 className="font-medium text-sm">Câu {index + 1}</h3>
				{question.needsReview ? (
					<Badge variant="warn" dot data-testid="question-needs-review">
						(!) Cần rà soát lại
					</Badge>
				) : (
					<Badge variant="success">Độ tin cậy cao</Badge>
				)}
			</div>
			<p className="text-sm">{question.stem}</p>
			{question.opts && question.opts.length > 0 && (
				<ul className="mt-2 space-y-1">
					{question.opts.map((opt, i) => (
						// Chỉ mục danh sách tĩnh, không đổi — index làm key an toàn.
						<li key={i} className="text-muted-foreground text-sm">
							{String.fromCharCode(65 + i)}. {opt}
						</li>
					))}
				</ul>
			)}
			{question.answer && (
				<p className="mt-2 text-sm">
					<span className="font-medium">Đáp án: </span>
					{question.answer}
				</p>
			)}
			{question.explanation && (
				<p className="mt-1 text-muted-foreground text-sm">
					<span className="font-medium">Giải thích: </span>
					{question.explanation}
				</p>
			)}
		</article>
	);
}
