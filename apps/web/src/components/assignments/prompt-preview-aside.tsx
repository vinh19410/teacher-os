import { Link, useNavigate } from "@tanstack/react-router";
import { ASSIGNMENT_IMAGE_SRC_PATTERN } from "@teacher-os/api/contracts";
import { htmlToPlainText, isEmptyRichText } from "@teacher-os/api/rich-text";
import { ClozeStemText } from "@teacher-os/ui/components/assignments/cloze-stem";
import { OptionBankList } from "@teacher-os/ui/components/assignments/option-bank-list";
import { PinOverlay } from "@teacher-os/ui/components/assignments/pin-overlay";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import type { AssignmentPrompt } from "@/lib/mock-data";
import {
	isAutoSkill,
	isBankableType,
	isImageBased,
	kindOf,
	partOf,
	qStartOf,
	skillOf,
	typeOf,
	wordCount,
} from "./assignment-presets";

interface PromptPreviewAsideProps {
	prompt: AssignmentPrompt;
}

export function PromptPreviewAside({ prompt }: PromptPreviewAsideProps) {
	const navigate = useNavigate();
	const skillId = prompt.skill ?? "writing";
	const partId = prompt.part ?? prompt.task ?? "task2";
	const typeId = prompt.type ?? prompt.genre ?? "discuss";
	const skill = skillOf(skillId);
	const part = partOf(skillId, partId);
	const type = typeOf(skillId, partId, typeId);
	const trimmedTitle = prompt.title.trim() || "Chưa đặt tên đề";
	const isAuto = isAutoSkill(skillId);
	const isSpeakingPart2 = skillId === "speaking" && partId === "part2";
	// FR6: bankable matching types render the snapshot bank; legacy rows
	// (empty bank) keep the intro fallback AND warn — never silent.
	const bankable = isBankableType(skillId, typeId);
	const bank = prompt.optionBank ?? [];
	const bankKind = kindOf(typeId);

	return (
		<aside
			aria-label="Xem trước đề"
			className="rounded-lg rounded-xl border bg-card p-5 shadow-sm lg:sticky lg:top-[76px]"
		>
			<p className="text-muted-foreground text-xs">Xem trước phía học viên</p>
			<p className="mt-1 font-semibold text-[17px] text-foreground">
				{trimmedTitle}
			</p>
			<p className="mt-1.5 text-muted-foreground text-xs">
				{part.spec} · Band {prompt.band}
			</p>

			{skillId === "listening" && (
				<p className="mt-3 rounded-md rounded-md bg-muted p-3 text-sm">
					🔊 {prompt.audioName?.trim() || "Chưa đính file nghe"}
				</p>
			)}

			{skillId === "reading" &&
				(isEmptyRichText(prompt.passage ?? "") ? (
					<p className="mt-3 text-foreground text-sm leading-[1.55]">
						Đoạn đọc sẽ hiện ở đây.
					</p>
				) : (
					<RichTextBody
						text={prompt.passage ?? ""}
						className="mt-3 text-foreground text-sm leading-[1.55]"
					/>
				))}

			{skillId === "reading" &&
				typeId === "diagram" &&
				prompt.imageUrl?.trim() &&
				ASSIGNMENT_IMAGE_SRC_PATTERN.test(prompt.imageUrl.trim()) && (
					<img
						src={prompt.imageUrl.trim()}
						alt="Ảnh biểu đồ đề Reading"
						className="mt-3 max-h-48 rounded-md border border-border"
						referrerPolicy="no-referrer"
						loading="lazy"
					/>
				)}

			{skillId === "listening" &&
				typeId === "map" &&
				prompt.imageUrl?.trim() &&
				ASSIGNMENT_IMAGE_SRC_PATTERN.test(prompt.imageUrl.trim()) && (
					<img
						src={prompt.imageUrl.trim()}
						alt="Ảnh bản đồ đề Listening"
						className="mt-3 max-h-48 rounded-md border border-border"
						referrerPolicy="no-referrer"
						loading="lazy"
					/>
				)}

			{/* Phase-04 FR5 — pinned image labels render over the image so the
			snapshot round-trip is visible (and e2e-assertable) from the bank. */}
			{isImageBased(skillId, typeId) &&
				prompt.imageUrl?.trim() &&
				ASSIGNMENT_IMAGE_SRC_PATTERN.test(prompt.imageUrl.trim()) &&
				(prompt.questions ?? []).some((item) => item.pin) && (
					<PinOverlay
						imageUrl={prompt.imageUrl.trim()}
						items={prompt.questions ?? []}
						qStart={qStartOf(skillId, partId)}
					/>
				)}

			{isAuto && (
				<div className="mt-3 flex flex-col gap-2">
					{!isEmptyRichText(prompt.intro ?? "") && (
						<RichTextBody
							text={prompt.intro ?? ""}
							className="text-muted-foreground text-xs"
						/>
					)}
					{bankable && <OptionBankList bank={bank} kind={bankKind} />}
					{(prompt.questions ?? []).map((item, index) => (
						<div key={index} className="text-sm">
							<strong>{qStartOf(skillId, partId) + index}.</strong>{" "}
							{item.stem.trim() ? (
								<ClozeStemText
									stem={item.stem}
									answer={item.answer}
									typeId={typeId}
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

			{isSpeakingPart2 && (
				<div className="mt-3 text-sm">
					<p>Describe {prompt.cueTopic || "the topic"}.</p>
					<p className="mt-2 font-medium">You should say:</p>
					<ul className="ml-5 list-disc">
						{(prompt.cuePoints ?? "")
							.split("\n")
							.filter(Boolean)
							.map((point) => (
								<li key={point}>{point}</li>
							))}
					</ul>
				</div>
			)}

			{!isAuto && !isSpeakingPart2 && !isEmptyRichText(prompt.prompt) && (
				// This surface rendered plain rows with pre-wrap — keep that exact
				// whitespace behavior for legacy rows via legacyWhitespace.
				<RichTextBody
					text={prompt.prompt}
					legacyWhitespace="pre-wrap"
					className="mt-3 text-foreground text-sm leading-[1.55]"
				/>
			)}

			<div className="mt-3 flex flex-wrap gap-2">
				<Tag>{skill.name}</Tag>
				<Tag>{part.label}</Tag>
				<Tag>{type.label}</Tag>
				<Tag>{`Band ${prompt.band}`}</Tag>
				{prompt.source.trim() && <Tag>{prompt.source.trim()}</Tag>}
				{isAuto && <Tag>Chấm tự động</Tag>}
				{!isEmptyRichText(prompt.note ?? "") && <Tag>Có hướng dẫn thêm</Tag>}
			</div>

			{!isEmptyRichText(prompt.prompt) && skillId === "writing" && (
				<p className="mt-2 text-muted-foreground text-xs">
					{wordCount(htmlToPlainText(prompt.prompt))} từ
				</p>
			)}

			<div className="mt-4 rounded-md rounded-md bg-muted px-3 py-2.5 text-muted-foreground text-xs leading-relaxed">
				Đề này chưa giao lớp. Giao cho học viên ở trang{" "}
				<Link
					to="/classes"
					className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
				>
					Lớp học
				</Link>
				.
			</div>

			<Button
				variant="secondary"
				className="mt-3 w-full"
				onClick={() =>
					navigate({ to: "/assignments/preview", search: { id: prompt.id } })
				}
			>
				Xem trước
			</Button>
		</aside>
	);
}
