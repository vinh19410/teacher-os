import type { EssayAnnotation } from "@teacher-os/api/contracts";
import {
	excerpt,
	orderedAnnotations,
} from "@teacher-os/api/lib/essay-annotations";

/**
 * Danh sách "Ghi chú của giáo viên" dưới essay ở màn kết quả học viên
 * (#332). Số thứ tự theo `orderedAnnotations` nên luôn khớp highlight trên
 * essay. Server chỉ gửi `annotations` khi bài đã chấm — component này không
 * tự kiểm "đã chấm", chỉ ẩn khi danh sách rỗng.
 */
export function EssayAnnotationList({
	essay,
	annotations,
}: {
	essay: string;
	annotations: EssayAnnotation[];
}) {
	const ordered = orderedAnnotations(essay, annotations);
	if (ordered.length === 0) return null;
	return (
		<div className="mt-4">
			<h3 className="font-medium text-fg text-sm">Ghi chú của giáo viên</h3>
			<ol
				data-testid="essay-annotation-list"
				className="mt-2 flex flex-col gap-2"
			>
				{ordered.map(({ annotation, n }) => (
					<li
						key={annotation.id}
						className="rounded-xl border border-line bg-bg p-3"
					>
						<div className="flex items-start gap-2">
							<span className="font-mono text-meta text-xs">{n}</span>
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<p className="text-muted-fg text-sm">
									“{excerpt(essay.slice(annotation.start, annotation.end), 80)}”
								</p>
								{annotation.note !== "" && (
									<p className="whitespace-pre-wrap text-fg text-sm">
										{annotation.note}
									</p>
								)}
							</div>
						</div>
					</li>
				))}
			</ol>
		</div>
	);
}
