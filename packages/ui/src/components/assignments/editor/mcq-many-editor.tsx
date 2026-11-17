import { ASSIGNMENT_ANSWER_CHOICES } from "@teacher-os/api/contracts";
import { collapseWhitespace, htmlToPlainText } from "@teacher-os/api/rich-text";
import { Button } from "@teacher-os/ui/components/web-kit/button";
import { Field, Input } from "@teacher-os/ui/components/web-kit/field";
import { RichTextEditor } from "@teacher-os/ui/components/web-kit/rich-text-editor";
import { useState } from "react";
import {
	QUESTION_EXPLANATION_MAX,
	QUESTION_EXPLANATION_RAW_MAX,
	QUESTION_MAX_COUNT,
	QUESTION_OPTION_MAX,
	QUESTION_STEM_MAX,
} from "./answer-key-grid";
import { emptyItem, type QuestionItem } from "./assignment-presets";

const LETTERS = ASSIGNMENT_ANSWER_CHOICES.letter;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;
const DEFAULT_OPTION_COUNT = 5;

function createAnswerSetId(): string {
	const raw =
		typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
			? crypto.randomUUID().replace(/-/g, "")
			: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
	return `set-${raw.slice(0, 12)}`;
}

export interface McqManyCluster {
	answerSet: string;
	stem: string;
	opts: string[];
	checkedLetters: string[];
	explanation: string;
	type?: string | null;
	sourceLength: number;
}

function normalizeOpts(opts: string[] | null | undefined): string[] {
	const list = opts ? [...opts] : [];
	if (list.length === 0) {
		return Array.from({ length: DEFAULT_OPTION_COUNT }, () => "");
	}
	while (list.length < MIN_OPTIONS) list.push("");
	return list.slice(0, MAX_OPTIONS);
}

/**
 * Gom các câu `mcq_many` liên tiếp có cùng `answerSet` thành từng cụm.
 * Nếu `items` rỗng hoặc chưa có `answerSet` (ví dụ `[emptyItem("mcq_many")]`),
 * gom thành 1 cụm với `fallbackSetId` (≤ 20 ký tự) và tối thiểu 2 câu.
 */
export function parseMcqManyClusters(
	items: readonly QuestionItem[],
	fallbackSetId: string,
): McqManyCluster[] {
	if (items.length === 0) {
		const fresh = emptyItem("mcq_many");
		return [
			{
				answerSet: fallbackSetId,
				stem: fresh.stem,
				opts: normalizeOpts(fresh.opts),
				checkedLetters: [],
				explanation: "",
				sourceLength: 2,
			},
		];
	}

	const groups: { answerSet: string; items: QuestionItem[] }[] = [];
	let unkeyedCounter = 0;

	for (const item of items) {
		const setKey = item.answerSet?.trim() ?? "";
		const last = groups[groups.length - 1];
		if (setKey) {
			if (last && last.answerSet === setKey) {
				last.items.push(item);
			} else {
				groups.push({ answerSet: setKey, items: [item] });
			}
		} else if (last?.items[0] && !last.items[0].answerSet?.trim()) {
			last.items.push(item);
		} else {
			const id =
				unkeyedCounter === 0
					? fallbackSetId
					: `${fallbackSetId.slice(0, 16)}-${unkeyedCounter}`;
			unkeyedCounter += 1;
			groups.push({ answerSet: id, items: [item] });
		}
	}

	return groups.map((group) => {
		const first = group.items[0];
		const opts = normalizeOpts(first?.opts);
		const validLetters = LETTERS.slice(0, opts.length);
		const checkedSet = new Set<string>();
		for (const item of group.items) {
			const ans = item.answer.trim();
			if (validLetters.includes(ans as (typeof LETTERS)[number])) {
				checkedSet.add(ans);
			}
		}
		const checkedLetters = validLetters.filter((letter) =>
			checkedSet.has(letter),
		);
		const explanation =
			group.items.find((item) => item.explanation?.trim())?.explanation ?? "";
		return {
			answerSet: group.answerSet,
			stem:
				group.items.find((item) => item.stem.trim())?.stem ?? first?.stem ?? "",
			opts,
			checkedLetters,
			explanation,
			type: first?.type,
			sourceLength: group.items.length,
		};
	});
}

function clusterToItems(cluster: McqManyCluster): QuestionItem[] {
	const count = Math.max(2, cluster.checkedLetters.length);
	const validLetters = LETTERS.slice(0, cluster.opts.length);
	const sorted = validLetters.filter((letter) =>
		cluster.checkedLetters.includes(letter),
	);
	const cleanExplanation =
		htmlToPlainText(cluster.explanation).trim() !== ""
			? cluster.explanation
			: undefined;

	return Array.from({ length: count }, (_, index) => ({
		stem: cluster.stem,
		opts: [...cluster.opts],
		answer: sorted[index] ?? "",
		alts: "",
		pin: null,
		answerSet: cluster.answerSet,
		...(cluster.type !== undefined ? { type: cluster.type } : {}),
		...(index === 0 && cleanExplanation
			? { explanation: cleanExplanation }
			: {}),
	}));
}

function clusterErrors(
	cluster: McqManyCluster,
	requireFilled: boolean,
): string[] {
	const errors: string[] = [];
	if (cluster.stem.trim().length > QUESTION_STEM_MAX) {
		errors.push(`Nội dung câu hỏi vượt quá ${QUESTION_STEM_MAX} ký tự.`);
	} else if (requireFilled && !cluster.stem.trim()) {
		errors.push("Nhập nội dung câu hỏi.");
	}
	if (cluster.opts.some((opt) => opt.length > QUESTION_OPTION_MAX)) {
		errors.push(`Lựa chọn vượt quá ${QUESTION_OPTION_MAX} ký tự.`);
	} else if (
		requireFilled &&
		cluster.opts.filter((opt) => opt.trim().length > 0).length < MIN_OPTIONS
	) {
		errors.push("Cần ít nhất 2 lựa chọn có nội dung.");
	}
	if (requireFilled && cluster.checkedLetters.length < 2) {
		errors.push("Chọn ít nhất 2 đáp án đúng.");
	}
	if (cluster.explanation) {
		if (
			collapseWhitespace(htmlToPlainText(cluster.explanation)).length >
			QUESTION_EXPLANATION_MAX
		) {
			errors.push(`Giải thích vượt quá ${QUESTION_EXPLANATION_MAX} ký tự.`);
		} else if (
			cluster.explanation.trim().length > QUESTION_EXPLANATION_RAW_MAX
		) {
			errors.push(
				`Giải thích vượt quá ${QUESTION_EXPLANATION_RAW_MAX} ký tự tính cả định dạng.`,
			);
		}
	}
	return errors;
}

export function McqManyEditor({
	items,
	qStart = 1,
	showErrors,
	requireFilled = true,
	showExplanation = false,
	maxTotalQuestions = QUESTION_MAX_COUNT,
	lockAddQuestion = false,
	onItemsChange,
}: {
	items: QuestionItem[];
	qStart?: number;
	showErrors: boolean;
	requireFilled?: boolean;
	showExplanation?: boolean;
	maxTotalQuestions?: number;
	lockAddQuestion?: boolean;
	onItemsChange: (items: QuestionItem[]) => void;
}) {
	const [fallbackSetId] = useState(() => createAnswerSetId());
	const clusters = parseMcqManyClusters(items, fallbackSetId);

	const totalEmittedCount = clusters.reduce(
		(sum, cluster) => sum + Math.max(2, cluster.checkedLetters.length),
		0,
	);
	const canAddCluster =
		!lockAddQuestion && totalEmittedCount + 2 <= maxTotalQuestions;

	const emitClusters = (nextClusters: McqManyCluster[]) => {
		onItemsChange(nextClusters.flatMap(clusterToItems));
	};

	const updateCluster = (
		clusterIndex: number,
		updater: (cluster: McqManyCluster) => McqManyCluster,
	) => {
		emitClusters(
			clusters.map((cluster, idx) =>
				idx === clusterIndex ? updater(cluster) : cluster,
			),
		);
	};

	const addCluster = () => {
		if (!canAddCluster) return;
		const fresh = emptyItem("mcq_many");
		emitClusters([
			...clusters,
			{
				answerSet: createAnswerSetId(),
				stem: fresh.stem,
				opts: normalizeOpts(fresh.opts),
				checkedLetters: [],
				explanation: "",
				sourceLength: 2,
			},
		]);
	};

	const removeCluster = (clusterIndex: number) => {
		if (clusters.length <= 1) return;
		emitClusters(clusters.filter((_, idx) => idx !== clusterIndex));
	};

	let cursor = qStart;
	return (
		<section
			aria-label="Soạn câu hỏi chọn nhiều đáp án"
			className="flex flex-col gap-3"
		>
			{clusters.map((cluster, clusterIndex) => {
				const count = Math.max(
					2,
					cluster.checkedLetters.length,
					cluster.sourceLength,
				);
				const first = cursor;
				const last = cursor + count - 1;
				cursor = last + 1;

				const targetCount = Math.max(2, cluster.checkedLetters.length);
				const errors = showErrors ? clusterErrors(cluster, requireFilled) : [];
				const canGrowByChecking =
					cluster.checkedLetters.length < 2 ||
					(!lockAddQuestion && totalEmittedCount < maxTotalQuestions);

				return (
					<fieldset
						key={cluster.answerSet}
						aria-label={`Cụm câu ${first}–${last}`}
						className="flex flex-col gap-3 rounded-md border border-border bg-card p-3"
					>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<p className="font-medium text-sm">
								Câu {first}–{last} · Chọn {targetCount} đáp án đúng
							</p>
							{clusters.length > 1 && (
								<Button
									type="button"
									size="sm"
									variant="danger"
									aria-label={`Xóa cụm câu ${first}–${last}`}
									onClick={() => removeCluster(clusterIndex)}
								>
									Xóa cụm
								</Button>
							)}
						</div>

						<Field label="Nội dung câu hỏi chung">
							<Input
								value={cluster.stem}
								aria-label="Nội dung câu hỏi chung"
								placeholder="Ví dụ: Which TWO of the following statements are true?"
								maxLength={QUESTION_STEM_MAX}
								onChange={(event) =>
									updateCluster(clusterIndex, (current) => ({
										...current,
										stem: event.target.value,
									}))
								}
							/>
						</Field>

						<div className="flex flex-col gap-2">
							<p className="font-medium text-muted-foreground text-xs">
								Các lựa chọn (tích để đánh dấu đáp án đúng)
							</p>
							{cluster.opts.map((optValue, optIndex) => {
								const letter = LETTERS[optIndex];
								if (!letter) return null;
								const isChecked = cluster.checkedLetters.includes(letter);
								const disableCheck = !isChecked && !canGrowByChecking;
								return (
									<div key={letter} className="flex items-center gap-2">
										<input
											type="checkbox"
											checked={isChecked}
											disabled={disableCheck}
											aria-label={`Đáp án đúng ${letter}`}
											className="size-4 shrink-0 accent-primary"
											onChange={(event) => {
												const nextChecked = event.target.checked
													? [...cluster.checkedLetters, letter]
													: cluster.checkedLetters.filter((l) => l !== letter);
												updateCluster(clusterIndex, (current) => ({
													...current,
													checkedLetters: nextChecked,
												}));
											}}
										/>
										<span
											aria-hidden="true"
											className="w-6 text-center font-medium font-mono text-muted-foreground text-sm"
										>
											{letter}
										</span>
										<Input
											value={optValue}
											aria-label={`Lựa chọn ${letter}`}
											placeholder={`Lựa chọn ${letter}`}
											maxLength={QUESTION_OPTION_MAX}
											onChange={(event) =>
												updateCluster(clusterIndex, (current) => ({
													...current,
													opts: current.opts.map((val, idx) =>
														idx === optIndex ? event.target.value : val,
													),
												}))
											}
										/>
										{cluster.opts.length > MIN_OPTIONS && (
											<Button
												type="button"
												size="sm"
												variant="ghost"
												aria-label={`Xóa lựa chọn ${letter}`}
												onClick={() =>
													updateCluster(clusterIndex, (current) => {
														const nextOpts = current.opts.filter(
															(_, idx) => idx !== optIndex,
														);
														const nextChecked: string[] = [];
														for (const checked of current.checkedLetters) {
															const idx = LETTERS.indexOf(
																checked as (typeof LETTERS)[number],
															);
															if (idx < 0 || idx === optIndex) continue;
															const shifted =
																idx > optIndex ? LETTERS[idx - 1] : checked;
															if (shifted) nextChecked.push(shifted);
														}
														return {
															...current,
															opts: nextOpts,
															checkedLetters: nextChecked,
														};
													})
												}
											>
												Xóa
											</Button>
										)}
									</div>
								);
							})}
							<div>
								<Button
									type="button"
									size="sm"
									variant="secondary"
									disabled={cluster.opts.length >= MAX_OPTIONS}
									onClick={() =>
										updateCluster(clusterIndex, (current) =>
											current.opts.length >= MAX_OPTIONS
												? current
												: { ...current, opts: [...current.opts, ""] },
										)
									}
								>
									+ Thêm lựa chọn
								</Button>
							</div>
						</div>

						{showExplanation && (
							<Field label={`Giải thích câu ${first}–${last}`}>
								<RichTextEditor
									value={cluster.explanation}
									onChange={(value) =>
										updateCluster(clusterIndex, (current) => ({
											...current,
											explanation: value,
										}))
									}
									contentClassName="[&_.ProseMirror]:min-h-16"
								/>
							</Field>
						)}

						{errors.length > 0 && (
							<div role="alert" className="flex flex-col gap-0.5">
								{errors.map((message) => (
									<p key={message} className="text-destructive text-xs">
										{message}
									</p>
								))}
							</div>
						)}
					</fieldset>
				);
			})}

			<div>
				<Button
					type="button"
					variant="secondary"
					disabled={!canAddCluster}
					onClick={addCluster}
				>
					+ Thêm cụm chọn nhiều
				</Button>
			</div>
		</section>
	);
}
