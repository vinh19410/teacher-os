import {
	ASSIGNMENT_ANSWER_CHOICES,
	answerKindByType,
	type QuizVerdict,
	type StudentQuizQuestion,
} from "@teacher-os/api/contracts";
import { isAcceptedAnswer } from "@teacher-os/api/lib/grade-quiz";
import type { QuizPartQuestion } from "@teacher-os/api/lib/quiz-parts";
import { ClozeStemText } from "@teacher-os/ui/components/assignments/cloze-stem";
import {
	QuizReviewChip,
	type QuizReviewInfo,
	QuizReviewItem,
} from "@teacher-os/ui/components/quiz/quiz-review-item";
import {
	VERDICT_ACCENT_CLASSES,
	VERDICT_BLOCK_CLASSES,
	VerdictIcon,
} from "@teacher-os/ui/components/quiz/quiz-verdict";
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

/** Style review áp cho MỘT hàng lựa chọn (issue #351). */
interface ChoiceRowReview {
	rowClass: string;
	textClass: string;
	accent: string;
	/** "check" = chọn đúng, "you" = học viên chọn, "key" = hàng đáp án đúng. */
	mark: "check" | "you" | "key" | null;
}

/**
 * Hàng học viên chọn tô theo verdict của câu: đúng = tick "check", sai = gạch
 * ngang + "Bạn chọn".
 */
const SELECTED_ROW_REVIEW: Record<QuizVerdict, ChoiceRowReview> = {
	correct: {
		rowClass:
			"border-verdict-correct/60 bg-verdict-correct-soft text-verdict-correct",
		textClass: "text-verdict-correct",
		accent: VERDICT_ACCENT_CLASSES.correct,
		mark: "check",
	},
	wrong: {
		rowClass: "border-verdict-wrong/60 bg-verdict-wrong-soft",
		textClass: "text-verdict-wrong line-through",
		accent: VERDICT_ACCENT_CLASSES.wrong,
		mark: "you",
	},
	// Unreachable — defensive: grader định nghĩa skipped ⇔ answer rỗng ⇒
	// không có hàng nào selected. Giữ để đủ Record<QuizVerdict, ...>.
	skipped: {
		rowClass: "border-input/40 bg-muted",
		textClass: "text-muted-foreground",
		accent: VERDICT_ACCENT_CLASSES.skipped,
		mark: "you",
	},
};

/**
 * Style review của MỘT hàng lựa chọn: khi sai/bỏ qua, hàng đáp án đúng có
 * viền xanh + "Đáp án đúng" — so khớp key qua `isAcceptedAnswer`, cùng rule
 * normalize với grader. Take mode không gọi hàm này.
 */
function choiceRowReview(
	review: QuizReviewInfo,
	selected: boolean,
	rowValue: string,
): ChoiceRowReview {
	if (selected) return SELECTED_ROW_REVIEW[review.verdict];
	if (
		review.verdict !== "correct" &&
		isAcceptedAnswer(rowValue, review.key, review.alts)
	) {
		return {
			rowClass: "border-2 border-verdict-correct",
			textClass: "text-verdict-correct",
			accent: VERDICT_ACCENT_CLASSES.correct,
			mark: "key",
		};
	}
	// Hàng không nổi bật: viền tường minh trong suốt — để preflight currentColor
	// sẽ vẽ viền 1px xám đậm hơn hairline của hệ (review PR #355 F2).
	return {
		rowClass: "border-transparent text-muted-foreground",
		textClass: "text-muted-foreground",
		accent: VERDICT_ACCENT_CLASSES.skipped,
		mark: null,
	};
}

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
	const verdict = reviewMode && review ? review.verdict : null;
	// Khung câu: review tô theo verdict (viền trong suốt, màu nằm ở viền trái
	// + nền soft); take giữ selection cam như cũ.
	const frameClass = verdict
		? "border-transparent"
		: current
			? "border-primary bg-accent-soft"
			: "border-transparent bg-transparent";
	return (
		<fieldset
			id={questionAnchorId(question.q)}
			tabIndex={-1}
			aria-label={`Câu ${question.number}`}
			data-question={question.q}
			data-verdict={verdict ?? undefined}
			// disabled fieldset chặn radio + cloze input của câu mà không cần
			// đụng vào widget trong @teacher-os/ui (ClozeStemText/PinOverlay).
			disabled={reviewMode}
			className={cn(
				"scroll-mt-24 rounded-md border px-3 py-2.5 text-sm transition-colors focus-visible:outline-none",
				frameClass,
				verdict && VERDICT_BLOCK_CLASSES[verdict],
				// Câu đang mở ở review: outline cam đè LÊN nền verdict, không
				// thay thế nó (bg-accent-soft sẽ xoá nền verdict).
				reviewMode && current && "outline-2 outline-primary outline-offset-2",
			)}
		>
			<div className="leading-[1.6]">
				<strong className="font-semibold">{question.number}.</strong>{" "}
				{verdict && review && <QuizReviewChip info={review} />}{" "}
				{choiceRows.length === 0 ? (
					<ClozeStemText
						stem={question.stem}
						typeId={type}
						number={question.number}
						value={value}
						onChange={(next) => onAnswer(question.q, next)}
						verdict={reviewMode ? review?.verdict : undefined}
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
						const rv =
							reviewMode && review
								? choiceRowReview(review, selected, row.value)
								: null;
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
											rv
												? rv.rowClass
												: selected
													? "border-transparent bg-muted font-medium text-primary"
													: "neu-sm hover:text-primary",
										),
									// MCQ/heading: hàng full-width, chữ thường.
									!pillOnly &&
										cn(
											"flex",
											rv
												? rv.rowClass
												: selected
													? "border-transparent bg-muted text-primary"
													: "neu-sm",
											!reviewMode && !rv && !selected && "hover:border-fg",
										),
								)}
							>
								<input
									type="radio"
									name={`quiz-q-${question.q}`}
									value={row.value}
									checked={selected}
									onChange={() => onAnswer(question.q, row.value)}
									className={cn(
										"size-4 shrink-0",
										rv ? rv.accent : "accent-hot",
									)}
								/>
								{row.label && (
									<span className="w-5 shrink-0 text-center font-medium font-mono text-muted-foreground">
										{row.label}
									</span>
								)}
								<span
									className={cn(
										selected && "font-medium",
										rv ? rv.textClass : !selected && "text-foreground",
									)}
								>
									{row.text}
								</span>
								{rv?.mark && (
									<span className="ml-auto inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em]">
										<VerdictIcon
											verdict={
												rv.mark === "key" || rv.mark === "check"
													? "correct"
													: (verdict ?? "skipped")
											}
											className="size-3"
										/>
										{rv.mark === "you" && "Bạn chọn"}
										{rv.mark === "key" && "Đáp án đúng"}
									</span>
								)}
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
