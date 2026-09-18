import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SectionLabel } from "@/components/ui/section-label";
import { taskOf, wordCount } from "./assignment-presets";

export interface ComposerValue {
	task: string;
	genre: string;
	title: string;
	band: string;
	source: string;
	prompt: string;
	note: string;
}

/**
 * "Đề bài" card — the composer half of design v3. Controlled from the page;
 * validation errors are page-owned so they only appear after a submit.
 */
export function PromptComposer({
	value,
	errors = {},
	showErrors,
	onFieldChange,
}: {
	value: ComposerValue;
	errors?: { title?: string; prompt?: string };
	showErrors: boolean;
	onFieldChange: (patch: Partial<ComposerValue>) => void;
}) {
	const task = taskOf(value.task);
	const genre = task.genres.find((g) => g.id === value.genre) ?? task.genres[0];

	return (
		<Card variant="white" className="flex flex-col gap-4">
			<div>
				<SectionLabel>Đề bài</SectionLabel>
				<h2 className="font-display font-semibold text-[22px]">
					Writing Academic
				</h2>
			</div>

			<div className="flex flex-col gap-1.5">
				<span className="font-medium text-muted-fg text-xs">Dạng bài</span>
				<ChipFilter
					options={["Task 1 · 150 từ", "Task 2 · 250 từ"]}
					value={
						task.label === "Task 1" ? "Task 1 · 150 từ" : "Task 2 · 250 từ"
					}
					onChange={(label) =>
						onFieldChange({
							task: label.startsWith("Task 1") ? "task1" : "task2",
						})
					}
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<span className="font-medium text-muted-fg text-xs">Dạng đề</span>
				<ChipFilter
					options={task.genres.map((g) => g.label)}
					value={genre.label}
					onChange={(label) =>
						onFieldChange({
							genre:
								task.genres.find((g) => g.label === label)?.id ??
								task.genres[0].id,
						})
					}
				/>
			</div>

			<Field
				label="Tiêu đề"
				help={showErrors ? errors?.title : undefined}
				error={showErrors ? errors?.title : undefined}
			>
				<Input
					value={value.title}
					onChange={(e) => onFieldChange({ title: e.target.value })}
					placeholder="Writing Task 2 — Discuss both views"
				/>
			</Field>

			<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
				<div className="flex flex-col gap-1.5">
					<span className="font-medium text-muted-fg text-xs">
						Band mục tiêu
					</span>
					<ChipFilter
						options={["6.0", "6.5", "7.0", "7.5"]}
						value={value.band}
						onChange={(band) => onFieldChange({ band })}
					/>
				</div>
				<Field label="Nguồn đề">
					<Input
						value={value.source}
						onChange={(e) => onFieldChange({ source: e.target.value })}
						placeholder="Cambridge IELTS 10, Test 2"
					/>
				</Field>
			</div>

			<Field
				label="Nội dung đề"
				help={task.help}
				error={showErrors ? errors?.prompt : undefined}
			>
				<Textarea
					value={value.prompt}
					onChange={(e) => onFieldChange({ prompt: e.target.value })}
					className="min-h-42"
				/>
			</Field>
			<div className="-mt-3 flex items-center justify-between">
				<span />
				<span className="font-mono text-meta text-xs">
					{wordCount(value.prompt)} từ
				</span>
			</div>

			<Field label="Hướng dẫn thêm (không bắt buộc)">
				<Textarea
					value={value.note}
					onChange={(e) => onFieldChange({ note: e.target.value })}
					className="min-h-22"
					placeholder="Ví dụ: lập dàn ý 4 đoạn, nêu rõ lập luận đối lập ở đoạn 3."
				/>
			</Field>
		</Card>
	);
}
