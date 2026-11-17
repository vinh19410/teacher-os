import { Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardCheck } from "lucide-react";

/**
 * Banner nổi bật trên Dashboard `/` khi học viên chưa làm bài kiểm tra đầu vào (#748).
 * Vẫn hiển thị sau khi học viên bấm "Để sau" ở modal nhắc lần đầu.
 */
export function PlacementHighlightBanner() {
	return (
		<section
			aria-label="Kiểm tra đầu vào 5 kỹ năng"
			data-testid="placement-highlight-banner"
			className="mb-8 rounded-xl border border-primary/25 bg-card p-5 shadow-sm"
		>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-start gap-3.5">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						<ClipboardCheck aria-hidden="true" className="size-5" />
					</div>
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-0.5 font-medium text-warn text-xs">
								<span
									aria-hidden="true"
									className="size-1.5 rounded-full bg-warn"
								/>
								Chưa làm · Miễn phí
							</span>
							<span className="text-muted-foreground text-xs">
								Chuẩn CEFR · ~40 phút
							</span>
						</div>
						<h2 className="mt-1.5 font-semibold text-base text-foreground tracking-tight">
							Kiểm tra đầu vào 5 kỹ năng
						</h2>
						<p className="mt-1 text-muted-foreground text-sm leading-relaxed">
							Hoàn thành bài đánh giá Listening, Grammar &amp; Vocabulary,
							Reading, Writing và Speaking để giáo viên xếp lớp và thiết kế lộ
							trình học phù hợp với trình độ thực tế của bạn.
						</p>
					</div>
				</div>

				<Link
					to="/placement-test"
					data-testid="placement-banner-cta"
					className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm shadow-xs transition-colors hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					<span>Làm bài test đầu vào</span>
					<ArrowRight aria-hidden="true" className="size-4" />
				</Link>
			</div>
		</section>
	);
}
