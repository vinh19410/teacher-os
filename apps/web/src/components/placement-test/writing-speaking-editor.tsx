import {
	PLACEMENT_LEVELS,
	PLACEMENT_MAX_SPEAKING_TASKS,
	PLACEMENT_PASSAGE_BODY_MAX,
	PLACEMENT_PROMPT_MAX,
	PLACEMENT_SPEAKING_RUBRIC,
	PLACEMENT_WRITING_RUBRIC,
	type PlacementAudioMeta,
	type PlacementPublishIssue,
	type PlacementSpeakingTask,
	type PlacementWritingPart,
} from "@teacher-os/api/placement-test-contracts";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ClipAudioField } from "@/components/placement-test/clip-audio-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputCls, Select } from "@/components/ui/field";
import type { UploadedPlacementAudio } from "@/lib/repos/placement-test";

function BoundedNumberInput({
	label,
	value,
	min,
	max,
	ariaLabel,
	className,
	onCommit,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	ariaLabel: string;
	className: string;
	onCommit: (next: number) => void;
}) {
	const [draft, setDraft] = useState(() => String(value));
	const focusedRef = useRef(false);

	useEffect(() => {
		if (!focusedRef.current) {
			setDraft(String(value));
		}
	}, [value]);

	return (
		<label className="block font-medium text-muted-foreground text-xs">
			{label}
			<input
				type="number"
				min={min}
				max={max}
				aria-label={ariaLabel}
				value={draft}
				onFocus={() => {
					focusedRef.current = true;
				}}
				onChange={(e) => {
					const raw = e.target.value;
					setDraft(raw);
					if (raw.trim() === "") return;
					const parsed = Number(raw);
					if (Number.isInteger(parsed) && parsed >= min && parsed <= max) {
						onCommit(parsed);
					}
				}}
				onBlur={() => {
					focusedRef.current = false;
					const parsed = Number(draft);
					if (!Number.isFinite(parsed) || draft.trim() === "") {
						setDraft(String(value));
						return;
					}
					const clamped = Math.min(max, Math.max(min, Math.trunc(parsed)));
					setDraft(String(clamped));
					if (clamped !== value) {
						onCommit(clamped);
					}
				}}
				className={className}
			/>
		</label>
	);
}

export function WritingEditorCard({
	writing,
	issues,
	onChange,
}: {
	writing: PlacementWritingPart;
	issues: readonly PlacementPublishIssue[];
	onChange: (patch: Partial<PlacementWritingPart>) => void;
}) {
	const writingIssues = issues.filter(
		(item) => item.path === "parts.3" || item.path.startsWith("parts.3."),
	);

	return (
		<Card data-section="writing" className="flex flex-col gap-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="font-semibold text-foreground text-lg">
						Phần 4: Viết (Writing)
					</h2>
					<p className="text-muted-foreground text-sm">
						Giáo viên chấm bài trên 3 tiêu chí rubric (tối đa 15 điểm:{" "}
						{PLACEMENT_WRITING_RUBRIC.map((r) => r.label).join(", ")}).
					</p>
				</div>
			</div>

			<div className="grid gap-3 md:grid-cols-[1fr_140px_140px]">
				<label className="block font-medium text-muted-foreground text-xs">
					Tiêu đề đề bài Writing
					<input
						type="text"
						maxLength={200}
						aria-label="Tiêu đề đề bài Writing"
						value={writing.promptTitle}
						onChange={(e) => onChange({ promptTitle: e.target.value })}
						placeholder="Ví dụ: Write a short email to a new friend (50–80 words)"
						className={`${inputCls} mt-1 w-full`}
					/>
				</label>

				<BoundedNumberInput
					label="Số từ tối thiểu"
					min={10}
					max={500}
					ariaLabel="Số từ tối thiểu Writing"
					value={writing.minWords}
					onCommit={(minWords) => onChange({ minWords })}
					className={`${inputCls} mt-1 w-full tabular-nums`}
				/>

				<BoundedNumberInput
					label="Số từ tối đa"
					min={10}
					max={1000}
					ariaLabel="Số từ tối đa Writing"
					value={writing.maxWords}
					onCommit={(maxWords) => onChange({ maxWords })}
					className={`${inputCls} mt-1 w-full tabular-nums`}
				/>
			</div>

			<label className="block font-medium text-muted-foreground text-xs">
				Nội dung yêu cầu & gợi ý ý tưởng
				<textarea
					rows={5}
					maxLength={PLACEMENT_PASSAGE_BODY_MAX}
					aria-label="Nội dung hướng dẫn Writing"
					value={writing.promptBody}
					onChange={(e) => onChange({ promptBody: e.target.value })}
					placeholder="Nhập yêu cầu cụ thể cho học viên..."
					className={`${inputCls} mt-1 min-h-[110px] w-full resize-y py-2`}
				/>
			</label>

			{writingIssues.length > 0 && (
				<ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
					{writingIssues.map((issue) => (
						<li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
					))}
				</ul>
			)}
		</Card>
	);
}

export function SpeakingEditorSection({
	tasks,
	issues,
	audioMap,
	onAddTask,
	onUpdateTask,
	onMoveTask,
	onRemoveTask,
	onTaskAudioUploaded,
	onTaskAudioCleared,
}: {
	tasks: readonly PlacementSpeakingTask[];
	issues: readonly PlacementPublishIssue[];
	audioMap?: Record<string, PlacementAudioMeta>;
	onAddTask: () => void;
	onUpdateTask: (index: number, patch: Partial<PlacementSpeakingTask>) => void;
	onMoveTask: (fromIndex: number, toIndex: number) => void;
	onRemoveTask: (index: number) => void;
	onTaskAudioUploaded?: (
		index: number,
		uploaded: UploadedPlacementAudio,
	) => void;
	onTaskAudioCleared?: (index: number) => void;
}) {
	const topIssues = issues.filter(
		(item) => item.path === "parts.4" || item.path === "parts.4.tasks",
	);

	return (
		<div data-section="speaking" className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="font-semibold text-foreground text-lg">
						Phần 5: Nói (Speaking)
					</h2>
					<p className="text-muted-foreground text-sm">
						Hiện có <strong>{tasks.length}</strong> câu hỏi nói (hệ thống đọc
						từng câu hỏi và học viên ghi âm trả lời qua micro — audio-only; giáo
						viên chấm 4 tiêu chí{" "}
						{PLACEMENT_SPEAKING_RUBRIC.map((r) => r.label).join(", ")} — 20
						điểm).
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={tasks.length >= PLACEMENT_MAX_SPEAKING_TASKS}
					onClick={onAddTask}
				>
					<Plus className="size-3.5" />
					Thêm câu hỏi Speaking
				</Button>
			</div>

			{topIssues.length > 0 && (
				<ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
					{topIssues.map((issue) => (
						<li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
					))}
				</ul>
			)}

			<div className="space-y-3">
				{tasks.map((task, idx) => {
					const taskPath = `parts.4.tasks.${idx}`;
					const taskIssues = issues.filter(
						(item) =>
							item.path === taskPath || item.path.startsWith(`${taskPath}.`),
					);
					return (
						<Card
							key={task.id}
							data-speaking-path={taskPath}
							className="flex flex-col gap-3"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex items-center gap-2">
									<span className="font-semibold text-foreground text-sm">
										Nhiệm vụ {idx + 1}
										{task.partLabel ? ` · ${task.partLabel}` : ""}
									</span>
									<span className="font-mono text-muted-foreground text-xs">
										({task.id})
									</span>
								</div>
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										size="icon-sm"
										disabled={idx === 0}
										onClick={() => onMoveTask(idx, idx - 1)}
										aria-label={`Chuyển câu Speaking ${idx + 1} lên`}
									>
										<ArrowUp className="size-3.5" />
									</Button>
									<Button
										variant="outline"
										size="icon-sm"
										disabled={idx === tasks.length - 1}
										onClick={() => onMoveTask(idx, idx + 1)}
										aria-label={`Chuyển câu Speaking ${idx + 1} xuống`}
									>
										<ArrowDown className="size-3.5" />
									</Button>
									<Button
										variant="outline"
										size="icon-sm"
										disabled={tasks.length <= 1}
										onClick={() => onRemoveTask(idx)}
										aria-label={`Xóa câu Speaking ${idx + 1}`}
									>
										<Trash2 className="size-3.5 text-destructive" />
									</Button>
								</div>
							</div>

							<div className="grid gap-3 sm:grid-cols-4">
								<label className="block font-medium text-muted-foreground text-xs">
									Nhãn câu
									<input
										type="text"
										maxLength={60}
										aria-label={`Nhãn Speaking ${idx + 1}`}
										value={task.partLabel}
										onChange={(e) =>
											onUpdateTask(idx, { partLabel: e.target.value })
										}
										className={`${inputCls} mt-1 w-full`}
									/>
								</label>

								<label
									htmlFor={`speaking-level-${task.id}`}
									className="block font-medium text-muted-foreground text-xs"
								>
									Cấp độ
									<Select
										id={`speaking-level-${task.id}`}
										aria-label={`Cấp độ Speaking ${idx + 1}`}
										value={task.level}
										onChange={(e) =>
											onUpdateTask(idx, { level: e.target.value })
										}
										className="mt-1 w-full"
									>
										{PLACEMENT_LEVELS.map((lvl) => (
											<option key={lvl} value={lvl}>
												{lvl}
											</option>
										))}
									</Select>
								</label>

								<BoundedNumberInput
									label="Chuẩn bị (giây)"
									min={0}
									max={120}
									ariaLabel={`Thời gian chuẩn bị Speaking ${idx + 1}`}
									value={task.prepSeconds}
									onCommit={(prepSeconds) => onUpdateTask(idx, { prepSeconds })}
									className={`${inputCls} mt-1 w-full tabular-nums`}
								/>

								<BoundedNumberInput
									label="Trả lời (giây)"
									min={5}
									max={180}
									ariaLabel={`Thời gian trả lời Speaking ${idx + 1}`}
									value={task.answerSeconds}
									onCommit={(answerSeconds) =>
										onUpdateTask(idx, { answerSeconds })
									}
									className={`${inputCls} mt-1 w-full tabular-nums`}
								/>
							</div>

							<label className="block font-medium text-muted-foreground text-xs">
								Câu hỏi / yêu cầu nói {idx + 1}
								<textarea
									rows={2}
									maxLength={PLACEMENT_PROMPT_MAX}
									aria-label={`Nội dung Speaking ${idx + 1}`}
									value={task.prompt}
									onChange={(e) =>
										onUpdateTask(idx, { prompt: e.target.value })
									}
									placeholder="Nhập câu hỏi Speaking..."
									className={`${inputCls} mt-1 min-h-[60px] w-full resize-y py-2`}
								/>
							</label>

							<ClipAudioField
								clipId={task.id}
								clipNumber={idx + 1}
								audioId={task.audioId ?? null}
								audioMeta={task.audioId ? audioMap?.[task.audioId] : undefined}
								optional
								titleLabel={`Audio đọc câu hỏi ${idx + 1} (tùy chọn)`}
								uploadAriaLabel={`Tải audio câu hỏi nói ${idx + 1}`}
								previewAriaLabel={`Trình phát nghe thử câu hỏi nói ${idx + 1}`}
								clearAriaLabel={`Gỡ audio câu hỏi nói ${idx + 1}`}
								onUploaded={(uploaded) => {
									if (onTaskAudioUploaded) {
										onTaskAudioUploaded(idx, uploaded);
									} else {
										onUpdateTask(idx, { audioId: uploaded.audioId });
									}
								}}
								onClear={() => {
									if (onTaskAudioCleared) {
										onTaskAudioCleared(idx);
									} else {
										onUpdateTask(idx, { audioId: null });
									}
								}}
							/>

							{taskIssues.length > 0 && (
								<ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
									{taskIssues.map((issue) => (
										<li key={`${issue.path}:${issue.message}`}>
											{issue.message}
										</li>
									))}
								</ul>
							)}
						</Card>
					);
				})}
			</div>
		</div>
	);
}
