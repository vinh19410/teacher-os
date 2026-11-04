import type { AssignmentWritingSection } from "@teacher-os/api/contracts";
import { htmlToPlainText } from "@teacher-os/api/rich-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { Field, Input, Textarea } from "@/components/ui/field";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { SectionLabel } from "@/components/ui/section-label";
import {
	isAutoSkill,
	partOf,
	type QuestionItem,
	SKILLS,
	skillOf,
	typeOf,
	wordCount,
} from "./assignment-presets";
import { QuestionKeyEditor } from "./question-key-editor";

export interface ComposerValue {
	skill: string;
	part: string;
	type: string;
	title: string;
	band: string;
	source: string;
	prompt: string;
	passage: string;
	intro: string;
	transcript: string;
	cueTopic: string;
	cuePoints: string;
	audioName: string;
	imageUrl: string;
	/** Phase-02 FR3 — structured option bank rows for bankable matching types. */
	optionBank: string[];
	note: string;
	items: QuestionItem[];
	/** #574: phần Writing đi kèm cho đề tự chấm. */
	writing?: AssignmentWritingSection | null;
}

export function PromptComposer({
	value,
	errors = {},
	showErrors,
	status,
	lockPart = false,
	onFieldChange,
}: {
	value: ComposerValue;
	errors?: Record<string, string | undefined>;
	showErrors: boolean;
	/** Threaded to the key editor for FR9 (missing answers block `ready` only). */
	status: "draft" | "ready";
	/**
	 * Full-test builder (phase-03 Task 3.2): khóa skill/part của slot khi
	 * composer nhúng vào test-builder — giáo viên không thể đổi skill giữa
	 * chừng làm part lệch preset của test. ChipFilter đổi skill/part được
	 * thay bằng chip tĩnh; `/assignments/new` giữ nguyên hành vi (false).
	 */
	lockPart?: boolean;
	onFieldChange: (patch: Partial<ComposerValue>) => void;
}) {
	const skill = skillOf(value.skill);
	const part = partOf(value.skill, value.part);
	const type = typeOf(value.skill, value.part, value.type);
	const isAuto = isAutoSkill(value.skill);
	const isCue = value.skill === "speaking" && value.part === "part2";
	const writingSpec = skillOf("writing");
	const activeWriting = value.writing ?? null;
	const activeWritingPart = activeWriting
		? partOf("writing", activeWriting.part)
		: null;
	const activeWritingType = activeWriting
		? typeOf("writing", activeWriting.part, activeWriting.type)
		: null;
	return (
		<Card variant="white" className="flex flex-col gap-4">
			<div>
				<SectionLabel>Đề bài</SectionLabel>
				<h2 className="font-semibold text-[22px]">{skill.heading}</h2>
			</div>
			{lockPart ? (
				// Slot đã khóa skill/part — hiển thị chip tĩnh từ value, không
				// ChipFilter (đổi skill/part giữa chừng làm lệch preset test).
				<div className="flex flex-wrap gap-2">
					<span className="rounded-md rounded-md bg-muted px-[14px] py-[6px] font-medium text-primary text-xs">
						{skill.name}
					</span>
					<span className="rounded-md rounded-md border border-input bg-transparent px-[14px] py-[6px] font-medium text-xs">
						{part.label}
					</span>
				</div>
			) : (
				<>
					<div className="flex flex-col gap-1.5">
						<span className="text-muted-foreground text-xs">Kỹ năng</span>
						<ChipFilter
							options={SKILLS.map((entry) => entry.name)}
							value={skill.name}
							onChange={(label) => {
								const next =
									SKILLS.find((entry) => entry.name === label) ?? SKILLS[0];
								// ChipFilter re-fires on the selected chip — a stray click on
								// the current skill must not confirm or wipe (#269 guard,
								// review #2: the patch below always carries part/type).
								if (next.id === value.skill) return;
								onFieldChange({
									skill: next.id,
									part: next.parts[0].id,
									type: next.parts[0].types[0].id,
								});
							}}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<span className="text-muted-foreground text-xs">
							{skill.partLabel}
						</span>
						<ChipFilter
							options={skill.parts.map((entry) => entry.label)}
							value={part.label}
							onChange={(label) => {
								const next =
									skill.parts.find((entry) => entry.label === label) ??
									skill.parts[0];
								// Same re-fire guard: the patch always carries the part's
								// default type, so a stray click could otherwise reset the
								// type (review #2).
								if (next.id === value.part) return;
								onFieldChange({ part: next.id, type: next.types[0].id });
							}}
						/>
					</div>
				</>
			)}
			<div className="flex flex-col gap-1.5">
				<span className="text-muted-foreground text-xs">{skill.typeLabel}</span>
				<ChipFilter
					options={part.types.map((entry) => entry.label)}
					value={type.label}
					onChange={(label) =>
						onFieldChange({
							type:
								part.types.find((entry) => entry.label === label)?.id ??
								part.types[0].id,
						})
					}
				/>
			</div>
			<Field label="Tiêu đề" error={showErrors ? errors.title : undefined}>
				<Input
					value={value.title}
					onChange={(event) => onFieldChange({ title: event.target.value })}
				/>
			</Field>
			<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs">Band mục tiêu</span>
					<ChipFilter
						options={["6.0", "6.5", "7.0", "7.5"]}
						value={value.band}
						onChange={(band) => onFieldChange({ band })}
					/>
				</div>
				<Field label="Nguồn đề">
					<Input
						value={value.source}
						onChange={(event) => onFieldChange({ source: event.target.value })}
					/>
				</Field>
			</div>
			{value.skill === "writing" && (
				<Field
					label="Nội dung đề"
					help={part.help}
					error={showErrors ? errors.prompt : undefined}
				>
					<RichTextEditor
						value={value.prompt}
						onChange={(prompt) => onFieldChange({ prompt })}
						placeholder="Dán hoặc soạn đề bài…"
						contentClassName="[&_.ProseMirror]:min-h-42"
					/>
				</Field>
			)}
			{(value.skill === "reading" ||
				value.skill === "grammar" ||
				value.skill === "vocabulary") && (
				<Field
					label={
						value.skill === "reading"
							? "Đoạn đọc"
							: "Đoạn đọc / Ngữ cảnh (không bắt buộc)"
					}
					help={part.help}
					error={showErrors ? errors.passage : undefined}
				>
					<RichTextEditor
						value={value.passage}
						onChange={(passage) => onFieldChange({ passage })}
						placeholder="Dán đoạn đọc vào đây…"
						contentClassName="[&_.ProseMirror]:min-h-52"
					/>
				</Field>
			)}
			{(value.skill === "reading" ||
				value.skill === "grammar" ||
				value.skill === "vocabulary") && (
				<span className="-mt-3 text-right text-muted-foreground text-xs">
					{wordCount(htmlToPlainText(value.passage))} từ
				</span>
			)}
			{value.skill === "listening" && (
				<div className="rounded-md rounded-md bg-muted p-3">
					<p className="font-medium text-muted-foreground text-xs">File nghe</p>
					<div className="mt-2 flex flex-wrap items-center gap-2">
						<label className="inline-flex cursor-pointer rounded-md rounded-md border border-input bg-transparent px-3 py-2 font-medium text-xs transition-colors hover:text-primary">
							<input
								type="file"
								className="sr-only"
								accept=".mp3,.wav,audio/mpeg,audio/wav"
								onChange={(event) =>
									onFieldChange({
										audioName: event.target.files?.[0]?.name ?? "",
									})
								}
							/>
							Đính file nghe / MP3 hoặc WAV
						</label>
						{value.audioName ? (
							<>
								<span className="text-sm">{value.audioName}</span>
								<button
									type="button"
									className="text-primary text-xs"
									onClick={() => onFieldChange({ audioName: "" })}
								>
									Gỡ file
								</button>
							</>
						) : null}
					</div>
					<p className="mt-1 text-[11px] text-muted-foreground">
						{value.audioName
							? "Sẽ phát cho học viên khi được giao"
							: "Section này khoảng 8–10 phút"}
					</p>
					{showErrors && errors.audioName && (
						<p role="alert" className="mt-1 text-destructive text-xs">
							{errors.audioName}
						</p>
					)}
				</div>
			)}
			{isAuto && (
				<QuestionKeyEditor
					skill={value.skill}
					partId={value.part}
					typeId={value.type}
					intro={value.intro}
					items={value.items}
					showErrors={showErrors}
					status={status}
					imageUrl={value.imageUrl}
					optionBank={value.optionBank}
					imageUrlError={showErrors ? errors.imageUrl : undefined}
					optionBankError={showErrors ? errors.optionBank : undefined}
					questionsError={showErrors ? errors.questions : undefined}
					onIntroChange={(intro) => onFieldChange({ intro })}
					onImageUrlChange={(imageUrl) => onFieldChange({ imageUrl })}
					onItemsChange={(items) => onFieldChange({ items })}
					onBankChange={(optionBank) => onFieldChange({ optionBank })}
				/>
			)}
			{isAuto &&
				!lockPart &&
				(activeWriting && activeWritingPart && activeWritingType ? (
					<div
						className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4"
						data-testid="composer-writing-section"
					>
						<div className="flex items-center justify-between gap-2">
							<div>
								<p className="font-semibold text-foreground text-sm">
									Phần Writing đi kèm
								</p>
								<p className="text-muted-foreground text-xs">
									Học viên viết bài tự luận sau khi làm câu hỏi trắc nghiệm.
								</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => onFieldChange({ writing: null })}
							>
								Bỏ phần Writing
							</Button>
						</div>
						<div className="flex flex-col gap-1.5">
							<span className="text-muted-foreground text-xs">
								{writingSpec.partLabel}
							</span>
							<ChipFilter
								options={writingSpec.parts.map((entry) => entry.label)}
								value={activeWritingPart.label}
								onChange={(label) => {
									const next =
										writingSpec.parts.find((entry) => entry.label === label) ??
										writingSpec.parts[0];
									if (next.id === activeWriting.part) return;
									onFieldChange({
										writing: {
											part: next.id,
											type: next.types[0].id,
											prompt: activeWriting.prompt,
										},
									});
								}}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<span className="text-muted-foreground text-xs">
								{writingSpec.typeLabel}
							</span>
							<ChipFilter
								options={activeWritingPart.types.map((entry) => entry.label)}
								value={activeWritingType.label}
								onChange={(label) =>
									onFieldChange({
										writing: {
											...activeWriting,
											type:
												activeWritingPart.types.find(
													(entry) => entry.label === label,
												)?.id ?? activeWritingPart.types[0].id,
										},
									})
								}
							/>
						</div>
						<Field
							label="Đề bài phần Writing"
							help={activeWritingPart.help}
							error={showErrors ? errors.writingPrompt : undefined}
						>
							<RichTextEditor
								value={activeWriting.prompt}
								onChange={(prompt) =>
									onFieldChange({
										writing: { ...activeWriting, prompt },
									})
								}
								placeholder="Dán hoặc soạn đề Writing…"
								contentClassName="[&_.ProseMirror]:min-h-36"
							/>
						</Field>
						<span className="-mt-2 text-right text-muted-foreground text-xs">
							{wordCount(htmlToPlainText(activeWriting.prompt))} từ
						</span>
					</div>
				) : (
					<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border border-dashed bg-muted/30 px-4 py-3">
						<div>
							<p className="font-medium text-foreground text-sm">
								Gộp thêm phần Writing (tuỳ chọn)
							</p>
							<p className="text-muted-foreground text-xs">
								Giao trắc nghiệm và tự luận Writing trong cùng một bài tập.
							</p>
						</div>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={() =>
								onFieldChange({
									writing: { part: "task2", type: "discuss", prompt: "" },
								})
							}
						>
							Thêm phần Writing
						</Button>
					</div>
				))}
			{value.skill === "listening" && (
				<Field
					label="Transcript (chỉ giáo viên)"
					help="Dán lời thoại để đối chiếu khi chấm."
				>
					<RichTextEditor
						value={value.transcript}
						onChange={(transcript) => onFieldChange({ transcript })}
						placeholder="Dán lời thoại…"
						contentClassName="[&_.ProseMirror]:min-h-32"
					/>
				</Field>
			)}
			{value.skill === "speaking" &&
				(isCue ? (
					<>
						<Field
							label="Chủ đề cue card"
							error={showErrors ? errors.cueTopic : undefined}
						>
							<Input
								value={value.cueTopic}
								onChange={(event) =>
									onFieldChange({ cueTopic: event.target.value })
								}
							/>
						</Field>
						<Field label="You should say">
							<Textarea
								value={value.cuePoints}
								onChange={(event) =>
									onFieldChange({ cuePoints: event.target.value })
								}
							/>
						</Field>
					</>
				) : (
					<Field
						label="Câu hỏi giám khảo"
						help={part.help}
						error={showErrors ? errors.prompt : undefined}
					>
						<RichTextEditor
							value={value.prompt}
							onChange={(prompt) => onFieldChange({ prompt })}
							placeholder="Soạn câu hỏi giám khảo…"
							contentClassName="[&_.ProseMirror]:min-h-42"
						/>
					</Field>
				))}
			<Field label="Hướng dẫn thêm (không bắt buộc)">
				<RichTextEditor
					value={value.note}
					onChange={(note) => onFieldChange({ note })}
					placeholder="Ghi chú thêm cho học viên…"
					contentClassName="[&_.ProseMirror]:min-h-22"
				/>
			</Field>
			{isAuto && (
				<span className="text-right text-muted-foreground text-xs">
					{value.items.length} câu ·{" "}
					{value.items.filter((item) => item.answer.trim()).length}/
					{value.items.length} đáp án đã khóa
				</span>
			)}
		</Card>
	);
}
