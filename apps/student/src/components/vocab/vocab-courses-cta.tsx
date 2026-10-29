import { Link } from "@tanstack/react-router";

/**
 * Card CTA thuần dẫn từ `/practice/vocabulary` dashboard sang catalog `/practice/vocabulary/courses`.
 */
export function VocabCoursesCta() {
	return (
		<section className="space-y-3">
			<Link
				to="/practice/vocabulary/courses"
				data-testid="vocab-courses-cta"
				className="group flex flex-wrap items-center justify-between gap-4 rounded-md rounded-xl border bg-card p-5 shadow-sm transition-colors duration-150 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
			>
				<div className="space-y-1.5">
					<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
						Thư viện từ vựng · 20 khóa · 968 bài
					</p>
					<h2 className="font-extrabold text-foreground text-xl tracking-[-0.02em] group-hover:text-primary">
						Khóa học từ vựng
					</h2>
					<p className="text-muted-foreground text-sm">
						Tự chọn lộ trình từ vựng IELTS, TOEIC và giao tiếp theo chủ đề với
						hình ảnh minh họa và phát âm chuẩn.
					</p>
				</div>
				<span className="shrink-0 rounded-md rounded-md border border-input bg-transparent px-3.5 py-2 font-mono text-foreground text-xs transition-colors group-hover:border-primary group-hover:text-primary">
					Khám phá khóa học →
				</span>
			</Link>
		</section>
	);
}
