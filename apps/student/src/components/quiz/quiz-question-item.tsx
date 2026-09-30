import {
	ASSIGNMENT_ANSWER_CHOICES,
	answerKindByType,
	type StudentQuizQuestion,
} from "@teacher-os/api/contracts";
import { ClozeStemText } from "@teacher-os/ui/components/assignments/cloze-stem";
import { cn } from "@/lib/cn";
import type { QuizPartQuestion } from "@/lib/quiz-parts";

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
}: {
	question: QuizPartQuestion;
	/** [] → câu cloze (input inline); >0 → radiogroup pill rows. */
	choiceRows: QuizChoiceRow[];
	type: string;
	answers: Record<number, string>;
	onAnswer: (q: number, value: string) => void;
	current: boolean;
}) {
	const value = answers[question.q] ?? "";
	return (
		<fieldset
			id={questionAnchorId(question.q)}
			tabIndex={-1}
			aria-label={`Câu ${question.number}`}
			data-question={question.q}
			className={cn(
				"scroll-mt-24 rounded-md border px-3 py-2.5 text-sm transition-colors focus-visible:outline-none",
				current
					? "border-accent-blue bg-accent-soft"
					: "border-transparent bg-bg",
			)}
		>
			<div className="leading-[1.6]">
				<strong className="font-mono">{question.number}.</strong>{" "}
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
					className="mt-2 flex flex-col gap-1.5"
				>
					{choiceRows.map((row) => {
						const selected = value === row.value;
						return (
							<label
								key={row.value}
								className={cn(
									"flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 transition-colors",
									selected
										? "border-accent-blue bg-accent-soft"
										: "border-line bg-bg hover:border-fg-2",
								)}
							>
								<input
									type="radio"
									name={`quiz-q-${question.q}`}
									value={row.value}
									checked={selected}
									onChange={() => onAnswer(question.q, row.value)}
									className="size-4 shrink-0 accent-accent-blue"
								/>
								{row.label && (
									<span className="w-5 shrink-0 text-center font-medium font-mono text-muted-fg">
										{row.label}
									</span>
								)}
								<span className="text-fg">{row.text}</span>
							</label>
						);
					})}
				</div>
			)}
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
