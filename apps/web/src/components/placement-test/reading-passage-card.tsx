import {
	PLACEMENT_MAX_PASSAGE_QUESTIONS,
	PLACEMENT_PASSAGE_BODY_MAX,
	type PlacementPublishIssue,
	type PlacementReadingPassage,
	type PlacementReadingPassageKind,
	type PlacementReadingQuestion,
} from "@teacher-os/api/placement-test-contracts";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputCls, Select } from "@/components/ui/field";
import { QuestionCard } from "./question-card";

const PASSAGE_KIND_LABELS: Record<PlacementReadingPassageKind, string> = {
	sign: "Biển báo / Thông báo ngắn",
	message: "Tin nhắn / Email ngắn",
	passage: "Bài đọc hiểu (Passage)",
	cloze: "Đoạn văn điền từ (Cloze)",
};

export interface ReadingPassageCardProps {
	passage: PlacementReadingPassage;
	passageIndex: number;
	startQuestionNumber: number;
	canMoveUp: boolean;
	canMoveDown: boolean;
	canRemove: boolean;
	issues: readonly PlacementPublishIssue[];
	onUpdatePassage: (patch: Partial<PlacementReadingPassage>) => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onRemove: () => void;
	onAddQuestion: () => void;
	onUpdateQuestion: (
		questionIndex: number,
		patch: Partial<PlacementReadingQuestion>,
	) => void;
	onMoveQuestion: (fromIndex: number, toIndex: number) => void;
	onRemoveQuestion: (questionIndex: number) => void;
}

export function ReadingPassageCard({
	passage,
	passageIndex,
	startQuestionNumber,
	canMoveUp,
	canMoveDown,
	canRemove,
	issues,
	onUpdatePassage,
	onMoveUp,
	onMoveDown,
	onRemove,
	onAddQuestion,
	onUpdateQuestion,
	onMoveQuestion,
	onRemoveQuestion,
}: ReadingPassageCardProps) {
	const passagePath = `parts.2.passages.${passageIndex}`;
	const passageLevelIssues = issues.filter(
		(item) =>
			item.path === passagePath ||
			item.path === `${passagePath}.id` ||
			item.path === `${passagePath}.body` ||
			item.path === `${passagePath}.questions`,
	);

	return (
		<Card
			data-passage-path={passagePath}
			data-passage-id={passage.id}
			className="flex flex-col gap-4"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="flex items-center gap-2">
						<h3 className="font-semibold text-base text-foreground">
							Bài đọc {passageIndex + 1}
							{passage.partLabel ? ` · ${passage.partLabel}` : ""}
						</h3>
						<span className="font-mono text-muted-foreground text-xs">
							({passage.id})
						</span>
					</div>
					<p className="text-muted-foreground text-xs">
						{passage.questions.length} câu hỏi •{" "}
						{PASSAGE_KIND_LABELS[passage.kind]}
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Button
						variant="outline"
						size="icon-sm"
						disabled={!canMoveUp}
						onClick={onMoveUp}
						aria-label={`Chuyển bài đọc ${passageIndex + 1} lên`}
					>
						<ArrowUp className="size-3.5" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={!canMoveDown}
						onClick={onMoveDown}
						aria-label={`Chuyển bài đọc ${passageIndex + 1} xuống`}
					>
						<ArrowDown className="size-3.5" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={!canRemove}
						onClick={onRemove}
						aria-label={`Xóa bài đọc ${passageIndex + 1}`}
					>
						<Trash2 className="size-3.5 text-destructive" />
					</Button>
				</div>
			</div>

			<div className="grid gap-3 md:grid-cols-[120px_220px_1fr]">
				<label className="block font-medium text-muted-foreground text-xs">
					Nhãn phần
					<input
						type="text"
						maxLength={60}
						aria-label={`Nhãn bài đọc ${passageIndex + 1}`}
						value={passage.partLabel}
						onChange={(e) => onUpdatePassage({ partLabel: e.target.value })}
						placeholder="Part 3A"
						className={`${inputCls} mt-1 w-full`}
					/>
				</label>

				<label
					className="block font-medium text-muted-foreground text-xs"
					htmlFor={`passage-kind-${passage.id}`}
				>
					Định dạng hiển thị
					<Select
						id={`passage-kind-${passage.id}`}
						aria-label={`Loại bài đọc ${passageIndex + 1}`}
						value={passage.kind}
						onChange={(e) =>
							onUpdatePassage({
								kind: e.target.value as PlacementReadingPassageKind,
							})
						}
						className="mt-1 w-full"
					>
						{Object.entries(PASSAGE_KIND_LABELS).map(([k, label]) => (
							<option key={k} value={k}>
								{label}
							</option>
						))}
					</Select>
				</label>

				<label className="block font-medium text-muted-foreground text-xs">
					Tiêu đề
					<input
						type="text"
						maxLength={200}
						aria-label={`Tiêu đề bài đọc ${passageIndex + 1}`}
						value={passage.title}
						onChange={(e) => onUpdatePassage({ title: e.target.value })}
						placeholder="Tiêu đề đoạn đọc..."
						className={`${inputCls} mt-1 w-full`}
					/>
				</label>
			</div>

			<label className="block font-medium text-muted-foreground text-xs">
				Hướng dẫn làm bài
				<input
					type="text"
					maxLength={1000}
					aria-label={`Hướng dẫn bài đọc ${passageIndex + 1}`}
					value={passage.instruction}
					onChange={(e) => onUpdatePassage({ instruction: e.target.value })}
					placeholder="Đọc đoạn văn / biển báo và chọn đáp án đúng..."
					className={`${inputCls} mt-1 w-full`}
				/>
			</label>

			<label className="block font-medium text-muted-foreground text-xs">
				Nội dung văn bản / biển báo / cloze
				<textarea
					rows={4}
					maxLength={PLACEMENT_PASSAGE_BODY_MAX}
					aria-label={`Nội dung bài đọc ${passageIndex + 1}`}
					value={passage.body}
					onChange={(e) => onUpdatePassage({ body: e.target.value })}
					placeholder="Nhập nội dung đoạn đọc hoặc biển báo..."
					className={`${inputCls} mt-1 min-h-[96px] w-full resize-y py-2`}
				/>
			</label>

			{passageLevelIssues.length > 0 && (
				<ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
					{passageLevelIssues.map((issue) => (
						<li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
					))}
				</ul>
			)}

			<div className="space-y-3">
				{passage.questions.map((question, qIdx) => (
					<QuestionCard
						key={question.id}
						question={question}
						displayNumber={startQuestionNumber + qIdx}
						basePath={`${passagePath}.questions.${qIdx}`}
						canMoveUp={qIdx > 0}
						canMoveDown={qIdx < passage.questions.length - 1}
						canRemove={passage.questions.length > 1}
						allowEmptyPrompt={passage.kind !== "passage"}
						issues={issues}
						onChange={(patch) => onUpdateQuestion(qIdx, patch)}
						onMoveUp={() => onMoveQuestion(qIdx, qIdx - 1)}
						onMoveDown={() => onMoveQuestion(qIdx, qIdx + 1)}
						onRemove={() => onRemoveQuestion(qIdx)}
					/>
				))}
			</div>

			<div>
				<Button
					variant="outline"
					size="sm"
					disabled={passage.questions.length >= PLACEMENT_MAX_PASSAGE_QUESTIONS}
					onClick={onAddQuestion}
				>
					<Plus className="size-3.5" />
					Thêm câu hỏi vào bài đọc {passageIndex + 1}
				</Button>
			</div>
		</Card>
	);
}
