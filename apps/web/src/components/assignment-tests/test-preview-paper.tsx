import {
	bankLabel,
	isBankableType,
	kindOf,
} from "@/components/assignments/assignment-presets";
import { ClozeStemText } from "@/components/assignments/cloze-stem";
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
			part.intro.trim() ||
			part.passage.trim() ||
			part.prompt.trim() ||
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
		<div className="rounded-lg border border-line bg-surface-warm p-6">
			<p className="font-mono text-[11px] text-muted-fg uppercase tracking-[0.08em]">
				Xem trước phía học viên — full test
			</p>
			<h1 className="mt-1 font-display font-semibold text-[22px]">
				{draft.test.title.trim() || "Bộ đề chưa đặt tên"}
			</h1>
			<div className="mt-1.5 flex flex-wrap gap-x-3 font-mono text-meta text-xs">
				{minutes != null && <span>Time: {minutes} minutes</span>}
				{meta && <span>{meta}</span>}
				{total > 0 && (
					<span>
						Questions {firstNo}–{lastNo}
					</span>
				)}
			</div>

			{contentParts.length === 0 && (
				<p className="mt-4 text-muted-fg text-sm">
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
						className="mt-6 border-line border-t pt-5"
					>
						<h2 className="font-display font-semibold text-[15px] tracking-wide">
							{partHeading(skill, part.label)}
						</h2>
						{part.title.trim() && (
							<p className="mt-1 font-medium text-muted-fg text-sm">
								{part.title.trim()}
							</p>
						)}
						{part.passage.trim() && (
							<div className="mt-3 whitespace-pre-line text-sm leading-[1.55]">
								{part.passage.trim()}
							</div>
						)}
						{part.audioName.trim() && (
							<p className="mt-3 rounded-md border border-line bg-surface p-3 text-sm">
								🔊 {part.audioName.trim()}
							</p>
						)}
						{part.prompt.trim() && (
							<div className="mt-3 whitespace-pre-line text-sm leading-[1.55]">
								{part.prompt.trim()}
							</div>
						)}
						{part.items.length > 0 && (
							<div className="mt-4 flex flex-col gap-2">
								<p className="font-medium text-sm">
									Questions {qStart}
									{count > 0 ? `–${qStart + count - 1}` : ""}
								</p>
								{part.intro.trim() && (
									<p className="whitespace-pre-line text-muted-fg text-sm">
										{part.intro.trim()}
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
											<div key={optionIndex} className="ml-5 text-muted-fg">
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
