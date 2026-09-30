import { ASSIGNMENT_ANSWER_CHOICES } from "@teacher-os/api/contracts";
import { countBlanks } from "@teacher-os/ui/lib/cloze";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import {
	answerChoices,
	kindOf,
	type QuestionItem,
	qStartOf,
} from "./assignment-presets";

/**
 * Answer-key grid (phase-01 FR1–FR4, FR9): one row per question with the
 * REAL question number (`qStart + index`, never 1..n) and a per-kind answer
 * zone — three-state chips (tfng/ynng), choice chips (mcq4/mcq3/roman/
 * letter) or free text + alts (text). State stays in `new.tsx`; this
 * component is fully controlled.
 *
 * Per-row validation (FR9) renders inside the row — no page-level popups.
 * Caps mirror the contract (`contracts.ts` stem ≤ 500 / answer ≤ 200 /
 * alts ≤ 500, questions max 40).
 */

export const QUESTION_STEM_MAX = 500;
export const QUESTION_ANSWER_MAX = 200;
export const QUESTION_ALTS_MAX = 500;
/** `opts: z.array(z.string().max(500))` in `assignmentPromptCreateSchema`. */
export const QUESTION_OPTION_MAX = 500;
/** `questions.max(40)` in `assignmentPromptCreateSchema`. */
export const QUESTION_MAX_COUNT = 40;

/** Keyboard letter → answer for the three-state kinds (FR3). Only bound
 * while a row is focused; no modifiers, never while typing in a text field. */
const KEY_ANSWERS: Record<string, Record<string, string>> = {
	tfng: { t: "TRUE", f: "FALSE", n: "NOT GIVEN" },
	ynng: { y: "YES", n: "NO", g: "NOT GIVEN" },
};
const DIGIT_ROMANS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"];

export function questionRowError(
	item: QuestionItem,
	choices: readonly string[] | null,
	/** FR9: missing stem/answer only block a `ready` save — a draft may be
	 * half-filled. Over-cap and invalid-choice errors apply in both states. */
	requireFilled = true,
	/** Phase-04 FR2: image-based pairs need a pin per question when ready. */
	requirePin = false,
): Record<string, string> {
	const errors: Record<string, string> = {};
	if (item.stem.trim().length > QUESTION_STEM_MAX)
		errors.stem = `Nội dung câu hỏi vượt quá ${QUESTION_STEM_MAX} ký tự.`;
	else if (countBlanks(item.stem) >= 2)
		// Phase-03 FR7: one blank per question. Zero markers stay valid
		// (legacy prompts + tablecomp); two or more would render broken.
		errors.stem = `Câu này có ${countBlanks(item.stem)} chỗ trống (____) — mỗi câu chỉ một chỗ trống.`;
	else if (requireFilled && !item.stem.trim())
		errors.stem = "Nhập nội dung câu hỏi.";
	if (requirePin && !item.pin) errors.pin = "Đặt ghim trên ảnh cho câu này.";
	if (item.answer.trim().length > QUESTION_ANSWER_MAX) {
		errors.answer = `Đáp án vượt quá ${QUESTION_ANSWER_MAX} ký tự.`;
	} else if (requireFilled && !item.answer.trim()) {
		errors.answer = "Khóa đáp án đúng.";
	} else if (choices && item.answer.trim() && !choices.includes(item.answer)) {
		errors.answer = `Đáp án “${item.answer}” không thuộc bộ đáp án (${choices.join(", ")}).`;
	}
	if (item.alts.length > QUESTION_ALTS_MAX)
		errors.alts = `Danh sách nhận thêm vượt quá ${QUESTION_ALTS_MAX} ký tự.`;
	if ((item.opts ?? []).some((option) => option.length > QUESTION_OPTION_MAX))
		errors.opts = `Lựa chọn vượt quá ${QUESTION_OPTION_MAX} ký tự.`;
	return errors;
}

function rowIsEmpty(item: QuestionItem): boolean {
	if (item.stem.trim() || item.answer.trim() || item.alts.trim()) return false;
	return (item.opts ?? []).every((option) => !option.trim());
}

export function AnswerKeyGrid({
	typeId,
	skill,
	partId,
	items,
	showErrors,
	requireFilled = true,
	requirePin = false,
	selectedIndex = null,
	optionBank,
	onItemsChange,
	onAddQuestion,
}: {
	typeId: string;
	skill: string;
	partId: string;
	items: QuestionItem[];
	showErrors: boolean;
	/** FR9: missing stem/answer are flagged only when the composer status is
	 * `ready`; drafts may legitimately be half-filled. */
	requireFilled?: boolean;
	/** Phase-04 FR2: image-based pairs flag missing pins when ready. */
	requirePin?: boolean;
	/** Phase-04 FR3: the pin editor selects a question — highlight the row. */
	selectedIndex?: number | null;
	/** Phase-02 FR4: when the prompt's type is bankable and the teacher has
	 * bank rows, the choice chips come from the bank's POSITIONAL labels —
	 * only labels that exist in the bank are selectable. */
	optionBank?: string[];
	onItemsChange: (items: QuestionItem[]) => void;
	/** Enter-to-add comes from the editor so the max-40 gate stays in one
	 * place; returns whether a row was actually added. */
	onAddQuestion: () => boolean;
}) {
	const kind = kindOf(typeId);
	const kindAlphabet = answerChoices(kind);
	// Bank-sourced chips (FR4): positional labels limited to the bank size.
	// An empty bank falls back to the full alphabet so a draft can still be
	// keyed before the teacher fills the bank.
	const bankChips =
		optionBank &&
		optionBank.length > 0 &&
		(kind === "letter" || kind === "roman")
			? ASSIGNMENT_ANSWER_CHOICES[kind].slice(
					0,
					Math.min(optionBank.length, ASSIGNMENT_ANSWER_CHOICES[kind].length),
				)
			: null;
	const choices = bankChips ?? kindAlphabet;
	// FR4: sentend uses each option exactly once (formal format) — labels
	// already keyed on ANOTHER row render disabled + faded. features and the
	// other matching kinds may reuse labels.
	const enforceDistinct = typeId === "sentend";
	const qStart = qStartOf(skill, partId);
	const [blurred, setBlurred] = useState<ReadonlySet<number>>(new Set());
	const update = (index: number, patch: Partial<QuestionItem>) => {
		onItemsChange(
			items.map((item, itemIndex) =>
				itemIndex === index ? { ...item, ...patch } : item,
			),
		);
	};
	const remove = (index: number) => {
		onItemsChange(items.filter((_, itemIndex) => itemIndex !== index));
		// Blur flags track row indices — shift them so removing a middle row
		// never paints stale errors onto the row that slid into its place.
		setBlurred((current) => {
			const next = new Set<number>();
			for (const blurredIndex of current) {
				if (blurredIndex === index) continue;
				next.add(blurredIndex > index ? blurredIndex - 1 : blurredIndex);
			}
			return next;
		});
	};
	const focusRow = (index: number) => {
		if (typeof document === "undefined") return;
		document.querySelector<HTMLElement>(`[data-qindex="${index}"]`)?.focus();
	};
	const handleKeyDown = (
		event: React.KeyboardEvent<HTMLElement>,
		index: number,
	) => {
		const target = event.target as HTMLElement;
		const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
		if (event.key === "Enter") {
			event.preventDefault();
			if (onAddQuestion()) focusRowAfterAdd(index + 1);
			return;
		}
		if (
			event.key === "Backspace" &&
			rowIsEmpty(items[index]) &&
			items.length > 1
		) {
			event.preventDefault();
			remove(index);
			focusRow(Math.min(index, items.length - 2));
			return;
		}
		if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
		if (!choices) return;
		const wanted = event.key.toLowerCase();
		const hit =
			KEY_ANSWERS[kind]?.[wanted] ??
			((kind === "mcq4" || kind === "mcq3" || kind === "letter") &&
			/^[a-h]$/.test(wanted)
				? wanted.toUpperCase()
				: kind === "roman" && /^[1-8]$/.test(wanted)
					? DIGIT_ROMANS[Number(wanted) - 1]
					: undefined);
		if (hit && choices.includes(hit)) {
			event.preventDefault();
			update(index, { answer: hit });
		}
	};
	const focusRowAfterAdd = (index: number) => {
		if (typeof requestAnimationFrame === "function") {
			requestAnimationFrame(() => focusRow(index));
		}
	};
	return (
		<section aria-label="Lưới đáp án" className="flex flex-col gap-2">
			<div
				aria-hidden="true"
				className="hidden gap-2 px-1 font-medium text-muted-fg text-xs sm:grid sm:grid-cols-[3.5rem_1fr_14rem_2rem]"
			>
				<span>Câu</span>
				<span>Nội dung câu hỏi phía học viên</span>
				<span>Đáp án đúng · học viên không thấy</span>
			</div>
			{items.map((item, index) => {
				const number = qStart + index;
				const rowErrors = questionRowError(
					item,
					choices,
					requireFilled,
					requirePin,
				);
				const rowVisible = showErrors || blurred.has(index);
				const errorEntries = rowVisible
					? (["stem", "answer", "opts", "pin", "alts"] as const).filter(
							(key) =>
								rowErrors[key] &&
								// Phase-04: a missing pin is fixed on the IMAGE, not in
								// this row — rendering it on blur would flash an alert
								// mid-click (layout shift swallowed the very next
								// "Thêm câu" press in e2e). Save-time only.
								(key !== "pin" || showErrors),
						)
					: [];
				const mcqChoices = kind === "mcq4" || kind === "mcq3" ? choices : null;
				const options = item.opts ?? mcqChoices?.map(() => "") ?? [];
				// FR4 (sentend): labels keyed on another row are unusable here.
				const usedByOthers = new Set(
					items
						.filter((_, otherIndex) => otherIndex !== index)
						.map((other) => other.answer.trim()),
				);
				return (
					<fieldset
						key={`${partId}-${index}`}
						data-qindex={index}
						tabIndex={-1}
						aria-label={`Câu ${number}`}
						onKeyDown={(event) => handleKeyDown(event, index)}
						onBlur={(event) => {
							if (!event.currentTarget.contains(event.relatedTarget)) {
								setBlurred((current) => new Set(current).add(index));
							}
						}}
						className={cn(
							"grid gap-2 rounded-md border bg-surface p-3 outline-none focus-visible:border-fg sm:grid-cols-[3.5rem_1fr_14rem_2rem] sm:items-start",
							selectedIndex === index ? "border-fg" : "border-line",
						)}
					>
						<strong className="pt-2 font-mono text-sm">Câu {number}</strong>
						<div className="flex flex-col gap-1">
							<Input
								value={item.stem}
								aria-label="Nội dung câu hỏi phía học viên"
								onChange={(event) =>
									update(index, { stem: event.target.value })
								}
							/>
							{mcqChoices && mcqChoices.length > 0 && (
								<div className="grid gap-2 pt-1 sm:grid-cols-2">
									{options.map((option, optionIndex) => (
										<Input
											key={optionIndex}
											value={option}
											aria-label={`Lựa chọn ${mcqChoices[optionIndex]} câu ${number}`}
											placeholder={`Lựa chọn ${mcqChoices[optionIndex]}`}
											onChange={(event) =>
												update(index, {
													opts: options.map((value, idx) =>
														idx === optionIndex ? event.target.value : value,
													),
												})
											}
										/>
									))}
								</div>
							)}
						</div>
						<div className="flex flex-col gap-1">
							{choices && kind !== "text" ? (
								<div className="flex flex-wrap gap-1.5">
									{choices.map((choice) => {
										const taken =
											enforceDistinct &&
											usedByOthers.has(choice) &&
											item.answer !== choice;
										return (
											<button
												type="button"
												key={choice}
												aria-pressed={item.answer === choice}
												aria-label={`Câu ${number}: ${choice}`}
												disabled={taken}
												onClick={() => update(index, { answer: choice })}
												className={cn(
													"rounded-full border px-[10px] py-[4px] font-medium text-xs transition-all duration-[150ms]",
													item.answer === choice
														? "border-fg bg-fg text-bg"
														: "border-line bg-bg text-fg-2 hover:border-fg",
													taken &&
														"cursor-not-allowed opacity-40 hover:border-line",
												)}
											>
												{choice}
											</button>
										);
									})}
								</div>
							) : (
								<>
									<Input
										value={item.answer}
										aria-label="Đáp án chấm tự động"
										onChange={(event) =>
											update(index, { answer: event.target.value })
										}
									/>
									<Input
										value={item.alts}
										aria-label="Chấp nhận thêm, cách nhau bằng /"
										placeholder="Nhận thêm: alt1 / alt2"
										onChange={(event) =>
											update(index, { alts: event.target.value })
										}
									/>
								</>
							)}
						</div>
						{items.length > 1 ? (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								aria-label={`Xóa câu ${number}`}
								onClick={() => remove(index)}
							>
								Xóa
							</Button>
						) : (
							<span />
						)}
						{errorEntries.length > 0 && (
							<div role="alert" className="sm:col-span-4">
								{errorEntries.map((key) => (
									<p key={key} className="text-danger text-xs">
										{rowErrors[key]}
									</p>
								))}
							</div>
						)}
					</fieldset>
				);
			})}
		</section>
	);
}
