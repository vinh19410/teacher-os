import type { ReactNode } from "react";

/**
 * Thẻ điểm trang kết quả (Selfomy parity): "Điểm" = số câu đúng ở dạng lớn
 * (RAW count, không percent — quyết định validation plan), hàng đếm Câu đúng
 * / Câu sai / Câu bỏ qua, CTA tùy ngữ cảnh qua `action` (route student compose
 * Link sang màn soi chi tiết; simulation web compose nút "Làm lại").
 */
export function AttemptScoreCard({
	correctCount,
	wrongCount,
	skippedCount,
	totalCount,
	action,
}: {
	correctCount: number;
	wrongCount: number;
	skippedCount: number;
	totalCount: number;
	action?: ReactNode;
}) {
	return (
		<section aria-label="Kết quả bài làm" className="neu rounded-lg p-6">
			<p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
				Điểm
			</p>
			<p
				data-testid="attempt-correct-count"
				className="mt-2 font-extrabold text-6xl text-foreground leading-none tracking-[-0.03em]"
			>
				{correctCount}
			</p>
			<p className="mt-2 text-muted-foreground text-sm">
				trên tổng {totalCount} câu
			</p>

			<dl className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
				<div className="flex items-baseline gap-1.5">
					<dt className="text-muted-foreground">Câu đúng</dt>
					<dd
						data-testid="attempt-correct"
						className="font-medium font-mono text-success"
					>
						{correctCount}
					</dd>
				</div>
				<div className="flex items-baseline gap-1.5">
					<dt className="text-muted-foreground">Câu sai</dt>
					<dd
						data-testid="attempt-wrong"
						className="font-medium font-mono text-destructive"
					>
						{wrongCount}
					</dd>
				</div>
				<div className="flex items-baseline gap-1.5">
					<dt className="text-muted-foreground">Câu bỏ qua</dt>
					<dd
						data-testid="attempt-skipped"
						className="font-medium font-mono text-muted-foreground"
					>
						{skippedCount}
					</dd>
				</div>
			</dl>

			{action}
		</section>
	);
}
