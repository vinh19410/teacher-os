import { ASSIGNMENT_ANSWER_CHOICES } from "@teacher-os/api/contracts";
import { inferQuestionTypes } from "@teacher-os/api/lib/infer-question-types";
import { htmlToPlainText } from "@teacher-os/api/rich-text";
import { Button } from "@teacher-os/ui/components/web-kit/button";
import { Field, Input, Select } from "@teacher-os/ui/components/web-kit/field";
import { RichTextEditor } from "@teacher-os/ui/components/web-kit/rich-text-editor";
import { countBlanks } from "@teacher-os/ui/lib/cloze";
import { cn } from "@teacher-os/ui/lib/utils";
import { Fragment, useState } from "react";
import {
	answerChoices,
	emptyItem,
	isImageBased,
	kindOf,
	partOf,
	type QuestionItem,
	qStartOf,
} from "./assignment-presets";
import { CardControls } from "./card-controls";
import { questionSummary } from "./question-summary";

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
/** Nhãn đáp án của dạng 3 trạng thái — dùng trong cảnh báo câu bị suy luận. */
const INFERRED_TYPE_LABELS: Record<string, { answers: string; kind: string }> =
	{
		tfng: {
			answers: "TRUE / FALSE / NOT GIVEN",
			kind: "True / False / Not Given",
		},
		ynng: { answers: "YES / NO / NOT GIVEN", kind: "Yes / No / Not Given" },
	};
const DIGIT_ROMANS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"];

/** Dải câu liên tiếp đang bị suy luận sang cùng một dạng 3 trạng thái. */
interface InferredRun {
	type: string;
	indices: number[];
}

/** Câu không khai type mà đáp án là T/F/NG (hoặc Y/N/NG) nằm trong đề điền
 * chữ: runtime suy ra tfng/ynng cho học viên; ở đây gom thành dải để cảnh báo
 * giáo viên gán dạng đúng. */
function inferredRuns(items: QuestionItem[], typeId: string): InferredRun[] {
	const inferred = inferQuestionTypes(items, typeId);
	const runs: InferredRun[] = [];
	items.forEach((item, index) => {
		const type = inferred[index];
		if (item.type || type === typeId) return;
		const last = runs[runs.length - 1];
		if (last && last.type === type && last.indices.at(-1) === index - 1) {
			last.indices.push(index);
		} else {
			runs.push({ type, indices: [index] });
		}
	});
	return runs;
}

/** `X–Y` (một câu: `X`) theo số câu thật `qStart + index`. */
function runRangeLabel(run: InferredRun, qStart: number): string {
	const first = qStart + run.indices[0];
	const last = qStart + run.indices[run.indices.length - 1];
	return first === last ? `${first}` : `${first}–${last}`;
}

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
	qStartOverride,
	showExplanation = false,
	collapsible = false,
	openRow = null,
	onOpenRowChange,
	rowIdPrefix,
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
	/** #424 Task 1.1 — số câu đầu của nhóm (Selfomy groups); mặc định theo
	 * `qStartOf(skill, partId)` như composer một khối. */
	qStartOverride?: number;
	/** #424 Task 1.1 — ô giải thích rich text mỗi câu; rỗng thì key bị xóa. */
	showExplanation?: boolean;
	/** #424 Task 1.6 — hàng câu thu gọn (chip tóm tắt + CardControls); hàng
	 * thu gọn KHÔNG mount phần thân. */
	collapsible?: boolean;
	openRow?: number | null;
	onOpenRowChange?: (index: number | null) => void;
	rowIdPrefix?: string;
}) {
	// Per-question type: widget của TỪNG hàng key theo `item.type ?? typeId`
	// (đề trộn dạng) — câu không khai type đi theo dạng đề như cũ.
	const typeCatalog = partOf(skill, partId).types;
	const rowTypeOf = (item: QuestionItem) => item.type ?? typeId;
	const rowChoicesOf = (item: QuestionItem): readonly string[] | null => {
		const kind = kindOf(rowTypeOf(item));
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
		return bankChips ?? answerChoices(kind);
	};
	const qStart = qStartOverride ?? qStartOf(skill, partId);
	const [blurred, setBlurred] = useState<ReadonlySet<number>>(new Set());
	// Chỉ cảnh báo khi dạng suy luận gán được ở part này — server từ chối type
	// ngoài catalog của part, nên nút 1-click không được đề xuất type đó.
	const warnRuns = inferredRuns(items, typeId).filter((run) =>
		typeCatalog.some((entry) => entry.id === run.type),
	);
	const warnRunStartingAt = (index: number) =>
		warnRuns.find((run) => run.indices[0] === index);
	/** Đặt type cho cả dải — chỉ đổi `type`, giữ stem/answer/alts/pin (đáp án
	 * TRUE/FALSE/NOT GIVEN đã hợp lệ với kind mới). */
	const applyRunType = (run: InferredRun) => {
		const targets = new Set(run.indices);
		onItemsChange(
			items.map((item, index) =>
				targets.has(index) ? { ...item, type: run.type } : item,
			),
		);
		// Nút bị gỡ cùng cảnh báo — trả focus về hàng đầu của dải để người dùng
		// bàn phím không rơi về document.body.
		focusRowAfterAdd(run.indices[0]);
	};
	const update = (index: number, patch: Partial<QuestionItem>) => {
		onItemsChange(
			items.map((item, itemIndex) =>
				itemIndex === index ? { ...item, ...patch } : item,
			),
		);
	};
	/** Đổi dạng bài của 1 câu: reset opts/answer theo kind mới (đáp án cũ có
	 * thể sai kind) nhưng GIỮ stem; pin chỉ giữ khi type hiệu dụng vẫn là
	 * loại ảnh — pin trên câu không-ảnh sẽ route câu vào PinOverlay lệch.
	 * "" = theo dạng đề (type null). */
	const changeRowType = (index: number, nextType: string) => {
		const item = items[index];
		if (rowTypeOf(item) === (nextType || typeId)) return;
		const fresh = nextType ? emptyItem(nextType) : emptyItem(typeId);
		const nextEffective = nextType || typeId;
		update(index, {
			...fresh,
			stem: item.stem,
			pin: isImageBased(skill, nextEffective) ? item.pin : null,
			type: nextType ? nextType : null,
		});
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
		// #424 Task 1.6 — hàng mở cũng theo chỉ số: hàng bị xóa thì đóng, hàng
		// dưới trượt lên thì giữ đúng nội dung đang mở.
		if (collapsible && openRow !== null) {
			if (openRow === index) onOpenRowChange?.(null);
			else if (openRow > index) onOpenRowChange?.(openRow - 1);
		}
	};
	/** #424 Task 1.6 — đổi thứ tự hàng bên trong grid (mirror `remove`):
	 * hoán đổi item, remap `blurred`, dời hàng mở theo nội dung. */
	const moveRow = (index: number, dir: -1 | 1) => {
		const target = index + dir;
		if (target < 0 || target >= items.length) return;
		const next = [...items];
		const swapped = next[target];
		next[target] = next[index];
		next[index] = swapped;
		onItemsChange(next);
		setBlurred((current) => {
			const nextSet = new Set<number>();
			for (const blurredIndex of current) {
				if (blurredIndex === index) nextSet.add(target);
				else if (blurredIndex === target) nextSet.add(index);
				else nextSet.add(blurredIndex);
			}
			return nextSet;
		});
		if (collapsible && openRow !== null) {
			if (openRow === index) onOpenRowChange?.(target);
			else if (openRow === target) onOpenRowChange?.(index);
		}
	};
	/** #424 Task 1.1 — giải thích rich text; plain text rỗng thì xóa key
	 * (không lưu chuỗi rỗng lên wire schema). */
	const updateExplanation = (index: number, value: string) => {
		onItemsChange(
			items.map((item, itemIndex) => {
				if (itemIndex !== index) return item;
				if (htmlToPlainText(value).trim() === "") {
					const next = { ...item };
					delete next.explanation;
					return next;
				}
				return { ...item, explanation: value };
			}),
		);
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
		// #424 Task 1.1 — ô giải thích là contenteditable: Enter phải xuống
		// dòng trong ProseMirror, Backspace phải xóa chữ — không thêm/xóa câu.
		const editingRichText = target.isContentEditable;
		if (event.key === "Enter" && !editingRichText) {
			event.preventDefault();
			if (onAddQuestion()) focusRowAfterAdd(index + 1);
			return;
		}
		if (
			!editingRichText &&
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
		// Phím tắt đáp án theo kind CỦA CÂU đang focus.
		const rowItem = items[index];
		const rowKind = kindOf(rowTypeOf(rowItem));
		const choices = rowChoicesOf(rowItem);
		if (!choices) return;
		const wanted = event.key.toLowerCase();
		const hit =
			KEY_ANSWERS[rowKind]?.[wanted] ??
			((rowKind === "mcq4" || rowKind === "mcq3" || rowKind === "letter") &&
			/^[a-h]$/.test(wanted)
				? wanted.toUpperCase()
				: rowKind === "roman" && /^[1-8]$/.test(wanted)
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
				className="hidden gap-2 px-1 font-medium text-muted-foreground text-xs sm:grid sm:grid-cols-[3.5rem_1fr_14rem_2rem]"
			>
				<span>Câu</span>
				<span>Nội dung câu hỏi phía học viên</span>
				<span>Đáp án đúng · học viên không thấy</span>
			</div>
			{items.map((item, index) => {
				const number = qStart + index;
				const rowKind = kindOf(rowTypeOf(item));
				const choices = rowChoicesOf(item);
				// FR4 (sentend): labels keyed on another row are unusable here.
				const enforceDistinct = rowTypeOf(item) === "sentend";
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
				const mcqChoices =
					rowKind === "mcq4" || rowKind === "mcq3" ? choices : null;
				const options = item.opts ?? mcqChoices?.map(() => "") ?? [];
				// FR4 (sentend): labels keyed on another row are unusable here.
				const usedByOthers = new Set(
					items
						.filter((_, otherIndex) => otherIndex !== index)
						.map((other) => other.answer.trim()),
				);
				const warnRun = warnRunStartingAt(index);
				const warnLabels = warnRun ? INFERRED_TYPE_LABELS[warnRun.type] : null;
				const rangeLabel = warnRun ? runRangeLabel(warnRun, qStart) : "";
				// #424 Task 1.6 — hàng có lỗi ĐANG HIỆN luôn coi như mở (force-open),
				// bất kể openRow; nút thu gọn của hàng đó ẩn theo.
				const forceOpen = collapsible && errorEntries.length > 0;
				const isOpen = !collapsible || forceOpen || openRow === index;
				const summary = collapsible
					? questionSummary(item, typeId, optionBank)
					: null;
				const toggleRow = collapsible
					? () => {
							if (isOpen) {
								// Collapse chủ động: bỏ cờ blur của chính hàng này để
								// blur-mới không đánh dấu rồi ép mở lại ngay.
								setBlurred((current) => {
									const next = new Set(current);
									next.delete(index);
									return next;
								});
								onOpenRowChange?.(null);
							} else {
								onOpenRowChange?.(index);
							}
						}
					: undefined;
				return (
					<Fragment key={`${partId}-${index}`}>
						{warnRun && warnLabels && (
							// Sibling đứng TRƯỚC fieldset (không lồng): Enter trong fieldset
							// thêm câu mới, nên nút phải nằm ngoài nó.
							<fieldset
								aria-label={`Gợi ý dạng bài câu ${rangeLabel}`}
								className="flex min-w-0 flex-col gap-2 rounded-md bg-accent p-3 text-primary text-xs sm:flex-row sm:items-center sm:justify-between"
							>
								<p>
									Câu {rangeLabel} có đáp án dạng {warnLabels.answers} nhưng
									đang theo dạng đề{" "}
									{typeCatalog.find((entry) => entry.id === typeId)?.label ??
										typeId}
									. Học viên sẽ thấy lựa chọn {warnLabels.kind}; nên gán dạng
									cho đúng.
								</p>
								<Button
									type="button"
									size="sm"
									variant="secondary"
									onClick={() => applyRunType(warnRun)}
								>
									Đặt dạng {warnLabels.kind} cho câu {rangeLabel}
								</Button>
							</fieldset>
						)}
						{collapsible && (
							<div
								id={`${rowIdPrefix ?? partId}-q${index}`}
								className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border bg-muted p-2"
							>
								<strong className="font-mono text-sm">Câu {number}</strong>
								{!isOpen && summary && (
									<>
										<span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
											{summary.excerpt}
										</span>
										{summary.choiceCount !== null && (
											<span className="whitespace-nowrap rounded-full border border-border px-[10px] py-[4px] font-medium text-muted-foreground text-xs">
												{summary.choiceCount} lựa chọn
											</span>
										)}
										<span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-[10px] py-[4px] text-muted-foreground text-xs">
											<span
												aria-hidden="true"
												className={cn(
													"size-2 rounded-full",
													summary.hasAnswer ? "bg-success" : "bg-warn",
												)}
											/>
											{summary.hasAnswer ? "Có đáp án" : "Thiếu đáp án"}
										</span>
										{summary.hasExplanation && (
											<span className="whitespace-nowrap rounded-full border border-border px-[10px] py-[4px] font-medium text-muted-foreground text-xs">
												Có giải thích
											</span>
										)}
									</>
								)}
								<div className="ml-auto shrink-0">
									<CardControls
										label={`câu ${number}`}
										open={isOpen}
										onToggle={forceOpen ? undefined : toggleRow}
										onMoveUp={() => moveRow(index, -1)}
										onMoveDown={() => moveRow(index, 1)}
										onRemove={
											items.length > 1 ? () => remove(index) : undefined
										}
										canMoveUp={index > 0}
										canMoveDown={index < items.length - 1}
									/>
								</div>
							</div>
						)}
						{isOpen && (
							<fieldset
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
									"grid gap-2 rounded-md border bg-muted p-3 outline-none focus-visible:border-primary sm:grid-cols-[3.5rem_1fr_14rem_2rem] sm:items-start",
									selectedIndex === index ? "border-primary" : "border-border",
									collapsible && "ring-2 ring-ring/50",
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
																idx === optionIndex
																	? event.target.value
																	: value,
															),
														})
													}
												/>
											))}
										</div>
									)}
								</div>
								<div className="flex flex-col gap-1">
									<Select
										value={item.type ?? ""}
										aria-label={`Dạng bài câu ${number}`}
										onChange={(event) =>
											changeRowType(index, event.target.value)
										}
										className="w-full text-xs"
									>
										<option value="">
											Theo dạng đề ·{" "}
											{typeCatalog.find((entry) => entry.id === typeId)
												?.label ?? typeId}
										</option>
										{typeCatalog.map((entry) => (
											<option key={entry.id} value={entry.id}>
												{entry.label}
											</option>
										))}
									</Select>
									{choices && rowKind !== "text" ? (
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
																? "border-primary bg-primary text-primary-foreground"
																: "border-border bg-background text-muted-foreground hover:border-primary",
															taken &&
																"cursor-not-allowed opacity-40 hover:border-border",
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
								{!collapsible && items.length > 1 ? (
									// Xóa câu = phá hủy nội dung đã nhập → đỏ destructive.
									// Chế độ thu gọn: nút xóa sống trong CardControls của header.
									<Button
										type="button"
										size="sm"
										variant="danger"
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
											<p key={key} className="text-destructive text-xs">
												{rowErrors[key]}
											</p>
										))}
									</div>
								)}
								{showExplanation && (
									<div className="sm:col-span-4">
										<Field label={`Giải thích câu ${number}`}>
											<RichTextEditor
												value={item.explanation ?? ""}
												onChange={(value) => updateExplanation(index, value)}
												contentClassName="[&_.ProseMirror]:min-h-16"
											/>
										</Field>
									</div>
								)}
							</fieldset>
						)}
					</Fragment>
				);
			})}
		</section>
	);
}
