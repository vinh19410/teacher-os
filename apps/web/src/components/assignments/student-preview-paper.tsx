import { ASSIGNMENT_IMAGE_SRC_PATTERN } from "@teacher-os/api/contracts";
import { Tag } from "@/components/ui/tag";
import {
	bankLabel,
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
	const bankable = isBankableType(skillId, typeId);
	const bank = props.optionBank ?? [];
	const bankKind = kindOf(typeId);
	// The preview draft never passes the server contract — this renderer is
	// the only guard, so verify the scheme here before any <img> exists.
	const rawImageUrl = props.imageUrl?.trim() ?? "";
	const diagramImageUrl =
		skillId === "reading" &&
		typeId === "diagram" &&
		rawImageUrl &&
		ASSIGNMENT_IMAGE_SRC_PATTERN.test(rawImageUrl)
			? rawImageUrl
			: "";
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
			{skillId === "reading" && (
				<p className="mt-3 whitespace-pre-line text-sm leading-[1.55]">
					{props.passage?.trim() || "Đoạn đọc sẽ hiện ở đây."}
				</p>
			)}
			{diagramImageUrl && (
				<img
					src={diagramImageUrl}
					alt="Ảnh biểu đồ đề Reading"
					className="mt-3 max-h-72 rounded-md border border-line"
					referrerPolicy="no-referrer"
					loading="lazy"
				/>
			)}
			{isAuto && (
				<div className="mt-3 flex flex-col gap-2">
					{props.intro?.trim() && (
						<p className="whitespace-pre-line text-muted-fg text-sm">
							{props.intro.trim()}
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
										<li key={index} className="text-sm">
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
					{(props.items ?? []).map((item, index) => (
						<div key={index} className="text-sm">
							<strong>{(part.qStart ?? 1) + index}.</strong>{" "}
							{item.stem || "Câu hỏi sẽ hiện ở đây."}
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
			{!isAuto && !(skillId === "speaking" && partId === "part2") && (
				<p className="mt-3 whitespace-pre-line text-sm leading-[1.55]">
					{props.prompt.trim() || "Đề sẽ hiện ở đây khi bạn soạn."}
				</p>
			)}
			<div className="mt-3 flex flex-wrap gap-2">
				<Tag>{skill.name}</Tag>
				<Tag>{part.label}</Tag>
				<Tag>{type.label}</Tag>
				<Tag>{`Band ${props.band}`}</Tag>
				{props.source.trim() && <Tag>{props.source.trim()}</Tag>}
				{isAuto && <Tag>Chấm tự động</Tag>}
				{props.note.trim() && <Tag>Có hướng dẫn thêm</Tag>}
				<Tag>{props.status === "draft" ? "Bản nháp" : "Sẵn sàng giao"}</Tag>
			</div>
			{props.prompt.trim() && skillId === "writing" && (
				<p className="mt-2 font-mono text-[11px] text-meta">
					{wordCount(props.prompt)} từ
				</p>
			)}
		</div>
	);
}
