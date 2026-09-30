import { ASSIGNMENT_IMAGE_SRC_PATTERN } from "@teacher-os/api/contracts";
import { htmlToPlainText, isEmptyRichText } from "@teacher-os/api/rich-text";
import { ClozeStemText } from "@teacher-os/ui/components/assignments/cloze-stem";
import { OptionBankList } from "@teacher-os/ui/components/assignments/option-bank-list";
import { PinOverlay } from "@teacher-os/ui/components/assignments/pin-overlay";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import { Tag } from "@/components/ui/tag";
import { isValidPin } from "@/lib/image-pin";
import {
	isBankableType,
	kindOf,
	partOf,
	type QuestionItem,
	skillOf,
	typeOf,
	wordCount,
} from "./assignment-presets";

export function StudentPreviewPaper(props: {
	skill?: string;
	part?: string;
	type?: string;
	title: string;
	band: string;
	source: string;
	prompt: string;
	note: string;
	status: string;
	passage?: string;
	intro?: string;
	cueTopic?: string;
	cuePoints?: string;
	audioName?: string;
	imageUrl?: string;
	/** Phase-02 FR6 — structured option bank, rendered as a labeled list. */
	optionBank?: string[];
	items?: QuestionItem[];
	task?: string;
	genre?: string;
}) {
	const skillId = props.skill ?? "writing";
	const partId = props.part ?? props.task ?? "task2";
	const typeId = props.type ?? props.genre ?? "discuss";
	const skill = skillOf(skillId);
	const part = partOf(skillId, partId);
	const type = typeOf(skillId, partId, typeId);
	const isAuto = skillId === "reading" || skillId === "listening";
	// FR6: bankable matching types show the structured bank; an empty bank
	// (legacy prompts) falls back to the intro text AND warns — never silent.
	// Đề trộn dạng: bank hiện khi type đề HOẶC bất kỳ câu bankable (#286).
	const bankTypeId = isBankableType(skillId, typeId)
		? typeId
		: ((props.items ?? []).find(
				(item) => item.type && isBankableType(skillId, item.type),
			)?.type ?? null);
	const bankable = bankTypeId !== null;
	const bank = props.optionBank ?? [];
	const bankKind = kindOf(bankTypeId ?? typeId);
	// The preview draft never passes the server contract — this renderer is
	// the only guard, so verify the scheme here before any <img> exists.
	const rawImageUrl = props.imageUrl?.trim() ?? "";
	// Phase-04 FR2/FR5 — image-based pairs are skill-qualified (reading
	// diagram + listening map); writing task1's shared `map` id stays clear.
	const imageBased =
		(skillId === "reading" && typeId === "diagram") ||
		(skillId === "listening" && typeId === "map");
	const diagramImageUrl =
		imageBased && rawImageUrl && ASSIGNMENT_IMAGE_SRC_PATTERN.test(rawImageUrl)
			? rawImageUrl
			: "";
	// Pins render over the image when present; legacy rows (or a pin-less
	// draft) keep the plain thumbnail + key list below — never broken.
	const pinnedItems = (props.items ?? []).filter((item) =>
		isValidPin(item.pin),
	);
	return (
		<div className="rounded-lg border border-line bg-surface-warm p-5">
			<p className="font-mono text-[11px] text-muted-fg uppercase tracking-[0.08em]">
				Xem trước phía học viên
			</p>
			<p className="mt-1 font-display font-semibold text-[17px]">
				{props.title.trim() || "Chưa đặt tên đề"}
			</p>
			<p className="mt-1.5 font-mono text-meta text-xs">
				{part.spec} · Band {props.band}
			</p>
			{skillId === "listening" && (
				<p className="mt-3 rounded-md border border-line bg-surface p-3 text-sm">
					🔊 {props.audioName?.trim() || "Chưa đính file nghe"}
				</p>
			)}
			{skillId === "reading" &&
				(isEmptyRichText(props.passage ?? "") ? (
					<p className="mt-3 text-sm leading-[1.55]">Đoạn đọc sẽ hiện ở đây.</p>
				) : (
					<RichTextBody
						text={props.passage ?? ""}
						className="mt-3 text-sm leading-[1.55]"
					/>
				))}
			{diagramImageUrl &&
				(pinnedItems.length > 0 ? (
					<PinOverlay
						imageUrl={diagramImageUrl}
						items={props.items ?? []}
						qStart={part.qStart ?? 1}
					/>
				) : (
					<img
						src={diagramImageUrl}
						alt="Ảnh biểu đồ đề Reading"
						className="mt-3 max-h-72 rounded-md border border-line"
						referrerPolicy="no-referrer"
						loading="lazy"
					/>
				))}
			{isAuto && (
				<div className="mt-3 flex flex-col gap-2">
					{!isEmptyRichText(props.intro ?? "") && (
						<RichTextBody
							text={props.intro ?? ""}
							className="text-muted-fg text-sm"
						/>
					)}
					{bankable && <OptionBankList bank={bank} kind={bankKind} />}
					{(props.items ?? []).map((item, index) => (
						<div key={index} className="text-sm">
							<strong>{(part.qStart ?? 1) + index}.</strong>{" "}
							{item.stem.trim() ? (
								<ClozeStemText
									stem={item.stem}
									answer={item.answer}
									// Widget theo type TỪNG CÂU (đề trộn dạng) — câu không
									// khai type đi theo dạng đề.
									typeId={item.type ?? typeId}
									number={(part.qStart ?? 1) + index}
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
			{skillId === "speaking" && partId === "part2" && (
				<div className="mt-3 text-sm">
					<p>Describe {props.cueTopic || "the topic"}.</p>
					<p className="mt-2 font-medium">You should say:</p>
					<ul className="ml-5 list-disc">
						{(props.cuePoints ?? "")
							.split("\n")
							.filter(Boolean)
							.map((point) => (
								<li key={point}>{point}</li>
							))}
					</ul>
				</div>
			)}
			{!isAuto &&
				!(skillId === "speaking" && partId === "part2") &&
				(isEmptyRichText(props.prompt) ? (
					// RichTextBody renders a block div — a div cannot sit inside the
					// old <p> wrapper (invalid nesting), so this is a <div> now.
					<div className="mt-3 text-sm leading-[1.55]">
						Đề sẽ hiện ở đây khi bạn soạn.
					</div>
				) : (
					<RichTextBody
						text={props.prompt}
						className="mt-3 text-sm leading-[1.55]"
					/>
				))}
			<div className="mt-3 flex flex-wrap gap-2">
				<Tag>{skill.name}</Tag>
				<Tag>{part.label}</Tag>
				<Tag>{type.label}</Tag>
				<Tag>{`Band ${props.band}`}</Tag>
				{props.source.trim() && <Tag>{props.source.trim()}</Tag>}
				{isAuto && <Tag>Chấm tự động</Tag>}
				{!isEmptyRichText(props.note) && <Tag>Có hướng dẫn thêm</Tag>}
				<Tag>{props.status === "draft" ? "Bản nháp" : "Sẵn sàng giao"}</Tag>
			</div>
			{!isEmptyRichText(props.prompt) && skillId === "writing" && (
				<p className="mt-2 font-mono text-[11px] text-meta">
					{wordCount(htmlToPlainText(props.prompt))} từ
				</p>
			)}
		</div>
	);
}
