import {
	PLACEMENT_LEVELS,
	PLACEMENT_OPTION_MAX,
	PLACEMENT_PROMPT_MAX,
	type PlacementListeningQuestion,
	type PlacementPublishIssue,
	type PlacementQuestionKind,
	type PlacementVgQuestion,
} from "@teacher-os/api/placement-test-contracts";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputCls, Select } from "@/components/ui/field";

const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

export interface QuestionCardProps {
	question: PlacementVgQuestion | PlacementListeningQuestion;
	displayNumber: number;
	basePath: string;
	canMoveUp: boolean;
	canMoveDown: boolean;
	canRemove: boolean;
	showKindSelector?: boolean;
	issues: readonly PlacementPublishIssue[];
	onChange: (
		patch: Partial<PlacementVgQuestion & PlacementListeningQuestion>,
	) => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onRemove: () => void;
}

export function QuestionCard({
	question,
	displayNumber,
	basePath,
	canMoveUp,
	canMoveDown,
	canRemove,
	showKindSelector = false,
	issues,
	onChange,
	onMoveUp,
	onMoveDown,
	onRemove,
}: QuestionCardProps) {
	const cardIssues = issues.filter(
		(item) => item.path === basePath || item.path.startsWith(`${basePath}.`),
	);

	return (
		<div
			data-question-path={basePath}
			data-question-id={question.id}
			className="rounded-lg border border-border bg-card p-4 shadow-xs"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-semibold text-foreground text-sm">
						Câu {displayNumber}
					</span>
					<span className="font-mono text-muted-foreground text-xs">
						({question.id})
					</span>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{showKindSelector && "kind" in question && (
						<label
							className="flex items-center gap-1.5 text-muted-foreground text-xs"
							htmlFor={`question-kind-${question.id}`}
						>
							<span>Phân loại</span>
							<Select
								id={`question-kind-${question.id}`}
								aria-label={`Phân loại câu ${displayNumber}`}
								value={question.kind}
								onChange={(e) =>
									onChange({
										kind: e.target.value as PlacementQuestionKind,
									})
								}
								className="h-8 w-auto py-1 text-xs"
							>
								<option value="grammar">Ngữ pháp</option>
								<option value="vocab">Từ vựng</option>
							</Select>
						</label>
					)}

					<label
						className="flex items-center gap-1.5 text-muted-foreground text-xs"
						htmlFor={`question-level-${question.id}`}
					>
						<span>Cấp độ</span>
						<Select
							id={`question-level-${question.id}`}
							aria-label={`Cấp độ câu ${displayNumber}`}
							value={question.level}
							onChange={(e) => onChange({ level: e.target.value })}
							className="h-8 w-auto py-1 text-xs"
						>
							{PLACEMENT_LEVELS.map((lvl) => (
								<option key={lvl} value={lvl}>
									{lvl}
								</option>
							))}
						</Select>
					</label>

					<Button
						variant="outline"
						size="icon-sm"
						disabled={!canMoveUp}
						onClick={onMoveUp}
						aria-label={`Chuyển câu ${displayNumber} lên`}
						title="Chuyển lên"
					>
						<ArrowUp className="size-3.5" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={!canMoveDown}
						onClick={onMoveDown}
						aria-label={`Chuyển câu ${displayNumber} xuống`}
						title="Chuyển xuống"
					>
						<ArrowDown className="size-3.5" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={!canRemove}
						onClick={onRemove}
						aria-label={`Xóa câu ${displayNumber}`}
						title="Xóa câu"
					>
						<Trash2 className="size-3.5 text-destructive" />
					</Button>
				</div>
			</div>

			<div className="mt-3">
				<label className="block font-medium text-muted-foreground text-xs">
					Nội dung câu hỏi {displayNumber}
					<textarea
						rows={2}
						maxLength={PLACEMENT_PROMPT_MAX}
						aria-label={`Nội dung câu ${displayNumber}`}
						value={question.prompt}
						onChange={(e) => onChange({ prompt: e.target.value })}
						placeholder="Nhập câu hỏi..."
						className={`${inputCls} mt-1 min-h-[60px] w-full resize-y py-2`}
					/>
				</label>
			</div>

			<fieldset className="mt-3">
				<legend className="font-medium text-muted-foreground text-xs">
					4 đáp án (chọn nút tròn ở đáp án đúng)
				</legend>
				<div className="mt-1.5 grid gap-2 sm:grid-cols-2">
					{OPTION_LETTERS.map((letter, optIdx) => {
						const isCorrect = question.answer === optIdx;
						return (
							<div
								key={letter}
								className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5"
							>
								<input
									type="radio"
									name={`correct-${question.id}`}
									aria-label={`Đáp án đúng ${letter} cho câu ${displayNumber}`}
									checked={isCorrect}
									onChange={() => onChange({ answer: optIdx })}
									className="size-4 shrink-0 accent-primary"
								/>
								<span className="w-5 shrink-0 font-mono font-semibold text-xs">
									{letter}.
								</span>
								<input
									type="text"
									maxLength={PLACEMENT_OPTION_MAX}
									aria-label={`Đáp án ${letter} câu ${displayNumber}`}
									value={question.options[optIdx] ?? ""}
									onChange={(e) => {
										const nextOptions: [string, string, string, string] = [
											question.options[0],
											question.options[1],
											question.options[2],
											question.options[3],
										];
										nextOptions[optIdx] = e.target.value;
										onChange({ options: nextOptions });
									}}
									placeholder={`Đáp án ${letter}`}
									className={`${inputCls} h-8 flex-1`}
								/>
							</div>
						);
					})}
				</div>
			</fieldset>

			{cardIssues.length > 0 && (
				<ul className="mt-2.5 space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
					{cardIssues.map((issue) => (
						<li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
					))}
				</ul>
			)}
		</div>
	);
}
