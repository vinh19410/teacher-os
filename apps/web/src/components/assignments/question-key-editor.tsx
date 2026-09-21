import { Button } from "@/components/ui/button";
import { ChipFilter } from "@/components/ui/chip-filter";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
	answerChoices,
	emptyItem,
	kindOf,
	type QuestionItem,
	qStartOf,
} from "./assignment-presets";

export function QuestionKeyEditor({
	skill,
	partId,
	typeId,
	intro,
	items,
	showErrors,
	onIntroChange,
	onItemsChange,
}: {
	skill: string;
	partId: string;
	typeId: string;
	intro: string;
	items: QuestionItem[];
	showErrors: boolean;
	onIntroChange: (value: string) => void;
	onItemsChange: (items: QuestionItem[]) => void;
}) {
	const kind = kindOf(typeId);
	const choices = answerChoices(kind);
	const update = (index: number, patch: Partial<QuestionItem>) => {
		const next = items.map((item, itemIndex) =>
			itemIndex === index ? { ...item, ...patch } : item,
		);
		onItemsChange(next);
	};
	return (
		<div className="flex flex-col gap-4 rounded-md border border-line bg-bg p-4">
			<div>
				<h3 className="font-display font-semibold text-base">
					Câu hỏi và đáp án đúng
				</h3>
				<p className="text-muted-fg text-xs">
					Đáp án đúng chỉ dùng để chấm tự động; học viên không thấy.
				</p>
			</div>
			<Field label="Hướng dẫn đề">
				<Textarea
					value={intro}
					onChange={(event) => onIntroChange(event.target.value)}
					className="min-h-24"
				/>
			</Field>
			<div className="flex flex-col gap-3">
				{items.map((item, index) => (
					<div
						key={`${index}-${qStartOf(skill, partId)}`}
						className="rounded-md border border-line bg-surface p-3"
					>
						<div className="mb-3 flex items-center justify-between">
							<strong className="text-sm">
								Câu {qStartOf(skill, partId) + index}
							</strong>
							{items.length > 1 && (
								<Button
									type="button"
									size="sm"
									variant="ghost"
									onClick={() =>
										onItemsChange(
											items.filter((_, itemIndex) => itemIndex !== index),
										)
									}
								>
									Xóa
								</Button>
							)}
						</div>
						<Field
							label="Nội dung câu hỏi phía học viên"
							error={
								showErrors && !item.stem.trim()
									? "Nhập nội dung câu hỏi."
									: undefined
							}
						>
							<Input
								value={item.stem}
								onChange={(event) =>
									update(index, { stem: event.target.value })
								}
							/>
						</Field>
						{choices && choices.length > 0 && kind !== "text" ? (
							<div className="mt-3 flex flex-col gap-2">
								<span className="font-medium text-muted-fg text-xs">
									Đáp án đúng · học viên không thấy
								</span>
								<ChipFilter
									options={[...choices]}
									value={item.answer}
									onChange={(answer) => update(index, { answer })}
								/>
								{(kind === "mcq4" || kind === "mcq3") && (
									<div className="grid gap-2 sm:grid-cols-2">
										{(item.opts ?? choices.map(() => "")).map(
											(option, optionIndex) => (
												<Input
													key={optionIndex}
													value={option}
													placeholder={`Lựa chọn ${choices[optionIndex]}`}
													onChange={(event) =>
														update(index, {
															opts: (item.opts ?? choices.map(() => "")).map(
																(value, idx) =>
																	idx === optionIndex
																		? event.target.value
																		: value,
															),
														})
													}
												/>
											),
										)}
									</div>
								)}
							</div>
						) : (
							<div className="mt-3 grid gap-2 sm:grid-cols-2">
								<Field
									label="Đáp án chấm tự động"
									error={
										showErrors && !item.answer.trim()
											? "Khóa đáp án đúng."
											: undefined
									}
								>
									<Input
										value={item.answer}
										onChange={(event) =>
											update(index, { answer: event.target.value })
										}
									/>
								</Field>
								<Field label="Chấp nhận thêm, cách nhau bằng /">
									<Input
										value={item.alts}
										onChange={(event) =>
											update(index, { alts: event.target.value })
										}
									/>
								</Field>
							</div>
						)}
					</div>
				))}
			</div>
			<Button
				type="button"
				variant="secondary"
				onClick={() => onItemsChange([...items, emptyItem(typeId)])}
			>
				Thêm câu
			</Button>
			<p className="text-right font-mono text-[11px] text-meta">
				{items
					.map(
						(item, index) =>
							`${qStartOf(skill, partId) + index} ${item.answer.trim() || "—"}`,
					)
					.join(" · ")}
			</p>
		</div>
	);
}
