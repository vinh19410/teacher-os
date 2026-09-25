import { Link } from "@tanstack/react-router";
import { ASSIGNMENT_IMAGE_SRC_PATTERN } from "@teacher-os/api/contracts";
import { Tag } from "@/components/ui/tag";
import type { AssignmentPrompt } from "@/lib/mock-data";
import { ClozeStemText } from "./cloze-stem";
import {
	bankLabel,
	isAutoSkill,
	isBankableType,
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
			className="rounded-lg border border-line bg-surface-warm p-5 lg:sticky lg:top-[76px]"
		>
			<p className="font-mono text-[11px] text-muted-fg uppercase tracking-[0.08em]">
				Xem trước phía học viên
			</p>
			<p className="mt-1 font-display font-semibold text-[17px] text-fg">
				{trimmedTitle}
			</p>
			<p className="mt-1.5 font-mono text-meta text-xs">
				{part.spec} · Band {prompt.band}
			</p>

			{skillId === "listening" && (
				<p className="mt-3 rounded-md border border-line bg-surface p-3 text-sm">
					🔊 {prompt.audioName?.trim() || "Chưa đính file nghe"}
				</p>
			)}

			{skillId === "reading" && (
				<p className="mt-3 whitespace-pre-line text-fg text-sm leading-[1.55]">
					{prompt.passage?.trim() || "Đoạn đọc sẽ hiện ở đây."}
				</p>
			)}

			{skillId === "reading" &&
				typeId === "diagram" &&
				prompt.imageUrl?.trim() &&
				ASSIGNMENT_IMAGE_SRC_PATTERN.test(prompt.imageUrl.trim()) && (
					<img
						src={prompt.imageUrl.trim()}
						alt="Ảnh biểu đồ đề Reading"
						className="mt-3 max-h-48 rounded-md border border-line"
						referrerPolicy="no-referrer"
						loading="lazy"
					/>
				)}

			{isAuto && (
				<div className="mt-3 flex flex-col gap-2">
					{prompt.intro?.trim() && (
						<p className="whitespace-pre-line text-muted-fg text-xs">
							{prompt.intro.trim()}
						</p>
					)}
					{bankable &&
						(bank.length > 0 ? (
							<div className="rounded-md border border-line bg-surface p-3">
								<p className="font-medium text-muted-fg text-xs">
									Ngân hàng lựa chọn
								</p>
								<ol className="mt-1.5 flex flex-col gap-1">
									{bank.map((row, index) => (
										<li key={index} className="text-fg text-sm">
											<span className="font-medium font-mono">
												{bankLabel(bankKind, index)}
											</span>{" "}
											{row}
										</li>
									))}
								</ol>
							</div>
						) : (
							<p
								role="alert"
								className="rounded-md border border-danger/30 bg-surface p-2 text-danger text-xs"
							>
								Thiếu ngân hàng lựa chọn
							</p>
						))}
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
								<div key={optionIndex} className="ml-5 text-muted-fg">
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

			{!isAuto && !isSpeakingPart2 && (
				<p className="mt-3 whitespace-pre-wrap text-fg text-sm leading-[1.55]">
					{prompt.prompt.trim()}
				</p>
			)}

			<div className="mt-3 flex flex-wrap gap-2">
				<Tag>{skill.name}</Tag>
				<Tag>{part.label}</Tag>
				<Tag>{type.label}</Tag>
				<Tag>{`Band ${prompt.band}`}</Tag>
				{prompt.source.trim() && <Tag>{prompt.source.trim()}</Tag>}
				{isAuto && <Tag>Chấm tự động</Tag>}
				{prompt.note?.trim() && <Tag>Có hướng dẫn thêm</Tag>}
			</div>

			{prompt.prompt.trim() && skillId === "writing" && (
				<p className="mt-2 font-mono text-[11px] text-meta">
					{wordCount(prompt.prompt)} từ
				</p>
			)}

			<div className="mt-4 rounded-md border border-line bg-surface px-3 py-2.5 text-muted-fg text-xs leading-relaxed">
				Đề này chưa giao lớp. Giao cho học viên ở trang{" "}
				<Link
					to="/classes"
					className="font-medium text-fg underline underline-offset-2 hover:text-accent"
				>
					Lớp học
				</Link>
				.
			</div>
		</aside>
	);
}
