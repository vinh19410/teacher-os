import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import {
	answerChoices,
	type QuestionItem,
	kindOf,
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
): Record<string, string> {
	const errors: Record<string, string> = {};
	if (item.stem.trim().length > QUESTION_STEM_MAX)
		errors.stem = `Nội dung câu hỏi vượt quá ${QUESTION_STEM_MAX} ký tự.`;
	else if (!item.stem.trim()) errors.stem = "Nhập nội dung câu hỏi.";
	if (item.answer.trim().length > QUESTION_ANSWER_MAX) {
		errors.answer = `Đáp án vượt quá ${QUESTION_ANSWER_MAX} ký tự.`;
	} else if (!item.answer.trim()) {
		errors.answer = "Khóa đáp án đúng.";
	} else if (choices && !choices.includes(item.answer)) {
		errors.answer = `Đáp án “${item.answer}” không thuộc bộ đáp án (${choices.join(", ")}).`;
	}
	if (item.alts.length > QUESTION_ALTS_MAX)
		errors.alts = `Danh sách nhận thêm vượt quá ${QUESTION_ALTS_MAX} ký tự.`;
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
	onItemsChange,
	onAddQuestion,
}: {
	typeId: string;
	skill: string;
	partId: string;
	items: QuestionItem[];
	showErrors: boolean;
	onItemsChange: (items: QuestionItem[]) => void;
	/** Enter-to-add comes from the editor so the max-40 gate stays in one
	 * place; returns whether a row was actually added. */
	onAddQuestion: () => boolean;
}) {
	const kind = kindOf(typeId);
	const choices = answerChoices(kind);
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
	};
	const focusRow = (index: number) => {
		if (typeof document === "undefined") return;
		document
			.querySelector<HTMLElement>(`[data-qindex="${index}"]`)
			?.focus();
	};
	const handleKeyDown = (
		event: React.KeyboardEvent<HTMLDivElement>,
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
		<div className="flex flex-col gap-2" aria-label="Lưới đáp án">
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
				const rowErrors = questionRowError(item, choices);
				const rowVisible = showErrors || blurred.has(index);
				const errorEntries = rowVisible
					? (["stem", "answer", "alts"] as const).filter((key) => rowErrors[key])
					: [];
				return (
					<div
						key={`${partId}-${index}`}
						data-qindex={index}
						tabIndex={-1}
						onKeyDown={(event) => handleKeyDown(event, index)}
						onBlur={(event) => {
							if (!event.currentTarget.contains(event.relatedTarget)) {
								setBlurred((current) => new Set(current).add(index));
							}
						}}
						className="grid gap-2 rounded-md border border-line bg-surface p-3 outline-none focus-visible:border-fg sm:grid-cols-[3.5rem_1fr_14rem_2rem] sm:items-start"
					>
						<strong className="pt-2 font-mono text-sm">Câu {number}</strong>
						<div className="flex flex-col gap-1">
							<Input
								value={item.stem}
								aria-label="Nội dung câu hỏi phía học viên"
								onChange={(event) => update(index, { stem: event.target.value })}
							/>
							{(kind === "mcq4" || kind === "mcq3") && (
								<div className="grid gap-2 pt-1 sm:grid-cols-2">
									{(item.opts ?? choices!.map(() => "")).map(
										(option, optionIndex) => (
											<Input
												key={optionIndex}
												value={option}
												aria-label={`Lựa chọn ${choices![optionIndex]} câu ${number}`}
												placeholder={`Lựa chọn ${choices![optionIndex]}`}
												onChange={(event) =>
													update(index, {
														opts: (item.opts ?? choices!.map(() => "")).map(
															(value, idx) =>
																idx === optionIndex ? event.target.value : value,
														),
													})
												}
											/>
										),
									)}
								</div>
							)}
						</div>
						<div className="flex flex-col gap-1">
							{choices && kind !== "text" ? (
								<div role="group" aria-label={`Đáp án câu ${number}`}>
									<div className="flex flex-wrap gap-1.5">
										{choices.map((choice) => (
											<button
												type="button"
												key={choice}
												aria-pressed={item.answer === choice}
												aria-label={`Câu ${number}: ${choice}`}
												onClick={() => update(index, { answer: choice })}
												className={cn(
													"rounded-full border px-[10px] py-[4px] font-medium text-xs transition-all duration-[150ms]",
													item.answer === choice
														? "border-fg bg-fg text-bg"
														: "border-line bg-bg text-fg-2 hover:border-fg",
												)}
											>
												{choice}
											</button>
										))}
									</div>
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
					</div>
				);
			})}
		</div>
	);
}
