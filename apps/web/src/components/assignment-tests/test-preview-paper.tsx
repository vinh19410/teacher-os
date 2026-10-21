import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { ClozeStemText } from "@teacher-os/ui/components/assignments/cloze-stem";
import { OptionBankList } from "@teacher-os/ui/components/assignments/option-bank-list";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import {
	isBankableType,
	kindOf,
} from "@/components/assignments/assignment-presets";
import type {
	TestPreviewDraft,
	TestPreviewPartDraft,
} from "@/lib/assignment-test-preview-draft";
import { computeTestRanges } from "@/lib/test-ranges";

/**
 * Full-test preview paper (phase-04 Task 4.2): render trọn bộ đề như học viên
 * nhận — 3 passage + questions đánh số liên tục. Render mirror
 * `student-preview-paper.tsx` (bank list, ClozeStemText, opts chữ) — không
 * renderer câu riêng cho full test.
 *
 * Số câu CHỈ đến từ `computeTestRanges` (nguồn số duy nhất) — không bao giờ
 * `index + 1` từng part. `answer` chỉ lọt vào ClozeStemText để tính宽 input
 * (không render); `alts` không chạm vào đâu.
 */

function partHasContent(part: TestPreviewPartDraft): boolean {
	return Boolean(
		part.title.trim() ||
			!isEmptyRichText(part.intro) ||
			!isEmptyRichText(part.passage) ||
			!isEmptyRichText(part.prompt) ||
			part.optionBank.length > 0 ||
			part.items.length > 0,
	);
}

function partHeading(skill: string, label: string): string {
	// Label từ preset slot ("Passage 1"/"Section 1") — reading thêm prefix
	// skill như đề thật ("READING PASSAGE 1").
	return skill === "reading"
		? `READING ${label.toUpperCase()}`
		: label.toUpperCase();
}

export function TestPreviewPaper({ draft }: { draft: TestPreviewDraft }) {
	const skill = draft.test.skill;
	// Nguồn số duy nhất — fold đủ mọi slot (kể cả trống) giữ mốc đúng.
	const ranges = computeTestRanges({
		parts: draft.parts.map((part) => ({
			part: part.part,
			qStartOverride: part.qStartOverride,
			promptQuestions: part.items,
		})),
	});
	const rangeByPart = new Map(ranges.map((range) => [range.part, range]));
	const total = ranges.reduce((sum, range) => sum + range.count, 0);
	const firstNo = ranges[0]?.qStart ?? 1;
	const lastNo =
		ranges.length > 0
			? ranges[ranges.length - 1].qStart + ranges[ranges.length - 1].count - 1
			: 0;
	const minutes =
		draft.test.timeLimitSeconds != null
			? Math.round(draft.test.timeLimitSeconds / 60)
			: null;
	const meta = [draft.test.collection, draft.test.testGroup]
		.map((value) => value.trim())
		.filter(Boolean)
		.join(" · ");
	const contentParts = draft.parts.filter(partHasContent);

	return (
		<div className="rounded-lg rounded-xl border bg-card p-6 shadow-sm">
			<p className="text-muted-foreground text-xs">
				Xem trước phía học viên — full test
			</p>
			<h1 className="mt-1 font-semibold text-[22px]">
				{draft.test.title.trim() || "Bộ đề chưa đặt tên"}
			</h1>
			<div className="mt-1.5 flex flex-wrap gap-x-3 text-muted-foreground text-xs">
				{minutes != null && <span>Time: {minutes} minutes</span>}
				{meta && <span>{meta}</span>}
				{total > 0 && (
					<span>
						Questions {firstNo}–{lastNo}
					</span>
				)}
			</div>

			{contentParts.length === 0 && (
				<p className="mt-4 text-muted-foreground text-sm">
					Chưa có part nào — hãy gán prompt vào slot rồi xem trước lại.
				</p>
			)}

			{contentParts.map((part) => {
				const range = rangeByPart.get(part.part);
				const qStart = range?.qStart ?? 1;
				const count = range?.count ?? part.items.length;
				const bankable = isBankableType(skill, part.type);
				const bank = part.optionBank;
				const bankKind = kindOf(part.type);
				return (
					<section
						key={part.part}
						aria-label={part.label}
						className="mt-6 border-border border-t pt-5"
					>
						<h2 className="font-semibold text-[15px] tracking-wide">
							{partHeading(skill, part.label)}
						</h2>
						{part.title.trim() && (
							<p className="mt-1 font-medium text-muted-foreground text-sm">
								{part.title.trim()}
							</p>
						)}
						{!isEmptyRichText(part.passage) && (
							<RichTextBody
								text={part.passage}
								className="mt-3 text-sm leading-[1.55]"
							/>
						)}
						{part.audioName.trim() && (
							<p className="mt-3 rounded-md rounded-md bg-muted p-3 text-sm">
								🔊 {part.audioName.trim()}
							</p>
						)}
						{!isEmptyRichText(part.prompt) && (
							<RichTextBody
								text={part.prompt}
								className="mt-3 text-sm leading-[1.55]"
							/>
						)}
						{part.items.length > 0 && (
							<div className="mt-4 flex flex-col gap-2">
								<p className="font-medium text-sm">
									Questions {qStart}
									{count > 0 ? `–${qStart + count - 1}` : ""}
								</p>
								{!isEmptyRichText(part.intro) && (
									<RichTextBody
										text={part.intro}
										className="text-muted-foreground text-sm"
									/>
								)}
								{bankable && <OptionBankList bank={bank} kind={bankKind} />}
								{part.items.map((item, index) => (
									<div key={index} className="text-sm">
										<strong>{qStart + index}.</strong>{" "}
										{item.stem.trim() ? (
											<ClozeStemText
												stem={item.stem}
												answer={item.answer}
												typeId={part.type}
												number={qStart + index}
											/>
										) : (
											"Câu hỏi sẽ hiện ở đây."
										)}
										{item.opts?.map((option, optionIndex) => (
											<div
												key={optionIndex}
												className="ml-5 text-muted-foreground"
											>
												{String.fromCharCode(65 + optionIndex)} {option}
											</div>
										))}
									</div>
								))}
							</div>
						)}
					</section>
				);
			})}
		</div>
	);
}
