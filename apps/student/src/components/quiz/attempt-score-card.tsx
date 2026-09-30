import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { cn } from "@/lib/cn";

/**
 * Thẻ điểm trang kết quả (Selfomy parity): "Điểm" = số câu đúng ở dạng lớn
 * (RAW count, không percent — quyết định validation plan), hàng đếm Câu đúng
 * / Câu sai / Câu bỏ qua, CTA sang màn soi chi tiết.
 */
export function AttemptScoreCard({
	correctCount,
	wrongCount,
	skippedCount,
	totalCount,
	attemptId,
}: {
	correctCount: number;
	wrongCount: number;
	skippedCount: number;
	totalCount: number;
	attemptId: string;
}) {
	return (
		<section
			aria-label="Kết quả bài làm"
			className="rounded-[var(--radius-lg)] border border-line bg-bg p-6"
		>
			<p className="font-mono text-[11px] text-muted-fg uppercase tracking-[0.08em]">
				Điểm
			</p>
			<p
				data-testid="attempt-correct-count"
				className="mt-1 font-display font-semibold text-fg text-5xl leading-none"
			>
				{correctCount}
			</p>
			<p className="mt-1.5 text-muted-fg text-sm">trên tổng {totalCount} câu</p>

			<dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
				<div className="flex items-baseline gap-1.5">
					<dt className="text-muted-fg">Câu đúng</dt>
					<dd data-testid="attempt-correct" className="font-[590] text-success">
						{correctCount}
					</dd>
				</div>
				<div className="flex items-baseline gap-1.5">
					<dt className="text-muted-fg">Câu sai</dt>
					<dd data-testid="attempt-wrong" className="font-[590] text-danger">
						{wrongCount}
					</dd>
				</div>
				<div className="flex items-baseline gap-1.5">
					<dt className="text-muted-fg">Câu bỏ qua</dt>
					<dd
						data-testid="attempt-skipped"
						className="font-[590] text-muted-fg"
					>
						{skippedCount}
					</dd>
				</div>
			</dl>

			<Link
				to="/learn/quizzes/attempt/$attemptId/detail"
				params={{ attemptId }}
				className={cn(buttonVariants(), "mt-5")}
			>
				Xem giải thích chi tiết
			</Link>
		</section>
	);
}
