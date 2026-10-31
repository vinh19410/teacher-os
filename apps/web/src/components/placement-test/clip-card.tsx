import {
	PLACEMENT_CLIP_TITLE_MAX,
	PLACEMENT_LEVELS,
	PLACEMENT_MAX_CLIP_QUESTIONS,
	type PlacementAudioMeta,
	type PlacementClip,
	type PlacementListeningQuestion,
	type PlacementPublishIssue,
} from "@teacher-os/api/placement-test-contracts";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputCls } from "@/components/ui/field";
import type { UploadedPlacementAudio } from "@/lib/repos/placement-test";
import { ClipAudioField } from "./clip-audio-field";
import { QuestionCard } from "./question-card";

export interface ClipCardProps {
	clip: PlacementClip;
	clipIndex: number;
	startQuestionNumber: number;
	canMoveUp: boolean;
	canMoveDown: boolean;
	canRemove: boolean;
	audioMap: Record<string, PlacementAudioMeta>;
	issues: readonly PlacementPublishIssue[];
	onUpdateClip: (patch: Partial<PlacementClip>) => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onRemove: () => void;
	onAudioUploaded: (uploaded: UploadedPlacementAudio) => void;
	onAddQuestion: () => void;
	onUpdateQuestion: (
		questionIndex: number,
		patch: Partial<PlacementListeningQuestion>,
	) => void;
	onMoveQuestion: (fromIndex: number, toIndex: number) => void;
	onRemoveQuestion: (questionIndex: number) => void;
}

export function ClipCard({
	clip,
	clipIndex,
	startQuestionNumber,
	canMoveUp,
	canMoveDown,
	canRemove,
	audioMap,
	issues,
	onUpdateClip,
	onMoveUp,
	onMoveDown,
	onRemove,
	onAudioUploaded,
	onAddQuestion,
	onUpdateQuestion,
	onMoveQuestion,
	onRemoveQuestion,
}: ClipCardProps) {
	const clipPath = `parts.1.clips.${clipIndex}`;
	const clipLevelIssues = issues.filter(
		(item) =>
			item.path === clipPath ||
			item.path === `${clipPath}.id` ||
			item.path === `${clipPath}.audioId` ||
			item.path === `${clipPath}.title` ||
			item.path === `${clipPath}.level` ||
			item.path === `${clipPath}.questions`,
	);

	return (
		<Card
			data-clip-path={clipPath}
			data-clip-id={clip.id}
			className="flex flex-col gap-4"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="flex items-center gap-2">
						<h3 className="font-semibold text-base text-foreground">
							Đoạn nghe {clipIndex + 1}
						</h3>
						<span className="font-mono text-muted-foreground text-xs">
							({clip.id})
						</span>
					</div>
					<p className="text-muted-foreground text-xs">
						{clip.questions.length} câu hỏi trong đoạn này
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Button
						variant="outline"
						size="icon-sm"
						disabled={!canMoveUp}
						onClick={onMoveUp}
						aria-label={`Chuyển đoạn nghe ${clipIndex + 1} lên`}
					>
						<ArrowUp className="size-3.5" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={!canMoveDown}
						onClick={onMoveDown}
						aria-label={`Chuyển đoạn nghe ${clipIndex + 1} xuống`}
					>
						<ArrowDown className="size-3.5" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={!canRemove}
						onClick={onRemove}
						aria-label={`Xóa đoạn nghe ${clipIndex + 1}`}
					>
						<Trash2 className="size-3.5 text-destructive" />
					</Button>
				</div>
			</div>

			<div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
				<label className="block font-medium text-muted-foreground text-xs">
					Tiêu đề đoạn nghe
					<input
						type="text"
						maxLength={PLACEMENT_CLIP_TITLE_MAX}
						aria-label={`Tiêu đề đoạn nghe ${clipIndex + 1}`}
						value={clip.title}
						onChange={(e) => onUpdateClip({ title: e.target.value })}
						placeholder="Ví dụ: Đoạn nghe 1 (A2) – Thông báo tại thư viện"
						className={`${inputCls} mt-1 w-full`}
					/>
				</label>

				<label className="block font-medium text-muted-foreground text-xs">
					Cấp độ
					<select
						aria-label={`Cấp độ đoạn nghe ${clipIndex + 1}`}
						value={clip.level}
						onChange={(e) => onUpdateClip({ level: e.target.value })}
						className={`${inputCls} mt-1 w-full`}
					>
						{PLACEMENT_LEVELS.map((lvl) => (
							<option key={lvl} value={lvl}>
								{lvl}
							</option>
						))}
					</select>
				</label>

				<label className="block font-medium text-muted-foreground text-xs">
					Số lần nghe tối đa
					<select
						aria-label={`Số lần nghe đoạn ${clipIndex + 1}`}
						value={clip.maxPlays}
						onChange={(e) =>
							onUpdateClip({ maxPlays: Number(e.target.value) || 2 })
						}
						className={`${inputCls} mt-1 w-full`}
					>
						{[1, 2, 3, 4, 5].map((n) => (
							<option key={n} value={n}>
								{n} lần
							</option>
						))}
					</select>
				</label>
			</div>

			<ClipAudioField
				clipId={clip.id}
				clipNumber={clipIndex + 1}
				audioId={clip.audioId}
				audioMeta={clip.audioId ? audioMap[clip.audioId] : undefined}
				onUploaded={onAudioUploaded}
			/>

			{clipLevelIssues.length > 0 && (
				<ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
					{clipLevelIssues.map((issue) => (
						<li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
					))}
				</ul>
			)}

			<div className="space-y-3">
				{clip.questions.map((question, qIdx) => (
					<QuestionCard
						key={question.id}
						question={question}
						displayNumber={startQuestionNumber + qIdx}
						basePath={`${clipPath}.questions.${qIdx}`}
						canMoveUp={qIdx > 0}
						canMoveDown={qIdx < clip.questions.length - 1}
						canRemove={clip.questions.length > 1}
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
					disabled={clip.questions.length >= PLACEMENT_MAX_CLIP_QUESTIONS}
					onClick={onAddQuestion}
				>
					<Plus className="size-3.5" />
					Thêm câu hỏi vào đoạn nghe {clipIndex + 1}
				</Button>
			</div>
		</Card>
	);
}
