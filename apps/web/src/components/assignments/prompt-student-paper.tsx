import { ASSIGNMENT_IMAGE_SRC_PATTERN } from "@teacher-os/api/contracts";
import { htmlToPlainText, isEmptyRichText } from "@teacher-os/api/rich-text";
import { ClozeStemText } from "@teacher-os/ui/components/assignments/cloze-stem";
import { OptionBankList } from "@teacher-os/ui/components/assignments/option-bank-list";
import { PinOverlay } from "@teacher-os/ui/components/assignments/pin-overlay";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import { Headphones } from "lucide-react";
import { isValidPin } from "@/lib/image-pin";
import type { AssignmentPrompt } from "@/lib/mock-data";
import {
	isAutoSkill,
	isBankableType,
	isImageBased,
	kindOf,
	partOf,
	qStartOf,
	wordCount,
} from "./assignment-presets";

/**
 * Nội dung đề theo góc nhìn học viên (Tab 1 của panel xem trước):
 * giữ nguyên toàn bộ rich preview (RichTextBody, ClozeStemText, OptionBankList,
 * PinOverlay, diagram/map, hybrid writing) và tuyệt đối không hiển thị Band
 * hay đáp án bí mật (#847).
 */
export function PromptStudentPaper({
	prompt,
	showDraftNote = false,
}: {
	prompt: AssignmentPrompt;
	showDraftNote?: boolean;
}) {
	const skillId = prompt.skill ?? "writing";
	const partId = prompt.part ?? prompt.task ?? "task2";
	const typeId = prompt.type ?? prompt.genre ?? "";
	const part = partOf(skillId, partId);
	const isAuto = isAutoSkill(skillId);
	const isSpeakingPart2 = skillId === "speaking" && partId === "part2";
	const bankable = isBankableType(skillId, typeId);
	const bank = prompt.optionBank ?? [];
	const bankKind = kindOf(typeId);
	const questions = prompt.questions ?? [];
	const trimmedImageUrl = prompt.imageUrl?.trim() ?? "";
	const diagramImageUrl =
		isImageBased(skillId, typeId) &&
		trimmedImageUrl &&
		ASSIGNMENT_IMAGE_SRC_PATTERN.test(trimmedImageUrl)
			? trimmedImageUrl
			: "";
	const pinnedItems = questions.filter((item) => isValidPin(item.pin));

	const specSummary = [
		part.spec,
		prompt.level?.trim() || null,
		isAuto && questions.length > 0 ? `${questions.length} câu` : null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 text-sm leading-relaxed">
				{skillId === "listening" && (
					<div className="flex items-center gap-3 rounded-md bg-muted p-3">
						<Headphones
							aria-hidden="true"
							className="size-5 shrink-0 text-muted-foreground"
						/>
						<span className="min-w-0 truncate font-medium text-foreground text-sm">
							{prompt.audioName?.trim() || "Chưa đính file nghe"}
						</span>
					</div>
				)}

				{skillId === "reading" && (
					<div>
						<p className="mb-1.5 font-medium text-muted-foreground text-xs">
							Đoạn đọc
						</p>
						{isEmptyRichText(prompt.passage ?? "") ? (
							<p className="text-foreground text-sm leading-[1.65]">
								Đoạn đọc sẽ hiện ở đây.
							</p>
						) : (
							<RichTextBody
								text={prompt.passage ?? ""}
								className="text-foreground text-sm leading-[1.65]"
							/>
						)}
					</div>
				)}

				{(skillId === "grammar" || skillId === "vocabulary") &&
					!isEmptyRichText(prompt.passage ?? "") && (
						<RichTextBody
							text={prompt.passage ?? ""}
							className="text-foreground text-sm leading-[1.65]"
						/>
					)}

				{diagramImageUrl &&
					(pinnedItems.length > 0 ? (
						<PinOverlay
							imageUrl={diagramImageUrl}
							items={questions}
							qStart={qStartOf(skillId, partId)}
						/>
					) : (
						<img
							src={diagramImageUrl}
							alt={
								skillId === "listening"
									? "Ảnh bản đồ đề Listening"
									: "Ảnh biểu đồ đề Reading"
							}
							className="max-h-48 w-auto rounded-md border border-border object-contain"
							referrerPolicy="no-referrer"
							loading="lazy"
						/>
					))}

				{isAuto && (
					<div className="flex flex-col gap-2">
						{!isEmptyRichText(prompt.intro ?? "") && (
							<RichTextBody
								text={prompt.intro ?? ""}
								className="text-muted-foreground text-xs"
							/>
						)}
						{bankable && <OptionBankList bank={bank} kind={bankKind} />}
						{questions.map((item, index) => (
							<div key={index} className="text-sm">
								<strong>{qStartOf(skillId, partId) + index}.</strong>{" "}
								{item.stem.trim() ? (
									<ClozeStemText
										stem={item.stem}
										answer={item.answer}
										typeId={item.type ?? typeId}
										number={qStartOf(skillId, partId) + index}
									/>
								) : (
									"Câu hỏi sẽ hiện ở đây."
								)}
								{item.opts?.map((option, optionIndex) => (
									<div key={optionIndex} className="ml-5 text-muted-foreground">
										{String.fromCharCode(65 + optionIndex)} {option}
									</div>
								))}
							</div>
						))}
					</div>
				)}

				{isAuto && prompt.writing != null && (
					<div className="flex flex-col gap-1.5 border-border border-t pt-3">
						<p className="font-semibold text-foreground text-xs">
							Phần 2 · Writing (
							{prompt.writing.part === "task1" ? "Task 1" : "Task 2"})
						</p>
						{!isEmptyRichText(prompt.writing.prompt) ? (
							<RichTextBody
								text={prompt.writing.prompt}
								className="text-foreground text-sm leading-[1.65]"
							/>
						) : (
							<p className="text-muted-foreground text-sm">
								Đề Writing kèm theo sẽ hiện ở đây.
							</p>
						)}
					</div>
				)}

				{isSpeakingPart2 && (
					<div className="text-sm">
						<p className="mb-1.5 font-medium text-muted-foreground text-xs">
							Cue card
						</p>
						<p className="font-medium text-foreground">
							Describe {prompt.cueTopic || "the topic"}.
						</p>
						<p className="mt-2 font-medium text-foreground">You should say:</p>
						<ul className="mt-1 ml-5 list-disc space-y-1 text-foreground">
							{(prompt.cuePoints ?? "")
								.split("\n")
								.filter(Boolean)
								.map((point, idx) => (
									<li key={`${idx}-${point}`}>{point}</li>
								))}
						</ul>
					</div>
				)}

				{!isAuto && !isSpeakingPart2 && (
					<div>
						<p className="mb-1.5 font-medium text-muted-foreground text-xs">
							{skillId === "writing" ? "Đề bài" : "Câu hỏi"}
						</p>
						{isEmptyRichText(prompt.prompt) ? (
							<p className="text-muted-foreground text-sm">
								Nội dung đề bài sẽ hiện ở đây.
							</p>
						) : (
							<>
								<RichTextBody
									text={prompt.prompt}
									legacyWhitespace="pre-wrap"
									className="text-foreground text-sm leading-[1.65]"
								/>
								{skillId === "writing" && (
									<p className="mt-2 text-muted-foreground text-xs tabular-nums">
										{wordCount(htmlToPlainText(prompt.prompt))} từ
									</p>
								)}
							</>
						)}
					</div>
				)}

				<p className="border-border border-t pt-3 text-muted-foreground text-xs">
					{specSummary}
				</p>
			</div>

			{showDraftNote && (
				<p className="text-muted-foreground text-xs">
					Bản nháp chỉ bạn nhìn thấy. Học viên chưa nhận được đề này.
				</p>
			)}
		</div>
	);
}
