import type { EssayAnnotation } from "@teacher-os/api/contracts";
import { segmentEssay } from "@teacher-os/api/lib/essay-annotations";
import { cn } from "@teacher-os/ui/lib/utils";
import type { HTMLAttributes, Ref } from "react";

/**
 * Essay plain text với highlight đánh số, dùng chung web (giáo viên) và
 * student (#332). Mỗi phần tử render đúng MỘT text node, không có phần tử
 * con — phép ánh xạ vùng chọn DOM → offset (`data-start` + caret offset)
 * dựa trên điều này. Số thứ tự vẽ bằng pseudo-element `::after` với
 * `content: attr(data-n)`, không nằm trong DOM text nên không chọn được và
 * không làm lệch offset. Plain text qua JSX text node — không
 * dangerouslySetInnerHTML, không có bề mặt XSS.
 */
export function EssayWithHighlights({
	essay,
	annotations,
	activeId = null,
	markProps,
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
							<mark
								key={seg.annotation.id}
								data-start={seg.start}
								data-n={seg.n}
								data-annotation-id={seg.annotation.id}
								{...extra}
								className={cn(
									"rounded-sm bg-warn-soft px-0.5 text-fg",
									"after:ml-0.5 after:align-super after:font-mono after:text-[10px] after:text-meta after:content-[attr(data-n)]",
									activeId === seg.annotation.id && "ring-1 ring-fg",
									extra?.className,
								)}
							>
								{seg.text}
							</mark>
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
