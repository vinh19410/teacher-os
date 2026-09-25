import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { Field, Input, Textarea } from "@/components/ui/field";
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
	note: string;
	items: QuestionItem[];
}

export function PromptComposer({
	value,
	errors = {},
	showErrors,
	onFieldChange,
}: {
	value: ComposerValue;
	errors?: Record<string, string | undefined>;
	showErrors: boolean;
	onFieldChange: (patch: Partial<ComposerValue>) => void;
}) {
	const skill = skillOf(value.skill);
	const part = partOf(value.skill, value.part);
	const type = typeOf(value.skill, value.part, value.type);
	const isAuto = isAutoSkill(value.skill);
	const isCue = value.skill === "speaking" && value.part === "part2";
	return (
		<Card variant="white" className="flex flex-col gap-4">
			<div>
				<SectionLabel>Đề bài</SectionLabel>
				<h2 className="font-display font-semibold text-[22px]">
					{skill.heading}
				</h2>
			</div>
			<div className="flex flex-col gap-1.5">
				<span className="font-medium text-muted-fg text-xs">Kỹ năng</span>
				<ChipFilter
					options={SKILLS.map((entry) => entry.name)}
					value={skill.name}
					onChange={(label) => {
						const next =
							SKILLS.find((entry) => entry.name === label) ?? SKILLS[0];
						onFieldChange({
							skill: next.id,
							part: next.parts[0].id,
							type: next.parts[0].types[0].id,
						});
					}}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<span className="font-medium text-muted-fg text-xs">
					{skill.partLabel}
				</span>
				<ChipFilter
					options={skill.parts.map((entry) => entry.label)}
					value={part.label}
					onChange={(label) => {
						const next =
							skill.parts.find((entry) => entry.label === label) ??
							skill.parts[0];
						onFieldChange({ part: next.id, type: next.types[0].id });
					}}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<span className="font-medium text-muted-fg text-xs">
					{skill.typeLabel}
				</span>
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
					<Textarea
						value={value.prompt}
						onChange={(event) => onFieldChange({ prompt: event.target.value })}
						className="min-h-42"
					/>
				</Field>
			)}
			{value.skill === "reading" && (
				<Field
					label="Đoạn đọc"
					help={part.help}
					error={showErrors ? errors.passage : undefined}
				>
					<Textarea
						value={value.passage}
						onChange={(event) => onFieldChange({ passage: event.target.value })}
						className="min-h-52"
					/>
				</Field>
			)}
			{value.skill === "reading" && (
				<span className="-mt-3 text-right font-mono text-meta text-xs">
					{wordCount(value.passage)} từ
				</span>
			)}
			{value.skill === "listening" && (
				<div className="rounded-md border border-line bg-bg p-3">
					<p className="font-medium text-muted-fg text-xs">File nghe</p>
					<div className="mt-2 flex flex-wrap items-center gap-2">
						<label className="inline-flex cursor-pointer rounded-full border border-line px-3 py-2 font-medium text-xs">
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
									className="text-accent-blue text-xs"
									onClick={() => onFieldChange({ audioName: "" })}
								>
									Gỡ file
								</button>
							</>
						) : null}
					</div>
					<p className="mt-1 text-[11px] text-meta">
						{value.audioName
							? "Sẽ phát cho học viên khi được giao"
							: "Section này khoảng 8–10 phút"}
					</p>
					{showErrors && errors.audioName && (
						<p role="alert" className="mt-1 text-danger text-xs">
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
					onIntroChange={(intro) => onFieldChange({ intro })}
					onItemsChange={(items) => onFieldChange({ items })}
				/>
			)}
			{value.skill === "listening" && (
				<Field
					label="Transcript (chỉ giáo viên)"
					help="Dán lời thoại để đối chiếu khi chấm."
				>
					<Textarea
						value={value.transcript}
						onChange={(event) =>
							onFieldChange({ transcript: event.target.value })
						}
						className="min-h-32"
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
						<Textarea
							value={value.prompt}
							onChange={(event) =>
								onFieldChange({ prompt: event.target.value })
							}
							className="min-h-42"
						/>
					</Field>
				))}
			<Field label="Hướng dẫn thêm (không bắt buộc)">
				<Textarea
					value={value.note}
					onChange={(event) => onFieldChange({ note: event.target.value })}
					className="min-h-22"
				/>
			</Field>
			{isAuto && (
				<span className="text-right font-mono text-meta text-xs">
					{value.items.length} câu ·{" "}
					{value.items.filter((item) => item.answer.trim()).length}/
					{value.items.length} đáp án đã khóa
				</span>
			)}
		</Card>
	);
}
