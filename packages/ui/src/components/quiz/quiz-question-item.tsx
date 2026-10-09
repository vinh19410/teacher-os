import {
	ASSIGNMENT_ANSWER_CHOICES,
	answerKindByType,
	type StudentQuizQuestion,
} from "@teacher-os/api/contracts";
import type { QuizPartQuestion } from "@teacher-os/api/lib/quiz-parts";
import { ClozeStemText } from "@teacher-os/ui/components/assignments/cloze-stem";
import {
	type QuizReviewInfo,
	QuizReviewItem,
} from "@teacher-os/ui/components/quiz/quiz-review-item";
import { cn } from "@teacher-os/ui/lib/utils";

/** Một hàng lựa chọn: label vị trí (A/i…) hoặc text thuần (TRUE/FALSE…). */
export interface QuizChoiceRow {
	label: string;
	text: string;
	value: string;
}

/**
 * Suy luận các hàng radio cho câu choice từ (question, type, optionBank) —
 * cùng rule với answer-key grid: opts có sẵn (mcq) → letter + text, giá trị
 * lưu là LETTER; ngược lại pill chính là label của kind (tfng/ynng; các kind
 * bank bị cắt theo độ dài bank).
 */
export function questionChoiceRows(
	question: Pick<StudentQuizQuestion, "opts">,
	type: string,
	optionBank: readonly string[],
): QuizChoiceRow[] {
	const kind = answerKindByType[type];
	if (!kind) return [];
	const alphabet = ASSIGNMENT_ANSWER_CHOICES[kind];
	if (question.opts && question.opts.length > 0) {
		return question.opts.map((text, index) => {
			const label = alphabet[index] ?? String(index + 1);
			return { label, text, value: label };
		});
	}
	const bankLimited =
		(kind === "letter" || kind === "roman") && optionBank.length > 0
			? alphabet.slice(0, Math.min(optionBank.length, alphabet.length))
			: alphabet;
	return bankLimited.map((label) => ({ label: "", text: label, value: label }));
}

/** Anchor DOM của câu `q` (0-based) — navigator scroll-to + focus target. */
export const questionAnchorId = (q: number): string => `quiz-q-${q + 1}`;

export function QuizQuestionItem({
	question,
	choiceRows,
	type,
	answers,
	onAnswer,
	current,
	mode = "take",
	review,
}: {
	question: QuizPartQuestion;
	/** [] → câu cloze (input inline); >0 → radiogroup pill rows. */
	choiceRows: QuizChoiceRow[];
	type: string;
	answers: Record<number, string>;
	onAnswer: (q: number, value: string) => void;
	current: boolean;
	/** review = chấm xong: fieldset disabled khoá mọi input của câu. */
	mode?: "take" | "review";
	/** Dữ liệu review của câu — chỉ render khi mode="review". */
	review?: QuizReviewInfo;
}) {
	const reviewMode = mode === "review";
	const value = answers[question.q] ?? "";
	// Câu pill thuần (TRUE/FALSE/NOT GIVEN, roman headings…) xếp hàng ngang
	// như design Exam; MCQ có text lựa chọn giữ hàng full-width cho chữ dài.
	const pillOnly = choiceRows.length > 0 && choiceRows.every((r) => !r.label);
	return (
		<fieldset
			id={questionAnchorId(question.q)}
			tabIndex={-1}
			aria-label={`Câu ${question.number}`}
			data-question={question.q}
			// disabled fieldset chặn radio + cloze input của câu mà không cần
			// đụng vào widget trong @teacher-os/ui (ClozeStemText/PinOverlay).
			disabled={reviewMode}
			className={cn(
				"scroll-mt-24 rounded-md border px-3 py-2.5 text-sm transition-colors focus-visible:outline-none",
				current
					? "border-hot bg-accent-soft"
					: "border-transparent bg-transparent",
			)}
		>
			<div className="leading-[1.6]">
				<strong className="font-semibold">{question.number}.</strong>{" "}
				{choiceRows.length === 0 ? (
					<ClozeStemText
						stem={question.stem}
						typeId={type}
						number={question.number}
						value={value}
						onChange={(next) => onAnswer(question.q, next)}
					/>
				) : (
					question.stem
				)}
			</div>
			{choiceRows.length > 0 && (
				<div
					role="radiogroup"
					aria-label={`Câu ${question.number}`}
					className={cn(
						"mt-2 flex gap-1.5",
						pillOnly ? "flex-wrap" : "flex-col",
					)}
				>
					{choiceRows.map((row) => {
						const selected = value === row.value;
						return (
							<label
								key={row.value}
								className={cn(
									"items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors",
									reviewMode ? "cursor-default" : "cursor-pointer",
									// Pill thuần (T/F/NG): nút mono nhỏ theo design Exam;
									// chọn = nền sunk + chữ cam, viền trong suốt để không
									// đè border-state của neu-sm.
									pillOnly &&
										cn(
											"inline-flex font-mono text-[10px] uppercase tracking-[0.08em]",
											selected
												? "border-transparent bg-surface font-medium text-hot"
												: "neu-sm hover:text-hot",
										),
									// MCQ/heading: hàng full-width, chữ thường.
									!pillOnly &&
										cn(
											"flex",
											selected
												? "border-transparent bg-surface text-hot"
												: "neu-sm",
											!reviewMode && !selected && "hover:border-fg",
										),
								)}
							>
								<input
									type="radio"
									name={`quiz-q-${question.q}`}
									value={row.value}
									checked={selected}
									onChange={() => onAnswer(question.q, row.value)}
									className="size-4 shrink-0 accent-hot"
								/>
								{row.label && (
									<span className="w-5 shrink-0 text-center font-medium font-mono text-muted-fg">
										{row.label}
									</span>
								)}
								<span
									className={cn(
										selected && "font-medium",
										!selected && "text-fg",
									)}
								>
									{row.text}
								</span>
							</label>
						);
					})}
				</div>
			)}
			{reviewMode && review && <QuizReviewItem info={review} />}
		</fieldset>
	);
}

/** Cuộn tới câu `q` (0-based) + focus anchor để keyboard không lạc. */
export function scrollToQuestion(q: number): void {
	if (typeof document === "undefined") return;
	const anchor = document.getElementById(questionAnchorId(q));
	anchor?.scrollIntoView({ behavior: "smooth", block: "start" });
	anchor?.focus({ preventScroll: true });
}
