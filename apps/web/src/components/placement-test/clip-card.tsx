import {
	PLACEMENT_CLIP_TITLE_MAX,
	PLACEMENT_LEVELS,
	PLACEMENT_MAX_CLIP_QUESTIONS,
	PLACEMENT_PROMPT_MAX,
	PLACEMENT_TRANSCRIPT_MAX,
	type PlacementAudioMeta,
	type PlacementClip,
	type PlacementListeningGapQuestion,
	type PlacementListeningMcqQuestion,
	type PlacementListeningQuestion,
	type PlacementPublishIssue,
} from "@teacher-os/api/placement-test-contracts";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputCls, Select } from "@/components/ui/field";
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
	onAddQuestion: (type: "mcq" | "gap") => void;
	onUpdateQuestion: (
		questionIndex: number,
		patch:
			| Partial<PlacementListeningMcqQuestion>
			| Partial<PlacementListeningGapQuestion>,
	) => void;
	onConvertQuestionType: (
		questionIndex: number,
		nextType: "mcq" | "gap",
	) => void;
	onMoveQuestion: (fromIndex: number, toIndex: number) => void;
	onRemoveQuestion: (questionIndex: number) => void;
}

function GapQuestionCard({
	question,
	displayNumber,
	basePath,
	canMoveUp,
	canMoveDown,
	canRemove,
	issues,
	onChange,
	onConvertToMcq,
	onMoveUp,
	onMoveDown,
	onRemove,
}: {
	question: PlacementListeningGapQuestion;
	displayNumber: number;
	basePath: string;
	canMoveUp: boolean;
	canMoveDown: boolean;
	canRemove: boolean;
	issues: readonly PlacementPublishIssue[];
	onChange: (patch: Partial<PlacementListeningGapQuestion>) => void;
	onConvertToMcq: () => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onRemove: () => void;
}) {
	const [acceptDraft, setAcceptDraft] = useState(() =>
		question.accept.join(", "),
	);
	const lastEmittedRef = useRef<string[]>(question.accept);
	const prevIdRef = useRef(question.id);
	useEffect(() => {
		const idChanged = prevIdRef.current !== question.id;
		prevIdRef.current = question.id;
		if (idChanged || question.accept !== lastEmittedRef.current) {
			lastEmittedRef.current = question.accept;
			setAcceptDraft(question.accept.join(", "));
		}
	}, [question.id, question.accept]);

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
					<Select
						aria-label={`Dạng câu hỏi câu ${displayNumber}`}
						value="gap"
						onChange={(e) => {
							if (e.target.value === "mcq") onConvertToMcq();
						}}
						className="h-7 w-auto py-0.5 text-xs"
					>
						<option value="mcq">Trắc nghiệm</option>
						<option value="gap">Điền từ</option>
					</Select>
				</div>

				<div className="flex flex-wrap items-center gap-2">
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
					>
						<ArrowUp className="size-3.5" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={!canMoveDown}
						onClick={onMoveDown}
						aria-label={`Chuyển câu ${displayNumber} xuống`}
					>
						<ArrowDown className="size-3.5" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={!canRemove}
						onClick={onRemove}
						aria-label={`Xóa câu ${displayNumber}`}
					>
						<Trash2 className="size-3.5 text-destructive" />
					</Button>
				</div>
			</div>

			<div className="mt-3 grid gap-3 sm:grid-cols-2">
				<label className="block font-medium text-muted-foreground text-xs">
					Nhãn / ngữ cảnh ô điền (câu {displayNumber})
					<input
						type="text"
						maxLength={PLACEMENT_PROMPT_MAX}
						aria-label={`Nội dung câu ${displayNumber}`}
						value={question.prompt}
						onChange={(e) => onChange({ prompt: e.target.value })}
						placeholder="Ví dụ: Meeting point: Outside the ___"
						className={`${inputCls} mt-1 w-full`}
					/>
				</label>

				<label className="block font-medium text-muted-foreground text-xs">
					Đáp án chấp nhận (cách nhau bởi dấu phẩy)
					<input
						type="text"
						aria-label={`Đáp án chấp nhận câu ${displayNumber}`}
						value={acceptDraft}
						onChange={(e) => {
							const raw = e.target.value;
							setAcceptDraft(raw);
							const parsed = raw
								.split(",")
								.map((s) => s.trim().slice(0, 120))
								.filter(Boolean)
								.slice(0, 15);
							const nextAccept = parsed.length > 0 ? parsed : [""];
							lastEmittedRef.current = nextAccept;
							onChange({ accept: nextAccept });
						}}
						placeholder="park, car park"
						className={`${inputCls} mt-1 w-full font-mono text-xs`}
					/>
				</label>
			</div>

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
	onConvertQuestionType,
	onMoveQuestion,
	onRemoveQuestion,
}: ClipCardProps) {
	const [transcriptOpen, setTranscriptOpen] = useState(false);
	const clipPath = `parts.0.clips.${clipIndex}`;
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
							{clip.partLabel ? ` · ${clip.partLabel}` : ""}
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

			<div className="grid gap-3 md:grid-cols-[120px_1fr_auto_auto]">
				<label className="block font-medium text-muted-foreground text-xs">
					Nhãn phần
					<input
						type="text"
						maxLength={60}
						aria-label={`Nhãn đoạn nghe ${clipIndex + 1}`}
						value={clip.partLabel}
						onChange={(e) => onUpdateClip({ partLabel: e.target.value })}
						placeholder="Part A"
						className={`${inputCls} mt-1 w-full`}
					/>
				</label>

				<label className="block font-medium text-muted-foreground text-xs">
					Tiêu đề đoạn nghe
					<input
						type="text"
						maxLength={PLACEMENT_CLIP_TITLE_MAX}
						aria-label={`Tiêu đề đoạn nghe ${clipIndex + 1}`}
						value={clip.title}
						onChange={(e) => onUpdateClip({ title: e.target.value })}
						placeholder="Ví dụ: Short Dialogues · A1–A2"
						className={`${inputCls} mt-1 w-full`}
					/>
				</label>

				<label
					className="block font-medium text-muted-foreground text-xs"
					htmlFor={`clip-level-${clip.id}`}
				>
					Cấp độ
					<Select
						id={`clip-level-${clip.id}`}
						aria-label={`Cấp độ đoạn nghe ${clipIndex + 1}`}
						value={clip.level}
						onChange={(e) => onUpdateClip({ level: e.target.value })}
						className="mt-1 w-full"
					>
						{PLACEMENT_LEVELS.map((lvl) => (
							<option key={lvl} value={lvl}>
								{lvl}
							</option>
						))}
					</Select>
				</label>

				<label
					className="block font-medium text-muted-foreground text-xs"
					htmlFor={`clip-max-plays-${clip.id}`}
				>
					Số lần nghe tối đa
					<Select
						id={`clip-max-plays-${clip.id}`}
						aria-label={`Số lần nghe đoạn ${clipIndex + 1}`}
						value={clip.maxPlays}
						onChange={(e) =>
							onUpdateClip({ maxPlays: Number(e.target.value) || 2 })
						}
						className="mt-1 w-full"
					>
						{[1, 2, 3, 4, 5].map((n) => (
							<option key={n} value={n}>
								{n} lần
							</option>
						))}
					</Select>
				</label>
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				<label className="block font-medium text-muted-foreground text-xs">
					Hướng dẫn làm bài
					<input
						type="text"
						maxLength={1000}
						aria-label={`Hướng dẫn đoạn nghe ${clipIndex + 1}`}
						value={clip.instruction}
						onChange={(e) => onUpdateClip({ instruction: e.target.value })}
						placeholder="Nghe 3 đoạn đối thoại ngắn và chọn đáp án đúng..."
						className={`${inputCls} mt-1 w-full`}
					/>
				</label>
				<label className="block font-medium text-muted-foreground text-xs">
					Tiêu đề bảng ghi chú (nếu có câu điền từ)
					<input
						type="text"
						maxLength={200}
						aria-label={`Tiêu đề ghi chú đoạn nghe ${clipIndex + 1}`}
						value={clip.notesTitle}
						onChange={(e) => onUpdateClip({ notesTitle: e.target.value })}
						placeholder="Ví dụ: SCHOOL PHOTOGRAPH TRIP"
						className={`${inputCls} mt-1 w-full`}
					/>
				</label>
			</div>

			<ClipAudioField
				clipId={clip.id}
				clipNumber={clipIndex + 1}
				audioId={clip.audioId}
				audioMeta={clip.audioId ? audioMap[clip.audioId] : undefined}
				onUploaded={onAudioUploaded}
			/>

			<div>
				<button
					type="button"
					onClick={() => setTranscriptOpen((prev) => !prev)}
					className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs hover:text-foreground"
				>
					<ChevronDown
						className={`size-3.5 transition-transform ${transcriptOpen ? "rotate-180" : ""}`}
					/>
					Transcript nội bộ (không gửi sang trang làm bài học viên)
				</button>
				{transcriptOpen && (
					<textarea
						rows={4}
						maxLength={PLACEMENT_TRANSCRIPT_MAX}
						aria-label={`Transcript đoạn nghe ${clipIndex + 1}`}
						value={clip.transcript}
						onChange={(e) => onUpdateClip({ transcript: e.target.value })}
						placeholder="Lời thoại audio dùng tham chiếu hoặc tạo giọng đọc..."
						className={`${inputCls} mt-2 min-h-[84px] w-full resize-y py-2 font-mono text-xs`}
					/>
				)}
			</div>

			{clipLevelIssues.length > 0 && (
				<ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
					{clipLevelIssues.map((issue) => (
						<li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
					))}
				</ul>
			)}

			<div className="space-y-3">
				{clip.questions.map((question, qIdx) => {
					const qPath = `${clipPath}.questions.${qIdx}`;
					const displayNumber = startQuestionNumber + qIdx;
					if (question.type === "gap") {
						return (
							<GapQuestionCard
								key={question.id}
								question={question}
								displayNumber={displayNumber}
								basePath={qPath}
								canMoveUp={qIdx > 0}
								canMoveDown={qIdx < clip.questions.length - 1}
								canRemove={clip.questions.length > 1}
								issues={issues}
								onChange={(patch) => onUpdateQuestion(qIdx, patch)}
								onConvertToMcq={() => onConvertQuestionType(qIdx, "mcq")}
								onMoveUp={() => onMoveQuestion(qIdx, qIdx - 1)}
								onMoveDown={() => onMoveQuestion(qIdx, qIdx + 1)}
								onRemove={() => onRemoveQuestion(qIdx)}
							/>
						);
					}
					return (
						<QuestionCard
							key={question.id}
							question={question}
							displayNumber={displayNumber}
							basePath={qPath}
							canMoveUp={qIdx > 0}
							canMoveDown={qIdx < clip.questions.length - 1}
							canRemove={clip.questions.length > 1}
							topExtra={
								<Select
									aria-label={`Dạng câu hỏi câu ${displayNumber}`}
									value="mcq"
									onChange={(e) => {
										if (e.target.value === "gap") {
											onConvertQuestionType(qIdx, "gap");
										}
									}}
									className="h-7 w-auto py-0.5 text-xs"
								>
									<option value="mcq">Trắc nghiệm</option>
									<option value="gap">Điền từ</option>
								</Select>
							}
							issues={issues}
							onChange={(patch) =>
								onUpdateQuestion(
									qIdx,
									patch as Partial<PlacementListeningMcqQuestion>,
								)
							}
							onMoveUp={() => onMoveQuestion(qIdx, qIdx - 1)}
							onMoveDown={() => onMoveQuestion(qIdx, qIdx + 1)}
							onRemove={() => onRemoveQuestion(qIdx)}
						/>
					);
				})}
			</div>

			<div className="flex flex-wrap gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={clip.questions.length >= PLACEMENT_MAX_CLIP_QUESTIONS}
					onClick={() => onAddQuestion("mcq")}
				>
					<Plus className="size-3.5" />
					Thêm câu trắc nghiệm vào đoạn {clipIndex + 1}
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={clip.questions.length >= PLACEMENT_MAX_CLIP_QUESTIONS}
					onClick={() => onAddQuestion("gap")}
				>
					<Plus className="size-3.5" />
					Thêm câu điền từ vào đoạn {clipIndex + 1}
				</Button>
			</div>
		</Card>
	);
}
