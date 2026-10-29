import { formatInterval } from "@teacher-os/api/srs/format";
import type { LearnSummary } from "@teacher-os/api/srs/learn-session";
import type { ReviewSummary } from "@teacher-os/api/srs/review-session";
import { Button } from "@teacher-os/ui/components/button";

export function VocabSummary({
	mode,
	learnSummary,
	reviewSummary,
	onBack,
}: {
	mode: "learn" | "review";
	learnSummary?: LearnSummary;
	reviewSummary?: ReviewSummary;
	onBack: () => void;
}) {
	if (mode === "learn" && learnSummary) {
		return (
			<div
				data-testid="vocab-summary-learn"
				className="space-y-6 rounded-md rounded-xl border bg-card p-6 shadow-sm"
			>
				<div>
					<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
						Hoàn thành vòng học từ mới
					</p>
					<h2 className="mt-2 font-extrabold text-2xl text-foreground tracking-[-0.03em]">
						Đã thuộc {learnSummary.learnedCount} từ mới
					</h2>
					<p className="mt-1 font-mono text-muted-foreground text-xs">
						Đợt ôn tiếp theo sau {formatInterval(1440)}
					</p>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div className="rounded-md rounded-md bg-muted p-4">
						<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
							Số từ đã học
						</p>
						<p
							data-testid="vocab-summary-learned-count"
							className="mt-1 font-extrabold text-2xl text-foreground"
						>
							{learnSummary.learnedCount}
						</p>
					</div>
					<div className="rounded-md rounded-md bg-muted p-4">
						<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
							Tỷ lệ nhớ lần đầu
						</p>
						<p
							data-testid="vocab-summary-recall-rate"
							className="mt-1 font-extrabold text-2xl text-primary"
						>
							{learnSummary.recallRate !== null
								? `${learnSummary.recallRate}%`
								: "—"}
						</p>
					</div>
				</div>

				{learnSummary.learnedWords.length > 0 ? (
					<div className="space-y-2">
						<p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.15em]">
							Danh sách từ vừa học
						</p>
						<div className="divide-y divide-line rounded-md border border-border">
							{learnSummary.learnedWords.map((item) => (
								<div
									key={item.cardId}
									data-testid="vocab-summary-word-row"
									className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
								>
									<div>
										<span className="font-semibold text-foreground">
											{item.word}
										</span>
										<span className="ml-2 text-muted-foreground">
											{item.translation}
										</span>
									</div>
									{item.grade === "again" ? (
										<span
											data-testid="vocab-missed-first-try"
											className="rounded-full rounded-md bg-muted px-2.5 py-0.5 font-mono text-[10px] text-primary uppercase tracking-wider"
										>
											Missed first try
										</span>
									) : null}
								</div>
							))}
						</div>
					</div>
				) : null}

				<div className="flex justify-end">
					<Button
						type="button"
						data-testid="vocab-summary-back"
						onClick={onBack}
					>
						Quay lại bộ từ
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div
			data-testid="vocab-summary-review"
			className="space-y-6 rounded-md rounded-xl border bg-card p-6 shadow-sm"
		>
			<div>
				<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
					Hoàn thành phiên ôn tập
				</p>
				<h2 className="mt-2 font-extrabold text-2xl text-foreground tracking-[-0.03em]">
					Đã ôn {reviewSummary?.reviewed ?? 0} từ vựng
				</h2>
			</div>

			<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
				<div className="rounded-md rounded-md bg-muted p-4">
					<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						Đã ôn
					</p>
					<p
						data-testid="vocab-summary-reviewed-count"
						className="mt-1 font-extrabold text-2xl text-foreground"
					>
						{reviewSummary?.reviewed ?? 0}
					</p>
				</div>
				<div className="rounded-md rounded-md bg-muted p-4">
					<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						Tỷ lệ nhớ (Recall)
					</p>
					<p
						data-testid="vocab-summary-recall-rate"
						className="mt-1 font-extrabold text-2xl text-primary"
					>
						{reviewSummary?.recallRate !== null &&
						reviewSummary?.recallRate !== undefined
							? `${reviewSummary.recallRate}%`
							: "—"}
					</p>
				</div>
				<div className="rounded-md rounded-md bg-muted p-4">
					<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						Tăng bậc
					</p>
					<p
						data-testid="vocab-summary-level-ups"
						className="mt-1 font-extrabold text-2xl text-foreground"
					>
						+{reviewSummary?.levelUps ?? 0}
					</p>
				</div>
				<div className="rounded-md rounded-md bg-muted p-4">
					<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						Giảm bậc
					</p>
					<p
						data-testid="vocab-summary-level-downs"
						className="mt-1 font-extrabold text-2xl text-foreground"
					>
						-{reviewSummary?.levelDowns ?? 0}
					</p>
				</div>
			</div>

			<div className="flex justify-end">
				<Button type="button" data-testid="vocab-summary-back" onClick={onBack}>
					Quay lại bộ từ
				</Button>
			</div>
		</div>
	);
}
