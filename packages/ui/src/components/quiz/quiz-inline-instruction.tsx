import {
	QUIZ_ANSWER_VALUE_MAX,
	type QuizVerdict,
} from "@teacher-os/api/contracts";
import type { QuizPartQuestion } from "@teacher-os/api/lib/quiz-parts";
import {
	type QuizChoiceRow,
	questionAnchorId,
} from "@teacher-os/ui/components/quiz/quiz-question-item";
import {
	QuizReviewChip,
	type QuizReviewInfo,
	QuizReviewItem,
} from "@teacher-os/ui/components/quiz/quiz-review-item";
import {
	VERDICT_BLOCK_CLASSES,
	VERDICT_SOLID_CLASSES,
	VERDICT_TEXT_CLASSES,
	VerdictIcon,
} from "@teacher-os/ui/components/quiz/quiz-verdict";
import {
	formatInlineBankOptionLabel,
	type InlineHtmlNode,
	type ParsedInlineInstruction,
} from "@teacher-os/ui/lib/inline-instruction";
import { RICH_TEXT_CONTENT_CLASSES } from "@teacher-os/ui/lib/rich-text-content-classes";
import { cn } from "@teacher-os/ui/lib/utils";
import { Fragment, type ReactNode } from "react";

const MAX_INLINE_INPUT_WIDTH_CH = 36;

const VERDICT_CONTROL_CLASSES: Record<QuizVerdict, string> = {
	correct:
		"border-verdict-correct bg-verdict-correct-soft font-medium text-verdict-correct",
	wrong:
		"border-verdict-wrong bg-verdict-wrong-soft text-verdict-wrong line-through",
	skipped: "border-input border-dashed bg-muted text-muted-foreground",
};

interface InlineAnswerSlotProps {
	q: number;
	number: number;
	choiceRows: readonly QuizChoiceRow[];
	optionBank: readonly string[];
	value: string;
	onAnswer: (q: number, value: string) => void;
	isCurrent: boolean;
	reviewMode: boolean;
	info?: QuizReviewInfo;
}

function InlineAnswerSlot({
	q,
	number,
	choiceRows,
	optionBank,
	value,
	onAnswer,
	isCurrent,
	reviewMode,
	info,
}: InlineAnswerSlotProps) {
	const verdict = reviewMode && info ? info.verdict : null;
	const inlineKey = info ? info.answerSetKey?.trim() || info.key.trim() : "";
	const answered = value.trim().length > 0;
	const widthCh = Math.min(
		MAX_INLINE_INPUT_WIDTH_CH,
		Math.max(8, value.length + 2),
	);
	const hasUnmatchedValue =
		answered && !choiceRows.some((row) => row.value === value);

	const controlStateClass = verdict
		? VERDICT_CONTROL_CLASSES[verdict]
		: !reviewMode && isCurrent
			? "border-primary bg-background text-foreground ring-2 ring-primary/30"
			: "border-input bg-background text-foreground";

	return (
		<span
			id={reviewMode ? questionAnchorId(q) : undefined}
			tabIndex={reviewMode ? -1 : undefined}
			data-testid="quiz-inline-slot"
			data-question={q}
			data-verdict={verdict ?? undefined}
			className={cn(
				"mx-1 my-0.5 inline-flex max-w-full flex-wrap items-center gap-1 align-baseline font-normal not-italic no-underline",
				reviewMode && "scroll-mt-24 rounded-sm focus-visible:outline-none",
				reviewMode && isCurrent && "ring-2 ring-primary ring-offset-1",
			)}
		>
			<span
				data-testid="quiz-inline-badge"
				aria-hidden="true"
				className={cn(
					"inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border px-1.5 font-mono font-semibold text-[11px] tabular-nums transition-colors",
					verdict
						? VERDICT_SOLID_CLASSES[verdict]
						: isCurrent || answered
							? "border-transparent bg-primary text-primary-foreground"
							: "border-border bg-muted text-foreground",
					!reviewMode && isCurrent && "ring-2 ring-primary ring-offset-1",
				)}
			>
				{number}
			</span>

			{choiceRows.length === 0 ? (
				<input
					type="text"
					id={!reviewMode ? questionAnchorId(q) : undefined}
					aria-label={`Điền đáp án câu ${number}`}
					autoComplete="off"
					spellCheck={false}
					maxLength={QUIZ_ANSWER_VALUE_MAX}
					disabled={reviewMode}
					value={value}
					placeholder={reviewMode && verdict === "skipped" ? "—" : undefined}
					onChange={(event) => onAnswer(q, event.target.value)}
					style={{ width: `${widthCh}ch` }}
					className={cn(
						"min-w-[8ch] max-w-full scroll-mt-24 rounded-md border px-2 py-0.5 font-mono text-base transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-100 md:text-sm",
						controlStateClass,
					)}
				/>
			) : (
				<select
					id={!reviewMode ? questionAnchorId(q) : undefined}
					aria-label={`Chọn đáp án câu ${number}`}
					disabled={reviewMode}
					value={value}
					onChange={(event) => onAnswer(q, event.target.value)}
					className={cn(
						"select-chevron max-w-[min(100%,13rem)] scroll-mt-24 truncate rounded-md border py-0.5 pr-9 pl-2 text-base transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-100 sm:max-w-[min(100%,16rem)] md:text-sm",
						controlStateClass,
					)}
				>
					<option value="">
						{reviewMode && verdict === "skipped" ? "—" : "— Chọn —"}
					</option>
					{choiceRows.map((row, idx) => {
						const bankEntry = optionBank[idx];
						const label =
							!row.label && bankEntry
								? formatInlineBankOptionLabel(row.value, bankEntry)
								: row.label
									? `${row.label} — ${row.text}`
									: row.text;
						return (
							<option key={row.value} value={row.value}>
								{label}
							</option>
						);
					})}
					{hasUnmatchedValue && <option value={value}>{value}</option>}
				</select>
			)}

			{reviewMode && verdict && info && (
				<>
					<VerdictIcon
						verdict={verdict}
						className={cn("size-3.5 shrink-0", VERDICT_TEXT_CLASSES[verdict])}
					/>
					{(verdict === "wrong" || verdict === "skipped") &&
						inlineKey.length > 0 && (
							<span
								data-testid="quiz-inline-key"
								className="inline-flex items-center rounded border border-verdict-correct/40 bg-verdict-correct-soft px-1.5 py-0.5 font-medium font-mono text-verdict-correct text-xs"
							>
								→ {inlineKey}
							</span>
						)}
				</>
			)}
		</span>
	);
}

interface RenderContext {
	questionsByQ: ReadonlyMap<number, Pick<QuizPartQuestion, "q" | "number">>;
	choiceRowsByQ: ReadonlyMap<number, readonly QuizChoiceRow[]>;
	optionBankByQ: ReadonlyMap<number, readonly string[]>;
	answers: Record<number, string>;
	onAnswer: (q: number, value: string) => void;
	currentQuestion: number | null;
	reviewMode: boolean;
	review?: Record<number, QuizReviewInfo>;
}

function renderInlineNodes(
	nodes: readonly InlineHtmlNode[],
	parentKey: string,
	ctx: RenderContext,
): ReactNode[] {
	const rendered: ReactNode[] = [];
	let idx = 0;

	for (const node of nodes) {
		const key = `${parentKey}-${idx}`;
		idx += 1;

		if (node.kind === "text") {
			rendered.push(<Fragment key={key}>{node.text}</Fragment>);
			continue;
		}

		if (node.kind === "slot") {
			const q = node.question.q;
			const question = ctx.questionsByQ.get(q) ?? {
				q,
				number: node.question.number,
			};
			rendered.push(
				<InlineAnswerSlot
					key={`slot-${q}`}
					q={q}
					number={question.number}
					choiceRows={ctx.choiceRowsByQ.get(q) ?? []}
					optionBank={ctx.optionBankByQ.get(q) ?? []}
					value={ctx.answers[q] ?? ""}
					onAnswer={ctx.onAnswer}
					isCurrent={ctx.currentQuestion === q}
					reviewMode={ctx.reviewMode}
					info={ctx.review?.[q]}
				/>,
			);
			continue;
		}

		if (node.tag === "br") {
			rendered.push(<br key={key} />);
			continue;
		}

		if (node.tag === "hr") {
			rendered.push(<hr key={key} />);
			continue;
		}

		const children = renderInlineNodes(node.children, key, ctx);

		if (node.tag === "table") {
			rendered.push(
				<div key={key} className="my-2 max-w-full overflow-x-auto">
					<table>{children}</table>
				</div>,
			);
			continue;
		}

		if (node.tag === "a") {
			if (node.attrs?.href) {
				rendered.push(
					<a
						key={key}
						href={node.attrs.href}
						target="_blank"
						rel="noopener noreferrer"
					>
						{children}
					</a>,
				);
			} else {
				rendered.push(<span key={key}>{children}</span>);
			}
			continue;
		}

		if (node.tag === "td") {
			rendered.push(
				<td
					key={key}
					colSpan={node.attrs?.colSpan}
					rowSpan={node.attrs?.rowSpan}
				>
					{children}
				</td>,
			);
			continue;
		}

		if (node.tag === "th") {
			rendered.push(
				<th
					key={key}
					colSpan={node.attrs?.colSpan}
					rowSpan={node.attrs?.rowSpan}
				>
					{children}
				</th>,
			);
			continue;
		}

		const Tag = node.tag;
		rendered.push(<Tag key={key}>{children}</Tag>);
	}

	return rendered;
}

export interface QuizInlineInstructionProps {
	parsed: ParsedInlineInstruction;
	questions: readonly QuizPartQuestion[];
	choiceRowsByQ: ReadonlyMap<number, readonly QuizChoiceRow[]>;
	optionBankByQ: ReadonlyMap<number, readonly string[]>;
	answers: Record<number, string>;
	onAnswer: (q: number, value: string) => void;
	currentQuestion: number | null;
	mode?: "take" | "review";
	review?: Record<number, QuizReviewInfo>;
}

export function QuizInlineInstruction({
	parsed,
	questions,
	choiceRowsByQ,
	optionBankByQ,
	answers,
	onAnswer,
	currentQuestion,
	mode = "take",
	review,
}: QuizInlineInstructionProps) {
	const reviewMode = mode === "review";
	const questionsByQ = new Map<
		number,
		Pick<QuizPartQuestion, "q" | "number">
	>();
	for (const question of questions) {
		questionsByQ.set(question.q, question);
	}

	const reviewedBound =
		reviewMode && review
			? questions.filter(
					(question) =>
						parsed.boundQuestionQs.has(question.q) &&
						review[question.q] !== undefined,
				)
			: [];

	return (
		<>
			<div
				data-testid="quiz-inline-instruction"
				className={cn(
					parsed.isHtml ? RICH_TEXT_CONTENT_CLASSES : "whitespace-pre-line",
					"text-foreground text-sm leading-[2]",
				)}
			>
				{renderInlineNodes(parsed.nodes, "root", {
					questionsByQ,
					choiceRowsByQ,
					optionBankByQ,
					answers,
					onAnswer,
					currentQuestion,
					reviewMode,
					review,
				})}
			</div>

			{reviewedBound.length > 0 && review && (
				<details
					data-testid="quiz-inline-review-details"
					className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-sm"
				>
					<summary className="cursor-pointer select-none rounded-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">
						Đáp án &amp; Giải thích ({reviewedBound.length} câu)
					</summary>
					<div className="mt-3 flex flex-col gap-2.5">
						{reviewedBound.map((question) => {
							const info = review[question.q];
							if (!info) return null;
							return (
								<div
									key={question.q}
									className={cn(
										"rounded-md px-3 py-2 text-sm",
										VERDICT_BLOCK_CLASSES[info.verdict],
									)}
								>
									<div className="flex flex-wrap items-center gap-2">
										<strong className="font-semibold">
											{question.number}.
										</strong>
										<QuizReviewChip info={info} />
									</div>
									<QuizReviewItem info={info} />
								</div>
							);
						})}
					</div>
				</details>
			)}
		</>
	);
}
