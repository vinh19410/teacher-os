import type { ReviewedQuestion } from "@teacher-os/api/contracts";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export interface QuestionReviewCardProps {
	question: ReviewedQuestion;
	index: number;
	partIndex?: number;
	onChange?: (next: ReviewedQuestion) => void;
}

/**
 * Thẻ một câu bóc tách có chỉnh sửa tay 0 Credit (TOS-26 #472, wireframe [9] &
 * [10]): cho phép sửa stem, các lựa chọn (nếu có), đáp án đúng, giải thích và
 * loại câu. Câu có `needsReview === true` luôn giữ nguyên Badge vàng
 * "(!) Cần rà soát lại" + viền `border-warn` kể cả sau khi giáo viên sửa tay.
 */
export function QuestionReviewCard({
	question,
	index,
	partIndex = 0,
	onChange,
}: QuestionReviewCardProps) {
	const prefix = `p${partIndex}-q${index}`;

	function emit(patch: Partial<ReviewedQuestion>) {
		onChange?.({
			...question,
			...patch,
			// D2: sửa tay không tự xóa nhãn `needsReview` và không đổi `confidence`.
			confidence: question.confidence,
			needsReview: question.needsReview,
		});
	}

	return (
		<article
			data-testid="question-card"
			className={cn(
				"space-y-3 rounded-lg border bg-card p-4 text-card-foreground shadow-sm",
				question.needsReview ? "border-warn" : "border-border",
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<h3 className="font-medium text-sm">Câu {index + 1}</h3>
				{question.needsReview ? (
					<Badge variant="warn" dot data-testid="question-needs-review">
						(!) Cần rà soát lại
					</Badge>
				) : (
					<Badge variant="success">Độ tin cậy cao</Badge>
				)}
			</div>

			<Field label={`Nội dung câu ${index + 1} *`} htmlFor={`${prefix}-stem`}>
				<Input
					id={`${prefix}-stem`}
					data-testid={`question-stem-${index}`}
					value={question.stem}
					maxLength={500}
					onChange={(e) => emit({ stem: e.target.value })}
				/>
			</Field>

			{question.opts && question.opts.length > 0 && (
				<div className="space-y-2">
					<p className="font-medium text-muted-foreground text-xs">
						Phương án lựa chọn
					</p>
					<ul className="space-y-1.5">
						{question.opts.map((opt, optIdx) => {
							const letter = String.fromCharCode(65 + optIdx);
							return (
								<li key={optIdx} className="flex items-center gap-2 text-sm">
									<span className="w-5 shrink-0 font-medium text-muted-foreground">
										{letter}.
									</span>
									<Input
										aria-label={`Phương án ${letter} câu ${index + 1}`}
										data-testid={`question-opt-${index}-${optIdx}`}
										value={opt}
										maxLength={500}
										onChange={(e) => {
											const nextOpts = [...(question.opts ?? [])];
											nextOpts[optIdx] = e.target.value;
											emit({ opts: nextOpts });
										}}
									/>
								</li>
							);
						})}
					</ul>
				</div>
			)}

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<Field
					label={`Đáp án đúng câu ${index + 1} *`}
					htmlFor={`${prefix}-answer`}
				>
					<Input
						id={`${prefix}-answer`}
						data-testid={`question-answer-${index}`}
						value={question.answer ?? ""}
						maxLength={200}
						placeholder="Nhập đáp án đúng"
						onChange={(e) => emit({ answer: e.target.value })}
					/>
				</Field>
				<Field
					label={`Giải thích câu ${index + 1}`}
					htmlFor={`${prefix}-explanation`}
				>
					<Input
						id={`${prefix}-explanation`}
						data-testid={`question-explanation-${index}`}
						value={question.explanation ?? ""}
						maxLength={2000}
						placeholder="Dẫn chứng hoặc giải thích ngắn"
						onChange={(e) =>
							emit({
								explanation: e.target.value ? e.target.value : undefined,
							})
						}
					/>
				</Field>
				<Field label={`Loại câu ${index + 1}`} htmlFor={`${prefix}-type`}>
					<Input
						id={`${prefix}-type`}
						data-testid={`question-type-${index}`}
						value={question.type ?? ""}
						maxLength={20}
						placeholder="tfng, mcq, shortans…"
						onChange={(e) =>
							emit({
								type: e.target.value ? e.target.value : undefined,
							})
						}
					/>
				</Field>
			</div>
		</article>
	);
}
