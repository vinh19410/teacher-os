import type { EssayAnnotation } from "@teacher-os/api/contracts";
import { segmentEssay } from "@teacher-os/api/lib/essay-annotations";
import { cn } from "@teacher-os/ui/lib/utils";
import { Fragment, type HTMLAttributes, type Ref } from "react";

/**
 * Essay plain text với highlight đánh số, dùng chung web (giáo viên) và
 * student (#332, #336). Khi `inlineNotes` tắt (mặc định), mỗi phần tử render
 * đúng MỘT text node, không có phần tử con — phép ánh xạ vùng chọn DOM →
 * offset (`data-start` + caret offset) dựa trên điều này. Số thứ tự vẽ bằng
 * pseudo-element `::after` với `content: attr(data-n)`, không nằm trong DOM
 * text nên không chọn được và không làm lệch offset. Plain text qua JSX text
 * node — không dangerouslySetInnerHTML, không có bề mặt XSS.
 *
 * `inlineNotes` chèn span ghi chú ngay sau mark — chỉ bật ở màn chỉ đọc
 * (student); KHÔNG bật ở essay bôi đen được (trang chấm giáo viên): selection
 * vắt qua span ghi chú khiến `offsetOf` trả null → popover im lặng.
 */
export function EssayWithHighlights({
	essay,
	annotations,
	activeId = null,
	markProps,
	inlineNotes = false,
	className,
	"data-testid": testId,
	tabIndex,
	ref,
}: {
	essay: string;
	annotations: ReadonlyArray<EssayAnnotation>;
	/** Annotation đang chọn — thêm viền mực đen theo quy tắc "selection =
	 * đen đặc" của DESIGN.md. */
	activeId?: string | null;
	/** Web truyền vào để highlight focus/bấm được; student bỏ trống. */
	markProps?(
		annotation: EssayAnnotation,
		n: number,
	): HTMLAttributes<HTMLElement>;
	/** Student (#336): hiện ghi chú ngay sau mỗi mark có ghi chú. KHÔNG bật ở
	 * essay bôi đen được (trang chấm giáo viên) — span ghi chú chen giữa các
	 * text node làm selection vắt qua nó trả null → popover im lặng. */
	inlineNotes?: boolean;
	className?: string;
	"data-testid"?: string;
	/** Web bật khi popover mở (container nhận focus khi popover đóng). */
	tabIndex?: number;
	ref?: Ref<HTMLDivElement>;
}) {
	const segments = segmentEssay(essay, annotations);
	return (
		<div
			ref={ref}
			data-testid={testId}
			className={cn("whitespace-pre-wrap", className)}
			tabIndex={tabIndex}
		>
			{segments.map((seg) =>
				seg.annotation && seg.n !== null ? (
					(() => {
						const extra = markProps?.(seg.annotation, seg.n);
						return (
							<Fragment key={seg.annotation.id}>
								<mark
									data-start={seg.start}
									data-n={seg.n}
									data-annotation-id={seg.annotation.id}
									{...extra}
									className={cn(
										// mark.anno (globals.css): nền cam nhạt + gạch chân cam —
										// lỗi bài viết theo design `Results`.
										"anno rounded-sm px-0.5 text-fg",
										"after:ml-0.5 after:align-super after:font-mono after:text-[10px] after:text-meta after:content-[attr(data-n)]",
										activeId === seg.annotation.id && "ring-1 ring-fg",
										extra?.className,
									)}
								>
									{seg.text}
								</mark>
								{inlineNotes && seg.annotation.note.trim() !== "" && (
									<span
										data-testid="essay-inline-note"
										data-annotation-id={seg.annotation.id}
										className="mx-1 break-words rounded-md bg-hot box-decoration-clone px-1.5 py-0.5 align-middle text-accent-on text-xs"
									>
										<span className="sr-only">Ghi chú {seg.n}: </span>
										{seg.annotation.note}
									</span>
								)}
							</Fragment>
						);
					})()
				) : (
					<span key={`seg-${seg.start}`} data-start={seg.start}>
						{seg.text}
					</span>
				),
			)}
		</div>
	);
}
